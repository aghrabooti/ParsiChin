/**
 * ParsiChin — real-browser RTL audit (development tool).
 *
 * Loads the extension's real content scripts + real content stylesheet into a
 * mock AI-chat page inside headless Chromium and checks, per probe, that:
 *
 *   1. BASE DIRECTION — Persian-first prose is laid out right-to-left.
 *   2. ALIGNMENT       — Persian-first prose hugs the right content edge.
 *   3. FLIP SAFETY     — English-only text (even inside a Persian-heavy
 *                        answer, e.g. DeepSeek's `.ds-markdown` container)
 *                        keeps LTR / left alignment.
 *   4. LIST MARKERS    — bullets of a Persian list sit next to the text.
 *   5. STABILITY       — one block = one direction (no per-line flip-flop).
 *   6. SAFE TARGETS    — code-only and digits-only blocks are left alone.
 *
 * How measurement works
 * ---------------------
 *  - `sen`  probes carry two `<bdi>` sentinels (Persian then Latin). `<bdi>` is
 *           ignored by the extension and bidi-isolated, so its x-position
 *           reports the paragraph base direction unambiguously:
 *               RTL block: [Latin][Persian]   (Persian sits right)
 *               LTR block: [Persian][Latin]   (Latin sits right)
 *  - `rect` probes are Latin/symbol-only single-line text; the tight text-run
 *           rect against the content box gives alignment.
 *
 * Usage:
 *   node tools/rtl-audit.js                 # human-readable tables
 *   node tools/rtl-audit.js --json          # full machine-readable report
 *   node tools/rtl-audit.js --strict        # exit 1 when any probe fails
 *   PC_CHROMIUM=/path/to/chrome node tools/rtl-audit.js
 *
 * Requires `playwright-core` (dev-only, optional) plus a Chromium/Chrome
 * binary. Without them the tool explains itself and exits 0, so it never
 * breaks the normal test flow.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(REPO, rel), "utf8");

let chromium = null;
try {
  ({ chromium } = require("playwright-core"));
} catch (e) {
  chromium = null;
}

const SCRIPTS = [
  "src/shared/defaults.js",
  "src/shared/settings.js",
  "src/content/bidi.js",
  "src/content/rules.js",
  "src/content/entry.js"
];

/* ------------------------------------------------------------------ *
 * Probe copy
 * ------------------------------------------------------------------ */
const TEXT_PERSIAN = "سلام! این یک پاسخ فارسی است و باید از سمت راست شروع شود.";
/** Persian prose that is Latin-heavy (ratio < 0.5) but still Persian-first. */
const TEXT_PERSIAN_FIRST_MIXED =
  "با React و useState و useEffect و Redux و Axios و Vite می‌توان رابط کاربری ساخت و این متن فارسی است.";
/** Persian-FIRST prose that is still Latin-heavy (ratio < 0.5). */
const TEXT_PERSIAN_FIRST_LATIN_HEAVY =
  "با React و useState و useEffect و Redux و Axios و Vite و Webpack و Prisma می‌توان رابط کاربری ساخت.";
/** Latin-only list joined by the Persian conjunction "و": must stay LTR. */
const TEXT_LATIN_LIST =
  "React و TypeScript و Vite و ESLint و Prettier و Jest و Cypress و Storybook و Tailwind و Webpack.";
const TEXT_ENGLISH = "The API returns a JSON payload with the model name.";
/** Latin-heavy line followed by a Persian line inside ONE block. */
const TEXT_ZIGZAG = TEXT_LATIN_LIST + "<br>" + TEXT_PERSIAN;

