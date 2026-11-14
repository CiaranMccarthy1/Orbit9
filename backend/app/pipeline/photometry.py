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
    yy, xx = np.ogrid[:data.shape[0], :data.shape[1]]
    mask = (xx - x) ** 2 + (yy - y) ** 2 <= radius_px ** 2
    if not mask.any():
        return None
    return {"median": float(np.nanmedian(data[mask])), "n_pixels": int(mask.sum())}


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
