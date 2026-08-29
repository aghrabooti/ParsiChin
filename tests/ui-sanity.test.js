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
      tabs: { query: async () => [{ url: "https://chatgpt.com/c/1" }] },
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
}

main().catch((err) => {
  console.error("✘ ui sanity test failed");
  console.error(err);
  process.exit(1);
});
