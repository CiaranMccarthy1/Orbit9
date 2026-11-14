# Candidate classifier for discovery submissions (spec stages 1-3)

import numpy as np

from app.cache import cached_fits
from app.pipeline.grouping import group_exposures
from app.pipeline.irsa_fetcher import fetch_epochs
from app.pipeline.photometry import aperture_flux

SEARCH_RADIUS_DEG = 0.25
MAX_EXPOSURES = 2   # each exposure can mean 2 x 60 MB FITS downloads
MAX_BANDS = 4
H, C, KB = 6.62607015e-34, 2.99792458e8, 1.380649e-23
LSUN_W = 3.828e26


def planck(wavelengths_um, temp_k):
    """Planck B_lambda, arbitrary scale; non-positive below 1e-6 um."""
    lam = np.asarray(wavelengths_um, float) * 1e-6
    with np.errstate(over="ignore"):
        return 1.0 / (lam ** 5 * np.expm1(H * C / (lam * KB * temp_k)))


def fit_blackbody_temp(wavelengths_um, fluxes):
    """Grid-search blackbody temperature (30-30000 K) with a free scale."""
    lam = np.asarray(wavelengths_um, float)
    f = np.asarray(fluxes, float)
    ok = np.isfinite(f) & (f > 0)
    if ok.sum() < 2:
        return None
    lam, f = lam[ok], f[ok]
    best_temp, best_chi = None, np.inf
    for temp in np.geomspace(30.0, 30000.0, 400):
        b = planck(lam, temp)
        denom = float(b @ b)
        if denom == 0:
            continue
        scale = float(f @ b) / denom
        chi = float(((f - scale * b) ** 2).sum())
        if chi < best_chi:
            best_temp, best_chi = float(temp), chi
    return best_temp


def band_ratio(wavelengths_um, fluxes, continuum_um, absorption_um, tol_um=0.6):
    """Absorption depth 1 - F(abs)/F(cont); None if either band is absent.

    shortcut: nearest band-file centre over a broadband file, not a spectral
    line index; only usable when the served arrays bracket both wavelengths.
    """
    lam = np.asarray(wavelengths_um, float)
    f = np.asarray(fluxes, float)

    def at(wavelength_um):
        i = int(np.argmin(np.abs(lam - wavelength_um)))
        if abs(lam[i] - wavelength_um) > tol_um or not f[i] > 0:
            return None
        return float(f[i])

    continuum, absorption = at(continuum_um), at(absorption_um)
    if continuum is None or absorption is None:
        return None
    return 1.0 - absorption / continuum


def fit_astrometry(points):
    """points = [(mjd, ra_deg, dec_deg)] -> parallax/PM by sinusoid lstsq.

    shortcut: pure sinusoid parallax basis, unweighted, no epoch-uncertainty
    propagation; >=5 well-spread epochs needed: four fit the four coefficients exactly
    and cannot reveal scatter through a residual.
    """
    if len(points) < 5 or len({p[0] for p in points}) < 5:
        return None
    t = np.array([p[0] for p in points], float)
    ra = np.array([p[1] for p in points], float)
    dec = np.array([p[2] for p in points], float)
    t0, ra0, dec0 = t[0], ra[0], dec[0]
    dra = (ra - ra0 + 180.0) % 360.0 - 180.0
    x = dra * np.cos(np.radians(dec0)) * 3600.0
    y = (dec - dec0) * 3600.0
    tau = (t - t0) / 365.25
    phase = 2 * np.pi * tau
    design = np.column_stack([np.ones_like(tau), tau, np.cos(phase), np.sin(phase)])
    if np.linalg.matrix_rank(design) < 4:
        return None  # epochs one year apart share a phase: parallax is unconstrained
    coef_x, *_ = np.linalg.lstsq(design, x, rcond=None)
    coef_y, *_ = np.linalg.lstsq(design, y, rcond=None)
    cx, sx = coef_x[2], coef_x[3]
    cy, sy = coef_y[2], coef_y[3]
    residual = np.concatenate([design @ coef_x - x, design @ coef_y - y])
    return {
        "parallax_arcsec": float((np.hypot(cx, sx) + np.hypot(cy, sy)) / 2),
        "pm_arcsec_yr": float(np.hypot(coef_x[1], coef_y[1])),
        "residual_arcsec": float(np.sqrt(np.mean(residual ** 2))),
    }


def approx_luminosity_solar(band, parallax_arcsec):
    """Rough L/Lsun from one broadband aperture sum and the fitted distance.

    shortcut: no photometric zero-point or aperture correction, so this is an
    order-of-magnitude mass-boundary hint, not a measurement.
    """
    distance_pc = 1.0 / parallax_arcsec
    flux_jy = band["flux"] * band["pixel_area_sr"] * 1e6       # MJy -> Jy
    nu_min = C / (band["em_max_um"] * 1e-6)
    nu_max = C / (band["em_min_um"] * 1e-6)
    flux_wm2 = flux_jy * 1e-26                                 # Jy -> W/m^2/Hz
    distance_m = distance_pc * 3.086e16
    return float(4 * np.pi * distance_m ** 2 * flux_wm2 * (nu_max - nu_min) / LSUN_W)


