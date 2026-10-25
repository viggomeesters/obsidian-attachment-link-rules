# Local validation

This repository uses a deterministic local gate instead of GitHub Actions.

## Complete gate

```bash
npm ci
npm run check
npm run sync:test-vault
npm run smoke:test-vault
```

`npm run check` runs formatting hygiene, the official `eslint-plugin-obsidianmd` recommended rules, TypeScript checking, behavior tests, the production build, manifest/version checks, and live Community id/name uniqueness checks.

The runtime smoke loads the built plugin in the Windows-local `obsidian-test-vault`, proves the PDF link rule and image embed rule in the Electron renderer, and writes screenshot evidence.

## Release gate

A release is accepted only when:

- the complete local gate passes;
- `manifest.json`, `package.json`, `package-lock.json`, and `versions.json` agree;
- the tag exactly equals the manifest version;
- release assets are exactly `main.js`, `manifest.json`, and `styles.css`;
- downloaded release assets match the repository copies.

## macOS cooperation acceptance

Release 0.2.0 was also exercised with Mail Drop 0.10.0 in a separate Obsidian 1.13.7 vault on macOS arm64: 115 synthetic DOM checks passed, including both load orders, slow I/O, concurrent edits, Wiki/Markdown syntax, original bytes, email previews, unload, standalone rules and missing-provider fallback. The generic runner is `scripts/cooperation-smoke.mjs` in the Mail Drop repository; it requires an explicitly marked test vault. This does not claim a new real mail-provider drag, mobile test, runtime on the declared minimum, or Obsidian 1.14.5 runtime. The Windows commands above are a separate supported test route.
