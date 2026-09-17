# Contributing to ParsiChin

Thanks for helping Persian readers get readable AI answers. This file describes the
architecture rules, the direction model and the review checklist.

## Ground rules

* **No runtime dependencies.** The extension ships plain, classic scripts that attach to a
  global `window.ParsiChin` namespace. No bundler, no framework, no ESM in content scripts.
* **No network requests.** Everything (including the Vazirmatn font) is bundled. The extension must
  work fully offline and stay compatible with the Chrome Web Store privacy requirements.
* **Never break a page.** Anything the extension adds must be removable: keep the original `dir`
  attribute, never edit text content unless the user opted in, never inject inline styles that
  override site layout beyond typography and direction.
* **Small commits.** Each change should be reviewable on its own; see ROADMAP.md for the
  commit-sized phases this project uses.

## Direction model (please keep it intact)

The project learned the hard way that "just set `dir`" does not work; the reasoning is documented in
[docs/rtl-audit.md](docs/rtl-audit.md). Rules for new code:

1. **Decide direction from content statistics, never from the first character.**
   Use `window.ParsiChin.bidi.classify(text)`, which returns `{ kind, ratio, persianWords, direction }`.
2. **Never emit `dir="auto"`.** `auto` resolves per element *and* per line, which is exactly what makes
   Persian answers flip around.
3. **One direction per block.** A block is either `pc-rtl` or `pc-ltr`; if it contains content in the
   other direction, pin that child (`pc-ltr`) instead of flipping lines.
4. **Classes carry the styling.** `styles/parsi-chin.css` owns the `!important` rules; the `dir`
   attribute is a semantic companion, not the primary mechanism.
5. **Never style English-only blocks in `auto` mode** — only pin them when an ancestor was flipped.
6. **Code and forms are sacred:** `<pre>`, `<code>`, `<kbd>`, `<samp>`, inputs, textareas and
   `contenteditable` are never decorated or flipped.

## Before you open a pull request

```bash
npm test                # jsdom tests, including one regression test per fixed RTL defect
npm run check           # JSON validity, JS syntax, required files
npm run audit:rtl       # optional: real-browser audit (needs playwright-core + Chromium)
```

Checklist:

* [ ] `npm test` and `npm run check` pass.
* [ ] A new bug fix comes with a test that fails before the fix (see the `regression:` assertions in
      `tests/smoke.test.js` for the expected style).
* [ ] If you touched direction logic, run `npm run audit:rtl` (or the lab at `npm run demo`) and make
      sure the probe count of failures did not grow.
* [ ] Docs updated: `README.md` for user-visible behaviour, `docs/rtl-audit.md` for direction changes,
      `CHANGELOG.md` + `COMMITS.txt` for the change itself.
* [ ] Tested on at least one real chat site (ChatGPT/Claude/Gemini/DeepSeek) with the extension loaded
      unpacked, including streaming answers.

## Adding a site

1. `manifest.json` → add the URL pattern(s) to `content_scripts.matches`.
2. `src/content/rules.js` → add a rule with a stable `root` selector (prefer `main`, `article`,
   `[role="main"]`) and `blockSelectors` if the site wraps answers in a container without direct text
   (as DeepSeek's `.ds-markdown` does).
3. Optional: add it to the site list in `src/options/options.html` (known sites).
4. Verify with `npm run audit:rtl` (add a scenario for the host) and on the live site.

## Reporting a rendering bug

Please include: the site, the browser version, whether the block is RTL/LTR in the screenshot,
the answer text (a short sample is enough), and the output of

```js
// in the page console
[...document.querySelectorAll('.pc-block')].map(e => [e.tagName, e.dir, e.className, e.textContent.slice(0, 40)])
```

That output is usually enough to reproduce the classification decision.
