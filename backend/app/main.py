"""Turfed API.

Run locally:  uvicorn app.main:app --reload   (from the backend folder)
API docs:     http://localhost:8000/docs

Everything lives under /api. If the front end has been built (frontend/dist), FastAPI serves it
too, so the whole app is one URL: easy to deploy and to open on a phone over HTTPS.
"""
import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from .config import CORS_ORIGINS, STATIC_DIR
from .db import Base, DB_URL, add_missing_columns, engine
from .routers import game, hangs, teams, users


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Creates any missing tables and columns. Fine for a hackathon; use Alembic migrations for a real launch.
    Base.metadata.create_all(engine)
    added = add_missing_columns()
    log = logging.getLogger("uvicorn.error")
    if added:
        log.info("Added missing database columns: %s", ", ".join(added))

    async def end_forgotten_hangs():
        # Every minute: end Hangs nobody has opened the app for in hours, or that everyone left.
        while True:
            try:
                ended = await run_in_threadpool(hangs.end_overdue_hangs)
                if ended:
                    log.info("Ended %d forgotten Hang(s)", ended)
            except Exception:  # never let the background job crash the server
                log.exception("Couldn't check for forgotten Hangs")
            await asyncio.sleep(60)

    task = asyncio.create_task(end_forgotten_hangs())
    yield
    task.cancel()


app = FastAPI(title="Turfed API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(users.router, prefix="/api")
app.include_router(teams.router, prefix="/api")
app.include_router(hangs.router, prefix="/api")
app.include_router(game.router, prefix="/api")


@app.get("/api/health")
def health():
    return {"ok": True, "database": DB_URL.split(":", 1)[0]}


# ---- Serve the built React app (single-page app: unknown paths get index.html) ----
if STATIC_DIR.is_dir():
    static_root = STATIC_DIR.resolve()

    @app.get("/{path:path}", include_in_schema=False)
    def frontend(path: str):
        if path.startswith("api/"):
            raise HTTPException(404, "Not found")
        file = (static_root / path).resolve()
        if path and file.is_file() and static_root in file.parents:
            return FileResponse(file)
        return FileResponse(static_root / "index.html")
