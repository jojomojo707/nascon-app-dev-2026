# Architecture Overview

Part of [the mobile architecture doc set](index.md). See [00-instructions-scope-and-assumptions.md](00-instructions-scope-and-assumptions.md) for scope and constraints that motivate these choices. Libraries are in [02-tech-stack-and-project-structure.md](02-tech-stack-and-project-structure.md).

## Pattern

**Screen + screen hook + offline-first repositories**, in three layers:

- **UI layer**: Expo Router screens (React components) styled with NativeWind. Each screen gets its data from one custom hook, `use<Screen>Screen()`, which returns a `ScreenState` object plus action functions. The hook plays the "ViewModel" role: screens contain no data-fetching logic.
- **Domain layer**: thin. Only modules with real logic: `enqueueOfflineAction`, `syncPendingActions`, `checkout`, `roleCapabilities`. Everything else calls repositories directly from screen hooks (no pass-through use cases).
- **Data layer**: repositories own the rule "SQLite is the single source of truth for cached data; network refreshes write into SQLite". Remote via axios; realtime via the built-in `WebSocket`; sync via `syncScheduler` (foreground triggers, no background task).

Why this and not more: the grading weight on the app is offline behaviour and HCI. Making SQLite the source of truth gives offline caching almost for free: screens read with Drizzle's `useLiveQuery`, so airplane mode just stops refreshes and the screen keeps showing rows. Redux, a DI framework or per-feature packages would cost build time without adding graded value.

## Layer diagram

```mermaid
flowchart TB
  subgraph UI["UI layer (Expo Router + NativeWind)"]
    S1[Screens] --> VM[Screen hooks<br/>use&lt;Screen&gt;Screen -> ScreenState]
    SB[ConnectivityBanner<br/>always visible]
    ZS[(Zustand appStore<br/>session, netState,<br/>pendingCount, tenantTheme)]
  end
  subgraph DOMAIN["Domain layer (thin)"]
    UC1[enqueueOfflineAction]
    UC2[syncPendingActions]
    UC3[checkout]
    UC4[roleCapabilities]
  end
  subgraph DATA["Data layer"]
    R[Repositories<br/>Fixtures, Standings, Match, Club,<br/>Roster, Store, Session, Sync]
    DB[(expo-sqlite + Drizzle<br/>cache + action queue)]
    KV[(kv-store<br/>server URL, device_id)]
    KS[(expo-secure-store<br/>JWT, Keystore-backed)]
    API[axios client]
    WS[WebSocket client]
    SS[syncScheduler]
    NET[connectivityMonitor<br/>NetInfo + /health]
  end
  BE[(Node backend :8080<br/>/api/v1, /health, ws)]

  VM --> UC1 & UC2 & UC3 & UC4
  VM --> R
  VM --> ZS
  UC1 & UC2 & UC3 --> R
  R --> DB & API & KV & KS
  SS --> UC2
  WS --> R
  NET --> ZS
  ZS --> SB
  NET --> SS
  API --> BE
  WS --> BE
  NET -->|GET /health| BE
```

See [03-components-and-responsibilities.md](03-components-and-responsibilities.md) for what each box in this diagram does.

## Read path (offline-first)

```mermaid
sequenceDiagram
  participant Screen
  participant Hook as Screen hook
  participant Repo as Repository
  participant DB as Drizzle useLiveQuery
  participant API as axios
  Screen->>Hook: mount / pull-to-refresh
  Hook->>DB: useLiveQuery(select ...)
  DB-->>Hook: cached rows (instant, works offline)
  Hook->>Repo: refresh(id)
  alt online
    Repo->>API: GET ...
    API-->>Repo: JSON (validated with zod)
    Repo->>DB: upsert(row, fetchedAt=now)
    DB-->>Hook: live query re-runs, new rows emitted
  else offline or error
    Repo-->>Hook: { ok: false, error: AppError }
    Hook-->>Screen: keep cached content + "Showing saved data from 11:42"
  end
```

This read path applies to every cached repository (Fixtures, Standings, Match, Club, Roster, Store). See [06-data-persistence.md](06-data-persistence.md) for the schema it writes into and [05-state-management.md](05-state-management.md) for how the hook turns this into `ScreenState`.
