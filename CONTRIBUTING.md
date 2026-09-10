# Contributing

## Development workflow

1. Create a branch from `main`, preferably `fix/<topic>` or `feature/<topic>`.
2. Make the change.
3. Run:

```bash
npm run check
python3 scripts/package_vsix.py
```

4. Verify the VSIX in VS Code using **Extensions: Install from VSIX...**.
5. Open a pull request into `main` and describe the bug/feature, implementation, and manual test performed.

## Versioning

The extension follows semantic versioning. Update `package.json` and `CHANGELOG.md` together when preparing a new version.

## Scope

The viewer currently targets equirectangular/ERP panoramas and comparison workflows for computer-vision research. Keep runtime dependencies minimal unless a dependency provides clear functional value that cannot be implemented reliably with VS Code WebView and WebGL2 APIs.
