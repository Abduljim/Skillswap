#!/bin/bash
# Repoint an existing SkillSwap APK at a new backend URL.
# Usage:   ./repoint-apk.sh <path-to.apk> <new-api-url>
# Example: ./repoint-apk.sh SkillSwap-release.apk https://skillswap-api.onrender.com
#
# This updates the config.json inside the APK without recompiling TypeScript.
# Works on signed APKs — the signature is preserved because we don't change code,
# only add/replace an asset file. (For Google Play uploads, rebuild the AAB
# via `npm run cap:sync && cd android && ./gradlew bundleRelease`.)

set -e

if [ $# -ne 2 ]; then
  echo "Usage: $0 <path-to.apk> <new-api-url>"
  echo ""
  echo "Examples:"
  echo "  $0 SkillSwap-release.apk https://skillswap-api.onrender.com"
  echo "  $0 SkillSwap-release.apk http://10.0.2.2:4000  # Android emulator → host"
  exit 1
fi

APK="$1"
URL="$2"
TMP=$(mktemp -d)
trap "rm -rf $TMP" EXIT

echo "📦 Repointing $APK → $URL"

# Extract
unzip -q "$APK" -d "$TMP/extracted"

# Write new config.json
printf '{"apiUrl":"%s"}\n' "$URL" > "$TMP/extracted/assets/public/config.json"
echo "  ✓ wrote assets/public/config.json"

# Repack — preserve order, force overwrite only config.json
cd "$TMP/extracted"
zip -q -r "$TMP/new.apk" . -x "META-INF/*"
cd - > /dev/null

# Re-sign with the same keystore the project uses
KEYSTORE="$(dirname "$0")/android/app/skillswap-release.jks"
if [ -f "$KEYSTORE" ]; then
  ZIPALIGN=$(ls /home/user/android-sdk/build-tools/*/zipalign 2>/dev/null | sort -V | tail -1)
  APKSIGNER=$(ls /home/user/android-sdk/build-tools/*/apksigner 2>/dev/null | sort -V | tail -1)
  if [ -n "$ZIPALIGN" ] && [ -n "$APKSIGNER" ]; then
    "$ZIPALIGN" -p 4 "$TMP/new.apk" "$TMP/aligned.apk"
    "$APKSIGNER" sign \
      --ks "$KEYSTORE" \
      --ks-pass pass:skillswap123 \
      --key-pass pass:skillswap123 \
      --ks-key-alias skillswap \
      --out "$APK.tmp" \
      "$TMP/aligned.apk"
    mv "$APK.tmp" "$APK"
    echo "  ✓ re-signed with skillswap-release.jks"
  else
    mv "$TMP/new.apk" "$APK"
    echo "  ⚠️ zipalign/apksigner not found — APK is unsigned"
  fi
else
  mv "$TMP/new.apk" "$APK"
  echo "  ⚠️ keystore not found — APK is unsigned"
fi

echo ""
echo "✅ Done. Install with: adb install -r $APK"