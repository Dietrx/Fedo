# START HERE: Onboarding für Devs und Claude

> **An Claude:** Diese Datei erklärt alles, was du für die Arbeit an diesem Projekt brauchst.
> Lies sie komplett und folge dann Abschnitt **„Erste Schritte für Claude“**.

---

## 1. Worum geht es?

**Fedo Shield** ist eine Chrome-Extension für einen 5-Stunden-Hackathon. Sie markiert live im X- und TikTok-Feed
Überzeugungs- und Manipulationstechniken, z. B. Fear Framing, Us vs. Them, unbelegte Behauptungen oder AI Slop.

**Grundsatz:** Wir beschreiben **Techniken**, wir bewerten keine Meinungen und behaupten keine Absichten.
Also „Fear framing 91 %“ statt „POLITISCHE MANIPULATION ERKANNT“.

**Demo-Ziel:** Ein Juror öffnet x.com oder TikTok, scrollt, und unter jedem Post erscheinen live die Analysewerte.
Bei Videos verändern sie sich, während die Person spricht.

Technik: Chrome Extension (Manifest V3), TypeScript, esbuild. Die Analyse macht Jev (TypeSafe), bis dahin ein Mock.

---

## 2. Architektur

```
 x.com / tiktok.com (Content Script)            Background Service Worker
┌───────────────────────────────┐             ┌──────────────────────────────┐
│ PATH 1  scraper/              │  FeedItem   │ PATH 2  ai/                  │
│ DOM → FeedItem                ├────────────►│ FeedItem → Jev → Result      │
│                               │             │                              │
│ PATH 3  ui/                   │◄────────────┤                              │
│ Result → Overlay am Post      │ Analysis-   └──────────────────────────────┘
└───────────────────────────────┘ Result
        ▲ verdrahtet in extension/src/ (Glue, bewusst dünn)
        ▲ alle Typen in contracts/ (die EINZIGE gemeinsame Schnittstelle)
```

Ablauf für einen Post:
1. Der **Scraper** erkennt einen neuen Post und ruft `sink.onItem(item, anchorElement)` auf.
2. Der **Glue** zeigt `{ status: "pending" }` an und schickt den Post an den Background.
3. Die **AI** liefert per `analyze({ kind: "post", item })` ein `AnalysisResult`.
4. Die **UI** zeigt das Ergebnis mit `render(item.id, anchorElement, { status: "done", result })` an.

Videos laufen genauso, nur mit `{ kind: "transcript", item, transcript }`. Die AI setzt dann `partial: true`,
und die UI zeigt ein LIVE-Badge. Die Scores werden laufend aktualisiert.

---

## 3. Rollen: wer arbeitet wo?

| Rolle | Ordner | Liefert (siehe `contracts/modules.ts`) | Isoliert testen mit |
|---|---|---|---|
| **Scraper-Dev** | `scraper/` | `createScraper(platform)` → ruft `sink.onItem(item, anchor)` | `npm run dev:scraper` + x.com |
| **AI-Dev** | `ai/` | `createAnalyzer(config)` → `analyze(input): Promise<AnalysisResult>` | `npm run dev:ai` |
| **UI-Dev** | `ui/` | `createOverlay()` → `render(itemId, anchor, state)` + Popup | `npm run dev:ui` |

Jeder arbeitet **nur in seinem Ordner**. Keiner muss auf die anderen warten:
Mock-AI, Beispieldaten (`contracts/fixtures.ts`) und eigene Test-Umgebungen sind schon da.

---

## 4. Die Schnittstelle: `contracts/`

| Datei | Inhalt |
|---|---|
| `types.ts` | `FeedItem`, `TranscriptChunk`, `AnalysisInput`, `Signal`, `AnalysisResult`, `OverlayState`, `Settings`, `SIGNAL_KEYS` |
| `modules.ts` | die drei Interfaces `Scraper`, `Analyzer`, `OverlayRenderer` |
| `signals.ts` | pro Signal: `label` + `description` (für die UI), `question` (für die AI/Jev) |
| `fixtures.ts` | Beispiel-Posts und -Ergebnisse zum isolierten Testen (Ergänzen erlaubt) |
| `messages.ts` | Messaging zwischen Content Script und Background (nur für den Glue) |

