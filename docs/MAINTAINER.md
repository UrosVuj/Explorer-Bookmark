# Maintainer Notes

This document is for local development, verification, and publishing.

## Iteration

Use the normal local loop:

```bash
npm install
npm run verify
```

`npm run verify` does three things:

- Compiles the extension
- Runs lint checks
- Runs tests

## Integration smoke test

Before publishing, run the VS Code host smoke test:

```bash
npm run test:integration
```

That launches an isolated VS Code test instance and exercises the real extension commands. Your normal VS Code app must be fully closed first.

If you want to run against your local VS Code app instead, use:

```bash
npm run test:integration:local
```

Local mode is useful offline. If your setup uses a non-standard install path, set `VSCODE_EXECUTABLE_PATH` before running the local script.

## Current automated coverage

The test suite currently verifies:

- Unit tests for command payload extraction and URI/path detection
- Integration tests for adding a bookmark through the explorer-context command payload
- Integration tests for expanding a bookmarked folder and reading its children
- Integration tests for removing a bookmark when the command receives a plain path payload

## Publish a new version

1. Update the version field in `package.json`.
2. Run `npm run verify`.
3. Close all VS Code windows and run `npm run test:integration`.
4. Package locally with `npm run package:extension`.
5. Sign in to the Visual Studio Marketplace with `vsce login <publisher>`.
6. Publish with `npm run publish:extension`.

For a quick patch release:

```bash
npm version patch
npm run verify
npm run test:integration
npm run publish:extension
```
