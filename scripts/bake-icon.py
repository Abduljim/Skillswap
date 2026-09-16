#!/usr/bin/env python3
"""Bake the SkillSwap icon into all Android launcher slots.

Reads the 1024x1024 transparent foreground PNG and the 1024x1024 coral
full-bleed PNG, then writes:
  - ic_launcher_foreground.png at all 5 densities (mdpi/hdpi/xhdpi/xxhdpi/xxxhdpi)
  - ic_launcher.png + ic_launcher_round.png at all 5 densities (composite: coral bg + white S)

Adaptive icon spec:
  - total 108dp x 108dp
  - foreground 72dp centered (66.7% of canvas)
  - safe zone 66dp x 66dp centered (61.1%)

Density pixel sizes:
  mdpi=48  hdpi=72  xhdpi=96  xxhdpi=144  xxxhdpi=192

Foreground sizes (foreground is drawn at 108dp, then masked to 72dp safe):
  mdpi=108 hdpi=162 xhdpi=216 xxhdpi=324 xxxhdpi=432
"""
import os
from PIL import Image

RES_DIR = "/home/user/skillswap/client/android/app/src/main/res"

# density → (ic_launcher size, foreground size)
DENSITIES = {
    "mdpi":    (48, 108),
    "hdpi":    (72, 162),
    "xhdpi":   (96, 216),
    "xxhdpi":  (144, 324),
    "xxxhdpi": (192, 432),
}

BG_COLOR = (251, 79, 29, 255)  # coral-500
SRC_FOREGROUND = "/tmp/icon-foreground.png"
SRC_FULL = "/tmp/icon-full.png"


def main():
    fg = Image.open(SRC_FOREGROUND).convert("RGBA")
    full = Image.open(SRC_FULL).convert("RGBA")
    print(f"Source foreground: {fg.size}")
    print(f"Source full: {full.size}")

    for density, (launcher_px, foreground_px) in DENSITIES.items():
        # Resize foreground
        fg_resized = fg.resize((foreground_px, foreground_px), Image.LANCZOS)

        # ic_launcher_foreground.png (just the S on transparent)
        fg_path = f"{RES_DIR}/mipmap-{density}/ic_launcher_foreground.png"
        fg_resized.save(fg_path, optimize=True)
        print(f"  ✓ {fg_path} ({foreground_px}x{foreground_px})")

        # Composite: full coral icon at launcher size
        composite = full.resize((launcher_px, launcher_px), Image.LANCZOS)

        # Save ic_launcher.png
        ic_path = f"{RES_DIR}/mipmap-{density}/ic_launcher.png"
        composite.save(ic_path, optimize=True)

        # ic_launcher_round.png — same image (Android will apply circular mask)
        ic_round_path = f"{RES_DIR}/mipmap-{density}/ic_launcher_round.png"
        composite.save(ic_round_path, optimize=True)
        print(f"  ✓ {ic_path} + round ({launcher_px}x{launcher_px})")

    print("\n✅ All icon assets baked.")


if __name__ == "__main__":
    main()
