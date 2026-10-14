# HydroDash feature inventory (pre-redesign)

Snapshot of every user-facing feature on branch `redesign/water` (base `d40e28c`). Goal: nothing gets lost in the visual redesign.

**Conventions**
- **Class**: `BASIC` = everyday homeowner use; `ADV` = installer / power-user / technical / rarely changed.
- **DESTR** = destructive or hard to undo (deletes data, stops watering, overwrites config, can make the device unreachable).
- **API**: OpenSprinkler endpoints are proxied via `/api/os/*` (`src/routes/api/os/$.ts`). `/cv` = change values, `/co` = change options, `/cs` = change stations, `/cm` = manual station, `/mp` = manual program, `/cr` = run-once, `/cp` = change program, `/dp` = delete program, `/up` = move program up, `/pq` = pause queue, `/dl` = delete log, `/jl` = logs, `/ja` = all JSON, `/jc` = controller, `/jo` = options, `/jp` = programs, `/jn` = station names/attrs, `/je` = station specials, `/js` = station status, `/db` = debug, `/sl` `/sg` `/so` `/sr` `/sf` `/sc` = extended sensor API. App-server endpoints are `/api/auth/*` and `/api/notifications/*`.
- **LS** = browser `localStorage`, **SS** = `sessionStorage`.
- `opt.X` = the field only shows if the controller reports option `X` (firmware-dependent).
- File references are `path:line` relative to the repo root.

---

## 0. Routes overview

| Route | Component | Reachable from | Notes |
|---|---|---|---|
| `/` | `DashboardPage` | Header nav, tab bar, logo | Home |
| `/zones` | `StationsPage` | Header nav, tab bar, notification items | |
| `/stations` | redirect to `/zones` | **nothing links to it** | Legacy alias (`src/routes/stations.tsx:8`) |
| `/programs` | `ProgramsPage` | Header nav, tab bar, Quick-run widget link, Preview "Edit programs" | |
| `/history` | `HistoryPage` | Header nav, tab bar, History widget link | |
| `/logs` | redirect to `/history` | **nothing links to it** | Legacy alias (`src/routes/logs.tsx:8`) |
| `/settings` | `SettingsPage` | Header nav (desktop + hamburger), More list | **Not in the phone tab bar** (only via More) |
| `/more` | inline in `src/routes/more.tsx` | Header nav, tab bar | Hub page |
| `/forecast` | `ForecastPage` ("Weather") | More list, `weather_adjust_error` notification | |
| `/preview` | `SchedulePreviewPage` | More list, Programs toolbar "Day preview" | |
| `/sensors` | `AnalogSensorsPage` | More list | |
| `/sites` | `SitesPage` ("Controllers") | More list | |
| `/backup` | `ConfigBackupPage` | More list | |
| `/diagnostics` | `DiagnosticsPage` | More list | |
| `/about` | `AboutPage` | More list | |
| `/tools` | redirect to `/more` | **nothing links to it** | Legacy alias (`src/routes/tools.tsx:8`) |
| `/login` | `LoginPage` | Auto-redirect when not authenticated; after logout | |
| (any unknown) | redirect to `/` | | `src/routes/__root.tsx:37` |

All routes except `/login` are wrapped in `ProtectedPage` (`src/components/ProtectedPage.tsx:6`): it checks `/api/auth/session` and redirects to `/login` if needed.

---

## 1. App shell (header, nav, theme, logout, notifications)

Source: `src/components/AppLayout.tsx`, `src/components/NotificationsBell.tsx`, `src/context/ThemeContext.tsx`.

| Feature (UI label) | What it does | API / storage | Source | Class | Flags |
|---|---|---|---|---|---|
| Logo + "HydroDash / OpenSprinkler control" | Brand; links to Home | — | `AppLayout.tsx:68` | BASIC | |
| Desktop nav: Home, Zones, Programs, History, Settings, More | Primary navigation (active state) | — | `AppLayout.tsx:25-32,82-95` | BASIC | |
| Hamburger menu button ("Open/Close menu") | Toggles the mobile nav drawer (same 6 links + Logout) | — | `AppLayout.tsx:98-107,128-155` | BASIC | |
| Phone bottom tab bar: Home, Zones, Programs, History, More | Phone nav; the More tab stays highlighted on More sub-pages | — | `AppLayout.tsx:35-50,159-174` | BASIC | |
| Theme toggle (sun/moon icon) | Switches light/dark; first load follows the OS (`system`) | LS `hydrodash-theme` | `AppLayout.tsx:108-116`, `ThemeContext.tsx:73` | BASIC | No UI to go back to "system" mode (`setMode` exists but is unused) |
| Logout button (desktop header) | Ends the session, goes to `/login` | `POST /api/auth/logout` | `AppLayout.tsx:117-125` | BASIC | |
| Logout (inside hamburger drawer) | Same as above | `POST /api/auth/logout` | `AppLayout.tsx:146-154` | BASIC | Duplicate |
| Notifications bell + unread badge (99+) | Shows the unread count; hidden if notifications are off on the server | `GET /api/notifications/config`, `GET /api/notifications/unread-count` (polled every 30 s) | `NotificationsBell.tsx:21-64` | BASIC | |
| Notifications drawer ("Recent") | Lists the last 50 items (title, time, service key, unread dot). Click navigates to `item.route` | `GET /api/notifications/inbox?limit=50` | `NotificationsBell.tsx:65-94` | BASIC | |
| Auto mark-all-read on drawer open | Marks every item read when the drawer opens. Syncs the badge and clears ntfy | `POST /api/notifications/mark-all-read` | `NotificationsBell.tsx:30-33` | BASIC | No "mark unread" or per-item dismiss |
| Click outside closes drawer | UX | — | `NotificationsBell.tsx:35-43` | BASIC | |
| React Query / Router devtools | Dev overlay (bottom-right) | — | `src/routes/__root.tsx:46` | ADV | Dev-only, probably shouldn't ship |

---

## 2. Login (`/login`)

Source: `src/pages/LoginPage.tsx`.

| Feature | What it does | API / storage | Source | Class | Flags |
|---|---|---|---|---|---|
| Logo | Brand | — | `LoginPage.tsx:32-41` | BASIC | |
| "App password" field | HydroDash app password (not the controller password) | — | `LoginPage.tsx:46-55` | BASIC | |
| "Sign in" button | Logs in, then redirects to `/` | `POST /api/auth/login` | `LoginPage.tsx:57-59`, `hooks.ts:70` | BASIC | |
| Error box | Shows server error text | — | `LoginPage.tsx:44` | BASIC | |
| Auto-redirect if already authenticated | | `GET /api/auth/session` | `LoginPage.tsx:15-17` | BASIC | |

---

## 3. Home (`/`)

Source: `src/pages/DashboardPage.tsx`, `src/components/widgets/*`. Data: `/ja`, `/jc` (5 s poll), `/jn`, `/js` (5 s), `/jl` (yesterday + today), GitHub latest firmware release.

### 3a. Page-level and customization

