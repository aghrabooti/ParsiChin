/**
 * ParsiChin — background service worker (MV3).
 *
 * Keeps a minimal copy of the defaults on purpose (a classic service worker
 * has no `window`, so src/shared/defaults.js is not reused here). Keep the
 * DEFAULT_SETTINGS object in sync with src/shared/defaults.js.
 *
 * Responsibilities:
 *  1. initialize settings on install,
 *  2. update the toolbar badge,
 *  3. register/unregister dynamic content scripts for custom sites.
 */
"use strict";

const STORAGE_KEY = "parsiChinSettings";
const DYNAMIC_SCRIPT_ID = "parsi-chin-dynamic";

const DEFAULT_SETTINGS = {
  enabled: true,
  applyMode: "auto",
  fontFamily: "vazirmatn",
  fontSize: 100,
  lineHeight: 1.9,
  fontWeight: 400,
  punctuationNormalization: false,
  keepCodeLtr: true,
  allSites: false,
  customSites: [],
  siteOverrides: {}
};

function mergeSettings(base, patch) {
  const out = Object.assign({}, base, patch || {});
  out.siteOverrides = Object.assign({}, base.siteOverrides, (patch && patch.siteOverrides) || {});
  out.customSites = Array.isArray(patch && patch.customSites)
    ? patch.customSites.slice()
    : (base.customSites || []).slice();
  return out;
}

async function getSettings() {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  return mergeSettings(DEFAULT_SETTINGS, stored[STORAGE_KEY]);
}

async function saveSettings(patch) {
  const next = mergeSettings(await getSettings(), patch);
  await chrome.storage.local.set({ [STORAGE_KEY]: next });
  return next;
}

function hostMatchesRule(hostname, site) {
  return hostname === site || hostname.endsWith("." + site);
}

async function refreshBadge() {
  const settings = await getSettings();
  try {
    if (settings.enabled) {
      await chrome.action.setBadgeText({ text: "پ" });
      await chrome.action.setBadgeBackgroundColor({ color: "#0d9488" });
    } else {
      await chrome.action.setBadgeText({ text: "" });
    }
  } catch (e) {
    /* action may be unavailable in some contexts; ignore */
  }
}

/**
 * Dynamic scripts for custom sites / "all sites" mode.
 * Requires the optional "<all_urls>" permission, requested from the options
 * page on a user gesture. Unregistering never throws.
 */
async function registerDynamicScripts(settings) {
  const scriptFiles = [
    "src/shared/defaults.js",
    "src/shared/settings.js",
    "src/content/bidi.js",
    "src/content/rules.js",
    "src/content/entry.js"
  ];

  const unregister = () =>
    chrome.scripting.unregisterContentScripts({ ids: [DYNAMIC_SCRIPT_ID] }).catch(() => {});

  const customMatches = (settings.customSites || [])
    .filter(Boolean)
    .map(function (site) { return "*://" + site.replace(/^[*.]+/, "") + "/*"; });

  if (!settings.allSites && customMatches.length === 0) {
    await unregister();
    return;
  }

  const hasAllSitesPermission = await chrome.permissions.contains({ origins: ["<all_urls>"] });
  if (settings.allSites && !hasAllSitesPermission) {
    await unregister();
    return;
  }

  const matches = settings.allSites
    ? ["<all_urls>"]
    : customMatches;

  try {
    await chrome.scripting.unregisterContentScripts({ ids: [DYNAMIC_SCRIPT_ID] });
  } catch (e) { /* not registered yet */ }

  await chrome.scripting.registerContentScripts([{
    id: DYNAMIC_SCRIPT_ID,
    matches: matches,
    js: scriptFiles,
    css: ["styles/parsi-chin.css"],
    runAt: "document_idle",
    allFrames: false
  }]);
}

chrome.runtime.onInstalled.addListener(async function () {
  const settings = await getSettings();
  await chrome.storage.local.set({ [STORAGE_KEY]: settings });
  await refreshBadge();
  await registerDynamicScripts(settings);
});

chrome.runtime.onStartup.addListener(refreshBadge);

chrome.storage.onChanged.addListener(function (changes, areaName) {
  if (areaName !== "local") return;
  refreshBadge();
  const next = changes[STORAGE_KEY] ? changes[STORAGE_KEY].newValue : null;
  if (next) registerDynamicScripts(mergeSettings(DEFAULT_SETTINGS, next)).catch(() => {});
});

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (!message) return;

  if (message.type === "parsi-chin:get") {
    getSettings().then(sendResponse);
    return true;
  }

  if (message.type === "parsi-chin:toggle") {
    getSettings()
      .then(function (settings) {
        return saveSettings({ enabled: !settings.enabled });
      })
      .then(function () { return refreshBadge(); })
      .then(function () { sendResponse({ ok: true }); })
      .catch(function (err) { sendResponse({ ok: false, error: String(err) }); });
    return true;
  }

  if (message.type === "parsi-chin:sync-scripts") {
    registerDynamicScripts(mergeSettings(DEFAULT_SETTINGS, message.settings || {}))
      .then(function () { sendResponse({ ok: true }); })
      .catch(function (err) { sendResponse({ ok: false, error: String(err) }); });
    return true;
  }
});
