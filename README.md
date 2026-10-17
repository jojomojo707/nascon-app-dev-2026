# NaSCon '26 App Dev — Part I: Multi-Sport League & Club Operations Platform

Backend (REST API, event-sourced scoring, mock payments, internal job queue) and an offline-first mobile app.

## Run the backend

Requires only Docker (Compose v2).

```bash
DAY1_SALT=<your-salt> docker compose up -d --build      # Git Bash / Linux
# PowerShell: $env:DAY1_SALT="<your-salt>"; docker compose up -d --build
curl http://localhost:8080/health                         # {"status":"ok"} once seeded
docker compose down -v                                    # stop and delete all data
```

Services: `api` (Node 20, port 8080), `worker` (consumes order/match domain events from RabbitMQ), `db` (PostgreSQL 16), `cache` (Redis 7), `queue` (RabbitMQ 3.13).

- The schema and baseline seed are created automatically when the API starts.
- `DAY1_SALT` is read only from the environment.
- `.env.example` lists every variable.
- The object store (`storage`, MinIO) is behind the `objectstore` profile because its bundle image cannot currently be pulled from Docker Hub. Start it with `docker compose --profile objectstore up -d`. Receipts are stored in Postgres, so nothing depends on it (see `ADR.md`, ADR-7).

## Tests

```bash
./run_tests.sh                       # unit tests + line coverage (Node's built-in runner; uses Docker if Node is absent)
node scripts/coverage-areas.mjs      # per-area figures used in COVERAGE.json
scripts/e2e.sh                       # live checks against the running stack (20-buyer burst, RBAC, 413, rate limit, sync)
```

## Demo accounts

Password for all: `Nascon@26`

| Role | Email |
| --- | --- |
| Platform Super-Admin | admin@nascon.test |
| League Organizer (owns league-alpha-1) | organizer@nascon.test |
| Club Manager (owns club-alpha-1) | manager@nascon.test |
| Player (player-alpha-1) | player@nascon.test |
| General Viewer | viewer@nascon.test |

They exist after every startup and every `POST /audit/v1/reset`.

### Demo content for the mobile judging

Reset recreates only the spec baseline. To fill `league-alpha-1` with fixtures, results, a live match, squads and a second product, sign in as the super admin and call the demo seed once:

```bash
TOKEN=$(curl -s -X POST localhost:8080/api/v1/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"admin@nascon.test","password":"Nascon@26"}' | sed 's/.*"token":"\([^"]*\)".*/\1/')
curl -X POST localhost:8080/api/v1/demo/seed -H "Authorization: Bearer $TOKEN"
```

## Mobile app

Source in `mobile/`; the release APK is `mobile/release/app-release.apk` (Android 10+). Set the server address on the login or settings screen: `http://10.0.2.2:8080` on the emulator, or `http://<laptop LAN IP>:8080` on a phone (use the team hotspot; campus Wi-Fi isolates devices).

For a USB-connected phone, run `adb reverse tcp:8080 tcp:8080` and set the app server to `http://localhost:8080`. Repeat the reverse command after reconnecting USB. Build, install and offline smoke-test steps are in [`mobile/README.md`](mobile/README.md).

## Docs

- Spec: [`Docs/spec/`](Docs/spec/index.md) (start at `index.md`)
- Decisions: [`ADR.md`](ADR.md)
- Requirement mapping: [`TRACEABILITY.md`](TRACEABILITY.md)
- Status / handoff: [`PROGRESS.md`](PROGRESS.md)
