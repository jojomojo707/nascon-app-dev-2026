# Networking and API Integration

Part of [the mobile architecture doc set](index.md). Endpoint shapes marked **PROPOSED** are resolutions of assumption A2 in [00-instructions-scope-and-assumptions.md](00-instructions-scope-and-assumptions.md) — the binding `Docs/spec/` only defines `/audit/v1/*` grader routes; these are the minimal `/api/v1/*` wrapper set the app needs.

## Base URL

- Stored in `settingsStore.serverBaseUrl` (kv-store). Default `http://10.0.2.2:8080`.
- Settings field validates `http(s)://host[:port]`; "Test connection" button calls `/health` and shows "Connected" or "Can't reach server at 192.168.1.5:8080".
- One axios instance is created in `src/data/api/client.ts`. The base URL is **not** fixed at creation: a request interceptor sets `config.baseURL` from the current setting on every request, so changing the server needs no restart.

## axios interceptor chain (order)

Request interceptors (run before sending):
1. **Base URL**: set `config.baseURL` from `settingsStore`.
2. **Rate-limit gate**: if `blockedUntil` (from a previous 429) is in the future, reject immediately with `AppError` `RateLimited(retryAfterSec)` instead of sending.
3. **Auth**: add `Authorization: Bearer <jwt>` for `/api/v1/*` except `/api/v1/auth/login`.

Response interceptors (run on the reply):
4. **429**: read the `Retry-After` header (seconds), set `blockedUntil = now + retryAfter`, reject with `RateLimited`.
5. **401**: clear the session, `router.replace("/login")`, toast "Your session expired. Please sign in again."
6. **Everything else**: convert to `AppError` (see [10-error-handling.md](10-error-handling.md)).

Timeout: `timeout: 10000` ms on the instance (server limit is 5 s per request, 10 s for burst). axios has no separate connect timeout; the health ping uses its own instance with `timeout: 3000`.

## Endpoint table

Routes live in `src/data/api/routes.ts` only. Bodies marked "= §x" reuse the `Docs/spec/` contract shape exactly.

| Method & path | Status | Request | Response | Used by |
| --- | --- | --- | --- | --- |
| `GET /health` | contract §5.4 | | `{"status":"ok"}` | healthPinger, Settings test |
| `POST /api/v1/auth/login` | **PROPOSED** | `{email, password}` | `{token, expires_at, user:{user_id, email, display_name, role, tenant_id, league_ids[], club_id, player_id}, tenant:{tenant_id, name, logo_url, primary_color, secondary_color}}` | Login |
| `GET /api/v1/leagues` | **PROPOSED** | | `[{league_id, name, sport_id, tenant_id, season}]` | Fixtures, Standings selector |
| `GET /api/v1/leagues/{league_id}/fixtures` | **PROPOSED** | | `[{match_id, home:{team_id,name}, away:{team_id,name}, scheduled_at, venue, status}]` | Fixtures |
| `GET /api/v1/standings/{league_id}` | **PROPOSED** | | = §5.10 response + `team_names` map | Standings |
| `GET /api/v1/sports/{sport_id}` | **PROPOSED** | | = §5.6 stored config | Scoring entry, score rendering |
| `GET /api/v1/matches/{match_id}/score` | **PROPOSED** | | = §5.9 score response | Match detail |
| `POST /api/v1/events` | **PROPOSED** | = §5.9 request | = §5.9 event response | Scoring entry (online) |
| `GET /api/v1/matches/{match_id}/pinned-products` | **PROPOSED** | | `[{product_id, name, image_url, price_minor}]` | Match detail |
| `GET /api/v1/clubs` | **PROPOSED** | | `[{club_id, name, logo_url}]` (caller's tenant) | Club list |
| `GET /api/v1/clubs/{club_id}` | **PROPOSED** | | `{club_id, name, logo_url, home_venue:{name, lat, lng}, socials:{}, staff:[{name, role}], roster:[{player_id, name, position, role, squad_id, league_id}], season_stats:[{season, played, won, drawn, lost}]}` | Club profile |
| `GET /api/v1/leagues/{league_id}/squads` | **PROPOSED** | | `[{squad_id, club_id, name, size}]` | Roster mgmt destination picker |
| `POST /api/v1/roster/transfer` | **PROPOSED** | = §5.11 request | = §5.11 response | Roster mgmt (online) |
| `GET /api/v1/roster/history/{player_id}` | **PROPOSED** | | = §5.11 history | Player history, base_version |
| `GET /api/v1/products` | **PROPOSED** | | `[{product_id, name, description, image_url, variants:[{variant_id, label, price_minor, stock}]}]` | Store |
| `GET /api/v1/inventory/{variant_id}` | **PROPOSED** | | = §5.12 inventory | Variant stock refresh |
| `POST /api/v1/checkout` | **PROPOSED** | = §5.12 request | = §5.12 response | Checkout (see [09-key-flows.md](09-key-flows.md)) |
| `POST /api/v1/offline-sync` | **PROPOSED**, must be backed by identical code to §5.14 | = §5.14 request | = §5.14 response | syncPendingActions (see [08-offline-sync-and-tolerance.md](08-offline-sync-and-tolerance.md)) |
| `GET /api/v1/ws?token=<jwt>` (WebSocket upgrade) | **PROPOSED** | | messages below | liveUpdatesClient |

Backend note: `/api/v1/*` shares the 100 req / 10 s limit with `/api/v1/ping`. The app's normal usage is well under 1 req/s.

## DTO rules

- Every response is parsed with a zod schema in `src/data/api/schemas/`. Use `.passthrough()` (unknown keys are kept, not rejected) and `.nullish()` for optional fields, so a backend that adds fields never breaks the app.
- Opaque/nested server objects (`payload`, sport `config`, standings `h2h`) are typed `Record<string, unknown>` and stored as JSON text.
- Money is an integer `number` in minor units (safe: well under 2^53). Display: `formatMoney(450000) = "PKR 4,500.00"`.
- Timestamps are strings in `YYYY-MM-DDTHH:MM:SSZ`; parse with `new Date(str)`. For sending, `isoNowUtc()` returns `new Date().toISOString()` with the milliseconds removed (`2026-10-17T11:00:00.123Z` → `2026-10-17T11:00:00Z`).
- Ids generated client-side match `^[A-Za-z0-9_.:-]{1,64}$`: `evt-<uuid>`, `act-<uuid>`, `ord-<uuid>`, `tr-<uuid>` (UUID is 36 chars, total under 64).

## Realtime (PROPOSED protocol)

Client to server after connect:
```json
{"action":"subscribe","match_id":"m1"}
{"action":"unsubscribe","match_id":"m1"}
```
Server to client:
```json
{"type":"match.score_updated","match_id":"m1","version":7}
{"type":"match.status_changed","match_id":"m1","status":"in_progress"}
{"type":"match.product_pinned","match_id":"m1","product_id":"prod-jersey-001"}
```

Connection: `new WebSocket(baseUrl.replace(/^http/, "ws") + "/api/v1/ws?token=" + jwt)` (React Native's built-in `WebSocket`).

Handling: messages are triggers, not data. On `score_updated` or `status_changed`, `matchRepository` refetches `/score` once (debounced 300 ms, skipped if cached `version` ≥ message version). On `product_pinned`, refetch pinned products. The event log on the server stays the only source of truth.

Reconnect: backoff 1, 2, 4, 8, max 15 s, only while `netState === "online"` and the app is in the foreground (close the socket when `AppState` goes to background, reopen on resume). While socket is down and Match detail is visible, poll `/score` every 10 s. Match detail shows a small "Live" / "Reconnecting..." label.