**Regeln für `contracts/`:**
- Nicht eigenmächtig ändern. Brauchst du etwas, **schlag die Änderung vor**. Der Mensch spricht sie mit dem Team ab.
- Neue Felder lieber **optional hinzufügen** als bestehende umbenennen oder löschen.
- Contract-Änderungen gehen als eigener, kleiner PR direkt auf `main`. Danach holen sich alle die Änderung per `git pull --rebase origin main`.
- Ausnahme: **Neue Fixtures** in `fixtures.ts` hinzufügen ist ohne Absprache okay.

---

## 5. Harte Regeln (gelten für alle)

1. Arbeite **nur im Ordner deiner Rolle**.
2. Importiere **nie** direkt aus einem anderen Path, nur aus `@contracts` und npm-Paketen.
   `npm run check:boundaries` prüft das, die CI auch.
3. `extension/src/` (Glue) bleibt dünn. Nur anfassen, wenn es wirklich nötig ist, und dann dem Team Bescheid sagen.
4. Vor jedem Push muss `npm run check` grün sein (Typecheck + Boundaries + Build).
5. Keine API-Keys committen. Die gehören in `.env` (ist in `.gitignore`), Vorlage: `.env.example`.

---

## 6. Setup

```bash
git clone https://github.com/Dietrx/Fedo && cd Fedo
npm install
cp .env.example .env         # optional, ohne .env läuft der Mock-Analyzer
npm run build                # baut die Extension nach dist/
```

Extension in Chrome laden: `chrome://extensions` → oben rechts **Developer mode** → **Load unpacked** → Ordner `dist/` auswählen.
Nach jedem Rebuild in `chrome://extensions` auf ↻ klicken und den Tab neu laden.

| Befehl | Zweck |
|---|---|
| `npm run build` | Extension nach `dist/` bauen |
| `npm run dev` | Watch-Build |
| `npm run dev:scraper` | Watch-Build mit erzwungener Mock-AI |
| `npm run dev:ai` | AI-Harness in Node (`npm run dev:ai -- --jev` für die echte API) |
| `npm run dev:ui` | UI-Playground auf http://localhost:8000 |
| `npm run check` | Typecheck + Boundaries + Build |

---

## 7. Git-Workflow

- Eigener Branch pro Aufgabe: `scraper/...`, `ai/...` oder `ui/...` (z. B. `ui/overlay-design`)
- Kleine PRs, **alle 1–2 Stunden mergen**, damit der echte Zusammenbau auf x.com früh getestet wird
- Vorher `git pull --rebase origin main`
- Weil jeder nur in seinem Ordner arbeitet, gibt es praktisch keine Merge-Konflikte

---

## 8. Details pro Rolle

### 🕷️ Scraper-Dev: `scraper/`
**Aufgabe:** Posts und Videos von x.com und tiktok.com als `FeedItem` extrahieren und an den Sink geben.

- `index.ts`: `createScraper()` und `detectPlatform()` (einziger öffentlicher Einstieg)
- `observe.ts`: MutationObserver-Helfer, Hashtag-Extraktion, `hash()`, `debug()`
- `platforms/x.ts`: X über `article[data-testid="tweet"]` (funktioniert schon)
- `platforms/tiktok.ts`: TikTok über `data-e2e`-Selektoren (**best effort, im DevTools prüfen!**)

**Testen:** `npm run dev:scraper`, dann `dist/` in Chrome laden, x.com öffnen, scrollen.
Die Konsole zeigt `[fedo:scraper] NEW POST {...}`, und unter jedem Post erscheint das Mock-Overlay.

**Offene Punkte (etwa nach Priorität):**
1. X-Extraktion robust machen: Quote-Posts, Reposts, Alt-Texte, Video-Poster
2. TikTok-Selektoren auf aktuellem tiktok.com verifizieren
3. TikTok-Captions/Untertitel auslesen und an `sink.onTranscript({ itemId, text, isFinal, t, source: "captions" })` geben
4. Aktuell sichtbares/laufendes Video erkennen (IntersectionObserver)
5. Optional: X-GraphQL-`HomeTimeline`-Responses abfangen (Fetch-Patch in der MAIN World) für sauberere Daten
6. Optional: `sink.onItemRemoved(itemId)`, wenn X/TikTok Posts aus dem virtuellen Scrollen entfernt

### 🧠 AI-Dev: `ai/`
**Aufgabe:** `AnalysisInput` → `AnalysisResult` mit Scores 0..1 pro Signal (Liste in `contracts/signals.ts`).

