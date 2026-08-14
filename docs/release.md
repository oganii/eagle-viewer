# Release Process

## Prepare

1. Update version values in:
   - `pyproject.toml`
   - `README.md`
   - `README.zh.md`
   - `app/web/core.js`
   - `docker-compose.yml`
   - `docker-compose.remote.example.yml`
   - `uv.lock`
   - `app/web/sw.js` cache name when static assets change
2. Update `CHANGELOG.md`.
3. When desktop static assets are added, removed, or split, keep their load order aligned in `app/web/index.html`, `app/web/sw.js`, and `tests/test_pwa_restore_contract.py`.
4. Run:

```bash
make check
```

5. If the release changes UI behavior, run the manual checklist in
   `docs/regression-checklist.md` and save notes under `docs/regression-results-vX.Y.Z.md`.

## Publish

Create a GitHub Release from `main`:

```bash
gh release create vX.Y.Z --target main --title "vX.Y.Z" --generate-notes
```

If using a token for `gh`, pass it only as a temporary environment variable and
rotate it after use.

## After Release

- Confirm the GitHub Release exists.
- Confirm the remote tag points at the intended commit.
- On the build host, confirm both `${REGISTRY_IMAGE}:vX.Y.Z` and
  `${REGISTRY_IMAGE}:latest` were pushed.

## Docker Image Build

The deployment publishes the stable registry image as
`${REGISTRY_IMAGE}:latest`. The version tag remains available for rollback;
no host-specific archive is required.

Before the first deployment, authenticate the same Docker CLI used by the
script (the script uses `sudo docker`):

```bash
export REGISTRY_HOST=registry.example
export REGISTRY_IMAGE="$REGISTRY_HOST/eagle-viewer"
sudo docker login "$REGISTRY_HOST"
```

Run the deployment on your build host, from the build checkout:

```bash
cd /path/to/eagle-viewer
bash scripts/deploy.sh
```

The script builds both registry tags in one command and pushes both the version
tag and the `latest` tag. The consumer host should pull the image from the
configured registry.

```bash
docker build \
  -t eagle-viewer:vX.Y.Z \
  -t "$REGISTRY_IMAGE:vX.Y.Z" \
  -t "$REGISTRY_IMAGE:latest" \
  .
docker push "$REGISTRY_IMAGE:vX.Y.Z"
docker push "$REGISTRY_IMAGE:latest"
```
