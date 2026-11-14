import hashlib
from pathlib import Path

from fastapi import APIRouter, HTTPException

from app import config
from app.cache import ensure_fits, ensure_render
from app.pipeline.png_renderer import render_png
from app.urls import validate

router = APIRouter()


@router.get("/render")
def render(url: str):
    """Download (cached) an IRSA SPHEREx FITS and return a stretched PNG path."""
    validate(url)
    key = hashlib.sha1(url.encode()).hexdigest()
    png_path = Path(config.STORAGE_DIR, "png_renders", f"{key}.png")
    png, cached = ensure_render(
        key, png_path, lambda: render_png(ensure_fits(url), png_path))
    return {"png": png, "cached": cached}
