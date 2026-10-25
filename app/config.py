import os
from pathlib import Path

# 既定のライブラリ（1 つだけ使うときはこれだけでよい）
VAULT_ROOT = os.environ.get("EAGLE_VAULT_ROOT", "/vault")
VAULT_ROOT_IS_SET = bool(os.environ.get("EAGLE_VAULT_ROOT", "").strip())
# 複数のライブラリを切りかえて使うときのパスの一覧。改行か ":" で区切る。
# "*" を含む項目は glob として展開する（例: /Volumes/HDD/Eagle/*.library）。
# EAGLE_VAULT_ROOT も一覧に入っていなければ先頭に足され、既定のライブラリになる。
VAULT_LIBRARIES = os.environ.get("EAGLE_VAULT_LIBRARIES", "")
# 既定のライブラリを id か名前で指定する（空なら EAGLE_VAULT_ROOT）
VAULT_DEFAULT_LIBRARY = os.environ.get("EAGLE_VAULT_DEFAULT", "").strip()
# 同時にメモリへ載せておくライブラリの数（既定のライブラリを含む）。古いものから外す。
MAX_LOADED_LIBRARIES = max(1, int(os.environ.get("EAGLE_VAULT_MAX_LOADED", "2") or "2"))


def _default_index_cache_dir() -> str:
    state_path = os.environ.get("VIEWER_STATE_PATH", "").strip()
    if state_path:
        return str(Path(state_path).expanduser().parent / "index-cache")
    base = os.environ.get("XDG_CACHE_HOME", "").strip() or str(Path.home() / ".cache")
    return str(Path(base) / "eagle-viewer" / "index-cache")


# 読み取ったインデックスをライブラリごとに保存するディレクトリ。"off" で保存しない。
_cache_env = os.environ.get("EAGLE_INDEX_CACHE_DIR", "").strip()
INDEX_CACHE_DIR = "" if _cache_env.lower() in {"off", "none", "0"} else (_cache_env or _default_index_cache_dir())

# 評価（★）を変更してよいライブラリ（id か名前かパス。改行・":"・"," で区切る）。既定はなし＝読み取り専用。
# ほかの Mac から受信専用で同期しているライブラリは、ここで書き換えても上書きされるので入れない。
VAULT_EDITABLE = os.environ.get("EAGLE_VAULT_EDITABLE", "")

HOST = os.environ.get("HOST", "0.0.0.0")
PORT = int(os.environ.get("PORT", "8000"))

# アクセス用パスワード：設定するとページを開く前にログインが必要。未設定なら認証なし
VIEWER_PASSWORD = os.environ.get("VIEWER_PASSWORD", "").strip()
# Automation tools and API clients can use this optional token instead of a browser session.
VIEWER_API_TOKEN = os.environ.get("VIEWER_API_TOKEN", "").strip()
# Session signing key. Never reuse the access password as the signing key.
VIEWER_SECRET_KEY = os.environ.get("VIEWER_SECRET_KEY", "").strip()
