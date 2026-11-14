"""Aperture photometry at a sky position and FITS quality stats."""
import numpy as np
from astropy.io import fits

from app.pipeline.imaging import load_image


def aperture_median(fits_path, ra, dec, radius_px=3):
    """NaN-safe median of pixels inside a small circle around (ra, dec).

    shortcut: raw data values (MJy/sr), no aperture correction or PSF fit;
    enough to see spectral features, upgrade for publication photometry.
    """
    data, wcs = load_image(fits_path)
    x, y = wcs.all_world2pix(ra, dec, 0)
    # window around the aperture: no full-frame grids for a 7-px circle
    r = radius_px
    i0, i1 = max(int(y) - r - 1, 0), min(int(y) + r + 2, data.shape[0])
    j0, j1 = max(int(x) - r - 1, 0), min(int(x) + r + 2, data.shape[1])
    if i0 >= i1 or j0 >= j1:
        return None
    yy, xx = np.ogrid[i0:i1, j0:j1]
    mask = (xx - x) ** 2 + (yy - y) ** 2 <= radius_px ** 2
    if not mask.any():
        return None
    sub = data[i0:i1, j0:j1]
    return {"median": float(np.nanmedian(sub[mask])), "n_pixels": int(mask.sum())}


def aperture_flux(fits_path, ra, dec, radius_px=3):
    """Background-subtracted aperture sum + pixel solid angle + flag fraction.

    shortcut: L2b surface brightness in MJy/sr summed over the aperture with a
    2r-3r annulus background; no zero-point calibration or aperture correction,
    so use it for band-to-band shape, not absolute photometry.
    """
    data, wcs = load_image(fits_path)
    x, y = wcs.all_world2pix(ra, dec, 0)
    r = radius_px
    i0, i1 = max(int(y) - 3 * r - 2, 0), min(int(y) + 3 * r + 3, data.shape[0])
    j0, j1 = max(int(x) - 3 * r - 2, 0), min(int(x) + 3 * r + 3, data.shape[1])
    if i0 >= i1 or j0 >= j1:
        return None
    yy, xx = np.ogrid[i0:i1, j0:j1]
    dist2 = (xx - x) ** 2 + (yy - y) ** 2
    aperture = dist2 <= r ** 2
    annulus = (dist2 > (2 * r) ** 2) & (dist2 <= (3 * r) ** 2)
    if not aperture.any() or not annulus.any():
        return None
    sub = data[i0:i1, j0:j1]
    background = float(np.nanmedian(sub[annulus]))
    flags = np.asarray(fits.getdata(fits_path, "FLAGS"))[i0:i1, j0:j1]
    pixel_area_deg2 = abs(np.linalg.det(wcs.pixel_scale_matrix))
    return {
        "flux": float(np.nansum(sub[aperture] - background)),
        "pixel_area_sr": float(pixel_area_deg2) * (np.pi / 180.0) ** 2,
        "flagged_fraction": float(np.count_nonzero(flags[aperture]) / aperture.sum()),
    }


def flag_stats(fits_path):
    """Per-bit FLAGS counts and VARIANCE summary for one frame."""
    flags = np.asarray(fits.getdata(fits_path, "FLAGS"))
    var = np.asarray(fits.getdata(fits_path, "VARIANCE"), dtype=np.float32)
    bits = {str(b): int(np.count_nonzero(flags & (1 << b))) for b in range(16)
            if np.count_nonzero(flags & (1 << b))}
    return {
        "pixels": int(flags.size),
        "flagged_fraction": float(np.count_nonzero(flags) / flags.size),
        "set_bits": bits,
        "variance_median": float(np.nanmedian(var)),
        "variance_max": float(np.nanmax(var)),
    }
