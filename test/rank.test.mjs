import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  snapDuration,
  rankWindows,
  selectMaxCandidates,
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

  it("thins sliding duplicates with same attendees", () => {
    // Contiguous block of 6 slots → many 60-min slides, same people
    const block = [0, 1, 2, 3, 4, 5].map((i) => ({
      epoch: base + i * step,
      attendees: a,
    }));
    const ranked = rankWindows(block, 60, 15);
    const max = selectMaxCandidates(ranked);
    assert.equal(max.length, 1);
    assert.equal(max[0].startEpoch, base);
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
