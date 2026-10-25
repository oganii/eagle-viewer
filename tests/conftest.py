import importlib
from pathlib import Path
import sys

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

FIXTURES = Path(__file__).parent / "fixtures"


def reload_app_modules():
    import app.config
    import app.vault.parser
    import app.vault.libraries
    import app.vault
    import app.api.deps
    import app.api.folders
    import app.api.items

    importlib.reload(app.config)
    importlib.reload(app.vault.parser)
    importlib.reload(app.vault.libraries)
    importlib.reload(app.vault)
    importlib.reload(app.api.deps)
    importlib.reload(app.api.folders)
    importlib.reload(app.api.items)


@pytest.fixture(autouse=True)
def isolated_library_env(monkeypatch, tmp_path):
    """Never touch the developer's real cache dir or library list from tests."""
    monkeypatch.setenv("EAGLE_INDEX_CACHE_DIR", str(tmp_path / "index-cache"))
    for name in ("EAGLE_VAULT_LIBRARIES", "EAGLE_VAULT_DEFAULT", "EAGLE_VAULT_EDITABLE", "EAGLE_VAULT_MAX_LOADED"):
        monkeypatch.delenv(name, raising=False)


@pytest.fixture()
def sample_library(monkeypatch):
    root = FIXTURES / "sample.library"
    monkeypatch.setenv("EAGLE_VAULT_ROOT", str(root))
    reload_app_modules()

    import app.vault.parser

    app.vault.parser.load_vault()
    return root
