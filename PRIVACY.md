# ParsiChin — Privacy Policy

_Last updated: 2026-09-18 · applies to the ParsiChin browser extension (version 0.2.1 and later)._

## Short version

ParsiChin collects nothing. It has no servers, no analytics and no network requests. Everything it
does happens inside your browser.

## What the extension does with your pages

ParsiChin reads the **text that is already rendered in the page** to decide the direction of each text
block (right-to-left for Persian, left-to-right for Latin text) and to apply a font to that text. This
happens locally, in the tab you are looking at. The page content is never copied, stored, logged or
transmitted.

## What is stored

Only your own settings are stored, using the browser's local extension storage
(`chrome.storage.local`) on your device:

* whether the extension is enabled,
* the chosen font and font size,
* the apply mode,
* the list of sites you enabled or disabled,

These settings stay on your device. Uninstalling the extension removes them. They are not backed up to
us, because there is no "us" to send them to.

## Permissions and why they exist

| permission | why |
| --- | --- |
| `storage` | save the settings listed above |
| `scripting` | run the text-direction logic on sites you enable yourself (custom sites, "all sites" mode) |
| `tabs` | read the active tab's URL so the popup can show whether the extension is active there and how many text blocks it adjusted |
| optional `*://*/*` host access | requested **only** when you switch on "all sites" or add a custom site, because the extension cannot adjust text on a page it is not allowed to run on |

The extension ships with a fixed list of supported AI chat sites; those are the only pages it touches
unless you explicitly enable more.

## Data we do not collect

No personal data, no browsing history, no page content, no analytics, no crash reports, no advertising
identifiers, no location. Nothing is sold or shared, because nothing is collected.

## Remote code

All JavaScript, CSS and fonts are contained in the published package. The extension does not download
or execute remote code.

## Third parties

There are none. The extension talks to no service, including ours.

## Changes

If a future version ever changes anything above, this document will be updated and the change will be
noted in `CHANGELOG.md` before release.

## Contact

Open an issue at <https://github.com/aghrabooti/ParsiChin/issues>.
