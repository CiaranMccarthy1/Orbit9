import math
import logging
import threading
from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import or_, text

from app.api.routes_users import current_session
from app.database import SessionLocal
from app.models import Discovery, User, utcnow
from app.pipeline.classifier import classify_claim

router = APIRouter()


class EpochClick(BaseModel):
    mjd: float = Field(ge=40000, le=80000, allow_inf_nan=False)
    ra: float = Field(ge=0, le=360, allow_inf_nan=False)
    dec: float = Field(ge=-90, le=90, allow_inf_nan=False)


class Claim(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    ra: float = Field(ge=0, le=360, allow_inf_nan=False)
    dec: float = Field(ge=-90, le=90, allow_inf_nan=False)
    # clicked position per epoch; >=5 enables the parallax/proper-motion fit
    epochs: list[EpochClick] = Field(default_factory=list, max_length=50)


def separation(ra1, dec1, ra2, dec2):
    a, b = math.radians(dec1), math.radians(dec2)
    delta = math.radians(ra1 - ra2)
    hav = math.sin((a - b) / 2) ** 2 + math.cos(a) * math.cos(b) * math.sin(delta / 2) ** 2
    return 2 * math.asin(math.sqrt(min(1, max(0, hav))))


def serialize(discovery, username):
    return {"id": discovery.id, "name": discovery.name, "ra": discovery.ra,
            "dec": discovery.dec, "discovered_by": username,
            "discovered_at": discovery.discovered_at,
            "classification": discovery.classification}


classification_slots = threading.Semaphore(1)
work_available = threading.Event()


def classify_and_store(discovery_id, ra, dec, epochs):
    with classification_slots:
        try:
            result = classify_claim(ra, dec, epochs)
            retry_at = None
        except Exception:
            logging.getLogger(__name__).warning("Classification failed for discovery %s; retry scheduled", discovery_id)
            result = {"classification": "Unclassified", "error": "Data unavailable; retry scheduled"}
            retry_at = utcnow() + timedelta(minutes=5)
        with SessionLocal() as db:
            discovery = db.get(Discovery, discovery_id)
            if discovery:
                discovery.classification = result
                discovery.retry_at = retry_at
                db.commit()


def classify_next():
    with SessionLocal() as db:
        if db.get_bind().dialect.name == "sqlite":
            db.execute(text("BEGIN IMMEDIATE"))
        row = db.query(Discovery).filter(Discovery.retry_at <= utcnow()).order_by(
            Discovery.retry_at, Discovery.id).with_for_update(skip_locked=True).first()
        if row is None:
            return False
        args = row.id, row.ra, row.dec, row.epochs or []
        # A lease lets another startup recover a process killed mid-download.
        row.retry_at = utcnow() + timedelta(minutes=15)
        db.commit()
    classify_and_store(*args)
    return True


def classification_worker(stop):
    while not stop.is_set():
        try:
            if classify_next():
                continue
        except Exception:
            logging.getLogger(__name__).exception("Classification worker could not access storage")
        work_available.wait(15)
        work_available.clear()


@router.get("/discoveries")
def discoveries(limit: Annotated[int, Query(ge=1, le=100)] = 50,
                offset: Annotated[int, Query(ge=0)] = 0):
    with SessionLocal() as db:
        return [serialize(d, username) for d, username in db.query(Discovery, User.username).join(User)
                .order_by(Discovery.id.desc()).offset(offset).limit(limit)]


def nearby_claims(db, ra, dec):
    radius = 1 / 3600
    query = db.query(Discovery).filter(Discovery.dec.between(dec - radius, dec + radius))
    if abs(dec) + radius < 90:
        delta = math.degrees(math.asin(math.sin(math.radians(radius)) / math.cos(math.radians(dec))))
        center = ra % 360
        lo, hi = center - delta, center + delta
        if lo < 0:
            query = query.filter(or_(Discovery.ra >= lo + 360, Discovery.ra <= hi))
        elif hi >= 360:
            query = query.filter(or_(Discovery.ra >= lo, Discovery.ra <= hi - 360))
        else:
            query = query.filter(Discovery.ra.between(lo, hi))
    return query


@router.post("/discoveries", status_code=201)
def claim(data: Claim, session=Depends(current_session)):
    name = data.name.strip()
    if not name:
        raise HTTPException(422, "Name cannot be blank")
    with SessionLocal() as db:
        dialect = db.get_bind().dialect.name
        if dialect == "sqlite":
            db.execute(text("BEGIN IMMEDIATE"))
        elif dialect == "postgresql":
            db.execute(text("SELECT pg_advisory_xact_lock(73918421)"))
        else:
            raise HTTPException(500, "Unsupported database for discovery claims")
        tolerance = math.radians(1 / 3600)
        if any(separation(data.ra, data.dec, d.ra, d.dec) <= tolerance for d in nearby_claims(db, data.ra, data.dec)):
            raise HTTPException(409, "Planet already discovered")
        discovery = Discovery(name=name, ra=data.ra % 360, dec=data.dec, user_id=session[0],
                              epochs=[e.model_dump() for e in data.epochs])
        db.add(discovery)
        db.commit()
        db.refresh(discovery)
        result = serialize(discovery, session[1])
    work_available.set()
    return result
