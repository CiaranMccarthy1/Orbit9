import time
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException

from app.database import SessionLocal
from app.models import FrameCache, utcnow
from app.pipeline.grouping import group_exposures
from app.pipeline.irsa_fetcher import fetch_epochs

router = APIRouter()

# New SPHEREx releases are rare; a day-old product list is still useful.
CACHE_TTL = timedelta(hours=24)


def _cache_key(ra, dec, radius):
    return f"{ra:.2f}:{dec:.2f}:{radius:g}"


def _fresh(row):
    fetched = row.fetched_at
    if fetched.tzinfo is None:  # SQLite drops tzinfo
        fetched = fetched.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) - fetched < CACHE_TTL


def _fetch_with_retry(ra, dec, radius):
    """One retry: IRSA occasionally returns a transient 502."""
    for attempt in range(2):
        try:
            return fetch_epochs(ra, dec, radius)
        except Exception:
            if attempt:
                raise
            time.sleep(1)


@router.get("/frames")
def frames(ra: float, dec: float, radius: float = 0.1):
    """Exposures (epochs) covering a position, from IRSA cache or live."""
    if not (0 <= ra <= 360) or not (-90 <= dec <= 90):
        raise HTTPException(400, "ra must be in [0, 360] deg, dec in [-90, 90] deg")
    if not 0 < radius <= 5:
        raise HTTPException(400, "radius must be in (0, 5] deg")
    key = _cache_key(ra, dec, radius)
    with SessionLocal() as db:
        hit = db.get(FrameCache, key)
    if hit and _fresh(hit):
        products = hit.products
    else:
        try:
            products = _fetch_with_retry(ra, dec, radius)
        except Exception as e:
            if hit:
                products = hit.products  # a stale list beats a blank page
            else:
                raise HTTPException(502, f"IRSA unavailable: {e}") from e
        else:
            with SessionLocal() as db:
                # merge: concurrent cache misses race on the same key
                db.merge(FrameCache(key=key, products=products, fetched_at=utcnow()))
                db.commit()
    exposures = group_exposures(products)
    return {"ra": ra, "dec": dec, "radius": radius,
            "n_exposures": len(exposures),
            "exposures": exposures}
