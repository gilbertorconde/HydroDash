<h1 style="display:flex;align-items:center;gap:0.5rem">
  <img src="public/hydroDashLogo.svg" alt="" height="42" width="51" />
  HydroDash
</h1>

Independent modern frontend for OpenSprinkler controllers. The npm package name in `package.json` is **hydrodash**; a default `git clone` of this repo creates a **HydroDash** directory.

**Stack:** [TanStack Start](https://tanstack.com/start) (Vite + SSR), React 19, React Query, file-based routing. OpenSprinkler API access goes through server routes under `/api/os/*`; browser login uses cookie sessions (`/api/auth/*`).

---

## Screenshots

### Login

![HydroDash login screen](docs/screenshot-login.png)

### Home

![HydroDash home dashboard with draggable cards](docs/screenshot-home.png)

### Zones

![HydroDash zones: manual runs per zone](docs/screenshot-zones.png)

### Programs

![HydroDash programs list](docs/screenshot-programs.png)

### History (timeline)

![HydroDash irrigation history timeline](docs/screenshot-history.png)

### Program editor

![Edit program modal](docs/screenshot-program-edit.png)

---

## Contributing

### Dashboard widgets

To add a draggable tile on **Home**, follow **[Contributing dashboard widgets](docs/contributing-widgets.md)** (fork/branch, file checklist, data hooks, and PR expectations).

### Product roadmap (More page)

The **More** screen lists features not implemented yet. **[Roadmap requirements](docs/roadmap-requirements.md)** breaks each item into goals, gaps, API/UX notes, and draft acceptance criteria for planning and contributions.

---

## Requirements

- **Node.js** 20+ (TanStack Start / Vite 8 recommend **22.12+**)
- **npm** 10+

---

## Local development

1. Copy environment template and edit values:

   ```bash
   cp .env.example .env
   ```

2. Install dependencies and start the dev server:

   ```bash
   npm install
   npm run dev
   ```

   Default dev URL: `http://127.0.0.1:5173`

---

## Environment variables

Every variable is documented in **[docs/environment.md](docs/environment.md)**. **`docker-compose.yml`** only references **`${VAR}`** names (no defaults in YAML); put values in a **`.env`** next to it (see [`.env.example`](.env.example)). Same `.env` works for **`npm run dev`**.

---

## Production build (Node)

TanStack Start builds **client** assets under `dist/client` and the **SSR server** under `dist/server`. Production serving in this repo uses Vite’s preview server (SSR-capable), not a static file server alone.

```bash
npm install
npm run build
npm run start
```

- `npm run start` runs `vite preview --host 0.0.0.0 --port 4173`.
- Open `http://127.0.0.1:4173` (set the same env vars as development, especially `OS_*` and `HYDRODASH_*`).

For a quick static check without SSR, `npm run preview` uses the same mechanism with default host/port.

---

## Docker

### Single container (Node only)

From this directory:

```bash
docker build -t hydrodash --build-arg VITE_OPENSPLINKER_BASE_URL=/api/os .
docker run --rm -p 4173:4173 --env-file .env hydrodash
```

Then open `http://127.0.0.1:4173`. Ensure `.env` exists (copy from `.env.example`). The build arg matches what CI passes; use another path only if you change the API prefix.

The image runs `npm run start` inside the container. `Dockerfile` uses `npm install` in the build stage for compatibility when the lockfile and `npm ci` disagree; for reproducible CI images, keep `package-lock.json` in sync (`npm install` locally, commit) and switch the build stage to `npm ci` if you prefer.

### Docker Compose: HydroDash + MariaDB + notifications

[`docker-compose.yml`](docker-compose.yml) pulls the **pre-built app image** from **GitHub Container Registry** (CI builds from **[github.com/gilbertorconde/HydroDash](https://github.com/gilbertorconde/HydroDash)**). Environment entries use **`${VAR}`** only; define variables in **`.env`** (or the shell) before `docker compose up`. See [docs/environment.md](docs/environment.md) and [`.env.example`](.env.example).

```bash
docker compose up
```

**`hydrodash`** and **`hydrodash-notify`** share the same image (`command: node dist/notifications-service.mjs` on notify). **MariaDB** is **`mariadb:11`**. The web UI is exposed as **`8080:4173`**. **`DATABASE_URL`** and **`DATABASE_SCHEMA_URL`** are composed in YAML from **`MARIADB_*`** (no separate `DATABASE_*` keys in `.env` for Compose).

There is **no reverse proxy** in Compose. Use your own TLS/edge proxy in front if you need HTTPS or a single public hostname; see **[Reverse proxy (optional)](docs/environment.md#reverse-proxy-optional)** in `docs/environment.md` and the sample [`docker/nginx.conf`](docker/nginx.conf).

To run **your own build** instead of the published image, use the [single-container](#single-container-node-only) flow, or change the `image:` lines in `docker-compose.yml` (e.g. to a local tag after `docker build -t …`, or another registry if you fork and publish your own package).

### Pre-built image (GitHub Actions → GHCR)

[`.github/workflows/docker-publish.yml`](.github/workflows/docker-publish.yml) builds and pushes **`ghcr.io/gilbertorconde/hydrodash`** (web + notify). Triggers: pushes to `master` / `main`, tags `v*`, pull requests (build only, no push), and **workflow_dispatch**. Tags include branch name, **`latest`** (on default branch), **semver** for `v*` tags, PR refs, and **git SHA**.

HydroDash is **public**; if GitHub creates the package as **private** at first, set **Package settings → Change package visibility → Public** once.
