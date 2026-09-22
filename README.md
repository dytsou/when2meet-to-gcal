# when2meet → Google Calendar

Chrome extension and Tampermonkey userscript: on a [when2meet](https://www.when2meet.com) Group results page, pick a meeting duration (30 / 60 / 90 / 120 or custom), see the best **continuous full-attendance** windows highlighted on the native grid, resolve ties from a list, and open a prefilled Google Calendar event (TEMPLATE URL — no OAuth).

**License:** [GPL-3.0-or-later](./LICENSE) (copyleft — derivatives must stay open source). Declared as `@license GPL-3.0-or-later` for Greasy Fork.

## Install in Chrome

The Chrome package is Manifest V3, uses only extension-local storage for the panel preferences, and runs only on `when2meet.com` result pages.

1. Clone this repository, install pnpm 11, and with Node 24 or newer build the checked-in extension runner:

   ```bash
   pnpm install --frozen-lockfile
   pnpm run extension:build
   ```

2. Open `chrome://extensions`, turn on **Developer mode**, then click **Load unpacked**.
3. Select this repository's `extension` directory.
4. Open or reload a when2meet **Group** results page. The floating panel appears at the bottom-left by default.

After pulling a project update, rerun `pnpm run extension:build` and click the extension's **Reload** button on `chrome://extensions`. The extension's preferences stay in `chrome.storage.local`; they do not import preferences saved by a userscript manager. The `extension/LICENSE` file carries the same GPL-3.0-or-later notice as the repository.

Published GitHub Releases also include `when2meet-to-gcal-chrome-extension-vX.Y.Z.zip`; unzip it and choose its `extension` directory in the **Load unpacked** picker.

Selecting **Open Google Calendar** opens Google with a prefilled TEMPLATE URL. That explicit click sends the event title, selected times, timezone, and page URL in the new-tab request to Google; the extension itself adds no service, OAuth flow, or background network request.

## Install with Tampermonkey (alternate)

1. Install [Tampermonkey](https://www.tampermonkey.net/) (or a compatible userscript manager).
2. Open the raw script URL (Tampermonkey should prompt to install):

   https://raw.githubusercontent.com/dytsou/when2meet-to-gcal/main/when2meet-to-gcal.user.js

   Or: Tampermonkey Dashboard → Utilities → **Install from URL** → paste the same link.
3. Open a when2meet **Group** results page (specific dates). A floating panel appears (bottom-left by default).

After install, Tampermonkey checks `@updateURL` against GitHub `main`. Keep **`package.json` `version` and `// @version` in the userscript identical** (CI enforces this).

```bash
# bump package.json version, then:
pnpm run version:sync   # copy into when2meet-to-gcal.user.js
pnpm run version:check  # verify match

# FAB icon lives in src/icons/; embed into the userscript after edits:
pnpm run icons:sync
pnpm run icons:check
```

Push to `main` runs **Publish**. CI validates once, then deploys the userscript and Chrome extension as ordered release stages. Each stage uploads one asset, so a failed extension package can be retried without rebuilding or redeploying the userscript. The resulting GitHub Release contains both `when2meet-to-gcal.user.js` and the load-unpacked Chrome extension ZIP.

### Tampermonkey local hot reload (optional, for development)

1. Chrome → `chrome://extensions` → Tampermonkey → enable **Allow access to file URLs**.
2. Create a tiny stub script in Tampermonkey that only `@require`s your checkout:

```js
// ==UserScript==
// @name         Dev - when2meet → Google Calendar
// @match        https://www.when2meet.com/*
// @match        https://when2meet.com/*
// @require      file:///Users/YOU/src/when2meet-to-gcal/when2meet-to-gcal.user.js
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        unsafeWindow
// ==/UserScript==
```

3. Disable the production install while developing; refresh the when2meet page after edits.


## Usage

1. Choose duration chips or enter a custom value (snapped up to the poll’s slot step, usually 15 minutes). Effective duration is shown in the panel.
2. The selected max-score window is shown with one red frame around its full time range; heatmap colors stay visible.
3. If several windows tie, pick one from the scrollable list **or click one of its grid times**; then open Google Calendar.
4. Optional start filters (**:00** always kept): **Include :30 starts** and **Include :15 / :45 starts** (both on by default).
5. Confirm the **Preview** time (grid display zone), then **Open Google Calendar**. Save the draft in Google’s UI.

## Automated tests

```bash
pnpm test
pnpm run check
pnpm run version:check
```

CI runs the same on push/PR to `main` (Node 24). Covers continuous-overlap ranking, start-offset filtering, duration snap, extract validation, TEMPLATE URL encoding, and the Manifest V3 storage bridge/build freshness contract.
