# Runtime acceptance and review reconciliation — 12 November 2026

Issues [#2](https://github.com/viggomeesters/obsidian-attachment-link-rules/issues/2) and [#3](https://github.com/viggomeesters/obsidian-attachment-link-rules/issues/3) preserved historical acceptance and unresolved review flags when the old workflow was retired. They were not proof that the release was missing.

## Reconciled historical delivery

The later completed acceptance at commit `7fccefc3d54b998b13c1a60e48a9c7aad5ffb92f` was absent from the older main-branch task selected by migration. Its product source, manifest and release bytes are identical to public 0.2.0. Its acceptance and independent delivery review are approved, with no remaining work, and it records the original approved coverage limits. The public 0.2.0 JavaScript SHA-256 is `39f33a9ead208af846e61b0fc72283e81463a339b38f9343a57f8d43d621ecb0`.

| Historical item | Delivered result |
| --- | --- |
| `runtime-release-acceptance` (#2) | Completed actual-host/installation/upgrade acceptance, 123 unchanged fixture hashes, official release build/dependency pass and anonymous asset readback. Older platform evidence belongs to those exact 0.2.0 bytes, not the new patch. |
| `build-attachment-link-rules` (#3) | Public plugin with native storage and configurable extension rules, delivered as three release assets. |
| `improve-community-scorecard` (#3) | Searchable settings definitions plus legacy fallback; official lint/build review, with deliberate no-Actions attestation limitation. |
| `mail-drop-cooperation` (#3) | Optional synchronous formatting and managed-drop protocol, with core protocol tests and historical 115 actual-host synthetic cooperation checks. |
| `publish-cooperation` (#3) | Public 0.2.0 with matching tag/assets, Community installation and independent review. |

These flags can be reconciled as completed history without recreating the retired workflow. Source/history review was independent. The historical 1.14.5/macOS, Windows, Android and older-runtime results must not be relabeled as newly executed 0.2.2 tests. Exact 1.5.7 and iOS execution are not established here. [Obsidian 1.5.7 was an early-access release](https://obsidian.md/changelog/2024-02-20-desktop-v1.5.7/); no public 1.5.7 release asset was available from its releases repository during this check. The unchanged 1.5.7 API minimum is retained, not claimed as a new tested host.

## New 0.2.2 repairs and checks

The 0.2.1 draft candidate was superseded before publication after a test-harness correction: the saved enabled-ID set is not proof that a cooperating plugin is actually loaded. Cleanup now checks the loaded plugin instance and reloads it when needed, with independent restoration attempts. The current [0.2.2 host report](evidence/runtime-0.2.2-macos.json) supersedes the preliminary candidate report; no existing public release assets or tags were rewritten.

Targeted tests reproduced two real defects before repair: a standalone insertion after 1.5 seconds was missed, and concurrent edits could rewrite an existing attachment. Runtime regressions also cover multi-file insertions, correct-format completion, navigation, unload, importer-managed drops, unrelated manual typing, ambiguous duplicates and expiry. The suite has 32 passing tests, with TypeScript and official lint checks.

External drops are matched to source filenames, including native numbered collisions; web URLs and unrelated manual links are not attributed to them. Observation expires after 60 seconds. File-less/internal drops get only a deferred same-drop check. In ambiguous disjoint edits, exact pre-existing link tokens remain untouched, while new occurrences still count toward completion. The plugin continues to leave file I/O to the app/importer.

The background smoke passes its recorded checks in actual Obsidian 1.15.0 (installer 1.12.7) on macOS Apple Silicon, using the standard isolated test vault. It exercises empty, malformed and 16 MiB sources without interpreting their contents, verifies exact saved bytes and existing-link preservation, delays insertion, types concurrently, inserts multiple files and unloads/reloads. It restores the exact settings bytes, active note and temporary renderer timer-policy change. Native completion timing is simulated through public Vault/editor APIs; this is not a new physical OS drag, minimum-version run or mobile-device run.

New source remains in the existing TypeScript plugin interface; the Node test wrappers execute the actual JavaScript host API. No new runtime dependencies or workflow engine are added. The 0.2.2 release must still pass its own publication preview, full official review, downloaded-asset comparison and actual Community-installation readback; historical results do not substitute for those gates.
