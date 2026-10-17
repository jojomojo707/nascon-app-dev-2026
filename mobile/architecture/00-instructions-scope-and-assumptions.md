# Instructions, Scope, Requirements Mapping, and Assumptions

Part of [the mobile architecture doc set](index.md). Place the whole `mobile/architecture/` directory under `mobile/`.

## Instructions for Claude Code

1. Build exactly what this doc set describes. Do not add features not listed here.
2. Never branch on a sport name or event name (`"football"`, `"goal"`, ...) anywhere. Branch only on `scoring_model` (`event` / `innings` / `round`). Sport event lists always come from the sport config JSON. (§9.4 of the spec: −8 penalty.)
3. Never put `DAY1_SALT` in the app. The app never computes signatures.
4. Offline action JSON must match spec §5.14 byte for byte in field names. See [08-offline-sync-and-tolerance.md](08-offline-sync-and-tolerance.md).
5. Output APK must land at `mobile/release/app-release.apk`, installable on API 29+.
6. Follow the build order in [15-build-order.md](15-build-order.md). Commit and push after each phase (push windows: 11:45–12:45, 12:45–13:45, 13:45–14:45 PKT; final push before 15:05:00).
7. If a backend endpoint this app needs does not exist yet, keep the route constant in `src/data/api/routes.ts` and continue. Do not invent a different shape.
8. The stack is React Native (Expo, TypeScript). Use only the libraries listed in [02-tech-stack-and-project-structure.md](02-tech-stack-and-project-structure.md); add Expo/RN libraries with `npx expo install`.

## Scope

| In scope (mobile) | Out of scope (mobile) |
| --- | --- |
| The 9 required screens of spec §8.2 (routes in [04-navigation.md](04-navigation.md)) | Backend implementation (Node, separate doc) |
| Offline cache + persistent action queue + sync ([08-offline-sync-and-tolerance.md](08-offline-sync-and-tolerance.md), NFR-4) | iOS |
| Secure token storage, role-aware UI (NFR-5, FR-5.1) | Fixture generation, standings computation, signatures (server only) |
| Realtime score + pinned product updates | Admin config screens (sport creation, league setup) |
| Mock-gateway checkout + receipt view/download | Offline checkout |

Grading that touches the app: Offline (4 pts, desk check spec §8.4 + `/offline-sync` script) and UI/HCI (10 pts, judges spec §8.6). The app is also the demo surface for everything else.

## Functional requirements mapped to the app

| Spec ID | What the app must do | Screen(s) |
| --- | --- | --- |
| FR-1.1 | Show live scores computed by server from event log; render by `scoring_model`; list scoring event types from sport config; append score + compensating events | Match detail, Scoring entry |
| FR-1.3 | Show fixtures with status (Upcoming, In-Progress, Completed, Postponed, Abandoned, Cancelled) and time; status changes arrive in realtime | Fixtures, Match detail |
| FR-1.4 | Show points table with qualification status (clinched / eliminated / still possible) | Standings |
| FR-2.1 | Club profile: home venue coordinates, socials, historical stats, roster, staff; tenant logo, colors, name applied | Club profile, global theme |
| FR-2.2 | Club Manager: transfer / loan / release a player; show audit history | Roster management |
| FR-2.3 | Catalogue, variant picker, discount code, cart, checkout via mock gateway, receipt PDF view/download; pinned product on match page updates in realtime | Store, Match detail |
| FR-5.1 | Five roles; each role sees only what it can use | Navigation, all screens |

## Non-functional requirements mapped to the app

| Spec ID | Mobile acceptance | Where |
| --- | --- | --- |
| NFR-4 | Cache fixtures, standings, profiles in SQLite (`expo-sqlite`). Queue scoring + roster actions persistently. Survive force-close. Auto sync with per-action results. | [06-data-persistence.md](06-data-persistence.md), [08-offline-sync-and-tolerance.md](08-offline-sync-and-tolerance.md) |
| NFR-5 | Token in Android Keystore (via `expo-secure-store`). No secrets in APK. Input validation. Respect server rate limit (429 + Retry-After). Server is the RBAC authority. | [11-security.md](11-security.md) |
| NFR-3 | App must not cause double orders: client-generated `order_id` reused on retry (idempotent). | [09-key-flows.md](09-key-flows.md) §Checkout |
| NFR-7 | N/A to app, except: server address configurable in-app. | [07-networking-and-api.md](07-networking-and-api.md) §Base URL |

## Constraints

