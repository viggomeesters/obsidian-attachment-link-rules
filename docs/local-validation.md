# Local validation

This repository uses a deterministic local gate instead of GitHub Actions.

## Complete gate

```bash
npm ci
npm run check
npm run sync:test-vault -- --target /absolute/path/to/obsidian-test-vault/.obsidian/plugins/attachment-link-rules
npm run smoke:test-vault -- --vault /absolute/path/to/obsidian-test-vault --report /absolute/local/path/report.json
```

`npm run check` runs formatting hygiene, the official `eslint-plugin-obsidianmd` recommended rules, TypeScript checking, behavior tests, the production build, manifest/version checks, and live Community id/name uniqueness checks.

The runtime smoke uses the supported Obsidian CLI against an already open, marked `obsidian-test-vault`. Pass an explicit `--target` to `sync:test-vault` when using it; its historical default is Windows-specific. The smoke creates only new fixtures and a temporary test tab, restores the prior active note and exact settings bytes, and restores Electron's background-throttling policy. It does not detach unrelated views or replace an existing fixture. Its file insertion timing is controlled through real renderer drop/editor events and public Vault APIs; this is actual-host synthetic acceptance, not an OS drag or a mobile-device test.

Current results and the historical review reconciliation are recorded in [the 12 November acceptance](runtime-acceptance-2026-11-12.md). Real-host checks include empty/malformed/16 MiB source files, byte preservation, delayed and multi-file insertions, concurrent edits, settings reload and unload. Do not infer an exact minimum-version or mobile-device test from this desktop run.

## Release gate

A release is accepted only when:

- the complete local gate passes;
- `manifest.json`, `package.json`, `package-lock.json`, and `versions.json` agree;
- the tag exactly equals the manifest version;
- release assets are exactly `main.js`, `manifest.json`, and `styles.css`;
- downloaded release assets match the repository copies.

## macOS cooperation acceptance

Release 0.2.0 was also exercised with Mail Drop 0.10.0 in a separate Obsidian 1.13.7 vault on macOS arm64: 115 synthetic DOM checks passed, including both load orders, slow I/O, concurrent edits, Wiki/Markdown syntax, original bytes, email previews, unload, standalone rules and missing-provider fallback. The generic runner is `scripts/cooperation-smoke.mjs` in the Mail Drop repository; it requires an explicitly marked test vault. This does not claim a new real mail-provider drag, mobile test, runtime on the declared minimum, or Obsidian 1.14.5 runtime. The Windows commands above are a separate supported test route.
