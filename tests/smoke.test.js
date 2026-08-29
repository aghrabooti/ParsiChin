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
        <p id="nativeRtl" dir="rtl">سایتی که خودش راست‌چین است</p>
        <pre id="code">const x = "سلام";</pre>
        <textarea id="ta">سلام</textarea>
        <div id="direct">متن مستقیم داخل دایو</div>
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

  /* ---------- bidi unit checks ---------- */
  const bidi = window.ParsiChin.bidi;
  assert.strictEqual(bidi.directionFor("persian"), "rtl");
  assert.strictEqual(bidi.directionFor("mixed"), "auto");
  assert.strictEqual(bidi.directionFor("none"), null);
  assert.strictEqual(bidi.normalizePunctuation("سلام, دنیا"), "سلام، دنیا");
  assert.strictEqual(bidi.normalizePunctuation("hello, world"), "hello, world");

  /* ---------- toggle OFF ---------- */
  const full = (enabled) => Object.assign({}, store.parsiChinSettings, { enabled });
  onStorage.forEach((cb) => cb({ parsiChinSettings: { newValue: full(false) } }, "local"));
  await tick(40);
  assert.ok(!htmlEl.classList.contains("parsi-chin-active"), "html deactivated");
  assert.ok(!fa.classList.contains("pc-block"), "decorations removed");
  assert.strictEqual(nativeRtl.getAttribute("dir"), "rtl",
    "site's own dir attribute restored after disable (bug: was stripped)");
  assert.ok(!en.classList.contains("pc-block"), "english block still untouched");

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
  assert.strictEqual(md.style.getPropertyValue("direction"), "rtl",
    "inline direction set (beats site CSS)");
  assert.strictEqual(md.style.getPropertyValue("text-align"), "right",
    "inline text-align right set");
  assert.strictEqual(md.style.getPropertyPriority("direction"), "important",
    "inline direction is !important");

  const code = window.document.querySelector(".ds-markdown code");
  assert.ok(code, "code element found");
  assert.ok(!code.classList.contains("pc-block"), "code stays protected");

  console.log("✔ deepseek layout test passed — .ds-markdown container gets dir=rtl");
}

/**
 * Mostly-Latin sentence with a lot of Persian words (ratio ~0.3-0.5) must be
 * RTL too — previously it was "mixed" and stayed left-aligned.
 */
async function testMixedFarsiBlock() {
  const html = `<!DOCTYPE html><html><body><main>
    <div id="m">
      <p id="mixedFarsi">مدل زبانی با استفاده از Transformer و Attention و Fine-tuning پاسخ می‌دهد و خروجی را بهبود می‌دهد</p>
    </div>
  </main></body></html>`;

  const dom = new JSDOM(html, {
    url: "https://chat.deepseek.com/a/chat/s/1",
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

  const p = window.document.getElementById("mixedFarsi");
  assert.ok(p.classList.contains("pc-persian"), "mostly-Persian-with-English = persian now");
  assert.strictEqual(p.getAttribute("dir"), "rtl", "mixed-farsi paragraph dir=rtl");
  assert.strictEqual(p.style.getPropertyValue("direction"), "rtl", "inline rtl set");

  // cleanup must restore inline styles
  onStorage.forEach((cb) => cb({ parsiChinSettings: { newValue: { enabled: false } } }, "local"));
  await new Promise((r) => setTimeout(r, 40));
  assert.strictEqual(p.style.getPropertyValue("direction"), "", "inline direction restored on cleanup");

  console.log("✔ mixed-farsi test passed — mostly-Persian text is forced RTL");
}

(async function run() {
  await main();
  await testDeepSeekLayout();
  await testMixedFarsiBlock();
})().catch((err) => {
  console.error("✘ smoke test failed");
  console.error(err);
  process.exit(1);
});
