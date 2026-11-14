from app.database import SessionLocal
from app.models import Target

# J2000 coordinates resolved once via Sesame and frozen here, so startup
# never depends on the network and a partial resolve can't lose presets
PRESETS = (
    ("Barnard's Star", 269.4520769586187, 4.69336496657667),
    ("Epsilon Indi", 330.8402234423433, -56.78597855436499),  # A star; Ba/Bb arcminutes away
    ("WISE J085510.83-071442.5", 133.81890825, -7.247048),
    ("RW Aurigae", 76.95652603458, 30.40143817389),
    ("R Draconis", 248.16761083295, 66.75497941722),
)


def seed_targets():
    with SessionLocal() as db:
        existing = {t.name for t in db.query(Target)}
        db.add_all(Target(name=n, ra=ra, dec=dec)
                   for n, ra, dec in PRESETS if n not in existing)
        db.commit()
