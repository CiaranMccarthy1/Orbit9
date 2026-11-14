import numpy as np
from astropy.io import fits
from PIL import Image

from app.pipeline.combine import combine, crop_common
from app.pipeline.grouping import array_of
from app.pipeline.photometry import aperture_median, flag_stats
from app.pipeline.png_renderer import render_png, save_image

WCS_CARDS = dict(CTYPE1="RA---TAN", CTYPE2="DEC--TAN", CUNIT1="deg",
                 CUNIT2="deg", CRVAL1=10.0, CRVAL2=20.0,
                 CRPIX1=11.0, CRPIX2=11.0, CDELT1=-0.001, CDELT2=0.001)


def make_fits(path, image, flags=None):
    hdu = fits.PrimaryHDU()
    hdu.header.update(WCS_CARDS)
    fits.HDUList([
        hdu,
        fits.ImageHDU(image.astype("float32"), name="IMAGE", header=hdu.header),
        fits.ImageHDU((flags if flags is not None else np.zeros_like(image)).astype("int32"),
                      name="FLAGS"),
        fits.ImageHDU(np.ones_like(image, dtype="float32"), name="VARIANCE"),
        fits.ImageHDU(np.zeros_like(image, dtype="float32"), name="ZODI"),
    ]).writeto(path, overwrite=True)


def test_diff_leaves_one_bright_pixel(tmp_path):
    a, b = np.full((21, 21), 10.0), np.full((21, 21), 10.0)
    a[10, 10] = 1000.0
    make_fits(tmp_path / "a.fits", a)
    make_fits(tmp_path / "b.fits", b)
    out = combine("diff", [tmp_path / "a.fits", tmp_path / "b.fits"], tmp_path / "d.png")
    img = np.asarray(Image.open(out))
    assert img.shape == (21, 21)
    assert (img > 200).sum() == 1          # the moving source
    assert (img < 50).sum() == 21 * 21 - 1  # background cancels


def test_aperture_median_hits_disk(tmp_path):
    img = np.zeros((21, 21))
    yy, xx = np.ogrid[:21, :21]
    img[(xx - 10) ** 2 + (yy - 10) ** 2 <= 4] = 100.0
    make_fits(tmp_path / "g.fits", img)
    m = aperture_median(tmp_path / "g.fits", 10.0, 20.0, radius_px=2)
    assert m and m["median"] == 100.0 and m["n_pixels"] > 0


def test_flag_stats_counts_bits(tmp_path):
    flags = np.zeros((21, 21), dtype="int32")
    flags[0, :2] = 1  # bit 0 (e.g. cosmic ray) in two pixels
    make_fits(tmp_path / "f.fits", np.zeros((21, 21)), flags)
    s = flag_stats(tmp_path / "f.fits")
    assert s["set_bits"] == {"0": 2}
    assert s["pixels"] == 441
    assert abs(s["flagged_fraction"] - 2 / 441) < 1e-9


def test_array_mapping_matches_spherex_ranges():
    assert array_of(0.75, 1.11) == 1
    assert array_of(1.63, 2.43) == 3   # observed DR1 band
    assert array_of(4.41, 5.01) == 6   # observed DR1 band
    assert array_of(2.5, 3.5) == 4


def test_concurrent_png_writes_leave_valid_file(tmp_path):
    import threading


    out = tmp_path / "race.png"
    imgs = [Image.fromarray(np.full((64, 64), v, dtype=np.uint8)) for v in (40, 200)]
    threads = [threading.Thread(target=lambda im=im: [save_image(im, out) for _ in range(20)])
               for im in imgs]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    result = np.asarray(Image.open(out))
    assert result.shape == (64, 64)
    assert set(np.unique(result)).issubset({40, 200})
    assert len(np.unique(result)) == 1  # never a torn mix of the two images


def test_render_png_handles_nan_pixels(tmp_path):
    img = np.full((16, 16), 5.0)
    img[3, 4] = np.nan
    img[8, 8] = 100.0  # non-flat so ZScale produces real contrast
    make_fits(tmp_path / "n.fits", img)
    out = render_png(tmp_path / "n.fits", tmp_path / "n.png")
    a = np.asarray(Image.open(out))
    assert a.shape == (16, 16) and a.max() > 0


def test_crop_common_trims_to_overlap():
    a = np.full((10, 10), np.nan); a[2:6, 2:6] = 1.0
    b = np.full((10, 10), np.nan); b[4:8, 4:8] = 2.0
    out = crop_common([a, b])
    assert out[0].shape == (2, 2)          # rows/cols 4..5
    assert np.isfinite(out[0]).all() and np.isfinite(out[1]).all()


def test_crop_common_no_overlap_returns_unchanged():
    a = np.full((6, 6), np.nan); a[0:2, 0:2] = 1.0
    b = np.full((6, 6), np.nan); b[4:6, 4:6] = 2.0
    out = crop_common([a, b])
    assert out[0].shape == (6, 6)
