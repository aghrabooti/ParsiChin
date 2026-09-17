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
  const sent = [];
  const requested = [];
  return {
    window: null,
    store,
    listeners,
    sent,
    requested,
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
        sendMessage: async (msg) => {
          sent.push(msg);
          return { ok: true, host: msg && msg.host };
        },
        getManifest: () => ({ version: "0.2.0" }),
        openOptionsPage: () => {}
      },
      tabs: {
        query: async () => [{ id: 7, url: "https://chatgpt.com/c/1" }],
        sendMessage: async () => ({ blocks: 12, persian: 9, mixed: 3, pinnedLtr: 1, root: "main.ds-chat" })
      },
      permissions: {
        contains: async () => true,
        request: async ({ origins }) => {
          requested.push(origins);
          // Chrome accepts a single-origin pattern as a subset of the declared
          // optional patterns, and rejects anything undeclared.
          return origins.every((o) => /^\*:\/\/|^https?:\/\//.test(o) && o !== "<all_urls>");
        }
      },
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


  /* ---------- popup: one-click enable on any site ---------- */
  const anySiteChrome = makeChrome();
  // all sites OFF: an unknown host must offer the one-click enable box
  anySiteChrome.store.parsiChinSettings = { enabled: true, allSites: false };
  anySiteChrome.chrome.tabs.query = async () => [{ id: 42, url: "https://example.org/notes" }];
  anySiteChrome.chrome.tabs.sendMessage = async () => { throw new Error("Receiving end does not exist"); };
  const anySiteWindow = load(
    read("src/popup/popup.html"),
    "src/popup/popup.js",
    ["src/shared/defaults.js", "src/shared/settings.js", "src/content/rules.js", "src/shared/i18n.js"],
    anySiteChrome
  );
  await new Promise((r) => setTimeout(r, 80));
  const box = anySiteWindow.document.getElementById("enableBox");
  assert.strictEqual(box.hidden, false, "an unknown site offers the one-click enable box");

  anySiteWindow.document.getElementById("enableSite").click();
  await new Promise((r) => setTimeout(r, 60));
  assert.strictEqual(JSON.stringify(Array.from(anySiteChrome.requested[0])), JSON.stringify(["*://example.org/*"]),
    "per-site enable asks for that one origin, not for everything");
  const enableMsg = anySiteChrome.sent.find((m) => m.type === "parsi-chin:enable-site");
  assert.ok(enableMsg && enableMsg.host === "example.org" && enableMsg.tabId === 42,
    "the background is asked to enable that host in that tab (no reload needed)");
  assert.strictEqual(anySiteChrome.store.parsiChinSettings.allSites, false,
    "per-site enable does not silently switch on all sites");

  anySiteWindow.document.getElementById("enableAll").click();
  await new Promise((r) => setTimeout(r, 60));
  assert.strictEqual(JSON.stringify(Array.from(anySiteChrome.requested[1])), JSON.stringify(["*://*/*"]),
    "the all-sites button asks for the declared optional pattern");
  assert.ok(anySiteChrome.sent.some((m) => m.type === "parsi-chin:enable-all"),
    "the background is asked to switch on all sites");

  /* a supported site must not show the box at all */
  assert.strictEqual(popupChrome.window.document.getElementById("enableBox").hidden, true,
    "a built-in site keeps the box hidden");

  /* ---------- popup: default mode covers every site, no click needed ---------- */
  const defaultChrome = makeChrome();          // no stored settings => defaults
  assert.strictEqual(defaultChrome.store.parsiChinSettings.allSites, undefined,
    "nothing stored yet in this stub");
  defaultChrome.chrome.tabs.query = async () => [{ id: 43, url: "https://forum.example.org/t/1" }];
  defaultChrome.chrome.tabs.sendMessage = async () => ({ blocks: 4, persian: 3, mixed: 1, pinnedLtr: 0, root: "body" });
  const defaultWindow = load(
    read("src/popup/popup.html"),
    "src/popup/popup.js",
    ["src/shared/defaults.js", "src/shared/settings.js", "src/content/rules.js", "src/shared/i18n.js"],
    defaultChrome
  );
  await new Promise((r) => setTimeout(r, 80));
  assert.strictEqual(defaultWindow.document.getElementById("enableBox").hidden, true,
    "with the default settings no click is needed on an unknown host");
  assert.match(defaultWindow.document.getElementById("siteDetail").textContent, /همه‌ی سایت‌ها/,
    "the popup says that all sites are covered");

  /* ---------- popup: a host the user switched off can be switched back on ---------- */
  const offChrome = makeChrome();
  offChrome.store.parsiChinSettings = { enabled: true, allSites: true, siteOverrides: { "example.org": false } };
  offChrome.chrome.tabs.query = async () => [{ id: 44, url: "https://example.org/notes" }];
  const offWindow = load(
    read("src/popup/popup.html"),
    "src/popup/popup.js",
    ["src/shared/defaults.js", "src/shared/settings.js", "src/content/rules.js", "src/shared/i18n.js"],
    offChrome
  );
  await new Promise((r) => setTimeout(r, 80));
  assert.strictEqual(offWindow.document.getElementById("offBox").hidden, false,
    "a host switched off in the options page offers to be switched back on");
  offWindow.document.getElementById("turnOnSite").click();
  await new Promise((r) => setTimeout(r, 60));
  assert.ok(offChrome.sent.some((m) => m.type === "parsi-chin:toggle-site" && m.host === "example.org" && m.enabled === true),
    "the background is asked to switch that host back on");

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
  const missing = [];
  for (const b of pages.BUNDLES) {
    assert.ok(downloads.indexOf(b.file) !== -1, "download page lists " + b.file);
    const info = ctx.files.find((f) => f.file === b.file);
    if (!info || !info.exists) {
      // Generated bundles (zips, patch) are not committed; a fresh clone has to
      // run the build first, so their absence is a note, not a failure.
      missing.push(b.file);
      continue;
    }
    assert.match(info.sha, /^[0-9a-f]{12}$/, b.file + " has a sha256");
    assert.ok(info.size > 0, b.file + " is not empty");
  }
  if (missing.length) {
    console.log("  ! generated bundles not built yet (run: bash scripts/build.sh): " + missing.join(", "));
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
