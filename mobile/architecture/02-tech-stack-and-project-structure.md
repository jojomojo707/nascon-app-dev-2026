# Technology Stack and Project Structure

Part of [the mobile architecture doc set](index.md). Pattern rationale is in [01-architecture-overview.md](01-architecture-overview.md).

## Technology Stack

React Native app built with **Expo** (open-source toolkit around React Native), written in **TypeScript**. The APK is built **locally** (no Expo cloud services).

**Versions:** create the project with `npx create-expo-app@latest` and add every Expo/React Native library with `npx expo install <package>` (not plain `npm install`). That command picks the version that matches the project's Expo SDK, so there are no exact pins here. Plain JS libraries (axios, zod, zustand, drizzle-orm) use `npm install`.

| Concern | Choice | Why |
| --- | --- | --- |
| Language | TypeScript | Type checks catch wrong field names in the §5.14 offline JSON before runtime |
| Framework | Expo (managed workflow + `npx expo prebuild`) | Fast setup; native modules (SQLite, secure store, PDF) autolink; no hand-edited Android project |
| Navigation | Expo Router (file-based, built on React Navigation) | Default in the Expo template; bottom tabs + stack + correct Android back button out of the box (HCI area 1) |
| Styling | NativeWind (Tailwind CSS classes for React Native) | Consistent spacing/colour tokens from one `tailwind.config.js`; tenant colours via CSS variables (see [12-ui-and-hci.md](12-ui-and-hci.md)) |
| Icons | `@expo/vector-icons` (MaterialCommunityIcons set) | Bundled with Expo |
| Local DB | `expo-sqlite` + Drizzle ORM (`drizzle-orm/expo-sqlite`, `drizzle-kit` for migrations) | Spec §8.4 / NFR-4 asks for a local SQLite database. Drizzle's `useLiveQuery` re-renders a screen when its rows change, so screens read from the DB and refreshes write into it |
| Small key-value settings | `expo-sqlite/kv-store` | Server URL, `device_id`, cached session JSON; same SQLite file, no extra library |
| Global app state | Zustand | Tiny store for `session`, `netState`, `pendingCount`, `tenantTheme`, toast messages |
| Secret storage | `expo-secure-store` | On Android, values are encrypted with a key held in the **Android Keystore**, as spec §8.1 / NFR-5 requires. Holds the JWT only |
| HTTP | axios | Request/response interceptors map 1:1 to the chain in [07-networking-and-api.md](07-networking-and-api.md) |
| Validation | zod | Validates server responses and builds the §5.14 action shape with runtime checks |
| Realtime | Built-in React Native `WebSocket` | No library needed; spec allows WebSocket/SSE |
| Connectivity | `@react-native-community/netinfo` + own `/health` ping | NetInfo says "a network exists"; the ping says "the backend is reachable" |
| App foreground/background | React Native `AppState` | Pause health ping and socket in background, trigger sync on resume |
| IDs | `expo-crypto` (`randomUUID()`) | `evt-`, `act-`, `ord-`, `tr-` ids |
| Images | `expo-image` | Tenant logo, product images, with caching |
| Date picker | `@react-native-community/datetimepicker` | Roster effective / loan-end dates |
| PDF view | `react-native-pdf` (+ its peer `react-native-blob-util`) | In-app receipt view. Fallback if it fails to build: open the saved file in the system PDF viewer with `expo-intent-launcher` (see [09-key-flows.md](09-key-flows.md) §Receipt) |
| Files / share | `expo-file-system`, `expo-sharing` | Save receipt PDF, "Download" to a user-picked folder, "Share" |
| Native build settings | `expo-build-properties` | Allows cleartext HTTP to the LAN backend (see [14-build-and-delivery.md](14-build-and-delivery.md)) |
| Tests | Jest (`jest-expo` preset), React Native Testing Library, `axios-mock-adapter` | See [13-testing-strategy.md](13-testing-strategy.md) |

Explicitly not used: Firebase anything (spec §1.1), **any Expo cloud service** (EAS Build, EAS Update, Expo push notifications), Redux, a DI framework, background-task libraries (see [08-offline-sync-and-tolerance.md](08-offline-sync-and-tolerance.md) §Sync triggers for why), Expo Go for testing (native modules like `react-native-pdf` need a development build).

## Project / Folder Structure

A single Expo app under `mobile/`. Routes live in `app/` (Expo Router convention); everything else lives in `src/`, grouped by layer.

```
mobile/
  architecture/                       <- this doc set
  app.json                            <- Expo config (package name, orientation, plugins, allowBackup)
  package.json, package-lock.json, tsconfig.json
  babel.config.js, metro.config.js    <- NativeWind + inline .sql import for Drizzle migrations
  tailwind.config.js, global.css      <- design tokens (see 12-ui-and-hci.md)
  drizzle.config.ts                   <- drizzle-kit config (dialect sqlite, driver expo)
  drizzle/                            <- generated SQL migrations (commit them)
  scripts/build-apk.sh                <- prebuild + Gradle + copy APK (see 14-build-and-delivery.md)
  release/app-release.apk             <- committed build output
  android/                            <- generated by `expo prebuild`; do not hand-edit; gitignored
  app/                                <- Expo Router screens (one file = one route, see 04-navigation.md)
    _layout.tsx                       <- root: run migrations, load session, theme, ConnectivityBanner
    index.tsx                         <- splash / redirect
    login.tsx, settings.tsx
    (tabs)/_layout.tsx                <- bottom bar
    (tabs)/fixtures.tsx, standings.tsx, store.tsx, club.tsx, more.tsx
    match/[matchId]/index.tsx, match/[matchId]/scoring.tsx
    product/[productId].tsx, cart.tsx, checkout.tsx
    receipt/[orderId].tsx, orders.tsx
    roster/[clubId].tsx, player/[playerId].tsx, sync.tsx
  src/
    core/
      model/      role.ts, matchStatus.ts, scoringModel.ts, money.ts
      error/      appError.ts, errorMessages.ts (code -> plain language)
      time/       isoTime.ts (YYYY-MM-DDTHH:MM:SSZ formatter)
      ids/        idFactory.ts (evt-, act-, ord-, tr- ids)
    data/
      container.ts                    <- creates db, api client, repositories once (module singletons)
      db/         client.ts (openDatabaseSync + drizzle), schema.ts (Drizzle tables)
      api/        client.ts (axios + interceptors), routes.ts, schemas/* (zod DTOs)
      realtime/   liveUpdatesClient.ts, liveMessage.ts
      security/   sessionStore.ts (expo-secure-store)
      settings/   settingsStore.ts (kv-store)
      network/    connectivityMonitor.ts, healthPinger.ts
      repo/       sessionRepository, fixturesRepository, standingsRepository,
                  matchRepository, sportRepository, clubRepository,
                  rosterRepository, storeRepository, cartRepository,
                  receiptRepository, syncRepository
      sync/       syncScheduler.ts
    domain/
      enqueueOfflineAction.ts, syncPendingActions.ts, checkout.ts, roleCapabilities.ts
    state/        appStore.ts (Zustand), toastStore.ts
    ui/
      theme/      tenantTheme.ts, tokens.ts
      components/ ConnectivityBanner, StatusChip, EmptyState, ErrorState,
                  LoadingState, ConfirmDialog, MoneyText, PendingBadge,
                  PrimaryButton, SectionHeader, Toast, BottomSheet
      hooks/      useScreenState.ts, one use<Screen>Screen.ts per screen
  __tests__/                          <- Jest unit tests (or *.test.ts next to the file)
```

Component responsibilities for each module named above are in [03-components-and-responsibilities.md](03-components-and-responsibilities.md).
