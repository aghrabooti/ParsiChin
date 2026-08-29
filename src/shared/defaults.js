/**
 * ParsiChin — defaults & settings schema
 * Loaded by: content scripts, popup, options (classic scripts, no modules).
 *
 * NOTE: keep this file side-effect free and browser-agnostic when possible.
 * The background service worker keeps its own minimal copy on purpose,
 * because `window` does not exist in a classic service worker.
 */
(function () {
  "use strict";

  const STORAGE_KEY = "parsiChinSettings";

  const DEFAULT_SETTINGS = Object.freeze({
    /** Master switch: extension does nothing when false. */
    enabled: true,

    /**
     * When to decorate a text block:
     *  - "auto"   -> only when the block contains Persian characters
     *  - "always" -> decorate every text block (for extremely mixed UIs)
     */
    applyMode: "auto",

    /** "vazirmatn" (bundled, recommended) or "system" (site font). */
    fontFamily: "vazirmatn",

    /** Font size of Persian blocks, in percent (100 = unchanged). */
    fontSize: 100,

    /** Line height of Persian blocks. Persian script needs ~1.8–2.0. */
    lineHeight: 1.9,

    /** Base font weight applied to Persian blocks (400/500/700). */
    fontWeight: 400,

    /**
     * EXPERIMENTAL: normalize Latin punctuation inside Persian text
     * (e.g. "سلام, دنیا" -> "سلام، دنیا"). It rewrites Text nodes and can
     * interfere with React/Vue re-renders. Default: off.
     */
    punctuationNormalization: false,

    /** Keep <code>/<pre> blocks strictly LTR and monospace. */
    keepCodeLtr: true,

    /** Inject on every website (requires the optional <all_urls> permission). */
    allSites: false,

    /** Extra sites injected dynamically, e.g. ["example.com"]. */
    customSites: [],

    /** Per-host overrides: { "chatgpt.com": false } disables a host. */
    siteOverrides: {}
  });

  /**
   * Deep-ish merge: top-level keys from `patch` win; `siteOverrides` and
   * `customSites` are replaced wholesale (never merged), which is what the UI
   * expects.
   */
  function mergeSettings(base, patch) {
    const out = Object.assign({}, base, patch || {});
    out.siteOverrides = Object.assign({}, base.siteOverrides, (patch && patch.siteOverrides) || {});
    out.customSites = Array.isArray(patch && patch.customSites)
      ? patch.customSites.slice()
      : (base.customSites || []).slice();
    return out;
  }

  // Expose on `window` in page contexts (content scripts, popup, options).
  if (typeof window !== "undefined") {
    window.ParsiChinDefaults = {
      STORAGE_KEY: STORAGE_KEY,
      SETTINGS: DEFAULT_SETTINGS,
      mergeSettings: mergeSettings
    };
  }

  // Also expose on `self` for Future-proofing (workers/ESM wrappers).
  if (typeof self !== "undefined") {
    self.ParsiChinDefaults = self.ParsiChinDefaults || {
      STORAGE_KEY: STORAGE_KEY,
      SETTINGS: DEFAULT_SETTINGS,
      mergeSettings: mergeSettings
    };
  }
})();
