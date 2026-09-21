# UPDATE.md — Was ist gerade auf `main`?

> **Wofür diese Datei?** Damit jeder im Team sieht, was der aktuellste Stand ist,
> ohne das Git-Log lesen zu müssen. **Neuester Eintrag steht oben.**

**Spielregeln:**
- Wer auf `main` merged, schreibt oben einen neuen Eintrag dazu.
- Ein Eintrag beantwortet zwei Fragen: *Was hat sich geändert?* und *Was muss ich jetzt tun?*
- Neue Einträge oben einfügen, alte nicht umschreiben — die Datei ist auch ein Verlauf.

---

## 2026-09-21 · `ai/video-integration` · AI · Video-Pipeline (captureStream → STT → Analyse) AI-seitig angepasst + getestet

**Was hat sich geändert** (nur `ai/`, baut auf `video-stt` auf):
- Ende-zu-Ende in Node getestet (`npx tsx ai/dev/run-stt.ts <wav> --jev`): STT ~1,3 s pro 8-s-Stück (Gemini 2.5 Flash über OpenRouter),
  wortgenau; Musik/Rauschen → leeres Transkript, nichts Erfundenes. Danach Jev ~0,5 s → Anzeige ca. 10 s hinter dem Video.
- Sätze, die an den 8-s-Audiogrenzen zerschnitten werden („… Not us. The" | „newcomers get …"), setzt `ai/transcript.ts` wieder zusammen.
- Jev bewertet jeden fertigen gesprochenen Satz einzeln (pro Video gecacht → jeder Satz kostet genau einmal):
  `timeline` und Zitate funktionieren damit auch bei natürlicher Sprache, nicht nur bei Lexikon-Treffern.
