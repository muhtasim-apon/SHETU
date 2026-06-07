# """FastAPI application entrypoint for the Shetu Auth backend."""
# from fastapi import FastAPI, Request
# from fastapi.middleware.cors import CORSMiddleware
# from fastapi.responses import JSONResponse
# from starlette.exceptions import HTTPException as StarletteHTTPException

# from app.core.config import settings
# from app.routes.auth import router as auth_router

# app = FastAPI(title="Shetu Auth Backend", version="1.0.0")

# app.add_middleware(
#     CORSMiddleware,
#     allow_origins=settings.allowed_origins_list,
#     # Accept localhost / 127.0.0.1 on any port for local development so the
#     # frontend works regardless of which host alias the browser uses.
#     allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
#     allow_credentials=True,
#     allow_methods=["*"],
#     allow_headers=["*"],
# )

# app.include_router(auth_router)


# @app.get("/health")
# def health() -> dict[str, str]:
#     return {"status": "ok", "service": "shetu-auth-backend"}


# @app.exception_handler(StarletteHTTPException)
# async def http_exception_handler(request: Request, exc: StarletteHTTPException):
#     """Preserve intended status codes while keeping the {detail} shape."""
#     return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


# @app.exception_handler(Exception)
# async def global_exception_handler(request: Request, exc: Exception):
#     """Catch-all so the client never sees a raw stack trace."""
#     return JSONResponse(status_code=500, content={"detail": str(exc)})
"""FastAPI application entrypoint for the Shetu Auth backend."""

# ── Network fix: extend default socket timeout for slow/restricted networks ──
import socket
socket.setdefaulttimeout(60)   # 60 seconds (default is OS-level ~10s)

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

import logging
import os

from app.core.config import settings
from app.routes.auth import router as auth_router

# ── Shetu Saathi (patient module) routers ────────────────────────────────────
from app.routes.profile import router as profile_router
from app.routes.vitals import router as vitals_router
from app.routes.checkin import router as checkin_router
from app.routes.goals import router as goals_router
from app.routes.reports import router as reports_router
from app.routes.consultancy import router as consultancy_router
from app.routes.blog import router as blog_router
from app.routes.chat import router as chat_router
from app.services import blog_fetcher

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Shetu Backend (Auth + Saathi)", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
for _r in (profile_router, vitals_router, checkin_router, goals_router,
           reports_router, consultancy_router, blog_router, chat_router):
    app.include_router(_r)

_scheduler = None


@app.on_event("startup")
async def _saathi_startup():
    os.makedirs(settings.REPORT_STORAGE_PATH, exist_ok=True)
    try:
        await blog_fetcher.fetch_and_cache_articles()
    except Exception as exc:  # noqa: BLE001
        logger.warning("Initial article fetch failed: %s", exc)
    try:
        from apscheduler.schedulers.asyncio import AsyncIOScheduler
        global _scheduler
        _scheduler = AsyncIOScheduler()
        _scheduler.add_job(blog_fetcher.fetch_and_cache_articles, "interval", hours=6)
        _scheduler.add_job(blog_fetcher.sync_articles_to_supabase, "interval", hours=12)
        _scheduler.start()
        logger.info("Saathi scheduler started (fetch 6h, sync 12h).")
    except Exception as exc:  # noqa: BLE001
        logger.warning("Scheduler not started: %s", exc)


@app.on_event("shutdown")
async def _saathi_shutdown():
    if _scheduler:
        _scheduler.shutdown(wait=False)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "shetu-backend", "modules": "auth+saathi"}


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(status_code=500, content={"detail": str(exc)})