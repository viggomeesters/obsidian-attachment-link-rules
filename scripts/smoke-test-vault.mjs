#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const DEFAULT_PORT = 9222;
const PLUGIN_ID = "attachment-link-rules";
const TEST_VAULT_NAME = "obsidian-test-vault";

async function main() {
  if (shouldDelegateToWindowsNode()) {
    runWithWindowsNode();
    return;
  }

  const args = parseArgs(process.argv.slice(2));
  const port = Number(args.port ?? process.env.OBSIDIAN_CDP_PORT ?? DEFAULT_PORT);
  const host = String(args.host ?? process.env.OBSIDIAN_CDP_HOST ?? "127.0.0.1");
  const screenshotPath = String(args.screenshot ?? `/tmp/${PLUGIN_ID}-smoke-${timestampForFile()}.png`);

  try {
    const target = await findObsidianTarget(host, port);
    const client = await CdpClient.connect(target.webSocketDebuggerUrl);
    try {
      await client.send("Runtime.enable");
      await client.send("Page.enable").catch(() => undefined);
      const result = await evaluateSmoke(client);
      if (!result.ok) throw new Error(result.error ?? "Runtime smoke returned ok=false");
      const screenshot = await client.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
      await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
      await fs.writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));
      result.screenshot = screenshotPath;
      await client.send("Runtime.evaluate", {
        expression: `(async () => { const file = window.app?.vault?.getAbstractFileByPath(${JSON.stringify("plugin-smoke/attachment-link-rules-smoke.md")}); if (file) await window.app.fileManager.trashFile(file); return true; })()`,
        awaitPromise: true,
        returnByValue: true,
      }).catch(() => undefined);
      console.log(JSON.stringify(result, null, 2));
    } finally {
      client.close();
    }
  } catch (error) {
    console.error(formatFailure(error, host, port));
    process.exit(1);
  }
}

function shouldDelegateToWindowsNode() {
  return process.platform === "linux"
    && os.release().toLowerCase().includes("microsoft")
    && !process.env.ATTACHMENT_LINK_RULES_CDP_WINDOWS_NODE;
}

function runWithWindowsNode() {
  const converted = spawnSync("wslpath", ["-w", path.resolve(process.argv[1])], { encoding: "utf8" });
  if (converted.status !== 0) throw new Error(`wslpath failed: ${converted.stderr || converted.stdout}`);
  const command = `$env:ATTACHMENT_LINK_RULES_CDP_WINDOWS_NODE='1'; node ${[converted.stdout.trim(), ...process.argv.slice(2)].map(quotePowerShellString).join(", ")}`;
  const result = spawnSync("powershell.exe", ["-NoProfile", "-Command", command], { stdio: "inherit" });
  process.exit(result.status ?? 1);
}

function quotePowerShellString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--port" || value === "--host" || value === "--screenshot") parsed[value.slice(2)] = values[++index];
    else throw new Error(`Unknown argument: ${value}`);
  }
  return parsed;
}

async function findObsidianTarget(host, port) {
  const response = await fetch(`http://${host}:${port}/json/list`);
  if (!response.ok) throw new Error(`CDP endpoint returned ${response.status} ${response.statusText}`);
  const targets = await response.json();
  const pages = targets.filter((target) => target.type === "page" && target.webSocketDebuggerUrl);
  const obsidian = pages.find((target) => /obsidian/i.test(`${target.title} ${target.url}`)) ?? pages[0];
  if (!obsidian) throw new Error("No CDP page target found");
  return obsidian;
}

async function evaluateSmoke(client) {
  const expression = `(${browserSmoke.toString()})(${JSON.stringify({ pluginId: PLUGIN_ID, testVaultName: TEST_VAULT_NAME })})`;
  const response = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
    timeout: 60_000,
  });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text);
  return response.result.value;
}

async function browserSmoke(config) {
  const sleep = (milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));
  const assert = (condition, message, details = {}) => {
    if (!condition) {
      const error = new Error(message);
      error.details = details;
      throw error;
    }
  };

  let app = window.app;
  for (let attempt = 0; attempt < 30 && !app?.vault; attempt += 1) {
    await sleep(500);
    app = window.app;
  }
  assert(app?.vault && app?.workspace, "App object is unavailable after waiting for vault startup");
  const vaultName = app.vault.getName?.() ?? "";
  assert(vaultName === config.testVaultName, "Wrong vault is open", { vaultName });
  const plugin = app.plugins?.plugins?.[config.pluginId];
  assert(plugin, "Plugin is not loaded", { enabled: Array.from(app.plugins?.enabledPlugins ?? []) });

  const folder = "plugin-smoke";
  const path = `${folder}/attachment-link-rules-smoke.md`;
  for (const staleLeaf of app.workspace.getLeavesOfType("folder-sort-view")) staleLeaf.detach();
  if (!app.vault.getAbstractFileByPath(folder)) await app.vault.createFolder(folder);
  const existing = app.vault.getAbstractFileByPath(path);
  if (existing) await app.fileManager.trashFile(existing);
  const file = await app.vault.create(path, "# Attachment Link Rules smoke\n");
  const leaf = app.workspace.getLeaf(false);
  await leaf.openFile(file);
  await sleep(300);
  const editor = leaf.view?.editor;
  assert(editor, "Markdown editor did not open");

  editor.setValue("# Attachment Link Rules smoke\n");
  document.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true }));
  editor.replaceRange("![[report.pdf]]", editor.getCursor());
  await sleep(750);
  const pdfText = editor.getValue();
  assert(pdfText.includes("[[report.pdf]]"), "PDF link was not inserted", { pdfText });
  assert(!pdfText.includes("![[report.pdf]]"), "PDF embed marker was not removed", { pdfText });

  const imageBefore = editor.getValue();
  assert(typeof plugin.scheduleRewrite === "function", "Runtime rewrite method is unavailable");
  plugin.scheduleRewrite(editor, imageBefore, 0);
  editor.replaceRange("[[diagram.png]]", editor.getCursor());
  await sleep(750);
  const imageText = editor.getValue();
  assert(imageText.includes("![[diagram.png]]"), "Image embed marker was not added", { imageText });

  return {
    ok: true,
    vaultName,
    pluginLoaded: true,
    pdfRule: "link",
    imageRule: "embed",
    finalText: imageText,
    fixturePath: path,
  };
}

function timestampForFile() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function formatFailure(error, host, port) {
  return [
    `Runtime smoke failed: ${error?.message ?? error}`,
    `Expected the test vault at http://${host}:${port}.`,
    "Close any non-CDP app instance, then launch:",
    `powershell.exe -NoProfile -Command 'Start-Process "$env:LOCALAPPDATA\\Programs\\Obsidian\\Obsidian.exe" -ArgumentList "--remote-debugging-port=${port}","obsidian://open?vault=${TEST_VAULT_NAME}"'`,
  ].join("\n");
}

class CdpClient {
  static connect(url) {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      const client = new CdpClient(socket);
      socket.addEventListener("open", () => resolve(client), { once: true });
      socket.addEventListener("error", () => reject(new Error("WebSocket connection failed")), { once: true });
    });
  }

  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    socket.addEventListener("message", (event) => this.onMessage(event));
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.socket.close();
  }

  onMessage(event) {
    const message = JSON.parse(event.data);
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    if (message.error) pending.reject(new Error(message.error.message));
    else pending.resolve(message.result);
  }
}

await main();
