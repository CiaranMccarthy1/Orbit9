"""Band→RGB false-colour composites."""
import numpy as np
from PIL import Image

from app.pipeline.imaging import load_aligned
from app.pipeline.png_renderer import save_image, stretch


def compose_rgb(red_path, green_path, blue_path, png_path):
    # arrays have different WCS, so align all three to the red frame
    arrays, _ = load_aligned([red_path, green_path, blue_path])
    channels = [stretch(a) for a in arrays]
    rgb = (np.stack(channels, axis=-1) * 255).astype(np.uint8)
    return save_image(Image.fromarray(rgb, mode="RGB"), png_path)
