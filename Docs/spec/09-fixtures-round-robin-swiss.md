# 09 — Fixtures: Round-Robin & Swiss (`POST /audit/v1/fixtures`)

Scope: the shared endpoint contract plus the `round_robin` and `swiss` formats. Elimination formats are in [10-fixtures-elimination.md](10-fixtures-elimination.md). Custom implementation only — third-party fixture-generation libraries are **prohibited**.

## Shared endpoint rules
- **Pure computation: stores nothing.** Input `{format, teams, params}`; `teams` = array of unique team-id strings.
- For `swiss`, `single_elim`, `double_elim` the array order is the **seed order** (index 0 = seed 1).
- Team-count limits (violation → 400 `VALIDATION_ERROR`): round robin **2–40**; swiss **2–64**; single elim **2–128**; double elim **3–128**.
- Scripts check rules and structure, never one specific schedule (many valid schedules exist) — except where marked "exact".
- Error/validation conventions: [04-api-conventions.md](04-api-conventions.md).

---

## A) `format = "round_robin"`

### Request
```json
{ "format": "round_robin", "teams": ["t1","t2","t3","t4","t5"],
  "params": { "legs": 1,
              "withdrawals": [ { "team_id": "t3", "after_round": 2 } ],
              "withdrawal_policy": "forfeit_remaining" } }
```
- `legs`: 1 (single) or 2 (double); default 1.
- `withdrawals`: default `[]`; `after_round` = the last (global) round the team still plays; `0` = never plays.
- `withdrawal_policy`: `void_all` or `forfeit_remaining` (default).

### Response 200
```json
{ "format": "round_robin", "legs": 1, "team_count": 5, "round_count": 5,
  "rounds": [
    { "round": 1,
      "matches": [ { "match_id": "RR-L1-R1-M1", "leg": 1, "home": "t2", "away": "t5",
                     "status": "scheduled", "awarded_to": null },
                   { "match_id": "RR-L1-R1-M2", "leg": 1, "home": "t3", "away": "t4",
                     "status": "scheduled", "awarded_to": null } ],
      "byes": ["t1"] } ],
  "summary": { "total": 10, "scheduled": 8, "forfeit": 2, "voided": 0 } }
```

### Rules
- Rounds per leg: `n − 1` (n even) or `n` (n odd). Matches per round: `⌊n/2⌋`. `byes` is `[]` for even n, exactly one team for odd n.
- Round numbers are **global**: leg 2 continues after leg 1. `match_id` format `RR-L{leg}-R{round}-M{index}` (index from 1 within the round).
- Each team plays exactly once per round, except its bye round. For odd n every team has exactly one bye per leg.
- Every unordered pair meets exactly `legs` times; with `legs = 2` every ordered pair (home, away) occurs exactly once.
- Home/away balance (circle method): within each leg, for every team `|home games − away games| ≤ 1`.
- `forfeit_remaining`: fixtures involving a withdrawn team with `round > after_round` get `status:"forfeit"` and `awarded_to` = the opponent; earlier fixtures stay `scheduled`.
- `void_all`: every fixture involving the withdrawn team (any round) gets `status:"voided"`, `awarded_to:null`.
- A fixture where **both** teams are withdrawn is voided. Fixtures are never removed from the list. Byes are unaffected.
- `withdrawals` with an unknown team, or `after_round` outside `0..round_count` → 400.
- `summary` counts: `total`, `scheduled`, `forfeit`, `voided`.

---

## B) `format = "swiss"`
One call pairs **one** round. The caller supplies results of earlier rounds in `history`.

### Request
```json
{ "format": "swiss", "teams": ["t1","t2","t3","t4","t5"],
  "params": { "total_rounds": 3, "round": 2,
    "history": [ { "round": 1, "bye": "t5",
                   "matches": [ {"home":"t1","away":"t3","result":"home"},
                                {"home":"t2","away":"t4","result":"draw"} ] } ] } }
```
- `total_rounds`: integer `1..n−1`; default `⌈log2 n⌉`.
- `round`: the round to pair, `1..total_rounds`; default 1.
- `history` must contain **exactly** rounds `1..round−1`, else 400.
- `history[].matches[].result`: `home`, `away`, or `draw`. `history[].bye`: team id that received a bye, or `null`.

### Response 200
```json
{ "format": "swiss", "round": 2, "total_rounds": 3,
  "pairings": [ { "match_id": "SW-R2-M1", "home": "t1", "away": "t2" },
                { "match_id": "SW-R2-M2", "home": "t5", "away": "t4" } ],
  "bye": "t3",
  "standings": [ { "rank": 1, "team_id": "t1", "score": 1.0, "buchholz": 0.0 },
                 { "rank": 2, "team_id": "t5", "score": 1.0, "buchholz": 0.0 },
                 { "rank": 3, "team_id": "t2", "score": 0.5, "buchholz": 0.5 } ] }
```
(Example list is truncated with "..." in the source.) `match_id` format `SW-R{round}-M{index}`.

### Rules
- Scoring: win = 1, draw = 0.5, loss = 0, **bye = 1 (counted as a win)**.
- `standings` reflect **history only** (before the round being paired), sorted by score desc, then buchholz desc, then seed (lower index first).
- Buchholz = sum of the **current scores** of every opponent the team actually played; **a bye contributes 0**. `score` and `buchholz` are compared exactly.
- **Round 1 (exact):** let `m = ⌊n/2⌋`. If n is odd the **last seed** gets the bye. Pair seed `i` with seed `i + m` for `i = 1..m` (home = lower seed number).
- **Rounds ≥ 2 (checked as properties):**
  - (a) every team appears at most once;
  - (b) no pair has met before;
  - (c) with odd n exactly one bye, given to the **lowest-scoring team that has not had a bye** (tie → lowest seed, i.e. largest index); if no valid pairing exists for the rest, try the next-lowest candidate;
  - (d) the sum over pairs of `|score difference|` equals the **minimum achievable** over all rematch-free pairings — greedy pairing that gets stuck will fail; use backtracking/matching.
  - Home/away is not checked.
- If no complete rematch-free pairing exists for **any** bye candidate: `409 NO_VALID_PAIRING` with `details.round`.
