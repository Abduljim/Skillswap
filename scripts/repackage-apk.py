# Repackage the SkillSwap APK with the current client web build.
# Usage: python scripts/repackage-apk.py <input.apk> <client-dist-dir> <output.apk>
import os
import sys
import zipfile

from PIL import Image

RES_DIR = os.path.normpath(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "client", "android", "app", "src", "main", "res")
)

# Legacy / adaptive icon sizes per density (see bake-icon.py).
ICONS = {
    "res/9w.png": ("mipmap-mdpi", "ic_launcher.png"),
    "res/yn.png": ("mipmap-hdpi", "ic_launcher.png"),
    "res/FS.png": ("mipmap-xhdpi", "ic_launcher.png"),
    "res/RJ.png": ("mipmap-xxhdpi", "ic_launcher.png"),
    "res/o-.png": ("mipmap-xxxhdpi", "ic_launcher.png"),
    "res/QZ.png": ("mipmap-mdpi", "ic_launcher_foreground.png"),
    "res/zr.png": ("mipmap-hdpi", "ic_launcher_foreground.png"),
    "res/Em.png": ("mipmap-xhdpi", "ic_launcher_foreground.png"),
    "res/Lf.png": ("mipmap-xxhdpi", "ic_launcher_foreground.png"),
    "res/as.png": ("mipmap-xxxhdpi", "ic_launcher_foreground.png"),
    "res/zR.png": ("mipmap-mdpi", "ic_launcher_round.png"),
    "res/8c.png": ("mipmap-hdpi", "ic_launcher_round.png"),
    "res/wb.png": ("mipmap-xhdpi", "ic_launcher_round.png"),
    "res/fO.png": ("mipmap-xxhdpi", "ic_launcher_round.png"),
    "res/Gc.png": ("mipmap-xxxhdpi", "ic_launcher_round.png"),
}


def main():
    if len(sys.argv) != 4:
        print("Usage: python scripts/repackage-apk.py <input.apk> <dist-dir> <output.apk>")
        sys.exit(1)
    src, dist, out = sys.argv[1:4]

    dist_files = {}
    for root, _dirs, files in os.walk(dist):
        for name in files:
            full = os.path.join(root, name)
            rel = os.path.relpath(full, dist).replace("\\", "/")
            dist_files[f"assets/public/{rel}"] = full

    zin = zipfile.ZipFile(src)
    zout = zipfile.ZipFile(out, "w")
    web_replaced = 0
    icon_replaced = 0

    for item in zin.infolist():
        if item.filename.startswith("META-INF/"):
            continue
        # Drop stale Capacitor web assets (index.html + hashed bundles); the new
        # dist replaces them. Keep cordova.* shims.
        if item.filename.startswith("assets/public/assets/"):
            continue
        if item.filename == "assets/public/index.html":
            continue
        if item.filename == "assets/public/config.json":
            continue

        data = zin.read(item.filename)
        if item.filename in ICONS:
            folder, name = ICONS[item.filename]
            with open(os.path.join(RES_DIR, folder, name), "rb") as f:
                data = f.read()
            icon_replaced += 1
        zout.writestr(item, data)

    for arc, path in dist_files.items():
        with open(path, "rb") as f:
            data = f.read()
        zout.writestr(zipfile.ZipInfo(arc, (2024, 1, 1, 0, 0, 0)), data, compress_type=zipfile.ZIP_DEFLATED)
        web_replaced += 1

    zout.close()
    zin.close()
    print(f"web files added/updated: {web_replaced}, icons: {icon_replaced}")
    print(f"wrote {out} ({os.path.getsize(out)} bytes)")


if __name__ == "__main__":
    main()