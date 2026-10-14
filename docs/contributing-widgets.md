# Contributing Home cards

This guide is for adding a card to the **Home** page. Home is a live *Now running* hero (`HomeHero`) followed by a responsive grid of cards; users can show/hide and reorder cards in **Customize Home** (an Advanced section at the bottom of the page).

## 1. Fork and branch

1. Fork this repository on GitHub (use your fork as `origin`; add the canonical repo as `upstream` if you plan to sync often).
2. Clone your fork and create a branch from the repository root (the folder with **`package.json`**):

   ```bash
   cd HydroDash
   git checkout -b feature/my-home-card
   ```

## 2. Where Home lives

| Location | Role |
| -------- | ---- |
| `src/pages/DashboardPage.tsx` | Fetches data, renders the hero and the card grid (`renderCard`). |
| `src/components/widgets/` | Hero and card components (`HomeHero.tsx`, `UpNextCard.tsx`, `ConditionsCard.tsx`, …). |
| `src/components/widgets/dashboardShared.ts` | Shared helpers (now-running / queue builders, next scheduled run, time formatting on the controller clock). |
| `src/components/widgets/dashboardWidgets.module.css` | Shared card styles. |
| `src/lib/homeDashboardLayout.ts` | Card registry, default order/visibility, persisted Customize Home state. |

## 3. Adding a card

Pick a **stable id** (lowercase, no spaces), e.g. `flow`.

1. **`src/lib/homeDashboardLayout.ts`**
   - Append the id to **`HOME_CARD_IDS`** (array order = default order for new users).
   - Add its label to **`HOME_CARD_TITLES`** (shown in Customize Home).
   - Add it to **`HOME_WIDE_CARDS`** if it should span two columns on the 3-column desktop grid.
   - Existing users get the new card automatically; saved order/visibility is merged with defaults on read.
2. **Component** — create e.g. `src/components/widgets/FlowCard.tsx` built on the shared `Card` from `src/components/ui.tsx` (title, optional `icon`, `subtitle`, `titleAction` link). Accept a `className` prop and pass it to `Card` so wide cards span correctly. Export it from **`src/components/widgets/index.ts`**.
3. **`src/pages/DashboardPage.tsx`** — add a `case 'flow':` to `renderCard` and pass the data it needs. Prefer React Query hooks the page already uses (`useController`, `useJsonAll`, `useStationStatus`, …) and keep cards mostly presentational.

## 4. Design rules

- Use the shared building blocks in **`src/components/ui.tsx`** (`Card`, `Button`, `Pill`, `StatTile`, `ListRow`, `EmptyState`, `AdvancedSection`, …) and semantic CSS tokens only (`var(--color-*)`, `--space-*`, `--radius-*`) so the card works in **light and dark**.
- Everyday information first; anything installer-level goes in an **`AdvancedSection`**.
- Destructive actions are red, go in an `OverflowMenu` (`⋯`), and must be confirmed with **`useConfirm()`** (`src/components/confirmContext.ts`) — never `window.confirm`.
- Report action results with **`useToast()`** (`src/components/toastContext.ts`) instead of inline banners.
- Controller timestamps are the controller's local wall clock encoded as UTC: format them with the helpers in `dashboardShared.ts` / `src/lib/formatLocale.ts`, not `new Date().toLocaleString()` in the browser zone.
- Cards size to their content — avoid fixed heights and inner scrolling.

## 5. Quality checks before you open a PR

```bash
npm run lint
npx tsc --noEmit -p tsconfig.app.json
```

Run **`npm run dev`**, open **Home**, toggle and reorder your card in **Customize Home**, and check it on a phone-sized and a desktop window in light and dark mode. No controller? See *Local development* in the README for the OpenSprinkler demo firmware in Docker.

## 6. Opening a pull request

1. Push your branch to your fork and open a PR against the upstream default branch.
2. In the description, include **what** the card shows or does, **which OpenSprinkler / firmware behaviour** you relied on, and **screenshots** (phone + desktop, light + dark).
3. Keep the diff focused: one card (plus registration wiring) per PR when possible.

If you are unsure about a new API hook or server route for the controller, open an issue first so maintainers can agree on the shape before you build the UI.
