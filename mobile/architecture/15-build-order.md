# Build Order for Claude Code (time-boxed)

Part of [the mobile architecture doc set](index.md). Each phase ends with a commit + push (see push windows in [00-instructions-scope-and-assumptions.md](00-instructions-scope-and-assumptions.md) §Instructions for Claude Code).

| Phase | Deliverable | Target |
| --- | --- | --- |
| P0 | `npx create-expo-app` (TypeScript), NativeWind setup + tokens, Expo Router skeleton with 5 bottom tabs + placeholder screens, `app.json` (cleartext, orientation, allowBackup), `build-apk.sh`; build and commit a first APK. Push. | 20 min |
| P1 | Settings (server URL), Login, secure-store session, axios client + interceptors, role-aware Home, connectivityMonitor + ConnectivityBanner | 30 min |
| P2 | expo-sqlite + Drizzle schema + migrations; Fixtures, Standings, Match detail (score + timeline), Club profile, all offline-first | 45 min |
| P3 | Store: catalogue, variant picker, cart, checkout, receipt view/download | 35 min |
| P4 | Scoring entry + Roster management (online path) | 30 min |
| P5 | Offline queue, syncScheduler, Sync status screen, pending badges | 35 min |
| P6 | Realtime WebSocket + polling fallback, pinned products | 15 min |
| P7 | HCI polish pass ([12-ui-and-hci.md](12-ui-and-hci.md) §Mapping to the five judged areas), 360×640 + rotation check, unit tests from [13-testing-strategy.md](13-testing-strategy.md), build release APK, commit APK | 20 min |

P0 is 5 minutes longer than a native project would need because NativeWind and the first prebuild + Gradle build take time. Doing the first APK build in P0 surfaces toolchain problems (JDK, Android SDK) early instead of at 14:50.

If time runs short, cut in this order: dark theme, P6 realtime (keep 10 s polling), PlayerHistory screen, Share button, in-app PDF view (use the system-viewer fallback in [09-key-flows.md](09-key-flows.md) §Receipt). Never cut P5 (offline is 4 scripted + desk points — see [08-offline-sync-and-tolerance.md](08-offline-sync-and-tolerance.md)).

Reference points for each phase:
- P0–P1: [02-tech-stack-and-project-structure.md](02-tech-stack-and-project-structure.md), [04-navigation.md](04-navigation.md), [11-security.md](11-security.md), [14-build-and-delivery.md](14-build-and-delivery.md)
- P2–P4: [06-data-persistence.md](06-data-persistence.md), [07-networking-and-api.md](07-networking-and-api.md), [09-key-flows.md](09-key-flows.md)
- P5: [08-offline-sync-and-tolerance.md](08-offline-sync-and-tolerance.md)
- P6: [07-networking-and-api.md](07-networking-and-api.md) §Realtime
- P7: [12-ui-and-hci.md](12-ui-and-hci.md), [13-testing-strategy.md](13-testing-strategy.md), [14-build-and-delivery.md](14-build-and-delivery.md)
