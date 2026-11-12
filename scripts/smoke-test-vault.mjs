#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const args = process.argv.slice(2);
const vaultRoot = path.resolve(args[args.indexOf("--vault") + 1] || "");
const reportArgument = args.indexOf("--report");
if (!args.includes("--vault") || reportArgument < 0 || !args[reportArgument + 1]) {
  throw new Error("Pass --vault <marked obsidian-test-vault> --report <local report.json>.");
}
const reportFile = path.resolve(args[reportArgument + 1]);
if (path.basename(vaultRoot) !== "obsidian-test-vault" || !fs.existsSync(path.join(vaultRoot, ".mail-drop-test-vault"))) {
  throw new Error("Refusing an unmarked or nonstandard test vault.");
}
fs.mkdirSync(path.dirname(reportFile), { recursive: true });
if (fs.existsSync(reportFile)) throw new Error("Report already exists; choose a fresh path.");

// Obsidian's supported CLI executes this host-specific JS in its actual renderer.
async function acceptance(config) {
  const fs = require("node:fs");
  const path = require("node:path");
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const report = { realObsidian: true, appVersion: config.appVersion, realProviderDrag: false, nativeInsertionSimulated: true, checks: {} };
  const check = (name, ok) => { report.checks[name] = !!ok; if (!ok) throw Error(name); };
  const id = "attachment-link-rules";
  const mailId = "outlook-drop-importer";
  let leaf;
  let data;
  const dataPath = path.join(config.vaultRoot, ".obsidian/plugins", id, "data.json");
  const active = app.workspace.activeLeaf;
  const originallyEnabled = app.plugins.enabledPlugins.has(id);
  const mailEnabled = app.plugins.enabledPlugins.has(mailId);
  const contents = require("electron").remote.getCurrentWebContents();
  const backgroundThrottling = contents.getBackgroundThrottling();
  try {
    check("standard-isolated-vault", app.vault.adapter.getBasePath() === config.vaultRoot);
    // Run a hidden test pane without macOS focus changes or timer-budget delays.
    contents.setBackgroundThrottling(false);
    check("plugin-enabled", originallyEnabled);
    data = fs.existsSync(dataPath) ? fs.readFileSync(dataPath) : null;
    if (mailEnabled) await app.plugins.disablePlugin(mailId);
    const p = app.plugins.plugins[id];
    report.pluginVersion = p.manifest.version;
    p.settings = { linkExtensions: "pdf", embedExtensions: "png", unlistedAction: "default" };
    await p.saveSettings();
    await app.plugins.disablePlugin(id); await app.plugins.enablePlugin(id);
    check("settings-survive-reload", app.plugins.plugins[id].settings.linkExtensions === "pdf");
    const folder = "fixtures/attachment-link-rules/acceptance-" + Date.now();
    await app.vault.createFolder(folder);
    const note = await app.vault.create(folder + "/target.md", "# Acceptance\n");
    leaf = app.workspace.getLeaf("tab");
    if (active) app.workspace.setActiveLeaf(active, { focus: false });
    await leaf.openFile(note, { active: false });
    await leaf.setViewState({ type: "markdown", state: { file: note.path, mode: "source" }, active: false });
    check("active-note-preserved", app.workspace.activeLeaf === active);
    const view = leaf.view;
    const editor = view.editor;
    check("real-editor-available", !!editor);
    const emit = names => {
      const dt = new DataTransfer();
      for (const name of names) dt.items.add(new File([new Uint8Array()], name));
      // Observe a real renderer drop, then control native-completion timing.
      // Stop native storage here; the test writes through the public Vault API.
      view.contentEl.addEventListener("drop", event => { event.preventDefault(); event.stopPropagation(); }, { capture: true, once: true });
      const event = new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt });
      view.contentEl.dispatchEvent(event);
      return event;
    };
    const append = value => {
      const end = editor.offsetToPos(editor.getValue().length);
      editor.replaceRange(value, end);
    };
    for (const [name, bytes] of [
      ["empty.pdf", new Uint8Array()],
      ["invalid.pdf", Uint8Array.from([0, 255, 1, 2, 3])],
      ["large.pdf", new Uint8Array(16 * 1024 * 1024).fill(37)],
    ]) {
      editor.setValue("Human text ![[old.pdf]]\n"); await wait(50);
      emit([name]);
      const file = await app.vault.createBinary(folder + "/" + name, bytes.buffer);
      if (name === "large.pdf") await wait(1500);
      const link = app.fileManager.generateMarkdownLink(file, note.path).replace(/^!/, "");
      append("!" + link); await wait(350);
      check(name + "-syntax", editor.getValue().includes(link) && !editor.getValue().includes("!" + link));
      check(name + "-old-link-preserved", editor.getValue().includes("![[old.pdf]]"));
      check(name + "-exact-bytes", Buffer.from(await app.vault.readBinary(file)).equals(Buffer.from(bytes)));
    }
    editor.setValue("x ![[old.pdf]] end"); await wait(50);
    emit(["new.pdf"]);
    editor.setValue("typed x ![[old.pdf]] end ![[new.pdf]]"); await wait(350);
    check("concurrent-edit-preservation", editor.getValue() === "typed x ![[old.pdf]] end [[new.pdf]]");
    editor.setValue(""); await wait(50); emit(["slow.pdf"]);
    append("[[typed.png]]"); await wait(350);
    check("manual-link-not-captured", editor.getValue() === "[[typed.png]]");
    await wait(1500); append(" ![[slow.pdf]]"); await wait(350);
    check("slow-drop-still-pending", editor.getValue() === "[[typed.png]] [[slow.pdf]]");
    editor.setValue(""); await wait(50); emit(["one.pdf", "two.pdf"]);
    append("![[one.pdf]]"); await wait(350); await wait(1500);
    append(" ![[two.pdf]]"); await wait(350);
    check("multi-file-delayed-insertion", editor.getValue() === "[[one.pdf]] [[two.pdf]]");
    append(" ![[typed-after.pdf]]"); await wait(100);
    check("completed-drop-does-not-capture-typing", editor.getValue().endsWith("![[typed-after.pdf]]"));
    editor.setValue(""); await wait(50); emit(["unloaded.pdf"]);
    await app.plugins.disablePlugin(id); append("![[unloaded.pdf]]"); await wait(100);
    check("unload-cancels-pending-drop", editor.getValue() === "![[unloaded.pdf]]");
    await app.plugins.enablePlugin(id);
    check("reload-after-unload", !!app.plugins.plugins[id]);
    const request = { version: 1, fileName: "cooperative.pdf", link: "![[cooperative.pdf]]", handled: false };
    view.contentEl.ownerDocument.dispatchEvent(new CustomEvent("attachment-link-rules:format-v1", { detail: request }));
    check("cooperative-formatter", request.handled && request.link === "[[cooperative.pdf]]");
    editor.setValue(""); await wait(50);
    const managed = emit(["managed.pdf"]);
    view.contentEl.ownerDocument.dispatchEvent(new CustomEvent("attachment-link-rules:managed-drop-v1", { detail: { version: 1, event: managed } }));
    append("![[managed.pdf]]"); await wait(350);
    check("managed-drop-not-rewritten", editor.getValue() === "![[managed.pdf]]");
    report.passed = true;
  } catch (error) { report.passed = false; report.error = String(error); }
  finally {
    const restore = async (name, action) => {
      try { await action(); report.checks[name] = true; }
      catch (error) {
        report.checks[name] = false; report.passed = false;
        (report.restorationErrors ??= []).push(name + ": " + String(error));
      }
    };
    if (data !== undefined) {
      await restore("cleanup-plugin-unloaded", () => app.plugins.disablePlugin(id));
      await restore("settings-bytes-restored", () => {
        if (data === null) fs.rmSync(dataPath, { force: true }); else fs.writeFileSync(dataPath, data);
        if (!(data === null ? !fs.existsSync(dataPath) : fs.readFileSync(dataPath).equals(data))) throw Error("settings differ");
      });
      await restore("plugin-state-restored", async () => {
        if (originallyEnabled) await app.plugins.enablePlugin(id);
      });
      await restore("mail-state-restored", async () => {
        if (mailEnabled && !app.plugins.enabledPlugins.has(mailId)) await app.plugins.enablePlugin(mailId);
      });
    }
    await restore("test-tab-closed", () => { if (leaf) leaf.detach(); });
    await restore("active-note-restored", () => {
      if (active) app.workspace.setActiveLeaf(active, { focus: false });
      if (app.workspace.activeLeaf !== active) throw Error("active note differs");
    });
    await restore("background-throttling-restored", () => {
      contents.setBackgroundThrottling(backgroundThrottling);
      if (contents.getBackgroundThrottling() !== backgroundThrottling) throw Error("timer policy differs");
    });
    fs.writeFileSync(config.reportFile, JSON.stringify(report, null, 2));
  }
}
const appVersion = execFileSync("obsidian", ["version"], { encoding: "utf8" }).trim();
const code = `(${acceptance.toString()})(${JSON.stringify({ vaultRoot, reportFile, appVersion })}).catch(error => require('node:fs').writeFileSync(${JSON.stringify(reportFile)}, JSON.stringify({passed:false,error:String(error),stack:error.stack})))`;
const cliResult = execFileSync("obsidian", [`vault=${path.basename(vaultRoot)}`, "eval", `code=${code}`], { timeout: 60_000, encoding: "utf8" });
console.log(cliResult);
if (cliResult.startsWith("Error:")) throw new Error("Obsidian rejected the acceptance script.");
for (let i = 0; i < 240 && !fs.existsSync(reportFile); i++) await delay(250);
if (!fs.existsSync(reportFile)) throw new Error("The host did not produce its report.");
const report = JSON.parse(fs.readFileSync(reportFile, "utf8"));
console.log(JSON.stringify(report, null, 2));
if (!report.passed || Object.values(report.checks).some(value => !value)) process.exit(1);
