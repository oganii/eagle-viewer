#!/usr/bin/env bash
# deploy.sh — Build and publish the eagle-viewer Docker image.
#
# USAGE: run on the build host from the repo checkout:
#   cd /path/to/eagle-viewer
#   bash scripts/deploy.sh
#
# Prerequisites:
#   - The git tag referenced by docker-compose.yml must exist on the remote.
#   - sudo docker must work without a password prompt.
#   - REGISTRY_IMAGE is set to the target registry image.
#   - sudo docker is already logged in to that registry.
#
# What it does:
#   1. git pull --ff-only (first, so the tag is read from the released compose).
#   2. Reads TAG from docker-compose.yml (image: eagle-viewer:v<TAG>).
#   3. Runs version-check to confirm tag alignment.
#   4. sudo docker build with both registry version and :latest tags.
#   5. Push both registry tags.
#   6. Finish after the registry push; no NAS tar is created or copied.

set -euo pipefail

# ── 1. Pull latest from GitHub ───────────────────────────────────────────────
# Must happen before reading TAG: a release commit changes the compose tag,
# and building the pre-pull tag would mislabel the new code.
echo "==> Pulling latest code..."
git pull --ff-only

# ── 2. Read TAG from docker-compose.yml ──────────────────────────────────────
TAG=$(sed -n 's/.*image:[[:space:]]*eagle-viewer:v\([^[:space:]]*\).*/\1/p' docker-compose.yml | head -1)
if [ -z "$TAG" ]; then
  echo "ERROR: could not extract tag from docker-compose.yml" >&2
  exit 1
fi
echo "==> TAG=v${TAG}"
REGISTRY_IMAGE="${REGISTRY_IMAGE:?Set REGISTRY_IMAGE to the target container registry image}"
REGISTRY_VERSION_TAG="${REGISTRY_IMAGE}:v${TAG}"
REGISTRY_TAG="${REGISTRY_IMAGE}:latest"

# ── 3. Version alignment check ───────────────────────────────────────────────
echo "==> Running version-check..."
if command -v make >/dev/null 2>&1; then
  make version-check
else
  # dev box has no make; check_versions.py only uses the stdlib
  python3 scripts/check_versions.py
fi

# ── 4. Build image ───────────────────────────────────────────────────────────
echo "==> Building ${REGISTRY_VERSION_TAG} and ${REGISTRY_TAG}..."
sudo docker build \
  -t "${REGISTRY_VERSION_TAG}" \
  -t "${REGISTRY_TAG}" \
  .

# Keep registry publication on the configured build host, where the registry
# login is configured.
echo "==> Pushing ${REGISTRY_VERSION_TAG}..."
sudo docker push "${REGISTRY_VERSION_TAG}"
echo "==> Pushing ${REGISTRY_TAG}..."
sudo docker push "${REGISTRY_TAG}"

echo "==> Published ${REGISTRY_VERSION_TAG} and ${REGISTRY_TAG}"

echo "==> Done."
