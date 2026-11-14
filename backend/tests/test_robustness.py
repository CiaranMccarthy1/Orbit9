from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
import threading
import time
import urllib.error
import urllib.request
from http.client import HTTPMessage

import numpy as np
import pytest
from astropy.io import fits
from astropy.table import Table, MaskedColumn
from fastapi import HTTPException
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app import cache, config, database
from app.models import Target
from app.pipeline import irsa_fetcher
from app.pipeline.imaging import load_image, read_extension
from app.scripts import seed
from app.urls import validate

URL = 'https://irsa.ipac.caltech.edu/ibe/data/spherex/x.fits'


@pytest.mark.parametrize('tail', ['../etc', '%2e%2e/etc', '%252e%252e/etc', './x', '%2e/x', 'x/%2f../y', 'x\\..\\y', 'x?y=1', 'x#fragment'])
def test_url_rejects_traversal(tail):
    with pytest.raises(HTTPException):
        validate(URL.replace('x.fits', tail))


def test_redirect_is_disabled(monkeypatch, tmp_path):
    def fake_open(self, url, timeout):
        handler = next(h for h in self.handlers if isinstance(h, urllib.request.HTTPRedirectHandler))
        assert handler.redirect_request(urllib.request.Request(URL), BytesIO(), 302, '', HTTPMessage(), 'https://elsewhere.test/') is None
        raise urllib.error.HTTPError(url, 302, 'redirect', HTTPMessage(), None)
    monkeypatch.setattr(urllib.request.OpenerDirector, 'open', fake_open)
    with pytest.raises(urllib.error.HTTPError):
        irsa_fetcher.download_fits(URL, tmp_path/'x.fits')
    assert not list(tmp_path.glob('*.part'))


@pytest.mark.parametrize('body', [b'<html>Error</html>', b'SIMPLE  =                    T'])
def test_download_rejects_invalid_fits(monkeypatch, tmp_path, body):
    monkeypatch.setattr(urllib.request.OpenerDirector, 'open', lambda *a, **k: BytesIO(body))
    with pytest.raises(HTTPException):
        irsa_fetcher.download_fits(URL, tmp_path/'x.fits')
    assert not (tmp_path/'x.fits').exists()
    assert not list(tmp_path.glob('*.part'))


def test_no_zodi_and_required_extension_error(tmp_path):
    path = tmp_path/'x.fits'
    fits.HDUList([fits.PrimaryHDU(), fits.ImageHDU(np.ones((4, 4)), name='IMAGE')]).writeto(path)
    image, _ = load_image(path)
    assert np.all(image == 1)
    with pytest.raises(HTTPException) as error:
        read_extension(path, 'FLAGS')
    assert error.value.status_code == 502 and 'FLAGS' in error.value.detail
    assert not path.exists()


def test_poisoned_cache_removed_and_next_request_recovers(monkeypatch, tmp_path):
    monkeypatch.setattr(config, 'STORAGE_DIR', str(tmp_path))
    def download(url, path):
        fits.HDUList([fits.PrimaryHDU(), fits.ImageHDU(np.ones((3, 3)), name='IMAGE')]).writeto(path)
    monkeypatch.setattr(cache, 'download_fits', download)
    path = cache.ensure_fits(URL)
    path.write_text('<html>bad cached response</html>')
    with pytest.raises(HTTPException):
        with cache.cached_fits(URL) as paths:
            load_image(paths[0])
    with cache.cached_fits(URL) as paths:
        assert load_image(paths[0])[0].shape == (3, 3)


def test_masked_rows_and_shared_retry(monkeypatch):
    table = Table({'dataproduct_subtype': ['science']*3, 'obs_id': ['a','b','c'],
                   'access_url': [URL]*3, 'em_min': [1e-6]*3, 'em_max': [2e-6]*3,
                   't_min': MaskedColumn([60000.,60001.,60002.], mask=[False, True, False]),
                   'access_estsize': MaskedColumn([1,2,3], mask=[True, False, False]),
                   'em_res_power': ['', '2', 'bad']})
    calls = []
    def query(**kwargs):
        calls.append(1)
        if len(calls) == 1:
            raise RuntimeError('502')
        return table
    monkeypatch.setattr(irsa_fetcher.Irsa, 'query_sia', query)
    monkeypatch.setattr(irsa_fetcher.time, 'sleep', lambda _: None)
    products = irsa_fetcher.fetch_epochs(10, 20)
    assert len(calls) == 2
    assert [p['obs_id'] for p in products] == ['a', 'c']
    assert products[0]['size_kb'] == products[0]['res_arcsec'] == products[1]['res_power'] == 0


