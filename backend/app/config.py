import os


def env(name, default):
    return os.environ.get(name) or default


STORAGE_DIR = env("STORAGE_DIR", "./storage")
# default DB lives under STORAGE_DIR so one env var relocates both
DATABASE_URL = env("DATABASE_URL", f"sqlite:///{STORAGE_DIR}/app.db")
# fits_raw cap; LRU-evicts oldest downloads so a crawler can't fill the disk
MAX_RAW_GB = float(env("MAX_RAW_GB", "10"))
# png_renders cap; same LRU policy for the much smaller rendered images
MAX_PNG_GB = float(env("MAX_PNG_GB", "2"))
CORS_ORIGINS = [o for o in env("CORS_ORIGINS", "http://localhost:5173").split(",") if o]
