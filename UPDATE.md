# UPDATE.md — Was ist gerade auf `main`?

> **Wofür diese Datei?** Damit jeder im Team sieht, was der aktuellste Stand ist,
> ohne das Git-Log lesen zu müssen. **Neuester Eintrag steht oben.**

**Spielregeln:**
- Wer auf `main` merged, schreibt oben einen neuen Eintrag dazu.
- Ein Eintrag beantwortet zwei Fragen: *Was hat sich geändert?* und *Was muss ich jetzt tun?*
- Neue Einträge oben einfügen, alte nicht umschreiben — die Datei ist auch ein Verlauf.

---

## 2026-09-21 · `main @ ec9b14b` · UI (+2 Zeilen Glue) · Analyse-Dashboard, Per-Post-Log, Contract-Abgleich

**Was hat sich geändert:**
- **Neue Extension-Seite `dashboard.html`** (Popup → „Open dashboard"): Zeitfenster Today / 7 days / All, Readouts (analysiert, mit Signalen,
  Heavy use, AI slop) mit 7-Tage-Sparkline, Techniken-Ranking + Kategorie-Verteilung, Quellen mit den meisten Signalen, Post-Liste mit
  Suche, Filtern (Plattform / Level / nur Slop), Klick-Filter auf Technik oder Quelle, aufklappbaren Details, „Open post ↗", Export JSON, Reset.
- **`ui/log.ts`:** das Overlay schreibt pro fertig analysiertem Post einen Eintrag nach `chrome.storage.local` (`fedo.ui.log`, max. 500).
  Autor/Text werden **best effort aus dem `article`-DOM** gelesen (X: `User-Name` / `tweetText`, TikTok: `data-e2e`), weil `render()` keinen `FeedItem` bekommt.
- **Glue (2 Zeilen, `scripts/build.mjs`):** `dashboard.html` kopieren + `ui/dashboard/dashboard.ts` → `dist/dashboard.js` bündeln. Sonst nichts außerhalb `ui/`.
- **Adaptierbarkeit:** unbekannte Signal-Gruppen rendern neutral statt zu brechen. `npx tsx ui/dev/contract-coverage.ts` prüft die UI gegen
  `contracts/` (Labels, Gruppen, Level, Fixtures, `OverlayRenderer`, Messages) und listet, welche Contract-Felder die UI noch nicht liest.
- Per-Post-Panel zeigt jetzt `source` (mock / jev / …) neben Latenz – praktisch beim Live-Test.

**Was musst du tun:**
- `git pull --rebase origin main`, `npm run build`, in chrome://extensions auf ↻, dann auf x.com scrollen und im Popup „Open dashboard".
- **Felix, bitte testen, ob das so passt:** (1) `scripts/build.mjs`-Ergänzung okay? (2) Läuft das Dashboard mit echten Analysen sauber
  (Autor/Text richtig aus dem DOM)? (3) **Contract-Vorschlag, rein additiv:** `OverlayRenderer.render(itemId, anchor, state, item?: FeedItem)`
  als optionaler 4. Parameter – der Glue hat den `FeedItem` in `onItem` ohnehin in der Hand. Dann sind Autor, Text, `isRepost`, `createdAt`,
  `quotedText` im Dashboard exakt statt aus dem DOM geraten. Die UI läuft mit und ohne den Parameter.
- **AI-Dev:** nichts zu tun; Dashboard nutzt `overall`, `signals[].evidence`, `explanation`, `timeline`, `source`.
- **Scraper-Dev:** `onItemRemoved(itemId)` weiterhin rufen; das Log bleibt davon unberührt (es zählt nur fertige Analysen).

**Wichtig zu wissen:** Außerhalb der Extension (Datei direkt öffnen) zeigt `dashboard.html` Demo-Daten – gut zum Review, nicht echt.
Post-Links ins Dashboard werden auf `http(s)` geprüft (Extension-Seite = privilegiert).

---

## 2026-09-21 · `main @ ba4deab` · Scraper · TikTok liest Item-JSON + Untertitel, lokales Speech-to-Text, Transcript-Kanal live

**Was hat sich geändert:**
- Neues MAIN-world-Skript `scraper/main-world.ts` (Manifest: zweiter `content_scripts`-Eintrag mit `"world": "MAIN"`,
  Build: Entry `dist/main-world.js`). Es liest das TikTok-Item-JSON und X-GraphQL-Antworten aus fetch/XHR und reicht sie
  an den Scraper weiter — der TikTok-For-You-DOM trägt keine Video-ID, deshalb braucht es diesen Weg.
