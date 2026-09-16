#!/usr/bin/env python3
"""Bake the SkillSwap launcher icon into all Android mipmap densities.

Usage:
    python scripts/bake-icon.py <source-image.png>

The source image is center-cropped to a square and scaled to a 1024px master.
Generated assets:
  - ic_launcher_foreground.png  — source image scaled into the adaptive-icon safe
    zone (60% of canvas) on a transparent background.
  - ic_launcher.png / ic_launcher_round.png — full-bleed source image (legacy).
The adaptive background color is derived from the source image's average color
and written to values/ic_launcher_background.xml.

Sizes (Android adaptive icon spec, 108dp canvas / 66dp safe zone):
  density    legacy   foreground
  mdpi       48       108
  hdpi       72       162
  xhdpi      96       216
  xxhdpi    144       324
  xxxhdpi   192       432

Run from anywhere; the Android res dir is resolved relative to this script.
"""
import os
import sys

from PIL import Image

RES_DIR = os.path.normpath(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "client", "android", "app", "src", "main", "res")
)

MASTER = 1024  # master canvas px, everything scales from here
FG_SCALE = 0.60  # foreground occupies 60% of the canvas (within the 66dp safe zone)

DENSITIES = {
    "mdpi": (48, 108),
    "hdpi": (72, 162),
    "xhdpi": (96, 216),
    "xxhdpi": (144, 324),
    "xxxhdpi": (192, 432),
}

BACKGROUND_XML = os.path.normpath(
    os.path.join(RES_DIR, "values", "ic_launcher_background.xml")
)


def load_square_master(source: str) -> Image.Image:
    img = Image.open(source).convert("RGBA")
    w, h = img.size
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    img = img.crop((left, top, left + side, top + side))
    return img.resize((MASTER, MASTER), Image.LANCZOS)


def average_color(img: Image.Image):
    px = img.resize((64, 64), Image.LANCZOS).convert("RGB")
    w, h = px.size
    tot = [0, 0, 0]
    n = 0
    p = px.load()
    for y in range(h):
        for x in range(w):
            r, g, b = p[x, y]
            tot[0] += r
            tot[1] += g
            tot[2] += b
            n += 1
    return tuple(round(t / n) for t in tot)


def write_background_color(rgb):
    r, g, b = rgb
    hexs = f"#{r:02X}{g:02X}{b:02X}"
    xml = f"""<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#{r:02X}{g:02X}{b:02X}</color>
</resources>
"""
    os.makedirs(os.path.dirname(BACKGROUND_XML), exist_ok=True)
    with open(BACKGROUND_XML, "w", encoding="utf-8") as f:
        f.write(xml)
    return hexs


def main():
    if len(sys.argv) < 2:
        print("Usage: python scripts/bake-icon.py <source-image.png>")
        sys.exit(1)
    source = sys.argv[1]
    if not os.path.isfile(source):
        print(f"Source image not found: {source}")
        sys.exit(1)

    master = load_square_master(source)
    mw, mh = master.size
    fg_px = int(MASTER * FG_SCALE)
    fg_offset = (MASTER - fg_px) // 2
    fg_master = Image.new("RGBA", (MASTER, MASTER), (0, 0, 0, 0))
    fg_master.paste(master.crop((fg_offset, fg_offset, fg_offset + fg_px, fg_offset + fg_px)), (fg_offset, fg_offset))

    bg = write_background_color(average_color(master))

    print(f"Res dir: {RES_DIR}")
    print(f"Source: {source} ({mw}x{mh})")
    print(f"Adaptive background: {bg}")

    for name in ("mipmap-mdpi", "mipmap-hdpi", "mipmap-xhdpi", "mipmap-xxhdpi", "mipmap-xxxhdpi"):
        path = os.path.join(RES_DIR, name)
        if not os.path.isdir(path):
            print(f"  !! missing {path}")

    for density, (legacy_px, fg_den_px) in DENSITIES.items():
        folder = os.path.join(RES_DIR, f"mipmap-{density}")

        fg = fg_master.resize((fg_den_px, fg_den_px), Image.LANCZOS)
        fg.save(os.path.join(folder, "ic_launcher_foreground.png"), optimize=True)

        legacy = master.resize((legacy_px, legacy_px), Image.LANCZOS)
        legacy.save(os.path.join(folder, "ic_launcher.png"), optimize=True)
        legacy.save(os.path.join(folder, "ic_launcher_round.png"), optimize=True)

        print(f"  * {density}: legacy {legacy_px}px, foreground {fg_den_px}px")

    print("\nOK:  Icon assets baked from source image.")


if __name__ == "__main__":
    main()