"""Shared FITS + rendered-PNG caching."""
from pathlib import Path

from app import config
from app.database import SessionLocal
from app.models import Render
from app.pipeline.irsa_fetcher import download_fits
from app.urls import url_key


def ensure_fits(url):
    path = Path(config.STORAGE_DIR, "fits_raw", f"{url_key(url)}.fits")
    if not path.exists():
        download_fits(url, path)
    return path


def ensure_render(key, png_path, build):
    """Return (public url, cached); build() writes png_path on miss."""
    with SessionLocal() as db:
        hit = db.get(Render, key)
    if hit and png_path.exists():
        return f"/storage/png_renders/{png_path.name}", True
    build()
    with SessionLocal() as db:
        db.merge(Render(key=key, png_path=str(png_path)))
        db.commit()
    return f"/storage/png_renders/{png_path.name}", False
