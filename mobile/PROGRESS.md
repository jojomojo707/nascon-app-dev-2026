# Mobile progress (NaSCon '26 Part I)

Expo SDK 58 / React Native 0.88 app in `mobile/`. Routes live in `mobile/src/app/` (Expo Router; the SDK 58 template uses `src/app`).

## Done
- P0: Expo project, Expo Router, 5 bottom tabs (Fixtures, Standings, Store, Club, More), `app.json` (orientation default, cleartext via expo-build-properties, allowBackup false, minSdk 29), `scripts/build-apk.sh`.
- P1: Login (email/password, show/hide, demo-account shortcuts, server link), Settings (editable server URL + "Save and test connection", sign out, super-admin "Create demo content" → `POST /api/v1/demo/seed`), JWT in expo-secure-store (Android Keystore), axios client with interceptors (base URL per request, 429 gate with Retry-After, bearer auth, 401 → login), connectivity monitor (NetInfo + `/health` ping every 10 s) and always-visible ConnectivityBanner (Online / Offline · n pending / Syncing / n not applied; icon + text).
- P2: SQLite cache (expo-sqlite) for leagues, fixtures, standings, sport config, score, pinned products, clubs, club profile, squads, history, products. Fixtures, Standings (horizontal table + qualification chips with icon + text + legend), Match detail (big score by `scoring_model`, Live chip, timeline with Corrected/Pending labels, pinned products), Club profile (venue + Open in Maps, socials, staff, roster by position, season stats).
- P3: Store (catalogue, variant picker with stock hints, cart in SQLite, checkout with test-card picker + WELCOME10 preview + confirm dialog + idempotent `order_id` reused on retry, receipt PDF saved to app storage, opened in the system PDF viewer, Share/Save via share sheet, local orders list).
- P4: Scoring entry (buttons generated from `scoring_events`, start/end with confirm, tie-break winner, correction with reason → `compensation`), Roster management (transfer / loan / release bottom sheet, destination squad picker, date validation, confirm dialog, deferred_until_match_end message), Player history.
- P5: Persistent offline queue (`pending_actions` table) in EXACT Docs/spec/16 format, single-flight sync to `POST /api/v1/offline-sync` (on enqueue, offline→online, app start, Sync now), per-action results (Synced / Already synced / Not applied + plain-language reason), queue cleared, SENDING rows reset on restart.
- P6 (reduced): realtime via 10 s polling of `/score` on Match detail (cut order allows this); WebSocket not built.
- Tests: `npx jest` → 3 suites, 15 tests (queue format, error-code coverage, formatMoney, labels, URL).

## In progress
- Release APK build.

## To do
- Device smoke test against the live backend once `/api/v1/*` routes exist.

## Decisions (logged; deviations from mobile/architecture under time pressure)
- Styling: React Native `StyleSheet` + one tokens file (`src/ui/theme.ts`) instead of NativeWind (avoids Babel/Tailwind setup risk). Tenant colours are applied from the login response; contrast-safe on-colour is computed.
- Local DB: expo-sqlite used directly (no Drizzle). Cached server responses live in a generic `cache(key, json, fetched_at)` table; queue in `pending_actions`, results in `sync_results`, cart in `cart_lines`, orders in `orders_local`. Screens re-read SQLite when a Zustand `dataVersion` counter is bumped after each write.
- No react-native-pdf / datetimepicker: receipt opens in the phone's PDF viewer (expo-intent-launcher), dates are typed as YYYY-MM-DD with validation.
- Realtime: polling every 10 s on Match detail instead of WebSocket.
- Login request lowercases the email.
- `customer_id` for checkout = session `user.user_id`.

## Blocked
- Nothing in the app. It depends on the backend `/api/v1/*` routes listed below.

## Backend routes the app depends on (PROPOSED shapes, mobile/architecture/07)
- `POST /api/v1/auth/login` `{email,password}` → `{token, expires_at, user:{user_id,email,display_name,role,tenant_id,league_ids,club_id,player_id}, tenant|null}`
- `GET /api/v1/leagues` → array of `{league_id,name,sport_id,tenant_id,season}`
- `GET /api/v1/leagues/{id}/fixtures` → array of `{match_id, home:{team_id,name}, away:{team_id,name}, scheduled_at, venue, status}` (home/away may also be plain team-id strings)
- `GET /api/v1/standings/{id}` → spec standings + optional `team_names`
- `GET /api/v1/sports/{id}` → sport config (bare or wrapped in `config`)
- `GET /api/v1/matches/{id}/score` → spec score projection
- `GET /api/v1/matches/{id}/pinned-products` → array
- `POST /api/v1/events` → spec events body
- `GET /api/v1/clubs`, `GET /api/v1/clubs/{id}` (with `roster[].league_id` and `roster[].squad_id`, needed for roster actions)
- `GET /api/v1/leagues/{id}/squads` → `[{squad_id, club_id, name, size}]`
- `POST /api/v1/roster/transfer`, `GET /api/v1/roster/history/{player_id}`
- `GET /api/v1/products` → `[{product_id,name,description,image_url,variants:[{variant_id,label,price_minor,stock}]}]`
- `POST /api/v1/checkout`, `POST /api/v1/offline-sync`, `POST /api/v1/demo/seed`
- Lists may be bare arrays or wrapped (`items`/`data`/named key); both are accepted.

## Handoff
- Branch `worktree-agent-a31e36708aa3f7692`, worktree `/home/asad/repos/nascon-app-dev-2026/.claude/worktrees/agent-a31e36708aa3f7692`.
- Install: `cd mobile && npm install`. Typecheck: `npx tsc --noEmit`. Tests: `npx jest`.
- Build APK: `cd mobile && npm run build:apk` (uses JDK 17 from `~/.gradle/jdks` automatically, Android SDK at `~/Android/Sdk`; output `mobile/release/app-release.apk`; signed with the debug keystore). Install: `adb install -r mobile/release/app-release.apk`.
- After changing only JS, a faster rebuild: `cd mobile/android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a,x86_64 && cp app/build/outputs/apk/release/app-release.apk ../release/`.
- Demo: emulator server `10.0.2.2:8080`; a phone needs the laptop's LAN IP (Settings). Sign in as admin → Settings → "Create demo content" once before judging.
