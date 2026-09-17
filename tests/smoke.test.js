/**
 * ParsiChin — smoke test (no browser needed).
 *
 * Boots the real content-script pipeline inside jsdom with a stubbed
 * chrome.* API and checks:
 *   - Persian blocks get dir=rtl / pc-block,
 *   - English-only blocks stay untouched (auto mode),
 *   - code blocks and form controls are protected,
 *   - streaming mutations get decorated,
 *   - disabling cleans up.
 *
 * Run: node tests/smoke.test.js  (or: npm test)
 */
"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("assert");
const { JSDOM } = require("jsdom");

const ROOT = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

async function main() {
  const html = `<!DOCTYPE html><html><body>
    <main>
      <div class="markdown">
        <p id="fa">سلام دنیا! این یک متن فارسی است که باید راست‌چین شود.</p>
        <p id="en">This is a purely English sentence.</p>
        <p id="mixed">این جمله با کلمه‌ی Model و Prompt ترکیب شده است.</p>
        <p id="mostlyEn">This response is mostly English, but includes words like هوش مصنوعی and مدل.</p>
        <p id="punct">سلام, دنیا</p>
        <p id="nativeRtl" dir="rtl" style="direction: rtl; text-align: right">سایتی که خودش راست‌چین است</p>
        <pre id="code">const x = "سلام";</pre>
        <textarea id="ta">سلام</textarea>
        <div id="direct">متن مستقیم داخل دایو</div>
        <p id="digits">۱۲۳۴۵۶</p>
        <p id="codeOnly"><code>"سلام" = 1;</code></p>
        <p id="latinList">React و TypeScript و Vite و ESLint و Prettier و Jest و Cypress و Storybook و Tailwind و Webpack.</p>
        <p id="latinHeavyPersian">با React و useState و useEffect و Redux و Axios و Vite و Webpack و Prisma می‌توان رابط کاربری ساخت.</p>
        <ul id="faList"><li id="faListItem">مورد اول فهرست فارسی</li></ul>
        <div id="faWrapper">این متن فارسی داخل کانتینر است.<p id="enInside">This English paragraph shares a Persian container.</p></div>
      </div>
    </main>
  </body></html>`;

  const dom = new JSDOM(html, {
    url: "https://chatgpt.com/c/123",
    runScripts: "outside-only",
    pretendToBeVisual: true
  });
  const { window } = dom;

  /* ---------- chrome.* stub ---------- */
  const onStorage = [];
  const onMessage = [];
  const store = { parsiChinSettings: {} };

  window.chrome = {
    storage: {
      local: {
        get: async (key) => ({ [key]: store.parsiChinSettings }),
        set: async (obj) => { Object.assign(store, obj); }
      },
      onChanged: { addListener: (cb) => onStorage.push(cb) }
    },
    runtime: {
      onMessage: { addListener: (cb) => onMessage.push(cb) },
      sendMessage: async () => ({ ok: true })
    }
  };

  /* ---------- load real scripts ---------- */
  const files = [
    "src/shared/defaults.js",
    "src/shared/settings.js",
    "src/content/bidi.js",
    "src/content/rules.js",
    "src/content/entry.js"
  ];
  for (const file of files) window.eval(read(file));

  const tick = (ms = 40) => new Promise((r) => setTimeout(r, ms));
  await tick(60); // let boot() finish

  const htmlEl = window.document.documentElement;
  assert.ok(htmlEl.classList.contains("parsi-chin-active"), "html should be active");

  const fa = window.document.getElementById("fa");
  assert.ok(fa.classList.contains("pc-block"), "fa paragraph decorated");
  assert.ok(fa.classList.contains("pc-persian"), "fa paragraph = persian");
  assert.strictEqual(fa.getAttribute("dir"), "rtl", "fa paragraph dir=rtl");

  const en = window.document.getElementById("en");
  assert.ok(!en.classList.contains("pc-block"), "english-only paragraph untouched");

  const mixed = window.document.getElementById("mixed");
  assert.ok(mixed.classList.contains("pc-persian"), "mostly-Persian paragraph = persian (RTL)");
  assert.strictEqual(mixed.getAttribute("dir"), "rtl", "mostly-Persian paragraph dir=rtl");

  const mostlyEn = window.document.getElementById("mostlyEn");
  assert.ok(mostlyEn.classList.contains("pc-mixed"), "mostly-English paragraph = mixed (auto)");

  const code = window.document.getElementById("code");
  assert.ok(!code.classList.contains("pc-block"), "pre never decorated");

  const ta = window.document.getElementById("ta");
  assert.ok(!ta.classList.contains("pc-block"), "textarea protected");

  const direct = window.document.getElementById("direct");
  assert.ok(direct.classList.contains("pc-block"), "div with direct text decorated");

  /* ---------- regression: the defects fixed in 0.2.0 ---------- */
  const digits = window.document.getElementById("digits");
  assert.ok(!digits.classList.contains("pc-block"),
    "regression: numbers-only block must stay untouched (digits are not Persian letters)");

  const codeOnly = window.document.getElementById("codeOnly");
  assert.ok(!codeOnly.classList.contains("pc-block") && !codeOnly.hasAttribute("dir"),
    "regression: a paragraph whose whole content is <code> must not be flipped to RTL");

  const latinList = window.document.getElementById("latinList");
  assert.strictEqual(latinList.getAttribute("dir"), "ltr",
    "regression: Latin list joined by \"و\" stays LTR (no auto flip)");

  const latinHeavy = window.document.getElementById("latinHeavyPersian");
  assert.strictEqual(latinHeavy.getAttribute("dir"), "rtl",
    "regression: Latin-heavy Persian prose is RTL, not the first-strong-char LTR");
  assert.ok(latinHeavy.classList.contains("pc-rtl"), "regression: rtl class drives the CSS");

  /* ---------- regression: direction must survive site CSS ---------- */
  const faStyle = fa.style;
  assert.strictEqual(faStyle.getPropertyValue("direction"), "rtl",
    "regression: decorated blocks carry an inline direction");
  assert.strictEqual(faStyle.getPropertyPriority("direction"), "important",
    "regression: the inline direction is !important so no site rule can win");
  assert.strictEqual(faStyle.getPropertyPriority("text-align"), "important",
    "regression: alignment is forced the same way");
  assert.strictEqual(mostlyEn.style.getPropertyValue("direction"), "ltr",
    "Latin-first blocks are forced LTR inline as well");
  assert.strictEqual(mostlyEn.style.getPropertyPriority("direction"), "important",
    "the inline LTR is !important too");

  const faList = window.document.getElementById("faList");
  assert.ok(faList.classList.contains("pc-list") && faList.classList.contains("pc-rtl"),
    "regression: the list container is flipped so bullets stay next to the text");
  assert.strictEqual(faList.getAttribute("dir"), "rtl", "Persian list container dir=rtl");
  assert.strictEqual(window.document.getElementById("faListItem").getAttribute("dir"), "rtl",
    "Persian list items are RTL too");

  const nativeRtl = window.document.getElementById("nativeRtl");
  assert.strictEqual(nativeRtl.getAttribute("dir"), "rtl", "native dir kept while enabled");

  /* ---------- streaming mutation ---------- */
  const root = window.document.querySelector("main");
  const streamed = window.document.createElement("p");
  streamed.textContent = "پاسخ جدید در حال استریم شدن است";
  root.appendChild(streamed);
  await tick(40);
  assert.ok(streamed.classList.contains("pc-block"), "streamed paragraph decorated");
  assert.strictEqual(streamed.getAttribute("dir"), "rtl", "streamed paragraph dir=rtl");

  /* ---------- containment: English inside a flipped container ---------- */
  const wrapper = window.document.getElementById("faWrapper");
  assert.ok(wrapper.classList.contains("pc-rtl"),
    "Persian container holding an English paragraph is RTL");
  const enInside = window.document.getElementById("enInside");
  assert.strictEqual(enInside.getAttribute("dir"), "ltr",
    "regression: English paragraph inside an RTL block is pinned back to LTR");
  assert.ok(enInside.classList.contains("pc-ltr"), "pinned block carries the pc-ltr class");
  assert.strictEqual(enInside.classList.contains("pc-block"), false,
    "pinned English content is not restyled (no pc-block)");

  /* ---------- bidi unit checks ---------- */
  const bidi = window.ParsiChin.bidi;
  assert.strictEqual(bidi.directionFor("persian"), "rtl");
  assert.strictEqual(bidi.directionFor("mixed"), "ltr",
    "mixed blocks get a stable direction instead of dir=auto (regression: first-strong-char flipped Persian prose to LTR)");
  assert.strictEqual(bidi.classify("۱۲۳۴۵").kind, "none",
    "Persian digits are not Persian letters (regression: numbers-only blocks were flipped)");
  assert.strictEqual(bidi.persianWordCount("React و TypeScript و Vite"), 0,
    "a lone conjunction is not evidence of Persian prose");
  assert.strictEqual(bidi.classify("با React و useState و useEffect و Redux و Axios و Vite و Webpack و Prisma می‌توان رابط کاربری ساخت.").direction, "rtl",
    "Latin-heavy but Persian-first prose must still be RTL");
  assert.strictEqual(bidi.directionFor("none"), null);
  assert.strictEqual(bidi.normalizePunctuation("سلام, دنیا"), "سلام، دنیا");
  assert.strictEqual(bidi.normalizePunctuation("hello, world"), "hello, world");

  /* ---------- long answers are still processed ---------- */
  const longP = window.document.createElement("p");
  longP.id = "longAnswer";
  longP.textContent = "این پاسخ بسیار طولانی است و باید راست‌چین شود. ".repeat(2000); // ~62k chars
  root.appendChild(longP);
  await tick(60);
  assert.strictEqual(longP.getAttribute("dir"), "rtl",
    "regression: a very long paragraph is still decorated (only giant containers are skipped)");

  /* ---------- toggle OFF ---------- */
  const full = (enabled) => Object.assign({}, store.parsiChinSettings, { enabled });
  onStorage.forEach((cb) => cb({ parsiChinSettings: { newValue: full(false) } }, "local"));
  await tick(40);
  assert.ok(!htmlEl.classList.contains("parsi-chin-active"), "html deactivated");
  assert.ok(!fa.classList.contains("pc-block"), "decorations removed");
  assert.strictEqual(nativeRtl.getAttribute("dir"), "rtl",
    "site's own dir attribute restored after disable (bug: was stripped)");
  assert.ok(!en.classList.contains("pc-block"), "english block still untouched");
  assert.strictEqual(faStyle.getPropertyValue("direction"), "",
    "inline direction removed on disable");
  assert.strictEqual(faStyle.getPropertyPriority("direction"), "",
    "inline priority removed on disable");
  const nativeInline = window.document.getElementById("nativeRtl").style;
  assert.strictEqual(nativeInline.getPropertyValue("direction"), "rtl",
    "an element the site styled itself keeps its own inline direction after cleanup");
  assert.strictEqual(nativeInline.getPropertyPriority("direction"), "",
    "…and we do not leave our !important behind on it");

  /* ---------- toggle ON again (the reported bug) ---------- */
  onStorage.forEach((cb) => cb({ parsiChinSettings: { newValue: full(true) } }, "local"));
  await tick(40);
  assert.ok(htmlEl.classList.contains("parsi-chin-active"), "re-enabled");
  assert.ok(fa.classList.contains("pc-block"), "re-decorated after re-enable");
  assert.strictEqual(fa.getAttribute("dir"), "rtl", "dir re-applied after re-enable");

  // The observer must be live again after re-enable (was: never re-scheduled).
  const streamedAfterToggle = window.document.createElement("p");
  streamedAfterToggle.textContent = "پاسخ بعد از روشن شدن دوباره";
  root.appendChild(streamedAfterToggle);
  await tick(40);
  assert.ok(streamedAfterToggle.classList.contains("pc-block"),
    "streaming observer works again after re-enable");

  console.log("✔ smoke test passed — content script works in a simulated DOM");
}

