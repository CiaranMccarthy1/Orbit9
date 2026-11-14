"""FITS → PNG: ZODI-subtract, ZScale stretch, 8-bit output."""
import os
import tempfile
from pathlib import Path

import numpy as np
from astropy.io import fits
from astropy.visualization import ZScaleInterval
from PIL import Image


def stretch(data):
    """ZScale-stretch an image to float [0, 1], NaN-safe."""
    vmin, vmax = ZScaleInterval().get_limits(data)
    span = max(vmax - vmin, 1e-6)
    return np.clip(np.nan_to_num((data - vmin) / span), 0, 1)


def save_image(img, png_path):
    """Atomic PNG write: two builders of the same key can't interleave bytes."""
    png_path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=png_path.parent, suffix=".png")
    try:
        with os.fdopen(fd, "wb") as f:
            img.save(f, format="PNG")
        os.replace(tmp, png_path)
    except BaseException:
        os.unlink(tmp)
        raise
    return png_path


def save_gray(data, png_path):
    return save_image(Image.fromarray((stretch(data) * 255).astype(np.uint8)), png_path)


def render_png(fits_path, png_path):
    # shortcut: astropy's stubs type getdata() as Optional/tuple even when the
    # extension is guaranteed; asarray coerces and keeps pyright quiet
    data = np.asarray(fits.getdata(fits_path, "IMAGE"), dtype=np.float32) \
        - np.asarray(fits.getdata(fits_path, "ZODI"), dtype=np.float32)
    return save_gray(data, png_path)


if __name__ == "__main__":
    import sys

    render_png(Path(sys.argv[1]), Path(sys.argv[2]))
    print("rendered", sys.argv[2])
