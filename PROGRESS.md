# Progress (backend + overall)

Mobile progress is in `mobile/PROGRESS.md`. The mobile source is merged into `main`; the release build uses the existing mobile worktree and its cached Android dependencies.
Plan: `/home/asad/.claude/plans/implement-the-full-nascon-woolly-sunbeam.md`.

## Done (all pushed to `main`)
1. Bootstrap: Express 5 + pg (plain JS), `backend/Dockerfile` (`node:20-alpine`), compose `api` + `worker`, schema and seed at startup. A clean `down -v && up -d --build` takes about 42 s and `/health` is 200 within about 2 s.
2. `GET /health`, `POST /audit/v1/reset`: exact baseline, repeatable.
3. `POST /audit/v1/sports`: validator for each model; the seeded sports are data.
4. `POST /audit/v1/fixtures`: round robin (circle method, withdrawals), Swiss (exact R1, branch-and-bound minimum pairing, NO_VALID_PAIRING), single elim, double elim (GF2 conditional).
5. `POST /audit/v1/leagues`, `POST /audit/v1/events`, `GET /audit/v1/score/{id}`: append-only log, per-match row lock, compensation, model limits, signatures.
6. `GET /audit/v1/standings/{id}`: recursive resolve, H2H mini-league, NRR, draw lots, clinched/eliminated.
7. Roster setup/transfer/history: 8 ordered checks, loans with a single loan_return entry, deferred state.
8. Checkout/inventory: conditional decrement, mock gateway, signed PDF receipt. Verified live: 1×201 and 19×409, ending at stock 0 and reserved 0.
9. RBAC matrix + 7 probes, HS256 JWT verification, `/api/v1` rate limit, 413.
10. `POST /audit/v1/offline-sync`: one shared service, also used by `/api/v1/offline-sync`.
11. `/api/v1/*` wrappers for the app, plus `POST /api/v1/demo/seed`.
- Unit tests: 67 passing (`./run_tests.sh`). E2E: 5 passing (`scripts/e2e.sh`).
- `COVERAGE.json` comes from `node scripts/coverage-areas.mjs --write`; Node 20 and Node 24 give identical figures.
- Docs: README, TRACEABILITY, ADR (8), `.env.example`.

## In progress
- Release APK build, device smoke test and final submission.

## To do
- 14:45 hard checkpoint: clean compose up, tests, merge mobile + APK, update docs, push. Final push before 15:05:00.
- Realtime WebSocket `/api/v1/ws?token=<jwt>` is live (protocol in mobile/architecture/07; `src/lib/realtime.js`).

## Release verification (2026-10-17)
- 14:05–14:06 PKT: clean `docker compose down -v` followed by `DAY1_SALT=test docker compose up -d --build`; `/health` returned 200. All 5 live-stack checks passed, then demo content was seeded again.
- Backend: all 67 unit tests pass; measured per-area coverage matches `COVERAGE.json` unchanged.
- Mobile: TypeScript check and all 15 Jest tests pass. Production Android JavaScript/Hermes export succeeds.
- All five demo accounts log in and load their tenant lists. Fixtures (6), standings, live match, pinned product, club profile and squads respond successfully; authenticated WebSocket connects.
- The connected Samsung A52s is authorized for ADB with `tcp:8080` reversed to the laptop. Install/device checks await the APK.

## Decisions (minor, logged)
- MinIO is behind profile `objectstore`, because Docker Hub denies `minio/minio` pulls. Receipts live in Postgres. (User-approved.)
- Unknown routes → 404 `VALIDATION_ERROR` (spec 05 has no route-not-found code).
- `/reset` with an unknown variant in `stock` → 404 `VARIANT_NOT_FOUND`.
- Seeded event keys: football `goal`; basketball `free_throw`, `two_pointer`, `three_pointer`; cricket `dot_ball`, `single`, `two`, `four`, `six`, `wide`, `no_ball`, `wicket`; esports `round_win`. Positions: `gk`, `wicketkeeper`.
- Events:
  - Order of checks: schema 400 → identical replay 200 → match 404 → semantic 400 (team not in match = `VALIDATION_ERROR`, `UNKNOWN_EVENT_TYPE`) → compensation target 404 → `DUPLICATE_EVENT_ID` 409 → state 409s.
  - Round model: once either team reaches a majority, any further score event → `SERIES_ALREADY_DECIDED`.
  - Outcome: if the score is level and an active tiebreak winner exists, that team wins. Otherwise the result is `draw` if draws are allowed, else `undecided`.
- Leagues: duplicate `match_id` inside one request → 400. `lots_seed` default = the last reset seed when the league is created.
- Fixtures:
  - A round-robin fixture is "affected" by a withdrawn team when `round > after_round`. Affected by both teams → voided; by one → forfeit to the other. `void_all` voids every fixture involving a withdrawn team.
  - `bracket_reset` and `third_place_match` default to false. The TP match is listed in the final round's matches.
  - GF1 carries `conditional: false, required: true`. With a bracket reset, GF1's `winner_to` → GF2 home and `loser_to` → GF2 away. Until GF1 is played, GF2 mirrors GF1's teams.
  - Losers-bracket matches fed by a bye auto-advance (not graded).
- Roster:
  - State is evaluated as of `effective_date`. A reused `request_id` with a different body → 400 `VALIDATION_ERROR` `fields:["request_id"]` (spec 05 has no roster DUPLICATE code).
  - `reason` and `requested_by` are optional. The loan_return entry is written once, by the history call or by the next accepted transfer.
- Checkout:
  - Unknown payment tokens are declined (402 `PAYMENT_DECLINED`). Failed orders (402/409) aren't stored, so a retry re-attempts.
  - Checks run: validate (400), then identical replay (200), then variants (404), then discount (400), then `DUPLICATE_ORDER_ID` (409).
- RBAC:
  - Probes are mounted before the body parser so authorization comes first. A body over 1 MB on an authorized probe → 413.
  - Unknown probe targets: 403 for non-super-admins, allowed for the super admin.
- Offline sync:
  - Order of checks: (device, action) already processed → duplicate; then payload 400; then not found; then identical `event_id`/`request_id` → duplicate; then `base_version > current` → `INVALID_BASE_VERSION`; then the domain rules.
  - Not-found and payload-invalid rejections report `server_version: 0`. Every processed action is recorded, so a re-send returns all duplicates.
- Rate limiter: in memory, per IP, counting accepted requests only.
- Demo content comes from `POST /api/v1/demo/seed` (super admin), never from reset.
- Coverage figures: lines hit / lines found per area, over the files the unit tests load (lcov). DB glue (`service.js`) is exercised by e2e, not unit tests.

## Blocked
- None. (Organizer questions were due by 13:00 and none were sent; ambiguities are logged above.)

## Handoff
- Run: `DAY1_SALT=test docker compose up -d --build`, then `curl localhost:8080/health`. Tests: `./run_tests.sh`, `scripts/e2e.sh`.
- Code: `backend/src/{lib,db,domain/<area>,routes/{audit,api},middleware}`. Pure rules go in `domain/<area>/*.js`; SQL goes in `service.js`. Every audit route is in `routes/audit/index.js`, the probes in `routes/audit/rbac.js`, the app routes in `routes/api/index.js`.
- After changing tests or code, refresh coverage with `node scripts/coverage-areas.mjs --write`. Never hand-edit the figures.
