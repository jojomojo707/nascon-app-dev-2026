# 04 — API Endpoint Index & Global Conventions

Scope: the autograder interface (`/audit/v1/*`) — endpoint map, request/response rules, status codes, error body shape. Read this before implementing any endpoint. All shapes are **binding**: field names, types, status codes and error codes are compared literally by the grader scripts.

Base URL: `http://localhost:8080`

## Endpoint index

| Method & path | Purpose | Detail file |
| --- | --- | --- |
| `GET /health` | Readiness probe (no auth) | [07](07-reset-seed-health.md) |
| `POST /audit/v1/reset` | Wipe state and seed baseline data | [07](07-reset-seed-health.md) |
| `POST /audit/v1/sports` | Create a "mystery sport" from JSON rules | [08](08-sports-config.md) |
| `POST /audit/v1/fixtures` | Generate round robin / swiss / single elim / double elim | [09](09-fixtures-round-robin-swiss.md), [10](10-fixtures-elimination.md) |
| `POST /audit/v1/leagues` | Register a league (teams, fixtures, points, tie-break config) | [11](11-leagues-events-scoring.md) |
| `POST /audit/v1/events` | Append a match event or compensating event (signed) | [11](11-leagues-events-scoring.md) |
| `GET /audit/v1/score/{match_id}` | Score projection rebuilt from the event log | [11](11-leagues-events-scoring.md) |
| `GET /audit/v1/standings/{league_id}` | Ordered table, H2H, clinched/eliminated | [12](12-standings.md) |
| `POST /audit/v1/roster/setup` | Create a roster scenario (league, squads, players) | [13](13-roster.md) |
| `POST /audit/v1/roster/transfer` | Transfer / loan / release with all rule checks | [13](13-roster.md) |
| `GET /audit/v1/roster/history/{player_id}` | Immutable audit trail + loan auto-return | [13](13-roster.md) |
| `POST /audit/v1/checkout` | Concurrency-safe purchase + signed PDF receipt | [14](14-store-checkout.md) |
| `GET /audit/v1/inventory/{variant_id}` | Current stock of a variant | [14](14-store-checkout.md) |
| `POST /audit/v1/rbac-matrix` | JWTs for all 5 roles + scenario ids | [15](15-rbac-security.md) |
| `/audit/v1/rbac/*` (7 probe routes) | Authorization probes used with those JWTs | [15](15-rbac-security.md) |
| `GET /api/v1/ping` | Rate-limit probe | [15](15-rbac-security.md) |
| `POST /audit/v1/offline-sync` | Replay queued offline actions, return conflict resolutions | [16](16-offline-sync.md) |

## Request / response rules

| Topic | Rule |
| --- | --- |
| Base URL / port | `http://localhost:8080`. All bodies JSON, UTF-8, `Content-Type: application/json`. |
| Authentication | `/audit/v1/*` routes need **no** Authorization header, **except** the RBAC probe routes ([15](15-rbac-security.md)), which require `Authorization: Bearer <jwt>`. |
| Identifiers | Strings, 1–64 chars from `A-Za-z0-9_.:-`. Never contain `\|`. Case-sensitive. Grader-chosen ids must be stored and returned **verbatim**. |
| Timestamps / dates | Timestamps: ISO 8601 UTC, `YYYY-MM-DDTHH:MM:SSZ`. Dates: `YYYY-MM-DD`. |
| Money | Integers in minor units (paisa). Currency is always `"PKR"`. 4500.00 PKR = `450000`. |
| Numbers | Integers where stated; otherwise JSON numbers. Net run rate is rounded to 3 decimals. |
| Unknown fields | Ignored. Missing required fields or wrong types → 400. |
| Validation order | 1) malformed JSON/schema → 400; 2) referenced id does not exist → 404; 3) business rule violated → 409 (or 402 for payment). **The first failing step wins.** |
| Idempotency | Where a request carries a client id (`event_id`, `order_id`, `request_id`, `action_id`), replaying the identical request returns the stored result (HTTP 200) and changes nothing. |
| Rate limiting | `/audit/v1/*` and `/health` are **exempt** (grader may send 200 req/s). `/api/v1/*` is limited to 100 requests per rolling 10 s per client IP ([15](15-rbac-security.md)). |
| Performance | Every request must finish within 5 s (reset within 10 s). The 20-request checkout burst must fully finish within 10 s. |
| Body size | Bodies larger than 1 MB → `413 PAYLOAD_TOO_LARGE`. |

## HTTP status codes used

| Code | Meaning in this contract |
| --- | --- |
| 200 | Success for reads, and for an idempotent replay of an earlier success. |
| 201 | A new resource/record was created or an action was applied for the first time. |
| 400 | Malformed JSON, schema violation, bad value (`VALIDATION_ERROR` and other 400 codes). |
| 401 | Missing, malformed, tampered, expired, or `alg:none` token. |
| 402 | Mock payment declined / capture failed (checkout only). |
| 403 | Authenticated but not allowed (role or tenant/ownership boundary). |
| 404 | A referenced id does not exist. |
| 409 | Business-rule or state conflict (illegal transition, out of stock, squad full, …). |
| 413 | Body too large. |
| 429 | Rate limit exceeded (`/api/v1/*` only). |

## Error body (all non-2xx responses)

```json
{
  "error": {
    "code": "OUT_OF_STOCK",
    "message": "Variant var-jersey-001-M has no stock left.",
    "details": { "variant_id": "var-jersey-001-M" }
  }
}
```

- `code`: UPPER_SNAKE_CASE string from the catalogue in [05-error-codes.md](05-error-codes.md); compared literally.
- `message`: free text.
- `details`: **always an object** (may be `{}`). For `VALIDATION_ERROR`, `details.fields` is an array of the offending field names.
