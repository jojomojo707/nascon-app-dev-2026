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
# Offline-friendly: Expo's Gradle plugin asks for the Kotlin 2.2.21 compiler (~60 MB download);
# React Native's plugin already uses 2.2.0, so reuse that cached compiler (campus Wi-Fi is slow).
sed -i 's/kotlin("jvm") version "2.2.21" apply false/kotlin("jvm") version "2.2.0" apply false/' \
  node_modules/expo-modules-autolinking/android/expo-gradle-plugin/build.gradle.kts || true
if [[ "${SKIP_PREBUILD:-0}" != "1" ]]; then
  CI=1 npx expo prebuild --platform android --clean --no-install
fi
# In-process Kotlin compilation: the separate Kotlin daemon can hang over RMI on some machines.
(cd android && ./gradlew assembleRelease \
  -Pkotlin.compiler.execution.strategy=in-process \
  -PreactNativeArchitectures=arm64-v8a,x86_64)
mkdir -p release
cp android/app/build/outputs/apk/release/app-release.apk release/app-release.apk
ls -lh release/app-release.apk
