# 13 — Roster, Transfers, Loans & Audit History

Scope: `POST /audit/v1/roster/setup`, `POST /audit/v1/roster/transfer`, `GET /audit/v1/roster/history/{player_id}`. Product-level requirement (FR-2.2) is in [02-functional-and-nonfunctional-requirements.md](02-functional-and-nonfunctional-requirements.md). Sport roster defaults come from [08-sports-config.md](08-sports-config.md). Offline queueing of `roster_transfer` actions: [16-offline-sync.md](16-offline-sync.md).

---

## POST /audit/v1/roster/setup
Builds a scenario; **re-sending the same `league_id` replaces that league's roster state.**

```json
{
  "league": { "league_id": "lg-r1", "tenant_id": "tenant-alpha", "sport_id": "football",
              "transfer_window": { "open": "2026-09-01", "close": "2026-09-30" },
              "max_squad_size": 3, "required_positions": { "gk": 1 } },
  "squads": [ { "squad_id": "sq-a", "club_id": "club-a", "tenant_id": "tenant-alpha", "name": "A" },
              { "squad_id": "sq-b", "club_id": "club-b", "tenant_id": "tenant-alpha", "name": "B" } ],
  "players": [ { "player_id": "p1", "name": "Ali",   "position": "gk", "squad_id": "sq-a", "role": "captain" },
               { "player_id": "p2", "name": "Bilal", "position": "df", "squad_id": "sq-a", "role": "starter" } ],
  "matches_in_progress": [ { "match_id": "m-live", "home_squad_id": "sq-a", "away_squad_id": "sq-b" } ]
}
```
- **Response 201:** `{"league_id":"lg-r1","status":"configured","squad_counts":{"sq-a":2,"sq-b":0}}`
- `role` ∈ `captain`, `vice_captain`, `starter`, `substitute`.
- `required_positions` = minimum players per position a squad must keep. If `max_squad_size` / `required_positions` are omitted they **default from the sport's roster config**.
- Window dates are **inclusive**.
- A player is "in an in-progress match" when their squad is the home or away squad of any entry in `matches_in_progress`.

---

## POST /audit/v1/roster/transfer

```json
{
  "request_id": "tr-001", "league_id": "lg-r1", "player_id": "p2",
  "type": "transfer",
  "from_squad_id": "sq-a", "to_squad_id": "sq-b",
  "effective_date": "2026-09-30",
  "loan_end_date": null,
  "reason": "Tactical move", "requested_by": "user-77"
}
```
- `type` ∈ `"transfer"`, `"loan"`, `"release"`.
- `to_squad_id` is `null` for release.
- `loan_end_date` is required (and `> effective_date`) **only for loan**.

### Rule checks — evaluated in this exact order; the first failure is returned

| # | Check | Result |
| --- | --- | --- |
| 1 | Schema, dates, `loan_end_date > effective_date`, `to_squad_id` present unless release | 400 `VALIDATION_ERROR` |
| 2 | League / player / squads exist | 404 `LEAGUE_NOT_FOUND`, `PLAYER_NOT_FOUND`, `SQUAD_NOT_FOUND` |
| 3 | From and to squads belong to the league's tenant | 409 `CROSS_TENANT_TRANSFER` |
| 4 | Player's current squad in this league equals `from_squad_id` | 409 `NOT_IN_SQUAD` |
| 5 | transfer/loan: `effective_date` inside the window (inclusive). **Release is allowed on any date.** | 409 `TRANSFER_WINDOW_CLOSED` |
| 6 | Player is not currently on loan (transfer/loan/release of a loaned player is refused) | 409 `PLAYER_ON_LOAN` |
| 7 | transfer/loan: destination squad count + 1 ≤ `max_squad_size` | 409 `SQUAD_FULL` |
| 8 | After the move, the from-squad still has ≥ the required count for the player's position | 409 `MIN_POSITION_VIOLATION` |

### Effects
- **transfer:** player moves permanently, new role = `substitute`; if the old role was captain/vice_captain, that slot in the old squad becomes vacant.
- **loan:** player belongs to the borrower from `effective_date` through `loan_end_date` (inclusive); `parent_squad_id` = the lender; player counts toward the borrower's squad size and no longer toward the lender's.
- **release:** player leaves the league (no squad).

### Automatic loan return
The day after `loan_end_date` the player is back with the lender (role `substitute`). Because the grader cannot wait, it passes `as_of` to the history call; the return must then appear as a `loan_return` audit entry (**written once, never duplicated on repeated calls**).

### In-progress match (edge case 6)
If the player is in an in-progress match, the request is **still accepted** (the window is judged on `effective_date`, so the last window day works) with `state:"deferred_until_match_end"` and `blocking_match_id`; the player stays eligible for that match with the old squad. Otherwise `state:"active"`, `blocking_match_id:null`.

### Audit trail
Every accepted roster change appends **one immutable entry**. Rejected requests change nothing and write no entry. **Idempotency by `request_id`** (replay → 200, same body).

### Transfer response — 201 (200 on replay)
```json
{ "request_id": "tr-001", "status": "accepted", "state": "active", "blocking_match_id": null,
  "registration": { "player_id": "p2", "league_id": "lg-r1", "squad_id": "sq-b", "parent_squad_id": null,
                    "registration_type": "transfer", "start_date": "2026-09-30", "loan_end_date": null,
                    "role": "substitute" },
  "audit_entry": { "audit_id": "au-0001", "action": "transfer", "player_id": "p2", "league_id": "lg-r1",
                   "from_squad_id": "sq-a", "to_squad_id": "sq-b", "effective_date": "2026-09-30",
                   "state": "active", "who": "user-77", "when": "2026-09-30T08:12:44Z",
                   "why": "Tactical move" } }
```
- For **release**, `registration` is `null`. For **loan**, `registration_type:"loan"`, `parent_squad_id` = lender, `loan_end_date` set.
- `audit_entry.action` ∈ `transfer`, `loan`, `release`, `loan_return`.
- `who` = `requested_by` (or `"system"` for `loan_return`); `when` = server time; `why` = `reason`.

---

## GET /audit/v1/roster/history/{player_id}?as_of=YYYY-MM-DD

### Response 200
```json
{ "player_id": "p2", "as_of": "2027-01-05", "league_id": "lg-r1",
  "current_squad_id": "sq-a", "parent_squad_id": null,
  "history": [ { "...": "audit_entry (loan)" }, { "...": "audit_entry (loan_return)" } ] }
```
- `history` lists entries **oldest-first** and is append-only.
- `as_of` optional (default = today's server date); `current_squad_id` = the squad the player belongs to on that date (`null` if released).
- Unknown player → 404 `PLAYER_NOT_FOUND`.
