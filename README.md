# when2meet → Google Calendar

Tampermonkey userscript: on a [when2meet](https://www.when2meet.com) Group results page, pick a meeting duration (30 / 60 / 90 / 120 or custom), see the best **continuous full-attendance** windows highlighted on the native grid, resolve ties from a list, and open a prefilled Google Calendar event (TEMPLATE URL — no OAuth).

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/) (or a compatible userscript manager).
2. Create a new script and paste the contents of [`when2meet-to-gcal.user.js`](./when2meet-to-gcal.user.js), **or** use Tampermonkey → Utilities → “Install from URL” / open the raw file if you host it.
3. Ensure `@match` covers `https://www.when2meet.com/*`.
4. Open a when2meet **Group** results page (specific dates). A panel appears above the grid.

## Usage

1. Choose duration chips or enter a custom value (snapped up to the poll’s slot step, usually 15 minutes). Effective duration is shown in the panel.
2. Max-score windows are outlined on the Group grid (Intersector-style paint; heatmap colors stay visible).
3. If several windows tie, pick one from the list **or click a highlighted grid band**; then open Google Calendar.
4. Confirm the **Preview** time (grid display zone), then **Open Google Calendar**. Save the draft in Google’s UI.

## Automated tests

```bash
npm test
npm run check
```

CI runs the same on push/PR to `main` (Node 20 and 22). Covers continuous-overlap ranking, tie thinning, duration snap, extract validation, and TEMPLATE URL encoding.
