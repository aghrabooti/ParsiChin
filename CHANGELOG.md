# Changelog

All notable changes to this project. Format loosely follows *Keep a Changelog*;
this project uses semantic versioning.

## [0.2.0] — RTL engine rewrite

Fixes every defect found by the new browser audit. With the current fixtures the v0.1.0 sources fail
**61 → 0** of 174 probes.

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

* **Reported from a real browser: on DeepSeek "the font of my message changes but the
  direction never does".** Two independent causes:
  1. *The scan root could be missing.* `resolveRoot()` only looked at the site rule's
     candidates (`main, .ds-chat, #app` for DeepSeek). DeepSeek's current build has none of
     them, so the root stayed `null`, nothing was ever scanned, and the page showed only the
     base stylesheet (font). There is now a fallback chain — rule candidates → generic
     containers (`main`, `[role=main]`, `article`, `#root`, `#app`, `.app`, `.chat`,
     `.conversation`) → `<body>` — and `<body>`/`<html>` are never decorated themselves.
     Measured with the new `missing-root` audit scenario: **13/19 probes failing before, 0
     after.**
  2. *Direction relied on the CSS class only.* A site rule with `!important` and higher
     specificity than `.pc-rtl` could still win. Decorated blocks now also get an inline
     `direction`/`text-align` with `!important` (inline `!important` beats every author rule),
     and the element's own original `dir` **and** inline values are restored on cleanup.
* **Every site, by default — no setup at all.** The wildcard host access moved from
  `optional_host_permissions` into `host_permissions` and the content script now matches `*://*/*`, so
  the extension starts fixing Persian text on any http(s) page right after installation. The extension
  stores are excluded in the manifest, and the script itself also refuses to touch
  `chrome.google.com`, `accounts.google.com`, `addons.mozilla.org` and non-HTML documents.
  `allSites: false` still limits it to the built-in list, and `siteOverrides` can exclude single hosts;
  the popup reports the state and offers to switch a host back on.
* **Cost control for unfamiliar pages.** A page whose text contains no Persian letters is skipped
  before the walk starts (checked with `textContent`, which does not force a layout pass), and every
  scan is capped at 20 000 visited elements / 3 000 decorated blocks. Running everywhere stays cheap.
* **Double-injection guard.** With the static content script matching everything, the dynamic
  registration is skipped when the wildcard is already granted, and `window.__parsiChinBooted` makes a
  second injection a no-op.
* **"Works on every site" is also a one-click flow** when the user restricts site access. Any page can be enabled from the popup:
  **Enable on this site** requests only that origin (`https://host/*`, a subset of the declared
  optional patterns) and injects the content script into the open tab immediately, so the text is
  fixed without a reload; **Enable on all sites** requests the full pattern and switches the mode on.
  Both are reflected in the options page, where a single site can be switched back off.
* **A site switched off in the options page no longer breaks the page.** `hostMatchesRule()` expected
  an array of sites but the override checks passed a single hostname, so the first `?`-off entry threw
  `sites.some is not a function` inside the content script and aborted the whole scan. It now accepts
  both shapes, strips `*.`/`www.` and lowercases, and a per-site fix now also overrides "all sites"
  mode (previously it was only honoured for hosts that had a built-in rule).
* **Guard rails for unfamiliar pages.** Walking a foreign page is budgeted: at most 20 000 visited
  elements and 3 000 decorated blocks per scan, and a page whose text contains no Persian letters at
  all is skipped before the walk starts (the observer stays attached, so Persian that arrives later is
  still handled). This keeps "all sites" mode from costing anything on Latin-only pages.
* **The live server is now a real site.** `/` is an overview page (what was broken, the numbers,
  every bundle with size and sha256, quick start), `/download/` lists every deliverable with
  checksums and absolute URLs, and the lab moved to its own page. Both pages and the lab share one
  design system (`demo/site-theme.css`), the pages are built from the working tree so they can never
  show a stale file, and `tools/pages.js` is re-read on change (no restart while editing).
* **The lab measures the reporter's own case.** The mock chat now contains the user's *sent message*
  bubble next to the assistant's answer (probes `own-message`, `own-message-2`), so "the font changes
  but my own message stays LTR" is covered by the browser lab, not just by the audit fixtures. The
  lab also gained a results filter, live score chips (scan root, decorated blocks) and a composer that
  demonstrates that the input box is deliberately never touched.
* **Diagnostics.** `ParsiChin.report()` / `ParsiChin.reportJson()` (printable from the page
  console) list the settings, the scan root that was used, how many blocks were decorated and
  — most usefully — Persian-looking blocks that were *not* decorated, with the reason and the
  DOM path of each. The popup now shows the live block count of the active tab, so
  "not running here" can be told apart from "running but found nothing".
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
