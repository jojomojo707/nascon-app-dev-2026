# 11 — Leagues, Events (Event Sourcing) & Score Projection

Scope: `POST /audit/v1/leagues`, `POST /audit/v1/events`, `GET /audit/v1/score/{match_id}`. The scoring engine is **append-only and event-sourced**; the score is always rebuilt from the log. Signing: [06-signature-hmac.md](06-signature-hmac.md). Sport configs: [08-sports-config.md](08-sports-config.md). Standings consume these logs: [12-standings.md](12-standings.md).

---

## POST /audit/v1/leagues — register a league for standings

Registers teams, the full fixture list, and standings configuration. Each fixture automatically becomes a **match stream** (status `upcoming`) fed through `/events`.

```json
{
  "league_id": "lg-1",
  "sport_id": "football",
  "teams": ["t1", "t2", "t3", "t4"],
  "fixtures": [ { "match_id": "m1", "home": "t1", "away": "t2" },
                { "match_id": "m2", "home": "t3", "away": "t4" } ],
  "points": { "win": 3, "draw": 1, "loss": 0 },
  "tie_break_order": ["h2h_points", "h2h_diff", "overall_diff", "scored", "fair_play", "draw_lots"],
  "qualification": { "spots": 2 },
  "lots_seed": 42
}
```
- Required: `league_id`, `sport_id`, `teams`, `fixtures`, and `qualification.spots`.
- Sport must exist → else 404 `SPORT_NOT_FOUND`.
- Teams unique, **2–40**. Fixture teams must be in `teams`; `home ≠ away` (violations → 400).
- `match_id` already used → 409 `MATCH_EXISTS`; league id used → 409 `LEAGUE_EXISTS`.
- `points`: optional ints, default win 3 / draw 1 / loss 0.
- `tie_break_order`: optional, same tokens as sport config; default = the sport's order.
- `qualification.spots`: required int `1..number of teams` (top-N qualify for playoffs).
- `lots_seed`: optional int; default = the seed given to the last `/reset` (42 if none).
- **Response 201:** `{"league_id":"lg-1","status":"created","team_count":4,"fixture_count":2}`

---

## POST /audit/v1/events

```json
{
  "event_id": "evt-0003",
  "match_id": "m1",
  "type": "score",
  "payload": { "team_id": "t1", "event_type": "goal" }
}
```

A match stream exists if it is a league fixture or its `match_init` was accepted. `match_init` for an existing stream → 409 `MATCH_EXISTS`; any other event for a missing stream → 404 `MATCH_NOT_FOUND`.

### Event types

| `type` | `payload` | Allowed when / rule |
| --- | --- | --- |
| `match_init` | `{sport_id, home_team_id, away_team_id}` (+ optional `league_id`) | Creates a stand-alone match, status `upcoming`. Unknown sport → 404 `SPORT_NOT_FOUND`. |
| `match_start` | `{}` | Status must be `upcoming` → becomes `in_progress`; else 409 `ILLEGAL_TRANSITION`. |
| `score` | `{team_id, event_type}` | Status `in_progress` (else 409 `MATCH_NOT_IN_PROGRESS`). `team_id` must be home or away (else 400). `event_type` must exist in the sport's `scoring_events` (else 400 `UNKNOWN_EVENT_TYPE`). Points/runs/rounds come from the sport config. |
| `discipline` | `{team_id, points}` (integer, usually negative) | Status `in_progress`. Adds to the team's fair-play total (higher is better). |
| `tiebreak_winner` | `{team_id}` | Status `in_progress`. Declares the winner of a shootout / overtime / super over **without changing the score**. |
| `match_end` | `{}` | Status must be `in_progress` (else 409 `ILLEGAL_TRANSITION`) → `completed`. If score is level, `draw_allowed` is false, and no active `tiebreak_winner` exists → 409 `TIE_NOT_ALLOWED`. |
| `compensation` | `{compensates, reason}` | Any status after init, **including completed**. `compensates` = `event_id` of a `score`, `discipline`, or `tiebreak_winner` event of the **same match**. Unknown → 404 `EVENT_NOT_FOUND`; already compensated, other type, or other match → 409 `INVALID_COMPENSATION`. |

