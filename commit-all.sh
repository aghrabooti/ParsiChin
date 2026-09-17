#!/usr/bin/env bash
# ParsiChin v0.2.0 — commit every changed file under YOUR name (6 short commits).
#
# Use it in a clone that already contains the changes as uncommitted edits, e.g.
#   git clone https://github.com/aghrabooti/ParsiChin.git && cd ParsiChin
#   git fetch origin arena/01a0b0f4-parsichin
#   git checkout -b rtl-fix origin/main
#   git checkout FETCH_HEAD -- . && git reset
#
# Then:  bash commit-all.sh  &&  git push -u origin HEAD
#
# File list verified against `git diff --name-only <base>..<head>`: every changed file, no noise.
set -e

# ---------------------------------------------------------------- your identity
# These values are written into the commits and are what GitHub shows as the
# author. Use your GitHub account email (or your @users.noreply.github.com).
git config user.name  "Your Name"
git config user.email "you@example.com"

# --------------------------------------------- 1) optional host permission fix
git add src/options/options.js src/background/service-worker.js src/shared/defaults.js manifest.json
git commit -m "fix: optional host permission"

# --------------------------------------------- 2) direction engine + CSS
git add src/content/bidi.js src/content/entry.js src/content/rules.js styles/parsi-chin.css src/popup/popup.js src/popup/popup.html src/popup/popup.css
git commit -m "fix: rtl per block"

# --------------------------------------------- 3) tests: audit + regressions
git add tests/smoke.test.js tests/ui-sanity.test.js tests/permissions.test.js tools/rtl-audit.js tools/store-shots.js
git commit -m "test: rtl audit"

# --------------------------------------------- 4) live RTL lab
git add demo/chat-boot.js demo/chat.html demo/demo-chat.css demo/demo-lab.css demo/demo-lab.js demo/index.html demo/site-theme.css demo/legacy/bidi.js demo/legacy/defaults.js demo/legacy/entry.js demo/legacy/parsi-chin.css demo/legacy/rules.js demo/legacy/settings.js tools/serve.js tools/pages.js
git commit -m "feat: rtl lab"

# --------------------------------------------- 5) docs, audit report, screenshots
git add CHANGELOG.md COMMANDS.md COMMITS.txt CONTRIBUTING.md README.md ROADMAP.md STORE.md PRIVACY.md INSTALL.md commit-all.sh docs
git commit -m "docs: rtl report"

# --------------------------------------------- 6) release v0.2.0
git add .gitignore package.json package-lock.json scripts/build.sh scripts/check.sh scripts/ci-check.sh scripts/store-check.sh
git commit -m "chore: v0.2.0"

# ------------------------------------------------- push
# git push -u origin HEAD          # then open a PR, or: git push origin HEAD:main
