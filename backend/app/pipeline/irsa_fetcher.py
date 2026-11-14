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


def fetch_epochs(ra: float, dec: float, radius_deg: float = 0.1) -> list[dict]:
    """All science products covering a position. One row = one band of one exposure."""
    t = Irsa.query_sia(pos=(ra, dec, radius_deg), collection=COLLECTION)
    t = t[t["dataproduct_subtype"] == "science"]
    return [
        {
            "obs_id": r["obs_id"],
            "access_url": r["access_url"],
            "size_kb": int(r["access_estsize"]),
            "exptime": float(r["t_exptime"]),
            "em_min_um": float(r["em_min"]) * 1e6,
            "em_max_um": float(r["em_max"]) * 1e6,
            "res_power": float(r["em_res_power"]),
            "res_arcsec": float(r["s_resolution"]),
            "t_min": float(r["t_min"]),
            "t_max": float(r["t_max"]),
        }
        for r in t
    ]


def download_fits(url: str, dest: Path) -> Path:
    import urllib.request

    dest.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(url, timeout=120) as r:
        dest.write_bytes(r.read())
    return dest


if __name__ == "__main__":
    import sys

    ra, dec = float(sys.argv[1]), float(sys.argv[2])
    epochs = fetch_epochs(ra, dec)
    print(f"{len(epochs)} products")
    for e in epochs[:5]:
        print(e["obs_id"], f"{e['em_min_um']:.2f}-{e['em_max_um']:.2f} um",
              f"{e['size_kb']} KB", e["res_arcsec"], '"')
