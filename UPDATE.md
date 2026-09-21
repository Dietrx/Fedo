# UPDATE.md — Was ist gerade auf `main`?

> **Wofür diese Datei?** Damit jeder im Team sieht, was der aktuellste Stand ist,
> ohne das Git-Log lesen zu müssen. **Neuester Eintrag steht oben.**

**Spielregeln:**
- Wer auf `main` merged, schreibt oben einen neuen Eintrag dazu.
- Ein Eintrag beantwortet zwei Fragen: *Was hat sich geändert?* und *Was muss ich jetzt tun?*
- Neue Einträge oben einfügen, alte nicht umschreiben — die Datei ist auch ein Verlauf.

---

## 2026-09-21 · `contracts/overall-intensity` · Contracts (AI → UI) · Neues optionales Feld `AnalysisResult.overall`

**Was hat sich geändert:**
- `contracts/types.ts`: `AnalysisResult.overall?: { level: "none" | "low" | "medium" | "high"; score: number }`
  = alle Signale zu EINER Stufe pro Post zusammengefasst (Typen `IntensityLevel`, `OverallIntensity`).
- `contracts/fixtures.ts`: alle `FIXTURE_RESULTS` haben Beispielwerte für `overall`.

**Was musst du tun:**
- `git pull --rebase origin main`
- **UI-Dev:** `result.overall` als Badge pro Post darstellen (z. B. Farbe nach `level`). Das Feld ist
  optional → bei `undefined` einfach kein Badge zeigen. Im Playground sind die Werte über die Fixtures schon da.
- Scraper-Dev: nichts.

**Wichtig zu wissen:** Kein Breaking Change (Feld ist optional). Wording: Die Stufe beschreibt, wie stark
Überzeugungs-TECHNIKEN eingesetzt werden, nicht ob etwas wahr oder „gefährlich“ ist. `political_content` allein ergibt immer `none`.

---

## 2026-09-21 · `main @ e9a7de5` · Alle Paths · Grundgerüst steht (v0.1.0)

Das Projekt ist aufgesetzt. Alle drei Paths können **ab sofort parallel und unabhängig**
voneinander arbeiten — niemand muss auf jemanden warten.

**Was drin ist:**
- `contracts/` — die gemeinsame Schnittstelle: Typen, die drei Interfaces (`Scraper`,
  `Analyzer`, `OverlayRenderer`), Signal-Definitionen, Fixtures, Messaging.
- `scraper/` — X funktioniert bereits (`article[data-testid="tweet"]` + MutationObserver).
  TikTok-Selektoren sind **best effort** und müssen im DevTools verifiziert werden.
- `ai/` — läuft aktuell auf dem **Mock-Analyzer** (Keyword-Heuristik). `jev.ts` ist ein
  **Skelett**: nur `callJev()` muss an die echte TypeSafe-Jev-API angepasst werden.
- `ui/` — Overlay im Shadow DOM (`pending` / `done` / `error`), Popup, Playground-Fake-Feed.
- `extension/src/` — der Glue, der alles verdrahtet. Bleibt bewusst dünn.
- CI + `npm run check` (Typecheck + Boundaries + Build) als Gate vor jedem Push.
- Doku: `README.md` (Überblick), `START_HERE.md` (vollständiges Onboarding).

**Was musst du tun:**
```bash
git pull --rebase origin main
npm install        # beim ersten Mal nötig
npm run build      # → dist/, dann in chrome://extensions "Load unpacked"
```

**Wichtig zu wissen:**
- Die Analyse ist noch **Mock**, nicht echt. Ergebnisse sind Platzhalter, aber im richtigen Format.
- `contracts/` bitte **nicht eigenmächtig ändern** — vorschlagen, der Mensch spricht es mit dem Team ab.
  Ausnahme: neue Fixtures in `fixtures.ts` ergänzen ist ohne Absprache okay.
- Arbeite nur im Ordner deiner Rolle. `npm run check:boundaries` schlägt sonst fehl.

**Nächste offene Punkte** stehen pro Rolle in `START_HERE.md`, Abschnitt 8.

---

<!--
Vorlage für den nächsten Eintrag — oben einfügen, direkt unter den Spielregeln:

## JJJJ-MM-TT · `main @ <hash>` · <Scraper|AI|UI|Glue> · <Titel in einem Satz>

**Was hat sich geändert:**
- ...

**Was musst du tun:**
- `git pull --rebase origin main`
- (nur wenn package.json betroffen war: `npm install`)
- `npm run build` + in chrome://extensions auf ↻

**Wichtig zu wissen:** (Breaking Changes, neue Contracts, Stolperfallen — sonst weglassen)
-->
