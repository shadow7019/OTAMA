#!/usr/bin/env python3
"""Generate Otama PWA icons from public/logo.svg on a themed backdrop."""
import cairosvg
from PIL import Image
import io

SRC = "/home/z/my-project/public/logo.svg"
OUT = "/home/z/my-project/public"
BG = "#0b0b10"  # app theme color

with open(SRC) as f:
    logo = f.read()

# strip the breathe animation (static icons)
logo = logo.replace(" z-breathe", "")


def make_icon(size: int, pad_ratio: float, path: str) -> None:
    """Render logo centered on an opaque rounded-square backdrop."""
    # inner logo box occupies (size - 2*pad); scale viewBox 30 -> inner
    pad = int(size * pad_ratio)
    inner = size - 2 * pad
    # scale factor: logo stroke widths are in viewBox units; scale wrapper
    svg = f"""<?xml version="1.0" encoding="UTF-8"?>
<svg width="{size}" height="{size}" viewBox="0 0 {size} {size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="{size}" height="{size}" rx="{int(size * 0.18)}" fill="{BG}"/>
  <g transform="translate({pad} {pad}) scale({inner / 30})">{logo.split(">", 0)[0] if False else ""}</g>
</svg>"""
    # embed the logo by inlining its <g> content (drop its xml prolog)
    body = logo[logo.index("<g") : logo.rindex("</svg>")]
    svg = f"""<?xml version="1.0" encoding="UTF-8"?>
<svg width="{size}" height="{size}" viewBox="0 0 {size} {size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="{size}" height="{size}" rx="{int(size * 0.18)}" fill="{BG}"/>
  <g transform="translate({pad} {pad}) scale({inner / 30})">{body}</g>
</svg>"""
    png = cairosvg.svg2png(bytestring=svg.encode(), output_width=size, output_height=size)
    Image.open(io.BytesIO(png)).convert("RGBA").save(path)
    print("wrote", path)


def make_apple(path: str, size: int = 180) -> None:
    """Apple touch icon: opaque, square (iOS rounds it), generous padding."""
    pad = int(size * 0.12)
    inner = size - 2 * pad
    body = logo[logo.index("<g") : logo.rindex("</svg>")]
    svg = f"""<?xml version="1.0" encoding="UTF-8"?>
<svg width="{size}" height="{size}" viewBox="0 0 {size} {size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="{size}" height="{size}" fill="{BG}"/>
  <g transform="translate({pad} {pad}) scale({inner / 30})">{body}</g>
</svg>"""
    png = cairosvg.svg2png(bytestring=svg.encode(), output_width=size, output_height=size)
    Image.open(io.BytesIO(png)).convert("RGB").save(path)  # no alpha for Apple
    print("wrote", path)


# any-purpose icons (own rounded corners from the backdrop rect)
make_icon(192, 0.10, f"{OUT}/icon-192.png")
make_icon(512, 0.10, f"{OUT}/icon-512.png")
# maskable: content must sit inside the center 80% safe zone
make_icon(192, 0.20, f"{OUT}/icon-maskable-192.png")
make_icon(512, 0.20, f"{OUT}/icon-maskable-512.png")
make_apple(f"{OUT}/apple-touch-icon.png")

# favicon fallback for old browsers (32px png next to existing svg)
make_icon(32, 0.12, f"{OUT}/favicon-32.png")

# verify not blank
for p in ["icon-192.png", "icon-512.png", "icon-maskable-192.png", "icon-maskable-512.png", "apple-touch-icon.png", "favicon-32.png"]:
    im = Image.open(f"{OUT}/{p}").convert("L")
    h = im.histogram()
    non_bg = 1 - (h[10] / sum(h)) if len(h) > 10 else 0
    print(f"{p}: size={im.size} non-bg-pixels={non_bg:.3f}")
