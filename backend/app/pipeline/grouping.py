"""Group SIA products into exposures (epochs) with their band files."""
from astropy.time import Time


def group_exposures(products):
    """[product dicts] -> [{obs_id, t_min_mjd, t_iso, bands: [...]}], sorted by time."""
    exposures = {}
    for p in products:
        e = exposures.setdefault(p["obs_id"], {"obs_id": p["obs_id"], "bands": []})
        e["bands"].append({
            "em_min_um": p["em_min_um"],
            "em_max_um": p["em_max_um"],
            "res_power": p["res_power"],
            "res_arcsec": p["res_arcsec"],
            "url": p["access_url"],
            "size_kb": p["size_kb"],
        })
    out = []
    for e in exposures.values():
        e["bands"].sort(key=lambda b: b["em_min_um"])
        # t_min from any band of the exposure (they share the observation time)
        out.append(e)
    t_mjds = {p["obs_id"]: p["t_min"] for p in products}
    for e in out:
        e["t_min_mjd"] = t_mjds[e["obs_id"]]
        e["t_iso"] = Time(t_mjds[e["obs_id"]], format="mjd").isot
    return sorted(out, key=lambda e: e["t_min_mjd"])
