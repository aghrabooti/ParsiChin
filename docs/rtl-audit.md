# ParsiChin — why RTL was broken, and how it is fixed now

**Scope:** the extension's job is to make mixed Persian/English answers right-to-left
and readable. This document is the audit that explains why the RTL behaviour was
*visibly wrong* on real pages even though the unit tests were green, what changed
in v0.2.0, and how to verify it yourself in a real browser.

**Headline result** — same fixture, same Chromium build, same 95 probes:

| build | probes | failing |
| --- | --- | --- |
| v0.1.0 (`HEAD`) | 95 | **22** |
| v0.2.0 (fixed) | 95 | **0** |
| after the "font changes but not the direction" report | 114 | **0** |

The `missing-root` scenario added for that report fails **13 of 19 probes** with the code as it
was before the fix and **0** after it.

Raw reports: [`rtl-audit-before.json`](rtl-audit-before.json),
[`rtl-audit-after.json`](rtl-audit-after.json).

---

## 1. How the audit was run

jsdom (used by `npm test`) has no layout engine: it can prove that a class or a
`dir` attribute was written, but it cannot prove that Persian text *renders*
right-aligned. That is why the defects survived the test suite.

`tools/rtl-audit.js` (new in v0.2.0) loads the **real** content scripts and the
**real** stylesheet into a mock AI-chat page inside headless Chromium, in five
scenarios:

| scenario | what it simulates |
| --- | --- |
| `plain` | ordinary LTR chat page |
| `deepseek-container` | DeepSeek-style `.ds-markdown` wrapper on `chat.deepseek.com` |
| `site-css-ltr` | site hard-codes `direction: ltr` on message bodies |
| `site-css-ltr-important` | site hard-codes `direction: ltr !important` |
| `missing-root` | the rule's container does not exist (no `<main>`, no `#app`) — the shape of DeepSeek's current build |
| `native-rtl-page` | a page that is already RTL |

Each probe is measured two ways so the result cannot be argued with:

* **sentinels** — a Persian `<bdi>` followed by a Latin `<bdi>`. `<bdi>` is
  bidi-isolated and ignored by the extension, so its x-position reports the
  paragraph's base direction: `[Latin][Persian]` = RTL, `[Persian][Latin]` = LTR.
  The same pair also reports the alignment (which content edge the line hugs).
* **rect** — for Latin/symbol-only probes: the tight text-run rectangle is
  compared with the block's content box.

```bash
# with a Chromium/Chrome binary available:
PC_CHROMIUM=/path/to/chrome npm run audit:rtl          # tables
PC_CHROMIUM=/path/to/chrome node tools/rtl-audit.js --json
PC_CHROMIUM=/path/to/chrome node tools/rtl-audit.js --strict   # exit 1 on failure
```

---

## 2. Root causes (v0.1.0)

### 2.1 Direction was delegated to `dir="auto"` — the browser only looks at the FIRST strong character

`src/content/bidi.js` returned:

```js
function directionFor(kind) {
  if (kind === "persian") return "rtl";
  if (kind === "mixed") return "auto";   // ← the bug
  return null;
}
```

and `src/content/entry.js` applied it as `el.setAttribute("dir", dir)`.

`dir="auto"` is resolved by UBA rules P2/P3: **the first strong character wins**.
Persian answers constantly start with Latin tokens (`API`, `React`, `npm install`),
so a Persian block whose Latin letters happen to be ≥ 50 % of all letters was
declared "mixed", handed to `auto`, and rendered **left-to-right**.

Measured (scenario `plain`, probe `zigzag` = Latin tool list + a full Persian
sentence):

```
dirAttr="auto"  computed="ltr/start"  base=ltr  align=left     ← Persian sentence rendered LTR
```

### 2.2 `unicode-bidi: plaintext` made the layout flip per line

```css
.parsi-chin-active .pc-block.pc-mixed {
  unicode-bidi: plaintext !important;   /* ← the bug */
  text-align: start !important;
}
```

`plaintext` re-resolves the base direction *for every line* from that line's first
strong character. Inside one block, a Latin line is laid out LTR-left and the next
Persian line RTL-right — the "zig-zag" Persian readers know from badly localised
chat apps. Because the resolution depends on the first characters, the layout also
changed *while the answer was streaming in*.

### 2.3 Digits, ZWNJ, ZWJ, LRM and RLM were counted as Persian "letters"

```js
const SCRIPT_RANGES = [ [0x0600, 0x06ff], …, [0x200c, 0x200f] ];
```

Everything in those ranges counted as a letter for `persianRatio()`, so:

| text | old ratio | old verdict | correct verdict |
| --- | --- | --- | --- |
| `۱۲۳۴۵۶` | **1.00** | persian → RTL + right aligned | Latin/number block → leave alone |
| `"سلام" = 1;` | 0.57 | persian → RTL | code → leave alone |

Numbers-only blocks (table cells, statistics, timestamps) were being flipped and
right-aligned, and code wrappers were pushed to RTL.

### 2.4 Flipping only `<li>` left the bullets behind on the left

`rules.js` decorated `LI` but never `UL`/`OL`. The items became RTL + right-aligned
while the list container stayed LTR, so the markers stayed on the left edge:

```
ul(direction=ltr)  li(dir=rtl, text-align=right)   →  "•            متن فارسی"
```

Measured: `fa-li → marker side = left` in every LTR scenario.

### 2.5 RTL leaked out of decorated containers

