import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.cache as cache
from app import config
from app.database import Base


def _db(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{tmp_path}/t.db")
    Base.metadata.create_all(engine)
    monkeypatch.setattr(config, "STORAGE_DIR", str(tmp_path))
    monkeypatch.setattr(cache, "SessionLocal", sessionmaker(bind=engine))


def test_ensure_render_rebuilds_only_when_png_missing(tmp_path, monkeypatch):
    _db(tmp_path, monkeypatch)
    png = tmp_path / "x.png"
    calls = []

    def build():
        calls.append(1)
        png.write_bytes(b"1")

    _, cached = cache.ensure_render("k1", png, build)
    assert cached is False and calls == [1]      # first miss builds
    _, cached = cache.ensure_render("k1", png, build)
    assert cached is True and calls == [1]       # row + file -> no rebuild
    png.unlink()
    _, cached = cache.ensure_render("k1", png, build)
    assert cached is False and calls == [1, 1]   # stale row -> rebuild


def test_ensure_fits_download_failure_is_502(tmp_path, monkeypatch):
    from fastapi import HTTPException

    monkeypatch.setattr(config, "STORAGE_DIR", str(tmp_path))
    monkeypatch.setattr(cache, "download_fits",
                        lambda url, path: (_ for _ in ()).throw(RuntimeError("timeout")))
    with pytest.raises(HTTPException) as e:
        cache.ensure_fits("https://irsa.ipac.caltech.edu/ibe/data/spherex/x.fits")
    assert e.value.status_code == 502 and "timeout" in e.value.detail
