# 03 — Infrastructure, Approved Stack, Grading Environment

Scope: what the stack may use, how the grader boots it, startup/health timing, salt handling.

## Open-source / self-hosted requirement
- All core infrastructure must run on open-source software, self-hosted via **Docker Compose**.
- Proprietary single-vendor BaaS (Firebase, Supabase, AWS Amplify) for graded features is **strictly prohibited** (−10 penalty).
- Payments must use a **mock payment gateway that you build**.

## Approved open-source stack (Section 7)

| Category | Approved software |
| --- | --- |
| Database, cache & storage | PostgreSQL 16, Redis 7, MinIO |
| Auth & message queues | Custom JWT / Keycloak / Ory Kratos; RabbitMQ / Redis Streams / NATS / BullMQ / Celery |
| PDF generation | WeasyPrint, wkhtmltopdf, Puppeteer |
| Testing & load probes | pytest, JUnit, TestNG, grafana/k6 |

- Third-party fixture-generation libraries and managed BaaS products are **prohibited**.
- Web frameworks, ORMs, JWT libraries, and PDF libraries are fine.

## Grading environment and startup
- Grader machine (organizer-controlled): Ubuntu 22.04, 4 vCPU, 8 GB RAM, Docker Engine 24+ with Compose v2, Python 3.11. The stack must run within these limits.
- Grader clones the last commit, then from repo root runs: `DAY1_SALT=<your-salt> docker compose up -d --build`.
  - The command (including image pulls and builds) must finish within **10 minutes**.
  - Internet is available **during this build step only**; running services must not need it.
- Grader polls `GET /health` every 2 s; must return HTTP 200 within **120 seconds** after the command returns. It then calls `POST /audit/v1/reset` before each test group.
- No manual steps, no pre-created volumes, no host-installed software other than Docker. Failure to start = non-reproducible stack (−10, after one automatic retry).
- `DAY1_SALT` must be read **only from the environment variable at startup** — never hard-coded or committed. `docker-compose.yml` must forward it as `DAY1_SALT: ${DAY1_SALT}`; `.env.example` must not contain the real salt.
- Required compose contents: API on host port **8080**, database, cache, queue, object store, workers.

## Related
- Health endpoint & reset/seed: [07-reset-seed-health.md](07-reset-seed-health.md)
- Performance limits per request: [04-api-conventions.md](04-api-conventions.md)
- Penalties: [19-scoring-rubric-penalties.md](19-scoring-rubric-penalties.md)
