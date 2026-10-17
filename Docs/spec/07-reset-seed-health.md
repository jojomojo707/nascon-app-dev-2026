# 07 — Health Probe, Reset & Baseline Seed Data

Scope: `GET /health`, `POST /audit/v1/reset`, and the exact seed content that reset must (re)create. The four seeded sports use the same schema as [08-sports-config.md](08-sports-config.md).

## GET /health
Returns `200 {"status":"ok"}` **only when** the database is reachable **and** baseline data is seeded. No auth. Not rate limited.

## POST /audit/v1/reset
Wipes all state (matches, events, leagues, rosters, orders, offline-sync records, custom sports) and re-creates the baseline below. Must be **repeatable and leave identical state every time**. Must finish within 10 s.

### Request (body optional)
```json
{ "seed": 42, "stock": { "var-jersey-001-M": 1, "var-jersey-001-L": 5 } }
```
- `seed`: integer, optional, default `42`; used for the drawing-of-lots tie-break ([12-standings.md](12-standings.md); also default `lots_seed` for leagues).
- `stock`: map `variant_id → integer ≥ 0`; defaults: M = 1, L = 5.

### Response 200
```json
{
  "status": "reset_complete",
  "seed": 42,
  "sports": ["football", "basketball", "cricket", "esports"],
  "tenants": ["tenant-alpha", "tenant-beta"],
  "stock": { "var-jersey-001-M": 1, "var-jersey-001-L": 5 }
}
```

## Baseline data (exact ids)

| Item | Seed content |
| --- | --- |
| Tenants | `tenant-alpha` ("Alpha Sports"), `tenant-beta` ("Beta Athletics"). |
| Store | Product `prod-jersey-001` (tenant-alpha). Variants `var-jersey-001-M` and `var-jersey-001-L`, each `price_minor = 450000`, currency `PKR`. Discount code `WELCOME10` = 10% off subtotal. |
| RBAC scenario | Leagues `league-alpha-1`, `league-alpha-2` (tenant-alpha), `league-beta-1` (tenant-beta); clubs `club-alpha-1`, `club-alpha-2`, `club-beta-1`; players `player-alpha-1` (club-alpha-1), `player-alpha-2` (club-alpha-2), `player-beta-1` (club-beta-1). |
| Demo users | The five accounts in [18-mobile-app.md](18-mobile-app.md) §Demo accounts, bound to the scenario above. Must exist after every startup **and** every reset. |
| Sports | The four sports below, stored as ordinary data using the same schema as `POST /audit/v1/sports`. |

### Seeded sports

| sport_id | Model | Periods | Scoring events | Draw | Overtime | Roster |
| --- | --- | --- | --- | --- | --- | --- |
| `football` | event | 2×45 min | goal = 1 point | yes | none | min 11, max 25, gk ≥ 1 |
| `basketball` | event | 4×12 min | free throw = 1, two pointer = 2, three pointer = 3 | no | extra time, 5 min | min 5, max 15 |
| `cricket` | innings | 1 innings/team, 20 overs, 6 balls/over, 10 wickets | dot ball (0 runs, legal), single (1), two (2), four (4), six (6), wide (1 run, not legal), no ball (1 run, not legal), wicket (0 runs, legal, wicket) | yes | super over | min 11, max 18, wicketkeeper ≥ 1 |
| `esports` | round | best of 3 | round win = 1 round | no | none | min 5, max 8 |

Notes / not specified in source (do not guess silently):
- Exact event-key identifiers for basketball and cricket (e.g. spelling of `free_throw`, `dot_ball`) and position keys (e.g. `gk`, `wicketkeeper`) are not given; the only identifiers used in examples are `goal` (football) and `gk` (position, in roster setup example). Choose snake_case keys matching the names above and keep them data-driven.
- Seeded sports' `tie_break_order` is not listed; use the default full list `["h2h_points","h2h_diff","overall_diff","scored","fair_play","draw_lots"]`.
- Domain logic must **never branch on sport id or event name** (−8 penalty) — see [19-scoring-rubric-penalties.md](19-scoring-rubric-penalties.md).
