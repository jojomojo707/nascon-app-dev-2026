# 16 — Offline Sync API (`POST /audit/v1/offline-sync`)

Scope: server-side replay of actions queued by a mobile device while offline, with conflict resolution. The mobile app must queue actions in **exactly this format** and sync through this logic (the app may call this route or a production route backed by **identical code**). On-device desk-check behaviour is in [18-mobile-app.md](18-mobile-app.md). Rules that reject actions come from [11-leagues-events-scoring.md](11-leagues-events-scoring.md) and [13-roster.md](13-roster.md).

## Request
```json
{
  "device_id": "dev-1",
  "actions": [
    { "action_id": "a1", "type": "score_event", "queued_at": "2026-10-17T11:00:00Z", "base_version": 3,
      "payload": { "event_id": "evt-9", "match_id": "m1", "type": "score",
                   "payload": { "team_id": "t1", "event_type": "goal" } } },
    { "action_id": "a2", "type": "roster_transfer", "queued_at": "2026-10-17T11:01:00Z", "base_version": 1,
      "payload": { "...": "the same body as POST /audit/v1/roster/transfer" } }
  ]
}
```
- `actions`: **1–100** items, else 400 `VALIDATION_ERROR`. Only a malformed envelope is a 400.
- `type`: `score_event` (payload = the `/events` request body) or `roster_transfer` (payload = the `/roster/transfer` body).
- `base_version`: the version the device last saw. `score_event`: the match's version (number of events). `roster_transfer`: the number of audit entries of that player.
- **Processing order:** the server sorts actions by `queued_at` ascending (ties: array order) and processes them one by one, each against the state left by the previous one. **Results are returned in request order.**

## Per-action result and conflict resolution (exact)

| Situation (when this action is processed) | `status` | `resolution` | `error_code` |
| --- | --- | --- | --- |
| Rules allow it and `base_version == current version` | `applied` | `appended` | `null` |
| Rules allow it but `base_version < current version` (stale device) | `applied` | `rebased_append` | `null` |
| `(device_id, action_id)` already processed before, **or** the same `event_id` already exists with an identical payload | `duplicate` | `skipped_duplicate` | `null` |
| Any rule of events (§[11](11-leagues-events-scoring.md)) / roster (§[13](13-roster.md)) would reject the action (e.g. `MATCH_NOT_IN_PROGRESS`, `INVALID_COMPENSATION`, `NOT_IN_SQUAD`, `SQUAD_FULL`, `DUPLICATE_EVENT_ID`) | `rejected` | `server_wins` | that rule's code |
| `base_version > current version` | `rejected` | `server_wins` | `INVALID_BASE_VERSION` |
| Unknown id referenced (match, player, squad) | `rejected` | `server_wins` | the matching `*_NOT_FOUND` |

## Response 200
```json
{ "device_id": "dev-1",
  "results": [ { "action_id": "a1", "status": "applied", "resolution": "rebased_append", "error_code": null,
                 "processed_order": 1, "server_version": 5, "signature": "<hex for score_event, else null>" },
               { "action_id": "a2", "status": "rejected", "resolution": "server_wins",
                 "error_code": "SQUAD_FULL", "processed_order": 2, "server_version": 1, "signature": null } ],
  "summary": { "applied": 1, "rejected": 1, "duplicate": 0 } }
```
- `processed_order`: position in the server's processing order (after sorting by `queued_at`).
- `server_version`: version of the affected match/player **after** processing (unchanged for rejected/duplicate).
- `signature`: the event signature ([06-signature-hmac.md](06-signature-hmac.md)) for applied `score_event` actions; `null` otherwise.
- **Re-sending the same request must return `duplicate` for every action and change nothing.**
- The whole request is **always HTTP 200** (conflicts are reported per action); only a malformed envelope is 400.

Note: the source example shows `status:"applied"` with `resolution:"rebased_append"` for a1 although its `base_version` is 3 — consistent only if the match's current version was > 3 at processing time.

## Scoring weight
Offline Mobile Persistence & Sync = 4 points (script on this route + on-device desk check). Same proportional rule as other areas ([19-scoring-rubric-penalties.md](19-scoring-rubric-penalties.md)).
