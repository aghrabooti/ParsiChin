/**
 * ParsiChin — content script entry point.
 *
 * Responsibilities:
 *  1. read settings and decorate text blocks that contain Persian,
 *  2. keep working while AI replies stream in (MutationObserver),
 *  3. react to settings changes / popup messages (re-scan or cleanup),
 *  4. never touch forms, code blocks, or English-only content by default,
 *  5. restore the page exactly as it was when disabled (incl. native dir).
 *
 * Direction model (see docs/rtl-audit.md for the measurements)
 * -----------------------------------------------------------
 * Every decorated element gets BOTH a `dir` attribute (semantics, form
 * controls, accessibility) and a class that carries the real, `!important`
 * styling:
 *
 *    .pc-rtl  -> direction: rtl + text-align: right
 *    .pc-ltr  -> direction: ltr + text-align: left
 *
 * Nothing relies on `dir="auto"` any more: `auto` is decided by the first
 * strong character only, which turns Persian paragraphs that start with a
 * Latin token ("API ...", "React ...") into left-to-right text and lets the
 * layout flip line by line while an answer streams.
 *
 * English-only blocks inside a block we flipped RTL are pinned back to LTR
 * (`pc-ltr` without `pc-block`), so containers such as DeepSeek's
 * `.ds-markdown` can be right-aligned without dragging English paragraphs
 * with them.
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

  const DIR_CLASSES = ["pc-rtl", "pc-ltr"];
  const KIND_CLASSES = ["pc-persian", "pc-mixed"];

  function isProtected(el) {
    return el.matches(rules().SKIP_SELECTOR) ||
      !!el.closest("input, textarea, select, [contenteditable='true'], [role='textbox']");
  }

  /* ---------------- block detection ---------------- */

  /**
   * "Markdown container" selectors per site (e.g. DeepSeek renders the whole
   * assistant message inside <div class="ds-markdown"> which holds NO direct
   * text — only child elements). Those containers must be decorated too,
   * otherwise direction never reaches the message text.
   */
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

  /** Tags that are legitimately allowed to hold a very long answer. */
  function isTextishTag(el) {
    if (rules().TEXT_BLOCK_TAGS.indexOf(el.tagName) !== -1) return true;
    return markdownSelectors().some(function (sel) {
      try { return el.matches(sel); } catch (e) { return false; }
    });
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

  /**
   * Pin an element to LTR without restyling it. Used for English-only content
   * that lives inside a block we flipped to RTL (containers such as
   * `.ds-markdown` or a Persian <li> holding an English <p>): without this the
   * English line inherits `direction: rtl` and `text-align: right`, so its
   * punctuation jumps to the wrong end and the text hugs the wrong edge.
   */
  function pinLtr(el) {
    if (el.matches(rules().SKIP_SELECTOR) || el.hasAttribute("data-pc-pinned")) return;
    recordDir(el);
    el.setAttribute("dir", "ltr");
    el.setAttribute("data-pc-pinned", "1");
    el.classList.add("pc-ltr");
    decorated.add(el);
  }

  /**
   * Decorate / re-decorate a single block (idempotent per element).
   *
   * @param {Element} el
   * @param {object}  settings
   * @param {boolean} insideRtl true when an ancestor was flipped to RTL
   * @returns {boolean} true when this element is now RTL
   */
  function applyDecoration(el, settings, insideRtl) {
    if (!(el instanceof Element) || isProtected(el)) return false;
    if (!isBlockCandidate(el)) return false;

    const text = el.textContent || "";
    if (text.trim().length < 2) return false;
    // Never flip giant *containers* (the page wrapper / #app). Long answers
    // are fine: a 40k-character paragraph is still a paragraph.
    if (text.length > 20000 && !isTextishTag(el)) return false;

    const info = bidi().classify(text);

    /* English-only block: never restyle it, but stop RTL from leaking in. */
    if (info.kind === "none") {
      if (settings.applyMode !== "always") {
        if (insideRtl) pinLtr(el);
        return false;
      }
      recordDir(el);
      el.setAttribute("dir", "ltr");
      el.classList.add("pc-block", "pc-ltr");
      el.classList.remove("pc-rtl", "pc-persian", "pc-mixed");
      decorated.add(el);
      return false;
    }

    const dir = info.direction; // "rtl" | "ltr" (never "auto")
    recordDir(el);
    el.setAttribute("dir", dir);
    el.classList.add("pc-block");
    el.classList.remove(dir === "rtl" ? "pc-ltr" : "pc-rtl");
    el.classList.toggle("pc-rtl", dir === "rtl");
    el.classList.toggle("pc-ltr", dir === "ltr");
    el.classList.toggle("pc-persian", info.kind === "persian");
    el.classList.toggle("pc-mixed", info.kind === "mixed");
    if (el.tagName === "UL" || el.tagName === "OL") el.classList.add("pc-list");
    // Re-evaluated after streaming: drop a stale pin from an earlier pass.
    if (el.hasAttribute("data-pc-pinned")) {
      el.removeAttribute("data-pc-pinned");
      el.classList.remove("pc-ltr");
    }
    decorated.add(el);

    // EXPERIMENTAL: only runs when the user opted in.
    if (settings.punctuationNormalization) {
      Array.prototype.forEach.call(el.childNodes, function (node) {
        if (node.nodeType !== Node.TEXT_NODE) return;
        const fixed = bidi().normalizePunctuation(node.data);
        if (fixed !== node.data) node.data = fixed;
      });
    }

    return dir === "rtl";
  }

  /**
   * Re-classify a block after streaming added new text, and — unlike before —
   * also correct a block whose direction changed (mixed -> persian etc.).
   */
  function refresh(el, settings, insideRtl) {
    if (!(el instanceof Element)) return;
    if (insideRtl === undefined) {
      const rtlAncestor = el.parentElement && el.parentElement.closest(".pc-rtl");
      insideRtl = !!rtlAncestor;
    }
    applyDecoration(el, settings || currentSettings, insideRtl);
  }

  /** Walk a subtree and decorate every eligible block. */
  function walk(node, settings, insideRtl) {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    if (isProtected(node)) return;
    const isRtl = applyDecoration(node, settings, insideRtl);
    const children = node.children;
    const childInsideRtl = insideRtl || isRtl;
    for (let i = 0; i < children.length; i++) walk(children[i], settings, childInsideRtl);
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
      // "main, .a, .b" -> prefer the NARROWEST candidate that really contains
      // content; fall back to the largest one (e.g. #app) only when nothing
      // else matched. Scanning #app as the root is fine, decorating it is not.
      const candidates = rule.root.split(",").map(function (s) { return s.trim(); });
      let narrow = null;
      let narrowLen = Infinity;
      let largest = null;
      for (const sel of candidates) {
        const el = document.querySelector(sel);
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
    if (rootEl) walk(rootEl, settings, false);
    logStats();

    // IMPORTANT: observer must be (re)scheduled on every enable, not only at
    // boot — cleanup() disconnects it when the user toggles the extension off.
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

  /** Undo everything we added (used when the user disables the extension). */
  function cleanup() {
    if (observer) {
      observer.disconnect();
      observer = null;
      observerTarget = null;
    }
    decorated.forEach(function (el) {
      el.classList.remove("pc-block", "pc-persian", "pc-mixed", "pc-list");
      el.classList.remove.apply(el.classList, DIR_CLASSES);
      el.removeAttribute("data-pc-pinned");
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
      walk(found, currentSettings, false);
      scheduleRefresh(); // re-target the observer to the real root
    }
  }

  function onMutations(mutations) {
    if (!currentSettings || !currentSettings.enabled) return;
    if (!rootEl) resolveRootLater();
    if (!rootEl && !currentSettings.allSites) {
      // Still nothing to scan: keep watching, but stop wasting work.
      return;
    }

    const pendingText = [];
    for (const mutation of mutations) {
      if (mutation.type === "characterData") {
        pendingText.push(mutation.target);
        continue;
      }
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        if (rootEl) {
          if (rootEl.contains(node)) {
            const parentRtl = node.parentElement && node.parentElement.closest(".pc-rtl");
            walk(node, currentSettings, !!parentRtl);
          }
        } else if (currentSettings.allSites) {
          walk(node, currentSettings, false);
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
        refresh(el, currentSettings);
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
