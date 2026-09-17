#!/usr/bin/env bash
# Store readiness check: everything the Chrome Web Store asks for, before you upload.
#
#   bash scripts/store-check.sh
#
# Verifies the manifest, the icons and their pixel sizes, the store screenshots and
# promo tiles, the listing text limits (docs/store/listing.json) and that the runtime
# package contains no remote code.
set -uo pipefail
cd "$(dirname "$0")/.."

FAIL=0
ok()   { printf '  \033[32m✔\033[0m %s\n' "$1"; }
bad()  { printf '  \033[31m✘\033[0m %s\n' "$1"; FAIL=1; }
warn() { printf '  \033[33m!\033[0m %s\n' "$1"; }

echo "== extension package =="

PACKAGE="dist/parsi-chin-v$(node -p "require('./manifest.json').version").zip"
if [ -f "$PACKAGE" ]; then
  ok "$PACKAGE exists ($(du -h "$PACKAGE" | cut -f1))"
  UNEXPECTED="$(unzip -Z1 "$PACKAGE" | cut -d/ -f1 | sort -u | grep -v -E '^(manifest.json|_locales|assets|src|styles)$' | tr '\n' ' ')"
  [ -z "$UNEXPECTED" ] && ok "package contains runtime files only" \
    || bad "package contains files the store does not need: $UNEXPECTED"
else
  bad "$PACKAGE missing — run: bash scripts/build.sh"
fi

echo "== manifest =="

node - <<'NODE'
const fs = require("fs");
const m = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
const problems = [];
const notes = [];

if (m.manifest_version !== 3) problems.push("manifest_version must be 3");
if (!/^\d+\.\d+\.\d+$/.test(m.version)) problems.push("version must be x.y.z (store rejects a repeated version)");
if (!m.icons || !m.icons["128"]) problems.push("icons.128 is required by the store");
if (!m.default_locale) problems.push("default_locale missing (name/description use __MSG__ placeholders)");

const required = (m.permissions || []);
for (const p of required) {
  if (/urls|<all_urls>|http/i.test(p)) problems.push("required permission looks like a host pattern: " + p);
}
if (!(m.optional_host_permissions || []).length && !(m.host_permissions || []).length)
  notes.push("no host permissions at all — the built-in sites in content_scripts still work");

const matches = (m.content_scripts || []).flatMap((c) => c.matches || []);
if (matches.some((x) => /<all_urls>|\*:\/\/\*\/\*/.test(x)))
  problems.push("content_scripts matches everything — reviewers treat that as broad access");

const locales = fs.existsSync("_locales/en/messages.json");
if (!locales) problems.push("_locales/en/messages.json missing (default locale)");

console.log(problems.length
  ? problems.map((p) => "  \u001b[31m✘\u001b[0m " + p).join("\n")
  : "  \u001b[32m✔\u001b[0m manifest.json is MV3, versioned, localised and has no broad required permissions");
notes.forEach((n) => console.log("  \u001b[33m!\u001b[0m " + n));
process.exit(problems.length ? 1 : 0);
NODE
[ $? -ne 0 ] && FAIL=1

echo "== icons =="

node - <<'NODE'
const fs = require("fs");
const want = { 16: "assets/icons/icon16.png", 48: "assets/icons/icon48.png", 128: "assets/icons/icon128.png" };
const dims = (p) => {
  const b = fs.readFileSync(p);
  if (b.slice(1, 4).toString() !== "PNG") return null;
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
};
let fail = 0;
for (const [size, file] of Object.entries(want)) {
  if (!fs.existsSync(file)) { console.log(`  \u001b[31m✘\u001b[0m ${file} missing`); fail = 1; continue; }
  const d = dims(file);
  if (!d) { console.log(`  \u001b[31m✘\u001b[0m ${file} is not a PNG`); fail = 1; continue; }
  if (d[0] !== Number(size) || d[1] !== Number(size)) {
    console.log(`  \u001b[31m✘\u001b[0m ${file} is ${d[0]}×${d[1]}, expected ${size}×${size}`); fail = 1;
  } else console.log(`  \u001b[32m✔\u001b[0m ${file} is a real ${size}×${size} PNG`);
}
process.exit(fail);
NODE
[ $? -ne 0 ] && FAIL=1

echo "== store graphics =="

