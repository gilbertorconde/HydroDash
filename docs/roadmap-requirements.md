# Roadmap requirements

This document expands the **“Not in HydroDash yet”** list on the **More** page (`/more`) into planning notes: what exists today, what is missing, and what to build or research before implementation.

It is **not** a committed delivery schedule; it is a requirements and dependency checklist for contributors.

---

## 1. Configuration import / export (OpenSprinkler-App parity)

### Goal

Let users back up and restore controller configuration (programs, stations, options, and related state) in a way comparable to the official **OpenSprinkler** mobile app—typically as a JSON file the user can save and re-apply.

### Current state in HydroDash

- Settings and other pages already **read** consolidated state via `/ja` and **write** slices via `/jo` (and related commands) through the existing API proxy (`/api/os/...`).
- There is **no** single “export all” or “import from file” flow, no download/upload UI, and no documented schema for a portable backup blob.
- **History** can export parsed log data as JSON from the History page; that is **log** export only, not full configuration.

### Gaps

- Define the **exact payload shape** to match (or subset of) what OpenSprinkler-App exports, or document an intentional HydroDash-specific format with a version field.
- **Import** must validate structure, show a clear preview or diff summary, and apply writes in a safe order (options vs stations vs programs) with rollback or clear failure reporting.
- **Multi-site** (`OS_SITES`): decide whether backups are per-site and how filenames or metadata identify the target controller.

### Technical requirements

| Area | Notes |
|------|--------|
| **Firmware / API** | Inventory which `/ja` keys and `/jo` keys are required for a full restore; confirm any firmware limits (program count, string lengths). |
| **Server** | Optional: large JSON upload through proxy; ensure body size limits and timeouts are acceptable. |
| **Client** | File picker + download (Blob/`URL.createObjectURL`), progress/error UX, optional “dry run” validation. |
| **Security** | Treat exports as sensitive (passwords, MQTT, email settings); warn before sharing; consider redaction options. |

### Acceptance criteria (draft)

- User can **download** a JSON backup for the active controller from a dedicated control (e.g. Settings or More).
- User can **choose a file** and apply it after confirmation; invalid files show actionable errors without bricking partial state.
- Behavior is documented alongside the chosen schema (in this file or a short `docs/configuration-backup.md` when implemented).

### References to study

- OpenSprinkler-App import/export implementation (repository / `main.js` or equivalent).
- Firmware API documentation for `/ja`, `/jo`, and program/station mutation commands.

---

## 2. Firmware OTA checks and update flow

### Goal

Surface whether a newer **firmware** is available and guide the user through an update path similar to the official app (check version, optionally download/apply per device capabilities).

### Current state in HydroDash

- No UI for firmware version comparison, release notes, or OTA trigger.
- Controller **device info** may already be available in JSON responses used elsewhere (verify `fwv` / similar in `/jc` or `/jo` payloads and types in `src/api/types`).

### Gaps

- Clarify **which hardware generations** HydroDash targets (OSPi, OS 3.x, etc.) and how OTA differs per platform.
- Determine **authoritative update source** (OpenSprinkler cloud API, GitHub releases, or device-only with user-supplied binary—match OG app behavior).

### Technical requirements

| Area | Notes |
|------|--------|
| **Firmware** | Document the exact HTTP/API calls the official app uses for “check update” and “apply update”; confirm CORS/proxy implications when called from HydroDash server vs browser. |
| **Server** | If the device cannot be reached directly from the browser, checks may need to go **server-side** through the existing OS proxy pattern. |
| **Client** | Version display, “Check for updates”, release notes or link, blocking states during flash, error handling for power/network loss. |
| **Risk** | Failed OTA can disable the device; UX must emphasize warnings and match firmware expectations. |

### Acceptance criteria (draft)

- Current firmware version is visible in a predictable place (Settings and/or Diagnostics).
- User can trigger a **check** and see up-to-date / update available / error.
- Any apply step matches firmware constraints and does not bypass required confirmations.

---

## 3. Analog sensor charts and configuration

### Goal

Support **analog sensors** (values over time, thresholds, and configuration) comparable to OpenSprinkler-App capabilities where the controller exposes them.

### Current state in HydroDash

- **Sensors** appear on the dashboard and in data hooks, but focus on discrete / runtime-oriented presentation, not long-window **time-series charts** for analog channels.
- No dedicated analog calibration or chart screen.

### Gaps

