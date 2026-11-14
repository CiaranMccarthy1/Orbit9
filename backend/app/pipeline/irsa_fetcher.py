"""IRSA SPHEREx fetcher: SIA2 query by position → epochs → FITS download.

Verified against IRSA live (2026-11): collection 'spherex_dr1', each SIA row is
one band/level2b product with access_url to the IRSA IBE data service.
"""
from pathlib import Path

from astropy.utils.data import conf

# SPHEREx file reads can exceed astropy's default timeout
conf.remote_timeout = 120

from astroquery.ipac.irsa import Irsa  # noqa: E402

COLLECTION = "spherex_dr1"

EPOCH_COLS = (
    "obs_id", "access_url", "access_estsize", "t_exptime", "em_min",
    "em_max", "em_res_power", "s_resolution", "t_min", "t_max",
)


def fetch_epochs(ra, dec, radius_deg=0.1):
    """All science products covering a position. One row = one band of one exposure."""
    t = Irsa.query_sia(pos=(ra, dec, radius_deg), collection=COLLECTION)
    t = t[t["dataproduct_subtype"] == "science"]
    cols = {c: t[c].tolist() for c in EPOCH_COLS}
    return [
        {
            "obs_id": obs_id,
            "access_url": access_url,
            "size_kb": int(size_kb),
            "exptime": float(exptime),
            "em_min_um": float(em_min) * 1e6,
            "em_max_um": float(em_max) * 1e6,
            "res_power": float(res_power),
            "res_arcsec": float(res_arcsec),
            "t_min": float(t_min),
            "t_max": float(t_max),
        }
        for obs_id, access_url, size_kb, exptime, em_min, em_max,
            res_power, res_arcsec, t_min, t_max
        in zip(*cols.values())
    ]


def download_fits(url, dest):
    import os
    import shutil
    import tempfile
    import urllib.request

    dest.parent.mkdir(parents=True, exist_ok=True)
    # unique temp per request: concurrent callers can't interleave writes
    fd, tmp = tempfile.mkstemp(dir=dest.parent, suffix=".part")
    try:
        with os.fdopen(fd, "wb") as f, urllib.request.urlopen(url, timeout=120) as r:
            shutil.copyfileobj(r, f)
        os.replace(tmp, dest)
    except BaseException:
        os.unlink(tmp)
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
