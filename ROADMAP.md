# ParsiChin roadmap

Suggested phases, each one a set of small, independent commits. Run `npm test` and
`npm run check` after every phase.

## Phase 0 — foundation (shipped, v0.1.0)

* `feat: scaffold MV3 extension with shared settings & service worker`
* `feat: bidi detection, per-site rules and live decoration of Persian text`
* `feat: popup with site status and full options page with live preview`
* `chore: build/check scripts, smoke tests and docs`

## Phase 1 — RTL correctness (shipped, v0.2.0)

* [x] audit the real rendering in a browser and document the root causes (`docs/rtl-audit.md`)
* [x] replace `dir="auto"` with content-based direction decided once per block
* [x] stop counting digits, ZWNJ/ZWJ and LRM/RLM as Persian "letters"
* [x] flip list containers with their items so bullets stay next to the text
* [x] pin English content inside flipped containers (DeepSeek `.ds-markdown`)
* [x] survive `direction: ltr !important` site stylesheets
* [x] process very long paragraphs (the old 30 000-character guard skipped them)
* [x] add a headless-browser audit tool and a live lab
* [ ] run the audit against the five real sites and fix site-specific selectors

## Phase 2 — robustness

- [ ] Shadow DOM traversal (ChatGPT and others moved parts of the UI into shadow roots)
- [ ] frame support (`all_frames` + per-frame roots) for embedded chat widgets
- [ ] narrow `MutationObserver` processing to batches + `requestIdleCallback` for long conversations
- [ ] RTL tables as an opt-in (reverse column order)
- [ ] per-site "report a problem" that copies the classification debug info

## Phase 3 — features

- [ ] alternative Persian fonts (Vazir, Estedad, IRANSans) selectable in settings
- [ ] ZWNJ-aware word join fix-up for Latin/Persian boundaries
- [ ] stronger punctuation normalization (؟ ! . and Persian digits) behind the experimental flag
- [ ] "user messages only" mode (user vs assistant detection)
- [ ] right-click → "ParsiChin this block" manual override

## Phase 4 — release

- [ ] Chrome Web Store listing: description, screenshots, privacy policy (no data collection)
- [ ] Firefox port (MV3/WebExtensions; `action` vs `browser` namespace differences)
- [ ] localize the popup/options UI (currently Persian-only) and the `_locales` strings
- [ ] `git tag v0.3.0 && git push --tags`, publish the build script's zip as a release artifact

## Ideas

- in-place bilingual display (Persian + English side by side) for English answers
- OCR / manual block selection
- `chrome.storage.sync` for settings
