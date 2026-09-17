# Changelog

All notable changes to this project. Format loosely follows *Keep a Changelog*;
this project uses semantic versioning.

## [0.2.0] — RTL engine rewrite

Fixes every defect found by the new browser audit; the same 95-probe fixture fails **22 → 0**.

### Fixed

* **Persian paragraphs rendered left-to-right.** `dir="auto"` was resolved from the *first strong
  character*, so a Persian answer starting with a Latin token (`API …`, `React …`) became LTR.
  Direction is now computed from content statistics and applied once per block.
* **Zig-zag lines.** `unicode-bidi: plaintext` let every line pick its own direction (Latin line left,
  Persian line right) and made the layout change while an answer streamed. Removed; blocks are either
  `pc-rtl` or `pc-ltr`.
* **Numbers-only blocks flipped.** Arabic-Indic digits, ZWNJ/ZWJ, LRM/RLM and Arabic punctuation counted
  as Persian "letters" (`۱۲۳۴۵۶` had ratio 1.0). Only letters count now, and a block with no Persian is
  never touched in `auto` mode.
* **Code-only paragraphs flipped.** `<p><code>"سلام" = 1;</code></p>` was decorated and pushed to RTL;
  new `isCodeOnly()` guard and a stricter `<pre>/<code>/<kbd>/<samp>` skip.
* **List bullets left behind.** Only `<li>` was decorated, so bullets stayed on the left of right-aligned
  text. `UL`/`OL` are now flipped with their items and the marker indent moves to the inline-start edge.
* **RTL leaking out of containers.** English paragraphs inside a flipped container (DeepSeek's
  `.ds-markdown`) inherited `direction: rtl` and `text-align: right`, pushing their punctuation to the
  wrong end. They are now pinned to LTR without being restyled.
* **Site stylesheets winning the cascade.** Chat UIs that hard-code `direction: ltr` (sometimes
  `!important`) could override the extension. Direction now rides on explicit `.pc-rtl` / `.pc-ltr`
  rules with higher specificity instead of relying on the presentational `dir` attribute.
* **Long answers skipped.** The 30 000-character guard also dropped a single very long paragraph; it now
  only skips giant *containers*.
* **Direction stuck after streaming.** Re-classification could only upgrade a block; it can now correct a
  block whose direction changed while text arrived.

### Added

* `tools/rtl-audit.js` — headless-Chromium audit that loads the real content scripts and stylesheet,
  measures base direction, alignment, list markers, per-line flip-flop and direction leaks across five
  scenarios, and can run in `--json` / `--strict` mode.
* `demo/` — English RTL lab (`npm run demo`, `tools/serve.js`) that runs the same measurements in your own
  browser and can switch between the current build and the v0.1.0 snapshot (`demo/legacy/`).
* `docs/rtl-audit.md` — root-cause analysis with measurements, `docs/rtl-audit-*.json` raw reports and
  before/after screenshots.
* Regression tests for every defect above in `tests/smoke.test.js`.
* `scripts/ci-check.sh`, `COMMITS.txt` (suggested commit log), `CHANGELOG.md`.

### Changed

* `bidi.classify()` returns `{ kind, ratio, persianWords, direction }`; `directionFor("mixed")` is now
  `"ltr"` instead of `"auto"`.
* Classification threshold: Persian-dominant = `ratio ≥ 0.5` **or** `ratio ≥ 0.25` with at least one real
  Persian word (runs of ≥ 2 Persian letters, so a lone conjunction "و" does not count).
* Popup, options and docs translated to English.
* Version bumped to `0.2.0` in `manifest.json` and `package.json`.

## [0.1.0] — first public skeleton

* MV3 extension, per-site rules, content-script decoration, options page, popup, offline Vazirmatn.
