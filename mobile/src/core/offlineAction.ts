// Builders for queued offline actions in EXACTLY the Docs/spec/16 format.
// Pure functions (no I/O) so the shape is unit-tested.
import { z } from "zod";

const ID_RE = /^[A-Za-z0-9_.:-]{1,64}$/;
const TS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

export type EventBody = {
  event_id: string;
  match_id: string;
  type: string;
  payload: Record<string, unknown>;
};

export type TransferBody = {
  request_id: string;
  league_id: string;
  player_id: string;
  type: "transfer" | "loan" | "release";
  from_squad_id: string;
  to_squad_id: string | null;
  effective_date: string;
  loan_end_date: string | null;
  reason: string;
  requested_by: string;
};

export type OfflineAction =
  | { action_id: string; type: "score_event"; queued_at: string; base_version: number; payload: EventBody }
  | { action_id: string; type: "roster_transfer"; queued_at: string; base_version: number; payload: TransferBody };

export const offlineActionSchema = z
  .object({
    action_id: z.string().regex(ID_RE),
    type: z.enum(["score_event", "roster_transfer"]),
    queued_at: z.string().regex(TS_RE),
    base_version: z.number().int().min(0),
    payload: z.record(z.string(), z.unknown()),
  })
  .strict();

export function buildScoreAction(
  actionId: string,
  queuedAt: string,
  baseVersion: number | null | undefined,
  body: EventBody,
): OfflineAction {
  const action: OfflineAction = {
    action_id: actionId,
    type: "score_event",
    queued_at: queuedAt,
    base_version: Math.max(0, Math.trunc(baseVersion ?? 0)),
    payload: { event_id: body.event_id, match_id: body.match_id, type: body.type, payload: body.payload },
  };
  offlineActionSchema.parse(action);
  return action;
}

export function buildRosterAction(
  actionId: string,
  queuedAt: string,
  baseVersion: number | null | undefined,
  body: TransferBody,
): OfflineAction {
  const action: OfflineAction = {
    action_id: actionId,
    type: "roster_transfer",
    queued_at: queuedAt,
    base_version: Math.max(0, Math.trunc(baseVersion ?? 0)),
    payload: { ...body },
  };
  offlineActionSchema.parse(action);
  return action;
}

/** The request envelope for POST /offline-sync. */
export function buildSyncEnvelope(deviceId: string, actions: OfflineAction[]) {
  return { device_id: deviceId, actions: actions.slice(0, 100) };
}

export type SyncResult = {
  action_id: string;
  status: "applied" | "rejected" | "duplicate";
  resolution: "appended" | "rebased_append" | "skipped_duplicate" | "server_wins";
  error_code: string | null;
  processed_order: number;
  server_version: number | null;
  signature: string | null;
};

/** Plain-language label + detail for one sync result (Sync status screen). */
export function describeResult(r: Pick<SyncResult, "status" | "resolution" | "error_code">, messageForCode: (c: string | null) => string) {
  if (r.status === "applied") {
    return {
      label: "Synced",
      icon: "check-circle-outline" as const,
      detail: r.resolution === "rebased_append" ? "Saved. Others had made changes first; yours was added after them." : "Saved on the server.",
    };
  }
  if (r.status === "duplicate") {
    return { label: "Already synced", icon: "check-all" as const, detail: "This was already on the server. Nothing changed." };
  }
  return { label: "Not applied", icon: "alert-outline" as const, detail: messageForCode(r.error_code) };
}
