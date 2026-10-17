#!/usr/bin/env bash
# Builds the release APK locally (no Expo cloud services) and copies it to mobile/release/.
# Prereqs: Node, JDK 17, Android SDK (ANDROID_HOME). Run from mobile/: npm run build:apk
set -euo pipefail
cd "$(dirname "$0")/.."
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
# Use a JDK 17 from Gradle's toolchain cache if JAVA_HOME is not set.
if [[ -z "${JAVA_HOME:-}" ]]; then
  jdk17=$(ls -d "$HOME"/.gradle/jdks/eclipse_adoptium-17-* 2>/dev/null | head -1 || true)
  if [[ -n "$jdk17" ]]; then export JAVA_HOME="$jdk17"; fi
fi
CI=1 npx expo prebuild --platform android --clean --no-install
(cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a,x86_64)
mkdir -p release
cp android/app/build/outputs/apk/release/app-release.apk release/app-release.apk
ls -lh release/app-release.apk
