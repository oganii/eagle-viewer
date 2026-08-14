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
    required_deploy_fragments = (
        'REGISTRY_IMAGE="${REGISTRY_IMAGE:?Set REGISTRY_IMAGE to the target container registry image}"',
        'REGISTRY_VERSION_TAG="${REGISTRY_IMAGE}:v${TAG}"',
        'REGISTRY_TAG="${REGISTRY_IMAGE}:latest"',
        'sudo docker push "${REGISTRY_VERSION_TAG}"',
        'sudo docker push "${REGISTRY_TAG}"',
    )
    for fragment in required_deploy_fragments:
        if fragment not in deploy_script:
            raise SystemExit(
                f"scripts/deploy.sh does not publish the required registry latest image: {fragment}"
            )

    print("Deploy check ok: FROM digest-pinned, HEALTHCHECK present, registry version/latest pushes configured")


if __name__ == "__main__":
    main()