node - <<'NODE'
const fs = require("fs");
const dims = (p) => {
  if (!fs.existsSync(p)) return null;
  const b = fs.readFileSync(p).slice(0, 64);
  if (b.slice(1, 4).toString() !== "PNG") return null;
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
};
let fail = 0;
const screenshots = ["docs/store/store-1-chat-rtl.png", "docs/store/store-2-lab.png", "docs/store/store-3-overview.png"];
let good = 0;
for (const s of screenshots) {
  const d = dims(s);
  const valid = d && ((d[0] === 1280 && d[1] === 800) || (d[0] === 640 && d[1] === 400));
  if (valid) { good++; console.log(`  \u001b[32m✔\u001b[0m ${s} is ${d[0]}×${d[1]}`); }
  else { console.log(`  \u001b[31m✘\u001b[0m ${s} ${d ? `is ${d[0]}×${d[1]}` : "missing"} — the store wants exactly 1280×800 or 640×400`); fail = 1; }
}
if (good === 0) { console.log("  \u001b[31m✘\u001b[0m at least one screenshot 1280×800 is required"); fail = 1; }
if (good > 5) { console.log("  \u001b[31m✘\u001b[0m at most five screenshots are allowed"); fail = 1; }

const tiles = { "docs/store/promo-440x280.png": [440, 280], "docs/store/marquee-1400x560.png": [1400, 560] };
for (const [file, want] of Object.entries(tiles)) {
  const d = dims(file);
  if (!d) { console.log(`  \u001b[33m!\u001b[0m ${file} missing (optional, but it makes the listing look finished)`); continue; }
  if (d[0] === want[0] && d[1] === want[1]) console.log(`  \u001b[32m✔\u001b[0m ${file} is ${d[0]}×${d[1]}`);
  else { console.log(`  \u001b[33m!\u001b[0m ${file} is ${d[0]}×${d[1]}, expected ${want[0]}×${want[1]}`); }
}
process.exit(fail);
NODE
[ $? -ne 0 ] && FAIL=1

echo "== listing text (docs/store/listing.json) =="

node - <<'NODE'
const fs = require("fs");
const l = JSON.parse(fs.readFileSync("docs/store/listing.json", "utf8"));
let fail = 0;
const line = (label, value, limit) => {
  const len = value.length;
  const good = len > 0 && (!limit || len <= limit);
  console.log(`  ${good ? "\u001b[32m✔\u001b[0m" : "\u001b[31m✘\u001b[0m"} ${label}: ${len}${limit ? "/" + limit : ""} characters`);
  if (!good) fail = 1;
};
line("name", l.name, 45);
line("summary", l.summary, 132);
const description = Array.isArray(l.description) ? l.description.join("\n") : String(l.description);
line("description", description);
if (!l.singlePurpose) { console.log("  \u001b[31m✘\u001b[0m singlePurpose missing"); fail = 1; }
else console.log("  \u001b[32m✔\u001b[0m singlePurpose present");
const need = ["storage", "scripting", "tabs", "host_permissions (optional *://*/*)", "remote_code"];
const missing = need.filter((k) => !l.permissionJustifications || !l.permissionJustifications[k]);
if (missing.length) { console.log("  \u001b[31m✘\u001b[0m permission justification missing for: " + missing.join(", ")); fail = 1; }
else console.log("  \u001b[32m✔\u001b[0m permission justifications for storage, scripting, tabs, host access and remote code");
if (!l.dataUsage || l.dataUsage.collects_user_data !== false) {
  console.log("  \u001b[31m✘\u001b[0m dataUsage.collects_user_data should be false for this extension"); fail = 1;
} else console.log("  \u001b[32m✔\u001b[0m data usage declared as “no collection”");
process.exit(fail);
NODE
[ $? -ne 0 ] && FAIL=1

echo "== no remote code in the runtime files =="

REMOTE="$(grep -rnE "https?://[^ '\"]*\.(js|css|woff2?)" src styles 2>/dev/null | grep -vE "^\S+:\s*(\*|//|/\*)" | head -5)"
if [ -z "$REMOTE" ]; then ok "no remote script/style/font references in src/ or styles/"; else bad "remote references found:"; echo "$REMOTE"; fi
FETCH="$(grep -rnE "\b(fetch|XMLHttpRequest|importScripts|eval)\(" src 2>/dev/null | head -5)"
if [ -z "$FETCH" ]; then ok "no fetch / XHR / importScripts / eval in src/"; else bad "network or eval calls found:"; echo "$FETCH"; fi

echo
if [ "$FAIL" -eq 0 ]; then
  echo "==> the package is ready to upload: $PACKAGE"
  echo "    dashboard: https://chrome.google.com/webstore/devconsole"
  echo "    guide:     STORE.md"
else
  echo "==> fix the ✘ items above before uploading (see STORE.md)"
fi
exit "$FAIL"
