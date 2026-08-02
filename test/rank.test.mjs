import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  snapDuration,
  rankWindows,
  selectMaxCandidates,
  filterByStartOffset,
  buildMatrixFromGlobals,
} from "../src/rank.mjs";

describe("snapDuration", () => {
  it("snaps 50 to 60 with 15-min step", () => {
    assert.equal(snapDuration(50, 15), 60);
  });
  it("keeps exact multiples", () => {
    assert.equal(snapDuration(60, 15), 60);
  });
  it("uses at least one slot", () => {
    assert.equal(snapDuration(1, 15), 15);
  });
});

describe("buildMatrixFromGlobals", () => {
  it("fails when globals missing", () => {
    const r = buildMatrixFromGlobals(null);
    assert.equal(r.ok, false);
  });
  it("fails on length mismatch", () => {
    const r = buildMatrixFromGlobals({
      PeopleNames: ["A"],
      PeopleIDs: ["1", "2"],
      AvailableAtSlot: [],
      TimeOfSlot: [],
    });
    assert.equal(r.ok, false);
  });
  it("builds slots on happy path", () => {
    const r = buildMatrixFromGlobals({
      PeopleNames: ["Alice", "Bob"],
      PeopleIDs: ["1", "2"],
      TimeOfSlot: [1000, 1900, 2800],
      AvailableAtSlot: [["1"], ["1", "2"], ["2"]],
    });
    assert.equal(r.ok, true);
    assert.equal(r.slots.length, 3);
    assert.equal(r.stepMinutes, 15);
  });
  it("fails on non-finite TimeOfSlot epochs", () => {
    const r = buildMatrixFromGlobals({
      PeopleNames: ["Alice"],
      PeopleIDs: ["1"],
      TimeOfSlot: [1000, "nope", 2800],
      AvailableAtSlot: [["1"], ["1"], ["1"]],
    });
    assert.equal(r.ok, false);
    assert.match(r.error, /invalid timestamps/i);
  });
});

/** AE1: density trap vs continuous full hour */
describe("rankWindows AE1 density trap", () => {
  // 14:00, 14:15, 14:30, 14:45, 15:00, 15:15 as epochs
  const base = 1_700_000_000; // arbitrary
  const step = 15 * 60;
  const people8 = ["1", "2", "3", "4", "5", "6", "7", "8"];
  const slots = [
    { epoch: base + 0 * step, attendees: people8 }, // 14:00
    { epoch: base + 1 * step, attendees: people8 }, // 14:15
    { epoch: base + 2 * step, attendees: people8 }, // 14:30
    { epoch: base + 3 * step, attendees: people8 }, // 14:45
    // 15:00 — only 4 of the original 8; plus 4 newcomers (density)
    { epoch: base + 4 * step, attendees: ["1", "2", "3", "4", "9", "10", "11", "12"] },
    { epoch: base + 5 * step, attendees: ["9", "10", "11", "12", "13", "14", "15", "16"] },
  ];

  it("prefers full-hour continuous window over denser partial overlap", () => {
    const ranked = rankWindows(slots, 60, 15);
    const max = selectMaxCandidates(ranked);
    assert.ok(max.length >= 1);
    const best = max[0];
    assert.equal(best.score, 8);
    assert.equal(best.startEpoch, base);
    assert.equal(best.endEpoch, base + 60 * 60);
  });
});

describe("selectMaxCandidates AE2 ties", () => {
  const step = 15 * 60;
  const base = 2_000_000_000;
  const a = ["1", "2", "3"];
  // Two non-overlapping 60-min windows both score 3
  const slots = [
    { epoch: base + 0 * step, attendees: a },
    { epoch: base + 1 * step, attendees: a },
    { epoch: base + 2 * step, attendees: a },
    { epoch: base + 3 * step, attendees: a },
    // gap
    { epoch: base + 10 * step, attendees: a },
    { epoch: base + 11 * step, attendees: a },
    { epoch: base + 12 * step, attendees: a },
    { epoch: base + 13 * step, attendees: a },
  ];

  it("keeps two non-overlapping equal max windows", () => {
    const ranked = rankWindows(slots, 60, 15);
    const max = selectMaxCandidates(ranked);
    assert.equal(max.length, 2);
    assert.equal(max[0].score, 3);
    assert.equal(max[1].score, 3);
  });

  it("keeps sliding max windows including mid-block starts", () => {
    // Contiguous block of 6 slots → five 60-min slides, same people
    const block = [0, 1, 2, 3, 4, 5].map((i) => ({
      epoch: base + i * step,
      attendees: a,
    }));
    const ranked = rankWindows(block, 60, 15);
    const max = selectMaxCandidates(ranked);
    assert.equal(max.length, 3); // starts at 0, 15, 30 min into the block for 4-slot windows... wait 6 slots → need 4 for 60min → starts i=0,1,2 → 3 windows
    assert.equal(max[0].startEpoch, base);
    assert.equal(max[1].startEpoch, base + step);
    assert.equal(max[2].startEpoch, base + 2 * step);
  });
});

describe("filterByStartOffset", () => {
  const step = 15 * 60;
  // 2024-01-01 00:00 UTC
  const hour = Date.UTC(2024, 0, 1, 0, 0, 0) / 1000;
  const windows = [0, 1, 2, 3].map((i) => ({
    startEpoch: hour + i * step,
    endEpoch: hour + i * step + 60 * 60,
    score: 3,
    attendees: ["1"],
  }));

  it("keeps all when :30 and :15/:45 enabled", () => {
    assert.equal(filterByStartOffset(windows, "UTC", { include30: true, include15_45: true }).length, 4);
  });

  it("keeps :00 and :30 when only half-hour enabled", () => {
    const filtered = filterByStartOffset(windows, "UTC", { include30: true, include15_45: false });
    assert.deepEqual(
      filtered.map((w) => w.startEpoch),
      [hour, hour + 2 * step],
    );
  });

  it("keeps only :00 when both off", () => {
    const filtered = filterByStartOffset(windows, "UTC", { include30: false, include15_45: false });
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].startEpoch, hour);
  });
});

describe("empty intersection", () => {
  it("returns empty max when nobody overlaps full duration", () => {
    const step = 15 * 60;
    const base = 3_000_000_000;
    const slots = [
      { epoch: base, attendees: ["1"] },
      { epoch: base + step, attendees: ["2"] },
      { epoch: base + 2 * step, attendees: ["3"] },
      { epoch: base + 3 * step, attendees: ["4"] },
    ];
    const max = selectMaxCandidates(rankWindows(slots, 60, 15));
    assert.equal(max.length, 0);
  });
});