- TikTok-Adapter neu: echte IDs (`tiktok:<id>`), Autor, Text, Hashtags, Medien, Erstellzeit, Untertitel in `item.captions`.
  `onItem` kommt, **bevor** das Video läuft. `onItemRemoved` wird gerufen, wenn TikTok den Artikel recycelt (Wunsch UI-Dev).
- `sink.onTranscript` läuft: Plattform-Untertitel (WebVTT) im Takt der Wiedergabe, und für Videos **ohne** Untertitel lokales
  Speech-to-Text über `whisper-server` (kein `chrome.tabCapture` nötig — die offene Frage aus dem `ai/live-video`-Eintrag).
  Erster Chunk ~1 s nach Videostart, ein Job zur Zeit, Abbruch beim Weiterscrollen.
- X: GraphQL-/Syndication-Mapper mit Cache (Fixture-getestet), DOM-Pfad unverändert. Live eingeloggt noch nicht verifiziert.
- Tests: `npm run test:scraper` (17 Tests, node:test + tsx, keine neue Abhängigkeit).
  Doku: `scraper/RESEARCH.md` (Messungen, Datenwege je Feld, Coverage-Tabelle, offene Punkte).

**Was musst du tun:**
- `git pull --rebase origin main`, `npm run build` + in chrome://extensions auf ↻ (Manifest hat sich geändert → Extension wirklich neu laden)
- Für Video-Transkripte ohne Untertitel: `bash scraper/companion/whisper-server.sh` in einem eigenen Terminal
  (braucht `brew install whisper-cpp` + Modell, Hinweise stehen im Skript). Ohne Server gibt es Transkripte nur bei Untertitel-Videos.

**Wichtig zu wissen:**
- **AI-Dev:** Bei Videos mit Untertiteln kommt der Text in `item.captions` UND als `onTranscript`-Chunks (RESEARCH.md §10).
  Empfehlung: bei `kind: "transcript"` das Feld `captions` im State weglassen, wenn `transcript[0].source === "captions"`.
- **Team:** Vorschlag als nächste Contract-Erweiterung (eigener kleiner PR): vier optionale Felder `language`, `stats`,
  `stickerTexts`, `communityNote` (Typen in RESEARCH.md §9.2).
- **Glue (`extension/src/background.ts`):** cached `kind: "post"` je `item.id`, ein zweites `onItem` mit mehr Daten wird
  verschluckt. Vorschlag: Cache-Eintrag verwerfen, wenn ein zweites `onItem` derselben ID längeren Text bringt.
- Offen: X eingeloggt live prüfen (Sonde in `scraper/research/console-probes/`), echte Extension auf tiktok.com —
  zeigt die Konsole einen Fehler mit `127.0.0.1`, gilt der Reserveweg aus RESEARCH.md §12.

---

## 2026-09-21 · `ai/irony-and-memes` · AI · Ironie, Satire und Memes werden erkannt

**Was hat sich geändert:**
- Getestet an 183 weiteren echten Posts (The Onion, Postillon, dril, Meme-/Satire-/Rant-Hashtags). Problem: Jev las alles wörtlich
  („like an insane animal“ → Dehumanizing, Satire-Schlagzeilen → Sensationalism).
- Jetzt drei Kontextfragen im selben Request (keine Zusatz-Latenz): Humor? Sarkasmus? Reale Gruppe als Ziel?
  - Humor ohne reale Zielgruppe → Signale gedämpft (Onion, Postillon, Katzen-Memes landen auf `none`).
  - Humor auf Kosten einer realen Gruppe → NICHT gedämpft, aber höchstens `medium`. „War nur Spaß“-Hetze erkennt Jev gar nicht erst als Humor → bleibt `high`.
  - Sarkasmus → Scores bleiben (ist trotzdem Persuasion), die Erklärung beginnt mit „The author uses sarcasm…“.
- Ergebnis Humor-Sample: none 89 → 121, medium 23 → 14. News-Sample ohne Regression. Evals 15/15 lokal, 20/20 Jev.

**Was musst du tun:**
- `git pull --rebase origin main`, `npm run build`, ↻
- **UI-Dev:** `explanation` kann jetzt mit einem Ton-Hinweis beginnen („This reads as humor or satire…“) → gut sichtbar im „Why?“-Panel.

**Wichtig zu wissen:** Ton-Erkennung gibt es nur im Jev-Modus. Die lokale Fallback-Engine liest weiter wörtlich.

---

## 2026-09-21 · `main @ e6fc253` · UI · Design-System, vier Themes, Slop-Cover, Live-Tracker, Dashboard-Popup

