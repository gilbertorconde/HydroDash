# Environment variables

HydroDash reads configuration from the environment. **`docker-compose.yml`** passes **`${VAR_NAME}`** references only (no default values in YAML). Docker Compose substitutes them from a **`.env`** file next to the compose file or from your shell. See [`.env.example`](../.env.example) for names to define.

Optional settings (ntfy, notification worker tuning, `VITE_*`, `OS_SITES`, …) are **not** listed in Compose. Add `KEY: ${KEY}` under `environment:` when you need them; this document describes each variable.

For **`npm run dev`** / **`npm run build`**, the same **`.env`** supplies Vite and the dev server.

Optional tuning variables used only by Node may fall back to defaults **in code** (see [Defaults applied in application code](#defaults-applied-in-application-code)).

---

## Docker Compose

`docker-compose.yml` pins the app image to **`ghcr.io/gilbertorconde/hydrodash:latest`**, which [GitHub Actions](../.github/workflows/docker-publish.yml) pushes on the default branch. To use another tag or registry, edit the `image:` lines.

The **`hydrodash`** service maps **`8080:4173`** (host → container). Edit `ports` if you want another host port.

`hydrodash` and **`hydrodash-notify`** duplicate the same OpenSprinkler variables where both need them; the notify service does **not** set `HYDRODASH_LOGIN_PASSWORD` (worker only). There is **no** `env_file:` on services; only **`${VAR}` interpolation** applies when Compose parses the file.

**`DATABASE_URL`** and **`DATABASE_SCHEMA_URL`** are **assembled in `docker-compose.yml`** from **`MARIADB_*`** (same pattern as many stacks: app user URL + root URL for DDL). You do **not** set `DATABASE_URL` / `DATABASE_SCHEMA_URL` in `.env` for `docker compose up`. Hostname is **`mariadb`** (Compose service name), port **3306**.

Passwords with **`@`, `:`, `/`, `#`, `%`, etc.** must be **percent-encoded** in URI form; otherwise the connection string is ambiguous. Prefer alphanumeric passwords for MariaDB users or encode them.

---

## Reverse proxy (optional)

Compose does **not** include a reverse proxy. The app is plain HTTP on the mapped port. For TLS or a single public entrypoint, put **Caddy**, **Traefik**, **nginx**, or another proxy **in front** of that port and forward to the host address where Docker publishes `hydrodash` (e.g. `http://127.0.0.1:8080` on the same machine, or the Docker bridge IP from another container).

Suggested headers when proxying (so the app sees the original host and scheme where relevant):

- `Host`: forward the client `Host` header
- `X-Forwarded-For`: client chain
- `X-Forwarded-Proto`: `https` or `http`

A sample **nginx** `server` block lives at [`docker/nginx.conf`](../docker/nginx.conf): adjust the `upstream` to `127.0.0.1:8080` when the proxy runs on the host, or keep `hydrodash:4173` if nginx shares the Compose network.

**`PREVIEW_ALLOWED_HOSTS`** (optional, `hydrodash` service only): comma-separated hostnames Vite’s **`vite preview`** accepts on the `Host` header (e.g. your public DNS). If **unset or empty**, the app allows **any** host so you do not need to change the repo for each deployment. Set it to restrict to specific names (slightly stricter if the container port is reachable without the proxy).

---

## MariaDB (`mariadb` service)

Referenced in `docker-compose.yml` as **`${MARIADB_ROOT_PASSWORD}`**, **`${MARIADB_DATABASE}`**, **`${MARIADB_USER}`**, **`${MARIADB_PASSWORD}`**. Define them in `.env`.

| Variable | Required | Description |
| -------- | -------- | ----------- |
| `MARIADB_ROOT_PASSWORD` | Yes | Root password (required by the MariaDB Docker image). Used in the composed `DATABASE_SCHEMA_URL` (`mysql://root:…@mariadb:3306/…`). |
| `MARIADB_DATABASE` | Yes | Database name created on first init. |
| `MARIADB_USER` | Yes | Application user name. |
| `MARIADB_PASSWORD` | Yes | Application user password. |

See [MariaDB Docker environment variables](https://hub.docker.com/_/mariadb) for any additional options you choose to set.

---

## HydroDash web app (`hydrodash` service)

### OpenSprinkler (server-side proxy)

| Variable | Required | Description |
| -------- | -------- | ----------- |
| `OS_BASE_URL` | Yes* | Base URL of the controller (no default in code). *Not required if `OS_SITES` is set and non-empty. |
| `OS_SITES` | No | JSON array of `{ "id", "baseUrl", "label?", "password?" }` for multi-controller setups. When set, `OS_BASE_URL` is not used. Add under `environment:` in Compose if needed. |
| `OS_PORT` | No | If set, merged into `OS_BASE_URL` when the URL has no port. |
| `OS_PASSWORD` | Conditional | Plain device password (hashed server-side). For single-site mode, set this or `OS_PW_HASH`. With `OS_SITES`, set per-site `password` or a shared `OS_PASSWORD` / `OS_PW_HASH`. |
| `OS_PW_HASH` | No | MD5 hash of the device password (hex). Alternative to `OS_PASSWORD` for single-site mode. |

### HydroDash login and sessions

| Variable | Required | Description |
| -------- | -------- | ----------- |
| `HYDRODASH_LOGIN_PASSWORD` | Strongly recommended | Password for the HydroDash UI. If unset, login always fails (with a server warning). |
| `HYDRODASH_SESSION_SECRET` | Yes for sessions | Secret for signing cookies. If unset, session creation throws when auth runs. |

### Client API base (Vite)

| Variable | Required | Description |
| -------- | -------- | ----------- |
| `VITE_OPENSPLINKER_BASE_URL` | No | Browser-side prefix for OpenSprinkler API calls (e.g. `/api/os`). If unset at **build** time, the client falls back to **`/api/os`** in code (`src/lib/envDefaults.ts`). For Compose, only matters if you inject it at **runtime** for SSR; the published image bakes build-time Vite env from CI. |

### Notifications / database (web + API)

| Variable | Required | Description |
| -------- | -------- | ----------- |
| `DATABASE_URL` | Yes* | `mysql://…` URI seen by the Node process. *With Docker Compose, this is **set in YAML** from `MARIADB_USER`, `MARIADB_PASSWORD`, `MARIADB_DATABASE`, host `mariadb`, port `3306`.* For **`npm run dev`** on the host, set a full URI in `.env` (e.g. `127.0.0.1`). If unset, notification features stay off. |
| `DATABASE_SCHEMA_URL` | No | If set, used **only** for idempotent `CREATE TABLE` / seed DDL. *Compose sets* `mysql://root:${MARIADB_ROOT_PASSWORD}@mariadb:3306/${MARIADB_DATABASE}`. If unset in other setups, DDL uses `DATABASE_URL`. |

---

## Notification worker (`hydrodash-notify` service)

Compose passes the same composed `DATABASE_*` and OpenSprinkler variables as the web app. Add any of the following under `environment:` when you need them:

| Variable | Required | Description |
| -------- | -------- | ----------- |
| `NOTIFICATIONS_ENABLED` | No | Set to `0` to exit the worker immediately on start. Any other value or unset = run. **Default in code:** enabled. |
| `NTFY_SERVER_URL` | No | ntfy base URL. If unset, events are stored only in the app database. |
| `NTFY_ACCESS_TOKEN` | No | Bearer token for private ntfy servers. |
| `NOTIFICATIONS_POLL_INTERVAL_SEC` | No | Seconds between poll ticks (minimum `5`). **Default in code:** `45`. |
| `NOTIFICATIONS_RETENTION_DAYS` | No | Delete events older than this many days (minimum `7`). **Default in code:** `90`. |
| `NOTIFICATIONS_HEALTH_PORT` | No | TCP port for `GET /health` inside the container. **Default in code:** `8081`. |
| `NOTIFICATIONS_HEALTH_DISABLE` | No | Set to `1` to disable the health HTTP listener. **Default in code:** health server on. |

---

## `NODE_ENV`

| Value | Effect |
| ----- | ------ |
| `production` | Set in `docker-compose.yml` for app containers. Cookie `secure` flag follows this in `src/server/auth.ts`. |

---

## Docker image build (not Compose)

| Build arg / env | Required | Description |
| --------------- | -------- | ----------- |
| `VITE_OPENSPLINKER_BASE_URL` | Yes at build | Passed as Docker `ARG` / `ENV` during `docker build`. CI sets it in [`.github/workflows/docker-publish.yml`](../.github/workflows/docker-publish.yml). For local builds: `--build-arg VITE_OPENSPLINKER_BASE_URL=/api/os` (or your chosen prefix). |

---

## Defaults applied in application code

These apply **only when the variable is unset or empty** (Compose does not need to set them):

| Area | Default |
| ---- | ------- |
| `VITE_OPENSPLINKER_BASE_URL` (client) | `/api/os` (`DEFAULT_VITE_OPENSPLINKER_BASE_URL` in `src/lib/envDefaults.ts`) |
| `NOTIFICATIONS_POLL_INTERVAL_SEC` | `45` (min `5`); see `src/server/envDefaults.ts` |
| `NOTIFICATIONS_RETENTION_DAYS` | `90` (min `7`); see `src/server/envDefaults.ts` |
| `NOTIFICATIONS_HEALTH_PORT` | `8081`; see `src/server/envDefaults.ts` |
| `NOTIFICATIONS_HEALTH_DISABLE` | health on unless value is `1` |
| `NOTIFICATIONS_ENABLED` | worker runs unless value is `0` |
| `DATABASE_SCHEMA_URL` | same connection as `DATABASE_URL` for DDL; see `src/server/notifications/schema.ts` |

There is **no** default for `OS_BASE_URL` or MariaDB names/passwords in application code. You supply values via `.env` (or shell) for Compose substitution.

---

## Local development (`.env`)

Copy [`.env.example`](../.env.example) to `.env` and fill in values for **`npm run dev`** / **`npm run start`** and/or **`docker compose up`**.

If you run **only MariaDB** from Compose (`docker compose up mariadb`) and the app on the host, set **`DATABASE_URL`** (and optionally **`DATABASE_SCHEMA_URL`**) yourself in `.env`, for example `mysql://user:pass@127.0.0.1:3306/hydrodash`.
