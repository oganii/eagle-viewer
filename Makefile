.PHONY: setup dev check test lint version-check deploy-check deploy release

setup:
	uv sync

dev:
	uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

deploy-check:
	uv run python scripts/verify_deploy.py

check: version-check lint test deploy-check
	uv run python -m compileall app
	@for file in app/web/*.js; do node --check "$$file"; done
	node --test "tests/js/*.test.js"

test:
	uv run pytest

lint:
	uv run ruff check app tests scripts

version-check:
	uv run python scripts/check_versions.py

deploy:
	@echo "Run scripts/deploy.sh on your build host with REGISTRY_IMAGE set (no local artifact transfer):"
	@echo "  REGISTRY_IMAGE=registry.example/eagle-viewer bash scripts/deploy.sh"
	@test -n "$$REGISTRY_IMAGE" || (echo "ERROR: set REGISTRY_IMAGE before running make deploy" >&2; exit 1)
	bash scripts/deploy.sh

release:
	@echo "Run scripts/release.sh with REGISTRY_IMAGE, DEPLOY_HOST, and DEPLOY_PATH set."
	bash scripts/release.sh
