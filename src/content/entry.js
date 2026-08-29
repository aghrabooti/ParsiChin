/**
 * ParsiChin — content script entry point.
 *
 * Responsibilities:
 *  1. read settings and decorate text blocks that contain Persian,
 *  2. keep working while AI replies stream in (MutationObserver),
 *  3. react to settings changes / popup messages (re-scan or cleanup),
 *  4. never touch forms, code blocks, or English-only content by default,
 *  5. restore the page exactly as it was when disabled (incl. native dir).
 */
(function () {
  "use strict";

  if (window.__parsiChinBooted) return;
  window.__parsiChinBooted = true;

  const bidi = () => window.ParsiChin.bidi;
  const rules = () => window.ParsiChin.rules;

  /** Elements we decorated in this page; used for cleanup on disable. */
  const decorated = new Set();

  /**
   * Original `dir` state of every element we touched. We MUST remember it:
   * the page itself may already have dir="rtl"/"ltr"/"auto" (native RTL
   * sites!). On cleanup we restore the exact original state instead of
   * blindly removing the attribute — otherwise toggling the extension off
   * breaks the site's own layout.
   */
  const originalDir = new WeakMap();

  let currentSettings = null;
  let rootEl = null;
  let observer = null;
  let observerTarget = null;
  const requestedFonts = new Set();

  function isProtected(el) {
    return el.matches(rules().SKIP_SELECTOR) ||
      !!el.closest("input, textarea, select, [contenteditable='true'], [role='textbox']");
  }

  /* ---------------- dir state preservation ---------------- */

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

  /* ---------------- base CSS variables ---------------- */

  /**
   * Content-stylesheet URLs are resolved relative to the host page. Load
   * bundled fonts through the extension URL instead, so sites such as
   * DeepSeek never receive a request for /fonts/Vazirmatn-*.woff2.
   */
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
      }).catch(function () {
        // Keep the system-font fallback when a browser declines a font load.
      });
    });
  }

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

  /* ---------------- decoration ---------------- */

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

    if (dir) {
      recordDir(el);
      el.setAttribute("dir", dir);
    }
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
    if (dir) {
      recordDir(el);
      el.setAttribute("dir", dir);
    }
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

  /* ---------------- scan root ---------------- */

  /** Is the current host blocked by a per-site override? */
  function hostBlocked(settings) {
    return Object.keys(settings.siteOverrides || {}).some(function (key) {
      return settings.siteOverrides[key] === false &&
        rules().hostMatchesRule(location.hostname, key);
    });
  }

  /** True when this page is in scope (known site + not blocked, or allSites). */
  function pageInScope(settings) {
    const rule = rules().ruleForHost(location.hostname);
    if (!rule) return !!settings.allSites;
    return !hostBlocked(settings);
  }

  /** Find the best scan root for the current page. */
  function resolveRoot(settings) {
    const rule = rules().ruleForHost(location.hostname);
    if (rule && hostBlocked(settings)) return null;

    let root = null;
    if (rule) {
      // "main, .a, .b" -> pick the largest match.
      const candidates = rule.root.split(",").map(function (s) { return s.trim(); });
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

  /* ---------------- apply / cleanup ---------------- */

  /** Full (re)scan of the current page + (re)start live observation. */
  function applyAll(settings) {
    currentSettings = settings;
    if (!settings.enabled) return cleanup();

    applyBaseVariables(settings);
    rootEl = resolveRoot(settings);
    if (rootEl) walk(rootEl, settings);

    // IMPORTANT: observer must be (re)scheduled on every enable, not only at
    // boot — cleanup() disconnects it when the user toggles the extension off.
    scheduleRefresh();
  }

  /** Undo everything we added (used when the user disables the extension). */
  function cleanup() {
    if (observer) {
      observer.disconnect();
      observer = null;
      observerTarget = null;
    }
    decorated.forEach(function (el) {
      el.classList.remove("pc-block", "pc-persian", "pc-mixed");
      restoreDir(el); // restore the site's own dir, never strip it
    });
    decorated.clear();
    removeBaseVariables();
    rootEl = null;
  }

  /* ---------------- live observation ---------------- */

  function scheduleRefresh() {
    if (!currentSettings) return;
    // Watch the resolved root; while it's still missing (SPA/delayed render)
    // watch <body> — but only when the page is actually in scope.
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

  /** Root wasn't there at boot (SPA) — try again once content appears. */
  function resolveRootLater() {
    if (rootEl) return;
    const found = resolveRoot(currentSettings);
    if (found) {
      rootEl = found;
      walk(found, currentSettings);
      scheduleRefresh(); // re-target the observer to the real root
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
      // Only refresh inside the scan root (or everywhere in allSites mode).
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
