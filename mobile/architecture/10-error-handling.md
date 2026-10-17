# Error Handling

Part of [the mobile architecture doc set](index.md).

## Error taxonomy

```ts
// src/core/error/appError.ts — a "discriminated union": check `kind` to know which one it is
type AppError =
  | { kind: "offline" }                                          // no network or /health unreachable
  | { kind: "timeout" }
  | { kind: "unauthenticated" }                                  // 401
  | { kind: "forbidden" }                                        // 403
  | { kind: "notFound"; code: string }                           // 404
  | { kind: "conflict"; code: string; details: Record<string, unknown> } // 409
  | { kind: "payment"; code: string }                            // 402
  | { kind: "validation"; code: string; fields: string[] }       // 400
  | { kind: "rateLimited"; retryAfterSec: number }               // 429
  | { kind: "payloadTooLarge" }                                  // 413
  | { kind: "server" };                                          // 5xx / unparsable

type ApiResult<T> = { ok: true; data: T } | { ok: false; error: AppError };
```

`toAppError(axiosError)` parses the spec §5.2 error body `{"error":{code,message,details}}`. The server `message` is never shown raw; the `code` picks a message from the table below. Unknown code → generic text for its HTTP class. Repositories return `ApiResult` and never throw to the UI.

## Code → plain-language message (`src/core/error/errorMessages.ts`)

| Code | Message shown |
| --- | --- |
| (network) Offline | "You're offline. Showing saved data." |
| Timeout | "The server is taking too long. Please try again." |
| UNAUTHENTICATED | "Your session expired. Please sign in again." |
| FORBIDDEN | "You don't have permission to do this." |
| VALIDATION_ERROR | "Please check: {fields}." (fields humanized) |
| UNKNOWN_EVENT_TYPE | "This scoring option isn't valid for this sport." |
| INVALID_DISCOUNT_CODE | "That discount code isn't valid." |
| PAYMENT_DECLINED | "Payment was declined. You were not charged." |
| PAYMENT_CAPTURE_FAILED | "Payment couldn't be completed. You were not charged." |
| SPORT_NOT_FOUND / MATCH_NOT_FOUND / LEAGUE_NOT_FOUND | "This {sport/match/league} no longer exists." |
| EVENT_NOT_FOUND | "The event you tried to correct wasn't found." |
| PLAYER_NOT_FOUND / SQUAD_NOT_FOUND | "That player/squad wasn't found." |
| VARIANT_NOT_FOUND | "This product option is no longer available." |
| SPORT_EXISTS / LEAGUE_EXISTS / MATCH_EXISTS | "This already exists." |
| DUPLICATE_EVENT_ID / DUPLICATE_ORDER_ID | "This was already submitted with different details." |
| ILLEGAL_TRANSITION | "The match can't change to that status right now." |
| MATCH_NOT_IN_PROGRESS | "Scores can only be added while the match is in progress." |
| TIE_NOT_ALLOWED | "Scores are level and this sport needs a winner. Record the tie-break winner first." |
| INNINGS_COMPLETE | "This team's innings is already over." |
| SERIES_ALREADY_DECIDED | "This series is already decided." |
| INVALID_COMPENSATION | "This event can't be corrected (already corrected or wrong type)." |
| NO_VALID_PAIRING | "No valid pairing exists for this round." |
| OUT_OF_STOCK | "Sorry, this item just sold out." |
| CROSS_TENANT_TRANSFER | "Players can only move between clubs in your organisation." |
| NOT_IN_SQUAD | "This player is no longer in that squad. The list was refreshed." |
| TRANSFER_WINDOW_CLOSED | "The transfer window is closed for that date." |
| PLAYER_ON_LOAN | "This player is on loan and can't be moved until the loan ends." |
| SQUAD_FULL | "The destination squad is full." |
| MIN_POSITION_VIOLATION | "The club would have too few players in this position." |
| INVALID_BASE_VERSION | "Your device was out of date. The server version was kept." |
| PAYLOAD_TOO_LARGE | "That request is too large." |
| RATE_LIMITED | "Too many requests. Please wait {n} seconds." |
| Server (5xx) | "Something went wrong on the server. Please try again." |

This table must cover every code in the spec's Appendix B — see [16-traceability-and-verification.md](16-traceability-and-verification.md) and the test requirement in [13-testing-strategy.md](13-testing-strategy.md).

## Where errors surface

- Refresh errors with cached data: inline small text under the top bar, not a blocking dialog.
- Action errors (score, checkout, roster): toast or inline under the field, with a Retry action when retrying makes sense.
- Sync rejections: listed per action on Sync screen, plus a one-time toast "1 change wasn't applied. Tap to see why." (see [08-offline-sync-and-tolerance.md](08-offline-sync-and-tolerance.md))
- No crash on bad JSON: every parse goes through zod `safeParse` (or `try/catch` around `JSON.parse`) and maps failures to `{ kind: "server" }`.
- No white screen on a render bug: wrap the root layout in an error boundary (Expo Router supports exporting `ErrorBoundary` from `app/_layout.tsx`) showing "Something went wrong" + "Try again".
