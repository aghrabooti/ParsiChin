/**
 * ParsiChin — bidi & Persian text helpers (pure functions, no DOM writes).
 * Loaded by: content scripts, options (for previews).
 */
(function () {
  "use strict";

  /**
   * Persian / Arabic script ranges. We treat "Persian" loosely on purpose:
   * the extension should also help with Arabic and Urdu mixed text, and the
   * bidi behavior is identical for all of them.
   */
  const SCRIPT_RANGES = [
    [0x0600, 0x06ff], // Arabic
    [0x0750, 0x077f], // Arabic Supplement
    [0x08a0, 0x08ff], // Arabic Extended-A
    [0xfb50, 0xfdff], // Arabic Presentation Forms-A
    [0xfe70, 0xfeff], // Arabic Presentation Forms-B
    [0x200c, 0x200f]  // ZWNJ / ZWJ / LRM / RLM
  ];

  function isScriptChar(code) {
    return SCRIPT_RANGES.some(function (range) {
      return code >= range[0] && code <= range[1];
    });
  }

  /** True when the string contains at least one Persian/Arabic character. */
  function hasPersian(text) {
    if (!text) return false;
    for (let i = 0; i < text.length; i++) {
      if (isScriptChar(text.charCodeAt(i))) return true;
    }
    return false;
  }

  /**
   * Ratio of Persian "letters" to all letters (digits, punctuation and
   * whitespace are ignored). Returns a number in [0, 1].
   */
  function persianRatio(text) {
    if (!text) return 0;
    let persian = 0;
    let letters = 0;
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      const isLetter =
        (code >= 0x41 && code <= 0x5a) ||   // A-Z
        (code >= 0x61 && code <= 0x7a) ||   // a-z
        isScriptChar(code);                 // Persian/Arabic
      if (!isLetter) continue;
      letters++;
      if (isScriptChar(code)) persian++;
    }
    return letters === 0 ? 0 : persian / letters;
  }

  /**
   * Classify a text:
   *  - "persian" -> overwhelmingly Persian (≥ 0.5 of letters)
   *  - "mixed"   -> has Persian but is mostly Latin
   *  - "none"    -> no Persian
   */
  function classify(text) {
    if (!hasPersian(text)) return { kind: "none", ratio: 0 };
    const ratio = persianRatio(text);
    return { kind: ratio >= 0.5 ? "persian" : "mixed", ratio: ratio };
  }

  /** True when the node has meaningful (non-whitespace) direct text. */
  function hasDirectText(node) {
    if (!node.childNodes) return false;
    for (let i = 0; i < node.childNodes.length; i++) {
      const child = node.childNodes[i];
      if (child.nodeType === Node.TEXT_NODE && child.data.trim().length > 0) {
        return true;
      }
    }
    return false;
  }

  /**
   * EXPERIMENTAL, opt-in: normalize Latin punctuation that follows a Persian
   * letter, e.g. "سلام, دنیا" -> "سلام، دنیا". Keep the change minimal and
   * reversible: only `,` -> `،` when directly after a Persian letter.
   */
  function normalizePunctuation(text) {
    if (!hasPersian(text)) return text;
    let out = "";
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      const prev = i > 0 ? text[i - 1] : "";
      if (code === 0x2c && prev && isScriptChar(prev.charCodeAt(0))) {
        out += "\u060c"; // ،
      } else {
        out += text[i];
      }
    }
    return out;
  }

  /**
   * Decide what `dir` value a block should get:
   *  - "rtl"  -> Persian-first content
   *  - "auto" -> let the browser figure it out (truly mixed content)
   *  - null   -> leave the element alone
   */
  function directionFor(kind) {
    if (kind === "persian") return "rtl";
    if (kind === "mixed") return "auto";
    return null;
  }

  window.ParsiChin = window.ParsiChin || {};
  window.ParsiChin.bidi = {
    hasPersian: hasPersian,
    persianRatio: persianRatio,
    classify: classify,
    hasDirectText: hasDirectText,
    normalizePunctuation: normalizePunctuation,
    directionFor: directionFor
  };
})();
