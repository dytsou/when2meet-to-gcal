import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { describe, it } from "node:test";

const USER_SCRIPT = fs.readFileSync(new URL("../when2meet-to-gcal.user.js", import.meta.url), "utf8");

class FakeElement {
  constructor(tagName, id = "") {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.style = {};
    this.dataset = {};
    this.className = "";
    this.innerHTML = "";
    this.children = [];
    this.parentNode = null;
    this.listeners = new Map();
    this.classList = {
      add: (...names) => {
        const values = new Set(this.className.split(/\s+/).filter(Boolean));
        names.forEach((name) => values.add(name));
        this.className = [...values].join(" ");
      },
      remove: (...names) => {
        const values = new Set(this.className.split(/\s+/).filter(Boolean));
        names.forEach((name) => values.delete(name));
        this.className = [...values].join(" ");
      },
      contains: (name) => this.className.split(/\s+/).includes(name),
    };
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
    this.parentNode = null;
  }

  addEventListener(type, handler) {
    this.listeners.set(type, handler);
  }

  setAttribute(name, value) {
    this[name] = String(value);
  }

  querySelector() {
    return null;
  }

  querySelectorAll() {
    return [];
  }

  getBoundingClientRect() {
    const slot = Number(this.id.replace("GroupTime", "")) / 900;
    const top = 200 + slot * 20 - this.fixture.scrollY;
    return { left: 100, top, right: 200, bottom: top + 20, width: 100, height: 20 };
  }
}

function createFixture() {
  const state = { scrollY: 0, nextFrame: 1, frames: new Map(), windowListeners: new Map() };
  const cells = [0, 900, 1800, 2700].map((epoch) => new FakeElement("div", `GroupTime${epoch}`));
  cells.forEach((cell) => {
    cell.fixture = state;
  });
  const documentElement = new FakeElement("html");
  const head = new FakeElement("head");
  const body = new FakeElement("body");
  const elements = new Map(cells.map((cell) => [cell.id, cell]));
  const findById = (node, id) => {
    if (node.id === id) return node;
    return node.children.map((child) => findById(child, id)).find(Boolean) || null;
  };
  const document = {
    readyState: "complete",
    documentElement,
    head,
    body,
    title: "Test when2meet",
    createElement: (tagName) => new FakeElement(tagName),
    getElementById: (id) => elements.get(id) || findById(head, id) || findById(body, id),
    querySelector: () => null,
    querySelectorAll: (selector) => {
      if (selector === ".w2m2gcal-band") {
        return body.children.filter((child) => child.classList.contains("w2m2gcal-band"));
      }
      if (selector === ".w2m2gcal-hi, .w2m2gcal-sel") {
        return cells.filter(
          (cell) => cell.classList.contains("w2m2gcal-hi") || cell.classList.contains("w2m2gcal-sel"),
        );
      }
      return [];
    },
    addEventListener: () => {},
  };
  const window = {
    innerWidth: 1280,
    innerHeight: 900,
    addEventListener: (type, handler) => {
      const handlers = state.windowListeners.get(type) || [];
      handlers.push(handler);
      state.windowListeners.set(type, handlers);
    },
    requestAnimationFrame: (handler) => {
      const id = state.nextFrame++;
      state.frames.set(id, handler);
      return id;
    },
    cancelAnimationFrame: (id) => state.frames.delete(id),
    open: () => ({}),
  };
  const pageGlobals = {
    PeopleNames: ["A"],
    PeopleIDs: ["1"],
    TimeOfSlot: [0, 900, 1800, 2700],
    AvailableAtSlot: [["1"], ["1"], ["1"], ["1"]],
    TimeZone: "UTC",
  };
  const context = {
    console,
    document,
    window,
    unsafeWindow: pageGlobals,
    GM_getValue: (_key, fallback) => fallback,
    GM_setValue: () => {},
    setTimeout: (handler) => handler(),
    clearTimeout: () => {},
    requestAnimationFrame: window.requestAnimationFrame,
    cancelAnimationFrame: window.cancelAnimationFrame,
    location: { search: "", href: "https://www.when2meet.com/Group" },
    URL,
    URLSearchParams,
    Intl,
  };

  vm.runInNewContext(USER_SCRIPT, context, { filename: "when2meet-to-gcal.user.js" });
  return { body, cells, state };
}

describe("userscript grid highlighting", () => {
  it("keeps the highlight attached to native cells while scrolling", () => {
    const fixture = createFixture();
    const highlightedBeforeScroll = fixture.cells.filter((cell) => cell.classList.contains("w2m2gcal-sel"));

    assert.equal(fixture.body.children.filter((child) => child.classList.contains("w2m2gcal-band")).length, 0);
    assert.equal(highlightedBeforeScroll.length, fixture.cells.length);

    fixture.state.scrollY = 120;
    fixture.state.windowListeners.get("scroll")?.forEach((handler) => handler());

    assert.deepEqual(
      fixture.cells.filter((cell) => cell.classList.contains("w2m2gcal-sel")),
      highlightedBeforeScroll,
    );
    assert.equal(fixture.state.frames.size, 0);
  });
});
