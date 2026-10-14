# Redesign agent brief (shared by all page agents)

Repo/worktree: /home/gil/.t3/worktrees/HydroDash/t3code-50d46753 — run everything from there.
Read first: docs/redesign/information-architecture.md (the plan you implement), docs/redesign/feature-inventory.md (every existing feature — none may be lost), /tmp/hd-mocks/d-water.html (the visual direction, mock "D · Water").

## Rules
- Only edit the files you own (listed in your task). Other agents edit other pages concurrently in this same worktree.
- Do NOT git commit / stash / checkout / reset. Do NOT run npm install. Do NOT edit src/index.css, src/components/ui.tsx, src/components/ui.module.css, src/components/AppLayout.*. If you need a new building block, make it local to your files.
- Preserve every feature and mutation. Re-layout, restyle, move between basic/advanced — never drop. If you intentionally change behaviour, say so in your report.
- Use semantic tokens only (var(--color-*), --space-*, --radius-*, --shadow-*, --hero-*, --glass-*); never hard-code light-only colours — everything must work in light AND dark (`:root[data-theme='dark']`).
- Match code style of the repo (CSS modules, comment density, naming).

## Building blocks (src/components/ui.tsx)
- `PageHero({ title, eyebrow?, subtitle?, back?: {to,label}, actions?, children?, size?: 'compact'|'default'|'tall' })` — MUST be the first element of every page. Blue gradient band; the header floats over it; the next element automatically overlaps its bottom edge. Put hero buttons as `<Button variant="light">` (primary on hero) / `variant="glass"`; `OverflowMenu onHero`; `Pill tone="glass"` for status in `eyebrow`.
- `PageBody` — vertical stack wrapper for everything after the hero (put it directly after PageHero).
- `Card({ title, subtitle?, icon?, titleAction?, variant?: 'default'|'plain'|'flush' })`, `SectionHeader({title, action})`, `ListGroup` + `ListRow({ to|onClick, icon, iconTone, title, description, trailing, danger, chevron })`.
- `Button({ variant: primary|secondary|danger|ghost|cta|glass|light, size: sm|md|lg, startIcon })`, `Input`, `Select`, `Field({label, hint, htmlFor})`, `Label`, `Switch({checked,onChange,label,description})`, `Segmented`, `Pill({tone: neutral|accent|success|warning|danger|advanced|glass})`, `StatTile({label,value,icon,tone,hint})`, `EmptyState`, `ErrorBox`, `Spinner`, `OverflowMenu({items,label,onHero})`.
- `AdvancedSection({ id, title?, description?, children })` — THE way to hold advanced options: dashed purple, wrench icon, collapsed by default, remembers state; auto-open when the app pref "Show advanced options" is on.
- Destructive actions: red, always confirmed (window.confirm is fine), inside `⋯` or a "Danger zone" — never a primary button.

## Visual loop (required)
Dev server: http://localhost:5173 (already running, password `demo`), backed by an OpenSprinkler DEMO firmware with 8 zones / 3 programs.
- Screenshot: `node /tmp/hdtool/shoot.mjs /tmp/hdshots/<you> "/route1,/route2" mobile,desktop light,dark` → files `<mode>-<scheme>-<route>.png` (full page). Look at them with the Read tool (crop/resize with `magick` if huge, e.g. `magick in.png -resize 50% out.png`). `PAGEERROR` lines mean runtime errors — fix them.
- Make the controller do things: `/tmp/hdtool/ctl.sh run-zone <sid> <sec>`, `run-program <pid0>`, `stop`, `raindelay <hours>` (shared controller — other agents may also start/stop things; don't rely on exact state).
- Iterate until it looks polished on phone (412px) and desktop (1440px), light and dark. Check: hero first, cards overlap hero, no horizontal overflow, nothing clipped, menus not hidden, tap targets ≥ 40px, consistent spacing, text contrast in dark mode.

## Checks before reporting
`npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -E "<your files>"` (project has pre-existing errors in server files — ignore those) and `npx eslint <your files>`.
Report: what changed per page, where each existing feature now lives (basic vs advanced), any feature you could not keep, intentional behaviour changes, and the paths of 2–4 final screenshots.
