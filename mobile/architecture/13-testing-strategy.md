# Testing Strategy

Part of [the mobile architecture doc set](index.md).

Tests run with **Jest** using the `jest-expo` preset (`npx jest` inside `mobile/`). Native modules (`expo-sqlite`, `expo-secure-store`, `react-native-pdf`) do not run inside Jest, so logic that matters is kept in plain TypeScript functions that take their dependencies as arguments, and those functions are tested with fakes.

| Level | What | Tools |
| --- | --- | --- |
| Unit | Offline action builder output equals spec §5.14 golden JSON (field names, `queued_at` format, nested payload) — see [08-offline-sync-and-tolerance.md](08-offline-sync-and-tolerance.md) | Jest (`toEqual` against a fixture) |
| Unit | `syncPendingActions`: maps applied / rebased / duplicate / rejected correctly; reverts to PENDING on network error; batches >100 | Jest + fake repositories |
| Unit | `syncScheduler` is single-flight (two triggers at once → one request) | Jest fake timers |
| Unit | `errorMessages` covers every Appendix B code — see [10-error-handling.md](10-error-handling.md) | Jest (iterate the code list from `Docs/spec/05-error-codes.md`) |
| Unit | `roleCapabilities` for all 5 roles × own / other / foreign ids (mirrors spec §5.13 matrix) — see [04-navigation.md](04-navigation.md) | Jest |
| Unit | Score header formatting by `scoring_model` (event / innings / round) using a mystery-sport config — see [09-key-flows.md](09-key-flows.md) §Scoring entry | Jest |
| Unit | `formatMoney`, `isoNowUtc`, id factory regex | Jest |
| Unit | `useScreenState`: loading → content, offline with cache → stale content, error without cache — see [05-state-management.md](05-state-management.md) | React Native Testing Library `renderHook` |
| Integration | axios client + interceptors: 401 clears session, 429 respects `Retry-After`, error body → `AppError`, network error → `offline` | `axios-mock-adapter` |
| Manual | Queue survives force-close; `SENDING` reset on start; desk check script (see [08-offline-sync-and-tolerance.md](08-offline-sync-and-tolerance.md) §Desk check walk-through); 360×640 emulator; rotation; TalkBack spot check | Android emulator / phone with the release APK |

Mobile tests are not part of `COVERAGE.json` (that file covers the six backend areas, spec §9.3) and are not run by the root `run_tests.sh`. They are referenced in `TRACEABILITY.md` (see [16-traceability-and-verification.md](16-traceability-and-verification.md)).
