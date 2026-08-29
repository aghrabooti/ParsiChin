#!/usr/bin/env bash
# Build a loadable, zip-ready package into dist/.
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION="$(node -e "console.log(JSON.parse(require('fs').readFileSync('manifest.json','utf8')).version)")"
OUT="dist/parsi-chin-v${VERSION}.zip"

rm -rf dist
mkdir -p dist

zip -q -r "$OUT" \
  manifest.json \
  _locales \
  assets/icons \
  src \
  styles \
  -x "*.DS_Store" \
  -x "src/**/*.map"

echo "Built: $OUT"
unzip -l "$OUT" | tail -5
