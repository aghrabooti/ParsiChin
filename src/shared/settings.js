/**
 * ParsiChin — settings storage (chrome.storage.local).
 * Loaded by: content scripts, popup, options.
 */
(function () {
  "use strict";

  const DEFAULTS = window.ParsiChinDefaults;

  async function get() {
    const stored = await chrome.storage.local.get(DEFAULTS.STORAGE_KEY);
    const value = stored[DEFAULTS.STORAGE_KEY] || {};
    return DEFAULTS.mergeSettings(DEFAULTS.SETTINGS, value);
  }

  /** Merge a patch into the stored settings and return the new full object. */
  async function save(patch) {
    const current = await get();
    const next = DEFAULTS.mergeSettings(current, patch || {});
    await chrome.storage.local.set({ [DEFAULTS.STORAGE_KEY]: next });
    return next;
  }

  /** Reset every setting to factory defaults. */
  async function reset() {
    await chrome.storage.local.set({ [DEFAULTS.STORAGE_KEY]: {} });
    return get();
  }

  /** Subscribe to settings changes made by other contexts. */
  function onChange(callback) {
    chrome.storage.onChanged.addListener(function (changes, areaName) {
      if (areaName !== "local" || !changes[DEFAULTS.STORAGE_KEY]) return;
      const value = changes[DEFAULTS.STORAGE_KEY].newValue || {};
      callback(DEFAULTS.mergeSettings(DEFAULTS.SETTINGS, value));
    });
  }

  window.ParsiChinSettings = { get: get, save: save, reset: reset, onChange: onChange };
})();
