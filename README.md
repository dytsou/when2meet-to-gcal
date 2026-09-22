# when2meet → Google Calendar

Chrome extension and Tampermonkey userscript: on a [when2meet](https://www.when2meet.com) Group results page, pick a meeting duration (30 / 60 / 90 / 120 or custom), see the best **continuous full-attendance** windows highlighted on the native grid, resolve ties from a list, and open a prefilled Google Calendar event (TEMPLATE URL — no OAuth).

**License:** [GPL-3.0-or-later](./LICENSE) (copyleft — derivatives must stay open source). Declared as `@license GPL-3.0-or-later` for Greasy Fork.

## Install the latest release extension

1. Open the [latest GitHub Release](https://github.com/dytsou/when2meet-to-gcal/releases/latest).
2. Download the asset whose name starts with `when2meet-to-gcal-chrome-extension-v` and unzip it.
3. Open `chrome://extensions`, turn on **Developer mode**, then click **Load unpacked**.
4. Select the extracted `extension` directory.
5. Open or reload a when2meet **Group** results page. The floating panel appears at the bottom-left by default.

The extension follows the browser language and currently supports English and Traditional Chinese (`zh-TW`). The Tampermonkey userscript remains English.


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

## Build locally

To build the checked-in extension runner locally, clone this repository, install pnpm 11, and use Node 24 or newer:

```bash
pnpm install --frozen-lockfile
pnpm run extension:build
```

To create and validate the release ZIP locally, run `pnpm run extension:package`. It produces `when2meet-to-gcal-chrome-extension-vX.Y.Z.zip`.

After pulling a project update, rerun `pnpm run extension:build` and click the extension's **Reload** button on `chrome://extensions`. The extension's preferences stay in `chrome.storage.local`; they do not import preferences saved by a userscript manager. The `extension/LICENSE` file carries the same GPL-3.0-or-later notice as the repository.

Published GitHub Releases also include `when2meet-to-gcal-chrome-extension-vX.Y.Z.zip`; the [latest release](https://github.com/dytsou/when2meet-to-gcal/releases/latest) always contains the newest package.

Selecting **Open Google Calendar** opens Google with a prefilled TEMPLATE URL. That explicit click sends the event title, selected times, timezone, and page URL in the new-tab request to Google; the extension itself adds no service, OAuth flow, or background network request.

## Usage

1. Choose duration chips or enter a custom value (snapped up to the poll’s slot step, usually 15 minutes). Effective duration is shown in the panel.
2. The selected max-score window is shown with one red frame around its full time range; heatmap colors stay visible.
3. If several windows tie, pick one from the scrollable list **or click one of its grid times**; then open Google Calendar.
4. Optional start filters (**:00** always kept): **Include :30 starts** and **Include :15 / :45 starts** (both on by default).
5. Confirm the **Preview** time (grid display zone), then **Open Google Calendar**. Save the draft in Google’s UI.

## Automated tests

```bash
pnpm run ci:all
```

CI runs the same on push/PR to `main` (Node 24). Covers continuous-overlap ranking, start-offset filtering, duration snap, extract validation, TEMPLATE URL encoding, and the Manifest V3 storage bridge/build freshness contract.
