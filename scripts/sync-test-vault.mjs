#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

const PLUGIN_ID = "attachment-link-rules";
const TEST_VAULT_NAME = "obsidian-test-vault";
const DEFAULT_TARGET = `/mnt/c/Users/viggo/github/${TEST_VAULT_NAME}/.obsidian/plugins/${PLUGIN_ID}`;
const ARTIFACTS = ["main.js", "manifest.json", "styles.css"];
const args = parseArgs(process.argv.slice(2));
const target = path.resolve(String(args.target ?? DEFAULT_TARGET));
const dryRun = Boolean(args["dry-run"]);

await assertSafeTarget(target);
const build = spawnSync("npm", ["run", "build"], { stdio: "inherit", shell: process.platform === "win32" });
if (build.status !== 0) throw new Error(`npm run build failed with exit code ${build.status ?? "unknown"}`);
await fs.mkdir(target, { recursive: true });
const copied = [];
for (const artifact of ARTIFACTS) {
  const source = path.resolve(artifact);
  const destination = path.join(target, artifact);
  const stat = await fs.stat(source);
  if (!dryRun) await fs.copyFile(source, destination);
  copied.push({ artifact, destination, bytes: stat.size });
}
console.log(JSON.stringify({ ok: true, dryRun, pluginId: PLUGIN_ID, target, copied }, null, 2));

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--dry-run") parsed["dry-run"] = true;
    else if (value === "--target") parsed.target = values[++index];
    else throw new Error(`Unknown argument: ${value}`);
  }
  return parsed;
}

async function assertSafeTarget(targetPath) {
  const normalized = targetPath.replaceAll("\\", "/").toLowerCase();
  if (normalized.includes("syncthing/vault")) throw new Error(`Refusing main vault target: ${targetPath}`);
  if (!normalized.endsWith(`/${TEST_VAULT_NAME}/.obsidian/plugins/${PLUGIN_ID}`)) {
    throw new Error(`Refusing unsafe target: ${targetPath}`);
  }
  const vaultRoot = targetPath.slice(0, targetPath.indexOf(TEST_VAULT_NAME) + TEST_VAULT_NAME.length);
  if (!(await fs.stat(vaultRoot).catch(() => null))?.isDirectory()) throw new Error(`Test vault not found: ${vaultRoot}`);
}
