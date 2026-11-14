import hashlib
from pathlib import Path
from urllib.parse import urlparse

from fastapi import APIRouter, HTTPException

from app import config
from app.database import SessionLocal
from app.models import Render
from app.pipeline.irsa_fetcher import download_fits
from app.pipeline.png_renderer import render_png

router = APIRouter()

ALLOWED_HOST = "irsa.ipac.caltech.edu"
ALLOWED_PATH = "/ibe/data/spherex/"


def _sha1(url):
    return hashlib.sha1(url.encode()).hexdigest()


def _validate(url):
    p = urlparse(url)
    if (p.scheme != "https" or p.hostname != ALLOWED_HOST
            or not p.path.startswith(ALLOWED_PATH) or p.query):
        raise HTTPException(400, "url must be a plain IRSA SPHEREx data url")


@router.get("/render")
def render(url: str):
    """Download (cached) an IRSA SPHEREx FITS and return a stretched PNG path."""
    _validate(url)
    key = _sha1(url)
    storage = Path(config.STORAGE_DIR)
    fits_path = storage / "fits_raw" / f"{key}.fits"
    png_path = storage / "png_renders" / f"{key}.png"
    with SessionLocal() as db:
        hit = db.get(Render, key)
        if hit and png_path.exists():
            return {"png": f"/storage/png_renders/{key}.png", "cached": True}
        if not fits_path.exists():
            download_fits(url, fits_path)
        render_png(fits_path, png_path)
        db.merge(Render(key=key, png_path=str(png_path)))
        db.commit()
    return {"png": f"/storage/png_renders/{key}.png", "cached": False}
