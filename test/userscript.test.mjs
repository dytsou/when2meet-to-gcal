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

  get parentElement() {
    return this.parentNode;
  }

  contains(node) {
    for (let current = node; current; current = current.parentNode) {
      if (current === this) return true;
    }
    return false;
  }

  closest(selector) {
    if (selector === '[id^="GroupTime"]' && this.id.startsWith("GroupTime")) return this;
    return null;
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
    if (this === this.fixture?.grid) {
      const top = 100 - this.fixture.pageScrollY;
      return { left: 100, top, right: 600, bottom: top + 500, width: 500, height: 500 };
    }
    const slot = Number(this.id.replace("GroupTime", "")) / 900;
    const gridRect = this.fixture.grid.getBoundingClientRect();
    const left = gridRect.left + 30 - this.fixture.grid.scrollLeft;
    const top = gridRect.top + 20 + slot * 20 - this.fixture.grid.scrollTop;
    return { left, top, right: left + 40, bottom: top + 20, width: 40, height: 20 };
  }
}

function createFixture(slotEpochs = [0, 900, 1800, 2700], gridViewport = {}) {
  const state = {
    pageScrollY: 0,
    nextFrame: 1,
    frames: new Map(),
    windowListeners: new Map(),
    documentListeners: new Map(),
  };
  const cells = slotEpochs.map((epoch) => new FakeElement("div", `GroupTime${epoch}`));
  cells.forEach((cell) => {
    cell.fixture = state;
  });
  const documentElement = new FakeElement("html");
  const head = new FakeElement("head");
  const body = new FakeElement("body");
  const grid = new FakeElement("div");
  grid.className = "GroupGrid";
  grid.fixture = state;
  grid.scrollTop = gridViewport.scrollTop || 0;
  grid.scrollLeft = gridViewport.scrollLeft || 0;
  grid.clientTop = gridViewport.clientTop || 0;
  grid.clientLeft = gridViewport.clientLeft || 0;
  const rows = cells.map((cell) => {
    const row = new FakeElement("div");
    row.appendChild(cell);
    return row;
  });
  rows.forEach((row) => grid.appendChild(row));
  body.appendChild(grid);
  state.grid = grid;
  const elements = new Map(cells.map((cell) => [cell.id, cell]));
  const findById = (node, id) => {
    if (node.id === id) return node;
    return node.children.map((child) => findById(child, id)).find(Boolean) || null;
  };
  const descendants = (node) =>
    node.children.flatMap((child) => [child, ...descendants(child)]);
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
      const all = [...descendants(head), ...descendants(body)];
      if (selector === ".w2m2gcal-band") return all.filter((el) => el.classList.contains("w2m2gcal-band"));
      if (selector === ".w2m2gcal-hi, .w2m2gcal-sel") {
        return all.filter(
          (cell) => cell.classList.contains("w2m2gcal-hi") || cell.classList.contains("w2m2gcal-sel"),
        );
      }
      return [];
    },
    addEventListener: (type, handler) => {
      const handlers = state.documentListeners.get(type) || [];
      handlers.push(handler);
      state.documentListeners.set(type, handlers);
    },
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
    TimeOfSlot: slotEpochs,
    AvailableAtSlot: slotEpochs.map(() => ["1"]),
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
    getComputedStyle: (element) => ({ position: element.style.position || "static" }),
  };

  vm.runInNewContext(USER_SCRIPT, context, { filename: "when2meet-to-gcal.user.js" });
  return { body, cells, grid, head, document, state };
}

describe("userscript grid highlighting", () => {
  it("draws one red frame around the selected time range", () => {
    const fixture = createFixture([0, 900, 1800, 2700], {
      scrollTop: 40,
      scrollLeft: 12,
      clientTop: 3,
      clientLeft: 2,
    });
    const frames = () => fixture.document.querySelectorAll(".w2m2gcal-band");
    const frame = () => frames()[0];

    assert.equal(frames().length, 1);
    assert.equal(frame().parentNode, fixture.grid);
    assert.equal(fixture.cells.filter((cell) => cell.classList.contains("w2m2gcal-hi")).length, 0);
    assert.equal(fixture.cells.filter((cell) => cell.classList.contains("w2m2gcal-sel")).length, 0);
    assert.equal(Number.parseFloat(frame().style.left), 28);
    assert.equal(Number.parseFloat(frame().style.top), 17);
    assert.equal(Number.parseFloat(frame().style.width), 40);
    assert.equal(Number.parseFloat(frame().style.height), 80);
    assert.equal(fixture.grid.style.position, "relative");

    const style = fixture.head.children.find((child) => child.id === "w2m2gcal-style");
    assert.match(style.textContent, /\.w2m2gcal-band/);
    assert.match(style.textContent, /border: 3px solid #c2410c/);
    assert.doesNotMatch(style.textContent, /\.w2m2gcal-(hi|sel)/);

    const initialFrameStyle = { ...frame().style };
    fixture.state.pageScrollY = 120;
    fixture.state.windowListeners.get("scroll")?.forEach((handler) => handler());

    assert.deepEqual(frame().style, initialFrameStyle);
    assert.equal(frames().length, 1);
    assert.equal(fixture.state.frames.size, 0);
  });

  it("keeps the selected window when a clicked cell belongs to overlapping windows", () => {
    const fixture = createFixture([0, 900, 1800, 2700, 3600]);
    const clickCell = (epoch) => {
      const cell = fixture.cells.find((candidate) => candidate.id === `GroupTime${epoch}`);
      fixture.state.documentListeners.get("click").forEach((handler) => handler({ target: cell }));
    };

    assert.equal(fixture.document.querySelectorAll(".w2m2gcal-band").length, 0);
    clickCell(3600);
    assert.equal(fixture.document.querySelectorAll(".w2m2gcal-band").length, 1);
    const selectedFrameTop = Number.parseFloat(fixture.document.querySelectorAll(".w2m2gcal-band")[0].style.top);

    clickCell(900);

    assert.equal(
      Number.parseFloat(fixture.document.querySelectorAll(".w2m2gcal-band")[0].style.top),
      selectedFrameTop,
    );
  });
});
