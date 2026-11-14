"""FITS loading and calibration-free WCS alignment.

shortcut: reproject_interp on the full 2040x2040 frame; move to blockwise/Dask
if multi-epoch stacks get slow.
"""
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

from fastapi import HTTPException
import numpy as np
from astropy.io import fits
from astropy.wcs import WCS


@contextmanager
def open_fits(fits_path) -> Iterator[Any]:
    try:
        with fits.open(fits_path, memmap=False) as hdus:
            yield hdus
    except (OSError, ValueError, TypeError, KeyError, IndexError) as exc:
        Path(fits_path).unlink(missing_ok=True)
        raise HTTPException(502, f"Invalid FITS or missing required extension: {exc}") from exc


def read_extension(fits_path, name):
    with open_fits(fits_path) as hdus:
        data = np.array(hdus[name].data)
        if data.ndim != 2:
            raise ValueError(f"{name} must be a 2D image")
        return data


def load_image(fits_path):
    """ZODI-subtracted IMAGE array + world WCS."""
    with open_fits(fits_path) as hdus:
        data = np.array(hdus["IMAGE"].data, dtype=np.float32)
        if data.ndim != 2:
            raise ValueError("IMAGE must be a 2D image")
        if "ZODI" in hdus:
            data -= np.asarray(hdus["ZODI"].data, dtype=np.float32)
        wcs = WCS(hdus["IMAGE"].header)
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
