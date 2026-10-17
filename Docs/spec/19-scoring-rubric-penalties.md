# 19 — Scoring, Rubric, Coverage Bonus, Penalties, Ranking & Disputes

Scope: how Phase I (50 points) is graded. Use this to prioritise work and avoid penalties. Deadlines/push windows: [01-overview-and-submission.md](01-overview-and-submission.md).

## 9.1 Point groups

| Phase I graded component | Max | Verification |
| --- | --- | --- |
| Backend Platform — six areas | 36 | Python grading scripts on the grader machine |
| Offline Mobile Persistence & Sync Queue | 4 | Python script (`/offline-sync`) + on-device desk check ([18-mobile-app.md](18-mobile-app.md)) |
| Mobile UI & HCI Principles — five areas | 10 | Judge panel, same three tasks for every team |
| **Total Phase I** (permanently locked 15:00 PKT) | **50** | |

The six backend areas (36 pts total; per-area weights are not stated individually):
1. Fixture algorithms ×4 (round-robin, Swiss, single elim, double elim) vs hidden vectors → [09](09-fixtures-round-robin-swiss.md), [10](10-fixtures-elimination.md)
2. Event-sourced scoring engine (mystery-sport config, compensating-event rollback) → [08](08-sports-config.md), [11](11-leagues-events-scoring.md)
3. Standings engine (3-way H2H mini-league, differentials, clinched/eliminated) → [12](12-standings.md)
4. Store concurrency (20 simultaneous buyers on last unit, PDF receipt) → [14](14-store-checkout.md)
5. Club, roster, transfer-window and loan rules (hidden conflict and audit-trail vectors) → [13](13-roster.md)
6. RBAC 5-role negative matrix, tenant isolation, API security (boundary probes) → [15](15-rbac-security.md)

## 9.2 Scoring function
- For every backend area worth P points, tested against **|V| ≥ 40 hidden vectors** of which n pass (proportional: partial credit comes from passing more vectors).
- A vector passes only if **every assertion** holds (status code, error code, every compared field, signatures). No partial credit inside one vector.
- The offline-sync script portion uses the same proportional rule (no coverage bonus). UI/HCI is scored by judges.
- Hidden vectors include seeded sports and newly created mystery sports, odd/even and non-power-of-two sizes, and **every error code in** [05-error-codes.md](05-error-codes.md).

## 9.3 Coverage bonus file
Commit `COVERAGE.json` at repo root with line-coverage percentages for the six backend areas:
```json
{ "fixtures": 91.2, "scoring": 88.0, "standings": 86.5, "store": 90.1, "roster": 87.3, "rbac": 85.0 }
```
- The grader reads this file. Judges may run `./run_tests.sh` for any team; if the real figure is **more than 2 percentage points below** the declared one, that area's bonus is voided.
- (Bonus magnitude is not stated in the source.)

## 9.4 Penalties
Floored at 0; applied to the total of 50.

| Penalty | Points | Definition |
| --- | --- | --- |
| Non-reproducible Docker stack | −10 | `docker compose up -d --build` fails, exceeds the time limits ([03-infra-and-stack.md](03-infra-and-stack.md)), or needs manual steps (after one automatic retry). |
| Hard-coded sport logic | −8 | Any branch on a specific sport or event name (e.g. "football", "goal") in the domain logic, found by code scan or revealed by mystery-sport vectors. |
| Prohibited managed BaaS | −10 | Any proprietary single-vendor backend service used for a graded feature. |
| Missed GitHub push checkpoint | −2 each | A window of [01-overview-and-submission.md](01-overview-and-submission.md) with no pushed commit (maximum −8). |

## 9.5 Final ranking and disputes
- Ranking uses the final score. Ties broken by: (1) higher backend score, (2) fewer penalty points, (3) earlier timestamp of the final pushed commit.
- The script result is final. Organizers re-run the grader once only if a failure is clearly caused by the organizers' environment (not the team's stack).
- Questions about interpretation of the contract must be raised **in writing before 13:00 PKT**; the organizers' written answer applies to all teams.
- Score appeals must be filed within **30 minutes** of results being shown; the organizers' decision is final.
