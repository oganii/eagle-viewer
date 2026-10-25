import logging
import hmac
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, Form, HTTPException, Request
from fastapi.responses import FileResponse, Response, RedirectResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware
from starlette.types import ASGIApp

from app.config import VIEWER_API_TOKEN, VIEWER_PASSWORD, VIEWER_SECRET_KEY
from app.api.folders import router as folders_router
from app.api.items import router as items_router
from app.api.deps import select_library
from app.vault import APP_VERSION, load_vault, get_cache_stats, get_library_status
from app.vault.libraries import get_manager

if VIEWER_PASSWORD and not VIEWER_SECRET_KEY:
    raise RuntimeError("VIEWER_SECRET_KEY must be set when VIEWER_PASSWORD is enabled")

# uvicorn は既定では root logger を設定しない（app.* の effective level は WARNING）ため、
# parser などのモジュールの INFO ログが既定のデプロイでは見えない。ここで明示的に root に
# INFO + StreamHandler を設定する。uvicorn 自身の loggers は dictConfig で
# propagate=False になっているので、これで二重に出力されることはない。
logging.basicConfig(level=logging.INFO)

logger = logging.getLogger(__name__)


def has_valid_api_token(headers: list[tuple[bytes, bytes]], token: str) -> bool:
    """Constant-time validation for an optional API-client Bearer token."""
    if not token:
        return False
    authorization = dict(headers).get(b"authorization", b"").decode("latin-1")
    return authorization.startswith("Bearer ") and hmac.compare_digest(authorization[7:], token)


class AuthMiddleware:
    """パスワード未設定なら通す。設定されていれば session を検証し、未ログインなら API は 401、ページは /login へリダイレクトする。"""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: dict, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        path = scope.get("path", "")
        if path == "/health":
            await self.app(scope, receive, send)
            return
        if path.startswith("/api/") and has_valid_api_token(scope.get("headers") or [], VIEWER_API_TOKEN):
            await self.app(scope, receive, send)
            return
        if not VIEWER_PASSWORD:
            if path.startswith("/api/") and VIEWER_API_TOKEN:
                from starlette.responses import Response
                response = Response(status_code=401, content="Unauthorized")
                await response(scope, receive, send)
                return
            await self.app(scope, receive, send)
            return
        if path == "/login":
            await self.app(scope, receive, send)
            return
        # Session は SessionMiddleware が埋めるので、Auth より前に実行する必要がある
        session = scope.get("session") or {}
        if session.get("logged_in"):
            await self.app(scope, receive, send)
            return
        if path.startswith("/api/"):
            from starlette.responses import Response
            response = Response(status_code=401, content="Unauthorized")
            await response(scope, receive, send)
            return
        from starlette.responses import RedirectResponse
        response = RedirectResponse(url="/login", status_code=302)
        await response(scope, receive, send)
        return


class SecurityHeadersMiddleware:
    """Apply conservative browser security headers to every HTTP response."""

    headers = (
        (b"x-content-type-options", b"nosniff"),
        (b"x-frame-options", b"DENY"),
        (b"referrer-policy", b"no-referrer"),
        (b"permissions-policy", b"camera=(), microphone=(), geolocation=()"),
        (b"cross-origin-resource-policy", b"same-origin"),
    )

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: dict, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_with_security_headers(message: dict) -> None:
            if message["type"] == "http.response.start":
                response_headers = list(message.get("headers") or [])
                existing = {name.lower() for name, _value in response_headers}
                response_headers.extend((name, value) for name, value in self.headers if name not in existing)
                message["headers"] = response_headers
            await send(message)

        await self.app(scope, receive, send_with_security_headers)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Index only the default library, in the background: a cached index is served within
    # seconds, a cold one can take minutes on a slow disk. Other libraries load on first use.
    try:
        manager = get_manager()
        manager.request_load(manager.default_index())
    except Exception:
        logger.exception("Failed to start indexing the default Eagle library")
    yield


app = FastAPI(title="Eagle Vault Viewer", description="Read-only viewer for Eagle library on NAS", lifespan=lifespan)

# Session を先に、Auth を後に追加する：リクエスト時はまず Session（cookie をデコードして scope に書く）、次に Auth（検証）が動く
if VIEWER_PASSWORD or VIEWER_API_TOKEN:
    app.add_middleware(AuthMiddleware)