| Constraint | Source | Impact |
| --- | --- | --- |
| Android 10+ (API 29) | spec §8.1 | APK must install on API 29+ (Expo's default `minSdkVersion` is lower, which is fine) |
| Backend at `http://<host>:8080`, plain HTTP | spec §5.2, §8.1 | Cleartext must be allowed via `expo-build-properties` ([14-build-and-delivery.md](14-build-and-delivery.md)) or the release app cannot reach the backend |
| Emulator `10.0.2.2:8080`, phone uses laptop LAN IP | spec §8.1 | Editable server address in Settings and on Login |
| `/api/v1/*` limited to 100 req / 10 s per IP | spec §5.2, §5.13 | Debounced refresh, no aggressive polling, 429 handling |
| No Firebase / Supabase / Amplify | spec §1.1 | No FCM, no Firebase Auth, no Crashlytics |
| No hosted build/update services | spec §1.1 spirit + offline demo | No EAS Build / EAS Update / Expo push; APK built locally |
| Small phone 360×640 dp, rotation | spec §8.6 area 5 | All layouts scroll; `app.json` `orientation: "default"` (the Expo template ships `"portrait"`, change it) |
| Tap targets ~48 dp, no color-only meaning | spec §8.6 area 4 | NativeWind `min-h-12` (48 dp) on every pressable; icon + text on every status |
| ~3.5 hours of build time | Event schedule | Single Expo app, module singletons instead of a DI framework, no custom native code |

## Assumptions and Ambiguities

These are the resolved decisions for every place the spec was silent or unclear. Treat them as binding unless the spec is updated.

| # | Ambiguity in spec | Decision |
| --- | --- | --- |
| A1 | Task refers to "attached guidelines"; only the problem spec was provided. | The problem spec is treated as the guidelines. |
| A2 | The contract (spec §5) defines only `/audit/v1/*` grader routes. There are no routes for login, listing leagues/fixtures, club profile, product catalogue, or realtime. The app needs these. | [07-networking-and-api.md](07-networking-and-api.md) §Endpoint table proposes a minimal `/api/v1/*` set. Bodies reuse spec §5 shapes wherever a §5 route exists. Backend team must implement them as thin authenticated wrappers over the same services. Marked **PROPOSED**. |
| A3 | Realtime protocol (WebSocket vs SSE, message format) unspecified. | WebSocket, message format in [07-networking-and-api.md](07-networking-and-api.md) §Realtime (**PROPOSED**). Fallback: polling. |
| A4 | Which roles may buy from the store. | All signed-in roles may buy. Judge task B does not name a role. |
| A5 | Cart persistence. | Cart is local-only (SQLite). Server sees only the final checkout `items`. |
| A6 | Checkout while offline. | Not supported. Buy button disabled offline with a plain-language reason. Queueing payments would break NFR-3 guarantees. |
| A7 | Who pins products on a match. | Not part of required mobile screens. App only displays pinned products and reacts to updates. |
| A8 | `base_version` when the app never fetched that match/player. | Send `0`. Per spec §5.14, `0 ≤ current` always, so the server answers `rebased_append` (never `INVALID_BASE_VERSION`). |
| A9 | How the app learns role, tenant, owned league/club/player. | From the login response ([07-networking-and-api.md](07-networking-and-api.md) §Endpoint table). The app does not decode JWT claims (claim names are free per spec §5.13). |
| A10 | Tenant branding fields. | Login response includes `tenant {name, logo_url, primary_color, secondary_color}`. Super-admin has no tenant: default theme. |
| A11 | Plain HTTP vs OWASP "secure transport". | Cleartext allowed because the judged backend runs on plain HTTP on a LAN. Documented trade-off in [11-security.md](11-security.md). |
| A12 | Match statuses Postponed / Abandoned / Cancelled appear in FR-1.3 but `/score` only derives upcoming / in_progress / completed. | Fixtures list shows whatever status the fixtures endpoint returns. App supports all 6 values for display. |
| A13 | Spec §8.2 says Roster management can "**add** / transfer / loan / release" a player, but the roster contract (§5.11) only accepts `type` ∈ `transfer`, `loan`, `release`; there is no "add" route or shape. | **Open.** Not built. Raise in writing with the organizers before 13:00 PKT (spec §9.5). Do not invent an add endpoint. |
| A14 | Background sync (sync while the app is closed). Spec §8.4 step 5 only needs automatic sync when the network returns (or an obvious Sync button). | Sync runs while the app is in the foreground: on app start, on Offline → Online, after each enqueue, on resume, and on "Sync now". No background task. See [08-offline-sync-and-tolerance.md](08-offline-sync-and-tolerance.md). |
