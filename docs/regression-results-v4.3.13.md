# Regression Results · v4.3.13

Date: 2026-08-10

## Scope

- Desktop image preview now requests the original Eagle file first.
- Desktop zoomed images are hosted in a scrollable preview canvas; mouse-wheel input remains within the current image.
- Mobile image preview continues to use Eagle's existing thumbnail first and exposes a separate “显示原图” action.
- Static asset revision and Service Worker shell cache were refreshed.

## Verification

- `git diff --check` passed.
- `UV_CACHE_DIR=/private/tmp/eagle-viewer-uv-cache make check` passed: 48 Python tests and 8 JavaScript tests passed.
- The implementation path was manually exercised during the UI change: desktop original loading and scrollable image canvas; mobile thumbnail-first loading with no original request before tapping “显示原图”.
- Browser automation was attempted against the sample library during release preparation, but the Playwright CLI bootstrap did not return in this environment; no browser automation result is claimed here.

## Result

The release checks passed. No known regression was found in the changed preview paths.