/**
 * DeepSeek-like layout: assistant messages are <div class="ds-markdown">
 * with NO direct text (only child p/div elements), mounted under #app.
 * The markdown container itself must still get dir=rtl.
 */
async function testDeepSeekLayout() {
  const html = `<!DOCTYPE html><html><body>
    <div id="app">
      <div class="chat-container">
        <div class="ds-markdown">
          <div class="paragraph">
            <p>پاسخ دیپ‌سیک به زبان فارسی با مثال و کد</p>
          </div>
          <pre><code>print("سلام")</code></pre>
        </div>
      </div>
    </div>
  </body></html>`;

  const dom = new JSDOM(html, {
    url: "https://chat.deepseek.com/a/chat/s/123",
    runScripts: "outside-only",
    pretendToBeVisual: true
  });
  const { window } = dom;
  const store = {};
  const onStorage = [];
  window.chrome = {
    storage: {
      local: {
        get: async (k) => ({ [k]: store.parsiChinSettings }),
        set: async (o) => { Object.assign(store, o); }
      },
      onChanged: { addListener: (cb) => onStorage.push(cb) }
    },
    runtime: { onMessage: { addListener: () => {} }, sendMessage: async () => ({}) }
  };
  for (const f of ["src/shared/defaults.js", "src/shared/settings.js", "src/content/bidi.js", "src/content/rules.js", "src/content/entry.js"]) {
    window.eval(read(f));
  }
  await new Promise((r) => setTimeout(r, 80));

  const md = window.document.querySelector(".ds-markdown");
  assert.ok(md, "ds-markdown found");
  assert.ok(md.classList.contains("pc-block"), "markdown container decorated");
  assert.ok(md.classList.contains("pc-persian"), "markdown container = persian");
  assert.strictEqual(md.getAttribute("dir"), "rtl", "markdown container dir=rtl (direction fix)");

  const code = window.document.querySelector(".ds-markdown code");
  assert.ok(code, "code element found");
  assert.ok(!code.classList.contains("pc-block"), "code stays protected");

  console.log("✔ deepseek layout test passed — .ds-markdown container gets dir=rtl");
}

