# NaSCon '26 App Dev — Part I: Multi-Sport League & Club Operations Platform

Backend (REST + realtime + event-sourced scoring + mock payments) and mobile app.

> Status: scaffolding. Run instructions below are the target; update as the stack lands.

## Run (target)

```bash
DAY1_SALT=<your-salt> docker compose up -d --build
curl http://localhost:8080/health   # {"status":"ok"}
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

## Spec

The problem statement is split by topic under [`Docs/spec/`](Docs/spec/index.md); start at `index.md`.
