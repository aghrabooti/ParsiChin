# Install ParsiChin — with or without a store

## Option A · Free: load the unpacked build (no account, no fee, no review)

Works on Chrome, Edge, Brave, Vivaldi, Opera and any other Chromium browser.

1. Download the build from the live server:
   **`/dist/parsi-chin-v0.2.0.zip`** (or from GitHub Releases).
2. Unzip it anywhere permanent — for example `Documents/ParsiChin`. Do **not** delete the folder
   afterwards: the browser loads the extension from it on every start.
3. Open `chrome://extensions` (Edge: `edge://extensions`).
4. Turn on **Developer mode** (top-right).
5. Click **Load unpacked** and pick the unzipped folder — the one containing `manifest.json`.
6. Open a chat site (ChatGPT, Claude, Gemini, DeepSeek, …) and hard-reload it with
   `Ctrl/Cmd+Shift+R`. Click the toolbar icon to check: the popup reports how many text blocks were
   adjusted on that page.

### Updating

1. Download the new build zip, unzip it over the same folder (replace the files).
2. `chrome://extensions` → ParsiChin → click **⟳ Reload**.
3. Hard-reload the site you are testing on (`Ctrl/Cmd+Shift+R`) — open tabs keep the old script.

### What you give up compared to the store

| | unpacked (free) | store ($5 once) |
| --- | --- | --- |
| cost | free | $5 one-time per developer account, all your extensions |
| install | 6 manual steps | one click from the listing |
| updates | manual (re-download, reload) | automatic |
| warning | Chrome shows "Disable developer mode extensions" after a restart, and disables unpacked extensions unless you click **Keep** | none |
| reach | people you send the file to | search inside the store |

## Option B · Free: Microsoft Edge Add-ons

The Edge Add-ons store is **free** and accepts the same package
(`dist/parsi-chin-v0.2.0.zip`, produced by `bash scripts/build.sh`). One-click installs and automatic
updates for Edge users; Chrome users still need option A. Dashboard:
<https://partner.microsoft.com/dashboard/microsoftedge>.

Firefox (AMO) is also free, but needs a Firefox-specific manifest
(`background.service_worker` → `background.scripts`) and its own review.

## Option C · Chrome Web Store ($5, one time)

That is the only paid step Chrome has, it is charged **once per developer account** (not per
extension, not yearly) and it is what buys one-click installs plus automatic updates. The full
walkthrough is in [`STORE.md`](STORE.md).

## Which should you pick?

* **For yourself, friends and GitHub users** → option A. Free, immediate, identical functionality.
* **If you want one-click installs and auto-updates** → publish the same zip to Edge (free) and, if
  Chrome users matter, pay the one-time $5 for the Chrome Web Store.
* **A Chrome one-click install without paying does not exist** — Chrome only allows store listings
  and developer-mode packages; self-hosted `.crx` files are blocked on Windows and macOS.
