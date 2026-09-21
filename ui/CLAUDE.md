# UI-Dev (Path 3)
Aufgabe: Overlay pro Post (`render(itemId, anchor, state)`), Popup und Visuals.
- Schnittstelle: `OverlayRenderer` in contracts/modules.ts, Zustände: `OverlayState` in contracts/types.ts
- Alles im Shadow DOM (`index.ts`), Styles in `styles.ts`, Popup in `popup/`
- Testen: `npm run dev:ui` → http://localhost:8000 (Fake-Feed mit Fixtures, Button „Simulate live video“)
- Labels und Texte für Signale kommen aus contracts/signals.ts
