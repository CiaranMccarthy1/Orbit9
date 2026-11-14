from pathlib import Path

from fastapi import APIRouter

from app import config
from app.cache import cached_fits, ensure_render
from app.pipeline.png_renderer import render_png
from app.urls import url_key, validate

router = APIRouter()


@router.get("/render")
def render(url: str):
    """Download (cached) an IRSA SPHEREx FITS and return a stretched PNG path."""
    validate(url)
    key = url_key(url)
    png_path = Path(config.STORAGE_DIR, "png_renders", f"{key}.png")
    def build():
        with cached_fits(url) as paths:
            render_png(paths[0], png_path)

    png, cached = ensure_render(key, png_path, build)
    return {"png": png, "cached": cached}