def _classify(candidate):
    """Indicative photometric/astrometric labels; missing data is not artifact evidence."""
    if candidate["valid_bands"] == 0:
        return {"classification": "No usable photometry", "confidence": 0.0}
    if candidate["valid_bands"] == 1:
        return {"classification": "Insufficient photometry (one usable band)", "confidence": 0.0}
    if candidate.get("astrometric_residual_arcsec", 0) > 1:
        return {"classification": "Unreliable astrometry", "confidence": 0.0}
    parallax = candidate["parallax_arcsec"]
    pm = candidate["proper_motion_arcsec_yr"]
    t_eff = candidate["t_eff_k"]
    ch4 = candidate["ch4_depth"]
    h2o = candidate["h2o_ice_depth"]
    if parallax is not None and parallax > 60.0:
        if h2o is not None and h2o > 0.3 and pm is not None and pm > 600:
            return {"classification": "Comet / Inner Kuiper Belt Object", "confidence": 0.91}
        return {"classification": "Outer Solar System Planet Candidate (Planet X)",
                "confidence": 0.88}
    if t_eff is not None and t_eff < 600 and ch4 is not None and ch4 > 0.4:
        return {"classification": "Y-Dwarf / Free-Floating Rogue Planet", "confidence": 0.93}
    if t_eff is not None and t_eff < 2200 and ch4 is not None and ch4 > 0.2:
        return {"classification": "L/T Brown Dwarf", "confidence": 0.90}
    if parallax is not None and pm is not None and parallax < 0.01 and pm < 0.05:
        return {"classification": "Stationary Background Star", "confidence": 0.98}
    if parallax is None or pm is None:
        return {"classification": "Insufficient astrometry", "confidence": 0.0}
    return {"classification": "High-Proper-Motion Star", "confidence": 0.89}


def classify(candidate):
    verdict = _classify(candidate)
    # shortcut: heuristic scores, calibrate against labelled sources before scientific use.
    verdict["confidence"] = min(verdict["confidence"], 0.6 if candidate["valid_bands"] < 3 else 0.9)
    return verdict


def classify_claim(ra, dec, epochs=()):
    """Fetch SPHEREx bands at the position, measure, fit and classify.

    epochs: clicked positions [{"mjd", "ra", "dec"}] (>=5 enables parallax).
    """
    exposures = group_exposures(fetch_epochs(ra, dec, SEARCH_RADIUS_DEG))
    if not exposures:
        return {"classification": "No SPHEREx coverage at this position", "confidence": 0.0}
    clicks = sorted(epochs, key=lambda e: e["mjd"])

    def time_gap(exposure):
        if not clicks:
            return 0.0
        return min(abs(exposure["t_min_mjd"] - c["mjd"]) for c in clicks)

    picked = sorted(exposures, key=time_gap)[:MAX_EXPOSURES] if clicks else exposures[-MAX_EXPOSURES:]
    bands = []
    for exposure in picked:
        for band in sorted(exposure["bands"], key=lambda b: b["em_min_um"]):
            if len(bands) >= MAX_BANDS:
                break
            bands.append((exposure, band))

    measured = []
    for exposure, band in bands:
        if clicks:
            click = min(clicks, key=lambda c: abs(c["mjd"] - exposure["t_min_mjd"]))
            position = (click["ra"], click["dec"])
        else:
            position = (ra, dec)
        with cached_fits(band["url"]) as paths:
            m = aperture_flux(paths[0], *position)
        if m is None:
            continue
        measured.append({
            "center_um": (band["em_min_um"] + band["em_max_um"]) / 2,
            "flux": m["flux"],
            "pixel_area_sr": m["pixel_area_sr"],
            "flagged_fraction": m["flagged_fraction"],
            "em_min_um": band["em_min_um"],
            "em_max_um": band["em_max_um"],
        })

    valid = [m for m in measured if m["flux"] > 0 and m["flagged_fraction"] < 0.5]
    astro = fit_astrometry([(c["mjd"], c["ra"], c["dec"]) for c in clicks]) if len(clicks) >= 5 else None
    wavelengths = [m["center_um"] for m in valid]
    fluxes = [m["flux"] for m in valid]
    t_eff = fit_blackbody_temp(wavelengths, fluxes) if len(valid) >= 2 else None
    ch4 = band_ratio(wavelengths, fluxes, 2.1, 3.3) if len(valid) >= 2 else None
    h2o = band_ratio(wavelengths, fluxes, 2.2, 3.0) if len(valid) >= 2 else None

    verdict = classify({
        "valid_bands": len(valid),
        "astrometric_residual_arcsec": astro["residual_arcsec"] if astro else 0.0,
        "parallax_arcsec": astro["parallax_arcsec"] if astro else None,
        "proper_motion_arcsec_yr": astro["pm_arcsec_yr"] if astro else None,
        "t_eff_k": t_eff,
        "ch4_depth": ch4,
        "h2o_ice_depth": h2o,
    })

    luminosity = None
    if astro and astro["parallax_arcsec"] > 0 and valid:
        luminosity = approx_luminosity_solar(
            max(valid, key=lambda m: m["flux"]), astro["parallax_arcsec"])

    return {
        **verdict,
        "measurements": {
            "n_epochs": len(clicks),
            "n_bands_measured": len(measured),
            "n_bands_valid": len(valid),
            "bands": [{"center_um": round(m["center_um"], 3), "flux": m["flux"]}
                      for m in measured],
            "parallax_arcsec": astro["parallax_arcsec"] if astro else None,
            "proper_motion_arcsec_yr": astro["pm_arcsec_yr"] if astro else None,
            "astrometric_residual_arcsec": astro["residual_arcsec"] if astro else None,
            "t_eff_k": t_eff,
            "ch4_depth": ch4,
            "h2o_ice_depth": h2o,
            "approx_luminosity_solar": luminosity,
        },
    }