if VIEWER_PASSWORD:
    app.add_middleware(SessionMiddleware, secret_key=VIEWER_SECRET_KEY or "eagle-viewer-session")
app.add_middleware(SecurityHeadersMiddleware)

app.include_router(folders_router)
app.include_router(items_router)


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/api/info")
def api_info():
    return {
        "name": "Eagle Vault Viewer",
        "version": APP_VERSION,
        "apiVersion": 1,
        "features": [
            "browse", "search", "preview", "download", "bearerAuth", "protectedFolders",
            "libraries", "rating", "ratingEdit",
        ],
        "auth": {"session": bool(VIEWER_PASSWORD), "bearer": bool(VIEWER_API_TOKEN)},
    }

@app.get("/api/libraries")
def list_libraries():
    """Configured libraries with their index state (unloaded / loading / ready / error)."""
    return get_manager().list()


@app.post("/api/libraries/{lib_id}/load")
def load_library(lib_id: str):
    """Start indexing a library in the background (no-op when it is ready or loading)."""
    manager = get_manager()
    index = manager.resolve(lib_id)
    if index is None:
        raise HTTPException(status_code=404, detail="ライブラリが見つかりません")
    manager.request_load(index)
    return manager.describe(index)


@app.post("/api/library/reload", dependencies=[Depends(select_library)])
def reload_library():
    load_vault()
    return {"ok": True, "stats": get_cache_stats(), "status": get_library_status(deep=False)}


@app.get("/api/library/status", dependencies=[Depends(select_library)])
def library_status(deep: bool = False):
    return get_library_status(deep=deep)

# Serve frontend at / (API routes under /api take precedence)
web_dir = Path(__file__).parent / "web"
_index_path = web_dir / "index.html"
_login_path = web_dir / "login.html"
_manifest_path = web_dir / "manifest.json"
_sw_path = web_dir / "sw.js"
_mobile_path = web_dir / "mobile.html"

app.mount("/static", StaticFiles(directory=web_dir, html=False), name="static")


@app.get("/login", response_class=HTMLResponse)
def login_page(request: Request, error: str = ""):
    """ログインページ。"""
    if not VIEWER_PASSWORD:
        return RedirectResponse(url="/", status_code=302)
    if request.session.get("logged_in"):
        return RedirectResponse(url="/", status_code=302)
    if not _login_path.exists():
        return HTMLResponse("<h1>Login</h1><p>login.html not found</p>", status_code=500)
    html = _login_path.read_text(encoding="utf-8")
    error_html = '<p class="error">パスワードが違います。もう一度お試しください</p>' if error else ""
    html = html.replace("__ERROR_HTML__", error_html)
    return HTMLResponse(html)


@app.post("/login")
def login_submit(request: Request, password: str = Form(default="")):
    """パスワードを検証して session に書き込み、成功したらトップページへ移動する。"""
    if not VIEWER_PASSWORD:
        return RedirectResponse(url="/", status_code=302)
    if hmac.compare_digest(password, VIEWER_PASSWORD):
        request.session["logged_in"] = True
        return RedirectResponse(url="/", status_code=302)
    return RedirectResponse(url="/login?error=1", status_code=302)


@app.get("/")
def index():
    if _index_path.exists():
        return FileResponse(_index_path)
    return {"message": "Eagle Vault Viewer API", "docs": "/docs"}


@app.get("/index.html")
def index_html():
    if _index_path.exists():
        return FileResponse(_index_path)
    return {"message": "Eagle Vault Viewer API", "docs": "/docs"}


@app.get("/manifest.json")
def manifest():
    if _manifest_path.exists():
        return FileResponse(_manifest_path, media_type="application/json")
    return {"name": "Eagle Vault Viewer", "start_url": "/", "display": "standalone"}


@app.get("/sw.js")
def sw():
    if _sw_path.exists():
        return FileResponse(_sw_path, media_type="application/javascript")
    return Response(content="", media_type="application/javascript")


@app.get("/mobile.html")
def mobile_page():
    if _mobile_path.exists():
        return FileResponse(_mobile_path, media_type="text/html")
    return RedirectResponse(url="/", status_code=302)
