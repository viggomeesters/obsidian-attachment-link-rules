# Community scorecard notes

Status inspected on 2026-08-21 for release `0.1.0`.

## Fixed in 0.1.1

- **Settings search:** `PluginSettingTab.getSettingDefinitions()` now exposes the extension controls to the built-in settings search in Obsidian 1.13 and later.
- **Deprecated refresh call:** the compatibility UI no longer invokes deprecated `display()` recursively. Obsidian 1.5.7 through 1.12.x retains the imperative fallback; 1.13 and later uses declarative definitions.

## Intentionally unresolved

- **GitHub artifact attestations:** the scorecard asks for attestations produced by a GitHub Actions workflow. This repository's local workflow contract explicitly prohibits GitHub Actions. Releases are instead built and checked locally, and release assets are downloaded after publication and compared byte-for-byte with the local build.
- **Malware scan unavailable:** this is a Community scorecard disclosure rather than a repository finding. The scanner also reports no suspicious network patterns, no vulnerable dependencies, no obfuscation, and a byte-for-byte reproducible build.

The project does not suppress Community lint rules merely to improve the scorecard label, and it does not reduce supported app versions for a cosmetic score increase.