function page(siteCss, noRoot) {
  const open = noRoot ? '<div class="chat-shell"><article-shell>' : '<main class="chat"><article>';
  const close = noRoot ? '</article-shell></div>' : '</article></main>';
  return `<!DOCTYPE html><html lang="en" dir="ltr"><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; }
  body { margin: 0; font: 16px/1.6 "DejaVu Sans", Arial, sans-serif; width: 780px; }
  main { padding: 20px; }
  .markdown { direction: ltr; text-align: left; }
  p { margin: 0 0 16px; }
  ul { padding-left: 24px; margin: 0 0 16px; }
  pre { background: #f4f4f5; padding: 10px; }
  code { font-family: "DejaVu Sans Mono", monospace; }
  table { border-collapse: collapse; }
  th, td { border: 1px solid #ddd; padding: 4px 8px; }
  ${siteCss || ""}
  </style></head><body>${open}<div class="markdown prose">

  <p class="probe" id="fa-pure" data-flavor="sen" data-expect="rtl"><bdi class="s-fa">فارسی</bdi><bdi class="s-la">Z</bdi>${TEXT_PERSIAN}</p>

  <p class="probe" id="fa-persian-first-mixed" data-flavor="sen" data-expect="rtl"><bdi class="s-fa">فارسی</bdi><bdi class="s-la">Z</bdi>${TEXT_PERSIAN_FIRST_MIXED}</p>

  <p class="probe" id="fa-mixed-persian-first" data-flavor="sen" data-expect="rtl"><bdi class="s-fa">فارسی</bdi><bdi class="s-la">Z</bdi>${TEXT_PERSIAN_FIRST_LATIN_HEAVY}</p>

  <p class="probe" id="lat-list" data-flavor="sen" data-expect="ltr"><bdi class="s-fa">فارسی</bdi><bdi class="s-la">Z</bdi>${TEXT_LATIN_LIST}</p>

  <p class="probe" id="en-pure" data-flavor="rect" data-expect="ltr" data-flip-safety="1">${TEXT_ENGLISH}</p>

  <p class="probe" id="code-only" data-flavor="rect" data-expect="ltr" data-flip-safety="1"><code>"سلام" = 1;</code></p>

  <p class="probe" id="digits-only" data-flavor="rect" data-expect="ltr" data-flip-safety="1">۱۲۳۴۵۶</p>

  <p class="probe" id="zigzag" data-flavor="sen" data-expect="rtl"><bdi class="s-fa">فارسی</bdi><bdi class="s-la">Z</bdi>${TEXT_ZIGZAG}</p>

  <ul id="fa-list">
    <li class="probe" id="fa-li" data-flavor="sen" data-expect="rtl" data-marker="1"><bdi class="s-fa">فارسی</bdi><bdi class="s-la">Z</bdi>مورد اول فهرست فارسی</li>
    <li class="probe" id="fa-li-2" data-flavor="sen" data-expect="rtl" data-marker="1"><bdi class="s-fa">فارسی</bdi><bdi class="s-la">Z</bdi>مورد دوم فهرست فارسی</li>
  </ul>

  <p class="probe" id="fa-inline-en" data-flavor="sen" data-expect="rtl"><bdi class="s-fa">فارسی</bdi><bdi class="s-la">Z</bdi>این جمله فارسی است و وسط آن <code>useState</code> آمده است.</p>

  <table><tbody><tr>
    <th class="probe" id="fa-th" data-flavor="sen" data-expect="rtl"><bdi class="s-fa">فارسی</bdi><bdi class="s-la">Z</bdi>نام</th>
    <td class="probe" id="fa-td" data-flavor="sen" data-expect="rtl"><bdi class="s-fa">فارسی</bdi><bdi class="s-la">Z</bdi>مقدار فارسی</td>
  </tr></tbody></table>

  <div class="probe" id="fa-div" data-flavor="sen" data-expect="rtl"><bdi class="s-fa">فارسی</bdi><bdi class="s-la">Z</bdi>متن مستقیم داخل دایو.</div>

  <pre class="probe" id="code-fa" data-flavor="rect" data-expect="ltr"><code>// این خط توضیح فارسی است</code></pre>

  <div id="ds-markdown" class="ds-markdown">
    <div class="paragraph"><p class="probe" id="fa-ds-inner" data-flavor="sen" data-expect="rtl"><bdi class="s-fa">فارسی</bdi><bdi class="s-la">Z</bdi>پاسخ فارسی داخل کانتینر مارک‌داون.</p></div>
    <div class="paragraph"><p class="probe" id="fa-ds-inner2" data-flavor="sen" data-expect="rtl"><bdi class="s-fa">فارسی</bdi><bdi class="s-la">Z</bdi>خط دوم پاسخ فارسی در همان کانتینر مارک‌داون.</p></div>
    <p class="probe" id="en-ds-inner" data-flavor="rect" data-expect="ltr" data-flip-safety="1">${TEXT_ENGLISH}</p>
  </div>

  <p class="probe" id="fa-hostile" data-flavor="sen" data-expect="rtl" style="direction:ltr"><bdi class="s-fa">فارسی</bdi><bdi class="s-la">Z</bdi>${TEXT_PERSIAN}</p>

  </div>${close}</body></html>`;
}

