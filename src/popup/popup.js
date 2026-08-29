/**
 * ParsiChin — popup logic.
 */
(function () {
  "use strict";

  const $ = (sel) => document.querySelector(sel);

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
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
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
