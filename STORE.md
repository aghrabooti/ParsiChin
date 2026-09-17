# Publishing ParsiChin on the Chrome Web Store

Everything you have to paste already exists in this repository:

| what | where |
| --- | --- |
| upload package | `bash scripts/build.sh` → `dist/parsi-chin-v0.2.1.zip` (only `manifest.json`, `_locales/`, `assets/icons/`, `src/`, `styles/`) |
| store icon 128×128 | `assets/icons/icon128.png` |
| screenshots 1280×800 | `docs/store/store-1-chat-rtl.png`, `store-2-lab.png`, `store-3-overview.png` |
| small promo tile 440×280 | `docs/store/promo-440x280.png` |
| marquee 1400×560 | `docs/store/marquee-1400x560.png` |
| listing text, single purpose, permission justifications | `docs/store/listing.json` |
| privacy policy | `PRIVACY.md` |
| readiness check | `bash scripts/store-check.sh` |
| regenerate the graphics later | `npm run demo` then `node tools/store-shots.js` |

## 0 · Once per developer account

1. Sign in to <https://chrome.google.com/webstore/devconsole> with the Google account that should own
   the extension.
2. Pay the **one-time $5 registration fee** (per account, not per extension).
3. Enable **2-step verification** on that Google account — publishing is blocked without it.
4. Verify the **contact email** the dashboard asks for (it is shown publicly on the listing).

## 1 · Build the upload package

```bash
bash scripts/build.sh          # → dist/parsi-chin-v0.2.1.zip
bash scripts/store-check.sh    # verifies icons, screenshots, manifest and listing limits

# need to re-shoot the store graphics after a UI change?
npm run demo &                 # start the live server
node tools/store-shots.js      # → docs/store/*.png at the exact store sizes
```

Do **not** upload the project zip (`ParsiChin-v0.2.1.zip`) — the store package must contain the
extension only. `scripts/build.sh` already produces the right file.

## 2 · Create the item and upload

1. Dashboard → **New item** → drop `dist/parsi-chin-v0.2.1.zip` → **Upload**.
2. If the upload reports an error, it lists the exact field that fails (version, icon, manifest).

## 3 · Store listing

Copy the text from `docs/store/listing.json`:

* **Name** — `ParsiChin — Mixed Persian Text Fixer` (under the 45-character limit)
* **Summary** — the `summary` field (under the 132-character limit)
* **Description** — the `description` array, one paragraph per line (no HTML)
* **Category** — *Accessibility* (alternative: *Productivity*)
* **Language** — English (add a Persian translation later from *Listing → Translations*)
* **Homepage URL** — `https://github.com/aghrabooti/ParsiChin`
* **Support URL** — `https://github.com/aghrabooti/ParsiChin/issues`
* **Graphic assets**
  * Store icon: `assets/icons/icon128.png`
  * Screenshots: the three 1280×800 files in `docs/store/` (order: chat → lab → overview)
  * Small promo tile: `docs/store/promo-440x280.png`
  * Marquee: `docs/store/marquee-1400x560.png`
  * Video: optional, skip.

## 4 · Privacy practices tab

This tab is where most extensions get rejected, so answer it carefully:

* **Single purpose** — paste `singlePurpose` from `listing.json`.
* **Permission justifications** — paste each field from `permissionJustifications` into the matching
  box. The optional `*://*/*` host permission needs the explanation that it is only requested when
  the user switches on "all sites" or adds a custom site.
* **Remote code** — answer **No**; all code and fonts are inside the package.
* **Data usage** — answer **No** to collecting personal data, and tick the boxes that you do not sell
  or use data for advertising, credit or lending. The extension makes no network requests at all.
* **Privacy policy URL** — required when an item handles user data; you declare that it does not, but
  still provide one: push this repository and use
  `https://github.com/aghrabooti/ParsiChin/blob/main/PRIVACY.md` (an `https://` URL is required).

## 5 · Distribution and submission

* **Visibility** — Public (or *Unlisted* while you test the listing).
* **Regions** — all.
* **Pricing** — free.
* **Submit for review.** First review usually takes 1–3 business days; a request for the broad
  host permission can stretch it. Answer reviewer emails from the dashboard — they block publication
  until answered.
* Use **Deferred publish** if you want to choose the release moment (e.g. right after the PR merges).

## 6 · Shipping updates

```bash
# edit the code, then bump the version — the store rejects a version that already exists
node -e "const f='manifest.json';const m=JSON.parse(require('fs').readFileSync(f));m.version='0.2.1';require('fs').writeFileSync(f,JSON.stringify(m,null,2)+'\n')"
bash scripts/build.sh
bash scripts/store-check.sh
```

Dashboard → your item → **Package → Upload new package** → *Submit for review*. The item URL and the
extension ID never change, so existing users update automatically.

## 7 · Other stores

* **Microsoft Edge Add-ons** — free, accepts the same zip
  (<https://partner.microsoft.com/dashboard/microsoftedge>).
* **Firefox (AMO)** — free, but needs a Firefox-specific manifest: replace `background.service_worker`
  with `background.scripts` (or use `browser_specific_settings`) and re-test; MV3 support in Firefox
  differs from Chrome.
* Do not upload to Opera/other stores before the Chrome listing is approved — they mirror the Chrome
  package and reviewers check the Chrome Web Store URL.

## 8 · What reviewers look at for this extension

* **Single purpose** — "make Persian text readable by fixing text direction on web pages". Keep the
  listing language narrow; do not describe it as a general translator or chat client.
* **Broad host access is now required, and must be justified.** The packument declares `*://*/*`
  because "fix text on any site" is the feature; the justification already in
  `docs/store/listing.json` explains it, the extension stores are excluded in the manifest, and no
  page content ever leaves the browser (no `fetch`, no XHR). Reviewers may still ask a follow-up —
  answer promptly, pointing at `PRIVACY.md`.
* **No remote code** — the package is self-contained; the bundled Vazirmatn fonts are in `styles/fonts/`.
* **Justified permissions** — `storage`, `scripting`, `tabs` and the *optional* `*://*/*`; the built-in
  content script matches only the ten listed AI chat hosts.
* **No data collection** — there is no `fetch`, `XMLHttpRequest` or telemetry in the runtime files
  (`scripts/store-check.sh` greps for that and fails if it finds any).