/* ------------------------------------------------------------------ *
 * In-page measurement
 * ------------------------------------------------------------------ */
const MEASURE = () => {
  const rows = {};

  const rectOf = (node) => {
    const r = document.createRange();
    r.selectNodeContents(node);
    const rects = Array.from(r.getClientRects()).filter((x) => x.width > 0.5);
    if (!rects.length) return null;
    return {
      left: Math.min.apply(null, rects.map((x) => x.left)),
      right: Math.max.apply(null, rects.map((x) => x.right))
    };
  };

  for (const el of document.querySelectorAll(".probe")) {
    const cs = getComputedStyle(el);
    const box = el.getBoundingClientRect();
    const contentLeft = box.left + parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth);
    const contentRight = box.right - parseFloat(cs.paddingRight) - parseFloat(cs.borderRightWidth);
    const flavor = el.dataset.flavor;

    let base = "n/a";
    let align = "n/a";
    let lines = null;
    let marker = null;

    if (flavor === "sen") {
      const fa = el.querySelector(".s-fa");
      const la = el.querySelector(".s-la");
      if (fa && la) {
        const fr = fa.getBoundingClientRect();
        const lr = la.getBoundingClientRect();
        base = lr.left < fr.left - 1 ? "rtl" : (fr.left < lr.left - 1 ? "ltr" : "same-x");
        const gl = Math.min(fr.left, lr.left);
        const gr = Math.max(fr.right, lr.right);
        const gapL = gl - contentLeft;
        const gapR = contentRight - gr;
        align = (gapR <= 4 && gapR < gapL) ? "right" : ((gapL <= 4 && gapL < gapR) ? "left" : `indent L${Math.round(gapL)}/R${Math.round(gapR)}`);
      }
      // per-line sentinels (line 2+) when present
      const fa2 = el.querySelector(".s-fa2");
      const la2 = el.querySelector(".s-la2");
      if (fa && la && fa2 && la2) {
        lines = [
          la.getBoundingClientRect().left < fa.getBoundingClientRect().left ? "rtl" : "ltr",
          la2.getBoundingClientRect().left < fa2.getBoundingClientRect().left ? "rtl" : "ltr"
        ];
      }
      // list marker side = direction of the enclosing list container
      if (el.dataset.marker) {
        const list = el.closest("ul, ol");
        marker = list ? { side: getComputedStyle(list).direction === "rtl" ? "right" : "left" } : null;
      }
    } else {
      const run = rectOf(el);
      base = cs.direction; // single-script probe: computed direction IS the base
      if (run) {
        const gapL = run.left - contentLeft;
        const gapR = contentRight - run.right;
        align = (gapL <= 4 && gapL <= gapR) ? "left" : ((gapR <= 4 && gapR < gapL) ? "right" : `indent L${Math.round(gapL)}/R${Math.round(gapR)}`);
      }
    }

    rows[el.id] = {
      flavor,
      expect: el.dataset.expect,
      dirAttr: el.getAttribute("dir"),
      direction: cs.direction,
      textAlign: cs.textAlign,
      unicodeBidi: cs.unicodeBidi,
      inlineDirection: el.style.getPropertyValue("direction") || "-",
      inlinePriority: el.style.getPropertyPriority("direction") || "-",
      flipSafety: el.dataset.flipSafety === "1",
      classes: (el.className || "").replace(/\bprobe\b/g, "").trim(),
      base,
      align,
      lines,
      marker
    };
  }
  return rows;
};

/* ------------------------------------------------------------------ *
 * Verdicts
 * ------------------------------------------------------------------ */
function judge(row, scenario) {
  const problems = [];
  // On a natively-RTL page the site itself decides the direction of English
  // text; the extension is only required not to make things worse.
  if (row.flipSafety && scenario && scenario.nativeRtl) return problems;
  if (row.expect === "rtl") {
    if (row.base !== "rtl") problems.push(`base=${row.base}, want rtl`);
    if (row.align !== "right") problems.push(`align=${row.align}, want right`);
  } else {
    if (row.base !== "ltr") problems.push(`base=${row.base}, want ltr`);
    if (row.align !== "left") problems.push(`align=${row.align}, want left`);
  }
  if (row.lines && new Set(row.lines).size > 1) problems.push(`per-line flip-flop [${row.lines.join(",")}]`);
  if (row.marker && row.marker.side === "left" && row.base === "rtl") {
    problems.push("list marker stays left while text is rtl");
  }
  return problems;
}

