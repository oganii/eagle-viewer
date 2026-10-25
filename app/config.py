import os

VAULT_ROOT = os.environ.get("EAGLE_VAULT_ROOT", "/vault")
HOST = os.environ.get("HOST", "0.0.0.0")
PORT = int(os.environ.get("PORT", "8000"))

# アクセス用パスワード：設定するとページを開く前にログインが必要。未設定なら認証なし
VIEWER_PASSWORD = os.environ.get("VIEWER_PASSWORD", "").strip()
# Automation tools and API clients can use this optional token instead of a browser session.
VIEWER_API_TOKEN = os.environ.get("VIEWER_API_TOKEN", "").strip()
# Session signing key. Never reuse the access password as the signing key.
VIEWER_SECRET_KEY = os.environ.get("VIEWER_SECRET_KEY", "").strip()
