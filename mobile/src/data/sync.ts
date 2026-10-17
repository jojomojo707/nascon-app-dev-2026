// Persistent offline queue + single-flight sync (mobile/architecture/08).
// Actions are stored in SQLite (survive force-close) and sent to POST /api/v1/offline-sync.
import * as Crypto from "expo-crypto";
import { getDb, notifyChange } from "./db";
import { apiPost, routes } from "./api";
import { getDeviceId } from "./settings";
import { isoNowUtc } from "../core/format";
import { messageForCode } from "../core/errors";
import {
  buildRosterAction,
  buildScoreAction,
  buildSyncEnvelope,
  EventBody,
  OfflineAction,
  SyncResult,
  TransferBody,
} from "../core/offlineAction";
import { toast, useAppStore } from "../state/appStore";

export type PendingRow = {
  local_id: number;
  action_id: string;
  type: string;
  queued_at: string;
  base_version: number;
  payload_json: string;
  target_id: string;
  summary: string;
  state: string;
  attempts: number;
  last_error: string | null;
};

export type ResultRow = {
  action_id: string;
  type: string;
  summary: string;
  status: string;
  resolution: string;
  error_code: string | null;
  server_version: number | null;
  processed_at: number;
};

export function refreshCounts(): void {
  const d = getDb();
  const p = d.getFirstSync<{ n: number }>("SELECT COUNT(*) AS n FROM pending_actions")?.n ?? 0;
  const r = d.getFirstSync<{ n: number }>("SELECT COUNT(*) AS n FROM sync_results WHERE status = 'rejected'")?.n ?? 0;
  useAppStore.getState().setCounts(p, r);
}

export function listPending(): PendingRow[] {
  return getDb().getAllSync<PendingRow>("SELECT * FROM pending_actions ORDER BY local_id");
}

export function listResults(): ResultRow[] {
  return getDb().getAllSync<ResultRow>("SELECT * FROM sync_results ORDER BY processed_at DESC, action_id LIMIT 50");
}

export function clearResults(): void {
  getDb().runSync("DELETE FROM sync_results");
  refreshCounts();
  notifyChange();
}

function insertAction(action: OfflineAction, targetId: string, summary: string, createdBy: string): void {
  getDb().runSync(
    `INSERT OR IGNORE INTO pending_actions (action_id, type, queued_at, base_version, payload_json, target_id, summary, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [action.action_id, action.type, action.queued_at, action.base_version, JSON.stringify(action.payload), targetId, summary, createdBy],
  );
  refreshCounts();
  notifyChange();
}

export function enqueueScoreEvent(body: EventBody, baseVersion: number, summary: string, createdBy: string): void {
  const action = buildScoreAction("act-" + Crypto.randomUUID(), isoNowUtc(), baseVersion, body);
  insertAction(action, body.match_id, summary, createdBy);
  requestSync();
}

export function enqueueRosterTransfer(body: TransferBody, baseVersion: number, summary: string, createdBy: string): void {
  const action = buildRosterAction("act-" + Crypto.randomUUID(), isoNowUtc(), baseVersion, body);
  insertAction(action, body.player_id, summary, createdBy);
  requestSync();
}

/** Pending score events for one match (shown in the timeline as "Pending sync"). */
export function pendingForTarget(targetId: string): PendingRow[] {
  return getDb().getAllSync<PendingRow>("SELECT * FROM pending_actions WHERE target_id = ? ORDER BY local_id", [targetId]);
}

function rowToAction(r: PendingRow): OfflineAction {
  return {
    action_id: r.action_id,
    type: r.type as "score_event",
    queued_at: r.queued_at,
    base_version: r.base_version,
    payload: JSON.parse(r.payload_json),
  };
}

type SyncOutcome = "success" | "retry" | "failed" | "idle";

/** Send up to 100 pending actions; map per-action results; clear them from the queue. */
export async function syncPendingActions(): Promise<SyncOutcome> {
  const d = getDb();
  const rows = d.getAllSync<PendingRow>("SELECT * FROM pending_actions WHERE state = 'PENDING' ORDER BY local_id LIMIT 100");
  if (rows.length === 0) return "idle";
  const ids = rows.map((r) => r.local_id);
  d.runSync(`UPDATE pending_actions SET state = 'SENDING' WHERE local_id IN (${ids.map(() => "?").join(",")})`, ids);

  const envelope = buildSyncEnvelope(getDeviceId(), rows.map(rowToAction));
  const res = await apiPost<{ results?: SyncResult[] }>(routes.offlineSync, envelope);

  if (!res.ok) {
    const isBadEnvelope = res.error.kind === "validation";
    d.runSync(
      `UPDATE pending_actions SET state = 'PENDING', attempts = attempts + 1, last_error = ? WHERE local_id IN (${ids.map(() => "?").join(",")})`,
      [isBadEnvelope ? "Sync failed: the server could not read these changes." : null, ...ids],
    );
    refreshCounts();
    notifyChange();
    return isBadEnvelope ? "failed" : "retry";
  }

  const results = Array.isArray(res.data?.results) ? res.data.results : [];
  const byId = new Map(results.map((r) => [r.action_id, r]));
  let rejected = 0;
  d.withTransactionSync(() => {
    for (const row of rows) {
      const r = byId.get(row.action_id);
      if (!r) {
        d.runSync("UPDATE pending_actions SET state = 'PENDING' WHERE local_id = ?", [row.local_id]);
        continue;
      }
      if (r.status === "rejected") rejected++;
      d.runSync(
        `INSERT OR REPLACE INTO sync_results (action_id, type, summary, status, resolution, error_code, server_version, processed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [row.action_id, row.type, row.summary, r.status, r.resolution, r.error_code ?? null, r.server_version ?? null, Date.now()],
      );
      d.runSync("DELETE FROM pending_actions WHERE local_id = ?", [row.local_id]);
    }
  });
  refreshCounts();
  notifyChange();
  if (rejected > 0) {
    toast(`${rejected} change${rejected > 1 ? "s" : ""} weren't applied. Open Sync status to see why.`, "error");
  } else {
    toast(`Synced ${rows.length} change${rows.length > 1 ? "s" : ""}.`, "success");
  }
  return "success";
}

// ---- single-flight scheduler with backoff ----
let running = false;
let backoffSec = 2;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

export function requestSync(): void {
  if (running) return;
  const { netState } = useAppStore.getState();
  if (netState !== "online") return;
  running = true;
  useAppStore.getState().setSyncing(true);
  (async () => {
    let outcome: SyncOutcome = "idle";
    try {
      do {
        outcome = await syncPendingActions();
      } while (outcome === "success");
    } finally {
      running = false;
      useAppStore.getState().setSyncing(false);
    }
    if (outcome === "retry") {
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = setTimeout(requestSync, backoffSec * 1000);
      backoffSec = Math.min(backoffSec * 2, 60);
    } else {
      backoffSec = 2;
    }
  })();
}

export { messageForCode };
