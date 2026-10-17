# 01 — Overview, Deadlines, Submission Package

Scope: what is being built, the timeline, hard-lock rules, repo layout, push checkpoints, pre-submission checklist.

## Competition facts
- Competition: App Dev Competition NaSCon '26 — **Part I: Multi-Sport League & Club Operations Platform**.
- Total points: **50** (Backend Platform 36 + Offline Mobile 4 + Mobile UI/HCI 10 — see [19-scoring-rubric-penalties.md](19-scoring-rubric-penalties.md)).
- Prizes: Winner PKR 35,000 — Runner-Up PKR 15,000.
- Venues: A-01, A-02, A-03, A-101, A-102.
- Day 1 Sprint: Saturday, Oct 17, 10:45 AM – 03:00 PM PKT.
- Phase I is permanently locked at **15:00 PKT**; final push deadline **15:05:00 PKT**.
- Authority: the original document is the complete, binding API contract. If any verbal statement conflicts with it, the document wins.

## Project overview
Design and build a production-style, **multi-tenant** sports league and club-operations platform combining rule-driven league management, fixture scheduling, club roster operations, and a concurrency-safe in-app merchandise store. Two deliverable surfaces:
1. **Mobile application** (Android or iOS — one platform suffices for 100% mobile credit) for players, club managers, league organizers, and signed-in viewers. → [18-mobile-app.md](18-mobile-app.md)
2. **Backend platform**: REST API, realtime WebSocket/SSE layer, event-sourced scoring engine, internal job queue, admin configuration endpoints.

## Phase I engineering outcomes
Teams must demonstrate ability to:
- model a flexible, rule-driven domain (multi-sport, multi-format) in a relational schema **without hard-coded sport logic**;
- implement and unit-test scheduling and standings algorithms (round-robin, Swiss, single and double elimination);
- build an append-only event-sourced scoring engine with compensating rollback events;
- implement 5-tier RBAC with strict tenant isolation;
- deliver offline-tolerant mobile persistence with local action queueing and conflict synchronization;
- deliver a usable, accessible mobile interface following basic HCI/UI principles.

## Phase I hard lock and per-team salt
- Part I (50 pts) is evaluated **automatically by Python grading scripts**, permanently locked at 15:00 PKT.
- Every event-sourced score record and checkout receipt must carry a signature: `HMAC SHA256(DAY1_SALT, id + "|" + payload)` using the unique DAY1 SALT on the team's slip. Exact recipe → [06-signature-hmac.md](06-signature-hmac.md).
- Part II (Day 2: 45 objective points + 15 viva points) scope is confidential; released tomorrow 10:15 AM PKT. (Not part of this spec.)

## Submission package and GitHub rules
- Graded from the team's GitHub repo. Must be **public** (grader clones without credentials). URL must be registered with the volunteer at the venue desk **before 11:15 AM**.
- Repo root must contain:

| Path (repo root) | Requirement |
| --- | --- |
| `docker-compose.yml` | Brings up the entire backend (API on host port 8080, database, cache, queue, object store, workers). Must forward the salt as `DAY1_SALT: ${DAY1_SALT}`. |
| `.env.example` | Lists every environment variable. Must **not** contain the real salt. |
| `README.md` | Run instructions and the five demo accounts (see [18-mobile-app.md](18-mobile-app.md) §Demo accounts). |
| `TRACEABILITY.md` | Maps every FR/NFR ID to source files and automated tests. |
| `tests/`, `run_tests.sh`, `COVERAGE.json` | Unit tests; one script that runs them; coverage file (format in [19-scoring-rubric-penalties.md](19-scoring-rubric-penalties.md)). |
| `mobile/` | Mobile source code and built app at `mobile/release/app-release.apk` (Android). iOS teams: see [18-mobile-app.md](18-mobile-app.md). |

### GitHub push checkpoints
- At least one commit must be pushed (GitHub push time) inside **each** window (PKT): **10:45–11:45, 11:45–12:45, 12:45–13:45, 13:45–14:45**.
- Each missed window costs 2 points (max −8).
- Grader checks out the **last commit pushed at or before 15:05:00 PKT**; later pushes are ignored.

## Pre-submission checklist (Appendix C)
- [ ] `DAY1_SALT=<salt> docker compose up -d --build` works on a clean machine; `/health` is 200 in under 2 minutes.
- [ ] `POST /audit/v1/reset` twice in a row leaves identical data; the 5 demo accounts and all seed ids exist.
- [ ] Every response matches the field names in the API sections (compare JSON with the examples character by character).
- [ ] Signatures verified against Appendix A test vector 1 using own salt logic.
- [ ] 20 parallel checkouts on stock 1 → one 201, nineteen 409, stock 0, reserved 0.
- [ ] `/audit/v1/*` is not rate limited; `/api/v1/ping` is.
- [ ] `COVERAGE.json`, `TRACEABILITY.md`, `README.md`, `.env.example`, and `mobile/release/app-release.apk` committed and pushed.
- [ ] Last commit pushed before 15:05:00 PKT.

Closing notes from the source: "If your code works on the first try, check again. It's probably the wrong problem." / "Understanding The Problem Is Also Part Of The Problem."

## Dispute / interpretation windows
Also in [19-scoring-rubric-penalties.md](19-scoring-rubric-penalties.md) (final ranking & disputes): interpretation questions in writing before 13:00 PKT.
