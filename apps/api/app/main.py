"""نقطة الدخول لخادم المنصة."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from sqlalchemy import text

from app.api.routes import ai, assets, auth, courses, discussions, library, packages, vaults
from app.core.config import settings
from app.db.base import Base, engine
from app.services.packages import EduPkgError


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    with engine.connect() as conn:
        try:
            res = conn.execute(text("PRAGMA table_info(vault_files)")).fetchall()
            cols = [r[1] for r in res]
            if cols and "folder" not in cols:
                conn.execute(text("ALTER TABLE vault_files ADD COLUMN folder VARCHAR(120)"))
            if cols and "tags" not in cols:
                conn.execute(text("ALTER TABLE vault_files ADD COLUMN tags JSON DEFAULT '[]'"))
            conn.commit()
        except Exception:
            pass
    yield


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    description="منصة بناء المناهج وتصديرها كحاويات .edupkg",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.web_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(EduPkgError)
async def edupkg_error_handler(_: Request, exc: EduPkgError) -> JSONResponse:
    return JSONResponse(status_code=422, content={"detail": exc.to_dict()})


@app.get(f"{settings.api_prefix}/health")
def health() -> dict:
    return {"status": "ok", "app": settings.app_name}


for module in (auth, courses, assets, library, packages, discussions, ai, vaults):
    app.include_router(module.router, prefix=settings.api_prefix)

