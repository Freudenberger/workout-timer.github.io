/*
 * Minimal DOM stub, just enough to boot the browser bundle inside node.
 *
 * It is deliberately permissive: every element lookup succeeds and returns a
 * recording stub. That makes it useless for asserting layout, but very good at
 * catching load-order and wiring mistakes across the script files.
 */
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..", "..");

class FakeClassList {
  constructor() {
    this.set = new Set();
  }
  add(...names) {
    names.forEach((name) => this.set.add(name));
  }
  remove(...names) {
    names.forEach((name) => this.set.delete(name));
  }
  toggle(name, force) {
    const on = force === undefined ? !this.set.has(name) : Boolean(force);
    if (on) this.set.add(name);
    else this.set.delete(name);
    return on;
  }
  contains(name) {
    return this.set.has(name);
  }
  get value() {
    return Array.from(this.set).join(" ");
  }
}

/**
 * Registry of elements by id, shared with the current fake document so that
 * controls created through innerHTML become findable with getElementById.
 */
let currentRegistry = null;

const ATTR_RE = /([\w-]+)="([^"]*)"/g;

function parseAttributes(source) {
  const attrs = {};
  for (const match of source.matchAll(ATTR_RE)) {
    attrs[match[1]] = match[2];
  }
  return attrs;
}

/**
 * Very small scanner for the markup the app generates: it picks up inputs,
 * selects and buttons with their attributes so form queries work. It is not a
 * real HTML parser and does not build a tree.
 */
function parseControls(html) {
  const controls = [];
  const tagRe = /<(input|select|button)\b([^>]*)>/g;
  let match;
  while ((match = tagRe.exec(html)) !== null) {
    const [, tag, rawAttrs] = match;
    const attrs = parseAttributes(rawAttrs);
    const el = new FakeElement(tag, attrs.id ?? "");
    Object.entries(attrs).forEach(([name, value]) => {
      el.attributes[name] = value;
      if (name.startsWith("data-")) {
        const key = name
          .slice(5)
          .replace(/-([a-z])/g, (_, char) => char.toUpperCase());
        el.dataset[key] = value;
      }
    });
    if (attrs.class) el.classList.add(...attrs.class.split(/\s+/));
    if (tag === "select") {
      const rest = html.slice(match.index);
      const selected = /<option value="([^"]*)"\s+selected/.exec(
        rest.slice(0, rest.indexOf("</select>") + 1),
      );
      const first = /<option value="([^"]*)"/.exec(rest);
      el.value = selected ? selected[1] : (first?.[1] ?? "");
    } else {
      el.value = attrs.value ?? "";
    }
    if (el.id && currentRegistry) currentRegistry.set(el.id, el);
    controls.push(el);
  }
  return controls;
}

function matchesSelector(el, selector) {
  if (selector.startsWith("[") && selector.endsWith("]")) {
    const attr = selector.slice(1, -1);
    if (attr.startsWith("data-")) {
      const key = attr
        .slice(5)
        .replace(/-([a-z])/g, (_, char) => char.toUpperCase());
      return el.dataset[key] !== undefined;
    }
    return el.attributes[attr] !== undefined;
  }
  if (selector.startsWith(".")) return el.classList.contains(selector.slice(1));
  return false;
}

class FakeElement {
  constructor(tagName = "div", id = "") {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.textContent = "";
    this._innerHTML = "";
    this._controls = [];
    this.value = "";
    this.checked = false;
    this.disabled = false;
    this.scrollTop = 0;
    this.classList = new FakeClassList();
    this.style = {
      setProperty(name, value) {
        this[name] = value;
      },
    };
    this.dataset = {};
    this.children = [];
    this.attributes = {};
    this.listeners = {};
  }
  addEventListener(type, handler) {
    (this.listeners[type] ||= []).push(handler);
  }
  removeEventListener() {}
  dispatch(type, event = {}) {
    (this.listeners[type] || []).forEach((handler) => handler(event));
  }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }
  getAttribute(name) {
    return this.attributes[name] ?? null;
  }
  appendChild(child) {
    this.children.push(child);
    return child;
  }
  prepend(child) {
    this.children.unshift(child);
    return child;
  }
  insertAdjacentElement(_position, child) {
    this.children.push(child);
    return child;
  }
  get innerHTML() {
    return this._innerHTML;
  }
  set innerHTML(html) {
    this._innerHTML = html;
    this._controls = parseControls(html);
  }
  closest() {
    return null;
  }
  querySelector(selector) {
    return this._controls.find((el) => matchesSelector(el, selector)) ?? null;
  }
  querySelectorAll(selector) {
    return this._controls.filter((el) => matchesSelector(el, selector));
  }
  focus() {}
  get firstChild() {
    return this.children[0] ?? null;
  }
}

/** Install the globals the bundle expects, and return them for assertions. */
function install({ search = "", hash = "", type = "emom" } = {}) {
  const elements = new Map();
  currentRegistry = elements;
  const element = (id) => {
    if (!elements.has(id)) elements.set(id, new FakeElement("div", id));
    return elements.get(id);
  };
  // The real page ships a populated <select id="workoutType">.
  element("workoutType").value = type;

  const document = {
    readyState: "complete",
    cookie: "",
    body: new FakeElement("body"),
    documentElement: new FakeElement("html"),
    getElementById: (id) => element(id),
    createElement: (tag) => new FakeElement(tag),
    querySelector: (selector) => element(`sel:${selector}`),
    querySelectorAll: () => [],
    addEventListener: () => {},
  };

  const storage = new Map();
  const window = globalThis;
  // Some of these (navigator) are getter-only on the node global.
  const define = (values) => {
    Object.entries(values).forEach(([key, value]) => {
      Object.defineProperty(globalThis, key, {
        value,
        writable: true,
        configurable: true,
      });
    });
  };
  define({
    window,
    document,
    HTMLElement: FakeElement,
    navigator: { userAgent: "node", clipboard: { writeText: async () => {} } },
    location: {
      search,
      hash,
      href: `https://example.com/${search}${hash}`,
      origin: "https://example.com",
      pathname: "/",
    },
    history: { replaceState() {} },
    getComputedStyle: () => ({ getPropertyValue: () => "1" }),
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => {},
    localStorage: {
      getItem: (key) => (storage.has(key) ? storage.get(key) : null),
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key),
    },
    scrollTo: () => {},
    prompt: () => null,
    addEventListener: () => {},
  });

  return { document, elements, element, storage };
}

/** Script sources in the order index.html loads them. */
function scriptSources() {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  return Array.from(html.matchAll(/<script src="(src\/[^"]+)"><\/script>/g)).map(
    (match) => match[1],
  );
}

/** Evaluate the bundle the way a browser would: shared global, in order. */
function loadBundle(options) {
  const context = install(options);
  delete globalThis.WT;
  const sources = scriptSources();
  sources.forEach((src) => {
    const file = path.join(ROOT, src);
    vm.runInThisContext(fs.readFileSync(file, "utf8"), { filename: file });
  });
  return { ...context, sources, WT: globalThis.WT };
}

module.exports = { FakeElement, FakeClassList, install, loadBundle, scriptSources };
