# State Management

Part of [the mobile architecture doc set](index.md). Builds on the read path described in [01-architecture-overview.md](01-architecture-overview.md).

## Rules

- Each screen has one hook, `use<Screen>Screen()` in `src/ui/hooks/`, that returns `{ state, actions }`. It combines a Drizzle `useLiveQuery` (cached rows), the refresh status, and values from the Zustand `appStore`. Screens only render `state` and call `actions`.
- One-off effects: success/error messages go through `toastStore.show(...)`; navigation uses `router.push` / `router.replace` from `expo-router` inside the action function.
- Form input lives in `useState` inside the screen hook. No form library, to keep dependencies down. Rotation does not reset it: Expo's Android config handles orientation changes without restarting the screen, so React state survives.
- Global state lives in the Zustand `appStore`: `session`, `netState`, `pendingCount`, `tenantTheme`, `selectedLeagueId` (shared by Fixtures and Standings). Nothing else goes global.
- Server data is never kept in Zustand. It lives in SQLite and is read with `useLiveQuery`.

## Standard screen state shape

```ts
type ScreenState<T> = {
  data: T | null;           // cached or fresh content
  isLoading: boolean;       // first load with no cache
  isRefreshing: boolean;
  error: AppError | null;   // last refresh error
  lastUpdated: Date | null; // from the row's fetched_at
  isStale: boolean;         // true when offline or refresh failed
};
```

`useScreenState(liveRows, refreshFn)` in `src/ui/hooks/useScreenState.ts` builds this shape so every screen behaves the same.

Rendering rule:

| data | isLoading | error | Show |
| --- | --- | --- | --- |
| null | true | - | `LoadingState` (spinner + "Loading fixtures...") |
| null | false | null | `EmptyState` ("No matches yet") |
| null | false | set | `ErrorState` (plain message + Retry button) |
| set | - | set | Content + inline note "Showing saved data from 11:42. Couldn't refresh." |
| set | - | null | Content |

`AppError` values and their plain-language text are defined in [10-error-handling.md](10-error-handling.md).

## Match detail state example

```ts
type MatchUiState = {
  score: ScoreView | null;      // from server projection
  timeline: TimelineItem[];     // server events + pending local events
  pinned: ProductCard[];
  canScore: boolean;
  live: "connected" | "reconnecting" | "off";
};
type TimelineItem = {
  eventId: string; label: string; teamName: string | null;
  compensated: boolean; isCompensation: boolean;
  pending: boolean;             // true = queued offline, not yet on server
};
```

`pending` timeline items come from the offline queue (see [08-offline-sync-and-tolerance.md](08-offline-sync-and-tolerance.md)). `live` state transitions are driven by `liveUpdatesClient` (see [07-networking-and-api.md](07-networking-and-api.md) §Realtime).
