from __future__ import annotations

import colorsys
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"


def recolor_pixel(pixel: tuple[int, ...], hue_range: str) -> tuple[int, ...]:
    red, green, blue, *alpha = pixel
    hue, lightness, saturation = colorsys.rgb_to_hls(red / 255, green / 255, blue / 255)

    is_purple = 0.62 <= hue <= 0.92 and saturation > 0.12
    is_red = (hue <= 0.08 or hue >= 0.96) and saturation > 0.22
    should_recolor = is_purple if hue_range == "purple" else is_red

    if should_recolor:
        cyan_rgb = colorsys.hls_to_rgb(0.515, lightness, max(0.45, saturation * 0.92))
        red, green, blue = (round(channel * 255) for channel in cyan_rgb)

    return (red, green, blue, *alpha)


def recolor(path: Path, hue_range: str) -> None:
    with Image.open(path) as source:
        image = source.convert("RGBA")
        image.putdata([recolor_pixel(pixel, hue_range) for pixel in image.getdata()])
        image.save(path, optimize=True)


for icon_name in ("pwa-192x192.png", "pwa-512x512.png", "apple-touch-icon.png"):
    recolor(PUBLIC / icon_name, "purple")
