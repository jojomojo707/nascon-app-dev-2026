# 17 — Hidden Complexity Edge Cases (Routing Table)

Scope: the six edge cases the grading vectors and the Top-8 Viva test. This file is only a **pointer table**; the full behaviour is defined in the linked file and must be read there (no duplication here).

| # | Edge case | Where / required behaviour | Full spec |
| --- | --- | --- | --- |
| 1 | Round-robin with an odd number of teams and a mid-season team withdrawal | `/fixtures` round_robin: one bye per round; `withdrawals` + `withdrawal_policy` (`void_all` or `forfeit_remaining`) exactly as defined | [09-fixtures-round-robin-swiss.md](09-fixtures-round-robin-swiss.md) §A |
| 2 | Swiss rounds where no valid non-repeating pairing exists for some participants | `/fixtures` swiss: search globally (backtracking); if no rematch-free pairing exists for any bye candidate → 409 `NO_VALID_PAIRING` | [09-fixtures-round-robin-swiss.md](09-fixtures-round-robin-swiss.md) §B |
| 3 | Double elimination with a bracket reset on the grand final | `/fixtures` double_elim: `GF2.conditional`; `GF2.required` becomes true only when the losers-bracket champion wins GF1 | [10-fixtures-elimination.md](10-fixtures-elimination.md) §D |
| 4 | A three-way tie in the standings requiring the head-to-head mini-league tie-breaker | `/standings`: `resolve(group)` with h2h computed only among the tied teams, restart-on-split rule | [12-standings.md](12-standings.md) |
| 5 | A match result corrected via compensating event after playoff qualification was already determined | `/events` compensation on a completed match; the next `/standings` call recomputes ranks, status and h2h from scratch; original events stay unchanged in `/score` | [11-leagues-events-scoring.md](11-leagues-events-scoring.md), [12-standings.md](12-standings.md) |
| 6 | A player transferred on the last day of the transfer window while having an in-progress match | `/roster/transfer`: accepted with `state:"deferred_until_match_end"` and `blocking_match_id` | [13-roster.md](13-roster.md) |

Hidden vectors also include: seeded sports and newly created mystery sports, odd/even and non-power-of-two sizes, and every error code in [05-error-codes.md](05-error-codes.md) ([19-scoring-rubric-penalties.md](19-scoring-rubric-penalties.md)).
