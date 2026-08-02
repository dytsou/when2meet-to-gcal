/**
 * Pure ranking + duration helpers for when2meet-to-gcal.
 * Shared by Node tests; mirrored in the userscript runtime.
 */

export const DURATION_PRESETS = [30, 60, 90, 120];

/** Snap custom minutes up to slot step (min one slot). */
export function snapDuration(minutes, stepMinutes = 15) {
  const step = Math.max(1, Number(stepMinutes) || 15);
  const m = Number(minutes);
  if (!Number.isFinite(m) || m <= 0) return step;
  return Math.max(step, Math.ceil(m / step) * step);
}

/**
 * @typedef {{ startEpoch: number, endEpoch: number, score: number, attendees: string[] }} WindowCandidate
 */

/**
 * Build continuous-attendance windows.
 * @param {Array<{ epoch: number, attendees: Iterable<string> }>} slots  sorted by epoch
 * @param {number} durationMinutes
 * @param {number} stepMinutes
 * @returns {WindowCandidate[]}
 */
export function rankWindows(slots, durationMinutes, stepMinutes = 15) {
  if (!slots?.length) return [];
  const step = Math.max(1, stepMinutes);
  const need = Math.max(1, Math.round(durationMinutes / step));
  if (slots.length < need) return [];

  const sorted = [...slots].sort((a, b) => a.epoch - b.epoch);
  const out = [];

  for (let i = 0; i <= sorted.length - need; i++) {
    const windowSlots = sorted.slice(i, i + need);
    // Contiguous in time: each step equals stepMinutes (allow 1s slack)
    let contiguous = true;
    for (let k = 1; k < windowSlots.length; k++) {
      const delta = windowSlots[k].epoch - windowSlots[k - 1].epoch;
      if (Math.abs(delta - step * 60) > 1) {
        contiguous = false;
        break;
      }
    }
    if (!contiguous) continue;

    let intersection = null;
    for (const s of windowSlots) {
      const set = new Set([...s.attendees].map(String));
      intersection = intersection == null ? set : new Set([...intersection].filter((id) => set.has(id)));
    }
    const attendees = [...(intersection || [])].sort();
    const startEpoch = windowSlots[0].epoch;
    const endEpoch = startEpoch + durationMinutes * 60;
    out.push({
      startEpoch,
      endEpoch,
      score: attendees.length,
      attendees,
      slotIndexes: windowSlots.map((s) => s.index ?? sorted.indexOf(s)),
    });
  }
  return out;
}

/**
 * Keep max-score windows; among overlapping same-attendee sets, keep earliest start.
 * @param {WindowCandidate[]} windows
 * @returns {WindowCandidate[]}
 */
export function selectMaxCandidates(windows) {
  if (!windows.length) return [];
  const max = Math.max(...windows.map((w) => w.score));
  if (max <= 0) return [];
  const top = windows
    .filter((w) => w.score === max)
    .sort((a, b) => a.startEpoch - b.startEpoch || a.endEpoch - b.endEpoch);

  const kept = [];
  for (const w of top) {
    const key = w.attendees.join(",");
    const overlapsSame = kept.find(
      (k) =>
        k.attendees.join(",") === key &&
        rangesOverlap(k.startEpoch, k.endEpoch, w.startEpoch, w.endEpoch),
    );
    if (overlapsSame) continue; // keep earliest already in kept
    kept.push(w);
  }
  return kept;
}

function rangesOverlap(a0, a1, b0, b1) {
  return a0 < b1 && b0 < a1;
}

/**
 * Validate globals and build slot list (no DOM).
 * @returns {{ ok: true, slots: object[], stepMinutes: number, people: {id:string,name:string}[] } | { ok: false, error: string }}
 */
export function buildMatrixFromGlobals(g) {
  if (!g || typeof g !== "object") return { ok: false, error: "Missing page globals" };
  const names = g.PeopleNames;
  const ids = g.PeopleIDs;
  const available = g.AvailableAtSlot;
  const times = g.TimeOfSlot;
  if (!Array.isArray(names) || !Array.isArray(ids) || !Array.isArray(available) || !Array.isArray(times)) {
    return { ok: false, error: "Expected PeopleNames, PeopleIDs, AvailableAtSlot, TimeOfSlot arrays" };
  }
  if (names.length !== ids.length) {
    return { ok: false, error: "PeopleNames/PeopleIDs length mismatch" };
  }
  if (available.length !== times.length) {
    return { ok: false, error: "AvailableAtSlot/TimeOfSlot length mismatch" };
  }
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