On DeepSeek, `.ds-markdown` (see `rules.js#SITE_RULES.deepseek.blockSelectors`) is
decorated as a whole. A container classified "persian" got `direction: rtl
!important` **and** `text-align: right !important`; both are inherited, so every
English-only paragraph inside the same answer silently became RTL and right-aligned
(punctuation jumping to the left end of the line):

```
deepseek-container: en-ds-inner → computed=rtl/right, base=rtl, align=right   ← English flipped
```

### 2.6 Two smaller traps

* **Giant answers were skipped.** `entry.js` refused to decorate anything longer
  than 30 000 characters — including a single very long paragraph, which is exactly
  what long AI answers look like.
* **The `dir` attribute is only a presentational hint.** It sits at the very bottom
  of the cascade, while `mixed` blocks had no `!important` direction rule of their
  own (only `pc-persian` had one). Every other direction guarantee rested on the
  weakest mechanism available.

---

## 3. What v0.2.0 changes

| file | change |
| --- | --- |
| `src/content/bidi.js` | Real letter detection (`LETTER_RANGES`, digits/punctuation/bidi-controls excluded), `persianWordCount()` (runs of ≥ 2 Persian letters), and `classify()` now returns an explicit `direction`. Persian-dominant = `ratio ≥ 0.5` **or** `ratio ≥ 0.25` with at least one real Persian word. `directionFor("mixed")` is now a stable `"ltr"`. |
| `src/content/entry.js` | One direction per block, decided once from the whole block: `pc-rtl` / `pc-ltr` classes plus a matching `dir` attribute (never `auto`). English-only content inside an RTL block is pinned with `dir="ltr"` + `pc-ltr` (containment, no restyling). `UL`/`OL` get `pc-list`. Code-only wrappers are skipped. The 30 k guard now only skips giant *containers*, not long paragraphs. `refresh()` can now also correct a block whose direction changed while streaming. |
| `src/content/rules.js` | `UL`/`OL` added to `TEXT_BLOCK_TAGS`; new `isCodeOnly()` guard used by `isTextBlock()`. |
| `styles/parsi-chin.css` | `.pc-rtl` / `.pc-ltr` are the single source of truth with `!important` and higher specificity; `unicode-bidi: plaintext` removed; list rules move the marker indent to the inline-start edge; `[dir]`-based fallbacks kept for engines that read the attribute. |
| `tools/rtl-audit.js` | the browser audit described above (optional dev tool, never part of the shipped extension). |

Result per scenario after the fix: `plain 0`, `deepseek-container 0`,
`site-css-ltr 0`, `site-css-ltr-important 0`, `native-rtl-page 0` failing probes
(out of 95). `npm test` (jsdom) additionally covers every defect above as a
regression test.

---

## 4. Verify it in your own browser

```bash
npm run demo            # or: node tools/serve.js  → http://localhost:8080/
```

The demo lab (`/demo/`) renders a mock AI answer and runs the same measurements
in your browser. Switch between **Before fix (v0.1.0)** and **After fix (v0.2.0)**
and between a friendly and a hostile (LTR-hard-coded) page to see the difference,
with a live PASS/FAIL table under the chat.

For the extension itself:

```bash
npm test                 # jsdom unit + regression tests
npm run check            # JSON / JS syntax / required files
npm run build            # dist/parsi-chin-v0.2.0.zip
```

---

## 5. Follow-up: "the font changes but the direction never does" (DeepSeek)

Reported from a real browser and reproduced with the `missing-root` scenario. Two causes:

1. **The scan root could be absent.** `resolveRoot()` consulted only the site rule's
   candidates (`main, .ds-chat, #app` on DeepSeek). If a build has none of them — DeepSeek's
   current one does not — the root stayed `null`, `onMutations` returned early forever, and the
   only visible effect of the extension was the base stylesheet (`html.pc-font-vazirmatn body`
   …), i.e. **the font changed and nothing else**. There is now a fallback chain:

   ```
   rule candidates ("main, .ds-chat, #app")     -> narrowest with content
     else generic containers                     -> main, [role=main], article, #root,
                                                    #app, .app, .chat, .conversation
     else <body>                                 -> walked, but never decorated itself
   ```

2. **Direction rode on the class alone.** `.pc-rtl` wins against typical site CSS, but not
   against a site rule with `!important` *and* higher specificity. Decorated blocks now get
   `direction`/`text-align` **inline with `!important`**, which no author stylesheet can
   override, and the original `dir` *and* inline values are snapshotted and restored when the
   extension is disabled.

Diagnostics shipped with the fix:

```js
// in the page console
ParsiChin.reportJson()   // settings, scan root, decorated count, undecorated Persian blocks + why
```

The popup shows the decorated block count of the active tab for the same reason. The lab has a
**Container → "redesigned (no `<main>`)"** switch that reproduces the situation: the v0.1.0
snapshot scores 7/20, the fixed build 20/20 with `root=div.chat-shell.chat`.

## 6. Known limitations (unchanged by this fix)

* **Tables**: cells are flipped individually; the table's column order stays
  LTR — a fully RTL table would require reversing `<col>`/row order, which breaks
  sites that use tables for layout.
* **Shadow DOM / iframes**: content inside closed shadow roots or
  `all_frames: false` iframes is not touched (see ROADMAP phase 2).
* **Per-site roots**: `SITE_RULES.*.root` still assumes a `main`-like container;
  a site that renames it needs a new rule entry.
* **`applyMode: "always"`** styles every text block of the conversation, so
  English blocks also receive the bundled Persian font metrics.
* The audit's alignment metric needs single-line probes; multi-line Persian text
  is verified through the base-direction sentinels instead.
