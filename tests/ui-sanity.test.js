/**
 * ParsiChin — UI sanity test.
 * Loads popup.html and options.html inside jsdom with the real scripts and a
 * stubbed chrome.* API. Fails on any uncaught error during init.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("assert");
const { JSDOM } = require("jsdom");

const ROOT = path.join(__dirname, "..");

function read(rel) { return fs.readFileSync(path.join(ROOT, rel), "utf8"); }

function makeChrome() {
  const store = { parsiChinSettings: {} };
  const listeners = [];
  return {
    window: null,
    store,
    listeners,
    chrome: {
      storage: {
        local: {
          get: async (key) => ({ [key]: store.parsiChinSettings }),
          set: async (obj) => { Object.assign(store, obj); }
        },
        onChanged: { addListener: (cb) => listeners.push(cb) }
      },
      runtime: {
        onMessage: { addListener: () => {} },
        sendMessage: async () => ({ ok: true }),
        getManifest: () => ({ version: "0.1.0" }),
        openOptionsPage: () => {}
      },
      tabs: {
        query: async () => [{ id: 7, url: "https://chatgpt.com/c/1" }],
        sendMessage: async () => ({ blocks: 12, persian: 9, mixed: 3, pinnedLtr: 1, root: "main.ds-chat" })
      },
      permissions: { contains: async () => true, request: async () => true },
      i18n: { getMessage: () => "" }
    }
  };
}

function load(pageHtml, pageJs, pageScripts, chromeApi) {
  const dom = new JSDOM(pageHtml, { runScripts: "outside-only", pretendToBeVisual: true, url: "https://extension/" });
  const { window } = dom;
  chromeApi.window = window;
  window.chrome = chromeApi.chrome;
  window.ParsiChinI18n = { apply: () => {} }; // simplified: skip real i18n here
  // real i18n.js is loaded by the page too; apply uses chrome.i18n (stubbed)
  const scripts = [...pageScripts.map((f) => f), pageJs];
  for (const file of scripts) window.eval(read(file));
  return window;
}

async function main() {
  /* ---------- popup ---------- */
  const popupChrome = makeChrome();
  load(
    read("src/popup/popup.html"),
    "src/popup/popup.js",
    ["src/shared/defaults.js", "src/shared/settings.js", "src/content/rules.js", "src/shared/i18n.js"],
    popupChrome
  );
  await new Promise((r) => setTimeout(r, 80));
  const popupEl = popupChrome.window.document.getElementById("enabled");
  assert.ok(popupEl, "popup rendered");
  assert.strictEqual(popupEl.checked, true, "popup shows enabled state");
  assert.strictEqual(popupChrome.window.document.getElementById("siteName").textContent, "ChatGPT",
    "popup detects ChatGPT tab");
  assert.match(popupChrome.window.document.getElementById("siteDetail").textContent, /12/,
    "popup shows how many blocks the content script decorated (live diagnostics)");

  /* a tab without a content script must not break the popup */
  const noScriptChrome = makeChrome();
  noScriptChrome.chrome.tabs.sendMessage = async () => { throw new Error("Receiving end does not exist"); };
  const noScriptWindow = load(
    read("src/popup/popup.html"),
    "src/popup/popup.js",
    ["src/shared/defaults.js", "src/shared/settings.js", "src/content/rules.js", "src/shared/i18n.js"],
    noScriptChrome
  );
  await new Promise((r) => setTimeout(r, 80));
  assert.strictEqual(noScriptWindow.document.getElementById("enabled").checked, true,
    "popup still renders when the tab has no content script");
  assert.ok(!/بلوک/.test(noScriptWindow.document.getElementById("siteDetail").textContent),
    "no block count is shown when the content script does not answer");

  /* ---------- options ---------- */
  const optChrome = makeChrome();
  load(
    read("src/options/options.html"),
    "src/options/options.js",
    ["src/shared/defaults.js", "src/shared/settings.js", "src/content/bidi.js", "src/content/rules.js", "src/shared/i18n.js"],
    optChrome
  );
  await new Promise((r) => setTimeout(r, 80));
  const opt = optChrome.window.document;
  assert.ok(opt.getElementById("preview"), "options rendered");
  assert.strictEqual(opt.querySelectorAll(".site-item").length,
    optChrome.window.ParsiChin.rules.all.reduce((n, r) => n + r.sites.length, 0),
    "site list generated from rules");

  // Change the font-size slider and make sure the preview updates without errors.
  const slider = opt.getElementById("opt-fontSize");
  slider.value = "115";
  slider.dispatchEvent(new optChrome.window.Event("input", { bubbles: true }));
  assert.strictEqual(opt.getElementById("opt-fontSize-value").textContent, "115%",
    "slider output updates");
  slider.dispatchEvent(new optChrome.window.Event("change", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 400));
  assert.strictEqual(optChrome.store.parsiChinSettings.fontSize, 115,
    "settings persisted after change");

  console.log("✔ ui sanity test passed — popup & options initialize correctly");
  await testServerPages();
}


/* ---------- the pages the live server serves ---------- */

async function testServerPages() {
  const pages = require(path.join(ROOT, "tools", "pages.js"));
  const ctx = pages.context();

  const landing = pages.landing(ctx);
  assert.match(landing, /<title>ParsiChin/, "landing page has a title");
  assert.ok(!/undefined|NaN/.test(landing), "landing page has no undefined/NaN placeholders");
  assert.match(landing, /href="\/demo\/"/, "landing page links to the lab");
  assert.match(landing, /href="\/download\/"/, "landing page links to the downloads");
  const fileBlocks = (landing.match(/class="file[ "]/g) || []).length;
  assert.strictEqual(fileBlocks, 6, "landing page lists all six bundles (got " + fileBlocks + ")");

  const downloads = pages.downloads(ctx);
  assert.ok(!/undefined|NaN/.test(downloads), "download page has no undefined/NaN placeholders");
  for (const b of pages.BUNDLES) {
    assert.ok(downloads.indexOf(b.file) !== -1, "download page lists " + b.file);
    const info = ctx.files.find((f) => f.file === b.file);
    assert.ok(info && info.exists, b.file + " exists on disk");
    assert.match(info.sha, /^[0-9a-f]{12}$/, b.file + " has a sha256");
  }

  const theme = pages.theme();
  assert.ok(theme.length > 2000, "the shared theme is served");
  assert.strictEqual((theme.match(/{/g) || []).length, (theme.match(/}/g) || []).length,
    "theme CSS has balanced braces");

  const lab = read("demo/index.html");
  assert.match(lab, /site-theme\.css/, "the lab uses the shared theme");
  ["engine", "ext", "mode", "hostile", "container", "site", "font", "rerun", "chat", "score",
   "results", "filter-all", "filter-fail",
   "dl-build-url", "dl-zip-url", "dl-patch-url", "dl-commits-url", "dl-commands-url"].forEach((id) => {
    assert.ok(lab.indexOf('id="' + id + '"') !== -1, "the lab kept the hook #" + id);
  });
  console.log("✔ server pages test passed — landing, downloads and lab markup are consistent");
}

main().catch((err) => {
  console.error("✘ ui sanity test failed");
  console.error(err);
  process.exit(1);
});
