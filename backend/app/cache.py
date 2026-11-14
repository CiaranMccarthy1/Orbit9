"""Shared FITS + rendered-PNG caching."""
from pathlib import Path

from app import config
from app.database import SessionLocal
from app.models import Render
from app.pipeline.irsa_fetcher import download_fits
from app.urls import url_key


def evict_old_fits():
    """Delete least-recently-used FITS until fits_raw/ is under MAX_RAW_GB."""
    if config.MAX_RAW_GB <= 0:
        return
    raw = Path(config.STORAGE_DIR, "fits_raw")
    files = sorted(raw.glob("*.fits"), key=lambda p: p.stat().st_mtime)
    total = sum(p.stat().st_size for p in files)
    while files and total > config.MAX_RAW_GB * 1e9:
        p = files.pop(0)
        total -= p.stat().st_size
        p.unlink(missing_ok=True)


def ensure_fits(url):
    path = Path(config.STORAGE_DIR, "fits_raw", f"{url_key(url)}.fits")
    if path.exists():
        path.touch()  # refresh LRU age
    else:
        evict_old_fits()
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
