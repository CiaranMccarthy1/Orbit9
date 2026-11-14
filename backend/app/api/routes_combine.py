from pathlib import Path

from fastapi import APIRouter, HTTPException

from app import config
from app.cache import ensure_fits, ensure_render
from app.pipeline.combine import MODES, combine
from app.pipeline.photometry import aperture_median, flag_stats
from app.pipeline.rgb_composer import compose_rgb
from app.urls import spec_key, validate

router = APIRouter()


def _urls(param):
    urls = [u.strip() for u in param.split(",") if u.strip()]
    if not 2 <= len(urls) <= 6:
        raise HTTPException(400, "urls must contain 2-6 comma-separated urls")
    return [validate(u) for u in urls]


def _png_for(key):
    return Path(config.STORAGE_DIR, "png_renders", f"{key}.png")


@router.get("/combine")
def combine_frames(mode: str, urls: str):
    """diff = epoch N - N-1 (motion dipoles); coadd = mean of frames;
    stack = sum of one detector array's bands (same WCS, no resampling)."""
    if mode not in MODES:
        raise HTTPException(400, f"mode must be one of {MODES}")
    url_list = _urls(urls)
    key = spec_key("combine", "v3", mode, *url_list)
    png_path = _png_for(key)

    def build():
        try:
            combine(mode, [ensure_fits(u) for u in url_list], png_path)
        except ValueError as e:
            raise HTTPException(400, str(e))

    png, cached = ensure_render(key, png_path, build)
    return {"png": png, "mode": mode, "cached": cached}


@router.get("/rgb")
def rgb(r: str, g: str, b: str):
    """Three bands → false-colour composite (e.g. 3.0 / 4.26 / 4.67 um)."""
    for u in (r, g, b):
        validate(u)
    key = spec_key("rgb", r, g, b)
    png_path = _png_for(key)
    png, cached = ensure_render(
        key, png_path,
        lambda: compose_rgb(ensure_fits(r), ensure_fits(g), ensure_fits(b), png_path))
    return {"png": png, "cached": cached}


@router.get("/photometry")
def photometry(ra: float, dec: float, urls: str):
    """Aperture median at (ra, dec) across the given band files."""
    if not (0 <= ra <= 360) or not (-90 <= dec <= 90):
        raise HTTPException(400, "ra must be in [0, 360] deg, dec in [-90, 90] deg")
    url_list = _urls(urls)
    results = []
    for u in url_list:
        m = aperture_median(ensure_fits(u), ra, dec)
        results.append({"url": u, **(m or {"median": None, "n_pixels": 0})})
    return {"ra": ra, "dec": dec, "measurements": results}


@router.get("/flags")
def flags(url: str):
    """FLAGS bit counts and VARIANCE summary for one frame."""
    validate(url)
    return flag_stats(ensure_fits(url))
