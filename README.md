# ERP Panorama Viewer

A small, dependency-free VS Code extension for viewing **equirectangular / ERP 360° panoramas** directly inside VS Code.

It uses a WebGL2 fragment shader instead of Three.js, so there are no CDN assets and no third-party runtime dependencies.

## Features

Version 0.1.2 fixes Explorer/file-picker multi-image comparison and corrects vertical drag direction.

- PNG / JPG / JPEG / WebP
- Equirectangular (2:1 ERP) panorama rendering
- Mouse drag to change yaw / pitch
- Mouse wheel to change FOV
- Hover readout: ERP pixel `(x, y)`, longitude / latitude, yaw / pitch / FOV
- Linear or nearest-neighbor sampling
  - `Linear` for RGB images
  - `Nearest` for semantic label/color maps
- Open up to 4 images in one panel
- Optional synchronized view for RGB / GT / Independent / Joint comparisons
- Works with `webview.asWebviewUri(...)`, so it is suitable for local and Remote SSH workspaces

## Install

### Ready-made VSIX

In VS Code:

1. `Ctrl/Cmd + Shift + P`
2. Run `Extensions: Install from VSIX...`
3. Select `erp-panorama-viewer-0.1.2.vsix`

Or from a shell:

```bash
code --install-extension erp-panorama-viewer-0.1.2.vsix
```

### Package from source

No npm dependencies are required.

```bash
cd erp-panorama-viewer
python3 scripts/package_vsix.py
```

The VSIX is written to:

```text
dist/erp-panorama-viewer-0.1.2.vsix
```

## Usage

For one image:

- Right-click a `.png`, `.jpg`, `.jpeg`, or `.webp` in Explorer.
- Choose **ERP Panorama: Open as 360° Viewer**.

For comparison:

- **Recommended:** select 2–4 images directly in the VS Code Explorer, right-click one of the selected files, then choose **ERP Panorama: Open Selected as ERP Comparison**.
- Or press `Ctrl/Cmd + Shift + P` and run **ERP Panorama: Open Images for Comparison**. The native multi-file picker is used first; if it returns only one file, the extension opens a checkbox list of images in that directory so several images can be selected reliably.

Controls:

- **Drag**: yaw / pitch using grab-and-drag semantics (vertical direction fixed in 0.1.2)
- **Wheel**: FOV
- **Double-click**: reset
- **Sync views**: keep all comparison panels on the same yaw / pitch / FOV
- **Nearest**: recommended for segmentation maps

## Notes

This viewer assumes the source image is an equirectangular panorama. It does not automatically convert cubemaps or perspective images.

For a typical panorama segmentation workflow, open:

```text
RGB ERP
GT
Independent prediction
Joint prediction
```

and keep **Sync views** enabled.

## Development

This repository intentionally keeps the runtime dependency-free. The viewer is implemented with VS Code WebView APIs and a WebGL2 fragment shader.

Run local checks:

```bash
npm run check
python3 scripts/package_vsix.py
```

GitHub Actions validates JavaScript syntax and builds a VSIX artifact on pushes and pull requests. Tags matching `v*` are also packaged, which keeps release builds reproducible.

For bug reports or feature requests, use GitHub Issues. For code changes, prefer a feature/fix branch and a pull request into `main`.
