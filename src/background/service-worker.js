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
 *  3. register/unregister dynamic content scripts for custom sites / "all sites",
 *  4. turn the extension on for the page the user is looking at, immediately
 *     (used by the popup's "enable on this site" button).
 */
"use strict";

const STORAGE_KEY = "parsiChinSettings";

/**
 * Host patterns for the wildcard access. MUST equal `host_permissions` in
 * manifest.json: chrome.permissions.contains() and
 * chrome.scripting.registerContentScripts() both reject patterns the manifest
 * does not declare, and the <all_urls> spelling is not the same pattern as the
 * manifest's wildcard host pattern (that mismatch made "all sites" mode
 * silently do nothing).
 */
const ALL_ORIGINS = ["*://*/*"];
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
  allSites: true,
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
 * Requires the optional host permission (ALL_ORIGINS), requested from the
 * options page on a user gesture. Unregistering never throws.
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

  const hasAllSitesPermission = await chrome.permissions.contains({ origins: ALL_ORIGINS });
  if (settings.allSites && !hasAllSitesPermission) {
    // The user restricted site access, and Chrome no longer grants the wildcard.
    // Custom sites still work through the dynamic registration below.
    if (customMatches.length === 0) {
      await unregister();
      return;
    }
  }
  if (settings.allSites && hasAllSitesPermission) {
    // Nothing to do: the static content script declared in the manifest already
    // runs on every page. Registering it again would execute it twice.
    await unregister();
    return;
  }

  const matches = settings.allSites
    ? ALL_ORIGINS
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

/* A permission can also be granted from chrome://extensions — pick that up. */
if (chrome.permissions && chrome.permissions.onAdded) {
  chrome.permissions.onAdded.addListener(function () {
    getSettings().then(registerDynamicScripts).catch(function () {});
  });
}

chrome.storage.onChanged.addListener(function (changes, areaName) {
  if (areaName !== "local") return;
  refreshBadge();
  const next = changes[STORAGE_KEY] ? changes[STORAGE_KEY].newValue : null;
  if (next) registerDynamicScripts(mergeSettings(DEFAULT_SETTINGS, next)).catch(() => {});
});

/**
 * Inject the content script into one tab right now, so enabling the extension
 * for a page does not require a reload. Needs host permission for that tab,
 * which the caller (the popup) requests on a user gesture first.
 */
async function injectInto(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId: tabId },
    files: [
      "src/shared/defaults.js",
      "src/shared/settings.js",
      "src/content/bidi.js",
      "src/content/rules.js",
      "src/content/entry.js"
    ]
  });
  try {
    await chrome.scripting.insertCSS({ target: { tabId: tabId }, files: ["styles/parsi-chin.css"] });
  } catch (e) { /* injecting twice is harmless, the stylesheet is idempotent */ }
}

/** Ask the content script in a tab to re-read settings right now. */
async function settingsApplyToTabs(tabId) {
  const ids = tabId ? [tabId] : [];
  if (!tabId) {
    try {
      const tabs = await chrome.tabs.query({});
      tabs.forEach(function (t) { if (t.id !== undefined) ids.push(t.id); });
    } catch (e) { /* no active tabs */ }
  }
  await Promise.all(ids.map(function (id) {
    return chrome.tabs.sendMessage(id, { type: "parsi-chin:apply" }).catch(function () {});
  }));
}

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

  /* Turn one host on/off, whatever mode is active (used by the popup). */
  if (message.type === "parsi-chin:toggle-site") {
    const host = String(message.host || "").replace(/^www\./, "");
    if (!host) {
      sendResponse({ ok: false, error: "no host" });
      return true;
    }
    getSettings()
      .then(function (settings) {
        const overrides = Object.assign({}, settings.siteOverrides || {});
        const list = (settings.customSites || []).slice();
        if (message.enabled) {
          delete overrides[host];
          if (list.indexOf(host) === -1) list.push(host);
        } else {
          overrides[host] = false;
        }
        return saveSettings({ siteOverrides: overrides, customSites: list });
      })
      .then(function () { return settingsApplyToTabs(message.tabId); })
      .then(function () { sendResponse({ ok: true, host: host, enabled: !!message.enabled }); })
      .catch(function (err) { sendResponse({ ok: false, error: String(err) }); });
    return true;
  }

  /* "Enable on this site": add the host to the custom list and (re)register. */
  if (message.type === "parsi-chin:enable-site") {
    const host = String(message.host || "").replace(/^www\./, "");
    if (!host) {
      sendResponse({ ok: false, error: "no host" });
      return true;
    }
    getSettings()
      .then(function (settings) {
        const list = (settings.customSites || []).slice();
        if (list.indexOf(host) === -1) list.push(host);
        return saveSettings({ customSites: list });
      })
      .then(registerDynamicScripts)
      .then(function () {
        return message.tabId ? injectInto(message.tabId) : null;
      })
      .then(function () { sendResponse({ ok: true, host: host }); })
      .catch(function (err) { sendResponse({ ok: false, error: String(err) }); });
    return true;
  }

  /* "Enable on all sites": flip the mode and register for every origin. */
  if (message.type === "parsi-chin:enable-all") {
    saveSettings({ allSites: true })
      .then(registerDynamicScripts)
      .then(function () {
        return message.tabId ? injectInto(message.tabId) : null;
      })
      .then(function () { sendResponse({ ok: true }); })
      .catch(function (err) { sendResponse({ ok: false, error: String(err) }); });
    return true;
  }

  if (message.type === "parsi-chin:inject") {
    injectInto(message.tabId)
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
