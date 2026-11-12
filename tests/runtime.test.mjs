import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import vm from "node:vm";
import { buildSync } from "esbuild";

// Obsidian hosts plugins in JavaScript; exercise the real bundled entrypoint
// through its public drop/editor-change lifecycle, with deterministic time.
const bundle = buildSync({
  entryPoints: ["src/main.ts"], bundle: true, platform: "node",
  format: "cjs", write: false, external: ["obsidian"],
}).outputFiles[0].text;

async function host(before = "", fileNames = ["large.pdf"]) {
  let now = 0;
  let nextId = 0;
  const timers = new Map();
  const clock = {
    setTimeout(callback, delay) { const id = ++nextId; timers.set(id, { at: now + delay, callback }); return id; },
    clearTimeout(id) { timers.delete(id); },
  };
  function advance(milliseconds) {
    const end = now + milliseconds;
    for (;;) {
      const next = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      now = next[1].at; timers.delete(next[0]); next[1].callback();
    }
    now = end;
  }
  const document = new EventTarget();
  document.defaultView = { Event };
  const events = new EventEmitter();
  class MarkdownView {}
  const editor = {
    text: before,
    getValue() { return this.text; },
    offsetToPos(ch) { return { line: 0, ch }; },
    replaceRange(value, from, to) {
      this.text = this.text.slice(0, from.ch) + value + this.text.slice(to.ch);
      events.emit("editor-change", editor, view);
    },
  };
  const view = new MarkdownView();
  Object.assign(view, { editor, file: { path: "acceptance.md" }, containerEl: { ownerDocument: document, contains: target => target === document } });
  const app = { workspace: {
    containerEl: { ownerDocument: document },
    iterateAllLeaves(callback) { callback({ view }); },
    on(name, callback) { events.on(name, callback); return { name, callback }; },
    offref(ref) { events.off(ref.name, ref.callback); },
  } };
  class Plugin {
    constructor(app) { this.app = app; this.cleanups = []; }
    async loadData() { return null; }
    addSettingTab() {}
    register(callback) { this.cleanups.push(callback); }
    registerDomEvent(target, name, callback, options) {
      target.addEventListener(name, callback, options);
      this.register(() => target.removeEventListener(name, callback, options));
    }
    registerEvent(ref) { this.register(() => app.workspace.offref(ref)); }
  }
  class PluginSettingTab { constructor(app) { this.app = app; } }
  const module = { exports: {} };
  vm.runInNewContext(bundle, {
    module, exports: module.exports, window: clock, Event,
    require: name => {
      assert.equal(name, "obsidian");
      return { Plugin, MarkdownView, PluginSettingTab, Setting: class {}, Notice: class {}, requireApiVersion: () => true };
    },
  });
  const plugin = new module.exports.default(app);
  await plugin.onload();
  const drop = new Event("drop");
  Object.defineProperty(drop, "dataTransfer", { value: { files: fileNames.map(name => ({ name })) } });
  document.dispatchEvent(drop);
  return {
    plugin, document, editor, view, drop, advance,
    change(text) { editor.text = text; events.emit("editor-change", editor, view); },
    unload() { plugin.onunload(); for (const fn of plugin.cleanups.reverse()) fn(); },
    pendingTimers() { return timers.size; },
  };
}

test("native insertion after a slow transfer is still formatted", async () => {
  const h = await host("Human text.");
  h.advance(1500);
  h.change("Human text. ![[large.pdf]]");
  h.advance(0);
  assert.equal(h.editor.text, "Human text. [[large.pdf]]");
  h.unload();
});

test("concurrent edits retain old attachment syntax", async () => {
  const h = await host("x ![[old.pdf]] end", ["new.pdf"]);
  h.change("typed x ![[old.pdf]] end ![[new.pdf]]");
  h.advance(0);
  assert.equal(h.editor.text, "typed x ![[old.pdf]] end [[new.pdf]]");
  h.unload();
});