/**
 * DeepSeek-like SPA whose rule root ("main, .ds-chat, #app") does NOT exist in
 * the DOM — the case reported from a real browser: the base stylesheet applied
 * (font changed) but nothing was ever decorated, so the direction never changed.
 */
async function testUnknownRoot() {
  const html = `<!DOCTYPE html><html><body>
    <div class="chat-shell">
      <div class="message">
        <div class="ds-markdown"><p id="md">سلام! این پاسخ فارسی است و باید راست‌چین شود.</p></div>
      </div>
      <div class="composer"><textarea id="box">پیام من</textarea></div>
    </div>
  </body></html>`;

  const dom = new JSDOM(html, {
    url: "https://chat.deepseek.com/a/chat/s/999",
    runScripts: "outside-only",
    pretendToBeVisual: true
  });
  const { window } = dom;
  const store = {};
  window.chrome = {
    storage: {
      local: {
        get: async (k) => ({ [k]: store.parsiChinSettings }),
        set: async (o) => { Object.assign(store, o); }
      },
      onChanged: { addListener: () => {} }
    },
    runtime: {
      onMessage: { addListener: () => {} },
      sendMessage: async () => ({}),
      getManifest: () => ({ version: "0.2.0" })
    }
  };
  for (const f of ["src/shared/defaults.js", "src/shared/settings.js", "src/content/bidi.js", "src/content/rules.js", "src/content/entry.js"]) {
    window.eval(read(f));
  }
  await new Promise((r) => setTimeout(r, 90));

  const md = window.document.getElementById("md");
  assert.ok(md.classList.contains("pc-block"),
    "regression: without the rule root, the scan falls back and still decorates");
  assert.strictEqual(md.getAttribute("dir"), "rtl", "fallback scan sets dir=rtl");
  assert.strictEqual(md.style.getPropertyValue("direction"), "rtl",
    "fallback scan forces the inline direction");
  assert.strictEqual(md.style.getPropertyPriority("direction"), "important",
    "…with !important, so a site stylesheet cannot override it");

  const box = window.document.getElementById("box");
  assert.ok(!box.classList.contains("pc-block"), "the composer stays untouched");

  /* diagnostics must explain the page */
  const report = window.ParsiChin.report();
  assert.strictEqual(report.host, "chat.deepseek.com", "report knows the host");
  assert.strictEqual(report.ruleId, "deepseek", "report knows the site rule");
  assert.ok(report.stats.blocks >= 1, "report counts the decorated blocks");
  assert.ok(typeof report.stats.root === "string" && report.stats.root.length > 0,
    "report names the scan root that was used");
  assert.ok(Array.isArray(report.suspects), "report lists undecorated Persian blocks");
  JSON.parse(window.ParsiChin.reportJson()); // must be valid JSON for bug reports

  console.log("✔ unknown-root test passed — fallback scan decorates and reports");
}


