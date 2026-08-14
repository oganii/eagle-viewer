# Repository Guidelines

## Project Structure & Module Organization

- `app/main.py`: FastAPI entrypoint and app wiring.
- `app/api/`: HTTP endpoints (`folders.py`, `items.py`).
- `app/vault/`: Eagle library parsing and in-memory indexing.
- `app/web/`: Frontend assets.
  - `index.html`: page shell
  - `styles*.css`: all styles (`styles.css` plus per-surface files: `styles-collection.css`, `styles-desktop.css`, `styles-detail.css`, `styles-formats.css`, `styles-mobile-*.css`, `styles-polish.css`)
  - JS modules (classic scripts loaded via `<script>` tags; they share globals through the `EagleViewer` namespace):
    - `core.js`, `api.js`, `bootstrap.js`: state/i18n/helpers, API client, bootstrapping
    - `render*.js`: rendering (`render.js`, `render-collection.js`, `render-content.js`, `render-hover.js`, `render-inspector.js`, `render-preview.js`, `render-preview-documents.js`, `render-preview-media.js`, `render-preview-navigation.js`, `render-selection.js`)
    - `interactions*.js`: interactions (`interactions.js`, `interactions-actions.js`, `interactions-bindings.js`, `interactions-filters.js`, `interactions-install.js`, `interactions-items.js`, `interactions-layout.js`, `interactions-mobile.js`, `interactions-remote.js`)
    - `mobile.js`, `sw.js`: mobile surface and service worker
- `tests/`: pytest coverage and a minimal fake Eagle library fixture.
- `docs/`: project notes, release process, and manual regression checklist/results.
- `README.md`: user-facing setup and API documentation.

Automated tests live in `tests/`. Treat `docs/regression-checklist.md` as the manual verification baseline for UI-visible changes.

## Build, Test, and Development Commands

- `uv sync`: create/update the project-local `.venv` from `pyproject.toml` and `uv.lock`.
- `export EAGLE_VAULT_ROOT=/path/to/Design.library`: point the app at an Eagle library.
- `make dev`: run locally.
- `make check`: run version consistency, lint, pytest, Python/JS syntax checks, and JS behavior tests (`tests/js/`).
- `make test`: run pytest only.
- `make deploy-check`: verify deploy artifacts (compose tag, Dockerfile digest pin and healthcheck).
- `uv run python -m compileall app`: quick backend syntax check.
- `node --check app/web/*.js`: quick frontend syntax check (all files in `app/web/`; glob covers new modules automatically).

## Deploy: build and publish the image

There is no CI for deployment — images are built on a separately managed build host and published to an operator-configured container registry.

- Release first (so the commit exists on the GitHub origin), then run the release orchestrator from the clean checkout:

  ```bash
  cd /path/to/eagle-viewer
  REGISTRY_IMAGE=registry.example/eagle-viewer \
  DEPLOY_HOST=dev.local \
  DEPLOY_PATH=/path/to/eagle-viewer \
  bash scripts/release.sh
  ```

  The release script requires a clean checkout with its commit already pushed, runs `make check`, then invokes `deploy.sh` on the build host. `deploy.sh` pulls fast-forward-only, reads the tag from `docker-compose.yml`, validates the version, builds version and `latest` tags, and pushes both to `REGISTRY_IMAGE`. It does not create or copy a host-specific artifact.

- **Registry images = version + latest.** The deployment pushes both `${REGISTRY_IMAGE}:vX.Y.Z` and `${REGISTRY_IMAGE}:latest`. `scripts/check_versions.py` (run by `make check` / CI) keeps the version in lockstep with `pyproject.toml`.
- **Docker privileges and registry authentication are host-local concerns.** Configure them on the build host; never commit credentials or host-specific paths.
- **Build context is lean** (`.dockerignore`); the `Dockerfile` pins a multi-platform `python:3.12-slim-bookworm` base by digest. Build is normally fast (most layers cached).
- **Consumer side**: the deployment host pulls `${REGISTRY_IMAGE}:latest` and then runs `docker compose up -d`.

## Coding Style & Naming Conventions

- Use 4 spaces in Python and 2 spaces in HTML/CSS/JS, matching the current codebase.
- Keep frontend code framework-free and modular; prefer adding logic to the existing `app/web/*.js` modules rather than reintroducing large inline scripts.
- Prefer descriptive snake_case in Python and camelCase in JavaScript.
- Use ASCII by default.
- For searches, prefer `rg`; for file edits, use focused patches instead of broad rewrites.

## Testing Guidelines

- Run `make check` before finishing changes.
- Tests use `tests/fixtures/sample.library`; do not depend on a private local Eagle library for automated tests.
- For UI changes, walk the relevant paths in `docs/regression-checklist.md`.
- If you add a bug fix, include the affected user flow in your manual verification notes.

## Commit & Pull Request Guidelines

- Use short, imperative commit messages. Conventional prefixes are welcome when helpful, e.g. `feat: add saved views` or `docs: update release notes`.
- PRs should include:
  - a brief problem/solution summary
  - touched areas (`app/api`, `app/web`, etc.)
  - manual verification performed
  - screenshots or short recordings for UI-visible changes

## Security & Configuration Tips

- Do not commit real library paths, passwords, or session secrets.
- Use `VIEWER_PASSWORD` and `VIEWER_SECRET_KEY` via environment variables.
- Keep the Eagle library mount read-only in Docker unless a task explicitly requires otherwise.
