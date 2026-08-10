# Regression Results · v4.3.12

## Automated checks

- `make check` passed: version check, ruff, 47 pytest tests, deploy check, Python compileall, JavaScript syntax checks, and 8 Node behavior tests.
- `git diff --check` passed.

## Scope

- Collection card and filename clicks open the floating preview; the Details action opens the Inspector.
- Mobile previews use Eagle thumbnails first, keep only bounded IndexedDB thumbnail data, and expose cache clearing from the status screen.
- Original files are not prefetched for image previews; video/PDF loading is deferred to metadata/visible preview use.
- Search/list requests cancel stale work, and parser list payloads omit large annotations while retaining lightweight metadata.

## Manual verification

- Local ego-browser desktop check passed: card click opened one floating preview without opening the Inspector; the Details action opened the Inspector.
- Local 390×844 mobile check passed: the status screen exposed thumbnail cache usage/clear controls, and an image preview used a `blob:` thumbnail URL with zero original-file requests during the check.
- Safari ordinary-page, standalone-PWA, and deployed NAS hotspot checks remain environment-dependent and were not claimed from Chromium emulation.
