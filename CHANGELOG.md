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

* **"All sites" mode failed with `Only permissions specified in the manifest may be
  requested`.** The options page asked for the literal `<all_urls>` pattern while
  `manifest.json` declares the wildcard host pattern, and Chrome rejects every pattern the
  manifest does not declare. It was an unhandled rejection (visible in the console), the
  permission never became granted, and both "all sites" and custom-site injection silently
  did nothing because the service worker checked the same wrong pattern. The pattern now
  lives in one place per context (`ALL_ORIGINS`), `permissions.request()` is called first in
  the gesture handler (awaiting anything else makes Chrome drop the user gesture), and the
  denial hint is no longer hidden again by an unrelated successful sync.
* **Denied-permission warning disappeared immediately.** `syncScripts()` hid the warning right
  after `ensurePermission()` had shown it; the denial state is now remembered and reported
  when the options page opens with "all sites" on but no permission.

### Added

* `tests/permissions.test.js` — reproduces the manifest/permission mismatch with a Chrome stub
  that is as strict as the real API (it rejects any undeclared origin), plus regression checks
  for the unhandled rejection, the granted path and the denied path.
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
