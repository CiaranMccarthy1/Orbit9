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
    return f"{ra!r}:{dec!r}:{radius!r}"


def _fresh(row):
    fetched = row.fetched_at
    if fetched.tzinfo is None:  # SQLite drops tzinfo
        fetched = fetched.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) - fetched < CACHE_TTL


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
        if hit:
            db.expunge(hit)
        db.query(FrameCache).filter(FrameCache.fetched_at < utcnow() - CACHE_TTL).delete(synchronize_session=False)
        db.commit()
    if hit and _fresh(hit):
        products = hit.products
    else:
        try:
            products = fetch_epochs(ra, dec, radius)
        except Exception as e:
            if hit:
                products = hit.products  # a stale list beats a blank page
            else:
                raise HTTPException(502, f"IRSA unavailable: {e}") from e
        else:
            with SessionLocal() as db:
                from sqlalchemy.dialects.postgresql import insert as pg_insert
                from sqlalchemy.dialects.sqlite import insert as sqlite_insert
                insert = sqlite_insert if db.get_bind().dialect.name == "sqlite" else pg_insert
                stmt = insert(FrameCache).values(key=key, products=products, fetched_at=utcnow())
                db.execute(stmt.on_conflict_do_update(index_elements=["key"], set_={"products": products, "fetched_at": utcnow()}))
                db.commit()
    exposures = group_exposures(products)
    return {"ra": ra, "dec": dec, "radius": radius,
            "n_exposures": len(exposures),
            "exposures": exposures}
