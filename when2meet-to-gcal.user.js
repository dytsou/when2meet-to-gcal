// ==UserScript==
// @name         when2meet → Google Calendar
// @namespace    https://github.com/when2meet-to-gcal
// @version      0.1.1
// @description  Highlight max continuous-overlap windows and open a Google Calendar TEMPLATE draft
// @author       when2meet-to-gcal
// @match        https://www.when2meet.com/*
// @match        https://when2meet.com/*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        unsafeWindow
// @noframes
// ==/UserScript==

(function () {
  "use strict";

  const PRESETS = [30, 60, 90, 120];
  const STORAGE_DURATION = "w2m2gcal.durationMinutes";
  const CLS = "w2m2gcal-hi";
  const CLS_SEL = "w2m2gcal-sel";
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

  function rangesOverlap(a0, a1, b0, b1) {
    return a0 < b1 && b0 < a1;
  }

  function selectMaxCandidates(windows) {
    if (!windows.length) return [];
    const max = Math.max(...windows.map((w) => w.score));
    if (max <= 0) return [];
    const top = windows
      .filter((w) => w.score === max)
      .sort((a, b) => a.startEpoch - b.startEpoch || a.endEpoch - b.endEpoch);
    const kept = [];
    for (const w of top) {
      const key = w.attendees.join(",");
      if (
        kept.find(
          (k) =>
            k.attendees.join(",") === key &&
            rangesOverlap(k.startEpoch, k.endEpoch, w.startEpoch, w.endEpoch),
        )
      ) {
        continue;
      }
      kept.push(w);
    }
    return kept;
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
  }

  function paintCandidates() {
    clearHighlights();
    for (const c of candidates) {
      const indexes = c.slotIndexes || [];
      for (const idx of indexes) {
        const epoch = matrix.slots[idx]?.epoch;
        if (epoch == null) continue;
        const el = document.getElementById("GroupTime" + epoch);
        if (el) el.classList.add(CLS);
      }
    }
    if (selected) {
      for (const idx of selected.slotIndexes || []) {
        const epoch = matrix.slots[idx]?.epoch;
        const el = epoch != null ? document.getElementById("GroupTime" + epoch) : null;
        if (el) el.classList.add(CLS_SEL);
      }
    }
  }

  function recompute() {
    selected = null;
    panelNotice = "";
    if (!matrix) {
      candidates = [];
      return;
    }
    const ranked = rankWindows(matrix.slots, durationMinutes, stepMinutes);
    candidates = selectMaxCandidates(ranked);
    if (candidates.length === 1) selected = candidates[0];
    paintCandidates();
    renderPanelBody();
  }

  function candidateContainingEpoch(epoch) {
    return candidates.find((c) =>
      (c.slotIndexes || []).some((idx) => matrix?.slots[idx]?.epoch === epoch),
    );
  }

  function onGridClick(ev) {
    const cell = ev.target?.closest?.('[id^="GroupTime"]');
    if (!cell || !cell.classList.contains(CLS)) return;
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
        font: 13px/1.4 system-ui, sans-serif;
        background: #fffdf9;
        border: 1px solid #d6d3d1;
        border-radius: 8px;
        padding: 10px 12px;
        margin: 8px 0;
        max-width: 420px;
        color: #1c1917;
      }
      #${ROOT_ID} h2 { font-size: 14px; margin: 0 0 8px; }
      #${ROOT_ID} .row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin: 6px 0; }
      #${ROOT_ID} button, #${ROOT_ID} input {
        font: inherit; padding: 4px 8px; border-radius: 6px; border: 1px solid #a8a29e;
      }
      #${ROOT_ID} button.chip[aria-pressed="true"] { background: #ccfbf1; border-color: #0f766e; }
      #${ROOT_ID} button.primary { background: #0f766e; color: #fff; border-color: #0f766e; }
      #${ROOT_ID} button:disabled { opacity: 0.45; cursor: not-allowed; }
      #${ROOT_ID} .err { color: #9a3412; margin: 6px 0; }
      #${ROOT_ID} .muted { color: #57534e; font-size: 12px; }
      #${ROOT_ID} ul.ties { list-style: none; padding: 0; margin: 6px 0; }
      #${ROOT_ID} ul.ties li button {
        width: 100%; text-align: left; background: #fafaf9; margin-bottom: 4px;
      }
      #${ROOT_ID} ul.ties li button[aria-pressed="true"] { outline: 2px solid #0f766e; }
      .${CLS} { outline: 2px solid #0f766e !important; outline-offset: -2px; cursor: pointer; }
      .${CLS_SEL} { outline: 3px solid #c2410c !important; outline-offset: -2px; box-shadow: inset 0 0 0 2px #fdba74; cursor: pointer; }
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
      const host = document.getElementById("MainBody") || document.getElementById("GroupGrid") || document.body;
      host.insertBefore(root, host.firstChild);
    }
    return root;
  }

  function renderError(msg) {
    const root = mountPanel();
    root.innerHTML = `<h2>when2meet → Google Calendar</h2><p class="err" role="alert">${escapeHtml(msg)}</p>`;
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
    const root = mountPanel();
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
            ? `<p class="muted">Select a tied window (list or highlighted grid) to enable Google Calendar.</p>`
            : "";

    const notice = panelNotice ? `<p class="err" role="alert">${escapeHtml(panelNotice)}</p>` : "";

    root.innerHTML = `
      <h2>when2meet → Google Calendar</h2>
      <div class="row" role="group" aria-label="Meeting duration">
        ${PRESETS.map(
          (p) =>
            `<button type="button" class="chip" data-dur="${p}" aria-pressed="${effective === p ? "true" : "false"}">${p} min</button>`,
        ).join("")}
        <label>Custom <input type="number" min="1" step="${stepMinutes}" id="w2m2gcal-custom" value="${durationMinutes}" aria-describedby="w2m2gcal-snap"></label>
      </div>
      <p class="muted" id="w2m2gcal-snap">Effective duration: <strong>${effective} min</strong> (snapped to ${stepMinutes}-min grid)</p>
      ${tiesHtml}
      ${preview}
      ${notice}
      <div class="row">
        <button type="button" class="primary" id="w2m2gcal-open" ${canOpen ? "" : "disabled"}>Open Google Calendar</button>
      </div>
    `;

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

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(boot, 200));
  } else {
    setTimeout(boot, 200);
  }
})();
