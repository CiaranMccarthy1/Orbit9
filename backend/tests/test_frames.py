from datetime import timedelta

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.api import routes_frames
from app.pipeline import irsa_fetcher
from app.database import Base
from app.models import FrameCache, utcnow

KEY = routes_frames._cache_key(10.0, 20.0, 0.1)


@pytest.fixture
def db(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{tmp_path}/frames.db")
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    monkeypatch.setattr(routes_frames, "SessionLocal", factory)
    monkeypatch.setattr(irsa_fetcher.time, "sleep", lambda _: None)
    return factory


def product():
    return {"obs_id": "EXP", "access_url": "https://irsa.ipac.caltech.edu/x.fits",
            "size_kb": 1, "em_min_um": 1.6, "em_max_um": 2.4,
            "res_power": 1.0, "res_arcsec": 3.0, "t_min": 60000.0}


def fail(*args, **kwargs):
    raise RuntimeError("IRSA 502")


def test_frames_fresh_cache_skips_irsa(db, monkeypatch):
    with db() as session:
        session.add(FrameCache(key=KEY, products=[product()], fetched_at=utcnow()))
        session.commit()
    monkeypatch.setattr(routes_frames, "fetch_epochs", lambda *a, **k: pytest.fail("IRSA called"))
    assert routes_frames.frames(10.0, 20.0, 0.1)["n_exposures"] == 1


def test_frames_retries_and_falls_back_to_stale_cache(db, monkeypatch):
    with db() as session:
        session.add(FrameCache(key=KEY, products=[product()],
                               fetched_at=utcnow() - timedelta(days=2)))
        session.commit()
    calls = []
    def failing(*args, **kwargs):
        calls.append(1)
        raise RuntimeError("IRSA 502")
    monkeypatch.setattr(irsa_fetcher.Irsa, "query_sia", failing)
    assert routes_frames.frames(10.0, 20.0, 0.1)["n_exposures"] == 1
    assert len(calls) == 2


def test_frames_502_after_retry_without_cache(db, monkeypatch):
    monkeypatch.setattr(irsa_fetcher.Irsa, "query_sia", fail)
    with pytest.raises(HTTPException) as exc:
        routes_frames.frames(10.0, 20.0, 0.1)
    assert exc.value.status_code == 502


def test_nearby_centers_and_expired_cache_growth(db, monkeypatch):
    calls = []
    def fetch(ra, dec, radius):
        calls.append((ra, dec))
        return [{**product(), 'obs_id': str(ra)}]
    monkeypatch.setattr(routes_frames, 'fetch_epochs', fetch)
    with db() as session:
        session.add_all(FrameCache(key=str(i), products=[], fetched_at=utcnow()-timedelta(days=2)) for i in range(100))
        session.commit()
    a = routes_frames.frames(10.001, 20.001, 0.01)
    b = routes_frames.frames(10.004, 20.004, 0.01)
    assert a['exposures'][0]['obs_id'] != b['exposures'][0]['obs_id']
    assert len(calls) == 2
    with db() as session:
        assert session.query(FrameCache).count() == 2
