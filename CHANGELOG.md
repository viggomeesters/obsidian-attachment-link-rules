# Changelog

## 0.2.1 — 2026-11-12

- Observe delayed native file insertions for up to 60 seconds, instead of abandoning them after less than a second. Stop after the expected files, navigation, expiry or unload.
- Attribute external insertions to the dropped filenames, including native numbered collisions; unrelated typed links are preserved.
- Preserve pre-existing attachment syntax when typing and a drop change different parts of the note. Ambiguous identical links are left unchanged rather than guessing.
- Replace the old runtime smoke with a background CLI test that restores settings, the active note and renderer timer policy.
- Reconcile the already delivered acceptance/review records behind Issues #2 and #3 against their actual release evidence.

## 0.2.0 — 2026-10-25

- Optional synchronous formatting and managed-drop events for cooperating importers.
- Choose normal links for unlisted extensions; existing defaults remain unchanged.
- Keep Mail Drop's filename policy while using one owner for attachment syntax.
- Cross-platform production build.
- Local preflight no longer requires Actions; directory identity comparison.
- Refresh development dependency patches; dependency audit reports no known vulnerabilities.

## 0.1.1 - 2026-08-21

- Add searchable declarative settings for Obsidian 1.13 and later.
- Retain the existing settings interface as a compatibility fallback for Obsidian 1.5.7 through 1.12.x.
- Remove deprecated settings refresh usage without changing attachment behavior.

## 0.1.0 - 2026-08-19

- Add configurable link and embed extension lists.
- Default PDF and office drops to normal links.
- Default common image, audio, and video drops to embeds.
- Preserve native attachment storage and Wiki/Markdown link formatting.
- Add test-vault sync, runtime smoke, local tests, and Community submission checks.
