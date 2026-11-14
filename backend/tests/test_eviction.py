from app import config
from app.cache import evict_old_fits, evict_old_pngs


def make(path, size_kb, mtime):
    import os

    path.write_bytes(b"0" * size_kb * 1000)
    os.utime(path, (mtime, mtime))
    return path


def test_evict_removes_oldest_until_under_cap(tmp_path):
    raw = tmp_path / "storage" / "fits_raw"
    raw.mkdir(parents=True)
    old = make(raw / "a.fits", 60_000, 100.0)   # 60 MB
    new = make(raw / "b.fits", 60_000, 200.0)   # 60 MB
    config.STORAGE_DIR = str(tmp_path / "storage")
    config.MAX_RAW_GB = 0.08                    # 80 MB cap
    try:
        evict_old_fits()
    finally:
        config.MAX_RAW_GB = 10
    assert not old.exists()
    assert new.exists()


def test_evict_removes_oldest_png_until_under_cap(tmp_path, monkeypatch):
    renders = tmp_path / "storage" / "png_renders"
    renders.mkdir(parents=True)
    old = make(renders / "a.png", 60_000, 100.0)
    new = make(renders / "b.png", 60_000, 200.0)
    monkeypatch.setattr(config, "STORAGE_DIR", str(tmp_path / "storage"))
    monkeypatch.setattr(config, "MAX_PNG_GB", 0.08)
    evict_old_pngs()
    assert not old.exists()
    assert new.exists()


def test_evict_noop_under_cap(tmp_path):
    raw = tmp_path / "storage" / "fits_raw"
    raw.mkdir(parents=True)
    keep = make(raw / "c.fits", 10, 100.0)
    config.STORAGE_DIR = str(tmp_path / "storage")
    evict_old_fits()
    assert keep.exists()
