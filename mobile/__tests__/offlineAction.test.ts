import { buildRosterAction, buildScoreAction, buildSyncEnvelope, describeResult } from "../src/core/offlineAction";
import { messageForCode } from "../src/core/errors";

describe("offline action format (Docs/spec/16)", () => {
  it("builds a score_event action with exactly the spec keys", () => {
    const a = buildScoreAction("act-1", "2026-10-17T11:00:00Z", 3, {
      event_id: "evt-9",
      match_id: "m1",
      type: "score",
      payload: { team_id: "t1", event_type: "goal" },
    });
    expect(Object.keys(a).sort()).toEqual(["action_id", "base_version", "payload", "queued_at", "type"]);
    expect(a).toEqual({
      action_id: "act-1",
      type: "score_event",
      queued_at: "2026-10-17T11:00:00Z",
      base_version: 3,
      payload: { event_id: "evt-9", match_id: "m1", type: "score", payload: { team_id: "t1", event_type: "goal" } },
    });
    // payload is an object, never a JSON string inside JSON
    expect(typeof a.payload).toBe("object");
  });

  it("builds a roster_transfer action whose payload is the /roster/transfer body", () => {
    const body = {
      request_id: "tr-1",
      league_id: "lg-r1",
      player_id: "p2",
      type: "loan" as const,
      from_squad_id: "sq-a",
      to_squad_id: "sq-b",
      effective_date: "2026-09-15",
      loan_end_date: "2026-12-31",
      reason: "Needs match time",
      requested_by: "user-1",
    };
    const a = buildRosterAction("act-2", "2026-10-17T11:01:00Z", 1, body);
    expect(a.type).toBe("roster_transfer");
    expect(a.payload).toEqual(body);
  });

  it("defaults unknown base_version to 0", () => {
    const a = buildScoreAction("act-3", "2026-10-17T11:00:00Z", undefined, { event_id: "e", match_id: "m", type: "score", payload: {} });
    expect(a.base_version).toBe(0);
  });

  it("rejects timestamps with milliseconds and bad ids", () => {
    expect(() => buildScoreAction("act-4", "2026-10-17T11:00:00.123Z", 0, { event_id: "e", match_id: "m", type: "score", payload: {} })).toThrow();
    expect(() => buildScoreAction("bad|id", "2026-10-17T11:00:00Z", 0, { event_id: "e", match_id: "m", type: "score", payload: {} })).toThrow();
  });

  it("wraps actions in a {device_id, actions} envelope of at most 100", () => {
    const a = buildScoreAction("act-5", "2026-10-17T11:00:00Z", 0, { event_id: "e", match_id: "m", type: "score", payload: {} });
    const env = buildSyncEnvelope("dev-1", Array.from({ length: 120 }, () => a));
    expect(Object.keys(env).sort()).toEqual(["actions", "device_id"]);
    expect(env.actions).toHaveLength(100);
  });

  it("describes sync results in plain language", () => {
    expect(describeResult({ status: "applied", resolution: "rebased_append", error_code: null }, messageForCode).label).toBe("Synced");
    expect(describeResult({ status: "duplicate", resolution: "skipped_duplicate", error_code: null }, messageForCode).label).toBe("Already synced");
    const r = describeResult({ status: "rejected", resolution: "server_wins", error_code: "SQUAD_FULL" }, messageForCode);
    expect(r.label).toBe("Not applied");
    expect(r.detail).toBe("The destination squad is full.");
  });
});
