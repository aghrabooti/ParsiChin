/**
 * ParsiChin — content script entry point.
 *
 * Responsibilities:
 *  1. read settings and decorate text blocks that contain Persian,
 *  2. keep working while AI replies stream in (MutationObserver),
 *  3. react to settings changes / popup messages (re-scan or cleanup),
 *  4. never touch forms, code blocks, or English-only content by default,
 *  5. restore the page exactly as it was when disabled (incl. native dir),
 *  6. force direction with inline !important styles so site CSS cannot
 *     cancel it (font-only change = direction was being overridden).
 */
(function () {
  "use strict";

  if (window.__parsiChinBooted) return;
  window.__parsiChinBooted = true;

  const bidi = () => window.ParsiChin.bidi;
  const rules = () => window.ParsiChin.rules;

  /** Elements we decorated in this page; used for cleanup on disable. */
  const decorated = new Set();

  /** Original `dir` attribute state of every element we touched. */
  const originalDir = new WeakMap();

  /** Original inline style values for properties we changed. */
  const originalStyles = new WeakMap();

  let currentSettings = null;
  let rootEl = null;
  let observer = null;
  let observerTarget = null;
  const requestedFonts = new Set();

  function isProtected(el) {
    return el.matches(rules().SKIP_SELECTOR) ||
      !!el.closest("input, textarea, select, [contenteditable='true'], [role='textbox']");
  }

  /* ---------------- state preservation ---------------- */

  function recordDir(el) {
    if (!originalDir.has(el)) {
      originalDir.set(el, {
        existed: el.hasAttribute("dir"),
        value: el.getAttribute("dir")
      });
    }
  }

  function restoreDir(el) {
    const orig = originalDir.get(el);
    if (!orig) return;
    if (orig.existed) el.setAttribute("dir", orig.value);
    else el.removeAttribute("dir");
    originalDir.delete(el);
  }

  function recordStyle(el, prop) {
    if (!originalStyles.has(el)) originalStyles.set(el, new Map());
    const map = originalStyles.get(el);
    if (!map.has(prop)) {
      map.set(prop, {
        had: el.style.getPropertyValue(prop) !== "",
        value: el.style.getPropertyValue(prop),
        priority: el.style.getPropertyPriority(prop)
      });
    }
  }

  function restoreStyle(el, prop) {
    const map = originalStyles.get(el);
    if (!map || !map.has(prop)) return;
    const orig = map.get(prop);
    if (orig.had) el.style.setProperty(prop, orig.value, orig.priority);
    else el.style.removeProperty(prop);
    map.delete(prop);
  }

  /* ---------------- bundled fonts (kept from main) ---------------- */

  function loadBundledFonts() {
    if (typeof FontFace !== "function" || !document.fonts ||
        !chrome.runtime || typeof chrome.runtime.getURL !== "function") return;
    [
      ["styles/fonts/Vazirmatn-Regular.woff2", "400"],
      ["styles/fonts/Vazirmatn-Medium.woff2", "500"],
      ["styles/fonts/Vazirmatn-Bold.woff2", "700"]
    ].forEach(function (font) {
      const path = font[0];
      if (requestedFonts.has(path)) return;
      requestedFonts.add(path);
      const face = new FontFace(
        "ParsiChin Vazirmatn",
        "url(" + JSON.stringify(chrome.runtime.getURL(path)) + ") format('woff2')",
        { weight: font[1], style: "normal", display: "swap" }
      );
      face.load().then(function (loadedFace) {
        document.fonts.add(loadedFace);
      }).catch(function () { /* fallback stays */ });
    });
  }

  /* ---------------- base CSS variables ---------------- */

  function applyBaseVariables(settings) {
    const html = document.documentElement;
    html.classList.add("parsi-chin-active");
    html.style.setProperty("--pc-font-size", String(settings.fontSize) + "%");
    html.style.setProperty("--pc-line-height", String(settings.lineHeight));
    html.style.setProperty("--pc-font-weight", String(settings.fontWeight));
    html.classList.toggle("pc-font-vazirmatn", settings.fontFamily === "vazirmatn");
    html.classList.toggle("pc-code-ltr", settings.keepCodeLtr !== false);
    if (settings.fontFamily === "vazirmatn") loadBundledFonts();
  }

  function removeBaseVariables() {
    const html = document.documentElement;
    html.classList.remove("parsi-chin-active");
    html.classList.remove("pc-font-vazirmatn");
    html.classList.remove("pc-code-ltr");
    html.style.removeProperty("--pc-font-size");
    html.style.removeProperty("--pc-line-height");
    html.style.removeProperty("--pc-font-weight");
  }

  /* ---------------- block detection ---------------- */

  /** Extra container selectors per site (e.g. .ds-markdown on DeepSeek). */
  function markdownSelectors() {
    const rule = rules().ruleForHost(location.hostname);
    return (rule && rule.blockSelectors) || [];
  }

  function isBlockCandidate(el) {
    if (rules().isTextBlock(el)) return true;
    const extras = markdownSelectors();
    for (let i = 0; i < extras.length; i++) {
      if (el.matches(extras[i])) return true;
    }
    return false;
  }

  /** True when the element has at least one DIRECT text node with Persian. */
  function hasPersianTextNode(el) {
    for (let i = 0; i < el.childNodes.length; i++) {
      const node = el.childNodes[i];
      if (node.nodeType === Node.TEXT_NODE && bidi().hasPersian(node.data)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Blocks of text that are mostly Latin but contain a meaningful amount of
   * Persian (ratio >= 0.3, e.g. "خروجی Model به این صورت است") should still
   * be RTL — otherwise they stay LTR and look broken to Persian readers.
   */
  function effectiveKind(info) {
    if (info.kind === "mixed" && info.ratio >= 0.3) return "persian";
    return info.kind;
  }

  /* ---------------- direction application ---------------- */

  /**
   * Apply direction BOTH as a dir attribute and as inline CSS with
   * !important. The attribute handles bidi ordering; the inline style wins
   * against site stylesheets (some chat UIs set direction in CSS with
   * normal or even !important rules — only inline !important can beat those).
   */
  function applyDirection(el, dir) {
    recordDir(el);
    el.setAttribute("dir", dir);

    if (dir === "rtl") {
      recordStyle(el, "direction");
      recordStyle(el, "text-align");
      el.style.setProperty("direction", "rtl", "important");
      el.style.setProperty("text-align", "right", "important");
      recordStyle(el, "unicode-bidi");
      el.style.setProperty("unicode-bidi", "isolate", "important");
    } else {
      // dir="auto": let the browser decide per paragraph, but isolate it.
      recordStyle(el, "text-align");
      recordStyle(el, "unicode-bidi");
      el.style.setProperty("text-align", "start", "important");
      el.style.setProperty("unicode-bidi", "plaintext", "important");
    }
  }

  /* ---------------- decoration ---------------- */

  /** Decorate a single text block (idempotent per element). */
  function decorate(el, settings) {
    if (!(el instanceof Element) || isProtected(el)) return;
    if (!isBlockCandidate(el) && !hasPersianTextNode(el)) return;

    const text = el.textContent || "";
    if (text.trim().length < 2) return;
    if (text.length > 30000) return; // never flip huge containers / whole app

    const info = bidi().classify(text);
    if (info.kind === "none" && settings.applyMode !== "always") return;

    const kind = effectiveKind(info);
    const dir = settings.applyMode === "always"
      ? (kind === "persian" ? "rtl" : "auto")
      : (kind === "persian" ? "rtl" : "auto");

    if (dir) applyDirection(el, dir);
    el.classList.add("pc-block");
    el.classList.toggle("pc-persian", kind === "persian");
    el.classList.toggle("pc-mixed", kind !== "persian");
    decorated.add(el);

    // EXPERIMENTAL: only runs when the user opted in.
    if (settings.punctuationNormalization) {
      Array.prototype.forEach.call(el.childNodes, function (node) {
        if (node.nodeType !== Node.TEXT_NODE) return;
        const fixed = bidi().normalizePunctuation(node.data);
        if (fixed !== node.data) node.data = fixed;
      });
    }
  }

  /**
   * Re-classify a block after streaming added new text.
   * Only upgrades: "none" → "mixed" → "persian".
   */
  function refresh(el) {
    if (!(el instanceof Element) || isProtected(el)) return;
    if (!isBlockCandidate(el) && !hasPersianTextNode(el)) return;
    if (!currentSettings) return;
    const info = bidi().classify(el.textContent || "");
    if (info.kind === "none") return;

    const kind = effectiveKind(info);
    if (!el.classList.contains("pc-block")) {
      el.classList.add("pc-block");
      decorated.add(el);
    }
    const dir = kind === "persian" ? "rtl" : "auto";
    applyDirection(el, dir);
    el.classList.toggle("pc-persian", kind === "persian");
    el.classList.toggle("pc-mixed", kind !== "persian");
  }

  /** Walk a subtree and decorate every eligible block. */
  function walk(node, settings) {
    if (!node) return;
    if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
      for (let i = 0; i < node.childNodes.length; i++) {
        walk(node.childNodes[i], settings);
      }
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    if (isProtected(node)) return;

    // Light DOM first, then pierce shadow roots (some SPAs render in them).
    decorate(node, settings);
    if (node.shadowRoot) walk(node.shadowRoot, settings);
    const children = node.children;
    for (let i = 0; i < children.length; i++) walk(children[i], settings);
  }

  /* ---------------- scan root ---------------- */

  function hostBlocked(settings) {
    return Object.keys(settings.siteOverrides || {}).some(function (key) {
      return settings.siteOverrides[key] === false &&
        rules().hostMatchesRule(location.hostname, key);
    });
  }

  function pageInScope(settings) {
    const rule = rules().ruleForHost(location.hostname);
    if (!rule) return !!settings.allSites;
    return !hostBlocked(settings);
  }

  /** Find the best scan root for the current page (incl. shadow DOM). */
  function resolveRoot(settings) {
    const rule = rules().ruleForHost(location.hostname);
    if (rule && hostBlocked(settings)) return null;

    let root = null;
    if (rule) {
      const candidates = rule.root.split(",").map(function (s) { return s.trim(); });
      let narrow = null;
      let narrowLen = Infinity;
      let largest = null;
      for (const sel of candidates) {
        // querySelector does not pierce shadow roots; try both.
        let el = document.querySelector(sel);
        if (!el) el = queryInShadow(sel);
        if (!el) continue;
        const len = el.textContent.length;
        if (!largest || len > largest.textContent.length) largest = el;
        if (len >= 200 && len <= 120000 && len < narrowLen) {
          narrow = el;
          narrowLen = len;
        }
      }
      root = narrow || largest;
    }
    if (!root && settings.allSites) {
      root = document.querySelector("main, article, [role='main']");
      if (root && root.textContent.length > 30000) root = null;
    }
    return root;
  }

  function queryInShadow(selector) {
    const all = document.querySelectorAll("*");
    for (let i = 0; i < all.length; i++) {
      if (all[i].shadowRoot) {
        const hit = all[i].shadowRoot.querySelector(selector);
        if (hit) return hit;
      }
    }
    return null;
  }

  /* ---------------- apply / cleanup ---------------- */

  function applyAll(settings) {
    currentSettings = settings;
    if (!settings.enabled) return cleanup();

    applyBaseVariables(settings);
    rootEl = resolveRoot(settings);
    if (rootEl) walk(rootEl, settings);
    logStats();

    scheduleRefresh();
  }

  function logStats() {
    let persian = 0;
    let mixed = 0;
    decorated.forEach(function (el) {
      if (el.classList.contains("pc-persian")) persian++;
      else mixed++;
    });
    console.debug(
      "[ParsiChin] active · root=" +
      (rootEl ? rootEl.tagName.toLowerCase() + "." + String(rootEl.className).split(" ").join(".") : "none") +
      " · blocks=" + decorated.size +
      " (persian=" + persian + ", mixed=" + mixed + ")"
    );
  }

  function cleanup() {
    if (observer) {
      observer.disconnect();
      observer = null;
      observerTarget = null;
    }
    decorated.forEach(function (el) {
      el.classList.remove("pc-block", "pc-persian", "pc-mixed");
      restoreDir(el);
      restoreStyle(el, "direction");
      restoreStyle(el, "text-align");
      restoreStyle(el, "unicode-bidi");
    });
    decorated.clear();
    removeBaseVariables();
    rootEl = null;
  }

  /* ---------------- live observation ---------------- */

  function scheduleRefresh() {
    if (!currentSettings) return;
    const target = rootEl || (pageInScope(currentSettings) ? document.body : null);
    if (!target) return;
    if (observer && observerTarget === target) return;
    if (observer) observer.disconnect();
    observer = new MutationObserver(onMutations);
    observerTarget = target;
    observer.observe(target, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  function resolveRootLater() {
    if (rootEl) return;
    const found = resolveRoot(currentSettings);
    if (found) {
      rootEl = found;
      walk(found, currentSettings);
      scheduleRefresh();
    }
  }

  function onMutations(mutations) {
    if (!currentSettings || !currentSettings.enabled) return;
    if (!rootEl) resolveRootLater();

    const pendingText = [];
    for (const mutation of mutations) {
      if (mutation.type === "characterData") {
        pendingText.push(mutation.target);
        continue;
      }
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        if (rootEl) {
          if (rootEl.contains(node)) walk(node, currentSettings);
        } else if (currentSettings.allSites) {
          walk(node, currentSettings);
        }
      }
    }

    pendingText.forEach(function (textNode) {
      const parent = textNode.parentElement;
      if (!parent) return;
      if (rootEl && !rootEl.contains(parent) && !currentSettings.allSites) return;
      if (!rootEl && !currentSettings.allSites) return;
      let depth = 0;
      let el = parent;
      while (el && depth < 4) {
        refresh(el);
        el = el.parentElement;
        depth++;
      }
    });
  }

  /* ---------------- diagnostics ---------------- */

  /**
   * Run this in the page console (DevTools) on e.g. chat.deepseek.com:
   *   __parsiChinDebug()
   * It prints how many blocks were decorated and a sample of them.
   */
  window.__parsiChinDebug = function () {
    const sample = Array.from(decorated).slice(0, 25).map(function (el) {
      return {
        tag: el.tagName.toLowerCase(),
        cls: String(el.className).slice(0, 80),
        dir: el.getAttribute("dir"),
        sample: (el.textContent || "").trim().slice(0, 40)
      };
    });
    const out = {
      enabled: !!(currentSettings && currentSettings.enabled),
      root: rootEl ? rootEl.tagName.toLowerCase() : "none",
      blocks: decorated.size,
      sample: sample
    };
    console.log("[ParsiChin] debug:", out);
    return out;
  };

  /* ---------------- boot ---------------- */

  async function boot() {
    const settings = await window.ParsiChinSettings.get();
    applyAll(settings);

    window.ParsiChinSettings.onChange(function (next) {
      applyAll(next);
    });

    chrome.runtime.onMessage.addListener(function (message) {
      if (message && message.type === "parsi-chin:apply") {
        window.ParsiChinSettings.get().then(applyAll);
      }
    });
  }

  boot();
})();
