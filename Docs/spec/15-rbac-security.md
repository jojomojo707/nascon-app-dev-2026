# 15 — RBAC, Probe Routes & API Security

Scope: `POST /audit/v1/rbac-matrix`, the 7 probe routes, the expected allow/deny matrix, JWT rules, rate limit probe, input-validation and body-size probes. Product-level requirement: FR-5.1 / NFR-5 in [02-functional-and-nonfunctional-requirements.md](02-functional-and-nonfunctional-requirements.md). Ids come from the seed in [07-reset-seed-health.md](07-reset-seed-health.md).

## POST /audit/v1/rbac-matrix
No body, no auth. Response 200:
```json
{
  "tokens": { "super_admin": "<jwt>", "league_organizer": "<jwt>", "club_manager": "<jwt>",
              "player": "<jwt>", "viewer": "<jwt>" },
  "context": { "tenant_id": "tenant-alpha", "foreign_tenant_id": "tenant-beta",
               "own_league_id": "league-alpha-1", "other_league_id": "league-alpha-2",
               "foreign_league_id": "league-beta-1",
               "own_club_id": "club-alpha-1", "other_club_id": "club-alpha-2", "foreign_club_id": "club-beta-1",
               "own_player_id": "player-alpha-1", "other_player_id": "player-alpha-2",
               "foreign_player_id": "player-beta-1" }
}
```
- Tokens are JWTs valid for **at least 1 hour**, sent as `Authorization: Bearer <jwt>`.
- All non-super-admin tokens belong to `tenant-alpha`. League organizer owns only `league-alpha-1`; club manager owns only `club-alpha-1`; player is `player-alpha-1`; viewer has read-only access inside tenant-alpha; super admin is platform-wide.
- JWT claim names are your choice (grader treats tokens as opaque). **Signature must be verified**; `alg: none`, tampered signature, or expired → **401**.

## Probe routes
They only **authorize**; no mutation; body not validated (grader sends `{}` on POST/PATCH).
- Allowed → `200 {"authorized":true}`.
- Denied → `403` standard error body, `code = FORBIDDEN`.
- Missing/invalid token → `401` (`UNAUTHENTICATED`).

| # | Route | Path variable |
| --- | --- | --- |
| P1 | `POST /audit/v1/rbac/tenants` | — |
| P2 | `POST /audit/v1/rbac/leagues/{league_id}/fixtures` | league |
| P3 | `POST /audit/v1/rbac/clubs/{club_id}/roster` | club |
| P4 | `POST /audit/v1/rbac/clubs/{club_id}/products` | club |
| P5 | `PATCH /audit/v1/rbac/players/{player_id}` | player |
| P6 | `GET /audit/v1/rbac/clubs/{club_id}` | club |
| P7 | `GET /audit/v1/rbac/platform/config` | — |

## Expected matrix (A = allowed → 200; D = denied → exactly 403)

| Probe (target) | Super Admin | Organizer | Club Mgr | Player | Viewer |
| --- | --- | --- | --- | --- | --- |
| P1 | A | D | D | D | D |
| P2 own league | A | A | D | D | D |
| P2 other league (same tenant) | A | D | D | D | D |
| P2 foreign league | A | D | D | D | D |
| P3 / P4 own club | A | D | A | D | D |
| P3 / P4 other club (same tenant) | A | D | D | D | D |
| P3 / P4 foreign club | A | D | D | D | D |
| P5 own player | A | D | A (own club's players) | A (self only) | D |
| P5 other player (other club) | A | D | D | D | D |
| P5 foreign player | A | D | D | D | D |
| P6 own club / other club (tenant-alpha) | A | A | A | A | A |
| P6 foreign club | A | D | D | D | D |
| P7 | A | D | D | D | D |

Note: the P5 "own player" row was garbled in the source conversion; the values above are reconstructed from the printed sequence `D, A (own club's players), A (self only), D` for Organizer / Club Mgr / Player / Viewer and are consistent with the role descriptions.

### Rules
- Cross-tenant access by a non-super-admin is **always 403 (not 404)**. 404 is reserved for ids that do not exist at all.
- **Authorization is evaluated before anything else** about the request.
- RBAC must be a DB policy matrix or policy-as-code layer with negative tests for every role boundary.

## Additional security probes

| Probe | Expected |
| --- | --- |
| P7 with no Authorization header | 401 `UNAUTHENTICATED` |
| P7 with a super-admin token whose signature was altered, or with `alg: none` | 401 `UNAUTHENTICATED` |
| Rate limit: 150 requests to `GET /api/v1/ping` within 5 s from one client | First request 200 `{"pong":true}`; **at least 40 of the 150 return 429** (`RATE_LIMITED`) with a `Retry-After` header; 11 s later a request is 200 again |
| Input validation: `sport_id = x'; DROP TABLE sports;--`, or a `customer_id` containing quotes/`<script>` | Never a 5xx. Sport id → 400 `VALIDATION_ERROR`. Strings are stored/returned as plain data. |
| Body larger than 1 MB to any `/audit/v1/*` POST | 413 `PAYLOAD_TOO_LARGE` |

Rate limit scope: `/api/v1/*` only — 100 requests per rolling 10 s per client IP. `/audit/v1/*` and `/health` are exempt.

## Mobile-side security
Secure token storage (Android Keystore / iOS Keychain) is mandatory — see [18-mobile-app.md](18-mobile-app.md).