Not specified in source: the exact error code for "team_id not home/away" (only "else 400"; `VALIDATION_ERROR` is the natural choice) — flag, don't invent a new code.

### Rules
- **Model limits (config-driven):**
  - innings model: a team's legal balls ≥ `innings_per_team × overs_per_innings × balls_per_over`, **or** wickets ≥ `innings_per_team × wickets_per_innings` → further `score` events for that team → 409 `INNINGS_COMPLETE`.
  - round model: once a team has ≥ `(best_of + 1) / 2` rounds, further `score` events → 409 `SERIES_ALREADY_DECIDED`.
  - Compensated events do **not** count toward these limits.
- **Append-only log.** Compensation appends a new signed event; the original row is never modified. The projection treats a compensated event (and the compensation itself) as neutral.
- **Idempotency.** Same `event_id` with an identical body → 200 with the stored response. Same `event_id` with a different body → 409 `DUPLICATE_EVENT_ID`.
- The score must be **rebuilt from the event log on read** (no mutable counters as source of truth).
- Match status values in this API: `upcoming`, `in_progress`, `completed` (derived from the log). Status changes should also broadcast in real time ([02](02-functional-and-nonfunctional-requirements.md) FR-1.3).

### Event response — 201 (200 on idempotent replay)
```json
{ "event_id": "evt-0003", "match_id": "m1", "type": "score", "sequence": 3, "match_version": 3,
  "signature": "9f2c...64 lowercase hex chars..." }
```
- `sequence` = 1-based position in that match's log (compensations and every other type count).
- `match_version` = number of events in the log after this append.
- `signature` per [06-signature-hmac.md](06-signature-hmac.md) with `id = event_id` and canonical JSON of the request `payload`.

---

## GET /audit/v1/score/{match_id}

### Response 200
```json
{
  "match_id": "m1", "sport_id": "football", "league_id": "lg-1",
  "status": "completed",
  "outcome": "home_win",
  "winner_team_id": "t1",
  "tiebreak_winner_team_id": null,
  "home": { "team_id": "t1", "score": 2, "wickets": null, "balls": null, "overs": null, "fair_play": 0 },
  "away": { "team_id": "t2", "score": 1, "wickets": null, "balls": null, "overs": null, "fair_play": -1 },
  "version": 9,
  "events": [ { "sequence": 1, "event_id": "evt-0001", "type": "match_init", "payload": {},
                "signature": "...", "compensated": false, "compensated_by": null } ]
}
```
(`events[0].payload` is `{...}` in the source.)

| Field | Definition |
| --- | --- |
| `status` | `upcoming`, `in_progress`, or `completed` (derived from the log). |
| `outcome` | `pending` while not completed; when completed: `home_win`, `away_win`, `draw`, or `undecided` (level score, `draw_allowed` false, no active tie-break winner — e.g. after the tie-break event was compensated). |
| `score` | event model: sum of points. innings model: total runs. round model: rounds won. **Active (non-compensated) events only.** |
| `wickets`, `balls`, `overs` | innings model only (else `null`). `balls` = legal balls faced by that team; `overs` = string `"{balls div bpo}.{balls mod bpo}"`, e.g. `"3.2"`. |
| `winner_team_id` | Higher score; if level, the active `tiebreak_winner` team; else `null`. |
| `events` | All events in sequence order, including compensated ones and compensations. `compensated` is true for a targeted event; `compensated_by` holds the compensating `event_id`. |
| `version` | Number of events in the log. |
| `fair_play` | Sum of the team's active `discipline` points. |

Unknown match → 404 `MATCH_NOT_FOUND`.
