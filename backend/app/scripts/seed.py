from app.database import SessionLocal
from app.models import Target

# resolved by name at seed time (one network lookup, cached in Postgres);
# Epsilon Indi preset points at the A star, Ba/Bb sit arcminutes away
PRESET_NAMES = [
    "Barnard's Star",
    "Epsilon Indi",
    "WISE J085510.83-071442.5",
    "RW Aurigae",
    "R Draconis",
]


def seed_targets():
    from astropy.coordinates import SkyCoord

    with SessionLocal() as db:
        if db.query(Target).first():
            return
        for name in PRESET_NAMES:
            try:
                c = SkyCoord.from_name(name)
            except Exception as e:  # one bad name must not block startup
                print(f"seed: could not resolve {name!r}: {e}")
                continue
            if c is None or c.ra is None or c.dec is None:
                continue
            db.add(Target(name=name, ra=c.ra.deg, dec=c.dec.deg))
        db.commit()
