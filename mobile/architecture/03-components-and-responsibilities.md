# Components and Responsibilities

Part of [the mobile architecture doc set](index.md). These are the concrete modules behind the boxes in [01-architecture-overview.md](01-architecture-overview.md)'s layer diagram, placed in the folder tree from [02-tech-stack-and-project-structure.md](02-tech-stack-and-project-structure.md). All live under `mobile/src/`.

| Component | Responsibility | Talks to |
| --- | --- | --- |
| `data/container.ts` | Creates singletons once (DB, axios client, repositories, monitors) and exports them | everything |
| `settingsStore` | `serverBaseUrl` (default `http://10.0.2.2:8080`), `deviceId` (generated once: `dev-<uuid>`), last tenant theme | `expo-sqlite/kv-store` |
| `sessionStore` | Save/load/delete the JWT in `expo-secure-store` (key `nascon_jwt`); save session JSON (user, role, tenant) in kv-store; push `session` into the Zustand `appStore` | expo-secure-store, kv-store |
| `sessionRepository` | login, logout, current session, 401 handling | API, sessionStore |
| `connectivityMonitor` | Combine NetInfo (`isConnected`) + `healthPinger` into `netState` = `online` / `offline` / `syncing(n)` in `appStore` | NetInfo, healthPinger, syncRepository |
| `healthPinger` | `GET /health` every 15 s while the app is in the foreground (`AppState === "active"`) and a network exists; 3 s timeout. `/health` is not rate limited. | axios (separate instance, no auth) |
| `fixturesRepository` | League list, fixtures per league; cache in SQLite | API, DB |
| `standingsRepository` | Standings per league; cache whole response | API, DB |
| `matchRepository` | Score projection + event timeline; cache; apply realtime triggers; merge pending local events for display | API, DB, liveUpdatesClient |
| `sportRepository` | Sport config (scoring events, model, periods); cache | API, DB |
| `clubRepository` | Club profile, roster, staff, venue, stats; cache | API, DB |
| `rosterRepository` | Squads per league, player history, `audit_count` for base_version | API, DB |
| `storeRepository` | Products, variants, inventory, pinned products | API, DB |
| `cartRepository` | Local cart lines | DB |
| `receiptRepository` | Decode `pdf_base64`, save `receipts/{order_id}.pdf` in the app's document directory, "Download" to a user-picked folder, "Share" via share sheet | expo-file-system, expo-sharing |
| `syncRepository` | CRUD on `pending_actions`, `sync_results`; build spec §5.14 request | DB, API |
| `enqueueOfflineAction` | Build an action in exact spec §5.14 format; if online try direct send first, else (or on network failure) insert into queue; request a sync | syncRepository, syncScheduler |
| `syncPendingActions` | Batch up to 100 actions, POST offline-sync, map results, move to `sync_results`, refresh affected match/player | syncRepository, match/rosterRepository |
| `syncScheduler` | Single-flight runner: at most one sync at a time; retries with exponential backoff (2, 4, 8 … max 60 s) while online; triggers listed in [08-offline-sync-and-tolerance.md](08-offline-sync-and-tolerance.md) §Sync triggers | syncPendingActions, appStore |
| `liveUpdatesClient` | One WebSocket per app session; subscribe to visible match; reconnect with backoff; emits `LiveMessage` | WebSocket, matchRepository, storeRepository |
| `roleCapabilities` | Pure function `(session) => capabilities` (`canScore(leagueId)`, `canManageRoster(clubId)`, `canBuy`, ...) | UI |
| `errorMessages` | Map `AppError` / error code -> plain-language string | UI |
| `appStore` (Zustand) | App-wide state: `session`, `netState`, `pendingCount`, `tenantTheme` | UI, sessionStore, connectivityMonitor |
| `toastStore` (Zustand) | Queue of one-off success/error messages shown by the `Toast` component | UI |

Related detail:
- Offline queue mechanics (`enqueueOfflineAction`, `syncPendingActions`, `syncScheduler`) are in [08-offline-sync-and-tolerance.md](08-offline-sync-and-tolerance.md).
- Networking components (interceptors, `liveUpdatesClient` protocol) are in [07-networking-and-api.md](07-networking-and-api.md).
- Storage backing each repository is in [06-data-persistence.md](06-data-persistence.md).
- `roleCapabilities` output and the UI role matrix are in [04-navigation.md](04-navigation.md).
- `errorMessages` full code table is in [10-error-handling.md](10-error-handling.md).