/* ------------------------------------------------------------------ *
 * Scenarios
 * ------------------------------------------------------------------ */
const SCENARIOS = [
  { id: "plain", host: "chatgpt.com", siteCss: "" },
  { id: "deepseek-container", host: "chat.deepseek.com", siteCss: "" },
  { id: "missing-root", host: "chat.deepseek.com", noRoot: true },
  { id: "site-css-ltr", host: "chatgpt.com", siteCss: ".markdown, .markdown p, .markdown li, .markdown td, .markdown th, .markdown div { direction: ltr; }" },
  { id: "site-css-ltr-important", host: "chatgpt.com", siteCss: ".markdown p, .markdown li, .markdown td, .markdown th, .markdown div, .markdown code { direction: ltr !important; text-align: left !important; }" },
  { id: "native-rtl-page", host: "chatgpt.com", nativeRtl: true, siteCss: ".markdown { direction: rtl; text-align: right; }" }
];

async function run() {
  const json = process.argv.includes("--json");
  if (!chromium) {
    console.log("rtl-audit: playwright-core is not installed — skipping the browser audit.");
    console.log("           npm i -D playwright-core && npx playwright install chromium");
    return 0;
  }

  let browser;
  try {
    browser = await chromium.launch({
    executablePath: process.env.PC_CHROMIUM || undefined,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
      env: process.env
    });
  } catch (err) {
    console.log("rtl-audit: could not launch a browser — skipping.");
    console.log("           " + String(err.message).split("\n")[0]);
    console.log("           point PC_CHROMIUM at a Chrome/Chromium binary, or run:");
    console.log("           npx playwright install chromium");
    return 0;
  }

  const report = {};
  let failures = 0;
  let probes = 0;

  for (const scenario of SCENARIOS) {
    const page_ = await browser.newPage({ viewport: { width: 780, height: 1600 } });
    const errors = [];
    page_.on("pageerror", (e) => errors.push(String(e)));
    await page_.route("https://" + scenario.host + "/**", (route) =>
      route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: page(scenario.siteCss, scenario.noRoot) }));
    await page_.goto("https://" + scenario.host + "/c/rtl-audit");

    await page_.evaluate(() => {
      window.__pcSettings = {};
      window.chrome = {
        storage: {
          local: {
            get: async (k) => ({ [k]: window.__pcSettings }),
            set: async (o) => { window.__pcSettings = o.parsiChinSettings; }
          },
          onChanged: { addListener: () => {} }
        },
        runtime: { onMessage: { addListener: () => {} }, sendMessage: async () => ({}), getURL: (p) => p }
      };
    });
    await page_.addStyleTag({ content: read("styles/parsi-chin.css") });
    for (const rel of SCRIPTS) await page_.addScriptTag({ content: read(rel) });
    await page_.waitForTimeout(250);

    const rows = await page_.evaluate(MEASURE);
    const entries = Object.entries(rows).map(([id, row]) => {
      const problems = judge(row, scenario);
      probes++;
      if (problems.length) failures++;
      return Object.assign({ id }, row, { verdict: problems.length ? "FAIL — " + problems.join("; ") : "pass" });
    });
    report[scenario.id] = { host: scenario.host, entries, pageErrors: errors };
    await page_.close();
  }

  await browser.close();

  if (json) {
    console.log(JSON.stringify({ summary: { probes, failures }, scenarios: report }, null, 2));
    return failures;
  }

  for (const [id, data] of Object.entries(report)) {
    console.log(`\n===== scenario: ${id} (${data.host}) ${"=".repeat(Math.max(0, 30 - id.length))}`);
    console.table(data.entries.map((e) => ({
      probe: e.id,
      expect: e.expect,
      "dir attr": e.dirAttr || "-",
      direction: e.direction,
      textAlign: e.textAlign,
      "base dir": e.base,
      align: e.align,
      lines: e.lines ? e.lines.join("/") : "-",
      marker: e.marker ? e.marker.side : "-",
      verdict: e.verdict
    })));
    if (data.pageErrors.length) console.log("PAGE ERRORS:", data.pageErrors.join("\n"));
  }
  console.log(`\nsummary: ${probes} probes, ${failures} failing\n`);
  return failures;
}

run().then((failures) => {
  if (process.argv.includes("--strict") && failures) process.exit(1);
  process.exit(0);
}).catch((err) => { console.error("rtl-audit could not run:", err.message); process.exit(2); });
