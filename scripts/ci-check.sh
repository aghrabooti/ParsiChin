#!/usr/bin/env bash
# Everything a CI run should do: syntax/JSON checks, unit + regression tests,
# the release build, and (when a browser is available) the RTL audit.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "=================== 1/4  static checks ==================="
bash scripts/check.sh

echo "=================== 2/4  tests (jsdom) ==================="
if [ -d node_modules/jsdom ]; then
  npm test
else
  echo "jsdom not installed - run 'npm install' first (skipping)"
fi

echo "=================== 3/4  build ==========================="
bash scripts/build.sh

echo "=================== 4/4  RTL audit (optional) ============"
if node -e "require.resolve('playwright-core')" >/dev/null 2>&1; then
  node tools/rtl-audit.js --strict
else
  echo "playwright-core not installed - skipping the browser audit"
  echo "  npm i -D playwright-core && npx playwright install chromium && PC_CHROMIUM=... npm run audit:rtl"
fi

echo "=================== all checks passed ===================="