@pytest.mark.parametrize('legacy', [False, True])
def test_concurrent_startup_and_seed(tmp_path, monkeypatch, legacy):
    engine = create_engine(f'sqlite:///{tmp_path}/db')
    monkeypatch.setattr(database, 'engine', engine)
    monkeypatch.setattr(seed, 'SessionLocal', sessionmaker(bind=engine))
    if legacy:
        with engine.begin() as conn:
            conn.execute(text('CREATE TABLE discoveries (id INTEGER PRIMARY KEY, name TEXT, ra FLOAT, dec FLOAT, user_id INTEGER, discovered_at TIMESTAMP)'))
            conn.execute(text("INSERT INTO discoveries (name, ra, dec, user_id) VALUES ('Keep me', 1, 2, 1)"))
    barrier = threading.Barrier(2)
    def startup(_):
        barrier.wait()
        database.init_db()
        seed.seed_targets()
    with ThreadPoolExecutor(2) as pool:
        list(pool.map(startup, range(2)))
    with seed.SessionLocal() as db:
        assert db.query(Target).count() == len(seed.PRESETS)
        if legacy:
            assert db.execute(text('SELECT name FROM discoveries')).scalar() == 'Keep me'


def test_threaded_cache_misses_and_active_reader_eviction(tmp_path, monkeypatch):
    monkeypatch.setattr(config, 'STORAGE_DIR', str(tmp_path))
    monkeypatch.setattr(config, 'MAX_RAW_GB', 1e-12)
    calls = []
    def download(url, path):
        calls.append(1)
        time.sleep(.02)
        path.write_bytes(b'file')
    monkeypatch.setattr(cache, 'download_fits', download)
    def read(_):
        with cache.cached_fits(URL) as paths:
            cache.evict_old_fits()
            assert paths[0].read_bytes() == b'file'
    with ThreadPoolExecutor(6) as pool:
        list(pool.map(read, range(6)))
    assert len(calls) == 1
    cache.evict_old_fits()
    assert not list((tmp_path/'fits_raw').glob('*.fits'))


def test_threaded_render_builds_once(tmp_path, monkeypatch):
    engine = create_engine(f'sqlite:///{tmp_path}/db')
    database.Base.metadata.create_all(engine)
    monkeypatch.setattr(cache, 'SessionLocal', sessionmaker(bind=engine))
    monkeypatch.setattr(config, 'STORAGE_DIR', str(tmp_path))
    path = tmp_path/'png_renders'/'key.png'
    calls = []
    def build():
        calls.append(1)
        time.sleep(.02)
        path.write_bytes(b'png')
    with ThreadPoolExecutor(6) as pool:
        results = list(pool.map(lambda _: cache.ensure_render('key', path, build), range(6)))
    assert len(calls) == 1 and sum(not result[1] for result in results) == 1


def test_recent_png_is_not_evicted_before_browser_fetch(tmp_path, monkeypatch):
    monkeypatch.setattr(config, 'STORAGE_DIR', str(tmp_path))
    monkeypatch.setattr(config, 'MAX_PNG_GB', 1e-12)
    directory = tmp_path/'png_renders'
    directory.mkdir()
    path = directory/'recent.png'
    path.write_bytes(b'png')
    cache.evict_old_pngs()
    assert path.exists()


def test_cors_origins_are_trimmed(monkeypatch):
    import runpy
    monkeypatch.setenv('CORS_ORIGINS', 'http://a, http://b, ,')
    assert runpy.run_path(config.__file__)['CORS_ORIGINS'] == ['http://a', 'http://b']


def test_simultaneous_eviction_tolerates_missing_files(tmp_path, monkeypatch):
    monkeypatch.setattr(config, 'STORAGE_DIR', str(tmp_path))
    monkeypatch.setattr(config, 'MAX_RAW_GB', 1e-12)
    folder = tmp_path/'fits_raw'
    folder.mkdir()
    for i in range(100):
        (folder/f'{i}.fits').write_bytes(b'file')
    with ThreadPoolExecutor(4) as pool:
        list(pool.map(lambda _: cache.evict_old_fits(), range(4)))
    assert not list(folder.glob('*.fits'))
