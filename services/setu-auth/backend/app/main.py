"""FastAPI application entrypoint for the Shetu Auth backend."""
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.config import settings
from app.routes.auth import router as auth_router

app = FastAPI(title="Shetu Auth Backend", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "shetu-auth-backend"}


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    """Preserve intended status codes while keeping the {detail} shape."""
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Catch-all so the client never sees a raw stack trace."""
    return JSONResponse(status_code=500, content={"detail": str(exc)})
