import threading
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.api import routes_discoveries, routes_users
from app.database import Base


@pytest.fixture
def sessions(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{tmp_path}/test.db")
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    monkeypatch.setattr(routes_users, "SessionLocal", factory)
    monkeypatch.setattr(routes_discoveries, "SessionLocal", factory)
    # classification is background work; never let tests reach IRSA
    monkeypatch.setattr(routes_discoveries, "classify_claim",
                        lambda *args, **kwargs: {"classification": "Stub", "confidence": 0.0})
    return factory


def test_accounts_and_claims(sessions):
    credentials = routes_users.Credentials(username="alice", password="password123")
    routes_users.register(credentials)
    with pytest.raises(HTTPException) as duplicate:
        routes_users.register(credentials)
    assert duplicate.value.status_code == 409
    with pytest.raises(HTTPException):
        routes_users.login(routes_users.Credentials(username="alice", password="wrongpass"))
    token = routes_users.login(credentials)["access_token"]
    from fastapi.security import HTTPAuthorizationCredentials
    auth = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
    session = routes_users.current_session(auth)
    result = routes_discoveries.claim(
        routes_discoveries.Claim(name="World", ra=0, dec=0), session)
    assert result["discovered_by"] == "alice"
    assert result["classification"] is None  # filled in after responding
    assert routes_discoveries.classify_next()
    assert routes_discoveries.discoveries()[0]["classification"] == {
        "classification": "Stub", "confidence": 0.0}
    with pytest.raises(HTTPException) as conflict:
        routes_discoveries.claim(
            routes_discoveries.Claim(name="Other", ra=359.99999, dec=0),
            session)
    assert conflict.value.status_code == 409
    assert len(routes_discoveries.discoveries()) == 1
    routes_users.logout(session)
    with pytest.raises(HTTPException):
        routes_users.current_session(auth)


def test_simultaneous_claims(sessions):
    routes_users.register(routes_users.Credentials(username="alice", password="password123"))
    barrier = threading.Barrier(2)
    def claim():
        barrier.wait()
        try:
            routes_discoveries.claim(routes_discoveries.Claim(name="World", ra=10, dec=20),
                                     (1, "alice", ""))
            return 201
        except HTTPException as exc:
            return exc.status_code
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(lambda _: claim(), range(2))) == [201, 409]
