# Notifications (MariaDB + ntfy)

HydroDash can record controller events in MariaDB and optionally push them to [ntfy](https://ntfy.sh).

## Components

1. **MariaDB** — Stores notification settings, inbox rows (`notification_events`), and poller snapshots (`notification_poller_state`). The web app and notify worker apply the schema on startup (`src/server/notifications/schema.ts`). `docker/mariadb/init/01-schema.sql` is optional reference for manual installs.
2. **`hydrodash` (web)** — Session-authenticated APIs under `/api/notifications/*` read and update the same database.
3. **`hydrodash-notify` (sidecar)** — Node process that polls each configured OpenSprinkler (`OS_BASE_URL` or `OS_SITES`), diffs `/jc` (+ `/js`, `/jp`), inserts rows, and POSTs to ntfy when `NTFY_SERVER_URL` is set.

## Docker Compose

[`docker-compose.yml`](../docker-compose.yml) passes `DATABASE_URL` and `DATABASE_SCHEMA_URL` as **`${DATABASE_URL}`** / **`${DATABASE_SCHEMA_URL}`**—set them in `.env`. Optional ntfy / worker tuning is in **[docs/environment.md](environment.md)**—add `KEY: ${KEY}` under `environment:` when needed.

## Environment variables

Notification-related variables (`DATABASE_URL`, `DATABASE_SCHEMA_URL`, `NTFY_*`, `NOTIFICATIONS_*`, and OpenSprinkler `OS_*`) are listed in **[docs/environment.md](environment.md)**.

## Operations

- **Backup**: persist the `mariadb_data` Docker volume.
- **Health**: from another container on the Compose network, `wget -qO- http://hydrodash-notify:8081/health` (port overridable via `NOTIFICATIONS_HEALTH_PORT`; see environment doc).

## Local development

1. Start only MariaDB: `docker compose up mariadb`
2. Set `DATABASE_URL` (and optional `DATABASE_SCHEMA_URL`) in `.env` per [docs/environment.md](environment.md).
3. Run `npm run dev` for the web app and `npm run notifications-service` (after `npm run build:notify` or full `npm run build`) for the worker. The first request or worker start creates tables if missing.
