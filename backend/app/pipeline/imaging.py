"""FITS loading and calibration-free WCS alignment.

shortcut: reproject_interp on the full 2040x2040 frame; move to blockwise/Dask
if multi-epoch stacks get slow.
"""
import numpy as np
from astropy.io import fits
from astropy.wcs import WCS


def load_image(fits_path):
    """ZODI-subtracted IMAGE array + world WCS."""
    data = np.asarray(fits.getdata(fits_path, "IMAGE"), dtype=np.float32) \
        - np.asarray(fits.getdata(fits_path, "ZODI"), dtype=np.float32)
    wcs = WCS(fits.getheader(fits_path, "IMAGE"))
    return data, wcs


def align_to_ref(data, wcs, ref_wcs, shape):
    """Resample one frame onto the reference grid; NaN outside coverage."""
    from reproject import reproject_interp

    out, _ = reproject_interp((data, wcs), ref_wcs, shape_out=shape)
    return np.asarray(out, dtype=np.float32)


def load_aligned(fits_paths):
    """Load all frames aligned to the first; returns (arrays, ref_wcs)."""
    ref_data, ref_wcs = load_image(fits_paths[0])
    arrays = [ref_data]
    for p in fits_paths[1:]:
        data, wcs = load_image(p)
        arrays.append(align_to_ref(data, wcs, ref_wcs, ref_data.shape))
    return arrays, ref_wcs


def nan_mean(arrays):
    stack = np.stack(arrays)
    out = np.nanmean(stack, axis=0)
    return np.nan_to_num(out, nan=0.0)
