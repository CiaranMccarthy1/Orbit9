import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app import config
from app.database import init_db
from app.api import routes_combine, routes_frames, routes_render, routes_targets, routes_users, routes_discoveries
from app.scripts.seed import seed_targets

# StaticFiles validates directory existence at mount time, before lifespan runs
for _d in ("fits_raw", "png_renders"):
    _path = Path(config.STORAGE_DIR, _d)
    _path.mkdir(parents=True, exist_ok=True)
    if not os.access(_path, os.W_OK):
        raise RuntimeError(
            f"{_path} is not writable by uid {os.getuid()}. "
            f"Run: sudo chown -R {os.getuid()}:{os.getgid()} {config.STORAGE_DIR}"
        )


@asynccontextmanager
async def lifespan(app):
    init_db()
    seed_targets()
    yield


app = FastAPI(title="Planet X API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(routes_users.router)
app.include_router(routes_discoveries.router)
app.include_router(routes_targets.router)
app.include_router(routes_frames.router)
app.include_router(routes_render.router)
app.include_router(routes_combine.router)

# only rendered PNGs are public; fits_raw/ and the sqlite db stay private
app.mount("/storage/png_renders",
          StaticFiles(directory=str(Path(config.STORAGE_DIR, "png_renders"))),
          name="storage")


@app.get("/health")
def health():
    return {"status": "ok"}
