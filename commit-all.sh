git add src/content/bidi.js src/content/rules.js src/content/entry.js styles/parsi-chin.css
git commit -m "fix(rtl): decide one direction per block from content, not dir=auto"
git add tools/rtl-audit.js tests/smoke.test.js
git commit -m "test(rtl): add a headless-browser audit and regression tests"
git add demo tools/serve.js
git commit -m "feat(demo): add the live RTL lab"
git add docs README.md CONTRIBUTING.md ROADMAP.md CHANGELOG.md COMMITS.txt COMMANDS.md
git commit -m "docs(rtl): root-cause audit, screenshots and English docs"
git add manifest.json package.json package-lock.json scripts .gitignore commit-all.sh
git commit -m "chore(release): v0.2.0"
