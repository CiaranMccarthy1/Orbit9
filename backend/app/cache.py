"""Shared FITS + rendered-PNG caching (Linux/Docker file locks)."""
import fcntl
import time
from contextlib import ExitStack, contextmanager
from pathlib import Path

from fastapi import HTTPException

from app import config
from app.database import SessionLocal
from app.models import Render
from app.pipeline.irsa_fetcher import download_fits
from app.urls import url_key


@contextmanager
def file_lock(path, blocking=True):
    # Keep lock files: unlinking them would let two processes lock different inodes.
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.with_suffix(path.suffix + ".lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | (0 if blocking else fcntl.LOCK_NB))
        try:
            yield
        finally:
            fcntl.flock(lock, fcntl.LOCK_UN)


def _evict(folder, suffix, cap):
    if cap <= 0:
        return
    files = []
    for path in Path(config.STORAGE_DIR, folder).glob(f"*.{suffix}"):
        try:
            files.append((path.stat().st_mtime, path.stat().st_size, path))
        except FileNotFoundError:
            pass
    total = sum(size for _, size, _ in files)
    for age, size, path in sorted(files):
        if total <= cap * 1e9:
            break
        # shortcut: allow a five-minute overage so advertised PNG URLs survive a browser fetch.
        if suffix == "png" and age > time.time() - 300:
            continue
        try:
            with file_lock(path, blocking=False):
                if path.stat().st_mtime != age:
                    continue  # a reader refreshed it since the snapshot
                path.unlink(missing_ok=True)
                total -= size
                if suffix == "png":
                    with SessionLocal() as db:
                        db.query(Render).filter_by(key=path.stem).delete()
                        db.commit()
        except (FileNotFoundError, BlockingIOError):
            continue


def evict_old_fits():
    _evict("fits_raw", "fits", config.MAX_RAW_GB)


def evict_old_pngs():
    _evict("png_renders", "png", config.MAX_PNG_GB)


def _ensure_fits(url, path):
    if path.exists():
        path.touch()
    else:
        evict_old_fits()
        try:
            download_fits(url, path)
        except Exception as e:
            raise HTTPException(502, f"IRSA download failed: {e}") from e
    if not path.is_file():
        raise HTTPException(502, "FITS download did not produce a file; retry the request")
    return path


@contextmanager
def cached_fits(*urls):
    paths = {u: Path(config.STORAGE_DIR, "fits_raw", f"{url_key(u)}.fits") for u in urls}
    with ExitStack() as locks:
        for path in sorted(set(paths.values())):
            locks.enter_context(file_lock(path))
        yield [_ensure_fits(u, paths[u]) for u in urls]


def ensure_fits(url):
    with cached_fits(url) as paths:
        return paths[0]


def ensure_render(key, png_path, build):
    """Return (public url, cached); build once and protect active FITS readers."""
    with file_lock(png_path):
        cached = png_path.is_file()
        if cached:
            png_path.touch()
        else:
            evict_old_pngs()
            build()
        if not png_path.is_file():
            raise HTTPException(502, "Render unavailable; retry the request")
        with SessionLocal() as db:
            db.merge(Render(key=key))
            db.commit()
        return f"/storage/png_renders/{png_path.name}", cached