**Was hat sich geändert:**
- **Im Feed nur noch eine ruhige Zeile pro Post** (28 px, kein Kasten): `LIVE · bis zu 3 Labels mit Kategorie-Punkt · +N · Details ›`.
  Darüber eine 2-px-Fortschrittslinie, die sich füllt, während die KI arbeitet. Klick auf die Zeile öffnet das Per-Post-Dashboard
  (Erklärung, `overall`, Meter mit Evidence, bei Videos die `timeline` als Log mit Zeitstempeln).
- **Farbe = Kategorie** (political violett · rhetoric orange · credibility amber · synthetic teal, aus `SIGNALS[key].group`),
  **nie „schlecht"**. Rot gibt es nur für LIVE und den Pending-Punkt.
- **Vier Themes:** light / dark (folgt automatisch dem Host) + je eine farbenblind-sichere Variante (Okabe-Ito + Formsymbole ◆ ▲ ● ■).
- **AI-Slop-Cover:** `possible_ai_slop` oder `synthetic_media` ≥ 85 % → voll-breites Cover über dem Post, per × wegklickbar.
- **Popup = Dashboard:** An/Aus, Readout (analysiert / mit Signalen / Verteilung nach Gruppe), Appearance (System · Light · Dark),
  Colour-blind-Schalter, Slop-Cover-Schalter, Sensitivität, „Open x.com". Settings gelten **sofort**, kein Feed-Reload.
- Neue Dateien in `ui/`: `theme.ts` (Tokens), `prefs.ts` (UI-eigene Prefs + Zähler in `chrome.storage.local` unter `fedo.ui.*`).
- **Kein Contract, kein Glue geändert.** Design-System (Tokens, Previews, Guidelines): https://claude.ai/artifact/3yqsB8zBs3oKGnTpt4y11Y

**Was musst du tun:**
- `git pull --rebase origin main`, `npm run build`, in chrome://extensions auf ↻
- **AI-Dev:** `evidence` pro Signal, `explanation` und `timeline` sind das, was das Dashboard und das Live-Log gut machen – bitte weiter befüllen.
  `possible_ai_slop` ≥ 0.85 löst jetzt das Cover aus: bitte nur bei wirklich klaren Fällen so hoch scoren.
- **Scraper-Dev:** der Anker (`article`) bekommt `position: relative`, wenn er `static` ist (für das Cover). `onItemRemoved` bitte rufen,
  damit Overlay + Cover mit dem Post verschwinden.

