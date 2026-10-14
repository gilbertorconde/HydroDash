# HydroDash redesign — information architecture

Design direction: **"Water"** (mock D). Blue gradient hero band at the top of every page, white (light) / deep-navy (dark) rounded cards overlapping it, floating pill tab bar on phones, glass pill nav on desktop. Font: Plus Jakarta Sans. Full inventory of existing features: [feature-inventory.md](feature-inventory.md).

## 1. Basic vs advanced — one consistent pattern

| Layer | What lives there | Visual language |
|---|---|---|
| **Everyday** | Tabs, page hero actions, the main cards on each page | Blue accent, white cards |
| **Advanced** | Installer / power-user / rarely changed options | `AdvancedSection`: dashed **purple** outline + wrench icon, collapsed by default, remembers open state; purple icon badges for advanced rows in lists |
| **Destructive** | Anything that deletes, resets or can lock you out | Red, always behind a confirmation, inside a `⋯` menu or a "Danger zone" group — never a primary button |

- App preference **"Show advanced options"** (Settings → App) expands all advanced sections by default for power users.
- Advanced content is never hidden entirely — a collapsed, labelled row is always visible, so features stay discoverable.
- Settings is split into **Basic** and **Advanced** groups on its landing list.

## 2. Navigation

Tabs (phone bottom bar / desktop glass pill): **Home · Zones · Programs · History · More**. Header: logo, notifications bell, theme toggle, (desktop) log out. Everything else is under **More**; sub-pages show a `‹ More` back link in their hero.

## 3. Page map

### Home `/` (hero: tall)
- **Hero — Now running**: zone name, big countdown, program/"Manual run", progress, "N more zones after this"; glass **Stop**, **Pause/Resume**; hero `⋯`: Stop all & clear queue, Disable/Enable controller, Reset all stations (all confirmed).
- **Hero — idle**: "All quiet", next scheduled run, buttons **Water a zone** (→ Zones), **Run a program**. Banners in hero when controller disabled / rain delay active / paused.
- Cards: **Up next** (horizontal queue), **Conditions** (stat tiles: weather temp/humidity from `wtdata` when present, watering level %, rain delay, sensor 1/2), **Rain delay** (set 6/12/24/48 h or custom, clear — new, `/cv rd=`), **Programs** (quick run / stop per program), **Recent activity** (last runs), **Controller** (online, firmware, device time, location link, weather error).
- Advanced: **Customize Home** (show/hide + reorder cards). The old react-grid-layout drag/resize grid is replaced by a curated responsive layout.

### Zones `/zones` (hero: default)
- Hero: "Zones", summary "1 running · 2 queued"; actions: Pause 10 min / Resume (glass); `⋯`: Stop all.
- Zone cards (grid 1/2/3 cols): name, status pill, duration chips (5/10/15/30/Custom), Start/Stop; `⋯`: Rename, Disable/Enable (confirm).
- Per-zone **Advanced** (in the rename sheet): station attributes (master, rain/sensor ignore, sequential group, special station data) — read-only today.
- Page **Advanced**: list display options (show disabled, show numbers, group view, sort by name) — same app prefs as Settings → App.

### Programs `/programs` (hero: default)
- Hero actions: **New program** (light), **Run once** (glass), **Day preview** (glass → `/preview`).
- Program cards: name, enabled pill, days, start(s), total, zones chips; **Run now**/**Stop**, **Edit**; `⋯`: Duplicate, weather adjustment on/off, enable/disable, Delete (confirm). Drag to reorder.
- Editor (sheet/modal): Basic — name, enabled, days of week, start time, zone durations, weather adjustment. **Advanced** — schedule type (weekly / interval / odd-even), interval days, repeat starts (count/interval), extra fixed start times, sunrise/sunset-relative starts, date range, start type flags.
- Run panels (run program with custom durations, run-once) keep all options.

### History `/history` (hero: default, stats in hero: events, total runtime)
- Segmented Table / Timeline, compact date-range + grouping summary (Change), Export; `⋯`: Clear all logs (confirm), delete a day (confirm).

### More `/more` (hero: default)
- **Your garden**: Weather, Schedule preview, Sensors.
- **App**: Settings, Notifications (push), Controllers (multi-site), About.
- **Advanced** (purple): Advanced settings (→ Settings advanced group), Backup & restore, Diagnostics.
- Log out (danger row).

### Settings `/settings` (hero: compact, back to More)
Landing list, each row opens that section (`?section=`):
- **Basic**: Location & time (timezone, location, device time), Watering & weather (method, %, provider & key link), App preferences (units, 24 h, theme System/Light/Dark, zone list display, **Show advanced options**), Controller notifications (MQTT/email/IFTTT event toggles live under Advanced Integrations; this row links to push notifications).
- **Advanced**: Master valves, Stations & timing (count, delay, sequential), Sensors wiring (types, NO/NC, delays, flow pulse rate), Integrations (device name, IFTTT, events, OTC, MQTT, email), LCD screen, Network (DHCP, static IP/gateway/subnet/DNS/NTP IP, NTP sync, auto reconnect, HTTP port, device ID), Power & hardware (boost, current limits, PD/latch voltages), Logging, Security (change controller password — new; ignore password), **Danger zone** (clear logs, delete all programs, reset options, reset station attributes, reset wireless).

### Weather `/forecast` (hero: big watering level %)
- Cards: Current conditions (`wtdata` fields when present), Adjustment (method, %, last check, status), Provider (provider + API key, save), Rain delay shortcut. Advanced: raw weather payload, weather service URL.

### Sensors `/sensors`, Controllers `/sites`, Backup `/backup`, Diagnostics `/diagnostics`, About `/about`, Schedule preview `/preview`
- Same hero (compact, back to More). Sensors: sensor cards with live value; editor fields beyond name/type/unit in Advanced. Backup: export/import cards, destructive import confirmed. Diagnostics is itself advanced (purple hero pill).

### Login `/login`
- Full-screen gradient with waves, centered white card.

## 4. Duplicates resolved
- Logout: More + desktop header only (hamburger removed).
- Stop everything: one "Stop all" (`/cv rsn=1`) with confirmation, in Home and Zones hero `⋯`.
- Pause/resume: hero of Home and Zones, same mutation.
- Clear logs: History `⋯` and Settings → Danger zone (both confirmed).
- Router devtools only in dev builds.
