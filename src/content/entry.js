/**
 * ParsiChin — content script entry point.
 *
 * Responsibilities:
 *  1. read settings and decorate text blocks that contain Persian,
 *  2. keep working while AI replies stream in (MutationObserver),
 *  3. react to settings changes / popup messages (re-scan or cleanup),
 *  4. never touch forms, code blocks, or English-only content by default.
 */
(function () {
  "use strict";

  if (window.__parsiChinBooted) return;
  window.__parsiChinBooted = true;

  const bidi = () => window.ParsiChin.bidi;
  const rules = () => window.ParsiChin.rules;

  /** Elements we decorated in this page; used for cleanup on disable. */
  const decorated = new Set();
  /** Elements already classified; avoids re-scanning big trees. */
  const processed = new WeakSet();

  let currentSettings = null;
  let rootEl = null;
  let observer = null;

  function isProtected(el) {
    return el.matches(rules().SKIP_SELECTOR) ||
      !!el.closest("input, textarea, select, [contenteditable='true'], [role='textbox']");
  }

  function applyBaseVariables(settings) {
    const html = document.documentElement;
    html.classList.add("parsi-chin-active");
    html.style.setProperty("--pc-font-size", String(settings.fontSize) + "%");
    html.style.setProperty("--pc-line-height", String(settings.lineHeight));
    html.style.setProperty("--pc-font-weight", String(settings.fontWeight));
    html.classList.toggle("pc-font-vazirmatn", settings.fontFamily === "vazirmatn");
    html.classList.toggle("pc-code-ltr", settings.keepCodeLtr !== false);
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

  /** Decorate a single text block (idempotent per element). */
  function decorate(el, settings) {
    if (!(el instanceof Element) || isProtected(el)) return;
    if (!rules().isTextBlock(el)) return;

    const text = el.textContent || "";
    if (text.trim().length < 2) return;

    const info = bidi().classify(text);
    if (info.kind === "none" && settings.applyMode !== "always") return;

    const dir = settings.applyMode === "always"
      ? (info.kind === "persian" ? "rtl" : "auto")
      : bidi().directionFor(info.kind);

    if (dir) el.setAttribute("dir", dir);
    el.classList.add("pc-block");
    el.classList.toggle("pc-persian", info.kind === "persian");
    el.classList.toggle("pc-mixed", info.kind !== "persian");
    decorated.add(el);

    // EXPERIMENTAL: only runs when the user opted in.
    if (settings.punctuationNormalization) {
      Array.prototype.forEach.call(el.childNodes, function (node) {
        if (node.nodeType !== Node.TEXT_NODE) return;
        const fixed = bidi().normalizePunctuation(node.data);
        if (fixed !== node.data) node.data = fixed;
      });
    }

    processed.add(el);
  }

  /**
   * Re-classify a block after streaming added new text.
   * Only upgrades: "none" → "mixed" → "persian".
   */
  function refresh(el) {
    if (!(el instanceof Element) || isProtected(el)) return;
    if (!rules().isTextBlock(el) || !currentSettings) return;
    const info = bidi().classify(el.textContent || "");
    if (info.kind === "none") return;
    if (!el.classList.contains("pc-block")) {
      el.classList.add("pc-block");
      decorated.add(el);
    }
    const dir = bidi().directionFor(info.kind);
    if (dir && el.getAttribute("dir") !== dir) el.setAttribute("dir", dir);
    el.classList.toggle("pc-persian", info.kind === "persian");
    el.classList.toggle("pc-mixed", info.kind !== "persian");
  }

  /** Walk a subtree and decorate every eligible block. */
  function walk(node, settings) {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    if (isProtected(node)) return;
    decorate(node, settings);
    const children = node.children;
    for (let i = 0; i < children.length; i++) walk(children[i], settings);
  }

  /** Find the best scan root for the current page. */
  function resolveRoot(settings) {
    const ruleHost = rules().ruleForHost(location.hostname);

    // Per-site override: user explicitly turned this site off.
    if (ruleHost) {
      const blocked = Object.keys(settings.siteOverrides || {}).some(function (key) {
        const value = settings.siteOverrides[key];
        if (value === false) {
          return rules().hostMatchesRule(location.hostname, key);
        }
        return false;
      });
      if (blocked) return null;
    }

    let root = null;
    if (ruleHost) {
      // "main, .a, .b" -> first match wins; scan the largest one found.
      const candidates = ruleHost.root.split(",").map(function (s) { return s.trim(); });
      for (const sel of candidates) {
        const el = document.querySelector(sel);
        if (el && (!root || el.textContent.length > root.textContent.length)) root = el;
      }
    }
    if (!root && settings.allSites) {
      root = document.querySelector("main, article, [role='main']");
      if (root && root.textContent.length > 30000) root = null; // too big → skip heuristics
    }
    return root;
  }

  /** Full (re)scan of the current page. */
  function applyAll(settings) {
    currentSettings = settings;
    if (!settings.enabled) return cleanup();

    applyBaseVariables(settings);
    rootEl = resolveRoot(settings);
    if (rootEl) walk(rootEl, settings);
  }

  /** Undo everything we added (used when the user disables the extension). */
  function cleanup() {
    if (observer) { observer.disconnect(); observer = null; }
    decorated.forEach(function (el) {
      el.classList.remove("pc-block", "pc-persian", "pc-mixed");
      if (el.getAttribute("dir") === "rtl" || el.getAttribute("dir") === "auto") {
        el.removeAttribute("dir");
      }
    });
    decorated.clear();
    removeBaseVariables();
    rootEl = null;
  }

  function scheduleRefresh() {
    if (observer) return; // observer already running
    observer = new MutationObserver(onMutations);
    observer.observe((rootEl || document.body), {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  function onMutations(mutations) {
    if (!currentSettings || !currentSettings.enabled) return;
    const pendingText = [];

    for (const mutation of mutations) {
      if (mutation.type === "characterData") {
        pendingText.push(mutation.target);
        continue;
      }
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          if (!rootEl || rootEl.contains(node)) walk(node, currentSettings);
        } else if (node.nodeType === Node.TEXT_NODE) {
          pendingText.push(node);
        }
      }
    }

    pendingText.forEach(function (textNode) {
      let parent = textNode.parentElement;
      let depth = 0;
      while (parent && depth < 4) {
        refresh(parent);
        parent = parent.parentElement;
        depth++;
      }
    });
  }

  async function boot() {
    const settings = await window.ParsiChinSettings.get();
    applyAll(settings);
    scheduleRefresh();

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
