# Community submission

## Current release contract

- Plugin id: `attachment-link-rules`
- Display name: `Attachment Link Rules`
- Initial version: `0.1.0`
- Minimum app version: `1.5.7`
- Repository: `viggomeesters/obsidian-attachment-link-rules`
- Runtime assets: `main.js`, `manifest.json`, `styles.css`

## Preflight

```bash
npm ci
npm run check
npm run sync:test-vault
npm run smoke:test-vault
```

The checker verifies manifest/package/lock/version alignment, allowed id and name formats, description wording, settings-heading rules, unsupported API boundaries, forbidden lifecycle calls, required public files, and live id/name uniqueness in the Community directory.

## Native drop rationale

The plugin does not register an `editor-drop` handler and therefore does not replace or consume the native editor event. A public `registerDomEvent(workspaceDocument, "drop", ..., { capture: true })` listener on the active workspace document snapshots the active Markdown editor before native handling. Native handling then retains ownership of attachment storage, duplicate-name resolution, exact editor position, and the user's link-format preference. The plugin changes only the newly inserted link/embed marker afterwards.

## Release verification

The GitHub tag must exactly equal `manifest.json.version`, without a `v` prefix. Download the three release assets and compare the downloaded manifest id, name, version, description, and minimum app version with the repository copy before submission.