| Feature | What it does | API / storage | Source | Class | Flags |
|---|---|---|---|---|---|
| "Customize Home dashboard" gear / "Done" toggle | Enters or leaves customize mode | — | `DashboardPage.tsx:466-483` | BASIC | |
| Customize panel: tile visibility checkboxes | Show or hide each of the 6 tiles (the last visible one can't be hidden) | LS `hydrodash.dashboardTileVisibility` | `DashboardPage.tsx:418-442` | BASIC | |
| Drag grip on each tile (customize mode) | Reorders tiles in the grid. Saved per breakpoint | LS `hydrodash.dashboardRglLayouts.2` | `DashboardPage.tsx:504-512`, `DashboardTile.tsx:123-130` | BASIC | |
| Tile max-height control (arrows icon, px input, OK) | Optional max height cap per tile (multi-column only). Empty = fit content | LS `hydrodash.dashboardTileMaxHeight` | `DashboardTile.tsx:86-121` | ADV | |
| "Reset layout to defaults" | Clears layouts and max heights | LS (above keys) | `DashboardPage.tsx:444-453` | BASIC | |
| Tile order list | Order of tiles in the customize list | LS `hydrodash.dashboardTileOrder` | `homeDashboardLayout.ts:27` | ADV | |
| Error / action message banners | API errors, action results | — | `DashboardPage.tsx:487-489` | BASIC | |

### 3b. Tile: "Now running" (`NowRunningWidget.tsx`)

| Feature | What it does | API / storage | Source | Class | Flags |
|---|---|---|---|---|---|
| Running zone list: name, program label, live countdown, progress bar | Zones currently on (masters excluded). Counts down each second between polls | `/jc` `sbits`, `ps`, `devt`; `/js` `sn` | `NowRunningWidget.tsx:87-130`, `dashboardShared.ts:115` | BASIC | |
| Per-zone "Stop" | Stops one zone | `/cm sid=X en=0` | `NowRunningWidget.tsx:105-113`, `DashboardPage.tsx:352` | BASIC | |
| "Up next" queued zones (4 + "+N more") | Queued zones with durations | `/jc` `ps` | `NowRunningWidget.tsx:134-140` | BASIC | |
| "Queue paused — timers are on hold" | Pause indicator | `/jc` `pq` | `NowRunningWidget.tsx:86` | BASIC | |
| "Nothing running · next: <program> <day> at <time>" | Next scheduled start in the next 7 days (weekly/single/monthly; **interval programs not covered**) | `/ja` programs, `/jc` `devt`, `sunrise`, `sunset` | `NowRunningWidget.tsx:69-79`, `dashboardShared.ts:168` | BASIC | |
| "Stop all" | Resets all stations (running and queued) | `/cv rsn=1` | `NowRunningWidget.tsx:141-143`, `DashboardPage.tsx:355` | BASIC | DESTR (no confirm) |

### 3c. Tile: "Controller" (`ControllerWidget.tsx`)

| Feature | What it does | API / storage | Source | Class | Flags |
|---|---|---|---|---|---|
| "Connected and synced." | Connection OK indicator | `/ja` success | `ControllerWidget.tsx:25-29` | BASIC | |
| Firmware `fwv.fwm` | Firmware version | `/ja options.fwv/fwm` | `ControllerWidget.tsx:31-35` | ADV | |
| Programs count | | `/ja programs.nprogs` | `:36-37` | BASIC | |
| Stations count | | `/ja status.nstations` | `:38-39` | BASIC | |
| "Update available <ver>" link / "Up to date" | Compares against the latest OpenSprinkler GitHub release (informational, no OTA) | `api.github.com/repos/OpenSprinkler/OpenSprinkler-Firmware/releases/latest` and `defines.h` | `:41-52`, `opensprinklerFirmwareRelease.ts:9-13` | ADV | External call |

### 3d. Tile: "Live status" (`LiveStatusWidget.tsx`)

| Feature | What it does | API / storage | Source | Class | Flags |
|---|---|---|---|---|---|
| Device time | Controller clock | `/jc devt` | `LiveStatusWidget.tsx:29-30` | BASIC | |
| Operation Enabled / Disabled | Master enable state | `/jc en` | `:31-38` | BASIC | |
| Rain delay "Until <time>" / Off | Rain delay status (**read-only; no UI to set it anywhere**) | `/jc rd`, `rdst` | `:39-42` | BASIC | |
| Queue "N zone(s)" | Queue length | `/jc nq` | `:43-44` | BASIC | |
| Pause "Active (Ns left)" / "Not paused" | | `/jc pq`, `pt` | `:45-48` | BASIC | |
| "Stop running stations" | Stops running stations only | `/cv rrsn=1` | `:52-58` | BASIC | Check that firmware supports `rrsn` |
| "Pause 10 min" / "Resume (cancel pause)" | Pauses the queue for 600 s (with confirm) or cancels the pause | `/pq dur=600` / `/pq dur=1` | `:59-70` | BASIC | |
| Overflow menu: "Disable operation" / "Enable operation" | Toggles controller operation (confirm on disable) | `/cv en=0|1` | `:74-92` | BASIC | DESTR (disable stops all schedules) |
| Overflow menu: "Reset all stations" | Stops every running and queued zone (confirm) | `/cv rsn=1` | `:93-101` | ADV | DESTR |

### 3e. Tile: "Sensors & weather" (`SensorsWidget.tsx`)

| Feature | What it does | API / storage | Source | Class | Flags |
|---|---|---|---|---|---|
| Sensor 1 Active / Inactive | | `/jc sn1` | `SensorsWidget.tsx:61-62` | BASIC | Doesn't say what the sensor type is |
| Sensor 2 Active / Inactive | | `/jc sn2` | `:63-64` | BASIC | |
| Weather provider (+ id) | Configured provider | `/jc wto.provider` | `:65-71` | ADV | |
| Weather service | Name reported by the weather script | `/jc wtdata.wp` | `:72-75` | ADV | |
| Weather error | `wterr` with a readable label | `/jc wterr` | `:76-77` | ADV | |
| Location (OpenStreetMap link if lat,lon) | | `/jc loc` | `:78-81` | BASIC | |

### 3f. Tile: "Recent irrigation" (`HistoryWidget.tsx`)

| Feature | What it does | API / storage | Source | Class | Flags |
|---|---|---|---|---|---|
| Event count "Yesterday and today" | | `/jl start..end` | `HistoryWidget.tsx:17-22` | BASIC | |
| Table Time / Station / Duration (last 28, newest first) | | `/jl` | `:32-51` | BASIC | |
| "Full history →" | Link to `/history` | — | `:53-55` | BASIC | |

### 3g. Tile: "Quick run" (`QuickRunWidget.tsx`)

| Feature | What it does | API / storage | Source | Class | Flags |
|---|---|---|---|---|---|
| Runnable program list (name, zone count) | Enabled programs that water at least one enabled zone | `/ja programs.pd`, `/jn stn_dis` | `QuickRunWidget.tsx:81-94`, `DashboardPage.tsx:184-201` | BASIC | |
| "Run" (spinner "Starting…") | Starts the program now, **replacing** the queue (qo=2), with the program's own weather flag | `/mp pid uwt qo=2`; SS `hydrodash.quickRunManualPid` | `:95-124` | BASIC | No confirm; cancels other running zones |
| "Stop" (when that program is running) | Stops each station that belongs to the program | `/cm sid en=0` (one call per zone) | `:102-106`, `DashboardPage.tsx:246-265` | BASIC | |
| "Programs →" | Link to `/programs` | — | `:130-132` | BASIC | |

---

## 4. Zones (`/zones`)

Source: `src/pages/StationsPage.tsx`. Data: `/jn`, `/ja`, `/je`, `/js` (4 s), `/jc` (5 s). Display follows App Settings: show disabled, group view, sort by name, show station number.

| Feature | What it does | API / storage | Source | Class | Flags |
|---|---|---|---|---|---|
| Zone list (optionally grouped "Group N", sorted by name, hiding disabled) | One card per zone | `/jn snames, stn_grp, stn_dis`; LS app prefs | `StationsPage.tsx:115-157,240-329` | BASIC | |
| Status badge Running / Disabled / Queued / Idle | | `/js sn`, `/jc ps`, `stn_dis` | `:391-419` | BASIC | |
| Status detail "<source> · Xm left" | Queue source (program name, Manual run, Run-once, "(manual)" for Quick run) and time left | `/jc ps` | `:420-425`, `:69-80` | BASIC | |
| "Pause 10 min" / "Resume watering" (top bar) | Pauses or resumes the queue | `/pq dur=600` / `/pq repl=0` | `:225-237` | BASIC | Duplicate of Home Live status. Resume uses a different param than Home (`repl=0` vs `dur=1`) |
| Duration chips 5 / 10 / 15 / 30 min + "Custom" | Picks the manual run length | local state | `:461-489` | BASIC | |
| Custom duration (h / m / s, max 18 h) | `DurationInput` | — | `:490-500`, `DurationInput.tsx` | BASIC | |
| "Start · <duration>" | Runs the zone manually (qo=0, append) | `/cm sid en=1 t qo=0` | `:501-511`, `:273-288` | BASIC | |
| "Stop" (running zone) | Stops the zone | `/cm sid en=0` | `:445-456` | BASIC | |
| Overflow: "Rename & attributes" / "Close editor" | Opens the inline editor | — | `:432-434` | BASIC | |
| Overflow: "Disable zone" / "Enable zone" | Sets the station disable bit (confirm on disable) | `/cs d0..dN` | `:436-440`, `:299-315` | ADV | DESTR-ish (zone stops running in programs) |
| Editor: "Zone name" + "Save name" (max 32) | Renames the station | `/cs s<sid>=name` | `:517-547` | BASIC | |
| Editor: "Station attributes" chips | **Read-only**: Master station 1/2, Ignore rain, Ignore sensor 1/2, Sequential/Parallel group, Special station type, Activate relay | `/ja stations.masop, masop2, ignore_rain, ignore_sn1/2, stn_seq/stn_grp, stn_spe, act_relay` | `:562-604`, `stationAttrs.ts` | ADV | **Can't edit** attributes here (gap vs. the official app) |
| Editor: extension / RF payload JSON | Raw `/je` row for special stations | `/je` | `:605-614` | ADV | |
| Not shown: per-zone last run, station group editing, special-station config (`/cs` sta type/data) | — | — | — | — | Gaps |

---

## 5. Programs (`/programs`)

Source: `src/pages/ProgramsPage.tsx`. Data: `/jp`, `/jn`, `/jc` (5 s), `/js` (4 s).

### 5a. List and toolbar

| Feature | What it does | API / storage | Source | Class | Flags |
|---|---|---|---|---|---|
| "New program" | Opens the editor with defaults | — | `ProgramsPage.tsx:1119-1121` | BASIC | |
| "Run-once" | Opens the run-once panel | — | `:1122-1131` | BASIC | |
| "Day preview" link | Goes to `/preview` | — | `:1132-1134` | BASIC | Duplicate entry (also in More) |
| Program card: name, Enabled/Disabled pill | | `/jp pd` | `:634-648` | BASIC | |
| Summary chips: Weather adjust on, Weekly/Interval/Monthly/Single run, Fixed start time(s) / Repeating runs / Single start, Odd/Even days, Date range only | | `pd` flag bits | `:678-716` | BASIC | |
| Meta: Days, Starts, Total, Date range | Human summary | `pd` | `:717-753` | BASIC | |
| Zones: per-zone duration pills | Disabled zones are muted | `pd[4]` | `:754-770` | BASIC | |
| "Run now" | Opens the Run program panel | — | `:783-785,1980-1986` | BASIC | |
| "Stop" (when running) | Stops each station of the program | `/cm sid en=0` | `:774-781,1975-1979` | BASIC | |
| "Edit" | Opens the editor modal | — | `:787-789` | BASIC | |
| Overflow: "Duplicate as new" | Copies into a new editor ("<name> copy") | — | `:587-597` | BASIC | |
| Overflow: "Turn on/off weather adjustment" | Toggles the program's uwt flag | `/cp pid uwt=0|1` | `:598-606` | BASIC | |
| Overflow: "Turn on/off program" | Enables or disables the program | `/cp pid en=0|1` | `:607-615` | BASIC | |
| Overflow: "Delete program" (confirm) | Deletes it | `/dp pid` | `:616-625` | BASIC | DESTR |
| Drag handle (6-dot) to reorder | Reorders programs (optimistic) | repeated `/up pid=k` | `:650-672,1904-1951`, `hooks.ts:545` | ADV | Changes program numbering |
| Status / error banners | | — | `:1115-1117` | BASIC | |

### 5b. Run program panel ("Run program #N")

| Feature | What it does | API / storage | Source | Class | Flags |
|---|---|---|---|---|---|
| Queue radios: Run after others (append, qo=0) / Run now and pause others (insert, qo=1) / Run now and cancel others (replace, qo=2, default) | Queue behavior | — | `:1141-1170` | ADV | Replace cancels running zones |
| "Use weather adjustment" checkbox | Defaults to the program's flag | — | `:1171-1179` | BASIC | |
| "Start program" / "Starting…" (20 s watchdog) | Starts the program | `/mp pid uwt qo`; SS quickRunManualPid | `:1181-1202` | BASIC | |
| "Cancel" | | — | `:1203-1205` | BASIC | |

### 5c. Run-once panel

| Feature | What it does | API / storage | Source | Class | Flags |
|---|---|---|---|---|---|
| Queue radios (append / insert / replace; default replace) | | — | `:1215-1244` | ADV | |
| "Use weather adjustment for this run" | | — | `:1245-1252` | BASIC | |
| Per-zone duration inputs (h/m/s, 0 = skip) | | — | `:1253-1278` | BASIC | |
| "Set all to 5 min", "Clear all" | Quick fill | — | `:1280-1291` | BASIC | |
| "Start run-once" | Runs once | `/cr t=[...] uwt qo` | `:1294-1310` | BASIC | |
| "Cancel" | | — | `:1311-1313` | BASIC | |
| Not exposed: `cnt`, `int`, `anno` params of `/cr` (repeat run-once, annotation) | — | `hooks.ts:573-585` | — | ADV | Supported by the hook but not in the UI |

### 5d. Program editor modal ("Edit Program #N" / "New Program")

All fields are saved together with `/cp pid name v endr from to` (`hooks.ts:588`, `ProgramsPage.tsx:991-1101`). Validation: at least 1 weekday; interval 2–128; "starting in" < interval; month day 0–31; at least 1 enabled zone with a duration; at least 1 start time.

| Section / field | What it does | Source | Class | Flags |
|---|---|---|---|---|
| Close (×), Esc, click outside | Closes without saving | `:1335-1345,935-937,1322` | BASIC | Unsaved edits are lost with no prompt |
| **Basics**: On/Off toggle | Program enabled flag | `:1357-1366` | BASIC | |
| Program name (max 32) | | `:1368-1376` | BASIC | |
| "Weather adjust" toggle | uwt flag | `:1378-1387` | BASIC | |
| "Date range" toggle + From (MM/DD) / To (MM/DD) | Seasonal date-range restriction | `:1388-1426` | ADV | |
| **Schedule**: Weekly / Interval / Single run / Monthly | Day type | `:1439-1468` | BASIC | Monthly needs newer firmware |
| Weekly: Mon–Sun checkboxes | | `:1470-1490` | BASIC | |
| Interval: "Every N days" (2–128), "Starting in (0 … N−1)" | | `:1492-1527` | ADV | |
| Single run: "Run date" (date picker) | | `:1529-1543` | BASIC | |
| Monthly: "Day of month" (0 = last day) | | `:1545-1563` | ADV | |
| "Day restrictions" (details): None / Odd days / Even days | | `:1565-1611` | ADV | |
| **Start time**: "First start": Clock / Sunrise / Sunset, time text input (12h/24h per pref) or offset minutes (−720..720) | | `:1624-1630`, `StartPickEditor :365-514` | BASIC (clock) / ADV (sun offsets) | |
| "Additional starts" (details): Repeating vs Fixed times | Start mode flag | `:1632-1668` | ADV | |
| Repeating: "Repeat count" (0 = once), "Every (minutes)" | | `:1670-1710` | ADV | |
| Fixed times: Start 2 / 3 / 4 checkbox + compact Clock/Sunrise/Sunset picker | | `:1711-1764` | ADV | |
| **Zones**: header "Total run Xm", "N zones" pill | | `:1769-1784` | BASIC | |
| "Set all zones to" duration + "Apply to all zones" | Bulk fill (enabled zones only) | `:1785-1823` | BASIC | |
| Per-zone duration (h/m/s, max 18 h) | Disabled zones are hidden | `:1832-1863` | BASIC | |
| Footer: "Save · <name>" / "Create program" | `/cp` | `:1868-1872` | BASIC | |
| Footer: "Delete" (edit only, confirm) | `/dp pid` | `:1873-1891` | BASIC | DESTR |
| Footer: "Cancel" | | `:1892-1894` | BASIC | |

---

## 6. History (`/history`)

Source: `src/pages/HistoryPage.tsx`. Data: `/jl start end`, `/ja` (names, options for master detection).

| Feature | What it does | API / storage | Source | Class | Flags |
|---|---|---|---|---|---|
| Table / Timeline view toggle | | — | `HistoryPage.tsx:235-254` | BASIC | |
| "Export" | Downloads the raw `/jl` JSON for the range | client-side file download | `:256-258,195-197` | ADV | |
| Overflow: "Clear all logs…" (confirm) | Deletes all controller logs | `/dl day=all` | `:259-269,203-214` | ADV | DESTR. Duplicate of Settings → Reset |
| Options summary "<from> – <to> · by day" + "Change"/"Done" (collapses on phones) | | — | `:273-286` | BASIC | |
| Grouping: Day / Station (table view) | | — | `:291-310` | BASIC | |
| Start date, End date (default: last 7 days) | Range for `/jl` | — | `:315-323` | BASIC | |
| "Refresh" | Refetches | `/jl` | `:324-328` | BASIC | |
| Summary: Total station events, Total runtime | | computed | `:337-344` | BASIC | |
| Table by day: collapsible day groups; columns Station, Runtime, Start, End, Flow | | `/jl` | `:427-475` | BASIC | Flow column shows the raw value (no unit) |
| Per-day "Delete" (confirm) | Deletes that day's logs | `/dl day=<YYYY-MM-DD>` | `:434-446,216-227` | ADV | DESTR. The key format sent may need checking (OS expects the epoch-day number) |
| Table by station: columns Day, Runtime, Start, End, Flow | | `/jl` | `:476-510` | BASIC | |
| Timeline: rows per zone and special (Rain sensor, Rain delay, Sensor 1/2), colored blocks per program, day lines, red "now" line, hover tooltip | | `/jl` | `:356-423` | BASIC | |

---

## 7. Settings (`/settings`)

Source: `src/pages/SettingsPage.tsx`. Data: `/ja` (hydrated once), `/jc` (15 s). Writes via `/co` (options), `/cs` (stations), `/dp`, `/dl`, `/cv`. Each section has its own Save button. Only System and Watering track unsaved changes (dirty state).

| Section | Field (UI label) | Option key / API | Source | Class | Flags |
|---|---|---|---|---|---|
| Page | Lead text, error/ok banner | — | `:591-598` | — | |
| Page | "Reload from controller" | refetch `/ja` + `/jc` | `:600-604` | ADV | |
| **System** (open by default) | Device time (read-only) + NTP hint | `/jc devt`, `opt.ntp` | `:609-614` | BASIC | |
| System | Timezone (UTC offsets −12:00..+14:00) | `/co tz` (encoded `(h+12)*4`) | `:615-631`, `opensprinklerOptions.ts:76-147` | BASIC | |
| System | Location ("City, ZIP, or lat,lon"; spaces become `_`) | `/co loc` | `:632-641` | BASIC | Also shown on Home and Weather |
| System | Enable logging | `/co lg` | `:642-647` | ADV | |
| System | Save changes / Discard / "Unsaved changes" | `/co` (changed keys only) | `:648`, `:435-451` | BASIC | |
| **App Settings** (browser only) | Use metric units | LS `os_app_isMetric` | `:656-663` | BASIC | Only affects flow-pulse units today |
| App Settings | Use 24-hour time | LS `os_app_is24Hour` | `:664-671` | BASIC | |
| App Settings | Order stations by groups | LS `os_app_groupView` | `:672-679` | ADV | |
| App Settings | Order stations by name | LS `os_app_sortByStationName` | `:680-687` | BASIC | |
| App Settings | Show disabled stations | LS `showDisabled` | `:688-695` | ADV | |
| App Settings | Show station number | LS `showStationNum` | `:696-703` | ADV | |
| **Configure Master** (`opt.mas`) | Master station 1 (None / station list) | `/co mas` | `:711-723` | ADV | |
| Configure Master | Master on adjustment (seconds) | `/co mton` | `:724-736` | ADV | |
| Configure Master | Master off adjustment (seconds) | `/co mtof` | `:737-749` | ADV | |
| Configure Master | Master station 2 | `/co mas2` | `:751-771` | ADV | |
| Configure Master | Master 2 on adjustment (seconds) | `/co mton2` | `:772-784` | ADV | |
| Configure Master | Master 2 off adjustment (seconds) | `/co mtof2` | `:785-797` | ADV | |
| Configure Master | "Save master settings" | `/co` | `:801-816` | ADV | |
| **Station handling** (`opt.ext`) | Number of stations (8 × (ext+1), up to `mexp`; hint shows `dexp` hardware count) | `/co ext` | `:825-837` | ADV | Shrinking hides zones |
| Station handling | Station delay (seconds) | `/co sdt` | `:838-849` | ADV | |
| Station handling | Sequential (vs parallel) | `/co seq` (legacy firmware) | `:850-855` | ADV | |
| Station handling | "Save station handling" | `/co` | `:856-868` | ADV | |
| **Weather and Sensors → Watering adjustment** | Adjustment method: Manual, Zimmerman, Auto rain delay (fw≥216), ETo (fw≥216), Monthly (fw≥220) | `/co uwt` | `:876-887`, `opensprinklerOptions.ts:181-187` | BASIC | Raw `uwt` is used (bit 7 = weather restriction, see Weather page). The value can mismatch when the restriction bit is set |
| Watering adjustment | Watering percentage (0–250%; locked unless Manual) | `/co wl` | `:888-902` | BASIC | Shown on the Weather page summary |
| Watering adjustment | Save changes / Discard | `/co` | `:903` | BASIC | |
| **Weather and Sensors → Rain, flow & sensors** | Use rain sensor (legacy firmware) | `/co urs` | `:908-917` | BASIC | |
| | Sensor (legacy port): None / Rain / Flow / Soil (fw≥219) / Program switch (fw≥217) | `/co urs` | `:918-934` | ADV | |
| | Sensor 1 type (same choices) | `/co sn1t` | `:935-951` | ADV | |
| | Sensor 2 type: None / Rain / Soil / Program switch | `/co sn2t` | `:952-967` | ADV | |
| | Rain sensor: normally open | `/co rso` | `:968-973` | ADV | |
| | Sensor 1: normally open | `/co sn1o` | `:974-979` | ADV | |
| | Sensor 2: normally open | `/co sn2o` | `:980-985` | ADV | |
| | Flow pulse rate (L or Gal per pulse) | `/co fpr0`, `fpr1` (×100 L) | `:986-1006` | ADV | |
| | Sensor 1 delayed on / off (minutes) | `/co sn1on`, `sn1of` | `:1007-1030` | ADV | |
| | Sensor 2 delayed on / off (minutes) | `/co sn2on`, `sn2of` | `:1031-1054` | ADV | |
| | Program switch hint | — | `:1055-1059` | ADV | |
| | "Save sensors" | `/co` | `:1060-1062` | ADV | |
| **Integrations** | Device name ("Shown in email / IFTTT") | `/co dname` | `:1071-1076` | ADV | Could also serve as a friendly controller name in the UI |
| Integrations | IFTTT webhooks key | `/co ifkey` | `:1077-1082` | ADV | |
| Integrations | Notification events (11 checkboxes): Program start, Sensor 1 update, Flow sensor update, Weather adjustment update, Controller reboot, Station finish, Sensor 2 update, Rain delay update, Station start, Flow alert, Under/overcurrent fault (bits 8+ need `ife2`) | `/co ife`, `ife2` | `:1083-1102`, `opensprinklerOptions.ts:150-162` | ADV | Different from HydroDash's own notifications (see §15) |
| Integrations | "Save device name, IFTTT & events" | `/co` | `:1103-1118` | ADV | |
| Integrations → **OpenThings Cloud (OTC)** (`settings.otc`) | Enable OTC | `/co otc={en,...}` | `:1123-1130` | ADV | |
| OTC | Token (32 chars) | `otc.token` | `:1131-1140` | ADV | |
| OTC | Server host | `otc.server` | `:1141-1149` | ADV | |
| OTC | "Save OTC" | `/co otc` | `:1150-1160` | ADV | |
| OTC | Raw JSON textarea + "Parse & save JSON" | `/co otc` | `:1161-1185` | ADV | |
| Integrations → **MQTT** | Enable MQTT | `/co mqtt.en` | `:1190-1197` | ADV | |
| MQTT | Broker / server | `mqtt.host` | `:1198-1206` | ADV | |
| MQTT | Port | `mqtt.port` | `:1207-1218` | ADV | |
| MQTT | Username (optional) | `mqtt.user` | `:1219-1227` | ADV | |
| MQTT | Password (optional) | `mqtt.pass` | `:1228-1237` | ADV | |
| MQTT | Publish topic | `mqtt.pubt` | `:1238-1246` | ADV | |
| MQTT | Subscribe topic (optional) | `mqtt.subt` | `:1247-1255` | ADV | |
| MQTT | "Save MQTT" | `/co mqtt` | `:1256-1266` | ADV | |
| MQTT | Raw JSON + "Parse & save JSON" | `/co mqtt` | `:1267-1291` | ADV | |
| Integrations → **Email** | Enable email | `/co email.en` | `:1295-1302` | ADV | |
| Email | SMTP server | `email.host` | `:1303-1311` | ADV | |
| Email | Port | `email.port` | `:1312-1323` | ADV | |
| Email | Sender email | `email.user` | `:1324-1332` | ADV | |
| Email | App password | `email.pass` | `:1333-1342` | ADV | |
| Email | Recipient email | `email.recipient` | `:1343-1351` | ADV | |
| Email | "Save email" | `/co email` | `:1352-1362` | ADV | |
| Email | Raw JSON + "Parse & save JSON" | `/co email` | `:1363-1387` | ADV | |
| **Reset** | "Clear log data" (confirm) | `/dl day=all` | `:1393-1406` | ADV | DESTR. Duplicate of History overflow |
| Reset | "Delete all programs" (confirm) | `/dp pid=-1` | `:1412-1430` | ADV | DESTR |
| Reset | "Reset all options" (confirm) | `/co` with factory defaults (ntp, dhcp, hp0/1, ext, sdt, mas, mton, mtof, rso, wl, devid, con, lit, dim, bst, uwt, lg, mas2, mton2, mtof2, fpr0/1, dns1-4, sar, ife, sn1t/o/on/of, sn2t/o/on/of, ntp1-4, loc=Boston,MA, wto key="") | `:1431-1455`, `:86-140` | ADV | DESTR (resets network, can make the device unreachable). Passes `fwv` as `hwv` (`:1443`), which looks like a bug |
| Reset | "Reset station attributes" (confirm) | `/cs g*, m*, n*, i*, j*, k*, a*, d*, q*, p*` | `:1456-1480`, `resetStationAttributes.ts` | ADV | DESTR |
| Reset | "Reset wireless" (only hwv 30–39 = OS 3.x; confirm) | `/cv ap=1` | `:1481-1501` | ADV | DESTR (device goes to AP mode) |
| **LCD screen** (`opt.con/lit/dim`) | Contrast (0–255) | `/co con` | `:1510-1522` | ADV | |
| LCD | Brightness (0–255) | `/co lit` | `:1523-1535` | ADV | |
| LCD | Idle brightness (0–255) | `/co dim` | `:1536-1548` | ADV | |
| LCD | "Save LCD settings" | `/co` | `:1549-1561` | ADV | |
| **Advanced → HTTP, device ID & timing** | HTTP port (restart required) | `/co hp0`, `hp1` | `:1577-1596` | ADV | DESTR (can lose access) |
| | HTTP port high/low byte (fallbacks if only one is present) | `/co hp0` / `hp1` | `:1597-1622` | ADV | Labels look swapped (hp0 is the low byte) |
| | Device ID (restart required) | `/co devid` | `:1623-1634` | ADV | |
| | Boost Time | `/co bst` | `:1635-1646` | ADV | |
| | Undercurrent threshold (mA) | `/co imin` | `:1647-1658` | ADV | |
| | Overcurrent limit (mA) | `/co imax` | `:1659-1670` | ADV | |
| | Target PD voltage | `/co tpdv` | `:1671-1682` | ADV | |
| | Latch on voltage | `/co laton` | `:1683-1694` | ADV | |
| | Latch off voltage | `/co latof` | `:1695-1706` | ADV | |
| | "Save hardware settings" | `/co` | `:1707-1709` | ADV | |
| **Advanced → network flags** | Use DHCP (restart required) | `/co dhcp` | `:1713-1718` | ADV | DESTR-ish |
| | NTP Sync | `/co ntp` | `:1719-1724` | ADV | |
| | Auto Reconnect | `/co ar` | `:1725-1730` | ADV | |
| | Ignore Password | `/co ipas` | `:1731-1736` | ADV | Security-sensitive |
| | Special Station Auto-Refresh | `/co sar` | `:1737-1742` | ADV | |
| | "Save network flags" | `/co` | `:1748-1762` | ADV | |
| **Advanced → static addresses** (`opt.ip1`) | NTP IP address | `/co ntp1-4` | `:1770-1775` | ADV | |
| | IP address | `/co ip1-4` | `:1776-1779` | ADV | DESTR-ish |
| | Gateway address | `/co gw1-4` | `:1780-1783` | ADV | |
| | Subnet mask | `/co subn1-4` | `:1784-1787` | ADV | |
| | DNS address | `/co dns1-4` | `:1788-1791` | ADV | |
| | "Save address settings" (disabled while DHCP is on) | `/co` | `:1792-1794` | ADV | |

**Options in `OPTION_KEY_INDEX` that are not editable anywhere:** `den`, `re` (remote extension mode), `fwire`. Also missing: controller password change (`useChangePassword` → `/sp` exists in `hooks.ts:627` but is **unused**), rain delay setter (`/cv rd=hours`), and weather adjustment options beyond provider/key (`wto` scales, baseETo, elevation, etc.).

---

## 8. More (`/more`)

Source: `src/routes/more.tsx`.

| Feature | What it does | API / storage | Source | Class | Flags |
|---|---|---|---|---|---|
| Settings row | → `/settings` | — | `more.tsx:29-34` | BASIC | Duplicate (header nav) |
| Weather row | → `/forecast` | — | `:35-40` | BASIC | |
| Schedule preview row | → `/preview` | — | `:41-46` | BASIC | Duplicate (Programs toolbar) |
| Sensors row | → `/sensors` | — | `:47-52` | ADV | |
| Controllers row | → `/sites` | — | `:53-58` | ADV | |
| Backup & restore row | → `/backup` | — | `:59-64` | ADV | |
| Diagnostics row | → `/diagnostics` | — | `:65-70` | ADV | |
| Notifications row (opens the modal; "Off / Not set up on this server" or "Checking…" otherwise; "(phone push not set up)" hint) | Only entry point to notification settings | `GET /api/notifications/config` | `:127-154,171-177` | BASIC | |
| About row | → `/about` | — | `:73-78,155` | BASIC | |
| "Log out" (danger row) | | `POST /api/auth/logout` | `:158-169` | BASIC | Third logout entry point |

---

## 9. Notification settings modal (`NotificationsSettingsModal.tsx`)

HydroDash's own server-side notifications (MariaDB plus the `hydrodash-notify` poller, with optional ntfy push). Separate from the controller's MQTT/email/IFTTT events in Settings.

| Feature | What it does | API / storage | Source | Class | Flags |
|---|---|---|---|---|---|
| Setup hint (DATABASE_URL, hydrodash-notify, NTFY_SERVER_URL) | | — | `NotificationsSettingsModal.tsx:61-64` | ADV | |
| "Default ntfy topic" | Push topic | `PUT /api/notifications/settings` `defaultTopic` | `:66-75` | ADV | |
| "Notify when" checkboxes (13): Zone started, Zone stopped, Program run started, Program run finished, Rain delay set, Rain delay cleared, Weather adjustment error, Sensor 1 change, Sensor 2 change, Program queue changed (default off), Controller enable toggled, Controller unreachable, Controller reachable again | Per-event enable | `enabledServices` | `:77-94`, `server/notifications/types.ts:21-86` | BASIC | Shows raw service keys in parentheses (technical) |
| "Send test notification" + result text | Inserts a test inbox row and pushes to ntfy | `POST /api/notifications/test` | `:96-126` | BASIC | |
| Cancel / Save | | `PUT /api/notifications/settings` | `:132-146` | BASIC | |
| Not exposed in UI: `topicsByService`, `topicsBySiteId` (per-event / per-controller topics) | Supported by the server model | `types.ts:2-8` | ADV | Gap |

---

## 10. Weather (`/forecast`)

Source: `src/pages/ForecastPage.tsx`. Data: `/jc` (8 s), `/ja`.

| Feature | What it does | API / storage | Source | Class | Flags |
|---|---|---|---|---|---|
| Back link "More" | | — | `MoreSubpageLayout.tsx` | BASIC | |
| Summary: Watering level (%) | | `/ja options.wl` | `ForecastPage.tsx:125-128` | BASIC | Read-only here; edited in Settings |
| Summary: Adjustment (method name) | | `/ja options.uwt & 0x7f` | `:129-132` | BASIC | Read-only here; edited in Settings |
| Summary: Last successful check | | `/jc lswc` | `:133-136` | BASIC | |
| Summary: Status OK / error label | | `/jc wterr` | `:137-149` | BASIC | |
| Live data: Weather service URL | | `/jc wsp` | `:154-159` | ADV | |
| Live data: Location string | | `/jc loc` | `:160-161` | ADV | Duplicate |
| Live data: Last weather check | | `/jc lwc` | `:162-163` | ADV | |
| Live data: Last successful check | | `/jc lswc` | `:164-165` | ADV | Duplicate of the summary |
| Live data: Weather error code + label + explanation | | `/jc wterr` | `:166-179` | ADV | |
| Live data: Weather restricted | | `/jc wtrestr` | `:180-181` | ADV | |
| "Technical details": raw `wtdata` JSON | Live weather payload | `/jc wtdata` | `:183-187`, `:24-49` | ADV | **The only place wtdata is shown, and only as raw JSON** |
| Provider select: Apple (default), AccuWeather, PirateWeather, Open Weather Map, OpenMeteo, DWD, Weather Underground | | `/co wto={...provider}` (keeps other wto keys) | `:192-206`, `weatherProviders.ts:1-9` | ADV | |
| "API key / token" (for AW, PW, OWM, WU) | | `/co wto.key` | `:207-219` | ADV | |
| "Save provider to controller" | | `/co wto` | `:220-222` | ADV | |

---

## 11. Schedule preview (`/preview`)

Source: `src/pages/SchedulePreviewPage.tsx`. Data: `/jp`, `/jc` (no poll).

| Feature | What it does | API / storage | Source | Class | Flags |
|---|---|---|---|---|---|
| Lead with today's sunrise–sunset | | `/jc sunrise, sunset` | `SchedulePreviewPage.tsx:32-37` | BASIC | **Only place sunrise/sunset is shown** |
| "N interval program(s) are not included" note | | — | `:39-43` | ADV | Interval programs aren't previewed |
| Date picker, "Previous day", "Next day" | | — | `:45-79` | BASIC | |
| 24h timeline with colored program blocks (hover title) | | computed | `:83-115` | BASIC | |
| "Ordered starts" list (time range, name, Program #) | | computed | `:117-133` | BASIC | |
| "Edit programs" link | → `/programs` | — | `:134-138` | BASIC | |

---

## 12. Sensors (`/sensors`), extended analog sensor API

Source: `src/pages/AnalogSensorsPage.tsx`, `src/components/SensorEditorModal.tsx`.

| Feature | What it does | API / storage | Source | Class | Flags |
|---|---|---|---|---|---|
| "Not available" card (unsupported firmware) + Technical details | Fallback | `/sl` error | `AnalogSensorsPage.tsx:155-176` | ADV | |
| Warnings from controller | | `/sl warnings` | `:188-197` | ADV | |
| "Add sensor" | Opens the editor (new) | — | `:200-205` | ADV | |
| "Read all now" | Triggers a read on all sensors | `/sr` | `:207-213` | ADV | |
| Count "N sensors · boards X" | | `/sl count, detected` | `:214-217` | ADV | |
| Table: Nr, Name, Type, Value, Unit, Last read | Live values (30 s poll) | `/sl`, `/sg` | `:228-303` | ADV | Values could be BASIC on Home (e.g. soil moisture) |
| Row "Read" | Reads one sensor | `/sr nr` | `:267-273` | ADV | |
| Row "Edit" | Opens the editor | — | `:274-283` | ADV | |
| Row "Remove" (confirm) | Deletes the sensor | `/sc nr type=0` | `:285-295` | ADV | DESTR |
| Log chart: Sensor select, Window (6 h / 24 h / 3 d / 7 d), Max points (100/300/500), SVG line chart | | `/so nr lasthours max` | `:306-364` | ADV | |
| Editor: Nr, Type (from `/sf` list or numeric), Name, Group, IP (network sensors), Port, Id (ADC / sub-id), Read interval (s), Factor, Divider, Unit label, Offset, Offset 2, MQTT topic, MQTT filter, URL (reserved), Enabled, Logging, Show on device home | Create or update a sensor | `/sc` (all params), `/sf` types | `SensorEditorModal.tsx:178-377,87-109` | ADV | |
| Editor Cancel / Save | | `/sc` | `:381-386` | ADV | |

---

## 13. Controllers (`/sites`)

Source: `src/pages/SitesPage.tsx`.

| Feature | What it does | API / storage | Source | Class | Flags |
|---|---|---|---|---|---|
| Explanation of OS_SITES / OS_BASE_URL env | | — | `SitesPage.tsx:24-29` | ADV | Developer-facing copy |
| "Single-controller mode" card | When there are no sites | — | `:31-38` | ADV | |
| Saved controllers list: label, id, "Active" badge | | `GET /api/auth/session` (`sites`, `activeSiteId`) | `:40-62` | BASIC (if multi-site) | |
| "Use this controller" / "Selected" | Switches the proxied controller and invalidates all data | `POST /api/auth/site` | `:53-59`, `hooks.ts:456` | BASIC | |
| Not present: site switcher in the header | Only reachable via More → Controllers | — | — | — | Redesign candidate (header switcher) |

---

## 14. Backup & restore (`/backup`)

Source: `src/pages/ConfigBackupPage.tsx`, `src/lib/controllerConfigImport.ts`, `src/lib/hydroDashAppBackup.ts`.

| Feature | What it does | API / storage | Source | Class | Flags |
|---|---|---|---|---|---|
| Intro + bullet warnings | | — | `ConfigBackupPage.tsx:129-158` | ADV | |
| "Download controller backup" | Downloads `/ja` as `controller-backup-YYYY-MM-DD.json` (same shape as the OG app export) | `/ja` | `:165-169,78-82` | ADV | |
| "Choose file to import…" (controller) | Parses the file, warns if network values differ, confirms, then applies sequential `/co`, `/cs`, `/dp`, `/cp` | `/co`, `/cs`, `/dp`, `/cp` | `:176-196,91-125`, `controllerConfigImport.ts:100+` | ADV | DESTR (overwrites all programs/stations/options) |
| "Download app backup" | Saves prefs, theme, and dashboard layout/visibility/order/max-heights | LS keys | `:223-227,84-89`, `hydroDashAppBackup.ts:19-32` | ADV | |
| "Choose file to restore…" (app, confirm, reloads page) | Restores the LS keys | LS | `:234-263` | ADV | DESTR (local) |

---

## 15. Diagnostics (`/diagnostics`)

| Feature | What it does | API / storage | Source | Class | Flags |
|---|---|---|---|---|---|
| "Controller debug" raw JSON dump | | `/db` | `src/pages/DiagnosticsPage.tsx:8-22` | ADV | No copy/download button |

## 16. About (`/about`)

| Feature | What it does | Source | Class |
|---|---|---|---|
| Logo + description, link to opensprinkler.com, parity disclaimer | Static | `src/pages/AboutPage.tsx:5-40` | BASIC |
| Not shown: HydroDash version / build | — | — | Gap |

---

## 17. Duplicates (same feature in several places)

| Feature | Places | Notes |
|---|---|---|
| Logout | Desktop header button, hamburger drawer, More → "Log out" | 3 entry points |
| Settings navigation | Desktop/hamburger nav, More list | Not in the phone tab bar |
| Schedule preview | More list, Programs toolbar "Day preview" | |
| Pause 10 min / resume | Home Live status tile (`/pq dur=600` / `dur=1`), Zones top bar (`/pq dur=600` / `repl=0`) | Resume uses different params |
| Stop everything | Home Now running "Stop all" (`/cv rsn=1`, no confirm), Home Live status overflow "Reset all stations" (`/cv rsn=1`, confirm), Live status "Stop running stations" (`/cv rrsn=1`) | Three buttons with confusing near-identical meanings |
| Run program now | Home Quick run (always replace, own uwt), Programs "Run now" panel (choose qo/uwt) | |
| Stop program | Home Quick run "Stop", Programs card "Stop" | Same logic duplicated in `DashboardPage.tsx:246` and `ProgramsPage.tsx:872` |
| Stop single zone | Home Now running row "Stop", Zones card "Stop" | |
| Clear all logs | Settings → Reset → "Clear log data", History overflow "Clear all logs…" | |
| Location | Settings System (edit), Home Sensors tile (view), Weather page (view) | |
| Watering % and adjustment method | Settings (edit), Weather summary (view) | Weather page tells you to edit in Settings |
| Weather error / provider | Home Sensors tile, Weather page | |
| Last successful weather check | Weather summary and Live data card | Same page, twice |
| Device time | Home Live status, Settings System | |
| Program enable / weather toggle | Program card overflow, Program editor Basics | |
| Notification events | Settings → Integrations (controller MQTT/email/IFTTT bitmask) vs. More → Notifications (HydroDash server push) | Two different systems with similar names; clarify in the redesign |

## 18. Dead / unreachable code and routes

| Item | Status |
|---|---|
| `/tools` | Redirects to `/more`; not linked anywhere |
| `/logs` | Redirects to `/history`; not linked anywhere |
| `/stations` | Redirects to `/zones`; not linked anywhere |
| `/preview` | **Reachable** (More + Programs toolbar) |
| `src/pages/SectionPreviewPage.tsx` | Not imported by any route ("Phase 2 layout preview" mock), dead |
| `useChangePassword` (`/sp`) in `hooks.ts:627` | Unused; no UI to change the controller password |
| `useRunOnce` extra params `cnt`, `int`, `anno` | Unused |
| `ThemeContext.setMode('system')` | No UI; you can't go back to "follow OS" after toggling |
| `TanStackRouterDevtools` | Rendered in all builds (`__root.tsx:46`) |
| Mobile hamburger drawer vs. tab bar | Both exist (CSS decides which shows); the drawer duplicates nav plus logout |
| Notifications `topicsByService`, `topicsBySiteId` | Server-supported, no UI |

## 19. Missing capabilities worth knowing (not in UI today)

- Set or clear **rain delay** (`/cv rd=<hours>`). It's only displayed.
- Edit **station attributes** (master operation, ignore rain/sensors, sequential group, activate relay, special station type/data via `/cs`). Read-only in Zones.
- Change **controller password** (`/sp`).
- Edit **weather adjustment options** (`wto` scales, baseline ETo, elevation, monthly percentages).
- Edit option keys `den`, `re`, `fwire`.
- Reboot controller (`/cv rbt=1`). Not present.

---

## 20. Data already fetched but not surfaced (home-screen candidates)

Polled `/jc` (5 s on Home) and `/ja` already deliver these. Field names below are OpenSprinkler firmware keys; availability depends on firmware/hardware.

| Data | Field(s) | Source query | Currently shown? | Home idea |
|---|---|---|---|---|
| Live weather readings | `wtdata` object. Zimmerman: `t` (temp °F), `h` (humidity %), `p` (precip in), `raining`. ETo: `eto`, `radiation`, `minT`, `maxT`, `minH`, `maxH`, `wind`, `p`. Plus `wp` (provider name), `scale`/`sunrise`/`sunset` on some scripts | `/jc`, `/ja settings` | Raw JSON only (Weather → Technical details); `wp` on Home | Weather card: temp, humidity, rain, ETo |
| Sunrise / sunset | `sunrise`, `sunset` (minutes after midnight) | `/jc` | Only the Preview page lead text | "Sunrise 6:42 · Sunset 19:10" chip; sun-relative schedule hint |
| Watering level | `options.wl` (%) | `/ja`, `/jo` | Weather page only | Big "Watering at 85%" badge |
| Adjustment method / restriction | `options.uwt` (bit 7 = restricted), `wtrestr` | `/ja`, `/jc` | Weather page | "Auto (Zimmerman)" label; "Watering restricted by weather" |
| Last weather check / success | `lwc`, `lswc` | `/jc` | Weather page | "Weather updated 12 min ago" |
| Last run | `lrun` = `[sid, pid, duration_sec, end_epoch]` | `/jc` | **No** | "Last watered: Front lawn, 12 min, 7:05" |
| Rain delay | `rd`, `rdst` | `/jc` | Home Live status (text) | Prominent rain-delay banner with a countdown and a Set/Cancel action |
| Rain / soil sensor states | `sn1`, `sn2` (active), types from `options.sn1t`, `sn2t`, `urs` | `/jc`, `/ja` | Home tile shows "Active/Inactive" only, no type | "Rain sensor: wet — watering suspended" |
| Flow sensor | `flcrt` (current flow pulse count), `flwrt` (flow window), `options.fpr0/fpr1` (pulse rate); `/jl` rows carry flow volume in col 4 for `fl` entries | `/jc`, `/jl` | History Flow column (raw) only | Live flow rate (L/min) while watering; daily water usage total |
| Current draw | `curr` (mA) | `/jc` | **No** | Fault indicator (over/undercurrent) |
| Uptime / reboot | `lupt` (last reboot time), `lrbtc` (last reboot cause) | `/jc` | **No** | Diagnostics or health chip |
| Wi-Fi signal | `RSSI` | `/jc` | **No** | Connection quality chip |
| Network | `mac`, `eip` (external IP), `devip`/`ip1-4`, `dhcp` | `/jc`, `/ja` | No (only as Settings inputs) | Diagnostics |
| Controller name | `settings.dname` | `/ja` | Settings input only | Header title / site name |
| Hardware | `options.hwv`, `hwt`, `dexp`, `mexp`, `nbrd` | `/ja` | No | About/diagnostics |
| OTC status | `otcs` (OpenThings connection status) | `/jc` | No | Integration health |
| Queue / pause | `nq`, `pq`, `pt`, `ps` | `/jc` | Yes (Home) | — |
| Program list for "today" | `pd` + preview builder (`buildSchedulePreview`) | `/ja` | Next run only (1 line) | "Today's schedule" mini-timeline on Home |
| Per-zone history | `/jl` already loaded for yesterday + today on Home | `/jl` | Recent-irrigation table | Per-zone "last watered" on Zones and Home |
| Extended sensor values | `/sg datas[]` (`nr`, `data`, `unit`, `last`) | `/sg` (Sensors page only) | Sensors page | Soil moisture / temperature tiles on Home |
| HydroDash notifications | inbox items | `/api/notifications/inbox` | Bell drawer | "Recent alerts" strip |
| Firmware update | GitHub latest release | GitHub API | Controller tile | Settings/About badge |

---

## 21. Counts (approximate controls/features per page)

| Page | Count |
|---|---|
| Shell (header, nav, theme, bell, drawer, logout) | 12 |
| Login | 5 |
| Home (customize + 6 tiles) | 37 |
| Zones | 13 |
| Programs (list + run + run-once + editor) | 55 |
| History | 14 |
| Settings (10 sections) | 105 |
| More | 10 |
| Notification settings modal | 6 |
| Weather | 15 |
| Schedule preview | 6 |
| Sensors (+ editor) | 13 (editor has 19 fields) |
| Controllers | 5 |
| Backup & restore | 5 |
| Diagnostics / About | 1 / 1 |
