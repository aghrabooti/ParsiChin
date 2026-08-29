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

  /* ---------- cleanup on disable ---------- */
  const next = Object.assign({}, store.parsiChinSettings, { enabled: false });
  onStorage.forEach((cb) => cb({ parsiChinSettings: { newValue: next } }, "local"));
  await tick(40);
  assert.ok(!htmlEl.classList.contains("parsi-chin-active"), "html deactivated");
  assert.ok(!fa.classList.contains("pc-block"), "decorations removed");

  console.log("✔ smoke test passed — content script works in a simulated DOM");
}

main().catch((err) => {
  console.error("✘ smoke test failed");
  console.error(err);
  process.exit(1);
});
