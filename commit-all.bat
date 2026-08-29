@echo off
rem ============================================================
rem  ParsiChin - one git commit per file (Windows .bat)
rem  Put this file inside the ParsiChin project folder and run it.
rem  It commits ONLY the files that exist in the folder.
rem ============================================================
setlocal
cd /d "%~dp0"

echo.
echo  == ParsiChin: building one commit per file ==
echo  Current branch:
git branch --show-current
echo.
echo  Press any key to start (or close the window to cancel)...
pause >nul

git add .gitignore          && git commit -m "chore: ignore build output, node_modules and editor files"
git add LICENSE             && git commit -m "docs: add MIT license"
git add README.md           && git commit -m "docs: write Persian README with usage and structure"
git add manifest.json       && git commit -m "feat: add MV3 manifest with permissions and content scripts"
git add package.json        && git commit -m "chore: add npm scripts (check, build, test)"
git add package-lock.json   && git commit -m "chore: lock dev dependencies for reproducible installs"
git add _locales/en/messages.json && git commit -m "feat(i18n): add English extension strings"
git add _locales/fa/messages.json && git commit -m "feat(i18n): add Persian extension strings"
git add assets/icon-src.png      && git commit -m "feat(assets): add source icon artwork"
git add assets/icons/icon16.png  && git commit -m "feat(assets): add 16px toolbar icon"
git add assets/icons/icon48.png  && git commit -m "feat(assets): add 48px toolbar icon"
git add assets/icons/icon128.png && git commit -m "feat(assets): add 128px store icon"
git add src/shared/defaults.js   && git commit -m "feat(shared): define default settings and merge helper"
git add src/shared/settings.js   && git commit -m "feat(shared): implement chrome.storage settings API"
git add src/shared/i18n.js       && git commit -m "feat(shared): add minimal translation helper"
git add src/background/service-worker.js && git commit -m "feat(background): add service worker with badge and dynamic scripting"
git add src/content/bidi.js      && git commit -m "feat(content): detect Persian text and compute bidi direction"
git add src/content/rules.js     && git commit -m "feat(content): add per-site rules and text-block detection"
git add src/content/entry.js     && git commit -m "feat(content): decorate Persian blocks and observe streamed replies"
git add styles/parsi-chin.css    && git commit -m "feat(styles): add scoped stylesheet with Vazirmatn font"
git add styles/fonts/LICENSE-OFL.txt && git commit -m "docs(fonts): add Vazirmatn SIL OFL license"
git add styles/fonts/Vazirmatn-Regular.woff2 && git commit -m "feat(fonts): bundle Vazirmatn Regular"
git add styles/fonts/Vazirmatn-Medium.woff2  && git commit -m "feat(fonts): bundle Vazirmatn Medium"
git add styles/fonts/Vazirmatn-Bold.woff2    && git commit -m "feat(fonts): bundle Vazirmatn Bold"
git add src/popup/popup.html  && git commit -m "feat(popup): add popup markup with toggle and site status"
git add src/popup/popup.css   && git commit -m "feat(popup): style the popup panel"
git add src/popup/popup.js    && git commit -m "feat(popup): implement enable toggle and site detection"
git add src/options/options.html && git commit -m "feat(options): add settings page markup with live preview"
git add src/options/options.css  && git commit -m "feat(options): style the settings page"
git add src/options/options.js   && git commit -m "feat(options): implement settings, preview, import/export"
git add tests/smoke.test.js      && git commit -m "test: verify content script decoration in jsdom"
git add tests/ui-sanity.test.js  && git commit -m "test: verify popup and options initialization"
git add scripts/check.sh         && git commit -m "chore(scripts): add project sanity checks"
git add scripts/build.sh         && git commit -m "chore(scripts): add zip build script"
git add ROADMAP.md               && git commit -m "docs: add roadmap and phased development plan"
git add CONTRIBUTING.md          && git commit -m "docs: add contribution guidelines"
git add parsi-chin-sources.zip   && git commit -m "chore: add packaged source archive"

echo.
echo  == DONE ==
echo  Commit history created in this branch:
git log --oneline -45

echo.
echo  If everything looks right, push with:
echo      git push origin main
echo.
pause
