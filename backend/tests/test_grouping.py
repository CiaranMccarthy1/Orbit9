from app.pipeline.grouping import group_exposures


def make(obs_id, em_min, t_min=60000.0):
    return {"obs_id": obs_id, "access_url": f"https://irsa.ipac.caltech.edu/{obs_id}{em_min}",
            "size_kb": 1, "em_min_um": em_min, "em_max_um": em_min + 0.5,
            "res_power": 1.0, "res_arcsec": 3.0, "t_min": t_min}


def test_group_exposures_sorts_and_bands():
    products = [
        make("EXP_B", 4.4, 60001.0), make("EXP_A", 4.4), make("EXP_A", 1.6),
    ]
    out = group_exposures(products)
    assert [e["obs_id"] for e in out] == ["EXP_A", "EXP_B"]
    a = out[0]
    assert [b["em_min_um"] for b in a["bands"]] == [1.6, 4.4]
    assert a["t_min_mjd"] == 60000.0 and "T" in a["t_iso"]
