from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app import config
from app.database import init_db
from app.api import routes_frames, routes_render, routes_targets
from app.scripts.seed import seed_targets

# StaticFiles validates directory existence at mount time, before lifespan runs
for _d in ("fits_raw", "png_renders"):
    Path(config.STORAGE_DIR, _d).mkdir(parents=True, exist_ok=True)


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

app.include_router(routes_targets.router)
app.include_router(routes_frames.router)
app.include_router(routes_render.router)

app.mount("/storage", StaticFiles(directory=config.STORAGE_DIR), name="storage")


@app.get("/health")
def health():
    return {"status": "ok"}
