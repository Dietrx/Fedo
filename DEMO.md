# DEMO.md — Ablauf, Fallbacks, bekannte Grenzen

> Für den Pitch. Wer vorführt, liest das vorher einmal komplett.

## Vorbereitung (10 min vor dem Slot)
1. `git pull --rebase origin main && npm run build`, in `chrome://extensions` auf ↻.
2. x.com in einem Tab offen, eingeloggt, Feed auf **Für dich**. Einmal 20 Posts scrollen, damit die Statistik gefüllt ist.
3. `npm run dev:ui` in einem zweiten Tab (http://localhost:8000) als Fallback und für die Video-Simulation.
4. Popup einmal öffnen: Zahlen da? Badge auf dem Icon da?

## Ablauf (≈ 4 min)
| Schritt | Was man sieht | Ein Satz dazu |
|---|---|---|
| 1. Scrollen auf x.com | Unter jedem Post erscheint die Leiste: Gesamtstufe + Technik-Chips | „Wir bewerten Techniken, keine Meinungen.“ |
| 2. „Why?“ auf einem starken Post | Balken, Zitate als Beleg, Research-Zeile | „Jedes Signal hat ein Zitat und eine Studie dahinter.“ |
| 3. Popup öffnen | **Feed Diet**: Zahl der Posts, Anteil mit starken Techniken, Donut, Top-Techniken, Top-Quellen | „Das kann dir keine Plattform zeigen — und keine über die Plattformgrenze hinweg.“ |
| 4. Calm Mode einschalten | Starke Posts werden gedimmt, bleiben lesbar („Show post“) | „Zensur entfernt. Fedo fügt Kontext hinzu und versteckt nie etwas.“ |
| 5. Spiegel-Paar im Playground (optional) | Zwei Posts, gleiche Technik, entgegengesetzte Richtung, gleiche Scores | „Der Detektor ist symmetrisch.“ |
| 6. „Simulate live video“ im Playground | Scores wachsen, LIVE-Badge | **Ehrlich sagen:** „So sieht die Video-Pipeline aus; STT ist noch nicht angebunden.“ |

## Fallback-Kette
- **Jev antwortet nicht** → Popup auf „Local only“ stellen (oder ist Standard). Die lokale Engine liefert dieselben Felder.
- **x.com-Layout hat sich geändert / keine Leisten** → DevTools-Konsole: `[fedo:scraper]`-Meldungen? Wenn keine: Playground (Schritt 5/6) vorführen, Popup-Statistik bleibt aus der Vorbereitung erhalten.
- **Popup leer** → Fenster auf „All“ stellen; wenn immer noch leer: Tab neu laden, 10 Posts scrollen.
- **Extension-Fehler** → `chrome://extensions` → Fehler ansehen → ↻ → Tab neu laden.

## Bekannte Grenzen (nicht verschweigen, wenn gefragt)
- Nur Text wird bewertet. Bild-/Video-Inhalte nicht (`coverage: text_only`), zu kurze Posts bekommen kein Urteil (`insufficient`).
- TikTok-Selektoren sind unverifiziert → **auf X vorführen.**
- Live-Video ist Simulation (kein STT, keine Captions angebunden).
- Die Statistik zählt *analysierte* Posts (dedupliziert), nicht die tatsächlich *gelesenen* (IntersectionObserver fehlt noch).
- Lokale Engine = gewichtetes Lexikon EN/DE, keine Ironie-/Negationserkennung. Jev-Modus ist vorbereitet, `callJev()` ist noch Skelett.
