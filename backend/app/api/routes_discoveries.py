import math

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text

from app.api.routes_users import current_session
from app.database import SessionLocal
from app.models import Discovery, User
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
    # clicked position per epoch; >=3 enables the parallax/proper-motion fit
    epochs: list[EpochClick] = Field(default_factory=list, max_length=50)


def separation(ra1, dec1, ra2, dec2):
    a, b = math.radians(dec1), math.radians(dec2)
    delta = math.radians(ra1 - ra2)
    hav = math.sin((a - b) / 2) ** 2 + math.cos(a) * math.cos(b) * math.sin(delta / 2) ** 2
    return 2 * math.asin(math.sqrt(min(1, max(0, hav))))


def serialize(discovery, username):
    return {"id": discovery.id, "name": discovery.name, "ra": discovery.ra,
            "dec": discovery.dec, "discovered_by": username, "discovered_at": discovery.discovered_at}


@router.get("/discoveries")
def discoveries():
    with SessionLocal() as db:
        return [serialize(d, username) for d, username in db.query(Discovery, User.username).join(User)]


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
        if any(separation(data.ra, data.dec, d.ra, d.dec) <= tolerance for d in db.query(Discovery)):
            raise HTTPException(409, "Planet already discovered")
        discovery = Discovery(name=name, ra=data.ra % 360, dec=data.dec, user_id=session[0])
        db.add(discovery)
        db.commit()
        db.refresh(discovery)
        result = serialize(discovery, session[1])
    # classification is advisory enrichment, outside the claim transaction
    try:
        result["classification"] = classify_claim(
            result["ra"], result["dec"], [e.model_dump() for e in data.epochs])
    except Exception as e:
        result["classification"] = {"classification": "Unclassified", "error": str(e)}
    return result
