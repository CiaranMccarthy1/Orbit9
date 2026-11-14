"""Multi-frame maths: epoch subtraction, co-addition, band stacking."""
import numpy as np
from astropy.io import fits

from app.pipeline.imaging import load_aligned, nan_mean
from app.pipeline.png_renderer import save_gray

MODES = ("diff", "coadd", "stack")


def crop_common(arrays):
    """Trim to the bounding box where every frame has data; None if no overlap."""
    cover = np.ones(arrays[0].shape, dtype=bool)
    for a in arrays:
        cover &= np.isfinite(a)
    if not cover.any():
        return None
    rows = np.where(cover.any(axis=1))[0]
    cols = np.where(cover.any(axis=0))[0]
    return [a[rows[0]:rows[-1] + 1, cols[0]:cols[-1] + 1] for a in arrays]


def combine(mode, fits_paths, png_path):
    if mode == "diff":
        if len(fits_paths) != 2:
            raise ValueError("diff needs exactly 2 frames")
        arrays, _ = load_aligned(fits_paths)
        arrays = crop_common(arrays)
        if arrays is None:
            raise ValueError("no overlapping coverage between frames")
        return save_gray(arrays[0] - arrays[1], png_path)
    if mode == "coadd":
        if len(fits_paths) < 2:
            raise ValueError("coadd needs at least 2 frames")
        arrays, _ = load_aligned(fits_paths)
        arrays = crop_common(arrays)
        if arrays is None:
            raise ValueError("no overlapping coverage between frames")
        return save_gray(nan_mean(arrays), png_path)
    if mode == "stack":
        # shortcut: stack assumes one detector-array's bands share a WCS;
        # reproject anyway is skipped here to keep band sums exact
        arrays = [
            (np.asarray(fits.getdata(p, "IMAGE"), dtype=np.float32)
             - np.asarray(fits.getdata(p, "ZODI"), dtype=np.float32))
            for p in fits_paths
        ]
        return save_gray(nan_mean(arrays), png_path)
    raise ValueError(f"unknown mode {mode!r}")
