# Changelog

All notable changes to ERP Panorama Viewer are documented here.

## [0.1.2] - 2026-09-10

### Fixed

- Fixed multi-image selection from the command palette by adding a reliable checkbox fallback when the native picker returns only one file.
- Fixed Explorer multi-selection handling for comparison mode.
- Fixed vertical drag direction so grab-and-drag semantics are consistent with the displayed panorama.

### Added

- Added Explorer command **ERP Panorama: Open Selected as ERP Comparison** for opening 2–4 selected images directly.
- Added repository metadata and automated packaging workflow support.

## [0.1.1] - 2026-09-10

### Fixed

- Reworked WebView image configuration delivery to avoid CSP-related silent failures.
- Added explicit WebGL2 and image-loading error reporting.
- Improved Remote SSH resource handling through `webview.asWebviewUri(...)`.

## [0.1.0] - 2026-09-10

### Added

- Initial ERP/equirectangular 360° panorama viewer.
- WebGL2 shader-based projection with no runtime CDN or Three.js dependency.
- PNG/JPG/JPEG/WebP support.
- Mouse yaw/pitch navigation, FOV zoom, reset, ERP pixel coordinate readout, longitude/latitude readout.
- Linear/nearest sampling modes.
- Synchronized multi-image comparison for up to four panoramas.