- `index.ts`: `createAnalyzer(config)` wählt Mock oder Jev (einziger öffentlicher Einstieg)
- `state.ts`: baut aus einem Post/Video den kompakten Text-State für Jev
- `mock.ts`: Keyword-Heuristik, damit Scraper und UI sofort Ergebnisse sehen
- `jev.ts`: **Skelett.** Nur `callJev()` muss an die echte TypeSafe-Jev-API angepasst werden
- `dev/run-fixtures.ts`: Harness, jagt `FIXTURE_ITEMS` durch den Analyzer

**Wichtig:** Kein `chrome.*` und kein `document` in `ai/`. Alles muss in Node laufen.

**Testen:** `npm run dev:ai` (Mock) bzw. `npm run dev:ai -- --jev` (echte API, braucht `JEV_API_URL` + `JEV_API_KEY` in `.env`).
In der Extension aktiviert man Jev mit `FEDO_ANALYZER=jev` in `.env` und anschließendem `npm run build`.

**Offene Punkte:**
1. `callJev()` an die echte Jev-API anpassen (Request/Response-Format aus der TypeSafe-Doku, **nicht raten**)
2. `explanation` erzeugen (1–2 neutrale Sätze für „Why am I seeing this?“)
3. `evidence` pro Signal (kurzes Zitat, das den Score ausgelöst hat)
4. Video: Streaming Speech-to-Text für Tab-Audio → `kind: "transcript"`-Inputs, Jev etwa alle ~750 ms bzw. pro Satz aufrufen
5. Vision/Deepfake-Zweig für `synthetic_media` (getrennt von Jev, Jev kann aktuell keine Bilder)

### 🎨 UI-Dev: `ui/`
**Aufgabe:** Overlay pro Post, Popup und alle Visuals.

- `index.ts`: `createOverlay()` rendert in einen Shadow DOM (X-CSS kann nicht reinfunken)
- `styles.ts`: das CSS des Overlays
- `popup/`: Extension-Popup (an/aus, Sensitivität)
- `playground/`: Fake-X-Feed zum Entwickeln

**Zustände, die du darstellen musst** (`OverlayState` in `contracts/types.ts`):
`pending` (lädt), `done` (Ergebnis, bei `result.partial === true` live/Video), `error`.
Labels und Beschreibungen der Signale kommen aus `SIGNALS` in `contracts/signals.ts`.

**Testen:** `npm run dev:ui` → http://localhost:8000. Es gibt die Buttons „Replay“ (pending → done)
und „Simulate live video“ (Scores wachsen live). Für neue Testfälle Einträge in `contracts/fixtures.ts` ergänzen.

**Offene Punkte:**
1. Design polieren: Farben, Animationen beim Erscheinen, Übergang pending → done
2. Live-Video-Ansicht: z. B. seitliches Panel für TikTok mit sich ändernden Balken und Zeitstempeln („00:04 ⚠ Fear framing“)
3. „Why?“-Panel: Erklärung, Evidence-Zitate, Hinweis „Techniken, keine Meinungen“
4. Popup schöner machen, ggf. Statistik (wie viele Posts markiert)
5. Darauf achten, dass das Overlay auf echtem x.com nicht das Layout zerschießt

---

## 9. Erste Schritte für Claude

1. **Frag nach der Rolle**: Scraper, AI oder UI. Das gilt nur, wenn sie noch nicht genannt wurde.
2. Lies die `CLAUDE.md` im Ordner dieser Rolle und die Dateien in `contracts/`.
3. Prüf, ob `node_modules/` existiert. Falls nicht, `npm install`.
4. Wenn der Dev auf `main` ist: schlag einen Branch `<rolle>/<thema>` vor.
5. Starte die Test-Umgebung der Rolle (siehe Abschnitt 3), damit direkt Ergebnisse sichtbar sind.
6. Frag, woran gearbeitet werden soll, oder schlag den nächsten offenen Punkt aus Abschnitt 8 vor.
7. Halte dich an die harten Regeln (Abschnitt 5). Wenn eine Aufgabe eine Änderung außerhalb des eigenen
   Ordners oder an `contracts/` bräuchte: **nicht selbst machen**, sondern dem Dev erklären, was geändert werden
   müsste, damit das mit dem Team abgesprochen werden kann.
