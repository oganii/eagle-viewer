#!/usr/bin/env bash
# release.sh — Enforce the release preflight and build-host deployment order.
#
# USAGE:
#   REGISTRY_IMAGE=registry.example/eagle-viewer \
#   DEPLOY_HOST=dev.local \
#   DEPLOY_PATH=/path/to/eagle-viewer \
#   bash scripts/release.sh
#
# Order:
#   1. Commit only release-flow files and push the current Git branch.
#   2. Run the full local project checks.
#   3. On the build host, pull fast-forward-only and run deploy.sh.
#   4. deploy.sh validates the version, builds both registry tags, then pushes
#      the version tag followed by latest.
#
# The release script never builds or pushes Docker images from the initiating
# workstation. It does push the release commit to the current Git upstream.
# Set REMOTE=0 only when this script is intentionally run on the build host.

set -euo pipefail

REMOTE="${REMOTE:-1}"
REGISTRY_IMAGE="${REGISTRY_IMAGE:?Set REGISTRY_IMAGE to the target registry image}"

RELEASE_FILES=(
  AGENTS.md
  Makefile
  docs/release.md
  scripts/release.sh
  scripts/verify_deploy.py
)

is_release_file() {
  local candidate="$1"
  local allowed
  for allowed in "${RELEASE_FILES[@]}"; do
    [ "$candidate" = "$allowed" ] && return 0
  done
  return 1
}

DIRTY_FILES=$(git status --porcelain | sed -E 's/^.. //; s/^"(.*)"$/\1/')
while IFS= read -r dirty_file; do
  [ -z "$dirty_file" ] && continue
  if ! is_release_file "$dirty_file"; then
    echo "ERROR: refusing to auto-commit unrelated change: ${dirty_file}" >&2
    exit 1
  fi
done <<< "$DIRTY_FILES"

if [ -n "$DIRTY_FILES" ]; then
  echo "==> [1/4] Committing release-flow changes..."
  git add -- "${RELEASE_FILES[@]}"
  git commit -m "build: enforce ordered release workflow"
else
  echo "==> [1/4] No release-flow changes to commit"
fi

LOCAL_HEAD=$(git rev-parse HEAD)
UPSTREAM_HEAD=$(git rev-parse '@{upstream}')
if [ "$LOCAL_HEAD" != "$UPSTREAM_HEAD" ]; then
  echo "==> Pushing ${LOCAL_HEAD} to the upstream branch..."
  git push
fi

echo "==> [2/4] Running full project checks..."
make check

run_deploy() {
  if [ "$REMOTE" = "0" ]; then
    echo "==> [3/4] Running deploy.sh on the current build host..."
    REGISTRY_IMAGE="$REGISTRY_IMAGE" bash scripts/deploy.sh
    return
  fi

  DEPLOY_HOST="${DEPLOY_HOST:?Set DEPLOY_HOST when REMOTE=1}"
  DEPLOY_USER="${DEPLOY_USER:-$USER}"
  DEPLOY_PORT="${DEPLOY_PORT:-22}"
  DEPLOY_PATH="${DEPLOY_PATH:?Set DEPLOY_PATH when REMOTE=1}"
  REMOTE_DEPLOY_PATH=$(printf '%q' "$DEPLOY_PATH")
  REMOTE_REGISTRY_IMAGE=$(printf '%q' "$REGISTRY_IMAGE")

  echo "==> [3/4] Pulling and deploying on ${DEPLOY_USER}@${DEPLOY_HOST}..."
  ssh -p "$DEPLOY_PORT" "${DEPLOY_USER}@${DEPLOY_HOST}" \
    "cd ${REMOTE_DEPLOY_PATH} && git pull --ff-only && REGISTRY_IMAGE=${REMOTE_REGISTRY_IMAGE} bash scripts/deploy.sh"
}

run_deploy
echo "==> [4/4] Release complete: ${REGISTRY_IMAGE}:v<version> and ${REGISTRY_IMAGE}:latest"
