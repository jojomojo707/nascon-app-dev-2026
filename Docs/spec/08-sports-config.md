# 08 — Mystery Sport from JSON (`POST /audit/v1/sports`)

Scope: creating a sport purely from data. The new sport must be **immediately usable** in `/events`, `/leagues`, `/standings`, and `/fixtures` with no code change or restart. Event names are arbitrary — **never hard-code** names such as "goal" or "wicket" (−8 penalty).

Related: seeded sports ([07-reset-seed-health.md](07-reset-seed-health.md)); how configs drive scoring ([11-leagues-events-scoring.md](11-leagues-events-scoring.md)); tie-break tokens ([12-standings.md](12-standings.md)); roster limits ([13-roster.md](13-roster.md)).

## Example request (event model)
```json
{
  "sport_id": "kabaddi",
  "name": "Kabaddi",
  "scoring_model": "event",
  "periods": { "count": 2, "duration_minutes": 20 },
  "scoring_events": {
    "raid_point": { "points": 1 },
    "tackle_point": { "points": 1 },
    "all_out": { "points": 2 }
  },
  "draw_allowed": false,
  "overtime": { "policy": "golden_score", "duration_minutes": 5 },
  "tie_break_order": ["h2h_points", "h2h_diff", "overall_diff", "scored", "fair_play", "draw_lots"],
  "roster": { "min_squad_size": 7, "max_squad_size": 12,
              "required_positions": { "raider": 2, "defender": 3 } }
}
```

## Fragments for the other two models
```
innings model:
"periods": { "innings_per_team": 1, "overs_per_innings": 10, "balls_per_over": 6, "wickets_per_innings": 10 },
"scoring_events": { "super_six": { "runs": 6, "legal_ball": true, "wicket": false },
                    "bye_run":   { "runs": 1, "legal_ball": false, "wicket": false },
                    "out":       { "runs": 0, "legal_ball": true, "wicket": true } }

round model:
"periods": { "best_of": 5 },
"scoring_events": { "map_win": { "rounds": 1 } }
```

## Field rules

| Field | Type | Rules |
| --- | --- | --- |
| `sport_id` | string | Required. Regex `^[a-z0-9_-]{2,40}$`. Duplicate → 409 `SPORT_EXISTS`. |
| `name` | string | Required, 1–80 chars. |
| `scoring_model` | enum | Required: `event`, `innings`, or `round`. |
| `periods` | object | Required. **event**: `count` ≥ 1, `duration_minutes` ≥ 1. **innings**: `innings_per_team`, `overs_per_innings`, `balls_per_over`, `wickets_per_innings` (integers ≥ 1). **round**: `best_of` (odd integer ≥ 1). |
| `scoring_events` | object | Required, ≥ 1 key; key regex `^[a-z0-9_]{1,40}$`. Value per model — **event**: `{points}` (int ≥ 1); **innings**: `runs` (int ≥ 0), `legal_ball` (bool), `wicket` (bool); **round**: `{rounds}` (int ≥ 1). |
| `draw_allowed` | boolean | Required. |
| `overtime` | object | Required: `policy` ∈ `none`, `extra_time`, `shootout`, `golden_score`, `super_over`; optional `duration_minutes` (int ≥ 0). |
| `tie_break_order` | array | Optional. Items from `h2h_points`, `h2h_diff`, `overall_diff`, `scored`, `fair_play`, `draw_lots` (no repeats). Default = the full list. `draw_lots` is **always applied last**, even if omitted. |
| `roster` | object | Required: `min_squad_size`, `max_squad_size` (ints ≥ 1, min ≤ max), `required_positions` (position → minimum count, may be `{}`). |

## Responses
- `201` `{ "sport_id": "kabaddi", "status": "created", "config": { ...stored config, echoed... } }`
- `400 VALIDATION_ERROR` (`details.fields` lists bad fields)
- `409 SPORT_EXISTS`

Also graded: input-validation probe — a `sport_id` such as `x'; DROP TABLE sports;--` must give `400 VALIDATION_ERROR`, never a 5xx ([15-rbac-security.md](15-rbac-security.md)).
