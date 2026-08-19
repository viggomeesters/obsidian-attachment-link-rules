# Contributing

1. Fork and clone the repository.
2. Run `npm install`.
3. Add a failing behavior test before changing production code.
4. Run `npm run check`.
5. Prove runtime behavior in a disposable local test vault, never in a synced production vault.
6. Open a focused pull request with the behavior and verification evidence.

Keep the plugin narrow: extension-based link/embed decisions only, public APIs only, and no custom attachment storage.
