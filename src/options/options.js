/**
 * ParsiChin — options page logic.
 * Saves settings to chrome.storage.local and keeps a live preview in sync.
 */
(function () {
  "use strict";

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.prototype.slice.call(document.querySelectorAll(sel));

  /** All form controls: id -> storage key (skip ones handled manually). */
  const FIELDS = {
    "opt-enabled": "enabled",
    "opt-applyMode": "applyMode",
    "opt-fontFamily": "fontFamily",
    "opt-fontSize": "fontSize",
    "opt-lineHeight": "lineHeight",
    "opt-fontWeight": "fontWeight",
    "opt-punctuationNormalization": "punctuationNormalization",
    "opt-keepCodeLtr": "keepCodeLtr",
    "opt-allSites": "allSites"
  };

  let settings = null;
  let saveTimer = null;

  /**
   * Host patterns the optional permission covers. This MUST equal
   * `optional_host_permissions` in manifest.json character for character:
   * chrome.permissions.request() rejects every pattern the manifest does not
   * declare ("Only permissions specified in the manifest may be requested"),
   * and the manifest's wildcard host pattern is NOT the same as <all_urls>.
   */
  const ALL_ORIGINS = ["*://*/*"];

  const HINT_PERMISSION_DENIED =
    "⚠️ دسترسی «همه‌ی سایت‌ها» در دسترس نیست — یا در chrome://extensions محدود شده یا رد شده. " +
    "از همان صفحه «Site access» را روی «On all sites» بگذارید.";
  const HINT_SYNC_FAILED =
    "⚠️ فعال‌سازی خودکار ممکن نشد؛ افزونه را در chrome://extensions دوباره بارگذاری کنید.";

  /** True after the user (or the browser) refused the optional permission. */
  let permissionDenied = false;

  /* ---------------- helpers ---------------- */

  function showStatus(text, isError) {
    const line = $("#statusLine");
    line.hidden = false;
    line.textContent = text;
    line.style.color = isError ? "#dc2626" : "#0f766e";
    clearTimeout(showStatus._t);
    showStatus._t = setTimeout(function () { line.hidden = true; }, 4000);
  }

  /** Show/hide the warning under the "all sites" switch. */
  function showAllSitesHint(show, message) {
    const hint = $("#allSitesHint");
    if (message) hint.textContent = message;
    hint.hidden = !show;
  }

  /** Does the optional host permission exist right now? */
  async function hasAllSitesPermission() {
    try {
      return await chrome.permissions.contains({ origins: ALL_ORIGINS });
    } catch (e) {
      return false;
    }
  }

  function debouncedSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(commitSave, 250);
  }

  async function commitSave() {
    const patch = readForm();

    // custom sites: one host per line, sanitized
    patch.customSites = ($("#opt-customSites").value || "")
      .split("\n")
      .map(function (line) { return line.trim().replace(/^[a-z]+:\/\//, "").replace(/\/.*$/, "").replace(/^\*\./, ""); })
      .filter(Boolean);

    settings = await window.ParsiChinSettings.save(patch);
    applyPreview();
    await chrome.runtime.sendMessage({ type: "parsi-chin:apply" });
    await syncScripts();
    return settings;
  }

  function readForm() {
    const patch = {};
    Object.keys(FIELDS).forEach(function (id) {
      const el = $("#" + id);
      const key = FIELDS[id];
      if (el.type === "checkbox") patch[key] = el.checked;
      else if (el.type === "range") patch[key] = parseFloat(el.value);
      else patch[key] = el.value;
    });
    return patch;
  }

  function writeForm(next) {
    Object.keys(FIELDS).forEach(function (id) {
      const el = $("#" + id);
      const key = FIELDS[id];
      if (el.type === "checkbox") el.checked = !!next[key];
      else if (el.type === "range") el.value = String(next[key]);
      else el.value = String(next[key]);
    });
    $("#opt-customSites").value = (next.customSites || []).join("\n");
    $("#opt-fontSize-value").textContent = next.fontSize + "%";
    renderSiteList(next.siteOverrides);
  }

  /* ---------------- site list ---------------- */

  function renderSiteList(overrides) {
    const list = $("#siteList");
    list.innerHTML = "";
    window.ParsiChin.rules.all.forEach(function (rule) {
      rule.sites.forEach(function (site) {
        const label = document.createElement("label");
        label.className = "site-item";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = !(overrides && overrides[site] === false);
        checkbox.dataset.site = site;
        const text = document.createElement("span");
        text.textContent = rule.name + " — " + site;
        label.appendChild(checkbox);
        label.appendChild(text);
        list.appendChild(label);
      });
    });

    list.querySelectorAll("input").forEach(function (checkbox) {
      checkbox.addEventListener("change", function () {
        const site = checkbox.dataset.site;
        const overrides = Object.assign({}, settings.siteOverrides);
        if (checkbox.checked) delete overrides[site];
        else overrides[site] = false;
        checkbox.closest(".site-item").classList.toggle("off", !checkbox.checked);
        window.ParsiChinSettings.save({ siteOverrides: overrides }).then(function (next) {
          settings = next;
          chrome.runtime.sendMessage({ type: "parsi-chin:apply" });
        });
      });
    });
  }

  /* ---------------- permissions & dynamic scripts ---------------- */

  async function syncScripts() {
    try {
      const res = await chrome.runtime.sendMessage({
        type: "parsi-chin:sync-scripts",
        settings: settings
      });
      if (res && res.ok === false) {
        showAllSitesHint(true, HINT_SYNC_FAILED);
        return false;
      }
      // Keep the "permission denied" warning visible: a successful sync of
      // *other* settings must not hide why "all sites" is off.
      if (!permissionDenied) showAllSitesHint(false);
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Ask for the optional host permission ("all sites" and custom sites).
   *
   * Two rules keep this working:
   *  1. the requested patterns must be declared in manifest.json
   *     (`optional_host_permissions`), hence ALL_ORIGINS;
   *  2. request() must be the first thing awaited in the user-gesture handler —
   *     Chrome drops the gesture when another promise is awaited first, so we
   *     do NOT call contains() before it. request() resolves true immediately
   *     when the permission is already granted, so nothing is lost.
   */
  async function ensurePermission() {
    try {
      const granted = await chrome.permissions.request({ origins: ALL_ORIGINS });
      permissionDenied = !granted;
      if (!granted) showAllSitesHint(true, HINT_PERMISSION_DENIED);
      else showAllSitesHint(false);
      return granted;
    } catch (err) {
      permissionDenied = true;
      showAllSitesHint(true, HINT_PERMISSION_DENIED);
      showStatus("درخواست دسترسی ناموفق بود: " + err.message, true);
      return false;
    }
  }

  /* ---------------- preview ---------------- */

  function applyPreview() {
    const box = $("#preview");
    box.style.setProperty("--pc-font-size", settings.fontSize + "%");
    box.style.setProperty("--pc-line-height", String(settings.lineHeight));
    box.style.setProperty("--pc-font-weight", String(settings.fontWeight));
    box.style.setProperty("--pc-font",
      settings.fontFamily === "vazirmatn"
        ? "Vazirmatn, Tahoma, sans-serif"
        : "Tahoma, sans-serif");

    // Rebuild the sample as safe HTML so the demo stays intact.
    const sample = box.querySelector(".pc-persian");
    const punct = settings.punctuationNormalization
      ? "سلام، دنیا! این یک <strong>متن ترکیبی</strong> است؛ جمله‌ی فارسی با کلمات انگلیسی مثل <em>Prompt</em> و <em>Model</em> در وسط آن."
      : "سلام, دنیا! این یک <strong>متن ترکیبی</strong> است؛ جمله‌ی فارسی با کلمات انگلیسی مثل <em>Prompt</em> و <em>Model</em> در وسط آن.";
    sample.innerHTML = punct;
  }

  /* ---------------- export / import / reset ---------------- */

  function exportJson() {
    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "parsi-chin-settings.json";
    a.click();
    URL.revokeObjectURL(url);
    showStatus("تنظیمات ذخیره شد.");
  }

  async function importJson(file) {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      settings = await window.ParsiChinSettings.save(parsed);
      writeForm(settings);
      applyPreview();
      await syncScripts();
      showStatus("تنظیمات با موفقیت وارد شد.");
    } catch (e) {
      showStatus("فایل JSON نامعتبر است: " + e.message, true);
    }
  }

  async function resetAll() {
    if (!confirm("همه‌ی تنظیمات به حالت پیش‌فرض برگردد؟")) return;
    settings = await window.ParsiChinSettings.reset();
    writeForm(settings);
    applyPreview();
    await syncScripts();
    showStatus("بازنشانی انجام شد.");
  }

  /* ---------------- init ---------------- */

  async function init() {
    window.ParsiChinI18n.apply(document);
    settings = await window.ParsiChinSettings.get();
    writeForm(settings);
    applyPreview();

    // "all sites" can be on while the permission is missing (fresh install
    // from an imported backup, permission revoked later, ...) — say so.
    if (settings.allSites && !(await hasAllSitesPermission())) {
      permissionDenied = true;
      showAllSitesHint(true, HINT_PERMISSION_DENIED);
    }

    Object.keys(FIELDS).forEach(function (id) {
      const el = $("#" + id);
      const key = FIELDS[id];
      el.addEventListener("change", async function () {
        if (key === "allSites") {
          if (el.checked) {
            const granted = await ensurePermission();
            if (!granted) el.checked = false;
          } else {
            permissionDenied = false;
            showAllSitesHint(false);
          }
        }
        debouncedSave();
      });
      if (el.type === "range") {
        el.addEventListener("input", function () {
          const keyRange = FIELDS[id];
          settings[keyRange] = parseFloat(el.value);
          const suffix = keyRange === "fontSize" ? "%" : "";
          $("#opt-fontSize-value").textContent = el.value + suffix;
          applyPreview();
        });
      }
    });

    $("#opt-customSites").addEventListener("change", async function () {
      if ($("#opt-customSites").value.trim()) await ensurePermission();
      debouncedSave();
    });

    $("#exportBtn").addEventListener("click", exportJson);
    $("#importBtn").addEventListener("click", function () { $("#importFile").click(); });
    $("#importFile").addEventListener("change", function (e) {
      if (e.target.files && e.target.files[0]) importJson(e.target.files[0]);
      e.target.value = "";
    });
    $("#resetBtn").addEventListener("click", resetAll);

    await syncScripts();
  }

  init();
})();
