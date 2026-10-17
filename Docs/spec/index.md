# NaSCon '26 App Dev — Part I Spec: Index (Routing Layer)

**Project:** Multi-Sport League & Club Operations Platform (backend + mobile). 50 points, graded by Python scripts + judges, hard-locked at 15:00 PKT (push deadline 15:05:00 PKT).

This folder is the problem statement split by topic. **Source of truth for each topic is its own file.** Original single document (kept for fallback only): [`../NaSCon 26 App Dev Part 1-1.md`](../NaSCon%2026%20App%20Dev%20Part%201-1.md).

## How to use this index
1. Find the task below, open **only** the listed file(s).
2. Each file is self-contained and links onward only for neighbouring concerns. Don't re-derive rules from memory — read the file.
3. If a detail isn't in these files, it isn't in the spec: **flag it, don't invent it.** Spots where the source is silent are marked "Not specified" in the relevant file.
4. The API contract is binding: field names, types, status codes and error codes are compared literally. On conflict, the contract wins over any assumption.

## Files

### Context & rules of the game
| File | What it contains |
| --- | --- |
| [01-overview-and-submission.md](01-overview-and-submission.md) | Project overview, timeline, hard lock, repo layout, 4 push windows, **pre-submission checklist**. |
| [02-functional-and-nonfunctional-requirements.md](02-functional-and-nonfunctional-requirements.md) | All FR/NFR IDs (FR-1.1…FR-5.1, NFR-3/4/5/7) — the list `TRACEABILITY.md` must map. |
| [03-infra-and-stack.md](03-infra-and-stack.md) | Docker Compose requirement, approved OSS stack, grader machine/startup/health timing, salt handling. |
| [19-scoring-rubric-penalties.md](19-scoring-rubric-penalties.md) | Point split (36/4/10), hidden-vector scoring, `COVERAGE.json`, penalties, ranking, disputes. |

### API contract — global
| File | What it contains |
| --- | --- |
| [04-api-conventions.md](04-api-conventions.md) | Endpoint index, ids/timestamps/money rules, validation order, idempotency, status codes, error body shape. **Read first before any endpoint.** |
| [05-error-codes.md](05-error-codes.md) | Full error-code catalogue (code ↔ HTTP status ↔ when). |
| [06-signature-hmac.md](06-signature-hmac.md) | HMAC-SHA256 signing recipe, canonical JSON, reference code, test vectors (signature + draw-lots). |
| [07-reset-seed-health.md](07-reset-seed-health.md) | `/health`, `/audit/v1/reset`, exact baseline seed (tenants, store, RBAC ids, 4 seeded sports). |

### API contract — by feature
| File | What it contains |
| --- | --- |
| [08-sports-config.md](08-sports-config.md) | `POST /audit/v1/sports` — mystery sport from JSON; field rules for event/innings/round models. |
| [09-fixtures-round-robin-swiss.md](09-fixtures-round-robin-swiss.md) | `POST /audit/v1/fixtures` shared rules + round-robin (withdrawals, byes, circle method) + Swiss (Buchholz, backtracking). |
| [10-fixtures-elimination.md](10-fixtures-elimination.md) | Single-elim (seeding order, byes, TP match) + double-elim (winners/losers/grand final, bracket reset). |
| [11-leagues-events-scoring.md](11-leagues-events-scoring.md) | `/leagues`, `/events` (event types, compensation, idempotency, model limits), `/score` projection. |
| [12-standings.md](12-standings.md) | `/standings` — tie-break `resolve()` algorithm, net run rate, H2H, clinched/eliminated formulas, draw-lots. |
| [13-roster.md](13-roster.md) | `/roster/setup`, `/roster/transfer` (8 ordered rule checks), loans & auto-return, audit history. |
| [14-store-checkout.md](14-store-checkout.md) | `/checkout` (20-buyer concurrency, mock gateway tokens, PDF receipt), `/inventory`. |
| [15-rbac-security.md](15-rbac-security.md) | `/rbac-matrix`, 7 probe routes + allow/deny matrix, JWT rules, rate limit, injection & 1 MB probes. |
| [16-offline-sync.md](16-offline-sync.md) | `/offline-sync` — action format, processing order, conflict-resolution table, response. |
| [17-edge-cases.md](17-edge-cases.md) | The 6 hidden edge cases as a pointer table into the files above. |

### Mobile
| File | What it contains |
| --- | --- |
| [18-mobile-app.md](18-mobile-app.md) | Platform/APK, required screens, **5 demo accounts**, offline desk-check steps, UI/HCI judging tasks and 5 areas. |

## Task → file quick lookup

| I need to… | Open |
| --- | --- |
| Set up repo, compose, README, deadlines | 01, 03 |
| Write `TRACEABILITY.md` | 02 |
| Add any endpoint / shape a response / pick a status code | 04, 05 |
| Sign events or receipts; compute lots keys | 06 |
| Implement reset, seed data, demo users, `/health` | 07, 18 (demo accounts) |
| Sports as data / no hard-coded sport logic | 08, 19 (penalty) |
| Generate schedules or brackets | 09, 10 |
| Match lifecycle, scoring, compensation, `/score` | 11 |
| Table, tie-breaks, qualification status | 12 (+06 for lots) |
| Transfers, loans, squad rules, audit trail | 13 |
| Merchandise, stock, payments, PDF | 14 |
| JWT, roles, tenant isolation, rate limit | 15 |
| Offline queue, sync, conflict resolution | 16, 18 |
| Build mobile screens / UI polish | 18 |
| Understand how points are lost or won | 19 |
| Check hidden edge cases | 17 |

## Cross-cutting rules (one-line reminders; details in the linked files)
- No hard-coded sport/event names in domain logic (−8) → 08, 19.
- `DAY1_SALT` from env only; never committed → 03, 06.
- `/audit/v1/*` + `/health` not rate-limited; `/api/v1/*` is → 15.
- First failing validation step wins: 400 → 404 → 409/402 → 04.
- Idempotent replay returns 200 with the stored result → 04.
- Scores/standings are always recomputed from the append-only event log → 11, 12.
