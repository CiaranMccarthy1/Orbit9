"""IRSA URL policy and cache keys, shared by all render endpoints."""
import hashlib
from urllib.parse import urlparse

from fastapi import HTTPException

ALLOWED_HOST = "irsa.ipac.caltech.edu"
ALLOWED_PATH = "/ibe/data/spherex/"


def validate(url):
    p = urlparse(url)
    if (p.scheme != "https" or p.hostname != ALLOWED_HOST
            or not p.path.startswith(ALLOWED_PATH) or p.query):
        raise HTTPException(400, "url must be a plain IRSA SPHEREx data url")
    return url


def url_key(url):
    return hashlib.sha1(url.encode()).hexdigest()


def spec_key(*parts):
    return hashlib.sha1("|".join(parts).encode()).hexdigest()