- `ai/` setzt `coverage` jetzt selbst (der Fallback in `background.ts` greift dann nicht mehr) und meldet `source: "local"` für die Offline-Engine.
- `ai/` ist auf dem Stand von `main` (Ton-Erkennung für Satire/Ironie aus #11).

**Was musst du tun:**
- In `.env`: `STT_API_URL=https://openrouter.ai/api/v1/chat/completions`, `STT_API_KEY=<OpenRouter-Key>`, `STT_MODEL=google/gemini-2.5-flash` → `npm run build` → ↻
- **Im Popup auf „cloud" stellen**, sonst läuft nur die lokale Engine (`DEFAULT_SETTINGS.mode` ist `"local"`). Für die Demo wichtig!
- **Glue (UI-Dev):** Post-Cache in `background.ts` darf `kind: "draft"` nicht cachen (gleiche id, Text ändert sich beim Tippen) → `input.item.kind !== "draft"` in die Cache-Bedingung.

**Wichtig zu wissen:** Im Cloud-Modus geht Video-AUDIO an OpenRouter/Google und Text an TypeSafe. Der Key steckt in `dist/` → `dist/` nie weitergeben.

---

## 2026-09-21 · Branch `video-stt` · Scraper + AI + Glue + UI · Videos werden wirklich gehört (Sprache → Text → Analyse, mit Fortschritt und Countdown)

**Was hat sich geändert:**
- `scraper/video.ts` (neu, in `createScraper` für X und TikTok verdrahtet): Das laufende, sichtbare Video wird
  über `video.captureStream()` abgehört — kein Tab-Capture, keine Extra-Berechtigung, kein Mikrofon. Alle 8 s
  geht ein Stück als 16-kHz-Mono-WAV an `sink.onAudio()`. Stumme Stücke werden lokal verworfen (nichts gesendet);
  max. 180 s pro Video.
- `ai/stt.ts` (neu): `createTranscriber(config)` — zwei Endpunkt-Arten, per URL erkannt:
  Whisper-artig (`…/audio/transcriptions`, exakte Zeitstempel) oder OpenAI-kompatibler Chat mit `input_audio`
  (z. B. OpenRouter + `google/gemini-2.5-flash`). Liefert Text + Sätze mit Startzeit.
- `extension/src/background.ts`: Message `fedo/transcribe`. `scripts/build.mjs`: `STT_API_URL`, `STT_API_KEY`,
  `STT_MODEL` aus `.env` (Vorlage in `.env.example`); `host_permissions` enthält die STT-Origin.
- `extension/src/content.ts`: Audio → STT → `TranscriptChunk`s (`source: "stt"`) → die bestehende
  Transcript-Pipeline (`withLiveVideo`, Timeline, LIVE-Badge). Führt `VideoProgress` (gehörte Sekunden,
  Gesamtlänge, ETA) und schließt das Transkript, wenn das Video endet.
- `contracts/` (nur optional): `AudioChunk`, `TranscriptionResult`, `VideoProgress`, `Transcriber`,
  `ScraperSink.onAudio?`, `AnalyzerConfig.sttApiUrl/sttApiKey/sttModel`, `OverlayState.progress?`,
  Message `fedo/transcribe`.
- `ui/index.ts`: Fortschrittsleiste unter der Chip-Leiste („🎧 0:16 of 0:45 analyzed · full analysis in 34 s“,
  tickt sekündlich), „Full video analyzed“ am Ende, „Unmute the video to analyze the speech“ bei stummem Player,
  Zeitleiste „In the video“ im Why-Panel (rendert `result.timeline` aus PR #4/#5).
- Playground: „Simulate live video“ zeigt jetzt Fortschritt, Countdown und Zeitleiste.

**Was musst du tun:**
- `git pull --rebase origin main`, in `.env` eintragen (AI-Dev hat den OpenRouter-Key):
  `STT_API_URL=https://openrouter.ai/api/v1/chat/completions`, `STT_API_KEY=sk-or-…`,
  `STT_MODEL=google/gemini-2.5-flash` → `npm run build` → ↻ in chrome://extensions → Video auf X **mit Ton** abspielen.
- **AI-Dev:** bitte einen echten Lauf gegen OpenRouter machen — die Keys auf dem Rechner, auf dem das gebaut wurde,
  waren tot (401). Der Client ist gegen einen Nachbau beider API-Formate geprüft (Multipart + Auth, `input_audio` wav,
  Zeitstempel), nicht gegen den echten Anbieter.

**Wichtig zu wissen:** Verifiziert in Chromium: eine 11-s-Sprachaufnahme in einem `<video>` ergibt zwei WAV-Stücke
(0,0–7,9 s und 7,9–11,4 s, 16 kHz mono, −15,6 dB, `ended` korrekt). Ohne `STT_API_URL` passiert nichts Neues —
Videos werden dann wie bisher nur über Text/Caption bewertet. Stummgeschaltete Player liefern in Chrome kein Audio
→ die Leiste sagt das ehrlich, statt „sauber“ zu zeigen.

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
## 2026-09-21 · Branch `feed-diet` · Contracts + Glue + UI · Feed-Diet-Dashboard, Live-Settings, Coverage

**Was hat sich geändert:**
- `contracts/` (alles optional, nichts Breaking): `Settings.mode` („local“/„cloud“) + `Settings.calmMode`,
  `AnalysisResult.coverage` („full“/„text_only“/„insufficient“), `source: "local"` zusätzlich zu „mock“,
  `FeedItem.kind` („post“/„draft“ für den Compose-Spiegel), `ExposureRecord`/`FeedStats`/`StatsWindow`,
  Messages `fedo/getStats`, `fedo/getRecords`, `fedo/clearStats`, `RESEARCH` + `SIGNAL_GROUPS` in `signals.ts`.
- `extension/src/background.ts`: schreibt pro analysiertem Post einen Datensatz nach `chrome.storage.local`
  (dedupliziert per Item-ID, Drafts nie), aggregiert Statistiken pro Zeitfenster, setzt den Badge-Zähler
  (hohe Intensität in dieser Sitzung), wählt den Analyzer nach `Settings.mode`, setzt `coverage` als Fallback.
- `extension/src/content.ts`: Popup-Änderungen gelten sofort (kein Tab-Reload), Sequenz-Guard für
  Transcript-Antworten (alte Antworten überschreiben keine neuen mehr).
- `ui/popup/`: das Dashboard — Zeitfenster, Kennzahlen, Donut nach Stufe, Top-Techniken, Top-Quellen,
  Presets statt Slider, Calm Mode, Lokal/Cloud, Export, Reset.
- `ui/index.ts`: Gesamtstufen-Badge, Coverage-Zustände (kein grüner Haken ohne Text), Calm Mode dimmt
  (nie verstecken, „Show post“), Research-Zeile im Why-Panel.
- `scripts/build.mjs`: `host_permissions` nur noch die Jev-Origin (statt `https://*/*`).
- `npm run check` läuft jetzt auch `npm run eval` (10 Regressionsfälle). `DEMO.md` neu.

**Was musst du tun:**
- `git pull --rebase origin main` (nachdem `feed-diet` gemerged ist), `npm run build`, in chrome://extensions auf ↻.
- **AI-Dev:** `source: "local"` statt „mock“ setzen und `coverage` in `analyzeLocally` befüllen (dann fliegt
  der Fallback im Glue raus). `kind: "draft"` bei der Analyse nicht anders behandeln, das Glue loggt Drafts nur nicht.
- **Scraper-Dev:** Compose-Box (`[data-testid="tweetTextarea_0"]`) als `FeedItem` mit `kind: "draft"` liefern, wenn Zeit ist.

**Wichtig zu wissen:** Verifiziert in Chromium mit geladener Extension: 10 Posts → 10 Datensätze, doppelte Analyse
zählt einmal, Badge = Anzahl „high“. Alte Ergebnisse ohne `overall` bekommen eine abgeleitete Stufe.

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
