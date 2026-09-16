#!/usr/bin/env python3
"""Bake the SkillSwap launcher icon into all Android mipmap densities.

Generates:
  - ic_launcher_foreground.png  — transparent PNG with a white "S" glyph in the
    adaptive-icon safe zone (60% of canvas). The launcher background color
    (coral) shows through the mask.
  - ic_launcher.png / ic_launcher_round.png — full-bleed coral gradient icon with
    the white "S" for legacy launchers.

Sizes (from Android adaptive icon spec, 108dp canvas / 66dp safe zone):
  density    legacy   foreground
  mdpi       48       108
  hdpi       72       162
  xhdpi      96       216
  xxhdpi    144       324
  xxxhdpi   192       432

Run from anywhere; the Android res dir is resolved relative to this script.
"""
import math
import os

from PIL import Image, ImageDraw, ImageFilter, ImageFont

RES_DIR = os.path.normpath(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "client", "android", "app", "src", "main", "res")
)

MASTER = 1024  # master canvas px, everything scales from here

FONT_CANDIDATES = [
    "C:/Windows/Fonts/arialbd.ttf",
    "C:/Windows/Fonts/segoeuib.ttf",
    "C:/Windows/Fonts/arial.ttf",
    "C:/Windows/Fonts/ARIALBD.TTF",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
]

DENSITIES = {
    "mdpi": (48, 108),
    "hdpi": (72, 162),
    "xhdpi": (96, 216),
    "xxhdpi": (144, 324),
    "xxxhdpi": (192, 432),
}

CORAL_TOP = (255, 99, 49, 255)     # coral-500-ish
CORAL_BOTTOM = (235, 58, 10, 255)
INK = (18, 19, 26, 255)


def find_font(size: int):
    for path in FONT_CANDIDATES:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
    return ImageFont.load_default()


def draw_s_glyph(draw: ImageDraw.ImageDraw, cx: int, cy: int, size: int, fill):
    """Draw a bold 'S' centered at (cx, cy), roughly `size` px tall."""
    font = find_font(int(size * 0.82))
    try:
        text = "S"
        bbox = draw.textbbox((0, 0), text, font=font)
        w = bbox[2] - bbox[0]
        h = bbox[3] - bbox[1]
        x = cx - w / 2 - bbox[0]
        y = cy - h / 2 - bbox[1]
        draw.text((x, y), text, font=font, fill=fill)
    except Exception:
        # Fallback: draw a blocky S from simple shapes
        r = size * 0.22
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=fill)


def make_foreground_master() -> Image.Image:
    img = Image.new("RGBA", (MASTER, MASTER), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # Draw glyph slightly larger than the text height so the weight reads.
    draw_s_glyph(d, MASTER // 2, MASTER // 2 + int(MASTER * 0.01), int(MASTER * 0.50), (255, 255, 255, 255))
    return img


def make_legacy_master() -> Image.Image:
    img = Image.new("RGBA", (MASTER, MASTER), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # Radial coral gradient background
    for y in range(MASTER):
        t = y / (MASTER - 1)
        r = int(CORAL_TOP[0] + (CORAL_BOTTOM[0] - CORAL_TOP[0]) * t)
        g = int(CORAL_TOP[1] + (CORAL_BOTTOM[1] - CORAL_TOP[1]) * t)
        b = int(CORAL_TOP[2] + (CORAL_BOTTOM[2] - CORAL_TOP[2]) * t)
        d.line([(0, y), (MASTER, y)], fill=(r, g, b, 255))

    # Bottom vignette for depth
    vignette = Image.new("RGBA", (MASTER, MASTER), (0, 0, 0, 0))
    vd = ImageDraw.Draw(vignette)
    vd.ellipse(
        [MASTER * -0.25, MASTER * 0.35, MASTER * 1.25, MASTER * 1.35],
        fill=(30, 15, 5, 90),
    )
    img = Image.alpha_composite(img, vignette.filter(ImageFilter.GaussianBlur(80)))

    # Rounded-corner alpha mask (18% radius, standard 20dp on 108dp)
    mask = Image.new("L", (MASTER, MASTER), 0)
    md = ImageDraw.Draw(mask)
    radius = int(MASTER * 0.18)
    md.rounded_rectangle([0, 0, MASTER - 1, MASTER - 1], radius=radius, fill=255)

    # White S glyph
    d2 = ImageDraw.Draw(img)
    draw_s_glyph(d2, MASTER // 2, MASTER // 2 + int(MASTER * 0.005), int(MASTER * 0.42), (255, 255, 255, 255))

    # Soft drop shadow under the glyph
    shadow = Image.new("RGBA", (MASTER, MASTER), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    draw_s_glyph(sd, MASTER // 2 + 4, MASTER // 2 + 12, int(MASTER * 0.42), (120, 30, 0, 120))
    shadow = shadow.filter(ImageFilter.GaussianBlur(12))
    img = Image.alpha_composite(img, shadow)
    d2 = ImageDraw.Draw(img)
    draw_s_glyph(d2, MASTER // 2, MASTER // 2 + int(MASTER * 0.005), int(MASTER * 0.42), (255, 255, 255, 255))

    img.putalpha(mask)
    return img


def main():
    print(f"Res dir: {RES_DIR}")
    for name in ("mipmap-mdpi", "mipmap-hdpi", "mipmap-xhdpi", "mipmap-xxhdpi", "mipmap-xxxhdpi"):
        path = os.path.join(RES_DIR, name)
        if not os.path.isdir(path):
            print(f"  !! missing {path}")
        else:
            print(f"  * {name}")

    fg_master = make_foreground_master()
    full_master = make_legacy_master()

    for density, (legacy_px, fg_px) in DENSITIES.items():
        folder = os.path.join(RES_DIR, f"mipmap-{density}")

        fg = fg_master.resize((fg_px, fg_px), Image.LANCZOS)
        fg.save(os.path.join(folder, "ic_launcher_foreground.png"), optimize=True)

        legacy = full_master.resize((legacy_px, legacy_px), Image.LANCZOS)
        legacy.save(os.path.join(folder, "ic_launcher.png"), optimize=True)
        legacy.save(os.path.join(folder, "ic_launcher_round.png"), optimize=True)

        print(f"  * {density}: legacy {legacy_px}px, foreground {fg_px}px")

    print("\nOK:  Icon assets baked.")


if __name__ == "__main__":
    main()