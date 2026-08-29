/**
 * ParsiChin — tiny i18n helper for popup/options pages.
 * Elements with `data-i18n="key"` get their textContent replaced with
 * chrome.i18n.getMessage("key"). Elements with `data-i18n-placeholder`
 * get their placeholder attribute translated.
 */
(function () {
  "use strict";

  function applyTranslations(root) {
    const scope = root || document;
    scope.querySelectorAll("[data-i18n]").forEach(function (el) {
      const key = el.getAttribute("data-i18n");
      const message = chrome.i18n.getMessage(key);
      if (message) el.textContent = message;
    });
    scope.querySelectorAll("[data-i18n-placeholder]").forEach(function (el) {
      const key = el.getAttribute("data-i18n-placeholder");
      const message = chrome.i18n.getMessage(key);
      if (message) el.setAttribute("placeholder", message);
    });
    scope.querySelectorAll("[data-i18n-title]").forEach(function (el) {
      const key = el.getAttribute("data-i18n-title");
      const message = chrome.i18n.getMessage(key);
      if (message) el.setAttribute("title", message);
    });
  }

  window.ParsiChinI18n = { apply: applyTranslations };
})();
