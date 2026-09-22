import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXTENSION = path.join(ROOT, "extension");
const REQUEST_EVENT = "w2m2gcal:storage-request";
const RESPONSE_EVENT = "w2m2gcal:storage-response";

function readExtensionFile(name) {
  return fs.readFileSync(path.join(EXTENSION, name), "utf8");
}

class FakeCustomEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.detail = init.detail;
  }
}

class FakeWindow {
  #listeners = new Map();

  addEventListener(type, handler) {
    const handlers = this.#listeners.get(type) || [];
    handlers.push(handler);
    this.#listeners.set(type, handlers);
  }

  dispatchEvent(event) {
    for (const handler of this.#listeners.get(event.type) || []) handler(event);
    return true;
  }
}

function execute(source, context) {
  vm.runInNewContext(source, context, { filename: "extension-test.js" });
}

function createContext(window, values = {}) {
  return {
    window,
    CustomEvent: FakeCustomEvent,
    crypto: { randomUUID: () => `request-${Math.random().toString(16).slice(2)}` },
    setTimeout,
    clearTimeout,
    Promise,
    console,
    ...values,
  };
}

describe("Chrome extension package", () => {
  it("declares a narrow Manifest V3 package", () => {
    const manifest = JSON.parse(readExtensionFile("manifest.json"));
    const packageVersion = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).version;

    assert.equal(manifest.manifest_version, 3);
    assert.equal(manifest.version, packageVersion);
    assert.deepEqual(manifest.permissions, ["storage"]);
    assert.equal(manifest.background, undefined);
    assert.equal(manifest.externally_connectable, undefined);
    assert.equal(manifest.web_accessible_resources, undefined);
    assert.deepEqual(manifest.content_scripts, [
      {
        matches: ["https://when2meet.com/*", "https://www.when2meet.com/*"],
        js: ["storage-bridge.js"],
        run_at: "document_idle",
        all_frames: false,
      },
      {
        matches: ["https://when2meet.com/*", "https://www.when2meet.com/*"],
        js: ["main.js"],
        run_at: "document_idle",
        all_frames: false,
        world: "MAIN",
      },
    ]);
    assert.ok(fs.statSync(path.join(EXTENSION, "LICENSE")).isFile());
  });

  it("hydrates only validated preferences through the isolated bridge", async () => {
    const window = new FakeWindow();
    const storage = {
      "w2m2gcal.durationMinutes": 90,
      "w2m2gcal.panelPos": { left: 40, top: 80 },
      "w2m2gcal.panelMinimized": true,
      "w2m2gcal.panelMinPos": { left: 24, bottom: 32 },
      "w2m2gcal.include30Starts": false,
      "w2m2gcal.include15_45Starts": true,
    };
    const calls = { get: [], set: [] };
    const bridgeContext = createContext(window, {
      chrome: {
        storage: {
          local: {
            async get(key) {
              calls.get.push(key);
              return { [key]: storage[key] };
            },
            async set(value) {
              calls.set.push(value);
              Object.assign(storage, value);
            },
          },
        },
      },
    });

    execute(readExtensionFile("storage-bridge.js"), bridgeContext);
    const mainContext = createContext(window);
    execute(readExtensionFile("main-preamble.js"), mainContext);
    await mainContext.__w2m2gcalStorageReady;

    assert.equal(mainContext.GM_getValue("w2m2gcal.durationMinutes", 60), 90);
    assert.equal(mainContext.GM_getValue("w2m2gcal.panelMinimized", false), true);
    assert.equal(mainContext.GM_getValue("w2m2gcal.include30Starts", true), false);
    assert.equal(mainContext.GM_getValue("w2m2gcal.panelPos", null).left, 40);
    assert.equal(mainContext.GM_getValue("w2m2gcal.panelPos", null).top, 80);
    assert.deepEqual(calls.get.sort(), Object.keys(storage).sort());

    const position = mainContext.GM_getValue("w2m2gcal.panelPos", null);
    position.left = 0;
    assert.equal(mainContext.GM_getValue("w2m2gcal.panelPos", null).left, 40);
    assert.equal(mainContext.GM_getValue("w2m2gcal.panelPos", null).top, 80);

    mainContext.GM_setValue("w2m2gcal.include30Starts", false);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(calls.set.length, 0);

    mainContext.GM_setValue("w2m2gcal.include30Starts", true);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(calls.set.length, 1);
    assert.equal(calls.set[0]["w2m2gcal.include30Starts"], true);

    mainContext.GM_setValue("w2m2gcal.include30Starts", true);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(calls.set.length, 1);

    const readsBeforeUnknownRequest = calls.get.length;
    window.dispatchEvent(
      new FakeCustomEvent(REQUEST_EVENT, {
        detail: {
          version: 1,
          requestId: "request-unknown-key",
          operation: "read",
          key: "unrelated.preference",
        },
      }),
    );
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(calls.get.length, readsBeforeUnknownRequest);
  });

  it("ignores malformed and duplicate MAIN-world responses", async () => {
    const window = new FakeWindow();
    const defaults = {
      "w2m2gcal.durationMinutes": 60,
      "w2m2gcal.panelPos": null,
      "w2m2gcal.panelMinimized": false,
      "w2m2gcal.panelMinPos": null,
      "w2m2gcal.include30Starts": true,
      "w2m2gcal.include15_45Starts": true,
    };
    window.addEventListener(REQUEST_EVENT, (event) => {
      const { requestId, key } = event.detail;
      const value = key === "w2m2gcal.durationMinutes" ? 75 : defaults[key];
      if (key === "w2m2gcal.durationMinutes") {
        window.dispatchEvent(
          new FakeCustomEvent(RESPONSE_EVENT, {
            detail: { version: 1, requestId, operation: "read", key, value: "bad" },
          }),
        );
      }
      window.dispatchEvent(
        new FakeCustomEvent(RESPONSE_EVENT, {
          detail: { version: 1, requestId, operation: "read", key, value },
        }),
      );
      window.dispatchEvent(
        new FakeCustomEvent(RESPONSE_EVENT, {
          detail: { version: 1, requestId, operation: "read", key, value: 999 },
        }),
      );
    });

    const mainContext = createContext(window);
    execute(readExtensionFile("main-preamble.js"), mainContext);
    await mainContext.__w2m2gcalStorageReady;

    assert.equal(mainContext.GM_getValue("w2m2gcal.durationMinutes", 60), 75);
    assert.equal(mainContext.GM_getValue("unrelated.preference", "fallback"), "fallback");
  });

  it("builds a reviewed runner from the userscript source", () => {
    execFileSync(process.execPath, ["scripts/build-extension.mjs", "check"], {
      cwd: ROOT,
      stdio: "pipe",
    });

    const main = readExtensionFile("main.js");
    assert.match(main, /Generated from when2meet-to-gcal\.user\.js/);
    assert.doesNotMatch(main, /\bchrome\s*\./);
    assert.doesNotMatch(main, /^\/\/ ==UserScript==/m);
  });
});
