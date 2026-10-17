# Data Persistence

Part of [the mobile architecture doc set](index.md). Implements NFR-4 and NFR-5 (see [00-instructions-scope-and-assumptions.md](00-instructions-scope-and-assumptions.md)).

## Storage split

| Data | Store | Reason |
| --- | --- | --- |
| Cached server data (leagues, fixtures, standings, score, timeline, sport config, club profile, roster, products, inventory) | SQLite (`expo-sqlite` + Drizzle) | Spec §8.4 requires a local database; live queries re-render screens |
| Pending offline actions, sync results | SQLite | Must survive force-close (spec §8.4 step 4; see [08-offline-sync-and-tolerance.md](08-offline-sync-and-tolerance.md)) |
| Cart, paid orders index | SQLite | Local only |
| JWT | `expo-secure-store` (encrypted with an Android Keystore key) | NFR-5, spec §8.1 |
| Session info (user, role, tenant, branding), server URL, device_id | `expo-sqlite/kv-store` | Small key-value, not secret |
| Receipt PDFs | `<document directory>/receipts/` via `expo-file-system` | Binary files |

## SQLite schema (Drizzle)

Tables are declared in `src/data/db/schema.ts` with Drizzle's `sqliteTable`. Large nested server responses are stored as JSON text columns. This avoids mapping every nested field and keeps the cache faithful to the server shape. Only fields used for queries are real columns. (In the diagram, `long` = SQLite `integer`, epoch milliseconds.)

```mermaid
erDiagram
  LEAGUE ||--o{ FIXTURE : has
  LEAGUE ||--|| STANDINGS_CACHE : has
  FIXTURE ||--o| SCORE_CACHE : has
  SPORT_CACHE ||--o{ LEAGUE : config_for
  CLUB_CACHE ||--o{ ROSTER_PLAYER : has
  PRODUCT ||--o{ VARIANT : has
  PENDING_ACTION }o--|| FIXTURE : targets
  SYNC_RESULT ||--|| PENDING_ACTION : result_of

  LEAGUE { string league_id PK; string name; string sport_id; string tenant_id; long fetched_at }
  FIXTURE { string match_id PK; string league_id; string home_id; string home_name; string away_id; string away_name; string scheduled_at; string venue; string status; long fetched_at }
  STANDINGS_CACHE { string league_id PK; string json; long fetched_at }
  SCORE_CACHE { string match_id PK; int version; string status; string json; long fetched_at }
  SPORT_CACHE { string sport_id PK; string scoring_model; string json; long fetched_at }
  CLUB_CACHE { string club_id PK; string tenant_id; string name; string json; long fetched_at }
  ROSTER_PLAYER { string player_id PK; string club_id; string squad_id; string league_id; string name; string position; string role; int audit_count }
  PRODUCT { string product_id PK; string tenant_id; string name; string image_url; string json }
  VARIANT { string variant_id PK; string product_id; string label; long price_minor; int stock }
  CART_LINE { string variant_id PK; int quantity }
  ORDER_LOCAL { string order_id PK; string status; long total_minor; string paid_at; string pdf_path }
  PENDING_ACTION { long local_id PK; string action_id UK; string type; string queued_at; int base_version; string payload_json; string target_id; string summary; string state; int attempts; string last_error; string created_by }
  SYNC_RESULT { string action_id PK; string type; string summary; string status; string resolution; string error_code; int server_version; long processed_at }
```

`PENDING_ACTION.local_id` is `integer primary key autoincrement`, which gives the stable queue order. `PENDING_ACTION.state`: `PENDING`, `SENDING`. `target_id` = match_id (score) or player_id (roster). `summary` = human text shown in queue, e.g. "Goal for Alpha FC (Match m1)". `last_error` is set when the server rejects the whole envelope (HTTP 400).

## Opening the database and migrations

- Open once in `src/data/db/client.ts`: `openDatabaseSync("nascon.db", { enableChangeListener: true })`, then `drizzle(db)`. **`enableChangeListener: true` is required**, or `useLiveQuery` will not re-render when rows change.
- Migrations: run `npx drizzle-kit generate` after changing `schema.ts`; it writes SQL files into `mobile/drizzle/`. Commit them. The root `app/_layout.tsx` runs them on startup with Drizzle's `useMigrations` hook, and shows `LoadingState` until they finish.
- Bundling `.sql` files needs two config lines (from the Drizzle Expo guide): add `"sql"` to `resolver.sourceExts` in `metro.config.js`, and add `["inline-import", { extensions: [".sql"] }]` (package `babel-plugin-inline-import`) to `babel.config.js`.
- Keep one migration for the event. Never drop or recreate `pending_actions` on app start. What logout clears is listed in [11-security.md](11-security.md) §Session handling.

Full `PENDING_ACTION` / `SYNC_RESULT` lifecycle and the exact `payload_json` contents are in [08-offline-sync-and-tolerance.md](08-offline-sync-and-tolerance.md).

## Token storage (Keystore via expo-secure-store)

```ts
// sessionStore.ts
// save:   SecureStore.setItemAsync("nascon_jwt", token)
// load:   SecureStore.getItemAsync("nascon_jwt")   -> null means signed out
// clear:  SecureStore.deleteItemAsync("nascon_jwt")
// load throws (key invalidated, e.g. after a device security change) -> clear session -> Login
```

`expo-secure-store` encrypts each value with a key kept in the Android Keystore, so no hand-written crypto is needed. Store **only** the JWT there (it has a small size limit); session JSON goes in kv-store.

The token is never logged. Any request logging is development-only (`__DEV__`) and redacts the `Authorization` header. Full security rationale in [11-security.md](11-security.md).
