from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app import config, cache
from app.database import Base
from app.models import Render
from app.cache import evict_old_fits, evict_old_pngs


def make(path, size_kb, mtime):
    import os

    path.write_bytes(b"0" * size_kb * 1000)
    os.utime(path, (mtime, mtime))
    return path


def test_evict_removes_oldest_until_under_cap(tmp_path, monkeypatch):
    raw = tmp_path / "storage" / "fits_raw"
    raw.mkdir(parents=True)
    old = make(raw / "a.fits", 60_000, 100.0)   # 60 MB
    new = make(raw / "b.fits", 60_000, 200.0)   # 60 MB
    monkeypatch.setattr(config, "STORAGE_DIR", str(tmp_path / "storage"))
    monkeypatch.setattr(config, "MAX_RAW_GB", 0.08)
    evict_old_fits()
    assert not old.exists()
    assert new.exists()


def test_evict_removes_oldest_png_until_under_cap(tmp_path, monkeypatch):
    renders = tmp_path / "storage" / "png_renders"
    renders.mkdir(parents=True)
    old = make(renders / "a.png", 60_000, 100.0)
    new = make(renders / "b.png", 60_000, 200.0)
    monkeypatch.setattr(config, "STORAGE_DIR", str(tmp_path / "storage"))
    monkeypatch.setattr(config, "MAX_PNG_GB", 0.08)
    engine = create_engine(f"sqlite:///{tmp_path}/test.db")
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    monkeypatch.setattr(cache, "SessionLocal", factory)
    with factory() as db:
        db.add_all([Render(key="a"), Render(key="b")])
        db.commit()
    evict_old_pngs()
    with factory() as db:
        assert db.get(Render, "a") is None
        assert db.get(Render, "b") is not None
    assert not old.exists()
    assert new.exists()


def test_evict_noop_under_cap(tmp_path, monkeypatch):
    raw = tmp_path / "storage" / "fits_raw"
    raw.mkdir(parents=True)
    keep = make(raw / "c.fits", 10, 100.0)
    monkeypatch.setattr(config, "STORAGE_DIR", str(tmp_path / "storage"))
    evict_old_fits()
    assert keep.exists()
