# UI dev (Path 3)
Task: Overlay per post (`render(itemId, anchor, state)`), popup and visuals.
- Interface: `OverlayRenderer` in contracts/modules.ts, states: `OverlayState` in contracts/types.ts
- Everything in the Shadow DOM (`index.ts`), styles in `styles.ts`, popup in `popup/`
- Testing: `npm run dev:ui` → http://localhost:8000 (fake feed with fixtures, button "Simulate live video")
- Labels and texts for signals come from contracts/signals.ts

## Adaptability (contracts change)
- `npx tsx ui/dev/contract-coverage.ts` checks the UI against `contracts/`: every signal has a label + color, every level a style,
  all fixtures run through, and it lists which contract fields the UI does not read (yet). Run it once after every `git pull`.
- New signal **group** in `contracts/signals.ts`: renders automatically as neutral ("other"). Add the color in `ui/theme.ts` (CAT, GROUPS, GLYPH) + `LABEL` in popup/dashboard.
- New **fields** on `AnalysisResult`: read them optionally, always handle `undefined` (older results do not have them).
- Themes/tokens only change in `ui/theme.ts`; everything else reads `var(--…)`.
