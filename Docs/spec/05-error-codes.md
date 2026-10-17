# 05 — Error Code Catalogue (Appendix B)

Scope: the single source of truth for every error `code`, its HTTP status, and when it applies. Error body shape is in [04-api-conventions.md](04-api-conventions.md). Hidden grader vectors cover **every code listed here**.

| HTTP | Code(s) | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Schema/type/range problem (`details.fields`), bad dates, bad limits. |
| 400 | `UNKNOWN_EVENT_TYPE` | Score `event_type` not defined in the sport. |
| 400 | `INVALID_DISCOUNT_CODE` | Unknown discount code. |
| 401 | `UNAUTHENTICATED` | Missing / invalid / tampered / expired / `alg:none` token. |
| 402 | `PAYMENT_DECLINED`, `PAYMENT_CAPTURE_FAILED` | Mock gateway failure. |
| 403 | `FORBIDDEN` | Role or tenant/ownership boundary. |
| 404 | `SPORT_NOT_FOUND`, `MATCH_NOT_FOUND`, `LEAGUE_NOT_FOUND`, `EVENT_NOT_FOUND`, `PLAYER_NOT_FOUND`, `SQUAD_NOT_FOUND`, `VARIANT_NOT_FOUND` | Referenced id does not exist. |
| 409 | `SPORT_EXISTS`, `LEAGUE_EXISTS`, `MATCH_EXISTS` | Id already used. |
| 409 | `DUPLICATE_EVENT_ID`, `DUPLICATE_ORDER_ID` | Same id re-used with a different body. |
| 409 | `ILLEGAL_TRANSITION`, `MATCH_NOT_IN_PROGRESS`, `TIE_NOT_ALLOWED` | Match state-machine violations. |
| 409 | `INNINGS_COMPLETE`, `SERIES_ALREADY_DECIDED` | Config-driven scoring limits. |
| 409 | `INVALID_COMPENSATION` | Target already compensated, wrong type, or other match. |
| 409 | `NO_VALID_PAIRING` | Swiss: no rematch-free pairing exists. |
| 409 | `OUT_OF_STOCK` | Not enough stock. |
| 409 | `CROSS_TENANT_TRANSFER`, `NOT_IN_SQUAD`, `TRANSFER_WINDOW_CLOSED`, `PLAYER_ON_LOAN`, `SQUAD_FULL`, `MIN_POSITION_VIOLATION` | Roster rules (checked in the order given in [13-roster.md](13-roster.md)). |
| — | `INVALID_BASE_VERSION` | Only inside an offline-sync per-action result ([16-offline-sync.md](16-offline-sync.md)). |
| 413 | `PAYLOAD_TOO_LARGE` | Body over 1 MB. |
| 429 | `RATE_LIMITED` | `/api/v1/*` limit exceeded (include `Retry-After` header). |

Additional codes referenced in prose elsewhere (kept for completeness; also appear above where applicable): `NO_VALID_PAIRING` carries `details.round`; `OUT_OF_STOCK` carries `details.variant_id`; `VALIDATION_ERROR` carries `details.fields`.
