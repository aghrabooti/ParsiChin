#!/usr/bin/env bash
# Quick sanity checks: JS syntax, JSON validity, required files.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> JSON validation"
python3 - <<'PY'
import json, pathlib, sys
files = [pathlib.Path("manifest.json")] + sorted(pathlib.Path("_locales").glob("*/messages.json"))
for f in files:
    json.loads(f.read_text())
    print("ok", f)
PY

echo "==> JS syntax (node --check)"
fail=0
while IFS= read -r file; do
  node --check "$file" || fail=1
done < <(find src tests -name "*.js" | sort)
[ "$fail" -eq 0 ] && echo "all js files ok"

echo "==> Required files"
for f in \
  manifest.json \
  styles/parsi-chin.css \
  styles/fonts/Vazirmatn-Regular.woff2 \
  styles/fonts/Vazirmatn-Medium.woff2 \
  styles/fonts/Vazirmatn-Bold.woff2 \
  assets/icons/icon16.png \
  assets/icons/icon48.png \
  assets/icons/icon128.png; do
  [ -f "$f" ] || { echo "MISSING: $f"; exit 1; }
  echo "ok $f"
done

echo "==> All checks passed."
