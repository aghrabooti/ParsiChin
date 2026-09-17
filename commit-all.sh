#!/usr/bin/env bash
# ParsiChin v0.2.0 — commit every changed file under YOUR name (5 short commits).
#
# Use it in a clone that already contains the changes as uncommitted edits.
# If your clone does not have them yet, see COMMANDS.md step 2b:
#   git fetch origin arena/01a0b0f4-parsichin
#   git checkout -b rtl-fix origin/main
#   git checkout FETCH_HEAD -- . && git reset
#
# Then:  bash commit-all.sh  &&  git push -u origin HEAD
set -e

# ---------------------------------------------------------------- your identity
# Set this BEFORE committing: these values are written into the commits and are
# what GitHub shows as the author. Use the email of your GitHub account (or the
# @users.noreply.github.com address GitHub gives you in Settings -> Emails).
git config user.name  "Your Name"
git config user.email "you@example.com"

# ------------------------------------------------- 1) direction engine + CSS
git add src/content/bidi.js src/content/entry.js src/content/rules.js styles/parsi-chin.css
git commit -m "fix: rtl per block"

# ------------------------------------------------- 2) tests: audit + regressions
git add tests/smoke.test.js tools/rtl-audit.js
git commit -m "test: rtl audit"

# ------------------------------------------------- 3) live RTL lab
git add demo/chat-boot.js demo/chat.html demo/demo-chat.css demo/demo-lab.css demo/demo-lab.js demo/index.html demo/legacy/bidi.js demo/legacy/defaults.js demo/legacy/entry.js demo/legacy/parsi-chin.css demo/legacy/rules.js demo/legacy/settings.js tools/serve.js
git commit -m "feat: rtl lab"

# ------------------------------------------------- 4) docs, audit report, screenshots
git add CHANGELOG.md COMMANDS.md COMMITS.txt CONTRIBUTING.md README.md ROADMAP.md commit-all.sh docs/img/after-v0.2.0.png docs/img/before-v0.1.0.png docs/img/lab.png docs/rtl-audit-after.json docs/rtl-audit-before.json docs/rtl-audit.md
git commit -m "docs: rtl report"

# ------------------------------------------------- 5) release v0.2.0
git add .gitignore manifest.json package-lock.json package.json scripts/build.sh scripts/check.sh scripts/ci-check.sh
git commit -m "chore: v0.2.0"

# ------------------------------------------------- push
# git push -u origin HEAD     # then open a PR, or push straight to main
