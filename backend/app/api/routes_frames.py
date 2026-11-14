from fastapi import APIRouter, HTTPException

from app.pipeline.grouping import group_exposures
from app.pipeline.irsa_fetcher import fetch_epochs
from app.database import SessionLocal
from app.models import FrameCache

router = APIRouter()


def _cache_key(ra, dec, radius):
    return f"{ra:.2f}:{dec:.2f}:{radius:g}"


@router.get("/frames")
def frames(ra: float, dec: float, radius: float = 0.1):
    """Exposures (epochs) covering a position, from IRSA cache or live."""
    if not 0 < radius <= 5:
        raise HTTPException(400, "radius must be in (0, 5] deg")
    key = _cache_key(ra, dec, radius)
    with SessionLocal() as db:
        hit = db.get(FrameCache, key)
        if hit:
            products = hit.products
        else:
            products = fetch_epochs(ra, dec, radius)
            db.add(FrameCache(key=key, products=products))
            db.commit()
    exposures = group_exposures(products)
    return {"ra": ra, "dec": dec, "radius": radius,
            "n_exposures": len(exposures),
            "exposures": exposures}
