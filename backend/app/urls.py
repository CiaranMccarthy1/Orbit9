"""IRSA URL policy and cache keys, shared by all render endpoints."""
import hashlib
from urllib.parse import unquote, urlparse

from fastapi import HTTPException

ALLOWED_HOST = "irsa.ipac.caltech.edu"
ALLOWED_PATH = "/ibe/data/spherex/"


def validate(url):
    p = urlparse(url)
    path = p.path
    for _ in range(len(path)):
        decoded = unquote(path)
        if decoded == path:
            break
        path = decoded
    if (p.scheme != "https" or p.hostname != ALLOWED_HOST
            or p.netloc != ALLOWED_HOST or not path.startswith(ALLOWED_PATH)
            or any(part in (".", "..") for part in path.split("/"))
            or "\\" in path or any(ord(c) < 32 for c in url)
            or p.query or p.fragment):
        raise HTTPException(400, "url must be a plain IRSA SPHEREx data url")
    return url


def url_key(url):
    return hashlib.sha1(url.encode()).hexdigest()


def spec_key(*parts):
    return hashlib.sha1("|".join(parts).encode()).hexdigest()
