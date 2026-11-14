import math

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text

from app.api.routes_users import current_session
from app.database import SessionLocal
from app.models import Discovery, User

router = APIRouter()


class Claim(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    ra: float = Field(ge=0, le=360, allow_inf_nan=False)
    dec: float = Field(ge=-90, le=90, allow_inf_nan=False)


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
        dialect = db.bind.dialect.name
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
        return serialize(discovery, session[1])
