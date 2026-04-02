# Contributing dashboard widgets

This guide is for adding a **Home** dashboard tile: a React component shown inside the draggable grid, with visibility and layout persisted in the browser.

## 1. Fork and branch

1. Fork this repository on GitHub (use your fork as `origin`; add the canonical repo as `upstream` if you plan to sync often).
2. Clone your fork. Git uses the **repository name** as the default folder (e.g. **`HydroDash`**).

   ```bash
   cd HydroDash
   git checkout -b feature/my-dashboard-widget
   ```

3. Do all widget work from **`HydroDash/`** (the root of that clone: the folder that contains **`package.json`**, where the npm package name is **`hydrodash`**).

## 2. Where widgets live

| Location | Role |
| -------- | ---- |
| `src/components/widgets/` | Tile **body** components (e.g. `ControllerWidget.tsx`, `QuickRunWidget.tsx`). |
| `src/components/widgets/dashboardWidgets.module.css` | Shared styles for widgets; you can add a co-located `MyWidget.module.css` if needed. |
| `src/components/widgets/index.ts` | Barrel exports for widgets and shared helpers. |
| `src/pages/DashboardPage.tsx` | Wires the grid: fetches data, calls `renderTileBody`, wraps each tile in `DashboardTile`. |

The shell around every tile is **`DashboardTile`** (`DashboardTile.tsx`): title, optional height editor (cog), and the drag handle class **`RGL_DRAG_HANDLE_CLASS`** for react-grid-layout. Your widget only fills the **card body**.

## 3. Tile ID and registration checklist

Pick a **stable string id** (lowercase, no spaces), e.g. `raindelay`. It becomes a `DashboardTileId` and must stay consistent across files.

Add the id and metadata in this order (TypeScript will guide you if any `Record<DashboardTileId, …>` is incomplete):

1. **`src/lib/dashboardTileOrder.ts`**  
   Append the id to **`DASHBOARD_TILE_IDS`**.  
   `DashboardTileId` is derived from this array; order here is the default order for new users.

2. **`src/components/widgets/tileTitles.ts`**  
   Add **`DASHBOARD_TILE_TITLES[id]`** — short label shown in the card header and in **Customize Home**.

3. **`src/lib/dashboardRglLayout.ts`**  
   - **`DASHBOARD_TILE_DEFAULT_H`** — default grid **height in rows** when the tile is placed or reset.  
   - **`DASHBOARD_TILE_ROW_BOUNDS`** — **`minH` / `maxH`** for the cog “height in rows” editor.

4. **`src/lib/dashboardTileVisibility.ts`**  
   In **`defaultVisibility()`**, set **`[id]: true`** (or `false` if the tile should start hidden).

5. **New component** — e.g. `src/components/widgets/RainDelayWidget.tsx`.  
   Export it from **`src/components/widgets/index.ts`**.

6. **`src/pages/DashboardPage.tsx`**  
   - Import your widget.  
   - Add a **`case 'yourid':`** in **`renderTileBody`** and return your component with the props it needs.  
   - Pass data via React Query hooks already used on the page, or add hooks there and thread props down (keep widgets mostly presentational when possible).

### Persisted layout and migrations

Layouts live in **`localStorage`** under keys such as `hydrodash.dashboardRglLayouts.2`. Adding a tile does not require users to clear storage: **`normalizeDashboardLayoutsForVisible`** appends default positions for ids that appear in the layout store for the first time. If you ever **remove** or **rename** a tile id, consider documenting a one-time “Reset layout to defaults” in **Customize Home** for affected users.

## 4. API surface for widget code

### Data and actions

- **`src/api/hooks.ts`** — React Query hooks (`useController`, `useJsonAll`, `useStationsMeta`, `useRunProgram`, `useManualStation`, …). Prefer the same patterns as existing widgets.
- **`src/api/client.ts` / `src/api/types.ts`** — Lower-level client and shared types if you need something not wrapped by a hook yet.

### UI building blocks

- **`src/components/ui/`** — `Card`, `Button`, `Input`, `Spinner`, `ErrorBox`, etc.

### Shared dashboard helpers

- **`src/components/widgets/dashboardShared.ts`** — Re-exported from `index.ts` for bits like program/zone helpers used by multiple tiles.

### Styling

- Reuse **`dashboardWidgets.module.css`** classes (`styles.dl`, `styles.ok`, …) so the Home dashboard stays visually consistent.
- Follow existing spacing and typography; avoid fixed heights that fight the resizable tile body unless necessary.

### Drag-and-drop

Do not remove or cover the grip that uses **`RGL_DRAG_HANDLE_CLASS`** — it is required for reordering. Interactive controls should live in the card body; the dashboard passes **`cancel: 'input, select, textarea, button, a'`** so dragging does not start from those elements.

## 5. Quality checks before you open a PR

From **`HydroDash/`** (repository root — where you run the dev server):

```bash
npm run lint
npx tsc --noEmit
```

Run **`npm run dev`**, open **Home**, toggle your tile in **Customize Home**, drag it, and change height with the cog.

## 6. Opening a pull request

1. Push your branch to your fork and open a PR against the upstream default branch.
2. In the description, include:
   - **What** the widget shows or does.
   - **Which OpenSprinkler / firmware behaviors** you relied on (if any).
   - **Screenshots** of the tile on Home (helpful for review).
3. Keep the diff focused: one widget (plus registration wiring) per PR when possible.

If you are unsure about a new API hook or server route for the controller, open an issue first so maintainers can agree on the shape before you build the UI.
