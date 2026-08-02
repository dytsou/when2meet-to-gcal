/**
 * Google Calendar TEMPLATE URL + preview helpers.
 */

/**
 * Format epoch seconds in an IANA zone as YYYYMMDDTHHMMSS (no Z).
 */
export function formatLocalStamp(epochSec, timeZone) {
  const d = new Date(epochSec * 1000);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}${get("month")}${get("day")}T${get("hour")}${get("minute")}${get("second")}`;
}

export function formatPreviewRange(startEpoch, endEpoch, timeZone) {
  const fmt = new Intl.DateTimeFormat(undefined, {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return `${fmt.format(new Date(startEpoch * 1000))} – ${fmt.format(new Date(endEpoch * 1000))} (${timeZone})`;
}

/**
 * @param {{ title: string, startEpoch: number, endEpoch: number, timeZone: string, details?: string }} opts
 */
export function buildTemplateUrl(opts) {
  const { title, startEpoch, endEpoch, timeZone, details = "" } = opts;
  if (!timeZone) throw new Error("timeZone required");
  const dates = `${formatLocalStamp(startEpoch, timeZone)}/${formatLocalStamp(endEpoch, timeZone)}`;
  const u = new URL("https://calendar.google.com/calendar/render");
  u.searchParams.set("action", "TEMPLATE");
  u.searchParams.set("text", title);
  u.searchParams.set("dates", dates);
  u.searchParams.set("ctz", timeZone);
  if (details) u.searchParams.set("details", details);
  return u.toString();
}
