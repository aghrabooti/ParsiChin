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

  /** Common tags that can hold a sentence / paragraph of mixed text. */
  const TEXT_BLOCK_TAGS = [
    "P", "LI", "H1", "H2", "H3", "H4", "H5", "H6",
    "BLOCKQUOTE", "TD", "TH", "DD", "DT", "FIGCAPTION"
  ];

  /** Elements we must never decorate. */
  const SKIP_SELECTOR = [
    "script", "style", "noscript", "template",
    "input", "textarea", "select", "option", "button",
    "[contenteditable='true']", "[role='textbox']",
    "pre", "code", "kbd", "samp",
    "svg", "canvas", "math", "iframe", "video", "audio", "img", "picture"
  ].join(",");

  /**
   * A "text block" is any of TEXT_BLOCK_TAGS, or a DIV/SPAN that contains
   * direct text (streaming AI replies often render raw text inside divs).
   */
  function isTextBlock(el) {
    if (!(el instanceof Element)) return false;
    if (el.matches(SKIP_SELECTOR)) return false;
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

  function hostMatchesRule(hostname, sites) {
    return sites.some(function (site) {
      return hostname === site || hostname.endsWith("." + site);
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
    ruleForHost: ruleForHost,
    ruleForUrl: ruleForUrl,
    hostMatchesRule: hostMatchesRule,
    allRuleHosts: allRuleHosts
  };
})();