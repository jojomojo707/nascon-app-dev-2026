// Local SQLite database (expo-sqlite): the single source of truth for cached server data,
// the persistent offline action queue, sync results, cart and local orders.
import * as SQLite from "expo-sqlite";
import { useAppStore } from "../state/appStore";

let db: SQLite.SQLiteDatabase | null = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS cache (key TEXT PRIMARY KEY NOT NULL, json TEXT NOT NULL, fetched_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS pending_actions (
  local_id INTEGER PRIMARY KEY AUTOINCREMENT,
  action_id TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  queued_at TEXT NOT NULL,
  base_version INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  target_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'PENDING',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_by TEXT
);
CREATE TABLE IF NOT EXISTS sync_results (
  action_id TEXT PRIMARY KEY NOT NULL,
  type TEXT NOT NULL,
  summary TEXT NOT NULL,
  status TEXT NOT NULL,
  resolution TEXT NOT NULL,
  error_code TEXT,
  server_version INTEGER,
  processed_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS cart_lines (
  variant_id TEXT PRIMARY KEY NOT NULL,
  product_id TEXT NOT NULL,
  label TEXT NOT NULL,
  price_minor INTEGER NOT NULL,
  quantity INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS orders_local (
  order_id TEXT PRIMARY KEY NOT NULL,
  status TEXT NOT NULL,
  total_minor INTEGER NOT NULL,
  paid_at TEXT,
  pdf_path TEXT,
  json TEXT NOT NULL
);
`;

export function getDb(): SQLite.SQLiteDatabase {
  if (!db) {
    db = SQLite.openDatabaseSync("nascon.db");
    db.execSync("PRAGMA journal_mode = WAL;");
    db.execSync(SCHEMA);
    // A process killed mid-sync leaves SENDING rows; ids are idempotent so resending is safe.
    db.runSync("UPDATE pending_actions SET state = 'PENDING' WHERE state = 'SENDING'");
  }
  return db;
}

/** Tell screens that local data changed so they re-read SQLite. */
export function notifyChange(): void {
  useAppStore.getState().bumpDataVersion();
}

// ---- key-value settings ----
export function kvGet(key: string): string | null {
  const row = getDb().getFirstSync<{ value: string }>("SELECT value FROM kv WHERE key = ?", [key]);
  return row ? row.value : null;
}
export function kvSet(key: string, value: string): void {
  getDb().runSync("INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)", [key, value]);
}
export function kvDelete(key: string): void {
  getDb().runSync("DELETE FROM kv WHERE key = ?", [key]);
}

// ---- response cache ----
export type CacheEntry<T> = { data: T; fetchedAt: number };

export function cacheGet<T>(key: string): CacheEntry<T> | null {
  const row = getDb().getFirstSync<{ json: string; fetched_at: number }>(
    "SELECT json, fetched_at FROM cache WHERE key = ?",
    [key],
  );
  if (!row) return null;
  try {
    return { data: JSON.parse(row.json) as T, fetchedAt: row.fetched_at };
  } catch {
    return null;
  }
}
export function cachePut(key: string, data: unknown): void {
  getDb().runSync("INSERT OR REPLACE INTO cache (key, json, fetched_at) VALUES (?, ?, ?)", [
    key,
    JSON.stringify(data),
    Date.now(),
  ]);
  notifyChange();
}

/** Logout: drop cached server data and the cart. The offline queue is kept on purpose. */
export function clearUserData(): void {
  const d = getDb();
  d.execSync("DELETE FROM cache; DELETE FROM cart_lines;");
  notifyChange();
}
