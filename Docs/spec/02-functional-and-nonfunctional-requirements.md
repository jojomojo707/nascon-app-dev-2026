# 02 — Functional & Non-Functional Requirements (FR / NFR)

Scope: the requirement IDs that `TRACEABILITY.md` must map to source files and automated tests. Concrete API shapes live in the topic files linked per requirement.

> Every FR/NFR ID below must appear in `TRACEABILITY.md` with source files + automated tests.

## 3.1 Sport and League Hierarchy Management

### FR-1.1 Multi-Sport Taxonomy and Event-Sourced Scoring
- Support arbitrary sports (seed Football, Basketball, Cricket, Esports) **without code changes**. Adding a "mystery sport" during grading must work purely through JSON configuration (`POST /audit/v1/sports`). → [08-sports-config.md](08-sports-config.md)
- Each sport defines its rule set and scoring template **as data**: periods or innings structure, period duration, points per scoring event type, tie-break order, draw allowed (yes/no), overtime or shootout policy, roster size limits, required positions.
- Scoring templates support three models: **event-based** (goals, baskets worth 1/2/3), **innings-based** (runs, wickets, overs), **round/map-based** (esports best-of-N).
- Event sourcing: live match scores are computed from an **append-only** stream of match events. Corrections (e.g., a disallowed goal) are made by appending a **compensating event signed with DAY1_SALT**, never by mutating historical rows. → [11-leagues-events-scoring.md](11-leagues-events-scoring.md)

### FR-1.2 League and Tournament Setup
Admins configure single-stage leagues, multi-division structures with promotion and relegation rules, knockout tournaments, and hybrid formats (group stage followed by a seeded knockout bracket), all scoped to **seasons**.

### FR-1.3 Match and Fixture Scheduling
Custom implementation — **third-party fixture-generation libraries are prohibited**. Four formats: → [09-fixtures-round-robin-swiss.md](09-fixtures-round-robin-swiss.md), [10-fixtures-elimination.md](10-fixtures-elimination.md)
1. Round-robin: single and double, correct home/away balance using the circle method, odd team counts handled via byes.
2. Swiss-system: pairing by score group, no repeat pairings, bye handling, configurable number of rounds, Buchholz tie-break.
3. Single elimination: byes for non-power-of-two fields and seeded bracket placement.
4. Double elimination: winners bracket, losers bracket, grand final with optional bracket reset.

Also required:
- **Manual rescheduling tools with real-time conflict detection**: venue double-booking, team overlap, player overlap across squads (a player registered in two squads), minimum rest period between matches, venue availability windows. Conflicts returned as **structured JSON errors identifying the conflicting entity IDs**.
- **Match status state machine** (product-level): Upcoming, In-Progress, Completed, Postponed, Abandoned, Cancelled. Illegal transitions rejected server-side. Status changes broadcast in real time to connected clients. Postponing a match automatically re-evaluates downstream bracket slots and re-runs conflict detection.
  - Note: the graded `/audit/v1` API only exercises upcoming / in_progress / completed (see [11-leagues-events-scoring.md](11-leagues-events-scoring.md)); the six-state machine is the production-domain requirement.

### FR-1.4 Automated Standings and Tables → [12-standings.md](12-standings.md)
- Auto-generated points tables with configurable points per win/draw/loss.
- Tie-breakers in configurable order: (1) head-to-head points, (2) head-to-head differential (including 3-way mini-league), (3) overall differential, (4) goals/points scored, (5) fair-play points, (6) seeded drawing of lots.
- Head-to-head matrices for any pair of teams, sport-specific differentials (goal, point, run-rate, map), and playoff qualification status (clinched, eliminated, still possible) — **recomputed from scratch** whenever a result or compensating event is recorded.

## 3.2 Club, Roster and Merchandise Store Operations

### FR-2.1 Club Profiles and Tenant Isolation
Dedicated club portal with home venue coordinates, social handles, historical statistics across seasons, active roster, and staff (coach, manager, physio). Clubs belong to a **white-label tenant** (logo, colors, name) with strict tenant data isolation.

### FR-2.2 Roster and Player Registry → [13-roster.md](13-roster.md)
- Add, transfer, loan (with start and end dates and automatic return), and release players across squads.
- Enforce: configurable transfer windows per league, maximum squad size, one active registration per league season (except valid loans), minimum sport-specific position requirements, role assignments (Captain, Vice-Captain, Starter, Substitute).
- Full immutable audit trail: every roster change records who, when, and why, viewable in history.

### FR-2.3 Integrated Club Merchandise Store → [14-store-checkout.md](14-store-checkout.md)
- Product catalogue: apparel, accessories, digital items with variants (size, color), scheduled price changes, discount codes.
- Concurrency-safe inventory (NFR-3): stock tracked per variant, reserved during checkout against the team's **mock payment gateway** (authorization, capture, failure, refund simulation), guaranteeing zero overselling under concurrent purchases.
- Order states: Pending, Paid, Packed, Shipped, Delivered, Cancelled, Refunded; each transition emits a structured domain event to the internal queue.
- Server-side PDF receipt generation and embeddable product showcases on match pages (pinning a product updates connected clients in real time).

## 3.3 Cross-Cutting Access Control

### FR-5.1 Five-Tier Role-Based Access Control → [15-rbac-security.md](15-rbac-security.md)
- Five tiers: Platform Super-Admin, League Organizer, Club Manager, Player, General Viewer.
- Scoped permissions: a League Organizer controls only their leagues; a Club Manager controls only their club; tenant isolation is absolute.
- Implement RBAC via a database policy matrix or policy-as-code layer, with **negative authorization tests for every role boundary**.

## 4. Non-Functional Requirements

| ID | Requirement | Minimum acceptance bar |
| --- | --- | --- |
| NFR-3 | Concurrency correctness | Last 1 unit of stock bought by 20 simultaneous buyers yields exactly 1 successful order and 0 negative inventory → [14-store-checkout.md](14-store-checkout.md) |
| NFR-4 | Offline tolerance | Mobile app caches fixtures, standings, and profiles locally (SQLite/Room/Hive); offline scoring and roster actions queue locally and sync with conflict handling → [16-offline-sync.md](16-offline-sync.md), [18-mobile-app.md](18-mobile-app.md) |
| NFR-5 | Security | OWASP Mobile/API Top 10 compliance; secure token storage (Keystore/Keychain); rate limiting; input validation; 5-role RBAC enforcement → [15-rbac-security.md](15-rbac-security.md) |
| NFR-7 | Reproducibility | One command (`docker compose up -d --build`) brings up the full backend and seeds baseline data on a clean Linux machine → [03-infra-and-stack.md](03-infra-and-stack.md) |

(IDs NFR-1, 2, 6 and FR-1.x/2.x/5.x gaps are not defined in this Part I document; do not invent them.)
