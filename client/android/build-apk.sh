#!/bin/bash
# Build SkillSwap Android APK + AAB
set -e

export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
export ANDROID_HOME=/home/user/android-sdk
export ANDROID_SDK_ROOT=/home/user/android-sdk
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/build-tools/34.0.0:$PATH"

cd "$(dirname "$0")"

case "${1:-debug}" in
  debug)
    ./gradlew assembleDebug --no-daemon
    echo ""
    echo "✅ APK built: app/build/outputs/apk/debug/app-debug.apk"
    ;;
  release-apk)
    ./gradlew assembleRelease --no-daemon
    echo ""
    echo "✅ APK built: app/build/outputs/apk/release/app-release.apk"
    ;;
  release-aab)
    ./gradlew bundleRelease --no-daemon
    echo ""
    echo "✅ AAB built: app/build/outputs/bundle/release/app-release.aab"
    ;;
  all)
    ./gradlew assembleRelease bundleRelease --no-daemon
    echo ""
    echo "✅ APK: app/build/outputs/apk/release/app-release.apk"
    echo "✅ AAB: app/build/outputs/bundle/release/app-release.aab"
    ;;
  *)
    echo "Usage: $0 [debug|release-apk|release-aab|all]"
    exit 1
    ;;
esac