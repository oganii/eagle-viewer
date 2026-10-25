"""Request-scoped selection of the Eagle library (``?lib=<id>``, default library when omitted)."""
import time

from fastapi import HTTPException, Query

from app.vault.libraries import get_manager
from app.vault.parser import set_request_library

# After a failed index attempt, wait this long before a request retries it.
RETRY_FAILED_LOAD_AFTER_S = 30.0


async def select_library(
    lib: str = Query("", description="Library id from /api/libraries (default library when empty)"),
) -> None:
    """Pin the requested library for this request, or answer 503 while it is being indexed.

    Declared ``async`` so the context variable is set in the request task and is then
    copied into the worker thread that runs the (sync) endpoint.
    """
    manager = get_manager()
    index = manager.resolve(lib)
    if index is None:
        raise HTTPException(status_code=404, detail="ライブラリが見つかりません")
    manager.touch(index)
    data = index.data
    if data is None:
        if index.state != "error" or time.monotonic() - index.failed_at > RETRY_FAILED_LOAD_AFTER_S:
            manager.request_load(index)
        raise HTTPException(
            status_code=503,
            detail={"code": "library-loading", "library": manager.describe(index)},
            headers={"Retry-After": "2"},
        )
    set_request_library(index, data)