/**
 * "Works on every site": a host that is NOT in rules.js, with the "all sites"
 * setting on. The extension must decorate Persian blocks, leave a purely
 * English page alone, and respect a per-site override.
 */
async function testAllSites() {
  async function boot(overrides, html, url) {
    const dom = new JSDOM(html, {
      url: url || "https://example.org/notes",
      runScripts: "outside-only",
      pretendToBeVisual: true
    });
    const { window } = dom;
    const store = { parsiChinSettings: Object.assign({
      enabled: true, applyMode: "auto", fontFamily: "system", fontSize: 100
    }, overrides) };
    window.chrome = {
      storage: {
        local: {
          get: async () => ({ parsiChinSettings: store.parsiChinSettings }),
          set: async (o) => { Object.assign(store, o); }
        },
        onChanged: { addListener: () => {} }
      },
      runtime: {
        onMessage: { addListener: () => {} },
        sendMessage: async () => ({}),
        getManifest: () => ({ version: "0.2.0" })
      }
    };
    for (const f of ["src/shared/defaults.js", "src/shared/settings.js", "src/content/bidi.js", "src/content/rules.js", "src/content/entry.js"]) {
      window.eval(read(f));
    }
    await new Promise((r) => setTimeout(r, 90));
    return window;
  }

  const persianPage = `<!DOCTYPE html><html><body>
    <div class="article">
      <h1 id="title">نکته‌های کار با React</h1>
      <p id="body">این یک پاراگراف فارسی است که باید از سمت راست خوانده شود.</p>
      <p id="english">The build pipeline runs on CI.</p>
    </div>
  </body></html>`;

  /* 1 — an unknown host with "all sites" on gets decorated, no rule needed. */
  let win = await boot({ allSites: true }, persianPage);
  assert.strictEqual(win.document.getElementById("title").getAttribute("dir"), "rtl",
    "all sites: Persian heading on an unknown host is right-to-left");
  assert.strictEqual(win.document.getElementById("body").style.getPropertyPriority("direction"), "important",
    "all sites: the forced inline direction is applied there too");
  assert.ok(!win.document.getElementById("english").classList.contains("pc-rtl"),
    "all sites: the English paragraph is not flipped");
  const report = win.ParsiChin.report();
  assert.strictEqual(report.pageInScope, true, "all sites: the page reports itself in scope");
  assert.ok(report.stats.blocks >= 2, "all sites: blocks are counted");

  /* 1b — with NO stored settings at all (fresh install) the default covers it too. */
  const fresh = await boot({}, persianPage);
  assert.strictEqual(fresh.document.getElementById("title").getAttribute("dir"), "rtl",
    "a fresh install decorates an unknown host without any user action");
  assert.strictEqual(fresh.ParsiChin.report().settings.allSites, true,
    "the default for 'all sites' is on");

  /* 1c — the same page with an explicit allSites:false stays untouched. */
  win = await boot({ allSites: false }, persianPage);
  assert.strictEqual(win.document.getElementById("title").getAttribute("dir"), null,
    "allSites:false limits the extension to the built-in list again");

  /* 2 — the same page with "all sites" off stays untouched. */
  win = await boot({ allSites: false }, persianPage);
  assert.strictEqual(win.document.getElementById("title").getAttribute("dir"), null,
    "all sites off: an unknown host is left alone");
  assert.strictEqual(win.ParsiChin.report().stats.blocks, 0, "all sites off: nothing decorated");

  /* 3 — a per-site override wins over "all sites". */
  win = await boot({ allSites: true, siteOverrides: { "example.org": false } }, persianPage);
  assert.strictEqual(win.document.getElementById("title").getAttribute("dir"), null,
    "an explicit per-site off-switch wins over all sites mode");
  assert.strictEqual(win.ParsiChin.report().blockedByOverride, true, "the report names the override");

  /* 4 — a page with no Persian at all is skipped quickly and left alone. */
  const englishPage = `<!DOCTYPE html><html><body>
    <main><h1>Release notes</h1><p>The API returns JSON.</p><p>Build 42 shipped.</p></main>
  </body></html>`;
  win = await boot({ allSites: true }, englishPage);
  assert.strictEqual(win.ParsiChin.report().stats.blocks, 0,
    "a purely English page on an unknown host is left untouched");

  /* 5 — documents we must never touch (the extension stores, PDFs, XML). */
  const store = await boot({}, `<!DOCTYPE html><html><body>
    <p>ParsiChin — افزودن به کروم</p></body></html>`, "https://chromewebstore.google.com/detail/x");
  assert.strictEqual(store.document.querySelector("p").getAttribute("dir"), null,
    "the Chrome Web Store is never decorated");
  assert.strictEqual(store.ParsiChinSkipped, true, "the store page is marked as skipped");

  /* 6 — the guard must not fire on ordinary pages. */
  const normal = await boot({}, `<!DOCTYPE html><html><body><p id="t">سلام</p></body></html>`, "https://example.net/feed");
  assert.strictEqual(normal.ParsiChinSkipped, undefined, "a normal page is not marked as skipped");
  assert.strictEqual(normal.document.getElementById("t").getAttribute("dir"), "rtl",
    "and it is decorated as usual");

  console.log("✔ all-sites test passed — unknown hosts work, English pages stay untouched");
}

(async function run() {
  await main();
  await testDeepSeekLayout();
  await testUnknownRoot();
  await testAllSites();
})().catch((err) => {
  console.error("✘ smoke test failed");
  console.error(err);
  process.exit(1);
});