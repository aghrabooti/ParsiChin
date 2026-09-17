/**
 * ParsiChin — optional-permission regression test.
 *
 * Reproduces the reported bug:
 *
 *   Uncaught (in promise) Error: Only permissions specified in the manifest
 *   may be requested.
 *   src/options/options.js (ensurePermission -> chrome.permissions.request)
 *
 * The options page asked for the literal pattern `<all_urls>` while
 * manifest.json declares the wildcard host pattern for
 * `optional_host_permissions`. Chrome rejects any pattern the manifest does
 * not declare, the resulting rejection was unhandled, and — because
 * chrome.permissions.contains() never became true — "all sites" / custom-site
 * injection silently did nothing.
 *
 * The chrome stub below is deliberately as strict as Chrome: it throws for any
 * origin that is not in the manifest's declared optional host permissions, and
 * it records the exact patterns the extension asks for.
 *
 * Run: node tests/permissions.test.js
 */
"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("assert");
const { JSDOM } = require("jsdom");

const ROOT = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const MANIFEST = JSON.parse(read("manifest.json"));

/* Chrome refuses patterns that are not declared in the manifest. */
const DECLARED_OPTIONAL = new Set(
  []
    .concat(MANIFEST.optional_host_permissions || [])
    .concat(MANIFEST.optional_permissions || [])
);

/* Allowed origins known to Chrome that `<all_urls>` expands to — declaring
   only the wildcard host pattern does NOT authorise them. */
const ALL_URLS_EXPANSION = [
  "http://*/*", "https://*/*", "file:///*", "ftp://*/*", "ws://*/*", "wss://*/*"
];

function makeChrome(opts) {
  opts = opts || {};
  const store = { parsiChinSettings: {} };
  const requested = [];
  const messages = [];
  let granted = !!opts.preGranted;

  function check(origins, api) {
    for (const origin of origins) {
      const ok = DECLARED_OPTIONAL.has(origin) ||
        (origin === "<all_urls>" && ALL_URLS_EXPANSION.every((o) => DECLARED_OPTIONAL.has(o)));
      if (!ok) {
        throw new Error("Only permissions specified in the manifest may be requested.");
      }
    }
    requested.push({ api, origins: origins.slice() });
  }

  return {
    store,
    requested,
    messages,
    chrome: {
      storage: {
        local: {
          get: async (key) => ({ [key]: store.parsiChinSettings }),
          set: async (obj) => { Object.assign(store, obj); }
        },
        onChanged: { addListener: () => {} }
      },
      runtime: {
        onMessage: { addListener: () => {} },
        sendMessage: async (msg) => { messages.push(msg); return { ok: true }; },
        getManifest: () => MANIFEST,
        openOptionsPage: () => {}
      },
      tabs: { query: async () => [{ url: "https://example.com/" }] },
      permissions: {
        contains: async ({ origins }) => {
          check(origins, "contains");
          return granted;
        },
        request: async ({ origins }) => {
          check(origins, "request");
          if (opts.deny) { granted = false; return false; }
          granted = true;
          return true;
        }
      },
      i18n: { getMessage: () => "" }
    }
  };
}

function loadOptionsPage(chromeApi) {
  const dom = new JSDOM(read("src/options/options.html"), {
    runScripts: "outside-only",
    pretendToBeVisual: true,
    url: "chrome-extension://parsichin/options.html"
  });
  const { window } = dom;
  window.chrome = chromeApi.chrome;
  for (const file of [
    "src/shared/defaults.js",
    "src/shared/settings.js",
    "src/content/bidi.js",
    "src/content/rules.js",
    "src/shared/i18n.js",
    "src/options/options.js"
  ]) window.eval(read(file));
  return window;
}

const tick = (ms) => new Promise((r) => setTimeout(r, ms || 60));

async function main() {
  /* Collect unhandled rejections: the reported bug was exactly that. */
  const unhandled = [];
  const onUnhandled = (reason) => unhandled.push(String((reason && reason.message) || reason));
  process.on("unhandledRejection", onUnhandled);

  /* ---------- 1. every requested pattern must be declared in the manifest ---------- */
  const api = makeChrome();
  const win = loadOptionsPage(api);
  await tick(80);

  const allSites = win.document.getElementById("opt-allSites");
  assert.ok(allSites, "options page rendered");

  allSites.checked = true;
  allSites.dispatchEvent(new win.Event("change", { bubbles: true }));
  await tick(400);

  assert.strictEqual(unhandled.length, 0,
    "toggling 'all sites' must not reject: " + JSON.stringify(unhandled));
  assert.ok(api.requested.some((r) => r.api === "request"),
    "the optional permission was actually requested");
  for (const call of api.requested) {
    for (const origin of call.origins) {
      assert.ok(DECLARED_OPTIONAL.has(origin) ||
        (origin === "<all_urls>" && ALL_URLS_EXPANSION.every((o) => DECLARED_OPTIONAL.has(o))),
        `permissions.${call.api}() asked for "${origin}", which manifest.json does not declare ` +
        `(optional_host_permissions: ${JSON.stringify(MANIFEST.optional_host_permissions)}). ` +
        "Chrome rejects that with 'Only permissions specified in the manifest may be requested'."
      );
    }
  }

  /* ---------- 2. granted: setting saved, hint stays hidden ---------- */
  await tick(300);
  assert.strictEqual(api.store.parsiChinSettings.allSites, true,
    "allSites is persisted after the permission was granted");
  assert.strictEqual(win.document.getElementById("allSitesHint").hidden, true,
    "no warning shown when the permission was granted");

  /* ---------- 3. denied: check box reverts, warning shown, nothing throws ---------- */
  const deniedApi = makeChrome({ deny: true });
  const deniedWin = loadOptionsPage(deniedApi);
  await tick(80);
  const deniedBox = deniedWin.document.getElementById("opt-allSites");
  deniedBox.checked = true;
  deniedBox.dispatchEvent(new deniedWin.Event("change", { bubbles: true }));
  await tick(400);

  assert.strictEqual(deniedBox.checked, false,
    "the toggle reverts when the user denies the permission");
  assert.strictEqual(deniedWin.document.getElementById("allSitesHint").hidden, false,
    "the user is told why 'all sites' cannot be enabled");
  assert.strictEqual(unhandled.length, 0, "denial must not produce unhandled rejections");

  process.off("unhandledRejection", onUnhandled);
  console.log("✔ permissions test passed — optional host permission matches the manifest");
}

main().catch((err) => {
  console.error("✘ permissions test failed");
  console.error(err.message);
  process.exit(1);
});