test("separate native insertions in one multi-file drop are all formatted", async () => {
  const h = await host("", ["one.pdf", "two.pdf"]);
  h.change("![[one.pdf]]"); h.advance(0);
  h.advance(1500);
  h.change(h.editor.text + " ![[two.pdf]]"); h.advance(0);
  assert.equal(h.editor.text, "[[one.pdf]] [[two.pdf]]");
  assert.equal(h.pendingTimers(), 0);
  h.unload();
});

test("a completed correct-format drop does not capture later typing", async () => {
  const h = await host("", ["already-correct.pdf"]);
  h.change("[[already-correct.pdf]]"); h.advance(0);
  h.change(h.editor.text + " ![[typed-later.pdf]]"); h.advance(0);
  assert.equal(h.editor.text, "[[already-correct.pdf]] ![[typed-later.pdf]]");
  h.unload();
});

test("navigating to another file cancels the old pending drop", async () => {
  const h = await host();
  h.view.file = { path: "different.md" };
  h.change("![[existing.pdf]]"); h.advance(0);
  assert.equal(h.editor.text, "![[existing.pdf]]");
  h.unload();
});

test("unload cancels pending work and removes listeners", async () => {
  const h = await host();
  h.unload(); h.advance(2000);
  h.change("![[after-unload.pdf]]"); h.advance(0);
  assert.equal(h.editor.text, "![[after-unload.pdf]]");
  assert.equal(h.pendingTimers(), 0);
});

test("an importer-managed drop stays under the importer's control", async () => {
  const h = await host();
  const claim = new Event("attachment-link-rules:managed-drop-v1");
  Object.defineProperty(claim, "detail", { value: { version: 1, event: h.drop } });
  h.document.dispatchEvent(claim);
  h.change("![[importer.pdf]]"); h.advance(0);
  assert.equal(h.editor.text, "![[importer.pdf]]");
  h.unload();
});

test("typing an unrelated link does not consume a slow external drop", async () => {
  const h = await host();
  h.advance(1500);
  h.change("![[typed.png]]"); h.advance(0);
  assert.equal(h.editor.text, "![[typed.png]]");
  h.change(h.editor.text + " ![[large.pdf]]"); h.advance(0);
  assert.equal(h.editor.text, "![[typed.png]] [[large.pdf]]");
  assert.equal(h.pendingTimers(), 0);
  h.unload();
});

test("text-only drops cannot capture attachment syntax typed later", async () => {
  const h = await host("plain text", []);
  h.advance(0);
  h.change("plain text ![[typed.pdf]]"); h.advance(0);
  assert.equal(h.editor.text, "plain text ![[typed.pdf]]");
  assert.equal(h.pendingTimers(), 0);
  h.unload();
});

test("an ambiguous duplicate finishes without rewriting old or later links", async () => {
  const h = await host("x ![[old.pdf]] end", ["old.pdf"]);
  h.change("typed x ![[old.pdf]] end ![[old.pdf]]"); h.advance(0);
  assert.equal(h.pendingTimers(), 0);
  h.change(h.editor.text + " ![[later.pdf]]"); h.advance(0);
  assert.equal(h.editor.text, "typed x ![[old.pdf]] end ![[old.pdf]] ![[later.pdf]]");
  h.unload();
});

test("a drop that never inserts syntax expires without capturing later typing", async () => {
  const h = await host();
  h.advance(60_001);
  h.change("![[large.pdf]]"); h.advance(0);
  assert.equal(h.editor.text, "![[large.pdf]]");
  assert.equal(h.pendingTimers(), 0);
  h.unload();
});

test("identical-token prepend/append ambiguity still completes the drop", async () => {
  const h = await host("![[old.pdf]]", ["old.pdf"]);
  h.change("![[old.pdf]]![[old.pdf]]"); h.advance(0);
  assert.equal(h.editor.text, "![[old.pdf]]![[old.pdf]]");
  assert.equal(h.pendingTimers(), 0);
  h.unload();
});
