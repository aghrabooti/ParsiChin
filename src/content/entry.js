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
 * Every decorated element gets its direction three times over:
 *
 *   el.classList.add("pc-rtl")             -> themed styling (font, spacing)
 *   el.setAttribute("dir", "rtl")          -> semantics, form controls, a11y
 *   el.style direction/text-align !important -> the value that always wins
 *
 * The inline `!important` declaration is the last resort: a site stylesheet
 * that hard-codes `direction: ltr !important` on a higher-specificity selector
 * (chat UIs do this on message bodies) still loses against an inline
 * `!important` declaration. The previous version relied on the class alone,
 * which is why some sites kept their own direction no matter what.
 *
 * Nothing relies on `dir="auto"`: `auto` is decided by the first strong
 * character only, which turns Persian paragraphs that start with a Latin token
 * ("API ...", "React ...") into left-to-right text and lets the layout flip
 * line by line while an answer streams.
 *
 * English-only blocks inside a block we flipped RTL are pinned back to LTR,
 * so containers such as DeepSeek's `.ds-markdown` can be right-aligned without
 * dragging English paragraphs with them.
 */
(function () {
  "use strict";

  if (window.__parsiChinBooted) return;
  window.__parsiChinBooted = true;

  const VERSION = (chrome.runtime && chrome.runtime.getManifest)
    ? chrome.runtime.getManifest().version : "unknown";

  const bidi = () => window.ParsiChin.bidi;
  const rules = () => window.ParsiChin.rules;

  /** Elements we decorated in this page; used for cleanup on disable. */
  const decorated = new Set();

  /**
   * Original state of every element we touched: the `dir` attribute AND the
   * inline direction/text-align values. We MUST remember both — the page may
   * already set them (native RTL sites, sites that style messages inline). On
   * cleanup we restore the exact original state instead of blindly removing
   * things, otherwise toggling the extension off breaks the site's layout.
   */
  const originalState = new WeakMap();

  let currentSettings = null;
  let rootEl = null;
  let observer = null;
  let observerTarget = null;
  const requestedFonts = new Set();

  const DIR_CLASSES = ["pc-rtl", "pc-ltr"];
  const KIND_CLASSES = ["pc-persian", "pc-mixed"];
  const STYLE_PROPS = ["direction", "text-align"];

  /** Elements that may never be decorated (they are scan roots, not text). */
  function isRootLike(el) {
    return el === document.body || el === document.documentElement;
  }

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

  /* ---------------- state preservation ---------------- */

  function recordState(el) {
    if (originalState.has(el)) return;
    const snapshot = {
      existed: el.hasAttribute("dir"),
      value: el.getAttribute("dir")
    };
    STYLE_PROPS.forEach(function (prop) {
      snapshot[prop] = {
        value: el.style.getPropertyValue(prop) || null,
        priority: el.style.getPropertyPriority(prop) || null
      };
    });
    originalState.set(el, snapshot);
  }

  function restoreState(el) {
    const orig = originalState.get(el);
    if (!orig) return;
    if (orig.existed) el.setAttribute("dir", orig.value);
    else el.removeAttribute("dir");
    STYLE_PROPS.forEach(function (prop) {
      const saved = orig[prop];
      if (!saved || saved.value === null) el.style.removeProperty(prop);
      else el.style.setProperty(prop, saved.value, saved.priority || "");
    });
    originalState.delete(el);
  }

  /**
   * Force one direction on one element, three times over (class, attribute,
   * inline `!important`). This is the only place that writes direction.
   */
  function forceDirection(el, dir) {
    recordState(el);
    el.setAttribute("dir", dir);
    el.style.setProperty("direction", dir, "important");
    el.style.setProperty("text-align", dir === "rtl" ? "right" : "left", "important");
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
    forceDirection(el, "ltr");
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
    if (!(el instanceof Element) || isRootLike(el)) return false;
    if (isProtected(el)) return false;
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
      forceDirection(el, "ltr");
      el.classList.add("pc-block", "pc-ltr");
      el.classList.remove("pc-rtl", "pc-persian", "pc-mixed");
      decorated.add(el);
      return false;
    }

    const dir = info.direction; // "rtl" | "ltr" (never "auto")
    forceDirection(el, dir);
    el.classList.add("pc-block");
    el.classList.remove(dir === "rtl" ? "pc-ltr" : "pc-rtl");
    el.classList.toggle("pc-rtl", dir === "rtl");
    el.classList.toggle("pc-ltr", dir === "ltr");
    el.classList.toggle("pc-persian", info.kind === "persian");
    el.classList.toggle("pc-mixed", info.kind === "mixed");
    if (el.tagName === "UL" || el.tagName === "OL") el.classList.add("pc-list");
    // Re-evaluated after streaming: drop a stale pin from an earlier pass.
    if (el.hasAttribute("data-pc-pinned")) el.removeAttribute("data-pc-pinned");
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
   * Re-classify a block after streaming added new text, and also correct a
   * block whose direction changed (mixed -> persian etc.).
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

  /**
   * Find the best scan root for the current page.
   *
   * Order of preference:
   *   1. the per-site rule's candidates, preferring the NARROWEST one that
   *      really contains content (a rule may list "main, .ds-chat, #app");
   *   2. a generic content container (main / article / [role=main] / #app /
   *      #root);
   *   3. <body> as the last resort.
   *
   * Step 3 matters: chat SPAs rename their containers regularly (DeepSeek's
   * current build has neither <main> nor #app). Without a fallback the root
   * stayed null, nothing was ever scanned, and the page only showed the base
   * font change — "the font changes but the direction never does".
   */
  function resolveRoot(settings) {
    const rule = rules().ruleForHost(location.hostname);
    if (rule && hostBlocked(settings)) return null;

    const pickNarrowest = function (selector) {
      let narrow = null;
      let narrowLen = Infinity;
      let largest = null;
      document.querySelectorAll(selector).forEach(function (el) {
        const len = el.textContent.length;
        if (!largest || len > largest.textContent.length) largest = el;
        if (len >= 200 && len <= 120000 && len < narrowLen) {
          narrow = el;
          narrowLen = len;
        }
      });
      return narrow || largest;
    };

    let root = null;
    if (rule) root = pickNarrowest(rule.root);
    if (!root && settings.allSites) {
      root = document.querySelector("main, article, [role='main']");
      if (root && root.textContent.length > 30000) root = null; // too big → skip heuristics
    }
    if (root) return root;

    // Fallbacks. The rule root may simply not exist on the current build of a
    // site, or the user enabled the extension for a page we do not know.
    const known = rules().ruleForHost(location.hostname);
    if (!known && !settings.allSites) return null;

    root = pickNarrowest("main, [role='main'], article, #root, #app, .app, .chat, .conversation");
    if (root) return root;

    return document.body; // last resort: the walk skips <body> itself
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

  /** Names of the classes of an element, for the diagnostic log/report. */
  function describe(el) {
    if (!el) return "none";
    const cls = String(el.className || "").trim().split(/\s+/).filter(Boolean).slice(0, 4);
    return el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") +
      (cls.length ? "." + cls.join(".") : "");
  }

  /** CSS-path-ish description of an element (for the report). */
  function pathOf(el) {
    const parts = [];
    let node = el;
    let depth = 0;
    while (node && node.nodeType === Node.ELEMENT_NODE && depth < 6) {
      parts.unshift(describe(node));
      node = node.parentElement;
      depth++;
    }
    return parts.join(" > ");
  }

  function collectStats() {
    let persian = 0;
    let mixed = 0;
    let pinned = 0;
    decorated.forEach(function (el) {
      if (el.hasAttribute("data-pc-pinned")) pinned++;
      else if (el.classList.contains("pc-persian")) persian++;
      else if (el.classList.contains("pc-mixed")) mixed++;
    });
    return {
      blocks: decorated.size,
      persian: persian,
      mixed: mixed,
      pinnedLtr: pinned,
      root: describe(rootEl)
    };
  }

  function logStats() {
    const s = collectStats();
    console.debug(
      "[ParsiChin] active · root=" + s.root +
      " · blocks=" + s.blocks +
      " (persian=" + s.persian + ", mixed=" + s.mixed + ", pinnedLtr=" + s.pinnedLtr + ")"
    );
  }

  /**
   * Diagnostics: why is (or isn't) this page decorated?
   *
   *   copy(ParsiChin.reportJson())   // paste the JSON into a bug report
   *
   * It lists the settings, the resolved scan root, how many blocks were
   * decorated, and — most usefully — Persian-looking blocks that were NOT
   * decorated, with the reason and their DOM path.
   */
  function report() {
    const scope = rootEl || document.body;
    const suspects = [];
    const chainOf = function (el) {
      const chain = [];
      let node = el;
      let depth = 0;
      while (node && node.nodeType === Node.ELEMENT_NODE && depth < 5) {
        chain.push({
          tag: node.tagName.toLowerCase(),
          cls: String(node.className || "").slice(0, 90),
          dir: node.getAttribute("dir"),
          inlineDirection: node.style.getPropertyValue("direction") || null,
          contentEditable: node.getAttribute("contenteditable")
        });
        node = node.parentElement;
        depth++;
      }
      return chain;
    };

    if (scope) {
      scope.querySelectorAll("p, li, div, span, h1, h2, h3, h4, h5, h6, blockquote, td, th")
        .forEach(function (el) {
          if (suspects.length >= 10) return;
          if (el.closest(".pc-block, .pc-ltr, .pc-rtl")) return;
          const text = (el.textContent || "").trim();
          if (text.length < 8 || text.length > 20000) return;
          if (!bidi().hasPersian(text)) return;
          if (isRootLike(el)) return;

          let reason = "not a text block (no direct text / skipped tag)";
          if (isProtected(el)) reason = "protected (form, code or contenteditable)";
          else if (el.textContent.length > 20000 && !isTextishTag(el)) reason = "text too long for a block";
          else if (isBlockCandidate(el)) reason = "candidate that was not reached by the scan";

          suspects.push({
            tag: el.tagName.toLowerCase(),
            cls: String(el.className || "").slice(0, 90),
            dirAttr: el.getAttribute("dir"),
            reason: reason,
            sample: text.slice(0, 60),
            path: pathOf(el),
            chain: chainOf(el)
          });
        });
    }

    return {
      extension: "ParsiChin",
      version: VERSION,
      host: location.hostname,
      url: location.href.split("?")[0],
      booted: true,
      ruleId: (rules().ruleForHost(location.hostname) || {}).id || null,
      pageInScope: currentSettings ? pageInScope(currentSettings) : null,
      blockedByOverride: currentSettings ? hostBlocked(currentSettings) : null,
      settings: currentSettings,
      stats: collectStats(),
      observer: observer ? describe(observerTarget) : null,
      suspects: suspects
    };
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
      restoreState(el); // restore the site's own dir + inline styles
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
    if (!rootEl) return; // nothing to scan yet; the observer stays armed

    const pendingText = [];
    for (const mutation of mutations) {
      if (mutation.type === "characterData") {
        pendingText.push(mutation.target);
        continue;
      }
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        if (rootEl.contains(node)) {
          const parentRtl = node.parentElement && node.parentElement.closest(".pc-rtl");
          walk(node, currentSettings, !!parentRtl);
        }
      }
    }

    pendingText.forEach(function (textNode) {
      const parent = textNode.parentElement;
      if (!parent) return;
      // Only refresh inside the scan root.
      if (rootEl && !rootEl.contains(parent)) return;
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

  // Expose the diagnostics on the extension's namespace (harmless on the page,
  // and the fastest way to answer "why is my page not decorated?").
  window.ParsiChin = window.ParsiChin || {};
  window.ParsiChin.report = report;
  window.ParsiChin.reportJson = function () { return JSON.stringify(report(), null, 2); };
  window.ParsiChin.rescan = function () { walk(rootEl || document.body, currentSettings, false); };

  async function boot() {
    const settings = await window.ParsiChinSettings.get();
    applyAll(settings);

    window.ParsiChinSettings.onChange(function (next) {
      applyAll(next);
    });

    chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
      if (!message) return;
      if (message.type === "parsi-chin:apply") {
        window.ParsiChinSettings.get().then(applyAll);
        return;
      }
      if (message.type === "parsi-chin:stats") {
        sendResponse(collectStats());
        return true;
      }
    });
  }

  boot();
})();