- Map firmware fields for analog sensor **readings**, **history** (if any), and **configuration** (names, units, scaling).
- If history is only available via logs or polling, define **sampling strategy** and storage (pure client vs server cache).

### Technical requirements

| Area | Notes |
|------|--------|
| **API** | Identify endpoints and poll intervals; extend `src/api/types` and hooks as needed. |
| **Charts** | Pick a chart library (bundle size, SSR compatibility with TanStack Start) or reuse a minimal canvas/SVG approach. |
| **UX** | Range selector (24h / 7d), empty states, loading, and alignment with existing design tokens. |

### Acceptance criteria (draft)

- For controllers that report analog data, user can see **current values** and a **time-based chart** for at least one defined window.
- Configuration exposed by firmware for analog sensors is editable or viewable in parity with what OG app offers (scope TBD per firmware version).

---

## 4. Notifications panel

### Goal

A **notifications** experience beyond configuring which events fire integrations: e.g. recent events, delivery status, or a unified place to inspect what the controller reported.

### Current state in HydroDash

- **Settings** includes **notification event** checkboxes (MQTT, email, IFTTT-related bitmask) via `NOTIFICATION_EVENT_LABELS` and related helpers in `src/lib/opensprinklerOptions.ts`—this is **configuration**, not a notification **inbox** or **history** panel.

### Gaps

- Define product scope: **in-app log of events** (if firmware exposes it), **push** (requires PWA/service worker + backend), or **read-only list** from a vendor API.
- Many notifications are **outbound** (email/MQTT); HydroDash may not receive them without a new backend—narrow scope explicitly.

### Technical requirements

| Area | Notes |
|------|--------|
| **Data source** | Confirm whether `/jl` (log) or other JSON already contains notification-like entries that can be filtered and surfaced. |
| **UI** | New route or section under More/Settings; filters, timestamps using `formatLocale` patterns. |
| **Future** | If true push is desired, document dependency on server-side queue or third-party service. |

### Acceptance criteria (draft)

- Documented scope: either (A) **history from existing controller data** with clear limits, or (B) **deferred** until a backend exists—avoid a panel that duplicates Settings checkboxes only.

---

## 5. Localization (i18n) and locale files

### Goal

Translate the **HydroDash** UI (not just date/number formatting) using locale files, with a path to add and maintain languages.

### Current state in HydroDash

- UI strings are **hard-coded in English** in components and pages.
- `src/lib/formatLocale.ts` uses the **browser locale** for dates/times with optional 12h/24h from app preferences—this is **not** full i18n.

### Gaps

- Choose stack: e.g. **react-i18next**, **Lingui**, or **FormatJS**—must work with Vite, TanStack Start, and any SSR constraints.
- Extract strings, establish **key naming**, default locale (`en`), fallback behavior.
- **Community process**: where translation files live, how to validate new locales, and CI checks for missing keys.

### Technical requirements

| Area | Notes |
|------|--------|
| **Codebase** | Systematic replacement of user-visible strings; avoid translating firmware-provided names unless explicitly desired. |
| **Preferences** | Wire language choice to `appPreferences` (or new storage) and document interaction with browser `Accept-Language` if used as default. |
| **RTL** | Optional phase: audit layout/CSS for direction support. |

### Acceptance criteria (draft)

- At least **one** additional locale end-to-end (e.g. `es` or `pt`) to prove the pipeline.
- Contributor doc: how to add a language file and test locally.
- No regression for English; missing keys fall back visibly in dev (e.g. key name or CI failure).

---

## Cross-cutting concerns

- **Testing**: Each feature needs manual matrix against a real controller (or recorded fixtures) where possible; document firmware versions used.
- **Accessibility**: New flows (file import, OTA, charts) should meet existing app a11y expectations (labels, focus, errors).
- **Documentation**: When a roadmap item ships, update **More** page copy to remove or narrow the bullet and link to user-facing help if appropriate.

---

## Summary table

| Roadmap item | Primary dependency | HydroDash today |
|--------------|-------------------|-----------------|
| Import / export | `/ja`/`jo` parity + schema + UX | Writes are granular; no backup blob |
| Firmware OTA | Firmware update API + legal/safety UX | Not present |
| Analog charts | Sensor APIs + charting | Basic sensor widgets only |
| Notifications panel | Clear data source (log vs backend) | Event config only |
| i18n | Library + string extraction | English UI + locale dates only |
