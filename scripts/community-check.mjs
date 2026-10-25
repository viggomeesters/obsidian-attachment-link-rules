import fs from "node:fs";
import https from "node:https";

const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const lock = JSON.parse(fs.readFileSync("package-lock.json", "utf8"));
const versions = JSON.parse(fs.readFileSync("versions.json", "utf8"));
const source = fs.readFileSync("src/main.ts", "utf8");

const expectedRepo = "https://github.com/viggomeesters/obsidian-attachment-link-rules";
const allowedManifestNamePattern = /^[A-Za-z0-9 ()+-]+$/;
const lowerName = manifest.name.toLowerCase();
const lowerDescription = manifest.description.toLowerCase();
const directHeadingElementPattern = /\.createEl\(\s*["']h[1-6]["']/;
const pluginNameHeadingPattern = new RegExp(
  `\\.setName\\(\\s*['\"]${escapeRegExp(manifest.name)}['\"]\\s*\\)\\.setHeading\\(`,
);

const requiredFiles = [
  "README.md", "LICENSE", "main.js", "styles.css", "CHANGELOG.md", "SECURITY.md",
  "CONTRIBUTING.md", "docs/community-submission.md", "assets/hero.svg",
  "assets/screenshot.svg", "assets/social-preview.svg", "scripts/sync-test-vault.mjs",
  "scripts/smoke-test-vault.mjs",
];

const checks = [
  ...requiredFiles.map((file) => [fs.existsSync(file), `${file} exists`]),
  [manifest.id === "attachment-link-rules", "manifest id is attachment-link-rules"],
  [manifest.name === "Attachment Link Rules", "manifest name is Attachment Link Rules"],
  [manifest.version === pkg.version, "manifest and package versions match"],
  [lock.packages?.[""]?.version === pkg.version, "package-lock root version matches"],
  [versions[manifest.version] === manifest.minAppVersion, "versions.json maps version to minAppVersion"],
  [/^\d+\.\d+\.\d+$/.test(manifest.version), "version uses x.y.z SemVer"],
  [/^[a-z-]+$/.test(manifest.id), "id contains lowercase letters and hyphens only"],
  [!manifest.id.includes("obsidian"), "id avoids obsidian"],
  [!manifest.id.endsWith("plugin"), "id avoids plugin suffix"],
  [allowedManifestNamePattern.test(manifest.name), "name uses allowed punctuation"],
  [!lowerName.includes("obsidian") && !lowerName.includes("obsi-") && !lowerName.includes("-sidian"), "name avoids Obsidian variants"],
  [manifest.description.length > 0 && !lowerDescription.startsWith("this is a plugin"), "description is specific"],
  [!lowerDescription.includes("obsidian"), "description avoids Obsidian"],
  [manifest.minAppVersion === "1.5.7", "minAppVersion covers the newest public API used"],
  [typeof manifest.isDesktopOnly === "boolean", "isDesktopOnly is boolean"],
  [source.includes('this.registerDomEvent(doc, "drop",') && source.includes("registerFormatter(workspaceDocument)") && source.includes('this.app.workspace.on("window-open"'), "drop observation covers the workspace and popout documents"],
  [!source.includes('workspace.on("editor-drop"'), "does not consume or override the native editor-drop event"],
  [!source.includes("detachLeavesOfType"), "does not detach leaves in onunload"],
  [!source.includes("revealLeaf("), "does not use revealLeaf"],
  [!directHeadingElementPattern.test(source), "settings headings avoid direct HTML heading elements"],
  [!pluginNameHeadingPattern.test(source), "settings headings avoid the plugin name"],
];

const failures = checks.filter(([ok]) => !ok).map(([, label]) => label);
failures.push(...await checkCommunityDirectory());

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  process.exit(1);
}

console.log(`Community checks passed (${checks.length} local checks plus live id/name uniqueness).`);

async function checkCommunityDirectory() {
  if (process.env.SKIP_LIVE_COMMUNITY_CHECK === "1") return [];
  const failures = [];
  const plugins = await fetchJson("https://raw.githubusercontent.com/obsidianmd/obsidian-releases/master/community-plugins.json");
  const rawIdMatch = plugins.find((plugin) => plugin.id === manifest.id);
  const rawNameMatch = plugins.find((plugin) => plugin.name?.toLowerCase() === lowerName);
  if (rawIdMatch && rawIdMatch.repo !== expectedRepo.replace("https://github.com/", "")) failures.push(`community directory already has id ${manifest.id}`);
  if (rawNameMatch && rawNameMatch.repo !== expectedRepo.replace("https://github.com/", "")) failures.push(`community directory already has name ${manifest.name}`);
  const html = await fetchText(`https://community.obsidian.md/plugins/${manifest.id}`);
  const isNotFound = html.includes("<title>Plugin not found</title>");
  if (!isNotFound && !html.includes(expectedRepo)) failures.push(`live community slug ${manifest.id} is already taken`);
  return failures;
}

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => resolve(body));
    }).on("error", reject);
  });
}

async function fetchJson(url) {
  return JSON.parse(await fetchText(url));
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
