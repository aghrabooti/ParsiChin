/**
 * ParsiChin — bidi & Persian text helpers (pure functions, no DOM writes).
 * Loaded by: content scripts, options (for previews), tools/rtl-audit.js.
 *
 * Why this file decides direction instead of trusting `dir="auto"`
 * -----------------------------------------------------------------
 * The browser's own "auto" direction (UBA rules P2/P3) looks only at the FIRST
 * STRONG CHARACTER of a paragraph. Persian answers are full of Latin tokens
 * ("API", "React", "npm install"), so a Persian paragraph that starts with a
 * Latin token silently becomes left-to-right — the classic "ParsiChin does not
 * do RTL" complaint. It also makes the direction depend on where the answer
 * happens to start, which is unstable while the answer streams in.
 *
 * We therefore classify by CONTENT STATISTICS (Persian letters vs Latin
 * letters plus the presence of real Persian words) and hand a stable
 * `direction` to the content script.
 */
(function () {
  "use strict";

  /**
   * Persian / Arabic *letters*. Deliberately excludes digits, punctuation and
   * bidi controls that live inside the same Unicode blocks — counting
   * "۱۲۳۴۵" or a lone ZWNJ as "Persian" was a real classification bug
   * (numbers-only blocks used to be flipped to RTL).
   */
  const LETTER_RANGES = [
    [0x0620, 0x064a], // Arabic letters
    [0x066e, 0x066f],
    [0x0671, 0x06d3],
    [0x06d5, 0x06d5],
    [0x06ee, 0x06ef],
    [0x06fa, 0x06ff], // incl. Persian پ چ ژ گ ک ی inside the block above
    [0x0750, 0x077f], // Arabic Supplement
    [0x08a0, 0x08b4], // Arabic Extended-A
    [0x08b6, 0x08bd],
    [0xfb50, 0xfbc1], // Arabic Presentation Forms-A
    [0xfdf0, 0xfdfd],
    [0xfe70, 0xfefc]  // Arabic Presentation Forms-B
  ];

  /** Latin letters (including Latin-1 / Latin Extended-A). */
  const LATIN_RANGES = [
    [0x0041, 0x005a],
    [0x0061, 0x007a],
    [0x00c0, 0x024f]
  ];

  /** ZWNJ / ZWJ / LRM / RLM / ALM plus isolate/override controls. */
  const BIDI_CONTROL_RANGES = [
    [0x061c, 0x061c],
    [0x200c, 0x200f],
    [0x202a, 0x202e],
    [0x2066, 0x2069]
  ];

  function inRanges(code, ranges) {
    for (let i = 0; i < ranges.length; i++) {
      if (code >= ranges[i][0] && code <= ranges[i][1]) return true;
    }
    return false;
  }

  /** True for a Persian/Arabic letter (digits and punctuation excluded). */
  function isPersianLetter(code) {
    return inRanges(code, LETTER_RANGES);
  }

  /** True for a Latin letter. */
  function isLatinLetter(code) {
    return inRanges(code, LATIN_RANGES);
  }

  /** True for a bidi control character (ZWNJ, ZWJ, LRM, RLM, ...). */
  function isBidiControl(code) {
    return inRanges(code, BIDI_CONTROL_RANGES);
  }

  /**
   * Backwards-compatible helper: "does this code point belong to the Persian /
   * Arabic script area (letters, digits or bidi controls)".
   */
  function isScriptChar(code) {
    return isPersianLetter(code) || isBidiControl(code) ||
      // Arabic-Indic and Extended Arabic-Indic digits
      (code >= 0x0660 && code <= 0x0669) || (code >= 0x06f0 && code <= 0x06f9) ||
      code === 0x060c || code === 0x061b || code === 0x061f || code === 0x06d4 ||
      (code >= 0x066a && code <= 0x066d) || (code >= 0x0600 && code <= 0x0605);
  }

  /** True when the string contains at least one Persian/Arabic letter. */
  function hasPersian(text) {
    if (!text) return false;
    for (let i = 0; i < text.length; i++) {
      if (isPersianLetter(text.charCodeAt(i))) return true;
    }
    return false;
  }

  /**
   * Ratio of Persian letters to all letters (digits, punctuation, bidi
   * controls and whitespace are ignored). Returns a number in [0, 1].
   */
  function persianRatio(text) {
    if (!text) return 0;
    let persian = 0;
    let letters = 0;
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      if (isPersianLetter(code)) {
        persian++;
        letters++;
      } else if (isLatinLetter(code)) {
        letters++;
      }
    }
    return letters === 0 ? 0 : persian / letters;
  }

  /**
   * Number of real Persian words: runs of at least two Persian letters.
   * A lone letter — usually the conjunction "و" inside a Latin list — is not
   * treated as evidence of Persian prose.
   */
  function persianWordCount(text) {
    if (!text) return 0;
    let words = 0;
    let run = 0;
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      if (isPersianLetter(code)) {
        run++;
        continue;
      }
      // ZWNJ keeps a word together ("می‌توان"), it does not end it.
      if (code === 0x200c) continue;
      if (run >= 2) words++;
      run = 0;
    }
    if (run >= 2) words++;
    return words;
  }

  /**
   * Classify a text block.
   *
   *   "persian" -> Persian-dominant prose:  RTL, right aligned.
   *                ratio >= 0.5, or ratio >= 0.25 with at least one Persian
   *                word (Latin tokens embedded in Persian prose).
   *   "mixed"   -> Latin-dominant content with some Persian: LTR, left
   *                aligned; the bidi algorithm still renders the Persian runs
   *                correctly inside the line.
   *   "none"    -> no Persian at all.
   *
   * Returns { kind, ratio, persianWords, direction }.
   * `direction` is "rtl" | "ltr" | null and is the value the content script
   * applies (and the value the stylesheet must honour).
   */
  function classify(text) {
    if (!hasPersian(text)) {
      return { kind: "none", ratio: 0, persianWords: 0, direction: null };
    }
    const ratio = persianRatio(text);
    const persianWords = persianWordCount(text);
    const persianDominant = ratio >= 0.5 || (ratio >= 0.25 && persianWords >= 1);
    return {
      kind: persianDominant ? "persian" : "mixed",
      ratio: ratio,
      persianWords: persianWords,
      direction: persianDominant ? "rtl" : "ltr"
    };
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
      if (code === 0x2c && prev && isPersianLetter(prev.charCodeAt(0))) {
        out += "\u060c"; // ،
      } else {
        out += text[i];
      }
    }
    return out;
  }

  /**
   * Decide what `dir` value a block should get from its classification:
   *  - "rtl"  -> Persian-first content
   *  - "ltr"  -> Latin-first content that merely contains Persian words
   *  - null   -> leave the element alone
   *
   * NOTE: the extension used to return "auto" here, which handed the decision
   * to the browser's first-strong-character rule and made the layout flip
   * per line while an answer streams. Direction is now decided once, from the
   * whole block.
   */
  function directionFor(kind) {
    if (kind === "persian") return "rtl";
    if (kind === "mixed") return "ltr";
    return null;
  }

  window.ParsiChin = window.ParsiChin || {};
  window.ParsiChin.bidi = {
    hasPersian: hasPersian,
    persianRatio: persianRatio,
    persianWordCount: persianWordCount,
    classify: classify,
    hasDirectText: hasDirectText,
    normalizePunctuation: normalizePunctuation,
    directionFor: directionFor,
    isPersianLetter: isPersianLetter,
    isLatinLetter: isLatinLetter,
    isBidiControl: isBidiControl,
    isScriptChar: isScriptChar
  };
})();
