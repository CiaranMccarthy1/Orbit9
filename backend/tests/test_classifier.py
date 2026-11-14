from contextlib import nullcontext

import numpy as np

from app.pipeline.classifier import (band_ratio, classify, fit_astrometry,
                                     fit_blackbody_temp, planck)


def test_fit_astrometry_recovers_parallax_and_pm():
    # 6 epochs over ~1.6 yr: 2"/yr east proper motion + 0.5" parallax
    days = np.arange(6) * 120.0
    tau = days / 365.25
    ra = 10.0 + (2.0 * tau + 0.5 * np.cos(2 * np.pi * tau)) / 3600.0 / np.cos(np.radians(20.0))
    dec = 20.0 + 0.5 * np.sin(2 * np.pi * tau) / 3600.0
    fit = fit_astrometry([(60000 + d, r, de) for d, r, de in zip(days, ra, dec)])
    assert fit is not None
    assert abs(fit["parallax_arcsec"] - 0.5) < 0.05
    assert abs(fit["pm_arcsec_yr"] - 2.0) < 0.1


def test_fit_astrometry_needs_residual_degrees_of_freedom():
    # Four points exactly fit four coefficients; a fifth is needed to assess scatter.
    assert fit_astrometry([(60000, 10.0, 20.0), (60100, 10.1, 20.1),
                           (60200, 10.2, 20.2)]) is None
    assert fit_astrometry([(60000, 10.0, 20.0), (60000, 10.1, 20.1),
                           (60100, 10.2, 20.2), (60200, 10.3, 20.3)]) is None


def test_fit_astrometry_rejects_one_year_spacing():
    # same phase every year leaves the parallax columns degenerate
    assert fit_astrometry([(60000.0 + 365.25 * i, 10.0, 20.0) for i in range(4)]) is None


def test_fit_blackbody_temp_recovers_hot_and_cold():
    wavelengths = np.array([1.0, 2.0, 4.7])
    for temp in (300.0, 3000.0):
        fluxes = planck(wavelengths, temp)
        fitted = fit_blackbody_temp(wavelengths, fluxes)
        assert fitted is not None
        assert abs(fitted / temp - 1) < 0.05


def test_band_ratio_depth_and_missing_band():
    depth = band_ratio([2.1, 3.3], [10.0, 3.0], 2.1, 3.3)
    assert depth is not None and abs(depth - 0.7) < 1e-9
    # 3.3 um is not covered by the bands IRSA serves at the test field
    assert band_ratio([2.03, 4.71], [10.0, 10.0], 2.1, 3.3) is None


def test_decision_tree_branches():
    base = dict(parallax_arcsec=0.1, proper_motion_arcsec_yr=2.0, t_eff_k=3000.0,
                ch4_depth=0.1, h2o_ice_depth=0.1, valid_bands=4)
    assert classify({**base, "parallax_arcsec": 70.0})["classification"].startswith("Outer Solar System")
    assert classify({**base, "t_eff_k": 250.0, "ch4_depth": 0.6})["classification"].startswith("Y-Dwarf")
    assert classify({**base, "valid_bands": 1})["classification"].startswith("Insufficient photometry")
    assert classify({**base, "parallax_arcsec": 0.005,
                     "proper_motion_arcsec_yr": 0.01})["classification"] == "Stationary Background Star"
    assert classify({**base, "parallax_arcsec": None,
                     "proper_motion_arcsec_yr": None})["classification"] == "Insufficient astrometry"


def test_classify_claim_uses_nearest_epoch_click(monkeypatch):
    import app.pipeline.classifier as clf

    def product(obs_id, em_min, t_min, url):
        return {"obs_id": obs_id, "access_url": url, "size_kb": 1,
                "em_min_um": em_min, "em_max_um": em_min + 0.8,
                "res_power": 40.0, "res_arcsec": 3.0, "t_min": t_min}

    products = [
        product("EXP_A", 1.6, 60900.0, "a3.fits"),
        product("EXP_A", 4.4, 60900.0, "a6.fits"),
        product("EXP_B", 1.6, 61080.0, "b3.fits"),
        product("EXP_B", 4.4, 61080.0, "b6.fits"),
    ]
    monkeypatch.setattr(clf, "fetch_epochs", lambda *a, **k: products)
    monkeypatch.setattr(clf, "cached_fits", lambda *urls: nullcontext(urls))
    positions = []

    def fake_flux(path, ra, dec, radius_px=3):
        positions.append((path, ra, dec))
        return {"flux": 10.0, "pixel_area_sr": 3e-10, "flagged_fraction": 0.0}

    monkeypatch.setattr(clf, "aperture_flux", fake_flux)
    epochs = [{"mjd": 60900.0, "ra": 10.0, "dec": 20.0},
              {"mjd": 61080.0, "ra": 10.1, "dec": 20.1},
              {"mjd": 61260.0, "ra": 10.2, "dec": 20.2}]
    out = clf.classify_claim(10.0, 20.0, epochs)
    assert out["classification"]
    assert out["measurements"]["n_bands_measured"] == 4
    # epoch A files measured at the first click, epoch B at the second
    assert {p[1] for p in positions if p[0].startswith("a")} == {10.0}
    assert {p[1] for p in positions if p[0].startswith("b")} == {10.1}


def test_missing_bands_and_bad_astrometry_are_not_cosmic_rays():
    base = dict(parallax_arcsec=0.005, proper_motion_arcsec_yr=0.01, t_eff_k=3000,
                ch4_depth=0, h2o_ice_depth=0, valid_bands=4)
    assert classify({**base, 'valid_bands': 0}) == {'classification': 'No usable photometry', 'confidence': 0.0}
    assert classify({**base, 'valid_bands': 1})['confidence'] == 0
    assert classify({**base, 'valid_bands': 2})['confidence'] <= 0.6
    assert classify({**base, 'astrometric_residual_arcsec': 5}) == {'classification': 'Unreliable astrometry', 'confidence': 0.0}


def test_no_clicks_selects_newest_exposures(monkeypatch):
    from app.pipeline import classifier as clf
    products = [dict(obs_id=str(i), access_url=str(i), size_kb=1, em_min_um=1.6,
                     em_max_um=2.4, res_power=1, res_arcsec=3, t_min=60000+i) for i in range(5)]
    monkeypatch.setattr(clf, 'fetch_epochs', lambda *a: products)
    monkeypatch.setattr(clf, 'cached_fits', lambda *urls: nullcontext(urls))
    seen = []
    monkeypatch.setattr(clf, 'aperture_flux', lambda path, *a: seen.append(path))
    clf.classify_claim(10, 20)
    assert seen == ['3', '4']


def test_four_epoch_exact_fit_cannot_estimate_scatter():
    assert fit_astrometry([(60000+i*120, 10+i*.001, 20+i*.002) for i in range(4)]) is None
