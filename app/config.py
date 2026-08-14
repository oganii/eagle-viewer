import os

VAULT_ROOT = os.environ.get("EAGLE_VAULT_ROOT", "/vault")
HOST = os.environ.get("HOST", "0.0.0.0")
PORT = int(os.environ.get("PORT", "8000"))

# 访问密码：设置后打开页面需先登录；不设置则无需认证
VIEWER_PASSWORD = os.environ.get("VIEWER_PASSWORD", "").strip()
# Automation tools and API clients can use this optional token instead of a browser session.
VIEWER_API_TOKEN = os.environ.get("VIEWER_API_TOKEN", "").strip()
# Session signing key. Never reuse the access password as the signing key.
VIEWER_SECRET_KEY = os.environ.get("VIEWER_SECRET_KEY", "").strip()
