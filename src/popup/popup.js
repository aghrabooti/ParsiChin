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

  /** Host patterns for the optional permission — must match the manifest. */
  const ALL_ORIGINS = ["*://*/*"];

  function setButtons(state) {
    // state: "hide" when the page is already covered, otherwise "show"
    const box = $("#enableBox");
    box.hidden = state === "hide";
  }

  function setHint(text, isError) {
    const hint = $("#enableHint");
    hint.textContent = text || "";
    hint.classList.toggle("error", !!isError);
  }

  /**
   * Ask Chrome for host access. A single-origin pattern is a subset of the
   * manifest's optional host patterns, so requesting the narrow pattern keeps
   * the prompt honest; if Chrome refuses it (older builds), fall back to the
   * full pattern, which is what earlier versions had to do.
   */
  async function requestOrigins(origins) {
    try {
      if (await chrome.permissions.request({ origins: origins })) return true;
    } catch (e) { /* fall through */ }
    try {
      return await chrome.permissions.request({ origins: ALL_ORIGINS });
    } catch (e) {
      return false;
    }
  }

  async function enableOnThisSite() {
    const tab = await currentTab();
    const host = tab ? hostOf(tab.url) : "";
    if (!host) return;
    setHint("منتظر تأیید دسترسی از طرف کروم…");
    const ok = await requestOrigins(["*://" + host + "/*"]);
    if (!ok) {
      setHint("کروم دسترسی این سایت را نداد. می‌توانید از تنظیمات کامل سایت را اضافه کنید.", true);
      return;
    }
    const res = await chrome.runtime.sendMessage({
      type: "parsi-chin:enable-site", host: host, tabId: tab.id
    });
    setHint(res && res.ok ? "فعال شد — همین حالا، بدون نیاز به رفرش." : "فعال‌سازی ناموفق بود.", !(res && res.ok));
    await refresh();
  }

  async function enableOnAllSites() {
    const tab = await currentTab();
    setHint("منتظر تأیید دسترسی «همه‌ی سایت‌ها»…");
    const ok = await requestOrigins(ALL_ORIGINS);
    if (!ok) {
      setHint("کروم دسترسی «همه‌ی سایت‌ها» را نداد.", true);
      return;
    }
    const res = await chrome.runtime.sendMessage({ type: "parsi-chin:enable-all", tabId: tab && tab.id });
    setHint(res && res.ok ? "حالت «همه‌ی سایت‌ها» روشن شد — بدون نیاز به رفرش." : "فعال‌سازی ناموفق بود.", !(res && res.ok));
    await refresh();
  }

  async function currentTab() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      return (tabs && tabs[0]) || null;
    } catch (e) {
      return null;
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
      setButtons("hide");
    } else if (rule && !hostBlocked(hostname, settings.siteOverrides)) {
      setStatus("ok", rule.name, "این صفحه پشتیبانی می‌شود — متن‌های فارسی تزئین می‌شوند.");
      setButtons("hide");
    } else if (settings.allSites) {
      setStatus("ok", "همه‌ی سایت‌ها", "حالت «همه‌ی سایت‌ها» فعال است؛ متن‌های فارسی تزئین می‌شوند.");
      setButtons("hide");
    } else if ((settings.customSites || []).some(function (key) {
      return window.ParsiChin.rules.hostMatchesRule(hostname, key);
    })) {
      setStatus("ok", hostname || "این سایت", "این سایت را خودتان فعال کرده‌اید.");
      setButtons("hide");
    } else {
      setStatus("", hostname || "این صفحه پشتیبانی نمی‌شود",
        "با یک کلیک می‌توانید همین سایت را فعال کنید — بدون رفرش و بدون تنظیمات.");
      setButtons("show");
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
    $("#enableSite").addEventListener("click", function () { enableOnThisSite(); });
    $("#enableAll").addEventListener("click", function () { enableOnAllSites(); });
    $("#feedback").addEventListener("click", function () {
      window.open("https://github.com/aghrabooti/ParsiChin/issues", "_blank", "noopener");
    });

    await refresh();
  }

  init();
})();
