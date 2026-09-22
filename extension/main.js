// Generated from when2meet-to-gcal.user.js; do not edit directly.
// SPDX-License-Identifier: GPL-3.0-or-later

// SPDX-License-Identifier: GPL-3.0-or-later
// This file runs in the page's MAIN world. It intentionally has no Chrome API access.
(function () {
  "use strict";

  const VERSION = 1;
  const REQUEST_EVENT = "w2m2gcal:storage-request";
  const RESPONSE_EVENT = "w2m2gcal:storage-response";
  const REQUEST_TIMEOUT_MS = 150;
  const REQUEST_ATTEMPTS = 2;
  // <preference-schema>
  const INVALID = Symbol("invalid preference");
  const defaults = Object.freeze({
    "w2m2gcal.durationMinutes": 60,
    "w2m2gcal.panelPos": null,
    "w2m2gcal.panelMinimized": false,
    "w2m2gcal.panelMinPos": null,
    "w2m2gcal.include30Starts": true,
    "w2m2gcal.include15_45Starts": true,
  });
  const isPosition = (value, secondKey) =>
    value &&
    typeof value === "object" &&
    Object.keys(value).length === 2 &&
    Number.isFinite(value.left) &&
    value.left >= 0 &&
    value.left <= 100000 &&
    Number.isFinite(value[secondKey]) &&
    value[secondKey] >= 0 &&
    value[secondKey] <= 100000;

  function normalize(key, value) {
    switch (key) {
      case "w2m2gcal.durationMinutes":
        return Number.isFinite(value) && value > 0 && value <= 10080 ? value : INVALID;
      case "w2m2gcal.panelPos":
        return value === null || isPosition(value, "top") ? (value === null ? null : { left: value.left, top: value.top }) : INVALID;
      case "w2m2gcal.panelMinimized":
      case "w2m2gcal.include30Starts":
      case "w2m2gcal.include15_45Starts":
        return typeof value === "boolean" ? value : INVALID;
      case "w2m2gcal.panelMinPos":
        return value === null || isPosition(value, "bottom")
          ? value === null
            ? null
            : { left: value.left, bottom: value.bottom }
          : INVALID;
      default:
        return INVALID;
    }
  }

  function clone(value) {
    return value && typeof value === "object" ? { ...value } : value;
  }
  // </preference-schema>

  function samePreference(key, left, right) {
    if (left === right) return true;
    if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
    if (key === "w2m2gcal.panelPos") return left.left === right.left && left.top === right.top;
    if (key === "w2m2gcal.panelMinPos") return left.left === right.left && left.bottom === right.bottom;
    return false;
  }

  let requestCounter = 0;
  const pending = new Map();
  const cache = new Map(Object.entries(defaults).map(([key, value]) => [key, clone(value)]));
  const persisted = new Map();

  function nextRequestId() {
    requestCounter += 1;
    const random = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${requestCounter}`;
    return `w2m2gcal-${random}`;
  }

  function send(operation, key, value) {
    return new Promise((resolve, reject) => {
      const requestId = nextRequestId();
      const timer = setTimeout(() => {
        pending.delete(requestId);
        reject(new Error("Preference bridge did not respond"));
      }, REQUEST_TIMEOUT_MS);
      pending.set(requestId, { operation, key, resolve, timer });
      const detail = { version: VERSION, requestId, operation, key };
      if (operation === "write") detail.value = clone(value);
      window.dispatchEvent(new CustomEvent(REQUEST_EVENT, { detail }));
    });
  }

  window.addEventListener(RESPONSE_EVENT, (event) => {
    const detail = event?.detail;
    if (
      !detail ||
      typeof detail !== "object" ||
      detail.version !== VERSION ||
      typeof detail.requestId !== "string" ||
      typeof detail.operation !== "string" ||
      typeof detail.key !== "string"
    ) {
      return;
    }
    const request = pending.get(detail.requestId);
    if (!request || request.operation !== detail.operation || request.key !== detail.key) return;
    const value = normalize(detail.key, detail.value);
    if (value === INVALID) return;
    clearTimeout(request.timer);
    pending.delete(detail.requestId);
    request.resolve(clone(value));
  });

  async function readPreference(key) {
    for (let attempt = 0; attempt < REQUEST_ATTEMPTS; attempt += 1) {
      try {
        return { value: await send("read", key), persisted: true };
      } catch {
        // The bridge may register after this MAIN-world script. Retry once, then use defaults.
      }
    }
    return { value: clone(defaults[key]), persisted: false };
  }

  async function writePreference(key, value) {
    for (let attempt = 0; attempt < REQUEST_ATTEMPTS; attempt += 1) {
      try {
        await send("write", key, value);
        return true;
      } catch {
        // A page navigation can end a write; a best-effort retry keeps the panel responsive.
      }
    }
    return false;
  }

  globalThis.GM_getValue = (key, fallback) => (cache.has(key) ? clone(cache.get(key)) : fallback);
  globalThis.GM_setValue = (key, value) => {
    const normalized = normalize(key, value);
    if (normalized === INVALID) return;
    if (samePreference(key, cache.get(key), normalized) && samePreference(key, persisted.get(key), normalized)) {
      return;
    }
    cache.set(key, clone(normalized));
    void writePreference(key, normalized).then((wasPersisted) => {
      if (wasPersisted && samePreference(key, cache.get(key), normalized)) {
        persisted.set(key, clone(normalized));
      }
    });
  };

  globalThis.__w2m2gcalStorageReady = Promise.all(
    Object.keys(defaults).map(async (key) => [key, await readPreference(key)]),
  ).then((values) => {
    for (const [key, result] of values) {
      cache.set(key, clone(result.value));
      if (result.persisted) persisted.set(key, clone(result.value));
    }
  });
})();

(function () {
  "use strict";

  const PRESETS = [30, 60, 90, 120];
  const STORAGE_DURATION = "w2m2gcal.durationMinutes";
  const STORAGE_POS = "w2m2gcal.panelPos";
  const STORAGE_MIN = "w2m2gcal.panelMinimized";
  const STORAGE_MIN_POS = "w2m2gcal.panelMinPos";
  const STORAGE_INCLUDE_30 = "w2m2gcal.include30Starts";
  const STORAGE_INCLUDE_15_45 = "w2m2gcal.include15_45Starts";
  const STORAGE_QUARTERS_LEGACY = "w2m2gcal.includeQuarterStarts";
  // <embed-icon src="src/icons/calendar-plus.svg">
  const CAL_ICON = `<svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 170 178" width="24" height="24" aria-hidden="true"><path d="M123.3 8.7c-1.2.2-3.4 1.8-4.8 3.4-2 2.5-2.5 4.1-2.5 8.5V26H55v-4.5c0-5.2-2.1-9.9-4.9-11.5-3.9-2-9.1-1.2-12.2 1.9-2.5 2.6-2.9 3.7-2.9 8.5V26h-7.9c-6.5 0-8.4.4-11.2 2.3-7.2 4.8-7 2.1-6.7 70.4.3 60 .3 61.2 2.4 63.9 1.1 1.5 3.3 3.7 4.8 4.8 2.7 2.1 3.9 2.1 67.7 2.4s65 .2 68.9-1.8c2.3-1.2 5-3.5 6-5.3 1.9-3.1 2-5.4 2-64.7 0-59.6-.1-61.6-2-64.8-3.2-5.3-7.4-7.2-15.7-7.2H136v-4.5c0-6-2.3-10.3-6.5-12.1-1.9-.8-3.6-1.3-3.7-1.3zm-75.1 6C49.8 16.1 50 18 50 28.6c0 13.3-.8 15.4-5.5 15.4-4.3 0-5.5-3.4-5.5-14.8 0-9.8.9-13.7 3.4-15.4q2.8-1.8 5.8.9m80.6-.1c2.1 1.4 2.2 2.2 2.2 13.6 0 13.2-.9 15.8-5.6 15.8-4.2 0-5.4-3.4-5.4-15.7 0-10 .2-11.5 2-13.3 2.4-2.4 3.8-2.5 6.8-.4M35 36.7q.8 11.9 10 11.8 9.2.1 9.8-11.7l.4-6.3h60.3l.6 6c.7 7.7 1.4 9 5.4 10.9s4.9 2 8.5.1q6-3.1 6-12.6v-5.2l7.1.5c6.2.5 7.5.9 10.1 3.5 3 3 3 3.1 3.2 15.7l.3 12.6H14V49.7c0-13.6.8-15.8 6.4-18.3 1.7-.7 5.6-1.3 8.6-1.1l5.5.2zm121.7 73.8c.1 24.8-.2 44.6-.8 46.7-.5 2-2.1 4.6-3.6 5.7-2.5 2.1-3.5 2.1-66.5 2.1-69.3 0-68.1.1-70.6-5.5-.9-1.9-1.2-14.8-1.2-47.6V67l71.3.2 71.2.3z"></path><path d="M84.2 89.2q-1.2 1.3-1.2 13V114H71c-10.1 0-12.2.3-12.7 1.6-1 2.7 1.7 3.4 13.5 3.4H83v11.9c0 12.1.7 14.4 3.5 12.1 1.2-1 1.5-3.9 1.5-12.6V119h11.3c11.3 0 14.1-.8 13-3.6-.4-1.1-3.2-1.4-12.4-1.4H88v-11.9c0-8.6-.4-12.2-1.3-13q-1.4-1.2-2.5.1"></path></svg>`;
  // </embed-icon>
  const CLS = "w2m2gcal-hi";
  const CLS_SEL = "w2m2gcal-sel";
  const BAND = "w2m2gcal-band";
  const ROOT_ID = "w2m2gcal-panel";

  // --- pure helpers (keep in sync with src/rank.mjs + src/gcal.mjs) ---

  function snapDuration(minutes, stepMinutes) {
    const step = Math.max(1, Number(stepMinutes) || 15);
    const m = Number(minutes);
    if (!Number.isFinite(m) || m <= 0) return step;
    return Math.max(step, Math.ceil(m / step) * step);
  }

  function buildMatrixFromGlobals(g) {
    if (!g || typeof g !== "object") return { ok: false, error: "Missing page globals" };
    const names = g.PeopleNames;
    const ids = g.PeopleIDs;
    const available = g.AvailableAtSlot;
    const times = g.TimeOfSlot;
    if (!Array.isArray(names) || !Array.isArray(ids) || !Array.isArray(available) || !Array.isArray(times)) {
      return { ok: false, error: "Expected PeopleNames, PeopleIDs, AvailableAtSlot, TimeOfSlot arrays" };
    }
    if (names.length !== ids.length) return { ok: false, error: "PeopleNames/PeopleIDs length mismatch" };
    if (available.length !== times.length) return { ok: false, error: "AvailableAtSlot/TimeOfSlot length mismatch" };
    if (times.length === 0) return { ok: false, error: "No time slots on page" };

    const people = ids.map((id, i) => ({ id: String(id), name: String(names[i] ?? id) }));
    const idSet = new Set(people.map((p) => p.id));
    const slots = times.map((t, i) => {
      const epoch = Number(t);
      if (!Number.isFinite(epoch)) {
        return { epoch: NaN, attendees: [], index: i, invalid: true };
      }
      const raw = available[i];
      let attendees = [];
      if (Array.isArray(raw)) attendees = raw.map(String);
      else if (raw && typeof raw === "object") attendees = Object.keys(raw).map(String);
      else if (typeof raw === "string") attendees = raw.split(/[,\s]+/).filter(Boolean);
      if (idSet.size) attendees = attendees.filter((id) => idSet.has(id));
      return { epoch, attendees, index: i };
    });
    if (slots.some((s) => s.invalid || !Number.isFinite(s.epoch))) {
      return { ok: false, error: "TimeOfSlot contains invalid timestamps" };
    }

    let stepMinutes = 15;
    if (slots.length >= 2) {
      const deltas = [];
      for (let i = 1; i < Math.min(slots.length, 20); i++) {
        const d = (slots[i].epoch - slots[i - 1].epoch) / 60;
        if (d > 0 && d <= 120) deltas.push(d);
      }
      if (deltas.length) {
        deltas.sort((a, b) => a - b);
        stepMinutes = Math.round(deltas[Math.floor(deltas.length / 2)]) || 15;
      }
    }
    return { ok: true, slots, stepMinutes, people };
  }

  function rankWindows(slots, durationMinutes, stepMinutes) {
    if (!slots?.length) return [];
    const step = Math.max(1, stepMinutes);
    const need = Math.max(1, Math.round(durationMinutes / step));
    if (slots.length < need) return [];
    const sorted = [...slots].sort((a, b) => a.epoch - b.epoch);
    const out = [];
    for (let i = 0; i <= sorted.length - need; i++) {
      const windowSlots = sorted.slice(i, i + need);
      let contiguous = true;
      for (let k = 1; k < windowSlots.length; k++) {
        if (Math.abs(windowSlots[k].epoch - windowSlots[k - 1].epoch - step * 60) > 1) {
          contiguous = false;
          break;
        }
      }
      if (!contiguous) continue;
      let intersection = null;
      for (const s of windowSlots) {
        const set = new Set(s.attendees.map(String));
        intersection = intersection == null ? set : new Set([...intersection].filter((id) => set.has(id)));
      }
      const attendees = [...(intersection || [])].sort();
      const startEpoch = windowSlots[0].epoch;
      out.push({
        startEpoch,
        endEpoch: startEpoch + durationMinutes * 60,
        score: attendees.length,
        attendees,
        slotIndexes: windowSlots.map((s) => s.index),
      });
    }
    return out;
  }

  function selectMaxCandidates(windows) {
    if (!windows.length) return [];
    const max = Math.max(...windows.map((w) => w.score));
    if (max <= 0) return [];
    return windows
      .filter((w) => w.score === max)
      .sort((a, b) => a.startEpoch - b.startEpoch || a.endEpoch - b.endEpoch);
  }

  function startMinuteInZone(epochSec, timeZone) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      minute: "numeric",
      hourCycle: "h23",
    }).formatToParts(new Date(epochSec * 1000));
    return Number(parts.find((p) => p.type === "minute")?.value ?? NaN);
  }

  function filterByStartOffset(windows, timeZone, opts = {}) {
    const include30 = opts.include30 !== false;
    const include15_45 = opts.include15_45 !== false;
    if (!timeZone || !windows?.length) return windows || [];
    if (include30 && include15_45) return windows;
    return windows.filter((w) => {
      const m = startMinuteInZone(w.startEpoch, timeZone);
      if (m === 0) return true;
      if (m === 30) return include30;
      if (m === 15 || m === 45) return include15_45;
      return false;
    });
  }

  function formatLocalStamp(epochSec, timeZone) {
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

  function formatPreviewRange(startEpoch, endEpoch, timeZone) {
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

  function buildTemplateUrl(opts) {
    const { title, startEpoch, endEpoch, timeZone, details } = opts;
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

  // --- page bridge ---

  function pageWindow() {
    try {
      return typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
    } catch {
      return window;
    }
  }

  function selfCheckSlots(slots) {
    const sample = slots.filter((_, i) => i % Math.max(1, Math.floor(slots.length / 5)) === 0).slice(0, 5);
    if (!sample.length) return { ok: false, error: "No slots to verify against the grid" };
    for (const s of sample) {
      const el = document.getElementById("GroupTime" + s.epoch);
      if (!el) {
        return {
          ok: false,
          error: "Could not match TimeOfSlot ids to GroupTime cells — page structure may have changed",
        };
      }
    }
    return { ok: true };
  }

  function resolveGridTimeZone() {
    const w = pageWindow();
    const probes = [];
    const sel =
      document.querySelector('select[name*="time" i], select[id*="time" i], select[id*="TimeZone" i]') ||
      document.querySelector("#TimeZoneSelect, #timezone, select.timezone");
    if (sel && sel.value && /[A-Za-z]+\/[A-Za-z_]+/.test(sel.value)) probes.push(sel.value.trim());
    try {
      const sp = new URLSearchParams(location.search);
      for (const key of ["tz", "timezone", "ctz"]) {
        const v = sp.get(key);
        if (v && /[A-Za-z]+\/[A-Za-z_]+/.test(v)) probes.push(v.trim());
      }
    } catch {
      /* ignore */
    }
    if (typeof w.TimeZone === "string" && /[A-Za-z]+\/[A-Za-z_]+/.test(w.TimeZone)) {
      probes.push(w.TimeZone.trim());
    }
    // Prefer an explicit page/URL zone. Only use Intl when it matches a page control
    // (grid display zone ≈ viewer-local) — otherwise leave null so R7 can block.
    let intl = null;
    try {
      intl = Intl.DateTimeFormat().resolvedOptions().timeZone || null;
    } catch {
      /* ignore */
    }
    const pageZone = probes.find(Boolean) || null;
    if (pageZone) return pageZone;
    if (intl && sel && String(sel.value).includes(intl.split("/")[1] || "")) return intl;
    // when2meet commonly renders the grid in the viewer's local zone with no IANA control
    if (intl && !sel) return intl;
    return null;
  }

  // --- UI state ---

  let matrix = null;
  let candidates = [];
  let selected = null;
  let durationMinutes = 60;
  let stepMinutes = 15;
  let panelNotice = "";
  let lastErrorMsg = null;
  let panelMinimized = false;
  let include30Starts = true;
  let include15_45Starts = true;
  let selectedFrameHost = null;
  let selectedFrameHostPosition = "";
  let selectedFrameHostNeedsRestore = false;

  function loadPanelPreferences() {
    try {
      panelMinimized = !!GM_getValue(STORAGE_MIN, false);
    } catch {
      panelMinimized = false;
    }
    try {
      const legacy = GM_getValue(STORAGE_QUARTERS_LEGACY, null);
      const has30 = GM_getValue(STORAGE_INCLUDE_30, null);
      const has1545 = GM_getValue(STORAGE_INCLUDE_15_45, null);
      if (has30 == null && has1545 == null && legacy != null) {
        include30Starts = legacy !== false;
        include15_45Starts = legacy !== false;
      } else {
        include30Starts = has30 !== false;
        include15_45Starts = has1545 !== false;
      }
    } catch {
      include30Starts = true;
      include15_45Starts = true;
    }
  }

  function setMinimized(next) {
    panelMinimized = !!next;
    try {
      GM_setValue(STORAGE_MIN, panelMinimized);
    } catch {
      /* ignore */
    }
    if (lastErrorMsg) renderError(lastErrorMsg);
    else renderPanelBody();
  }

  function loadDuration() {
    try {
      const v = GM_getValue(STORAGE_DURATION, 60);
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? n : 60;
    } catch {
      return 60;
    }
  }

  function saveDuration(m) {
    try {
      GM_setValue(STORAGE_DURATION, m);
    } catch {
      /* ignore */
    }
  }

  function clearHighlights() {
    document.querySelectorAll("." + CLS + ", ." + CLS_SEL).forEach((el) => {
      el.classList.remove(CLS, CLS_SEL);
    });
    document.querySelectorAll("." + BAND).forEach((el) => el.remove());
    if (selectedFrameHost && selectedFrameHostNeedsRestore) {
      selectedFrameHost.style.position = selectedFrameHostPosition;
    }
    selectedFrameHost = null;
    selectedFrameHostPosition = "";
    selectedFrameHostNeedsRestore = false;
  }

  function cellsForCandidate(c) {
    return (c.slotIndexes || [])
      .map((idx) => {
        const epoch = matrix?.slots[idx]?.epoch;
        return epoch != null ? document.getElementById("GroupTime" + epoch) : null;
      })
      .filter(Boolean);
  }

  function unionRect(elements) {
    const rects = elements
      .map((el) => el.getBoundingClientRect())
      .filter((rect) => rect.width > 0 && rect.height > 0);
    if (!rects.length) return null;
    const left = Math.min(...rects.map((rect) => rect.left));
    const top = Math.min(...rects.map((rect) => rect.top));
    const right = Math.max(...rects.map((rect) => rect.right));
    const bottom = Math.max(...rects.map((rect) => rect.bottom));
    return { left, top, right, bottom, width: right - left, height: bottom - top };
  }

  function commonAncestor(elements) {
    if (!elements.length) return null;
    for (let ancestor = elements[0].parentElement; ancestor; ancestor = ancestor.parentElement) {
      if (elements.every((el) => ancestor.contains(el))) return ancestor;
    }
    return null;
  }

  function frameHost(elements) {
    const ancestor = commonAncestor(elements);
    if (!ancestor) return null;
    for (let host = ancestor; host; host = host.parentElement) {
      let computedStyle = null;
      if (typeof getComputedStyle === "function") {
        try {
          computedStyle = getComputedStyle(host);
        } catch {
          /* ignore */
        }
      }
      const display = computedStyle?.display || host.style?.display || "";
      if (display !== "inline" && display !== "contents") {
        return { host, position: computedStyle?.position || host.style.position };
      }
    }
    return { host: ancestor, position: ancestor.style.position };
  }

  function paintSelectedFrame(c) {
    const cells = cellsForCandidate(c);
    const box = unionRect(cells);
    const hostInfo = frameHost(cells);
    if (!box || !hostInfo) return;
    const { host, position: computedPosition } = hostInfo;

    selectedFrameHostNeedsRestore = !computedPosition || computedPosition === "static";
    selectedFrameHostPosition = selectedFrameHostNeedsRestore ? host.style.position : "";
    if (selectedFrameHostNeedsRestore) host.style.position = "relative";

    const hostRect = host.getBoundingClientRect();
    const clientLeft = Number(host.clientLeft) || 0;
    const clientTop = Number(host.clientTop) || 0;
    const scrollLeft = Number(host.scrollLeft) || 0;
    const scrollTop = Number(host.scrollTop) || 0;
    const frame = document.createElement("div");
    frame.className = BAND;
    frame.setAttribute("aria-hidden", "true");
    frame.style.left = `${box.left - hostRect.left - clientLeft + scrollLeft}px`;
    frame.style.top = `${box.top - hostRect.top - clientTop + scrollTop}px`;
    frame.style.width = `${box.width}px`;
    frame.style.height = `${box.height}px`;
    host.appendChild(frame);
    selectedFrameHost = host;
  }

  function paintCandidates() {
    clearHighlights();
    if (selected) paintSelectedFrame(selected);
  }

  function recompute() {
    selected = null;
    panelNotice = "";
    if (!matrix) {
      candidates = [];
      return;
    }
    const ranked = rankWindows(matrix.slots, durationMinutes, stepMinutes);
    const tz = resolveGridTimeZone();
    candidates = filterByStartOffset(selectMaxCandidates(ranked), tz, {
      include30: include30Starts,
      include15_45: include15_45Starts,
    });
    if (candidates.length === 1) selected = candidates[0];
    paintCandidates();
    renderPanelBody();
  }

  function candidateContainingEpoch(epoch) {
    const containsEpoch = (c) =>
      (c.slotIndexes || []).some((idx) => matrix?.slots[idx]?.epoch === epoch);
    if (selected && containsEpoch(selected)) return selected;
    return [...candidates].reverse().find(containsEpoch);
  }

  function onGridClick(ev) {
    const cell = ev.target?.closest?.('[id^="GroupTime"]');
    if (!cell) return;
    const epoch = Number(String(cell.id).replace(/^GroupTime/, ""));
    if (!Number.isFinite(epoch)) return;
    const hit = candidateContainingEpoch(epoch);
    if (!hit) return;
    panelNotice = "";
    selected = hit;
    paintCandidates();
    renderPanelBody();
  }

  function hookGridClicks() {
    if (document.documentElement.dataset.w2m2gcalClick) return;
    document.documentElement.dataset.w2m2gcalClick = "1";
    document.addEventListener("click", onGridClick, true);
  }

  function ensureStyles() {
    if (document.getElementById("w2m2gcal-style")) return;
    const s = document.createElement("style");
    s.id = "w2m2gcal-style";
    s.textContent = `
      #${ROOT_ID} {
        position: fixed;
        left: 16px;
        bottom: 16px;
        z-index: 2147483646;
        font: 13px/1.4 system-ui, sans-serif;
        background: #fffdf9;
        border: 1px solid #d6d3d1;
        border-radius: 8px;
        padding: 10px 12px;
        margin: 0;
        width: min(360px, calc(100vw - 32px));
        max-height: calc(100vh - 32px);
        overflow: auto;
        color: #1c1917;
        box-shadow: 0 10px 30px rgba(28, 25, 23, 0.2);
      }
      #${ROOT_ID}.w2m2gcal-minimized {
        width: auto;
        max-height: none;
        padding: 0;
        overflow: visible;
        background: transparent;
        border: none;
        box-shadow: none;
      }
      #${ROOT_ID} .w2m2gcal-chrome {
        display: flex;
        align-items: flex-start;
        gap: 6px;
        margin: 0 0 8px;
      }
      #${ROOT_ID} h2.w2m2gcal-drag {
        flex: 1;
        font-size: 14px;
        margin: 0;
        cursor: grab;
        user-select: none;
        touch-action: none;
      }
      #${ROOT_ID} h2.w2m2gcal-drag:active,
      #${ROOT_ID} .w2m2gcal-fab:active { cursor: grabbing; }
      #${ROOT_ID} button.w2m2gcal-min {
        flex: none;
        width: 28px;
        height: 28px;
        padding: 0;
        line-height: 1;
        font-size: 16px;
      }
      #${ROOT_ID} button.w2m2gcal-fab {
        width: 52px;
        height: 52px;
        border-radius: 999px;
        padding: 0;
        border: none;
        background: #0d9488;
        color: #fff;
        box-shadow: 0 8px 20px rgba(28, 25, 23, 0.25);
        cursor: grab;
        display: grid;
        place-items: center;
        touch-action: none;
        user-select: none;
      }
      #${ROOT_ID} button.w2m2gcal-fab svg {
        display: block;
        pointer-events: none;
      }
      #${ROOT_ID} .row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin: 6px 0; }
      #${ROOT_ID} button, #${ROOT_ID} input {
        font: inherit; padding: 4px 8px; border-radius: 6px; border: 1px solid #a8a29e;
      }
      #${ROOT_ID} button.chip[aria-pressed="true"] { background: #ccfbf1; border-color: #0f766e; }
      #${ROOT_ID} button.primary { background: #0f766e; color: #fff; border-color: #0f766e; }
      #${ROOT_ID} button:disabled { opacity: 0.45; cursor: not-allowed; }
      #${ROOT_ID} .err { color: #9a3412; margin: 6px 0; }
      #${ROOT_ID} .muted { color: #57534e; font-size: 12px; }
      #${ROOT_ID} ul.ties {
        list-style: none;
        padding: 0;
        margin: 6px 0;
        max-height: min(120px, 20vh);
        overflow-y: auto;
        overscroll-behavior: contain;
      }
      #${ROOT_ID} ul.ties li button {
        width: 100%; text-align: left; background: #fafaf9; margin-bottom: 4px;
      }
      #${ROOT_ID} ul.ties li button[aria-pressed="true"] { outline: 2px solid #0f766e; }
      .${BAND} {
        position: absolute;
        z-index: 2147483000;
        box-sizing: border-box;
        border: 3px solid #c2410c;
        border-radius: 3px;
        background: transparent;
        pointer-events: none;
      }
    `;
    document.head.appendChild(s);
  }

  function mountPanel() {
    ensureStyles();
    let root = document.getElementById(ROOT_ID);
    if (!root) {
      root = document.createElement("section");
      root.id = ROOT_ID;
      root.setAttribute("aria-label", "when2meet to Google Calendar");
      document.body.appendChild(root);
      applySavedPosition(root);
    }
    return root;
  }

  function applySavedPosition(root) {
    try {
      const pos = GM_getValue(STORAGE_POS, null);
      if (!pos || !Number.isFinite(pos.left) || !Number.isFinite(pos.top)) return;
      root.style.left = `${pos.left}px`;
      root.style.top = `${pos.top}px`;
      root.style.right = "auto";
      root.style.bottom = "auto";
    } catch {
      /* ignore */
    }
  }

  function applyMinimizedPosition(root) {
    try {
      const pos = GM_getValue(STORAGE_MIN_POS, null);
      if (pos && Number.isFinite(pos.left) && Number.isFinite(pos.bottom)) {
        root.style.left = `${pos.left}px`;
        root.style.bottom = `${pos.bottom}px`;
        root.style.top = "auto";
        root.style.right = "auto";
        return;
      }
    } catch {
      /* ignore */
    }
    // Default / first minimize: pin to bottom-left (not top-left of the expanded panel)
    root.style.left = "16px";
    root.style.bottom = "16px";
    root.style.top = "auto";
    root.style.right = "auto";
  }

  function enableDrag(root) {
    const handle = root.querySelector(".w2m2gcal-drag");
    if (!handle || handle.dataset.dragBound) return;
    handle.dataset.dragBound = "1";
    if (!handle.title) handle.title = "Drag to move";
    const isFab = handle.classList.contains("w2m2gcal-fab");
    handle.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const rect = root.getBoundingClientRect();
      const startX = e.clientX;
      const startY = e.clientY;
      const origL = rect.left;
      const origT = rect.top;
      let moved = false;
      root.style.left = `${origL}px`;
      root.style.top = `${origT}px`;
      root.style.right = "auto";
      root.style.bottom = "auto";
      handle.setPointerCapture(e.pointerId);
      const onMove = (ev) => {
        if (Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY) > 4) moved = true;
        const maxL = Math.max(0, window.innerWidth - root.offsetWidth);
        const maxT = Math.max(0, window.innerHeight - root.offsetHeight);
        const left = Math.max(0, Math.min(maxL, origL + ev.clientX - startX));
        const top = Math.max(0, Math.min(maxT, origT + ev.clientY - startY));
        root.style.left = `${left}px`;
        root.style.top = `${top}px`;
      };
      const onUp = (ev) => {
        handle.releasePointerCapture(ev.pointerId);
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", onUp);
        const r = root.getBoundingClientRect();
        try {
          if (isFab) {
            root.style.left = `${r.left}px`;
            root.style.bottom = `${Math.max(0, window.innerHeight - r.bottom)}px`;
            root.style.top = "auto";
            root.style.right = "auto";
            GM_setValue(STORAGE_MIN_POS, {
              left: r.left,
              bottom: Math.max(0, window.innerHeight - r.bottom),
            });
          } else {
            GM_setValue(STORAGE_POS, { left: r.left, top: r.top });
          }
        } catch {
          /* ignore */
        }
        if (!moved && isFab) setMinimized(false);
      };
      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", onUp);
    });
  }

  function renderMinimized(root) {
    root.classList.add("w2m2gcal-minimized");
    applyMinimizedPosition(root);
    root.innerHTML = `<button type="button" class="w2m2gcal-fab w2m2gcal-drag" aria-expanded="false" aria-label="Expand when2meet to Google Calendar" title="Open panel (drag to move)">${CAL_ICON}</button>`;
    enableDrag(root);
  }

  function renderError(msg) {
    lastErrorMsg = msg;
    const root = mountPanel();
    if (panelMinimized) {
      renderMinimized(root);
      return;
    }
    root.classList.remove("w2m2gcal-minimized");
    root.innerHTML = `
      <div class="w2m2gcal-chrome">
        <h2 class="w2m2gcal-drag">when2meet → Google Calendar</h2>
        <button type="button" class="w2m2gcal-min" aria-label="Minimize panel" title="Minimize">−</button>
      </div>
      <p class="err" role="alert">${escapeHtml(msg)}</p>`;
    applySavedPosition(root);
    root.querySelector(".w2m2gcal-min")?.addEventListener("click", () => setMinimized(true));
    enableDrag(root);
    clearHighlights();
  }

  function escapeHtml(t) {
    return String(t)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderPanelBody() {
    lastErrorMsg = null;
    const root = mountPanel();
    if (panelMinimized) {
      renderMinimized(root);
      return;
    }
    root.classList.remove("w2m2gcal-minimized");
    applySavedPosition(root);
    const tz = resolveGridTimeZone();
    const effective = snapDuration(durationMinutes, stepMinutes);
    const canOpen = !!selected && !!tz;
    const multi = candidates.length > 1;

    let tiesHtml = "";
    if (candidates.length === 0) {
      tiesHtml = `<p class="muted">No window where anyone is free for the full ${effective} minutes.</p>`;
    } else if (multi) {
      tiesHtml =
        `<p class="muted">Tied at ${candidates[0].score} people — pick one:</p><ul class="ties">` +
        candidates
          .map((c, i) => {
            const label = formatPreviewRange(c.startEpoch, c.endEpoch, tz || "UTC");
            const pressed = selected === c ? "true" : "false";
            return `<li><button type="button" data-idx="${i}" aria-pressed="${pressed}">${escapeHtml(label)} · ${c.score} free</button></li>`;
          })
          .join("") +
        `</ul>`;
    } else {
      tiesHtml = `<p class="muted">Best: ${escapeHtml(formatPreviewRange(candidates[0].startEpoch, candidates[0].endEpoch, tz || "UTC"))} · ${candidates[0].score} free</p>`;
    }

    const preview =
      selected && tz
        ? `<p><strong>Preview:</strong> ${escapeHtml(formatPreviewRange(selected.startEpoch, selected.endEpoch, tz))}</p>`
        : selected && !tz
          ? `<p class="err" role="alert">Could not resolve the grid display timezone — calendar open blocked.</p>`
          : multi
            ? `<p class="muted">Select a tied window (list or its grid time) to enable Google Calendar.</p>`
            : "";

    const notice = panelNotice ? `<p class="err" role="alert">${escapeHtml(panelNotice)}</p>` : "";

    root.innerHTML = `
      <div class="w2m2gcal-chrome">
        <h2 class="w2m2gcal-drag">when2meet → Google Calendar</h2>
        <button type="button" class="w2m2gcal-min" aria-label="Minimize panel" title="Minimize">−</button>
      </div>
      <div class="row" role="group" aria-label="Meeting duration">
        ${PRESETS.map(
          (p) =>
            `<button type="button" class="chip" data-dur="${p}" aria-pressed="${effective === p ? "true" : "false"}">${p} min</button>`,
        ).join("")}
        <label>Custom <input type="number" min="1" step="${stepMinutes}" id="w2m2gcal-custom" value="${durationMinutes}" aria-describedby="w2m2gcal-snap"></label>
      </div>
      <p class="muted" id="w2m2gcal-snap">Effective duration: <strong>${effective} min</strong> (snapped to ${stepMinutes}-min grid)</p>
      <div class="row muted">
        <label><input type="checkbox" id="w2m2gcal-30" ${include30Starts ? "checked" : ""}> Include :30 starts</label>
        <label><input type="checkbox" id="w2m2gcal-1545" ${include15_45Starts ? "checked" : ""}> Include :15 / :45 starts</label>
      </div>
      ${tiesHtml}
      ${preview}
      ${notice}
      <div class="row">
        <button type="button" class="primary" id="w2m2gcal-open" ${canOpen ? "" : "disabled"}>Open Google Calendar</button>
      </div>
    `;

    root.querySelector(".w2m2gcal-min")?.addEventListener("click", () => setMinimized(true));
    const bindOffsetToggle = (id, key, apply) => {
      const el = root.querySelector(id);
      if (!el) return;
      el.addEventListener("change", () => {
        apply(!!el.checked);
        try {
          GM_setValue(key, el.checked);
        } catch {
          /* ignore */
        }
        recompute();
      });
    };
    bindOffsetToggle("#w2m2gcal-30", STORAGE_INCLUDE_30, (v) => {
      include30Starts = v;
    });
    bindOffsetToggle("#w2m2gcal-1545", STORAGE_INCLUDE_15_45, (v) => {
      include15_45Starts = v;
    });
    root.querySelectorAll("button.chip").forEach((btn) => {
      btn.addEventListener("click", () => {
        durationMinutes = Number(btn.getAttribute("data-dur"));
        saveDuration(durationMinutes);
        recompute();
      });
    });
    const custom = root.querySelector("#w2m2gcal-custom");
    if (custom) {
      const syncSnapLabel = () => {
        const eff = snapDuration(Number(custom.value), stepMinutes);
        const strong = root.querySelector("#w2m2gcal-snap strong");
        if (strong) strong.textContent = `${eff} min`;
      };
      custom.addEventListener("input", syncSnapLabel);
      custom.addEventListener("change", () => {
        durationMinutes = snapDuration(Number(custom.value), stepMinutes);
        custom.value = String(durationMinutes);
        saveDuration(durationMinutes);
        recompute();
      });
    }
    root.querySelectorAll("ul.ties button").forEach((btn) => {
      btn.addEventListener("click", () => {
        const i = Number(btn.getAttribute("data-idx"));
        selected = candidates[i] || null;
        panelNotice = "";
        paintCandidates();
        renderPanelBody();
      });
    });
    const openBtn = root.querySelector("#w2m2gcal-open");
    if (openBtn) {
      openBtn.addEventListener("click", () => {
        if (!selected || !tz) return;
        const title = document.title.replace(/\s*[–|\-].*$/, "").trim() || "when2meet meeting";
        const url = buildTemplateUrl({
          title,
          startEpoch: selected.startEpoch,
          endEpoch: selected.endEpoch,
          timeZone: tz,
          details: `Scheduled from when2meet\n${location.href}`,
        });
        const win = window.open(url, "_blank", "noopener,noreferrer");
        if (!win) {
          panelNotice = "Pop-up blocked — allow pop-ups for this site, then try again.";
          renderPanelBody();
        }
      });
    }
    enableDrag(root);
  }

  function hookRecolor() {
    const w = pageWindow();
    if (typeof w.ReColorGroup === "function" && !w.ReColorGroup.__w2m2gcal) {
      const orig = w.ReColorGroup.bind(w);
      w.ReColorGroup = function (...args) {
        const r = orig(...args);
        try {
          paintCandidates();
        } catch {
          /* ignore */
        }
        return r;
      };
      w.ReColorGroup.__w2m2gcal = true;
    }
  }

  function boot() {
    loadPanelPreferences();
    durationMinutes = loadDuration();
    const g = pageWindow();
    const built = buildMatrixFromGlobals(g);
    if (!built.ok) {
      renderError(built.error);
      return;
    }
    const check = selfCheckSlots(built.slots);
    if (!check.ok) {
      renderError(check.error);
      return;
    }
    matrix = built;
    stepMinutes = built.stepMinutes;
    durationMinutes = snapDuration(durationMinutes, stepMinutes);
    hookRecolor();
    hookGridClicks();
    recompute();
  }

  function scheduleBoot() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => setTimeout(boot, 200));
    } else {
      setTimeout(boot, 200);
    }
  }

  const storageReady = globalThis.__w2m2gcalStorageReady;
  if (storageReady && typeof storageReady.then === "function") {
    Promise.resolve(storageReady).then(scheduleBoot, scheduleBoot);
  } else {
    scheduleBoot();
  }
})();
