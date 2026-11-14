"""FITS → PNG: ZODI-subtract, ZScale stretch, 8-bit grayscale."""
from pathlib import Path

import numpy as np
from astropy.io import fits
from astropy.visualization import ZScaleInterval
from PIL import Image


def render_png(fits_path, png_path):
    # shortcut: astropy's stubs type getdata() as Optional/tuple even when the
    # extension is guaranteed; asarray coerces and keeps pyright quiet. If an
    # HDU were missing this degrades to NaN instead of raising — upgrade path:
    # validate HDU names once at fetch time.
    data = np.asarray(fits.getdata(fits_path, "IMAGE"), dtype=np.float32) \
        - np.asarray(fits.getdata(fits_path, "ZODI"), dtype=np.float32)
    vmin, vmax = ZScaleInterval().get_limits(data)
    span = max(vmax - vmin, 1e-6)
    arr = np.clip(np.nan_to_num((data - vmin) / span), 0, 1)
    png_path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray((arr * 255).astype(np.uint8)).save(png_path)
    return png_path


if __name__ == "__main__":
    import sys

    render_png(Path(sys.argv[1]), Path(sys.argv[2]))
    print("rendered", sys.argv[2])
