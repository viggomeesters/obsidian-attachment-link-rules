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