**Wichtig zu wissen:** `npm run dev:ui` hat jetzt Theme-Dropdown, Schwellwert-Slider, Live-Simulation und einen Slop-Testpost.
Das Cover ist standardmäßig an (Popup → „Cover AI slop posts").

---

## 2026-09-21 · `ai/real-feed-tuning` · AI · An 168 echten Posts getestet und nachgeschärft

**Was hat sich geändert:**
- Jev bewertet jetzt zusätzlich jeden Satz einzeln (parallel, keine Zusatz-Latenz): Der Satz mit dem höchsten Score wird das
  `evidence`-Zitat. Treffer ohne Zitat: vorher ~85 %, jetzt ~10 %. Signale, die sich in keinem Satz wiederfinden, werden gedämpft.
- Weniger Fehlalarme: Hashtag-only-Posts, Kursticker, neutrale Nachrichtenmeldungen. Verteilung auf echtem Feed:
  61 % none, 27 % low, 11 % medium, 1 % high. Latenz p50 ~0,4 s.
- `evidence` kann jetzt ein ganzer Satz sein (max. 90 Zeichen, mit „…“), nicht mehr nur 2–4 Wörter.

**Was musst du tun:**
- `git pull --rebase origin main`, `npm run build`, ↻
- **UI-Dev:** (1) `evidence` braucht Platz für ~90 Zeichen / Umbruch. (2) Bei stark aufgeladenen Posts kommen 5–8 Signale ≥ 50 %.
  Empfehlung: die 3–4 stärksten als Chips, Rest hinter „+n“. Mehrere Signale können dasselbe Zitat haben → nur einmal anzeigen.
  (3) `result.timeline` + `result.overall` kommen fertig aus der AI, müssen nicht aus Score-Sprüngen nachgebaut werden.

---

## 2026-09-21 · `ai/live-video` · AI · Live-Video: gedrosselte Analyse + Timeline

**Was hat sich geändert:**
- Transcript-Updates werden in `ai/` pro Video gebündelt: max. 1 Request gleichzeitig / alle 750 ms, immer nur das neueste
  Transkript. Der Glue darf weiter bei JEDEM Chunk `analyze` rufen, Ergebnisse kommen nie in falscher Reihenfolge an.
- Jedes Video-Ergebnis hat `timeline` (siehe Contract-Eintrag) und `partial` (`true`, solange der letzte Chunk nicht final ist).

**Was musst du tun:**
- `git pull --rebase origin main`, `npm run build`, ↻
- **Scraper-Dev:** `sink.onTranscript({ itemId, text, isFinal, t, source })` liefern, pro fertigem Satz `isFinal: true`,
  `t` = Sekunden seit Videostart. Interim-Chunks (`isFinal: false`) sind erlaubt und billig. So sieht es aus: `npx tsx ai/dev/run-live.ts`
- **UI-Dev:** `result.timeline` + `result.partial` für die Live-Ansicht.

**Wichtig zu wissen:** Speech-to-Text für Videos OHNE Untertitel ist noch offen. Das braucht Tab-Audio (`chrome.tabCapture`)
und gehört damit in Glue/Scraper, nicht in `ai/`. Mit TikTok-Captions funktioniert der Live-Pfad schon komplett.

---

## 2026-09-21 · `contracts/timeline` · Contracts (AI → UI) · Neues optionales Feld `AnalysisResult.timeline` für Videos

**Was hat sich geändert:**
- `contracts/types.ts`: `AnalysisResult.timeline?: TimelineEvent[]` mit `{ t, key, score, evidence? }`
  = erkannte Techniken im gesprochenen Text mit Zeitstempel (Sekunden), chronologisch. Wächst, während das Video läuft.
- `contracts/fixtures.ts`: Ergebnis zu `tiktok:2001` hat eine Beispiel-Timeline.

**Was musst du tun:**
- `git pull --rebase origin main`
- **UI-Dev:** für die Live-Video-Ansicht nutzbar („00:04 ⚠ Fear framing“): `SIGNALS[event.key].label` + `event.t` formatieren.
  Feld ist optional → bei Posts und bei `undefined` nichts anzeigen.
- Scraper-Dev: `TranscriptChunk.t` (Sekunden seit Videostart) sauber setzen, daraus entstehen die Zeitstempel.

**Wichtig zu wissen:** Kein Breaking Change (Feld ist optional).

---

## 2026-09-21 · `ai/llm-openrouter` · AI · Echte Analyse mit Jev (TypeSafe) über OpenRouter

**Was hat sich geändert:**
- `ai/jev.ts` spricht jetzt die echte Jev-API (OpenRouter Decisions API): eine Ja/Nein-Frage pro Signal → Wahrscheinlichkeit.
  ~0,3–1 s pro Post. Jev-Scores werden mit der lokalen Engine fusioniert (weniger Fehlalarme), Evidence-Zitate kommen lokal.
- Fehler, Timeout oder leeres Guthaben → automatisch Ergebnis der lokalen Engine (`source: "mock"`), nie ein Error im Feed.
- Alternative: beliebiges Chat-Modell, wenn `JEV_API_URL` auf `/chat/completions` endet (`ai/llm.ts`).

**Was musst du tun:**
- `git pull --rebase origin main`
- Für echte Analyse in `.env` (nie committen!): `FEDO_ANALYZER=jev`, `JEV_API_URL=https://openrouter.ai/api/alpha/decisions`,
  `JEV_API_KEY=<OpenRouter-Key, beim AI-Dev erfragen>` → `npm run build` → in chrome://extensions auf ↻
- Ohne `.env` läuft alles wie bisher mit der lokalen Engine.

**Wichtig zu wissen:** Der Key wird beim Build in `dist/background.js` eingebettet → `dist/` niemals weitergeben oder committen
(ist in `.gitignore`). Im Jev-Modus gehen Post-Texte an OpenRouter/TypeSafe.

---

## 2026-09-21 · `ai/local-engine` · AI · Lokale Scoring-Engine ersetzt die Keyword-Heuristik

**Was hat sich geändert:**
- `ai/` bewertet Posts jetzt mit einer echten lokalen Engine (EN + DE): gewichtete Formulierungen pro Signal,
  Stilmerkmale, Kontextregeln, `evidence`-Zitat pro Signal, `explanation` und `overall` (Gesamtstufe).
- Modus `mock` = diese Engine (offline, kein API-Key). Modus `jev` nutzt sie für Evidence und als Fallback bei API-Fehlern.
- `callJev()` ist weiterhin ein Skelett (TypeSafe-Format fehlt noch).

**Was musst du tun:**
- `git pull --rebase origin main`, `npm run build`, in chrome://extensions auf ↻
- Falsch bewerteter Post gesehen? Text an den AI-Dev schicken → wird Testfall in `ai/dev/cases.ts`.

**Wichtig zu wissen:** Ergebnisse haben weiterhin `source: "mock"`, sind aber keine Platzhalter mehr.
Die simulierte Latenz ist weg → `pending` ist im echten Feed nur noch sehr kurz sichtbar.

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
