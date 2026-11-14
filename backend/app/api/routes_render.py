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


def _sha1(url):
    return hashlib.sha1(url.encode()).hexdigest()


@router.get("/render")
def render(url: str):
    """Download (cached) an IRSA SPHEREx FITS and return a stretched PNG path."""
    host = urlparse(url).hostname
    if host != ALLOWED_HOST:
        raise HTTPException(400, f"url must be on {ALLOWED_HOST}")
    key = _sha1(url)
    with SessionLocal() as db:
        hit = db.get(Render, key)
        if hit:
            return {"png": f"/storage/png_renders/{key}.png", "cached": True}
        storage = Path(config.STORAGE_DIR)
        fits_path = download_fits(url, storage / "fits_raw" / f"{key}.fits")
        render_png(fits_path, storage / "png_renders" / f"{key}.png")
        db.add(Render(key=key, png_path=str(storage / "png_renders" / f"{key}.png")))
        db.commit()
    return {"png": f"/storage/png_renders/{key}.png", "cached": False}
