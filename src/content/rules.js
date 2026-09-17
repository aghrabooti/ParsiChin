/**
 * ParsiChin — per-site rules.
 *
 * Rules are intentionally data-driven and defensive. AI interfaces rename
 * their CSS classes often, so we prefer *stable structural selectors*
 * (`main`, `article`, ...) plus a content heuristic, instead of brittle
 * class names.
 *
 * To add a site:
 *  1. add an entry below,
 *  2. add its URL pattern to `content_scripts.matches` in manifest.json,
 *  3. add it to the site list in src/options/options.html,
 *  4. run `scripts/check.sh` and commit with the roadmap's "rules" commit.
 */
(function () {
  "use strict";

  /**
   * Common tags that can hold a sentence / paragraph of mixed text.
   *
   * UL/OL are included on purpose: flipping only the <li> items leaves the
   * list bullets on the left while the text jumps right, which looks broken.
   * The list *container* must be flipped too (see `pc-list` in the stylesheet).
   */
  const TEXT_BLOCK_TAGS = [
    "P", "LI", "H1", "H2", "H3", "H4", "H5", "H6",
    "BLOCKQUOTE", "TD", "TH", "DD", "DT", "FIGCAPTION", "UL", "OL"
  ];

  /** Tags whose text is always code and must never be treated as prose. */
  const CODE_TAGS = "pre, code, kbd, samp";

  /** Elements we must never decorate. */
  const SKIP_SELECTOR = [
    "script", "style", "noscript", "template",
    "input", "textarea", "select", "option", "button",
    "[contenteditable='true']", "[role='textbox']",
    "pre", "code", "kbd", "samp",
    "svg", "canvas", "math", "iframe", "video", "audio", "img", "picture"
  ].join(",");

  /**
   * True when every non-empty text node of the element lives inside
   * <pre>/<code>/<kbd>/<samp>. Wrapper elements such as
   * `<p><code>"سلام" = 1;</code></p>` used to be decorated (and flipped to
   * RTL) even though their content is code.
   */
  function isCodeOnly(el) {
    if (!(el instanceof Element) || !el.querySelector) return false;
    if (!el.querySelector(CODE_TAGS)) return false;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    let node;
    while ((node = walker.nextNode())) {
      if (!node.data.trim()) continue;
      if (!node.parentElement || !node.parentElement.closest(CODE_TAGS)) return false;
    }
    return true;
  }

  /**
   * A "text block" is any of TEXT_BLOCK_TAGS, or a DIV/SPAN that contains
   * direct text (streaming AI replies often render raw text inside divs).
   */
  function isTextBlock(el) {
    if (!(el instanceof Element)) return false;
    if (el.matches(SKIP_SELECTOR)) return false;
    if (isCodeOnly(el)) return false;
    if (TEXT_BLOCK_TAGS.indexOf(el.tagName) !== -1) return true;
    if (el.tagName === "DIV" || el.tagName === "SPAN" || el.tagName === "SECTION") {
      return window.ParsiChin.bidi.hasDirectText(el);
    }
    return false;
  }

  /**
   * Site rules.
   *  - sites: hostnames (checked with endsWith, so "chatgpt.com" also covers
   *    "www.chatgpt.com" and subdomains).
   *  - root: selector of the conversation/content container to scan. Keep it
   *    narrow for performance; `main` is the common safe choice.
   */
  const SITE_RULES = [
    {
      id: "chatgpt",
      name: "ChatGPT",
      sites: ["chatgpt.com", "chat.openai.com", "openai.com"],
      root: "main"
    },
    {
      id: "claude",
      name: "Claude",
      sites: ["claude.ai"],
      root: "main"
    },
    {
      id: "gemini",
      name: "Gemini",
      sites: ["gemini.google.com"],
      root: "main, .conversation-container, .chat-pane"
    },
    {
      id: "perplexity",
      name: "Perplexity",
      sites: ["perplexity.ai"],
      root: "main"
    },
    {
      id: "deepseek",
      name: "DeepSeek",
      sites: ["deepseek.com"],
      // DeepSeek's current SPA mounts the conversation below #app and does
      // not consistently expose a <main> or .ds-chat element. The real text
      // lives inside .ds-markdown containers (no direct text, only child
      // elements), so we treat them as blocks too (see entry.js).
      root: "main, .ds-chat, #app",
      blockSelectors: [".ds-markdown", "[class*='ds-markdown']"]
    },
    {
      id: "copilot",
      name: "Microsoft Copilot",
      sites: ["copilot.microsoft.com", "bing.com"],
      root: "main"
    },
    {
      id: "mistral",
      name: "Le Chat (Mistral)",
      sites: ["mistral.ai"],
      root: "main"
    },
    {
      id: "hf-chat",
      name: "Hugging Face Chat",
      sites: ["huggingface.co"],
      root: "main"
    }
  ];

  /**
   * Does a hostname belong to a rule / a user-added site?
   *
   * Accepts either a list of sites (as in the rules above) or a single site
   * string — callers that check a per-site override pass one key. Passing a
   * string used to throw "sites.some is not a function" and aborted the scan,
   * which made a site switched off in the options page break the whole page.
   */
  function hostMatchesRule(hostname, sites) {
    if (!hostname || !sites) return false;
    const list = Array.isArray(sites) ? sites : [sites];
    return list.some(function (site) {
      if (!site) return false;
      const clean = String(site).trim().toLowerCase().replace(/^\*?\.?/, "").replace(/^www\./, "");
      return hostname === clean || hostname.endsWith("." + clean);
    });
  }

  function ruleForHost(hostname) {
    if (!hostname) return null;
    return SITE_RULES.find(function (rule) {
      return hostMatchesRule(hostname, rule.sites);
    }) || null;
  }

  function ruleForUrl(url) {
    try {
      return ruleForHost(new URL(url).hostname);
    } catch (e) {
      return null;
    }
  }

  function allRuleHosts() {
    const set = new Set();
    SITE_RULES.forEach(function (rule) {
      rule.sites.forEach(function (site) { set.add(site); });
    });
    return Array.from(set);
  }

  window.ParsiChin = window.ParsiChin || {};
  window.ParsiChin.rules = {
    all: SITE_RULES,
    TEXT_BLOCK_TAGS: TEXT_BLOCK_TAGS,
    SKIP_SELECTOR: SKIP_SELECTOR,
    isTextBlock: isTextBlock,
    isCodeOnly: isCodeOnly,
    CODE_TAGS: CODE_TAGS,
    ruleForHost: ruleForHost,
    ruleForUrl: ruleForUrl,
    hostMatchesRule: hostMatchesRule,
    allRuleHosts: allRuleHosts
  };
})();