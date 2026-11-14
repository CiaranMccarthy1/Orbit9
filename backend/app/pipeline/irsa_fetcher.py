"""IRSA SPHEREx fetcher: SIA2 query by position → epochs → FITS download.

Verified against IRSA live (2026-11): collection 'spherex_dr1', each SIA row is
one band/level2b product with access_url to the IRSA IBE data service.
"""
import logging
import math
import time
import numpy as np

from app.urls import validate
from app.pipeline.imaging import open_fits

from astropy.utils.data import conf

# SPHEREx file reads can exceed astropy's default timeout
conf.remote_timeout = 120

from astroquery.ipac.irsa import Irsa  # noqa: E402

COLLECTION = "spherex_dr1"

def fetch_epochs(ra, dec, radius_deg=0.1):
    """All science products covering a position. One row = one band of one exposure."""
    t = None
    for attempt in range(2):
        try:
            t = Irsa.query_sia(pos=(ra, dec, radius_deg), collection=COLLECTION)
            break
        except Exception:
            if attempt:
                raise
            time.sleep(1)
    assert t is not None
    t = t[t["dataproduct_subtype"] == "science"]
    products = []
    for row in t:
        def value(key, default=None):
            v = row[key] if key in t.colnames else None
            return default if v is None or np.ma.is_masked(v) or str(v).strip() == "" else v

        def optional_number(key):
            try:
                n = float(value(key, 0))
                return n if math.isfinite(n) else 0.0
            except (ValueError, TypeError):
                return 0.0

        try:
            obs_id, url = str(value("obs_id", "")), str(value("access_url", ""))
            lo, hi, mjd = (float(value(k, "nan")) for k in ("em_min", "em_max", "t_min"))
            if not obs_id or not url or not all(math.isfinite(v) for v in (lo, hi, mjd)) or not 0 < lo < hi:
                raise ValueError("missing critical field")
            products.append({"obs_id": obs_id, "access_url": url,
                             "size_kb": max(0, int(optional_number("access_estsize"))),
                             "em_min_um": lo * 1e6, "em_max_um": hi * 1e6,
                             "res_power": optional_number("em_res_power"),
                             "res_arcsec": optional_number("s_resolution"), "t_min": mjd})
        except (ValueError, TypeError, OverflowError):
            logging.getLogger(__name__).warning("Skipping incomplete IRSA science row")
    return products


def download_fits(url, dest):
    import os
    import shutil
    import tempfile
    import urllib.request

    validate(url)

    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            return None

    opener = urllib.request.build_opener(NoRedirect())
    dest.parent.mkdir(parents=True, exist_ok=True)
    # unique temp per request: concurrent callers can't interleave writes
    fd, tmp = tempfile.mkstemp(dir=dest.parent, suffix=".part")
    try:
        with os.fdopen(fd, "wb") as f, opener.open(url, timeout=120) as r:
            shutil.copyfileobj(r, f)
        with open_fits(tmp) as hdus:
            hdus.verify("exception")
            if "IMAGE" not in hdus:
                raise ValueError("FITS is missing required IMAGE extension")
            for hdu in hdus:
                if hdu.data is not None:
                    np.asarray(hdu.data)  # force truncated data to be read before acceptance
        os.replace(tmp, dest)
    except BaseException:
        from pathlib import Path
        Path(tmp).unlink(missing_ok=True)
        raise
    return dest


if __name__ == "__main__":
    import sys

    ra, dec = float(sys.argv[1]), float(sys.argv[2])
    epochs = fetch_epochs(ra, dec)
    print(f"{len(epochs)} products")
    for e in epochs[:5]:
        print(e["obs_id"], f"{e['em_min_um']:.2f}-{e['em_max_um']:.2f} um",
              f"{e['size_kb']} KB", e["res_arcsec"], '"')
