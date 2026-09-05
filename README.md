# when2meet → Google Calendar

Tampermonkey userscript: on a [when2meet](https://www.when2meet.com) Group results page, pick a meeting duration (30 / 60 / 90 / 120 or custom), see the best **continuous full-attendance** windows highlighted on the native grid, resolve ties from a list, and open a prefilled Google Calendar event (TEMPLATE URL — no OAuth).

**License:** [GPL-3.0-or-later](./LICENSE) (copyleft — derivatives must stay open source). Declared as `@license GPL-3.0-or-later` for Greasy Fork.

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/) (or a compatible userscript manager).
2. Open the raw script URL (Tampermonkey should prompt to install):

   https://raw.githubusercontent.com/dytsou/when2meet-to-gcal/main/when2meet-to-gcal.user.js

   Or: Tampermonkey Dashboard → Utilities → **Install from URL** → paste the same link.
3. Open a when2meet **Group** results page (specific dates). A floating panel appears (bottom-left by default).

After install, Tampermonkey checks `@updateURL` against GitHub `main`. Keep **`package.json` `version` and `// @version` in the userscript identical** (CI enforces this).

```bash
# bump package.json version, then:
npm run version:sync   # copy into when2meet-to-gcal.user.js
npm run version:check  # verify match

# FAB icon lives in src/icons/; embed into the userscript after edits:
npm run icons:sync
npm run icons:check
```

Push to `main` runs **Publish**: if tag `vX.Y.Z` does not exist yet, it creates a GitHub Release with `when2meet-to-gcal.user.js` attached.

### Local hot reload (optional, for development)

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
npm test
npm run check
```

CI runs the same on push/PR to `main` (Node 24). Covers continuous-overlap ranking, start-offset filtering, duration snap, extract validation, and TEMPLATE URL encoding.
