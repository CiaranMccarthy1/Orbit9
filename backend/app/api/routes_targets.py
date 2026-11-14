from fastapi import APIRouter

from app.database import SessionLocal
from app.models import Target

router = APIRouter()


@router.get("/targets")
def targets():
    with SessionLocal() as db:
        return [{"name": t.name, "ra": t.ra, "dec": t.dec} for t in db.query(Target)]
