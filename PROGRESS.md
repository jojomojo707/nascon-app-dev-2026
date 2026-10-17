# Progress (backend + overall)

Mobile progress lives in `mobile/PROGRESS.md` (built on a separate branch by a parallel agent, merged into `main` at checkpoints).
Plan: `/home/asad/.claude/plans/implement-the-full-nascon-woolly-sunbeam.md` (slices 1–11 + 14:45 hard checkpoint).

## Done
- Slice 1: backend bootstrap (Express 5 + pg, plain JS), Dockerfile (`node:20-alpine`), compose `api` + `worker`, schema at startup, healthchecks.
- Slice 2: `GET /health`, `POST /audit/v1/reset` with exact baseline (tenants, store, RBAC scenario, 5 demo users, 4 sports as data).
- Clean `docker compose down -v && up -d --build` verified at 13:06 (42 s; health 200 within 1 s after).

## In progress
- Slice 3: sports config.

## To do
3 sports · 4 fixtures · 5 leagues/events/score · 6 standings · 7 roster · 8 checkout · 9 RBAC/JWT/413 · 10 offline-sync · 14:45 checkpoint · 11 /api/v1 wrappers + demo seed.

## Decisions
- MinIO: Docker Hub refuses `minio/minio` pulls ("requested access to the resource is denied"); Quay has no such tag. The service stays in compose under profile `objectstore` (not started by default). Receipts are stored in Postgres (`orders.receipt_pdf`). Approved by the user.
- Unknown routes return 404 with `VALIDATION_ERROR` (no route-not-found code exists in spec 05).
- `/reset` with an unknown variant in `stock` → 404 `VARIANT_NOT_FOUND`; non-integer or negative values → 400.
- Seeded sport event keys: football `goal`; basketball `free_throw`, `two_pointer`, `three_pointer`; cricket `dot_ball`, `single`, `two`, `four`, `six`, `wide`, `no_ball`, `wicket`; esports `round_win`. Positions `gk`, `wicketkeeper`.
- The rate limiter is in memory (single API process), counting accepted requests only.
- Demo content for the judges comes from `POST /api/v1/demo/seed` (super admin), not from reset.

## Blocked
- None.

## Handoff
- Run: `DAY1_SALT=test docker compose up -d --build`, then `curl localhost:8080/health`. Tests: `./run_tests.sh`.
- Code: `backend/src/{lib,db,domain/<area>,routes/{audit,api}}`. Pure logic goes in `domain/<area>/*.js`; SQL goes in `service.js`.
