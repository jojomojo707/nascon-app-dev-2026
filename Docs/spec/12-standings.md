# 12 — Standings Engine (`GET /audit/v1/standings/{league_id}`)

Scope: ordering algorithm, differentials, H2H, qualification status. Input data comes from the event logs of the league's fixtures ([11-leagues-events-scoring.md](11-leagues-events-scoring.md)). Draw-lots hash test vector: [06-signature-hmac.md](06-signature-hmac.md).

**Recomputed from scratch from the event logs on every call.** Only matches with `status = completed` **and** `outcome ≠ undecided` count as played; all other fixtures are "remaining". Unknown league → 404 `LEAGUE_NOT_FOUND`.

## Response shape
```json
{
  "league_id": "lg-1", "sport_id": "football", "qualification_spots": 2,
  "table": [
    { "rank": 1, "team_id": "t1", "played": 3, "won": 2, "drawn": 1, "lost": 0,
      "scored": 7, "conceded": 2, "diff": 5, "points": 7, "fair_play": 0,
      "status": "clinched", "resolved_by": null }
  ],
  "h2h": { "t1": { "t2": { "played": 1, "points": 3, "scored": 2, "conceded": 1 } } }
}
```
(`...` elisions in the source: more table rows, more h2h entries.)

## Field definitions

| Field | Definition |
| --- | --- |
| `points` | `won × win + drawn × draw + lost × loss` (from the league's `points` config). A win decided by `tiebreak_winner` counts as a win. |
| `scored` / `conceded` | Sum of score for / against (goals, points, runs, rounds). |
| `diff` (event model) | `scored − conceded`. |
| `diff` (round model) | Rounds won − rounds lost (map differential). |
| `diff` (innings model) | **Net run rate** = total runs scored ÷ total overs faced − total runs conceded ÷ total overs bowled, **rounded to 3 decimals**. Overs = legal balls ÷ `balls_per_over` (decimal). An innings that ended with `wickets ≥ wickets_per_innings` counts as the full `overs_per_innings`. Overs bowled = the opponent's overs faced. |
| `fair_play` | Sum of the team's active `discipline` points. |
| `h2h` | `h2h[a][b]` = results of `a` against `b` over all completed matches between them: `played`, `points` earned by a, `scored` by a, `conceded` by a. Present for **every ordered pair** of teams (zeros when never met). |
| `resolved_by` | Name of the criterion that placed this team above the next team it was tied with on points (`h2h_points`, `h2h_diff`, `overall_diff`, `scored`, `fair_play`, `draw_lots`), or `null` if not tied. |
| `status` | `clinched`, `eliminated`, or `still_possible` (see below). |

## Ordering algorithm (exact)
1. Sort teams by points descending. Teams with equal points form a **tied group**.
2. Resolve each tied group with `resolve(group)`: for each criterion in `tie_break_order` (then `draw_lots`), compute the criterion for every team of the group; if the values are not all equal, **split the group into sub-groups by value (best first)**; every sub-group of size > 1 is resolved by calling `resolve` on it **again from the first criterion**; stop.
3. Criterion definitions:
   - `h2h_points` = points earned only in completed matches **among the teams of the current group** (the 3-way mini-league when the group has three teams).
   - `h2h_diff` = diff computed only over those same matches (net run rate over those matches for innings sports).
   - `overall_diff`, `scored`, `fair_play` use **all** completed league matches.
   - Higher is better for all.
4. `draw_lots`: order the remaining teams **ascending** by `SHA256_hex(lots_seed + "|" + league_id + "|" + team_id)` (decimal seed, UTF-8). First = best. Deterministic; compared exactly.

Tie-break token list (default order): `h2h_points`, `h2h_diff`, `overall_diff`, `scored`, `fair_play`, `draw_lots`. `draw_lots` is always applied last. `lots_seed` default: seed from last reset (42 if none).

## Qualification status (exact; uses points only, tie-breaks ignored)
Let `W` = win points, `R(T)` = number of remaining fixtures of team T, `max(T) = points(T) + W × R(T)`, `k = qualification.spots`.
- **clinched** if fewer than `k` other teams X satisfy `max(X) ≥ points(T)`.
- **eliminated** if at least `k` other teams X satisfy `points(X) > max(T)`.
- otherwise **still_possible**. (Clinched is checked first.)

## Correction behaviour (edge case 5)
A result corrected through a compensating event after qualification was already determined: the next standings call recomputes ranks, status and h2h from scratch; original events remain unchanged in `/score`. See [17-edge-cases.md](17-edge-cases.md).
