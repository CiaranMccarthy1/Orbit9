from datetime import timedelta
from concurrent.futures import ThreadPoolExecutor
import threading
import time

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import pytest

from app.api import routes_discoveries as claims, routes_users as users
from app.database import Base
from app.models import Discovery, LoginSession, User, utcnow


@pytest.fixture
def db(tmp_path, monkeypatch):
    engine = create_engine(f'sqlite:///{tmp_path}/api.db')
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    monkeypatch.setattr(users, 'SessionLocal', factory)
    monkeypatch.setattr(claims, 'SessionLocal', factory)
    monkeypatch.setattr(claims, 'classify_claim', lambda *a: {'classification': 'Test', 'confidence': 0.1})
    return factory


def test_http_auth_claims_and_validation(db):
    app = FastAPI()
    app.include_router(users.router)
    app.include_router(claims.router)
    with TestClient(app) as client:
        credentials = {'username': 'alice', 'password': 'password123'}
        assert client.get('/me').status_code == 401
        assert client.post('/discoveries', json={'name':'x','ra':10,'dec':20}).status_code == 401
        bad = client.post('/register', json={**credentials, 'username':'<img onerror=x>'})
        assert bad.status_code == 422 and isinstance(bad.json()['detail'], list)
        assert client.post('/register', json=credentials).status_code == 201
        duplicate = client.post('/register', json=credentials)
        assert duplicate.status_code == 409 and isinstance(duplicate.json()['detail'], str)
        wrong = client.post('/login', json={**credentials, 'password':'wrongpass'})
        assert wrong.status_code == 401 and isinstance(wrong.json()['detail'], str)
        token = client.post('/login', json=credentials).json()['access_token']
        assert len(token) == 43
        client.headers['Authorization'] = f'Bearer {token}'
        assert client.get('/me').json() == {'username':'alice'}
        created = client.post('/discoveries', json={'name':'x','ra':10,'dec':20})
        assert created.status_code == 201 and created.json()['classification'] is None
        assert client.post('/discoveries', json={'name':'x','ra':10.00001,'dec':20}).status_code == 409
        assert client.post('/discoveries', json={'name':' ','ra':10,'dec':20}).status_code == 422
        assert client.post('/discoveries', json={'name':'x','ra':400,'dec':20}).status_code == 422
        assert client.get('/discoveries?limit=101').status_code == 422
        assert client.post('/logout').status_code == 204
        assert client.get('/me').status_code == 401
        assert client.get('/login').status_code == 405


def test_expiry_cleanup_on_login_and_startup_helper(db):
    users.register(users.Credentials(username='a', password='password123'))
    with db() as session:
        session.add_all([LoginSession(token_hash='old', user_id=1, expires_at=utcnow()-timedelta(days=1)),
                         LoginSession(token_hash='valid', user_id=1, expires_at=utcnow()+timedelta(days=1))])
        session.commit()
    users.login(users.Credentials(username='a', password='password123'))
    with db() as session:
        assert session.get(LoginSession, 'old') is None
        assert session.get(LoginSession, 'valid') is not None
        session.query(LoginSession).update({'expires_at': utcnow()-timedelta(days=1)})
        session.commit()
    users.cleanup_sessions()
    with db() as session:
        assert session.query(LoginSession).count() == 0


def test_durable_failure_retry_and_interrupted_lease(db, monkeypatch):
    users.register(users.Credentials(username='a', password='password123'))
    epochs = [{'mjd':60000., 'ra':10., 'dec':20.}]
    with db() as session:
        session.add(Discovery(name='x', ra=10, dec=20, user_id=1, epochs=epochs))
        session.commit()
    def fail(*a):
        raise RuntimeError('temporary upstream failure')
    monkeypatch.setattr(claims, 'classify_claim', fail)
    assert claims.classify_next()
    assert not claims.classify_next()  # backoff, not a tight retry loop
    with db() as session:
        row = session.get(Discovery, 1)
        assert row is not None and row.classification and row.classification['error']
        assert row.epochs == epochs
        row.retry_at = utcnow()-timedelta(seconds=1)
        session.commit()
    seen = []
    def success(ra, dec, saved):
        seen.append(saved)
        return {'classification':'Recovered','confidence':0.1}
    monkeypatch.setattr(claims, 'classify_claim', success)
    assert claims.classify_next()
    assert seen == [epochs]
    with db() as session:
        row = session.get(Discovery, 1)
        assert row is not None and row.retry_at is None
        assert row.classification['classification'] == 'Recovered'
        row.classification = None
        row.retry_at = utcnow()-timedelta(minutes=16)
        session.commit()
    assert claims.classify_next()  # a lease left by a dead process is recoverable


def test_classification_concurrency_limit(db, monkeypatch):
    active = peak = 0
    lock = threading.Lock()
    def classify(*a):
        nonlocal active, peak
        with lock:
            active += 1
            peak = max(peak, active)
        time.sleep(.02)
        with lock:
            active -= 1
        return {'classification':'Test'}
    monkeypatch.setattr(claims, 'classify_claim', classify)
    with ThreadPoolExecutor(5) as pool:
        list(pool.map(lambda i: claims.classify_and_store(i, 10, 20, []), range(10)))
    assert peak == 1


def test_growth_pagination_and_polar_wrap_prefilter(db):
    with db() as session:
        session.add(User(id=1, username='a', password_hash='unused'))
        session.add_all(Discovery(name=str(i), ra=100+i/1000, dec=-20, user_id=1) for i in range(1000))
        session.add_all([Discovery(name='wrap', ra=359.99999, dec=0, user_id=1),
                         Discovery(name='pole', ra=180, dec=89.99999, user_id=1)])
        session.commit()
        assert [d.name for d in claims.nearby_claims(session, 0, 0)] == ['wrap']
        assert [d.name for d in claims.nearby_claims(session, 0, 90)] == ['pole']
        assert list(claims.nearby_claims(session, 10, 20)) == []
    first, second = claims.discoveries(), claims.discoveries(offset=50)
    assert len(first) == len(second) == 50
    assert not {d['id'] for d in first} & {d['id'] for d in second}
