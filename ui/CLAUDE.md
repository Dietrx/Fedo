# UI-Dev (Path 3)
Aufgabe: Overlay pro Post (`render(itemId, anchor, state)`), Popup und Visuals.
- Schnittstelle: `OverlayRenderer` in contracts/modules.ts, Zustände: `OverlayState` in contracts/types.ts
- Alles im Shadow DOM (`index.ts`), Styles in `styles.ts`, Popup in `popup/`
- Testen: `npm run dev:ui` → http://localhost:8000 (Fake-Feed mit Fixtures, Button „Simulate live video“)
- Labels und Texte für Signale kommen aus contracts/signals.ts

## Adaptierbarkeit (Contracts ändern sich)
- `npx tsx ui/dev/contract-coverage.ts` prüft die UI gegen `contracts/`: jedes Signal hat Label + Farbe, jede Stufe einen Style,
  alle Fixtures laufen durch, und es listet, welche Contract-Felder die UI (noch) nicht liest. Nach jedem `git pull` einmal laufen lassen.
- Neue Signal-**Gruppe** in `contracts/signals.ts`: rendert automatisch neutral („other"). Farbe dazu in `ui/theme.ts` (CAT, GROUPS, GLYPH) + `LABEL` in popup/dashboard.
- Neue **Felder** an `AnalysisResult`: optional lesen, `undefined` immer abfangen (ältere Ergebnisse haben sie nicht).
- Themes/Tokens nur in `ui/theme.ts` ändern; alles andere liest `var(--…)`.
