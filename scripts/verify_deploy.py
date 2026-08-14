"""Verify deploy artifacts are internally consistent and mechanically buildable.

Checks (all read-only, no docker dependency):
1. The Dockerfile pins its base image by digest.
2. The Dockerfile declares a HEALTHCHECK (own line, not in a comment).
3. The deploy script publishes both registry version and latest images using REGISTRY_IMAGE.

Version/tag consistency between pyproject.toml and docker-compose.yml is owned by
scripts/check_versions.py (run by `make check` / CI), not duplicated here.

The companion CI job (deploy-check in .github/workflows/ci.yml) additionally
runs `docker build` to prove the image actually builds and tags correctly.
"""
from pathlib import Path
import re


ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    dockerfile = (ROOT / "Dockerfile").read_text(encoding="utf-8")
    base_match = re.search(r"^FROM\s+(\S+)", dockerfile, re.MULTILINE)
    if not base_match:
        raise SystemExit("Could not find FROM in Dockerfile")
    if "@sha256:" not in base_match.group(1):
        raise SystemExit(f"Base image is not digest-pinned: {base_match.group(1)}")
    if not re.search(r"^HEALTHCHECK", dockerfile, re.MULTILINE):
        raise SystemExit("Dockerfile has no HEALTHCHECK")

    deploy_script = (ROOT / "scripts/deploy.sh").read_text(encoding="utf-8")
    release_script = (ROOT / "scripts/release.sh").read_text(encoding="utf-8")
    required_deploy_fragments = (
        'REGISTRY_IMAGE="${REGISTRY_IMAGE:?Set REGISTRY_IMAGE to the target container registry image}"',
        'REGISTRY_VERSION_TAG="${REGISTRY_IMAGE}:v${TAG}"',
        'REGISTRY_TAG="${REGISTRY_IMAGE}:latest"',
        '-t "${REGISTRY_VERSION_TAG}"',
        '-t "${REGISTRY_TAG}"',
        'sudo docker push "${REGISTRY_VERSION_TAG}"',
        'sudo docker push "${REGISTRY_TAG}"',
    )
    for fragment in required_deploy_fragments:
        if fragment not in deploy_script:
            raise SystemExit(
                f"scripts/deploy.sh does not publish the required registry latest image: {fragment}"
            )
    if '-t "eagle-viewer:v${TAG}"' in deploy_script:
        raise SystemExit("scripts/deploy.sh creates an unnecessary unqualified local version tag")
    for fragment in (
        "make check",
        "git pull --ff-only",
        "REGISTRY_IMAGE=${REMOTE_REGISTRY_IMAGE} bash scripts/deploy.sh",
    ):
        if fragment not in release_script:
            raise SystemExit(f"scripts/release.sh is missing the required release step: {fragment}")

    print("Deploy check ok: release preflight and build-host registry deployment configured")


if __name__ == "__main__":
    main()
