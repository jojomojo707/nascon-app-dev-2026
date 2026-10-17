# Traceability and Verification Against the Spec

Part of [the mobile architecture doc set](index.md).

## Traceability (mobile part of TRACEABILITY.md)

Paths are relative to `mobile/`. Tests live in `mobile/__tests__/` (Jest).

| ID | Mobile source files | Tests |
| --- | --- | --- |
| FR-1.1 | `app/match/**`, `src/data/repo/matchRepository.ts`, `src/data/repo/sportRepository.ts`, `src/data/realtime/*` | `scoreFormatter.test.ts`, `useScoringScreen.test.ts` |
| FR-1.3 | `app/(tabs)/fixtures.tsx`, `src/core/model/matchStatus.ts`, `src/data/repo/fixturesRepository.ts` | `useFixturesScreen.test.ts` |
| FR-1.4 | `app/(tabs)/standings.tsx`, `src/data/repo/standingsRepository.ts` | `useStandingsScreen.test.ts` |
| FR-2.1 | `app/(tabs)/club.tsx`, `src/ui/theme/tenantTheme.ts`, `src/data/repo/clubRepository.ts` | `tenantTheme.test.ts` |
| FR-2.2 | `app/roster/*`, `app/player/*`, `src/data/repo/rosterRepository.ts` | `rosterFormValidation.test.ts` |
| FR-2.3 | `app/(tabs)/store.tsx`, `app/product/*`, `app/cart.tsx`, `app/checkout.tsx`, `app/receipt/*`, `src/domain/checkout.ts`, `src/data/repo/storeRepository.ts`, `src/data/repo/receiptRepository.ts` | `checkout.test.ts`, `money.test.ts` |
| FR-5.1 | `src/domain/roleCapabilities.ts`, `app/(tabs)/_layout.tsx` | `roleCapabilities.test.ts` |
| NFR-3 (client side) | `src/domain/checkout.ts` (stable order_id, single in-flight) | `checkout.test.ts` |
| NFR-4 | `src/data/db/*`, `src/data/sync/*`, `src/domain/enqueueOfflineAction.ts`, `src/domain/syncPendingActions.ts`, `app/sync.tsx`, `src/ui/components/ConnectivityBanner.tsx` | `offlineActionJson.test.ts`, `syncPendingActions.test.ts`, `syncScheduler.test.ts` |
| NFR-5 | `src/data/security/*`, `src/data/api/client.ts`, `app.json` (cleartext, allowBackup) | `apiClient.test.ts` (401, 429) |

See [00-instructions-scope-and-assumptions.md](00-instructions-scope-and-assumptions.md) for the FR/NFR descriptions these ids refer to.

## Verification Against the Spec

| Spec item | Covered in |
| --- | --- |
| §1 Two surfaces, Android sufficient | [00-instructions-scope-and-assumptions.md](00-instructions-scope-and-assumptions.md) §Scope |
| §1.1 No proprietary BaaS | [00-instructions-scope-and-assumptions.md](00-instructions-scope-and-assumptions.md) §Constraints, [02-tech-stack-and-project-structure.md](02-tech-stack-and-project-structure.md) (no Firebase, no Expo cloud services) |
| §8.4 / NFR-4 local database "SQLite / Room / Hive" | [02-tech-stack-and-project-structure.md](02-tech-stack-and-project-structure.md) (expo-sqlite + Drizzle), [06-data-persistence.md](06-data-persistence.md) |
| §1.3 `mobile/` + `mobile/release/app-release.apk` | [02-tech-stack-and-project-structure.md](02-tech-stack-and-project-structure.md), [14-build-and-delivery.md](14-build-and-delivery.md) |
| §5.2 Port 8080, JSON, money minor units, timestamps, id charset | [07-networking-and-api.md](07-networking-and-api.md) §Base URL, §DTO rules |
| §5.2 `/api/v1/*` rate limit | [00-instructions-scope-and-assumptions.md](00-instructions-scope-and-assumptions.md) §Constraints, [07-networking-and-api.md](07-networking-and-api.md) §Interceptor chain |
| §5.9 score shape, compensation | [09-key-flows.md](09-key-flows.md) §Scoring entry |
| §5.10 qualification status display | [12-ui-and-hci.md](12-ui-and-hci.md) §Screen content checklist |
| §5.11 transfer body, deferred state | [08-offline-sync-and-tolerance.md](08-offline-sync-and-tolerance.md) §Exact queued action format, [09-key-flows.md](09-key-flows.md) §Roster action |
| §5.12 checkout body, tokens, receipt PDF | [09-key-flows.md](09-key-flows.md) §Checkout, §Receipt |
| §5.13 five roles, ownership scopes | [04-navigation.md](04-navigation.md) §Role visibility matrix, [13-testing-strategy.md](13-testing-strategy.md) |
| §5.14 action format, base_version, ordering, result mapping | [08-offline-sync-and-tolerance.md](08-offline-sync-and-tolerance.md) §Exact queued action format, §Result mapping |
| §8.1 API 29+, server address changeable, Keystore | [07-networking-and-api.md](07-networking-and-api.md) §Base URL, [06-data-persistence.md](06-data-persistence.md) §Token storage, [14-build-and-delivery.md](14-build-and-delivery.md) |
| §8.2 all 9 screens | [04-navigation.md](04-navigation.md) §Route table, [12-ui-and-hci.md](12-ui-and-hci.md) §Screen content checklist. Gap: roster "add" has no contract route — open assumption A13 in [00-instructions-scope-and-assumptions.md](00-instructions-scope-and-assumptions.md) |
| §8.3 demo accounts in README | [14-build-and-delivery.md](14-build-and-delivery.md) §README additions |
| §8.4 desk check 5 steps | [08-offline-sync-and-tolerance.md](08-offline-sync-and-tolerance.md) §Desk check walk-through |
| §8.6 five HCI areas | [12-ui-and-hci.md](12-ui-and-hci.md) §Mapping to the five judged areas |
| Appendix B all error codes have plain messages | [10-error-handling.md](10-error-handling.md) |
| §9.4 no hard-coded sport logic | [index.md](index.md) §Non-negotiables, [09-key-flows.md](09-key-flows.md) §Scoring entry |
