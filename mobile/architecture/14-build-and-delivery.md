# Build and Delivery

Part of [the mobile architecture doc set](index.md).

## Prerequisites (one-time, on the laptop that builds the APK)

- **Node.js LTS** (from nodejs.org): runs Expo and the JS tooling.
- **JDK 17** (e.g. Eclipse Temurin 17): Gradle needs it to compile the Android app.
- **Android SDK** (install via Android Studio → SDK Manager): set the `ANDROID_HOME` environment variable to the SDK folder.
- An Android emulator (Android Studio → Device Manager, API 29+, a small 360×640 dp profile for HCI checks) or a phone with USB debugging.

No Expo account and no internet-hosted build service is used.

## Expo config (`mobile/app.json`)

```json
{
  "expo": {
    "name": "NaSCon League",
    "slug": "nascon-league",
    "orientation": "default",
    "android": {
      "package": "com.nascon.league",
      "allowBackup": false
    },
    "plugins": [
      "expo-router",
      "expo-secure-store",
      "expo-sqlite",
      ["expo-build-properties", { "android": { "usesCleartextTraffic": true } }]
    ]
  }
}
```

- `orientation: "default"` allows rotation (the Expo template ships `"portrait"`; change it — HCI area 5).
- `usesCleartextTraffic: true` is required: without it, release builds block `http://` and the app cannot reach the backend during judging (see [11-security.md](11-security.md)).
- `allowBackup: false` keeps cached data and session files out of Android backups.
- Default server URL is a constant `DEFAULT_SERVER_URL = "http://10.0.2.2:8080"` in `src/data/settings/settingsStore.ts`, overridable in Settings.
- NativeWind is wired through `babel.config.js`, `metro.config.js`, `tailwind.config.js` and `global.css` (follow the NativeWind Expo setup guide), not through `app.json`.

## Building the release APK

`mobile/scripts/build-apk.sh` (run with `npm run build:apk` from `mobile/`, works in Git Bash on Windows):

```bash
set -euo pipefail
cd "$(dirname "$0")/.."
npx expo prebuild --platform android --clean     # regenerates android/ from app.json
(cd android && ./gradlew assembleRelease)        # builds the release APK
mkdir -p release
cp android/app/build/outputs/apk/release/app-release.apk release/app-release.apk
```

- The generated `android/` folder is not edited by hand and is gitignored; `prebuild --clean` recreates it each time.
- The generated project signs `release` with the **debug keystore**, so `assembleRelease` produces an installable APK without managing a keystore. Acceptable for a judged demo; note it in README.
- Minification is off by default in the generated project; leave it off (avoids stripping code under time pressure).
- **Commit `mobile/release/app-release.apk`** after every phase that changes the app (spec §1.3 checklist).
- If a native library fails during prebuild or Gradle, check that library's Expo setup notes before changing anything in `android/`.
- Install for testing: `adb install -r mobile/release/app-release.apk`.

## README additions (mobile section)

- How to install the APK, how to set the server address (emulator `10.0.2.2:8080` vs phone: laptop LAN IP, same Wi-Fi).
- How to rebuild the APK (prerequisites above + `npm run build:apk`).
- The five demo accounts (role matrix in [04-navigation.md](04-navigation.md)).
- Offline demo steps (see [08-offline-sync-and-tolerance.md](08-offline-sync-and-tolerance.md) §Desk check walk-through), including the role-switch note.
