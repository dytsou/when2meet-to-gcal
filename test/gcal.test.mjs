import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildTemplateUrl, formatLocalStamp } from "../src/gcal.mjs";

describe("buildTemplateUrl", () => {
  it("encodes special characters and includes ctz", () => {
    const url = buildTemplateUrl({
      title: "Meet & Greet #1",
      startEpoch: 1700000000,
      endEpoch: 1700003600,
      timeZone: "America/New_York",
      details: "from https://www.when2meet.com/?123-abc\nline2",
    });
    assert.match(url, /action=TEMPLATE/);
    assert.match(url, /ctz=America%2FNew_York/);
    assert.match(url, /text=Meet/);
    assert.ok(url.includes("dates="));
    const u = new URL(url);
    assert.equal(u.searchParams.get("text"), "Meet & Greet #1");
  });

  it("throws without timezone", () => {
    assert.throws(() =>
      buildTemplateUrl({
        title: "x",
        startEpoch: 1,
        endEpoch: 2,
        timeZone: "",
      }),
    );
  });
});

describe("formatLocalStamp", () => {
  it("returns compact local stamp", () => {
    const s = formatLocalStamp(1700000000, "UTC");
    assert.match(s, /^\d{8}T\d{6}$/);
  });
});
