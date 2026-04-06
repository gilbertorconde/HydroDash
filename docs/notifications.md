# Notifications (MariaDB + ntfy)

HydroDash can record controller events in MariaDB and optionally push them to [ntfy](https://ntfy.sh).

## Components

1. **MariaDB**: stores notification settings, inbox rows (`notification_events`), and poller snapshots (`notification_poller_state`). The web app and notify worker apply the schema on startup (`src/server/notifications/schema.ts`). `docker/mariadb/init/01-schema.sql` is optional reference for manual installs.
2. **`hydrodash` (web)**: session-authenticated APIs under `/api/notifications/*` read and update the same database.
3. **`hydrodash-notify` (sidecar)**: Node process that polls each configured OpenSprinkler (`OS_BASE_URL` or `OS_SITES`), diffs `/jc` (+ `/js`, `/jp`), inserts rows, and POSTs to ntfy when `NTFY_SERVER_URL` is set.

## Docker Compose

[`docker-compose.yml`](../docker-compose.yml) **builds** `DATABASE_URL` and `DATABASE_SCHEMA_URL` from **`MARIADB_*`** (like Vaultwarden-style compose). Optional ntfy / worker tuning is in **[docs/environment.md](environment.md)**. Add `KEY: ${KEY}` under `environment:` when needed.

## Environment variables

Notification-related variables (`MARIADB_*`, composed `DATABASE_*` in Compose, `NTFY_*`, `NOTIFICATIONS_*`, and OpenSprinkler `OS_*`) are listed in **[docs/environment.md](environment.md)**.

## Operations

- **Backup**: persist the `mariadb_data` Docker volume.
- **Health**: from another container on the Compose network, `wget -qO- http://hydrodash-notify:8081/health` (port overridable via `NOTIFICATIONS_HEALTH_PORT`; see environment doc).

## Local development

1. Start only MariaDB: `docker compose up mariadb`
2. For Compose, define **`MARIADB_*`** in `.env` only. For app-on-host, set full `DATABASE_URL` in `.env` per [docs/environment.md](environment.md).
3. Run `npm run dev` for the web app and `npm run notifications-service` (after `npm run build:notify` or full `npm run build`) for the worker. The first request or worker start creates tables if missing.
