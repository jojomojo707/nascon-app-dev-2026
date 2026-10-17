# 10 — Fixtures: Single & Double Elimination (`POST /audit/v1/fixtures`)

Scope: `single_elim` and `double_elim` formats. Shared endpoint rules (pure computation, seed order = array order, team limits single 2–128 / double 3–128, 400 on violations) are in [09-fixtures-round-robin-swiss.md](09-fixtures-round-robin-swiss.md).

---

## C) `format = "single_elim"`

### Request
```json
{ "format": "single_elim", "teams": ["t1","t2","t3","t4","t5","t6"],
  "params": { "third_place_match": false, "results": [ { "match_id": "R1M2", "winner": "t4" } ] } }
```

### Bracket construction (exact)
- Bracket size `B` = next power of two ≥ n.
- Seed order built recursively: `order(2) = [1, 2]`; `order(2k)` = for each `s` in `order(k)`: `[s, 2k + 1 − s]`. So `order(8) = [1, 8, 4, 5, 2, 7, 3, 6]`.
- Round-1 match `i` takes the `(2i − 1)`-th and `2i`-th entries; the **lower seed number is home**.
- A seed number > n is missing: that match has `bye:true`, `away:null`, and its winner is the present team.
- Example n = 6, B = 8: R1M1: seed 1 vs (seed 8 missing) BYE; R1M2: seed 4 vs seed 5; R1M3: seed 2 vs (seed 7 missing) BYE; R1M4: seed 3 vs seed 6.

### Response 200
```json
{ "format": "single_elim", "bracket_size": 8,
  "rounds": [ { "round": 1, "matches": [ MATCH, MATCH, MATCH, MATCH ] },
              { "round": 2, "...": "..." }, { "round": 3, "...": "..." } ] }
```
MATCH object (all fields mandatory; plus the conditional fields for double elimination below):
```json
{ "match_id": "R1M2", "bracket": "main", "round": 1, "index": 2,
  "home": "t4", "away": "t5", "home_seed": 4, "away_seed": 5, "bye": false,
  "winner": null, "loser": null,
  "winner_to": { "match_id": "R2M1", "slot": "away" }, "loser_to": null }
```

### Rules
- `match_id = R{round}M{index}`; index counts from 1 in bracket order. Rounds = `log2 B`. Final: `winner_to: null`.
- Advancement: winner of `R{r}M{i}` goes to `R{r+1}M{ceil(i/2)}`, slot `home` if i is odd, `away` if even.
- `home`/`away` are `null` while unknown. **Bye winners are propagated immediately** (e.g. `R2M1.home = t1`).
- `params.results`: items `{match_id, winner}`; the winner is filled into `winner`/`loser` and propagated into `winner_to`. Unknown `match_id`, or a winner who is not a participant of that match → 400.
- `third_place_match: true` adds a match `TP` (`bracket:"third_place"`) between the two semifinal losers (`loser_to` of both semifinals points to TP, slots home/away).

---

## D) `format = "double_elim"`

### Request
```json
{ "format": "double_elim", "teams": ["t1","t2","t3","t4","t5","t6","t7","t8"],
  "params": { "bracket_reset": true, "results": [ { "match_id": "WR1M1", "winner": "t1" } ] } }
```

### Response 200
```json
{ "format": "double_elim", "bracket_size": 8, "bracket_reset": true,
  "winners": [ { "round": 1, "matches": [ "MATCH..." ] } ],
  "losers":  [ { "round": 1, "matches": [ "MATCH..." ] } ],
  "grand_final": [ "GF1_MATCH", "GF2_MATCH" ] }
```

### Rules
- `B` and the WR1 seeding are **identical to single elimination (exact)**. Same MATCH object; `bracket` ∈ `winners`, `losers`, `grand_final`.
- **Ids and counts (exact)**, with `B = 2^k`:
  - Winners bracket `WR{r}M{i}`: round r has `B / 2^r` matches (r = 1..k).
  - Losers bracket `LR{r}M{i}`: rounds `1..2(k − 1)`; rounds `2j − 1` and `2j` each have `B / 2^(j+1)` matches (j = 1..k − 1). **Total losers matches = B − 2.**
  - Grand final `GF1`; `GF2` exists **only** when `bracket_reset: true`.
- **Routing (checked as a graph; exact slot mapping inside the losers bracket is free):**
  - Every non-terminal match has `winner_to`; every winners-bracket match has `loser_to`; losers-bracket matches have `loser_to: null`.
  - Every match slot except WR1 is fed by exactly one source.
  - WR final winner → `GF1.home`; WR final loser → LB final `away`; LB final winner → `GF1.away`.
  - Recommended routing: WR1 losers meet each other in LR1; WRr (r ≥ 2) losers drop into LR(2r − 2).
- **Bracket reset:** `GF2` has `conditional: true` and the same two teams as GF1. Its `required` is `null` until GF1 has a result; then `true` iff `bracket_reset` is true **and** the GF1 winner is the losers-bracket champion (`GF1.away`); otherwise `false`. A winners-bracket champion who wins GF1 ends the event.
- WR1 byes (non-power-of-two fields) are graded as in single elimination. Whether losers-bracket matches fed by a missing team carry `bye:true` is **not graded**.
