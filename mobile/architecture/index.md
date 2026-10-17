# Mobile Architecture — Index

NaSCon '26 App Dev, Part I: mobile app architecture for the Multi-Sport League & Club Operations Platform.

**Stack:** React Native + Expo (TypeScript), NativeWind styling, expo-sqlite + Drizzle local database, delivered as an Android APK built locally. Backend is Node (separate doc). Details in [02-tech-stack-and-project-structure.md](02-tech-stack-and-project-structure.md).

**Binding source:** `Docs/NaSCon 26 App Dev Part 1-1.md` (fallback) / `Docs/spec/` (preferred, split by topic — start at `Docs/spec/index.md`). Where any file in this directory and the spec disagree, **the spec wins**. Section references like "§5.14" point to the spec, not to files in this directory.

This directory is the split version of the mobile architecture doc. Each file below is self-contained: read only the one(s) relevant to your current task. Don't scan multiple files looking for context that belongs in one of them — if something isn't where its topic says it should be, it isn't specified; flag it rather than inventing it.

## How to use this directory

1. Read [00-instructions-scope-and-assumptions.md](00-instructions-scope-and-assumptions.md) once, at the start of any mobile task — it has the non-negotiable rules, what's in/out of scope, and the assumptions already made on your behalf.
2. Jump directly to the file matching your task below. Most tasks need exactly one file.
3. Cross-references between files are explicit (e.g. "see §12.2 in 08-offline-sync-and-tolerance.md") — follow them instead of re-deriving.

## Files

| File | Covers | Read this when you're... |
| --- | --- | --- |
| [00-instructions-scope-and-assumptions.md](00-instructions-scope-and-assumptions.md) | Instructions for Claude Code, in/out of scope, FR/NFR mapping, constraints, assumptions & ambiguity resolutions | Starting any mobile task; checking if something is in scope; resolving an ambiguity |
| [01-architecture-overview.md](01-architecture-overview.md) | Screen + screen-hook + offline-first repository pattern, layer diagram, read-path sequence | Deciding where new code belongs (UI/domain/data layer) |
| [02-tech-stack-and-project-structure.md](02-tech-stack-and-project-structure.md) | Library choices (Expo, NativeWind, Drizzle, axios, Zustand…), folder tree | Adding a dependency; creating a new file |
| [03-components-and-responsibilities.md](03-components-and-responsibilities.md) | Every repository/store/client module, its one job, and what it talks to | Implementing or modifying a specific component; unsure which module owns a responsibility |
| [04-navigation.md](04-navigation.md) | Nav graph, Expo Router route/file table, role-visibility matrix | Adding a screen or route; deciding what a role can see |
| [05-state-management.md](05-state-management.md) | Screen hook rules, Zustand global state, standard screen state shape, rendering rules | Writing a screen hook or screen state type |
| [06-data-persistence.md](06-data-persistence.md) | Storage split (SQLite/kv-store/secure-store/files), Drizzle schema, migrations, token storage | Adding a cached table; touching the DB schema; storing a secret |
| [07-networking-and-api.md](07-networking-and-api.md) | Base URL handling, axios interceptor chain, full endpoint table, DTO rules, realtime protocol | Calling a new endpoint; adding an interceptor; handling realtime messages |
| [08-offline-sync-and-tolerance.md](08-offline-sync-and-tolerance.md) | What's queued, exact §5.14 JSON format, online/offline flow, sync sequence, result mapping, desk-check walkthrough | Anything offline-queue or sync related (NFR-4) — this is graded, read it closely |
| [09-key-flows.md](09-key-flows.md) | Checkout, receipt, scoring entry, roster action — step-by-step flows | Implementing checkout, receipts, scoring entry, or roster transfer/loan/release |
| [10-error-handling.md](10-error-handling.md) | `AppError` taxonomy, full code → plain-language message table, where errors surface | Mapping a server error code to UI text |
| [11-security.md](11-security.md) | OWASP Mobile Top 10 controls applied | Touching auth, token storage, logging, or anything security-reviewed |
| [12-ui-and-hci.md](12-ui-and-hci.md) | Design system, mapping to the 5 judged HCI areas, ConnectivityBanner spec, per-screen content checklist | Building or polishing any screen's UI |
| [13-testing-strategy.md](13-testing-strategy.md) | What to test at each level and with which tool | Writing tests for a mobile component |
| [14-build-and-delivery.md](14-build-and-delivery.md) | Build prerequisites, `app.json`, local APK build script, README additions | Touching `app.json`, native build settings, or release APK output |
| [15-build-order.md](15-build-order.md) | Time-boxed phase plan (P0–P7) with cut order | Planning what to build next / deciding what to cut under time pressure |
| [16-traceability-and-verification.md](16-traceability-and-verification.md) | FR/NFR → source files → tests mapping; spec-item → doc-section coverage table | Filling in `TRACEABILITY.md`; double-checking nothing from the spec was missed |

## Non-negotiables (repeated from the root `CLAUDE.md` — do not violate even under time pressure)

- Never branch on a sport name or event name anywhere in app code. Branch only on `scoring_model` (`event` / `innings` / `round`). Sport event lists always come from the sport config JSON. (−8 penalty.)
- `DAY1_SALT` never appears in the app. The app never computes signatures.
- Output APK must land at `mobile/release/app-release.apk`, installable on API 29+.
- Offline action JSON must match the spec's byte for byte in field names (see [08-offline-sync-and-tolerance.md](08-offline-sync-and-tolerance.md)).
