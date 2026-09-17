/**
 * ParsiChin — regenerate the Chrome Web Store graphics from the live server.
 *
 *   npm run demo                       # in another terminal: http://localhost:8080
 *   node tools/store-shots.js          # → docs/store/*.png at the exact store sizes
 *
 * Needs playwright-core and a Chromium binary (PC_CHROMIUM=/path/to/chrome).
 * Screenshots must be exactly 1280×800 (or 640×400); promo tiles 440×280 and
 * 1400×560. The promo tiles need ImageMagick (`convert`) and the DejaVu fonts.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const BASE = process.env.BASE || "http://localhost:8080";
const OUT = path.join(__dirname, "..", "docs", "store");
const CHROME = process.env.PC_CHROMIUM || "";

function chromiumLauncher() {
  try {
    return require("playwright-core").chromium;
  } catch (e) {
    console.error("playwright-core is not installed: npm i -D playwright-core");
    process.exit(1);
  }
}

async function shoot() {
  const chromium = chromiumLauncher();
  const browser = await chromium.launch({
    executablePath: CHROME || undefined,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  fs.mkdirSync(OUT, { recursive: true });

  // 1 — the extension at work: Persian answer and the user's own message, RTL,
  //     while the page's own stylesheet forces direction: ltr !important.
  await page.goto(BASE + "/demo/chat.html?engine=after&ext=on&hostile=1&site=deepseek", { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(OUT, "store-1-chat-rtl.png") });

  // 2 — the lab: every probe measured in the browser, 22/22 with the fix.
  await page.goto(BASE + "/demo/", { waitUntil: "networkidle" });
  await page.waitForTimeout(2600);
  const score = (await page.locator("#score").innerText()).split("\n")[0];
  await page.screenshot({ path: path.join(OUT, "store-2-lab.png") });

  // 3 — the project page: what it is and what can be downloaded.
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, "store-3-overview.png") });

  await browser.close();
  return score;
}

function promo() {
  const bold = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
  const sans = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";
  if (!fs.existsSync(bold)) {
    console.log("! DejaVu fonts not found — skipping the promo tiles");
    return;
  }
  try {
    execFileSync("convert", ["-size", "440x280", "gradient:#0f766e-#0b1220",
      "-gravity", "northwest",
      "-fill", "#2dd4bf", "-font", bold, "-pointsize", "15", "-annotate", "+24+30", "CHROME EXTENSION",
      "-fill", "white", "-pointsize", "30", "-annotate", "+24+70", "ParsiChin",
      "-fill", "#cbd5e1", "-font", sans, "-pointsize", "18", "-annotate", "+24+110",
      "Persian text, right-aligned\non every AI chat page",
      path.join(OUT, "promo-440x280.png")]);
    execFileSync("convert", ["-size", "1400x560", "gradient:#0f766e-#0b1220",
      "-gravity", "northwest",
      "-fill", "#2dd4bf", "-font", bold, "-pointsize", "22", "-annotate", "+60+80", "CHROME MV3 EXTENSION · PERSIAN RTL",
      "-fill", "white", "-pointsize", "64", "-annotate", "+60+160", "ParsiChin",
      "-fill", "#cbd5e1", "-font", sans, "-pointsize", "28", "-annotate", "+60+230",
      "Mixed Persian/English answers, right-aligned\nand readable on ChatGPT, Claude, Gemini,\nDeepSeek and 6 more AI chat sites.",
      path.join(OUT, "marquee-1400x560.png")]);
  } catch (e) {
    console.log("! promo tiles skipped (ImageMagick `convert` unavailable)");
  }
}

(async function main() {
  const score = await shoot();
  promo();
  const files = fs.readdirSync(OUT).filter((f) => f.endsWith(".png")).sort();
  console.log("lab score at capture time:", score);
  console.log("written to docs/store/:", files.join(", "));
  console.log("verify with: bash scripts/store-check.sh");
})().catch((err) => {
  console.error("store screenshots failed:", err.message);
  console.error("is the server running?  npm run demo");
  process.exit(1);
});
