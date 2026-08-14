#!/usr/bin/env bash
# release.sh — Minimal release automation for eagle-viewer.
#
# USAGE:
#   bash scripts/release.sh          # pre-flight checks + build + registry push
#   REMOTE=1 REGISTRY_IMAGE=... DEPLOY_HOST=... bash scripts/release.sh
#                                      # also SSH to the build host
#
# What it does:
#   1. Reads TAG from docker-compose.yml.
#   2. Runs version-check (pyproject ↔ README ↔ core.js ↔ compose alignment).
#   3. Runs deploy-check (Dockerfile digest-pinned + HEALTHCHECK).
#   4. Builds Docker image with both registry version and latest tags.
#   5. Pushes both registry tags.
#   6. Finishes after the registry push; no NAS tar is created or copied.
#
# Environment:
#   REMOTE  — if "1", SSH to the configured build host after local steps.
#   DRY_RUN — if "1", print commands without executing.

set -euo pipefail

REMOTE="${REMOTE:-0}"
DRY_RUN="${DRY_RUN:-0}"

run() {
  if [ "$DRY_RUN" = "1" ]; then
    echo "  [dry-run] $*"
  else
    "$@"
  fi
}

# ── 1. Read TAG ──────────────────────────────────────────────────────────────
TAG=$(sed -n 's/.*image:[[:space:]]*eagle-viewer:v\([^[:space:]]*\).*/\1/p' docker-compose.yml | head -1)
if [ -z "$TAG" ]; then
  echo "ERROR: could not extract tag from docker-compose.yml" >&2
  exit 1
fi
echo "==> Release eagle-viewer:v${TAG}"
REGISTRY_IMAGE="${REGISTRY_IMAGE:?Set REGISTRY_IMAGE to the target container registry image}"
REGISTRY_VERSION_TAG="${REGISTRY_IMAGE}:v${TAG}"
REGISTRY_TAG="${REGISTRY_IMAGE}:latest"

# ── 2. Version alignment check ───────────────────────────────────────────────
echo "==> [1/4] Version alignment check..."
make version-check

# ── 3. Deploy artifact check ─────────────────────────────────────────────────
echo "==> [2/4] Deploy artifact check..."
make deploy-check

# ── 4. Build image ───────────────────────────────────────────────────────────
echo "==> [3/6] Building ${REGISTRY_VERSION_TAG} and ${REGISTRY_TAG}..."
run sudo docker build \
  -t "${REGISTRY_VERSION_TAG}" \
  -t "${REGISTRY_TAG}" \
  .

echo "==> [4/6] Pushing ${REGISTRY_VERSION_TAG}..."
run sudo docker push "${REGISTRY_VERSION_TAG}"

echo "==> [5/6] Pushing ${REGISTRY_TAG}..."
run sudo docker push "${REGISTRY_TAG}"

echo "==> Released ${REGISTRY_VERSION_TAG} and ${REGISTRY_TAG}"

# ── 8. Optional remote deploy ────────────────────────────────────────────────
if [ "$REMOTE" = "1" ]; then
  echo "==> Deploying on build host..."
  DEPLOY_HOST="${DEPLOY_HOST:?Set DEPLOY_HOST when REMOTE=1}"
  DEPLOY_USER="${DEPLOY_USER:-$USER}"
  DEPLOY_PORT="${DEPLOY_PORT:-22}"
  DEPLOY_PATH="${DEPLOY_PATH:?Set DEPLOY_PATH when REMOTE=1}"
  REMOTE_DEPLOY_PATH=$(printf '%q' "$DEPLOY_PATH")
  REMOTE_REGISTRY_IMAGE=$(printf '%q' "$REGISTRY_IMAGE")
  run ssh -p "$DEPLOY_PORT" "${DEPLOY_USER}@${DEPLOY_HOST}" \
    "cd ${REMOTE_DEPLOY_PATH} && REGISTRY_IMAGE=${REMOTE_REGISTRY_IMAGE} bash scripts/deploy.sh"
  echo "==> Remote deploy complete."
fi
