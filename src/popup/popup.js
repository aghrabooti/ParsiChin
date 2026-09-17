/**
 * ParsiChin — popup logic.
 */
(function () {
  "use strict";

  const $ = (sel) => document.querySelector(sel);

  /**
   * Ask the content script of that tab how many blocks it decorated. This is
   * the fastest way to tell "the extension is not running here" apart from
   * "it runs but found nothing to decorate" (e.g. a redesigned site whose
   * container our rules do not know yet).
   */
  async function askStats(tab) {
    if (!tab || tab.id === undefined || !chrome.tabs.sendMessage) return null;
    try {
      return await chrome.tabs.sendMessage(tab.id, { type: "parsi-chin:stats" });
    } catch (e) {
      return null; // no content script in that tab (unsupported page)
    }
  }

  function setStatus(className, siteName, detail) {
    const dot = $("#siteDot");
    dot.className = "dot" + (className ? " " + className : "");
    $("#siteName").textContent = siteName;
    $("#siteDetail").textContent = detail;
  }

  function hostOf(url) {
    try { return new URL(url).hostname; } catch (e) { return ""; }
  }

  function hostBlocked(hostname, overrides) {
    return Object.keys(overrides || {}).some(function (key) {
      return overrides[key] === false && window.ParsiChin.rules.hostMatchesRule(hostname, key);
    });
  }

  async function refresh() {
    const settings = await window.ParsiChinSettings.get();
    $("#enabled").checked = !!settings.enabled;

    let hostname = "";
    let tab = null;
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      tab = tabs && tabs[0];
      if (tab && tab.url) hostname = hostOf(tab.url);
    } catch (e) { /* leave hostname empty */ }

    const rule = window.ParsiChin.rules.ruleForHost(hostname);

    if (!settings.enabled) {
      setStatus("off", "غیرفعال", "برای فعال شدن، کلید بالا را روشن کنید.");
    } else if (rule && !hostBlocked(hostname, settings.siteOverrides)) {
      setStatus("ok", rule.name, "این صفحه پشتیبانی می‌شود — متن‌های فارسی تزئین می‌شوند.");
    } else if (settings.allSites) {
      setStatus("ok", "همه‌ی سایت‌ها", "حالت «همه‌ی سایت‌ها» فعال است؛ متن‌های فارسی تزئین می‌شوند.");
    } else {
      setStatus("", "این صفحه پشتیبانی نمی‌شود", "سایت را از تنظیمات اضافه کنید یا حالت «همه سایت‌ها» را فعال کنید.");
    }

    // Live diagnostics: how many blocks did the content script decorate?
    const stats = await askStats(tab);
    if (stats) {
      const detail = $("#siteDetail");
      const suffix = stats.blocks > 0
        ? " · " + stats.blocks + " بلوک تزئین شد (فارسی: " + stats.persian + "، لاتین: " + stats.mixed + ")"
        : " · هنوز هیچ بلوکی تزئین نشده — صفحه را دوباره بارگذاری کنید";
      detail.textContent = detail.textContent + suffix;
    }
  }

  async function toggle() {
    const enabled = $("#enabled").checked;
    await window.ParsiChinSettings.save({ enabled: enabled });
    await chrome.runtime.sendMessage({ type: "parsi-chin:apply" });
    refresh();
  }

  async function init() {
    window.ParsiChinI18n.apply(document);
    $("#version").textContent = chrome.runtime.getManifest().version;

    $("#enabled").addEventListener("change", toggle);
    $("#openOptions").addEventListener("click", function () {
      chrome.runtime.openOptionsPage();
    });
    $("#feedback").addEventListener("click", function () {
      window.open("https://github.com/aghrabooti/ParsiChin/issues", "_blank", "noopener");
    });

    await refresh();
  }

  init();
})();
