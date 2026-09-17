#!/usr/bin/env bash
# ParsiChin v0.2.0 — commit every changed file, in 5 logical commits.
# Run from the repository root:  bash commit-all.sh
set -e

# 1) direction engine: one direction per block, cascade-proof CSS
git add src/content/bidi.js src/content/rules.js src/content/entry.js styles/parsi-chin.css
git commit -m "fix: rtl per block"

# 2) tests: browser audit + one regression per bug
git add tools/rtl-audit.js tests/smoke.test.js
git commit -m "test: rtl audit"

# 3) live lab (mock page, v0.1.0 snapshot, static server)
git add demo tools/serve.js
git commit -m "feat: rtl lab"

# 4) docs: audit report, screenshots, English docs, commit log
git add docs README.md CONTRIBUTING.md ROADMAP.md CHANGELOG.md COMMITS.txt COMMANDS.md
git commit -m "docs: rtl report"

# 5) release: version bump, scripts, ignore rules
git add manifest.json package.json package-lock.json scripts .gitignore commit-all.sh
git commit -m "chore: v0.2.0"
