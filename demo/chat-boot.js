/**
 * ParsiChin — RTL lab: boot the chosen build of the content script inside the
 * mock chat page, then measure the result and report it to the parent page.
 *
 * Query parameters
 *   engine=after|before   which build to run (before = v0.1.0 snapshot)
 *   ext=on|off            run the extension at all
 *   mode=auto|always      applyMode
 *   font=vazirmatn|system
 *   hostile=1             activate the LTR !important site stylesheet
 *   site=chatgpt|deepseek which host rule to emulate on localhost
 */
(function () {
  "use strict";

  const params = new URLSearchParams(location.search);
  const engine = params.get("engine") === "before" ? "before" : "after";
  const extOn = params.get("ext") !== "off";
  const applyMode = params.get("mode") === "always" ? "always" : "auto";
  const fontFamily = params.get("font") === "system" ? "system" : "vazirmatn";
  const site = params.get("site") === "deepseek" ? "deepseek" : "chatgpt";
  const noRoot = params.get("noroot") === "1";

  /**
   * Simulate a redesigned chat UI: same look, but <main> and #app are gone, so
   * the per-site rule's scan root does not match and the extension has to fall
   * back (this is the case that broke on the real DeepSeek).
   */
  if (noRoot) {
    const main = document.querySelector("main.chat");
    if (main) {
      const shell = document.createElement("div");
      shell.className = "chat-shell chat";
      while (main.firstChild) shell.appendChild(main.firstChild);
      main.parentNode.replaceChild(shell, main);
    }
  }

  document.getElementById("meta").textContent =
    `${engine === "before" ? "v0.1.0 (before fix)" : "v0.2.0 (after fix)"} · ` +
    `extension ${extOn ? "ON" : "OFF"} · mode=${applyMode} · font=${fontFamily} · site rule=${site}`;

  // NOTE: the `disabled` attribute on <style> is unreliable; use `media`.
  if (params.get("hostile") === "1") {
    document.getElementById("hostileStyle").setAttribute("media", "all");
  }

  const ROOT = "../";              // extension root (repository root)
  // "after" loads the real, current sources; "before" loads the v0.1.0 snapshot.
  const FILES = engine === "before"
    ? {
        css: ROOT + "demo/legacy/parsi-chin.css",
        defaults: ROOT + "demo/legacy/defaults.js",
        settings: ROOT + "demo/legacy/settings.js",
        bidi: ROOT + "demo/legacy/bidi.js",
        rules: ROOT + "demo/legacy/rules.js",
        entry: ROOT + "demo/legacy/entry.js"
      }
    : {
        css: ROOT + "styles/parsi-chin.css",
        defaults: ROOT + "src/shared/defaults.js",
        settings: ROOT + "src/shared/settings.js",
        bidi: ROOT + "src/content/bidi.js",
        rules: ROOT + "src/content/rules.js",
        entry: ROOT + "src/content/entry.js"
      };
  const settings = {
    enabled: extOn,
    applyMode: applyMode,
    fontFamily: fontFamily,
    fontSize: 100,
    lineHeight: 1.9,
    fontWeight: 400,
    punctuationNormalization: false,
    keepCodeLtr: true,
    allSites: false,
    customSites: [],
    siteOverrides: {}
  };

  /* ---------- chrome.* stub ---------- */
  window.chrome = {
    storage: {
      local: {
        get: async (key) => ({ [key]: settings }),
        set: async () => {}
      },
      onChanged: { addListener: () => {} }
    },
    runtime: {
      onMessage: { addListener: () => {} },
      sendMessage: async () => ({ ok: true }),
      // fonts live at the repository root, which is the server root
      getURL: (p) => "/" + p
    }
  };

  /* ---------- load the chosen build ---------- */
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const el = document.createElement("script");
      el.src = src;
      el.onload = resolve;
      el.onerror = () => reject(new Error("failed to load " + src));
      document.head.appendChild(el);
    });
  }

  function loadCss(href) {
    const el = document.createElement("link");
    el.rel = "stylesheet";
    el.href = href;
    document.head.appendChild(el);
  }

  async function boot() {
    if (extOn) loadCss(FILES.css);
    await loadScript(FILES.defaults);
    await loadScript(FILES.settings);
    await loadScript(FILES.bidi);
    await loadScript(FILES.rules);

    // The real extension matches specific hosts only; on localhost we map the
    // chosen site rule so the mock page is in scope.
    const rules = window.ParsiChin.rules;
    const originalRuleForHost = rules.ruleForHost;
    rules.ruleForHost = function (hostname) {
      if (!hostname || hostname === "localhost" || hostname === "127.0.0.1") {
        return originalRuleForHost(site === "deepseek" ? "chat.deepseek.com" : "chatgpt.com");
      }
      return originalRuleForHost(hostname);
    };

    await loadScript(FILES.entry);
    setTimeout(measure, 400);
  }

  /* ---------- measurement (same logic as tools/rtl-audit.js) ---------- */
  function measureProbe(el) {
    const cs = getComputedStyle(el);
    const box = el.getBoundingClientRect();
    const contentLeft = box.left + parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth);
    const contentRight = box.right - parseFloat(cs.paddingRight) - parseFloat(cs.borderRightWidth);
    const flavor = el.dataset.flavor;

    let base = "n/a";
    let align = "n/a";
    let lines = null;
    let marker = null;

    if (flavor === "sen") {
      const fa = el.querySelector(".s-fa");
      const la = el.querySelector(".s-la");
      if (fa && la) {
        const fr = fa.getBoundingClientRect();
        const lr = la.getBoundingClientRect();
        base = lr.left < fr.left - 1 ? "rtl" : (fr.left < lr.left - 1 ? "ltr" : "same-x");
        const gapL = Math.min(fr.left, lr.left) - contentLeft;
        const gapR = contentRight - Math.max(fr.right, lr.right);
        align = (gapR <= 4 && gapR < gapL) ? "right"
          : ((gapL <= 4 && gapL < gapR) ? "left"
            : "indent L" + Math.round(gapL) + "/R" + Math.round(gapR));
      }
      const fa2 = el.querySelector(".s-fa2");
      const la2 = el.querySelector(".s-la2");
      if (fa && la && fa2 && la2) {
        lines = [
          la.getBoundingClientRect().left < fa.getBoundingClientRect().left ? "rtl" : "ltr",
          la2.getBoundingClientRect().left < fa2.getBoundingClientRect().left ? "rtl" : "ltr"
        ];
      }
      if (el.dataset.marker) {
        const list = el.closest("ul, ol");
        marker = list ? (getComputedStyle(list).direction === "rtl" ? "right" : "left") : null;
      }
    } else {
      const range = document.createRange();
      range.selectNodeContents(el);
      const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0.5);
      base = cs.direction;
      if (rects.length) {
        const left = Math.min.apply(null, rects.map((r) => r.left));
        const right = Math.max.apply(null, rects.map((r) => r.right));
        const gapL = left - contentLeft;
        const gapR = contentRight - right;
        align = (gapL <= 4 && gapL <= gapR) ? "left"
          : ((gapR <= 4 && gapR < gapL) ? "right"
            : "indent L" + Math.round(gapL) + "/R" + Math.round(gapR));
      }
    }

    return {
      id: el.id,
      flavor,
      dirAttr: el.getAttribute("dir"),
      direction: cs.direction,
      textAlign: cs.textAlign,
      unicodeBidi: cs.unicodeBidi,
      classes: String(el.className).replace(/\bprobe\b/g, "").trim(),
      base, align, lines, marker,
      flipSafety: el.dataset.flipSafety === "1",
      expect: flipSafetyExpected(el)
    };
  }

  /** What correct behaviour means for this probe (see docs/rtl-audit.md). */
  function flipSafetyExpected(el) {
    if (el.dataset.flipSafety === "1") return "ltr";
    if (/^(en-|lat-|code-only|digits-only)/.test(el.id) || el.id === "code-fa") return "ltr";
    if (el.id === "lat-list") return "ltr";
    return "rtl";
  }

  function judge(row) {
    const problems = [];
    if (row.expect === "rtl") {
      if (row.base !== "rtl") problems.push("base=" + row.base + ", want rtl");
      if (row.align !== "right") problems.push("align=" + row.align + ", want right");
    } else {
      if (row.base !== "ltr") problems.push("base=" + row.base + ", want ltr");
      if (row.align !== "left") problems.push("align=" + row.align + ", want left");
    }
    if (row.lines && new Set(row.lines).size > 1) problems.push("per-line flip-flop [" + row.lines.join(",") + "]");
    if (row.marker === "left" && row.base === "rtl") problems.push("list marker stays left while text is rtl");
    return problems;
  }

  function measure() {
    const rows = Array.from(document.querySelectorAll(".probe")).map((el) => {
      const row = measureProbe(el);
      const problems = judge(row);
      row.verdict = problems.length ? "FAIL — " + problems.join("; ") : "pass";
      return row;
    });
    const engineStats = (window.ParsiChin && window.ParsiChin.report)
      ? window.ParsiChin.report().stats
      : null;
    window.parent.postMessage(
      { type: "parsichin-lab", engine, extOn, applyMode, site, noRoot, rows, engineStats },
      "*"
    );
  }

  window.addEventListener("error", (e) => {
    window.parent.postMessage({ type: "parsichin-lab-error", message: String(e.message) }, "*");
  });

  boot().catch((err) => {
    window.parent.postMessage({ type: "parsichin-lab-error", message: String(err && err.message) }, "*");
  });
})();
