# Scraper-Strang: Recherche, Messungen, Architektur, Prototyp

Stand **2026-09-21**. Alles in dieser Datei wurde in einer Sitzung mit Playwright auf den echten Seiten
gemessen oder gebaut; wo etwas geschätzt, übernommen oder nicht prüfbar war, steht es dabei. Die Datei ist
das Gedächtnis des Scraper-Strangs: wer nach mir weitermacht, soll hier den Gedankengang finden, nicht nur
das Ergebnis. `DOKUMENTATION.md` im Projektstamm war der erste Test davor; diese Datei ersetzt seine
Annahmen durch Messungen.

---

## 0. Wie diese Datei zu lesen ist

- **Kurz:** Abschnitt 1 (eine Seite).
- **Als Scraper-Dev:** Abschnitte 4–5 (Datenwege), 7 (Architektur), 9 (Coverage-Tabelle), 13 (Code), 15 (Verifikation).
- **Als AI-Dev:** Abschnitt 9 (welche Felder wie zuverlässig kommen), 10 (Transcript-Kanal, Doppelungsfrage), 9.2 (Zusatzfelder).
- **Als Mensch, der nichts liest außer Ergebnissen:** Abschnitt 15 sagt, was man tippt und was man sehen muss.

Begriffe: *Isolated world* = die JavaScript-Welt, in der ein Chrome-Content-Script läuft (sieht das DOM, nicht die
Variablen der Seite). *MAIN world* = die Welt der Seite selbst. *Bridge* = unser Nachrichtenkanal zwischen beiden
(`scraper/bridge.ts`). *Item* = TikToks JSON-Objekt für ein Video. *Tweet-Entity* = X' JSON-Objekt für einen Post.

---

## 1. Kurzfassung

1. **TikTok liefert alle Metadaten Sekunden vor dem Video.** Die Seite lädt per `fetch` acht Items auf einmal
   (`/api/recommend/item_list/`, 165–223 KB), jedes mit ID, voller Beschreibung, strukturierten Hashtags und
   Mentions, Autor (Handle, Anzeigename, verifiziert), Zählern (Likes, Kommentare, Shares, Views, Saves), Musik,
   Erstellzeit, Sprache, Werbekennzeichen, KI-Label, Text-Stickern und, wenn vorhanden, einer
   **WebVTT-Untertitel-URL**. Das DOM des For-You-Feeds enthält dagegen **keine Video-ID** und keinen
   `video-author-uniqueid`; die alten Selektoren in `tiktok.ts` griffen ins Leere.
2. **Deshalb braucht der Scraper ein MAIN-world-Skript.** Ein Content-Script sieht weder die Netzwerkantworten
   noch den React-State (gemessen: in einer isolated world sind `__reactFiber$*`-Schlüssel 0, `fetch` ist nativ).
   Das ist eine Änderung an `extension/manifest.json` (ein zweiter `content_scripts`-Eintrag mit
   `"world": "MAIN"`) und an `scripts/build.mjs` (ein Bundle-Eintrag). Beides ist gemacht und unten ausgewiesen.
3. **Mit dem MAIN-world-Skript kommt `onItem` vor dem Video:** im Integrationslauf lag `onItem` beim ersten
   Video im selben Frame wie das `play`-Ereignis (0–1 ms) und bei allen weiteren **1,0–3,6 s davor** (der
   Artikel wird gefüllt, bevor der Nutzer ihn erreicht). Alle 12 Items des dritten Laufs hatten echte IDs,
   `createdAt` und Anzeigename; 3 trugen den vollen Untertiteltext schon im `FeedItem.captions`.
4. **Untertitel gibt es, aber selten:** 5 von 33 Feed-Videos hatten eine Spur (`video.claInfo.captionInfos`,
   alle automatisch erzeugt, Originalsprache). Die VTT-Datei ist aus dem Seitenkontext abrufbar (200, CORS
   erlaubt, 5–300 ms). Wo sie fehlt, braucht es Speech-to-Text.
5. **Lokales STT ist schnell genug:** whisper.cpp `large-v3-turbo` mit Metal auf dem M4 verarbeitet 10 s Audio
   in 0,8–1,3 s; das MP4 ist aus dem Seitenkontext ladbar (392 KB in 172 ms, 2,9 MB in 324 ms), der Browser
   dekodiert es selbst (52 ms) und schickt WAV-Fenster an `whisper-server` (CORS `*`). Im Integrationslauf kam der
   **erste STT-Chunk 840–1.413 ms nach `play`**. Kein Chunk erreichte den Sink für ein verlassenes Video.
6. **Kommentare kosten einen Aufruf ohne Signatur:** `/api/comment/list/?aid=1988&aweme_id=<id>&count=20&cursor=0`
   aus dem Seitenkontext → 200, 15–18 Kommentare (nach Popularität sortiert, Likes, Antwortzahl, Sprache),
   ~380–430 ms. Replies genauso. **Nicht** in den Prototyp eingebaut (kein `FeedItem`-Feld, Abschnitt 9.2).
7. **X konnte nur teilweise beobachtet werden.** Das Testprofil ist ausgeloggt; `x.com/home` und Permalinks
   liefern eine statische Seite ohne `data-testid` und ohne GraphQL-Aufrufe. Gebaut und getestet ist der
   Mapper für die GraphQL-Tweet-Entität (Form aus öffentlichen Typdefinitionen, **Fixture synthetisch**) und ein
   Mapper für die öffentliche Syndication-API (live geprüft). Der DOM-Pfad bleibt der des Gerüsts
   (vom Gerüst verifiziert, hier nicht re-verifiziert). Eine DevTools-Sonde für den eingeloggten Feed liegt bei.
8. **Bestehende Schnittstelle unverändert.** `contracts/` ist nicht angefasst. `onTranscript` wird jetzt real
   bedient (Captions gepaced, STT progressiv), `onItemRemoved` ebenfalls (TikTok recycelt Artikel).
9. **Beweis:** `npm run check` grün, `npm run test:scraper` 15/15 grün, drei Playwright-Integrationsläufe auf
   tiktok.com (Abschnitt 14).

---

## 2. Ausgangslage und was daraus wurde

| Vorher (Gerüst + DOKUMENTATION.md) | Nachher |
|---|---|
| TikTok: `data-e2e="video-author-uniqueid"` und `a[href*="/video/"]` — greifen im FYP nicht (gemessen: `handle` und `href` undefined) | Item-JSON per Bridge, ID per DOM-Attribut aus dem React-State; DOM-Fallback über `a[href^="/@"]` + Text |
| Annahme „TikTok-Untertitel zuerst, sonst Deepgram" (Cloud, Tab-Audio, Offscreen-Dokument) | VTT-URL aus dem Item-JSON (kein Raten im DOM), STT lokal ohne Tab-Capture: MP4 laden, im Browser dekodieren |
| `onTranscript` nur als Stub-Idee | Implementiert: Captions im Takt der Wiedergabe, STT in 10-s-Fenstern, ein Job, Abbruch beim Wechsel |
| X per DOM, GraphQL als „optional" | GraphQL-Mapper + Syndication-Mapper getestet; DOM-Pfad bleibt Fallback; Live-Verifikation eingeloggt offen |
| Keine Tests | 15 Tests gegen echte (bereinigte) und synthetische Payloads, `npm run test:scraper` |

---

## 3. Methode und Grenzen

- Werkzeug: Playwright-MCP (Chromium 153), **ausgeloggt**, `tiktok.com/foryou`, `x.com`; Apple M4, 16 GB.
- Zeiten in der Seite mit `performance.now()`, außerhalb mit `Date.now()` (gleiche Uhr, gleicher Rechner).
- Für jede tragende Zahl gibt es zwei verschieden gebaute Herleitungen (Abschnitt 17).
- **Nicht beobachtbar:** der eingeloggte X-Feed (DOM und GraphQL), TikTok eingeloggt (mehr Untertitel? unbekannt),
  Video-CORS von `video.twimg.com`, Verhalten über Stunden (Rate-Limits, Session-Ablauf).
- Der Integrationslauf simuliert die Extension: `main-world.js` in der Seitenwelt, der Scraper in einer
  isolated world (CDP). Ein Unterschied bleibt: eine CDP-isolated-world unterliegt der Seiten-CSP, ein echtes
  Content-Script nicht — darum lief der Test mit `bypassCSP` (Abschnitt 12, CSP/LNA).

---

## 4. TikTok: Datenwege je Information

### 4.1 Überblick

| Information | Weg 1 (empfohlen) | Weg 2 | Weg 3 | Beobachtete Latenz | Stabilität |
|---|---|---|---|---|---|
| Video-ID | Item-JSON (`id`), per Bridge; ID landet als `data-fedo-tiktok-id` am Artikel | React-State (Fiber, Tiefe 2, Hook 10, `ref.current.value`) | — im DOM **nicht vorhanden**; Fallback: Hash aus Handle+Text | vor dem Video | hoch (API-Form seit Jahren), mittel (Fiber) |
| Beschreibung / Text | `contents[].desc` (voll) bzw. `desc` | DOM `[data-e2e="video-desc"]` (innerText, Spans → Zeilenumbrüche normalisieren) | — | vor dem Video / 0,3 ms | hoch / hoch |
| Hashtags | `textExtra[].hashtagName` (strukturiert, exakt) | `challenges[].title` | Regex über Text | vor dem Video | hoch |
| Mentions | `textExtra[].userUniqueId` | Regex `@…` | — | vor dem Video | hoch |
| Handle | `author.uniqueId` (API) bzw. `author` (String, React-State) | DOM `a[href^="/@"]` | — | vor dem Video / 0,3 ms | hoch |
| Anzeigename | `author.nickname` bzw. `nickname` | — (im FYP-DOM nicht sichtbar) | — | vor dem Video | hoch |
| verifiziert | `author.verified` (nur API-Form) | — | — | vor dem Video | mittel (fehlt in der State-Form) |
| Post-URL | `https://www.tiktok.com/@<handle>/video/<id>` aus ID+Handle | `a[href*="/video/"]` (nur Profil-/Detailseiten) | — | vor dem Video | hoch |
| Erstellzeit | `createTime` (Epoch-Sekunden) | — | — | vor dem Video | hoch |
| Likes / Kommentare / Shares / Views / Saves | `stats` (Zahlen) bzw. `statsV2` (Strings) | DOM `[data-e2e="like-count"]` etc. (formatiert „48.9K") | — | vor dem Video | hoch / mittel |
| Sound | `music.title`, `music.authorName`, `music.original` | DOM `[data-e2e="video-music"]` (war leer) | — | vor dem Video | hoch |
| Sprache | `textLanguage` (`en`, `de`, `un`…) | `claInfo.originalLanguageInfo.languageCode` | — | vor dem Video | hoch |
| Untertitel | `video.claInfo.captionInfos[].url` (WebVTT) | `video.subtitleInfos[].Url` (Legacy, identische Fälle) | DOM `DivCaptionContainer` — **bleibt leer** (h=0), auch bei vorhandener Spur | 5–300 ms für die Datei | hoch, Abdeckung 5/33 |
| Video-Datei | `video.playAddr` (MP4, h264 ~350 kbps) | `video.downloadAddr` | `<video>.currentSrc` ist `blob:` (MSE, **nicht** ladbar) | 172 ms/392 KB, 324 ms/2,9 MB | hoch (aus Seitenkontext; von außen 403) |
| Kommentare | `/api/comment/list/` ohne Signatur | Kommentar-Panel (nur eingeloggt) | — | 380–430 ms je 15–18 | mittel (unsigniert könnte abgeschaltet werden) |
| Werbung / KI-Label | `isAd`, `AIGCDescription`, `ShowAIGC` | DOM `[data-e2e="sponsored-tag"]` | — | vor dem Video | hoch |
| Text-Sticker | `stickersOnItem[].stickerText[]` | — | — | vor dem Video | mittel (selten gefüllt: 3/33) |
| Bild-Posts | `imagePost.images[].imageURL.urlList[0]`, `imagePost.title` | — | — | — | im FYP-Sample 0/33, Form bekannt |

### 4.2 Das Item-JSON (Netzwerk)

Gemessen auf `/foryou`: erste Antwort ~2,0 s nach Navigationsstart (2 Items, 68 KB), danach `/api/preload/item_list/`
und weitere `/api/recommend/item_list/` mit 7–8 Items (165–223 KB) — **jeweils Sekunden bevor der Nutzer die
Videos erreicht**. Abruf per `fetch` (nicht XHR). Die Anfrage-URL trägt Signaturen (`X-Bogus`, `msToken`,
`X-Gnarly`) — selbst aufrufen geht nicht (`/api/item/detail/` ohne Signatur → 200 mit leerem Body), mithören geht.

TikToks eigenes SDK umhüllt `window.fetch` und `XMLHttpRequest.prototype.open` bereits (beide nicht mehr nativ).
Ein Wrapper, der **danach** installiert wird, sieht trotzdem alle weiteren `item_list`-Antworten (gemessen: nach
einem nachträglichen Patch kamen 8 Items durch), weil die App `window.fetch` zur Laufzeit aufruft. Bei
`document_start` sind wir ohnehin zuerst.

Vollständige Feldliste eines Items (Auszug, Sample in `scraper/test/fixtures/tiktok-capture.json`):
`id, desc, contents[], textExtra[], challenges[], createTime, textLanguage, isAd, AIGCDescription, ShowAIGC,
CategoryType, author{uniqueId,nickname,verified,signature,…}, stats{diggCount,commentCount,shareCount,playCount,
collectCount}, statsV2{…,repostCount}, music{title,authorName,original,duration}, video{playAddr,downloadAddr,cover,
duration,bitrateInfo[],claInfo{captionInfos[],originalLanguageInfo,noCaptionReason,hasOriginalAudio},
subtitleInfos[]}, stickersOnItem[], imagePost?, poi?, anchors?, contentContext, diversificationId, itemCommentStatus`.

### 4.3 React-State (Fiber)

Am `<article>` hängt `__reactFiber$…`. Zwei Ebenen darüber hält ein `useRef` das Item (`ref.current.value`,
Hook-Index 10; Suche kostet ~0,1 ms). **Achtung, zweite Form:** dieses Objekt trägt `author` als **String**
(Handle) und `nickname`, `authorId`, `avatarThumb` direkt am Item; `verified` fehlt. Der Mapper kennt beide Formen
(Test „React-state shape"). Das MAIN-world-Skript nutzt den Weg, um jedem Artikel seine ID als DOM-Attribut zu
geben — DOM-Attribute sind in beiden Welten sichtbar. Fragil: Hook-Reihenfolge und Tiefe können sich mit jedem
TikTok-Deploy ändern; darum ist das Netzwerk der Primärweg und der Fiber nur die Zuordnung Artikel → ID.

### 4.4 Hydration-Skript

`#__UNIVERSAL_DATA_FOR_REHYDRATION__` (258 KB, aus der isolated world lesbar) enthält auf `/foryou` **keine Items**
(`webapp.app-context`, `biz-context`, `i18n`, `seo.abtest`, `a-b`). Auf direkt geladenen Videoseiten trägt es
`webapp.video-detail`; nach SPA-Navigation nicht mehr (gemessen: Detailseite per Klick → Scope unverändert).
Kein `SIGI_STATE` mehr. Fazit: nur für den Erstaufruf einer Videoseite brauchbar, nicht für den Feed.

### 4.5 DOM

`data-e2e` im FYP-Artikel (gemessen): `feed-video, video-desc, desc-span-*, search-common-link, sponsored-tag,
video-author-avatar, feed-follow, like-icon/-count, comment-icon/-count, favorite-icon/-count, share-icon/-count,
video-music`. Links: `/@<handle>` und `/music/…`, **kein** `/video/<id>`. `video-desc` liefert Spans mit
Zeilenumbrüchen (Whitespace normalisieren). Extraktion aller sichtbaren Artikel: **0,3 ms**. Artikel werden als
leere Platzhalter eingefügt (10 im DOM) und beim Näherkommen gefüllt; der Füllvorgang ist eine Mutation
(Einfügung → gefüllt in 0–1 ms), die MutationObserver-Erkennung ist also sofort. Elemente werden recycelt (59
Artikel-Elemente in 5 Scrolls) → `onItemRemoved` ist nötig, sonst hängen Overlays an toten Knoten.

### 4.6 Kommentare

- Öffnen des Panels lädt 4 Seiten (18+18+18+17) in ~1,2 s; erste Antwort ~380 ms nach Klick. Ausgeloggt führt der
  Klick auf die Detailseite mit Login-Modal.
- **Ohne Signatur** aus dem Seitenkontext: `/api/comment/list/?aid=1988&aweme_id=<id>&count=20&cursor=0` → 200,
  18 Kommentare, `total`, `has_more`; Replies: `/api/comment/list/reply/?aid=1988&comment_id=<cid>&item_id=<id>
  &count=3&cursor=0` → 200, 308 ms. Ein Aufruf mit zusätzlichen App-Parametern lieferte einen leeren Body — die
  minimale URL ist die robuste.
- Felder je Kommentar: `text, digg_count, reply_comment_total, create_time, comment_language, user{nickname,
  unique_id}, author_pin, text_extra, label_list`. Sortierung: TikToks Ranking (erster Kommentar 689 K Likes) —
  **die erste Seite ist die Stichprobe „Top-Kommentare"**.
- Empfehlung: erst nach `onItem`, nur für das aktive Video, eine Seite, mit AbortController beim Wechsel. Nicht
  gebaut, weil `FeedItem` kein Feld dafür hat (Vorschlag 9.2).

### 4.7 Video und Audio

- `playAddr` liefert MP4 (h264 ~350 kbps, zusätzlich h265-Varianten in `bitrateInfo`). Aus dem Seitenkontext mit
  Cookies: 206/200; aus Node ohne Referer: 403 (`Access-Control-Allow-Origin: https://www.tiktok.com`).
- Der Player hat das aktive und oft das nächste Video bereits gepuffert (Fetch 4 ms aus dem Cache); ungepuffert
  172 ms für 9 s/392 KB, 324 ms für 35 s/2,9 MB.
- `AudioContext.decodeAudioData`: 48–52 ms für 9–18 s (48 kHz Stereo); Resampling auf 16 kHz mono per
  `OfflineAudioContext`: 4 ms. Damit braucht der Browser **kein ffmpeg**.
- `<video>.currentSrc` ist eine `blob:`-URL eines `MediaSource` → nicht ladbar; `textTracks` = 0.
- `music.playUrl` ist aus dem Seitenkontext nicht ladbar (CORS).

### 4.8 Content Detection beim Scrollen

| Methode | Gemessen | Urteil |
|---|---|---|
| `play`-Ereignis (capture, `document`) | Taste → `play` des neuen Videos in **287–418 ms** (10 Messungen) | **Primär**: sagt, welches Video *läuft* |
| Polling `video.paused` | 261–357 ms (25 Messungen), gleiche Größenordnung | zweite Herleitung, nicht nötig im Produkt |
| MutationObserver auf Artikel | Artikel gefüllt → sichtbar in 0–1 ms; Items 1,0–3,6 s vor `play` | **Primär für `onItem`** |
| IntersectionObserver | nicht gemessen; auf dem FYP ist das spielende Video immer das sichtbare | Reserve für Seiten ohne Autoplay (Profil-Raster) |
| URL-Änderung | **keine** auf `/foryou` (bleibt `/foryou`) | unbrauchbar |
| Netzwerk (`item_list`) | 8 Items pro Antwort, ~2–5 s Vorlauf | Primär für *Daten*, nicht für „jetzt sichtbar" |
| `video.currentSrc`-Wechsel (DOKUMENTATION.md) | funktioniert, aber `play` ist direkter | Reserve |

### 4.9 Zeitachse (gemessen, Integrationslauf 3 und 4)

```
T−3,5 s … T−1,0 s   Item-JSON da, Artikel gefüllt → sink.onItem (echte ID, Text, Hashtags, Autor,
                     Zähler, createdAt; captions, falls VTT schon geladen: 3 von 12 Items)
T+0                  Nutzer landet auf dem Video (play-Ereignis, ~300 ms nach der Taste)
T+0 … +1 ms          onItem für das allererste Video der Seite (im selben Frame)
T+0,5 s              erster Captions-Chunk (VTT gepaced; Cue-Start 0,4 s)
T+0,84 … +1,4 s      erster STT-Chunk (10-s-Fenster; Ausreißer 3,0 s / 4,4 s während des Seitenstarts)
T+2,3 s              zweites STT-Fenster (Chunks 2 und 3 …)
Wechsel              alter Job abgebrochen: 0 Nachzügler-Chunks in drei Läufen
```

---

## 5. X: Datenwege (mit der Login-Grenze)

### 5.1 Was beobachtbar war

- Ausgeloggt liefert `x.com/home` die Startseite (0 Tweets) und `x.com/<user>/status/<id>` eine **statische
  Seite** mit Text, Zählern und Antworten, aber **ohne ein einziges `data-testid`** und ohne GraphQL-Aufrufe.
  Das eingeloggte Feed-DOM konnte deshalb nicht vermessen werden.
- Die Embed-Seite `platform.twitter.com/embed/Tweet.html?id=…` nutzt dieselben `data-testid`s (`tweetText`,
  `icon-verified`, `UserAvatar-Container-*`) wie die App — ein Hinweis, dass die Gerüst-Selektoren aktuell sind.
- **Syndication-API** `https://cdn.syndication.twimg.com/tweet-result?id=<id>&token=<token>` (Token-Formel in
  `x-syndication.ts`): 200 ohne Login, JSON mit `text, user{screen_name,name,is_blue_verified,verified}, entities,
  favorite_count, conversation_count, lang, created_at (ISO), mediaDetails?, quoted_tweet?`. Fixture live gesichert.
  Der Timeline-Endpunkt `syndication.twitter.com/srv/timeline-profile/screen-name/<u>` antwortete 429.

### 5.2 GraphQL (Primärweg, unverifiziert live)

X' App lädt den Feed über `/i/api/graphql/<hash>/HomeTimeline` (bzw. `HomeLatestTimeline`, `TweetDetail`,
`UserTweets`, `SearchTimeline`). Alle Antworten enthalten dieselbe Tweet-Entität (`tweet_results.result`):
`rest_id, legacy{full_text, created_at, lang, favorite_count, retweet_count, reply_count, quote_count,
bookmark_count, entities{hashtags,urls,user_mentions,media}, extended_entities{media[{type, media_url_https,
ext_alt_text, video_info.variants[]}]}, retweeted_status_result, quoted_status_id_str}, core.user_results.result
{legacy{screen_name,name,verified} | core{screen_name,name}, is_blue_verified, verification{verified}},
note_tweet.note_tweet_results.result{text, entity_set} (lange Posts), quoted_status_result, views.count,
birdwatch_pivot (Community Note)`; manchmal in `TweetWithVisibilityResults{tweet}` verpackt.
Quelle der Form: öffentliche Typdefinitionen (the-convocation/twitter-scraper, `timeline-v1.ts`/`v2.ts`,
abgerufen 2026-09-21) — **keine eigene Beobachtung**. Der Mapper (`x-graphql.ts`) ist gegen eine
synthetische Fixture getestet und muss mit `scraper/research/console-probes/x-graphql-capture.js` auf einem
eingeloggten Profil bestätigt werden (Aufgabe T-006).

Was der GraphQL-Weg gegenüber dem DOM bringt: den **vollen Text langer Posts** (im DOM „Show more"), Alt-Texte,
Views, Sprache, **Community Notes**, Quote-Text auch wenn nicht gerendert, MP4-Varianten mit Bitrate.

### 5.3 DOM (Fallback)

`article[data-testid="tweet"]`, `tweetText`, `User-Name`, `tweetPhoto img`, `video`, `a[href*="/status/"] time`,
`socialContext` — vom Gerüst verifiziert („funktioniert schon"), in dieser Sitzung nicht re-verifiziert.
Ergänzt: `tweet-text-show-more-link` als Kürzungs-Erkennung (Debug-Log). Zweiter `tweetText` = Quote (Heuristik
des Gerüsts, unverändert).

### 5.4 Video auf X

MP4-Varianten liegen auf `video.twimg.com` (aus `video_info.variants`, höchste Bitrate gewählt). Ob der Download
aus dem Seitenkontext erlaubt ist (CORS), war ohne Login **nicht prüfbar**; X-Videos haben praktisch nie
Untertitel. Der STT-Pfad ist plattformneutral gebaut (`transcribeFromUrl`), aber für X nicht verdrahtet, bis der
CORS-Punkt geklärt ist.

---

## 6. Speech-to-Text: gemessen und verglichen

Lokal vorhanden: `whisper-cli`, `whisper-server`, `whisper-stream` (whisper.cpp via Homebrew, Metal aktiv) und
`ggml-large-v3-turbo.bin` (1,5 GB). Testclip: neutrale synthetische Sprache (macOS `say`), 5/10/28 s, 16 kHz mono.

| Lauf | Audio | Encode | Gesamt (Werkzeug) | Wall (Aufruf) |
|---|---|---|---|---|
| CLI, voller Kontext | 5 s | 1,07 s | 2,49 s | 3,14 s |
| CLI, `-ac 512` | 5 s | 0,59 s | 1,57 s | 2,13 s |
| CLI, `-ac 384` | 5 s | 0,33 s | 1,05 s | 1,61 s |
| CLI, voller Kontext | 10 s | 1,14 s | 2,11 s | 2,61 s |
| CLI, `-ac 512` | 10 s | 0,32 s | 1,24 s | 1,60 s |
| CLI, voller Kontext | 28 s | 1,02 s | 2,63 s | 3,12 s |
| CLI, `-l auto` | 28 s | 2 × 1,0 s | 3,50 s | 4,15 s |
| Server (Modell geladen), voller Kontext | 5 / 10 / 28 s | — | — | 1,17 / 1,30 / 1,90 s |
| Server, `-ac 768` | 5 / 10 s | — | — | 0,75 / 0,80 s |
| Server, `-ac 768` | 28 s | — | — | 6,67 s (Kontext zu klein → mehrere Fenster) |
| Server, MP4/AAC-Eingabe mit `--convert` | 28 s | — | — | 1,92 s (ffmpeg-Umwandlung ~0) |

Erkenntnisse: der Encode kostet pro 30-s-Fenster ~1,0 s, **unabhängig von der Audiolänge**; `--audio-ctx`
verkürzt ihn proportional bei gleicher Erkennung (10 s: identischer Text bei 512 und voll). Modell-Ladezeit
0,44–1,27 s je Prozess → der Server (Modell im Speicher) ist Pflicht. Sprachhinweis spart ~1 s (TikTok liefert
`textLanguage`). `verbose_json` gibt Segmente mit Zeiten. ffmpeg-Dekodierung 10 s: 24 ms (falls doch serverseitig).

Optionen im Vergleich (nur die erste Zeile ist gemessen):

| Option | Erster Text | Datenschutz | Aufwand | Urteil |
|---|---|---|---|---|
| **whisper.cpp lokal, `whisper-server`, WAV-Fenster aus dem Browser** | 0,84–1,4 s nach `play` (gemessen) | alles lokal | Companion-Prozess starten (`scraper/companion/whisper-server.sh`) | **gewählt** |
| Cloud-STT (Deepgram-Streaming, alter Plan) | typ. 0,5–1 s (übernommen, nicht gemessen) | Audio verlässt den Rechner | Key, Tab-Capture, Offscreen-Dokument, Ton wird stumm (DOKUMENTATION.md 3.2) | Reserve |
| Whisper im Browser (WebGPU, transformers.js, tiny/base) | 1–3 s (übernommen) | lokal | 40–150 MB Modell im Extension-Kontext, deutlich schlechtere Erkennung | später prüfen |
| Web Speech API | — | — | nur Mikrofon, kein Tab-Audio | ungeeignet |
| MLX-Whisper (Apple) | vergleichbar mit whisper.cpp (übernommen) | lokal | Python-Prozess, kein HTTP-Server mitgeliefert | Alternative zum Companion |
| `whisper-stream` (Mikrofon-Streaming) | — | lokal | nimmt vom Mikro, nicht vom Tab | ungeeignet |

Progressive Transkription: gebaut als Fenster von 10 s (erstes Fenster = Sekunden 0–10 → ein Chunk, dann 10–20 …).
Kleinere erste Fenster (5 s, `-ac 512`: 0,75 s) sind möglich; 10 s wählte ich, weil der Chunk dann einen Satz trägt
und die Glue-Schicht pro Chunk eine ganze Analyse auslöst.

---

## 7. Architektur

```
 tiktok.com / x.com  ─────────────────────────────────────────────────────────────
 │ MAIN world   scraper/main-world.ts  (manifest: world MAIN, document_start)
 │   fetch/XHR-Wrapper ──► item_list / graphql JSON ──► window.postMessage ─┐
 │   TikTok: Artikel ──Fiber──► Item ──► data-fedo-tiktok-id am Artikel     │
 │                                                                          ▼
 │ isolated world (Content Script)                                  scraper/bridge.ts
 │   platforms/tiktok.ts  Cache rawId→MappedTikTok  ◄──── listenBridge ──────┘
 │     trackFeed(Artikel) → resolve(Attribut → Cache | DOM-Fallback) → sink.onItem
 │     play-Ereignis → transcript.setActive(...)
 │   platforms/x.ts        Cache statusId→MappedTweet, observeFeed(article) → sink.onItem
 │   transcript/controller.ts  genau EIN Job · prefetch(VTT) · Abbruch beim Wechsel
 │     captions.ts  VTT laden/parsen, Cues im Takt (≤ 1 Chunk / 750 ms)
 │     stt.ts       MP4 laden → decodeAudioData → 16 kHz WAV-Fenster → POST
 └──────────────────────────────────────────────────────────────────────────────
                     │ http://127.0.0.1:8181/inference  (CORS *)
                     ▼
              whisper-server  (scraper/companion/whisper-server.sh, Modell im Speicher)
```

Zwei Details, die erst der Integrationslauf erzwungen hat: Das Content-Script startet bei `document_idle`, also
nach der ersten Item-Antwort (~2 s) — die MAIN world hält deshalb die letzten 64 Datensätze und liefert sie auf
Anfrage nach (Replay: erste Items 29 ms nach Installation, Lauf 6). Und ein Artikel gilt erst als „bereit", wenn
sein Datensatz im Cache liegt (oder 1,5 s vergangen sind) — die ID am Artikel allein reicht nicht, weil sie vor
dem Replay da ist.

Warum so und nicht anders:

| Alternative | Warum nicht (gemessen oder aus der Doku) |
|---|---|
| Nur DOM | keine Video-ID, keine Zähler, keine Untertitel-URL, kein MP4 (blob) auf TikTok |
| `chrome.webRequest` | MV3 liefert keine Antwort-Bodies |
| `chrome.debugger` (CDP aus der Extension) | volle Bodies, aber gelber Warnbalken „wird debuggt", schwer, Jury sieht es |
| Fetch-Patch per `<script>`-Injektion aus dem Content-Script | TikToks CSP blockt Inline-Skripte; `web_accessible_resources` wäre ebenfalls eine Manifest-Änderung → dann lieber `world: MAIN` |
| Tab-Capture + Offscreen (alter Plan) | Tab wird stumm, Echtzeit-Zwang (kann nie schneller als das Video), zusätzliche Rechte |
| Native Messaging statt HTTP | Installation eines Host-Manifests je Nutzer; `whisper-server` spricht schon HTTP mit CORS |
| STT im Background-Worker | sauberer gegen CSP/LNA (Abschnitt 12), braucht aber einen neuen Nachrichtentyp in `contracts/messages.ts` — Vorschlag, nicht gemacht |

Safari/WebKit: `world: MAIN` in `content_scripts` gibt es dort nicht in gleicher Form; der Bridge-Ansatz bräuchte
eine Skript-Injektion mit `web_accessible_resources`. Nicht untersucht, Chrome ist die Zielplattform des Manifests.

---

## 8. Fallback-Strategie je Feld (TikTok)

```
id          Bridge/Attribut ─► (Fiber, MAIN) ─► Hash(handle+text)          [Attribut fehlt >1,5 s → Hash]
text        contents[].desc ─► desc ─► DOM video-desc
hashtags    textExtra ─► challenges ─► Regex über text
handle      author.uniqueId | author (String) ─► DOM a[href^="/@"]
displayName author.nickname | nickname ─► —
media       playAddr (+cover) | imagePost ─► DOM <video> (blob, nur als Marker)
captions    VTT vorab geladen (Prefetch beim Eintreffen des Items) ─► leer, dann onTranscript
transcript  VTT gepaced ─► STT lokal ─► nichts (Companion aus)
```
Der Wechsel ist automatisch: fehlt die Bridge (`data-fedo-main-world` nicht gesetzt), läuft sofort der DOM-Pfad
(Integrationslauf 1: 6 Items mit Handle, Text, Hashtags, 3 `onItemRemoved`, aber Hash-IDs und kein Transcript).

---

## 9. FeedItem Coverage und Contract Compatibility

`FeedItem` laut `contracts/types.ts` (unverändert):

```ts
id: string; platform: "x" | "tiktok"; url?: string;
author: { handle: string; displayName?: string; verified?: boolean };
text: string; hashtags: string[]; media: MediaRef[];      // MediaRef {type, url, posterUrl?, altText?}
quotedText?: string; captions?: string; isRepost?: boolean; createdAt?: string; scrapedAt: number;
```

### 9.1 Coverage

| Feld | TikTok | X | Empfohlener Weg | Fallback | Latenz | Zuverlässigkeit / Einschränkung |
|---|---|---|---|---|---|---|
| `id` | ja | ja | TikTok: Item-JSON per Attribut; X: Permalink `/status/<id>` (DOM) oder GraphQL `rest_id` | TikTok: Hash | vor dem Video / bei Artikel | TikTok 12/12 echt (Lauf 3); Hash nur ohne Bridge |
| `platform` | ja | ja | Hostname | — | sofort | — |
| `url` | ja | ja | aus id + handle | — | sofort | TikTok leer, wenn Handle fehlt |
| `author.handle` | ja | ja | JSON / Permalink | DOM-Link | sofort | 12/12 |
| `author.displayName` | ja | ja (DOM `User-Name` / GraphQL `name`) | JSON | — | sofort | 12/12 mit Bridge; **fehlt im DOM-Fallback** |
| `author.verified` | teils | ja (`icon-verified` / `is_blue_verified`) | JSON (API-Form) | — | sofort | TikTok: in der React-State-Form nicht enthalten → `undefined` |
| `text` | ja | ja | JSON `contents[].desc` / GraphQL `note_tweet` | DOM | sofort | X-DOM kürzt lange Posts („Show more") |
| `hashtags` | ja | ja | strukturiert (`textExtra` / `entities.hashtags`) | Regex | sofort | Test: strukturiert = Regex auf dem Sample |
| `media` | ja (video/image) | ja (image/video/gif + alt) | JSON / GraphQL Varianten | DOM `<img>`/`<video>` | sofort | TikTok-`<video>` ist blob (nur DOM-Fallback) |
| `quotedText` | n/a | ja | GraphQL `quoted_status_result` | 2. `tweetText` im DOM | sofort | GraphQL live unverifiziert |
| `captions` | teils | nein | VTT vorab laden | leer → `onTranscript` | vor dem Video, wenn Prefetch fertig | 3/12 Items im Lauf 3; Abdeckung 5/33 im Feed |
| `isRepost` | nein (nicht im FYP-Sample) | ja (`socialContext` / `retweeted_status_result`) | GraphQL | DOM | sofort | TikTok: `statsV2.repostCount` existiert, Repost-Kennzeichen nicht gesehen |
| `createdAt` | ja | ja | `createTime` / `created_at` / `<time datetime>` | — | sofort | 12/12 |
| `scrapedAt` | ja | ja | `Date.now()` bei Emission | — | — | — |

Leer bleiben können: `captions` (kein Track), `verified` (TikTok State-Form), `quotedText` (TikTok immer),
`displayName`/`createdAt` (nur im DOM-Fallback ohne Bridge).

### 9.2 Zusätzliche Felder, die die Plattformen liefern (Vorschlag, nicht umgesetzt)

Alle unten genannten Werte werden intern schon extrahiert (`TikTokExtras`, `XExtras` in den Mappern) und im
Debug-Log ausgegeben; sie erreichen den Sink nicht, weil `FeedItem` sie nicht kennt.

| Feld (Vorschlag) | Analyse-Mehrwert | Zuverlässigkeit | Typ | Plattform |
|---|---|---|---|---|
| `language` | Jev-Fragen in der richtigen Sprache; STT-Sprachhinweis spart ~1 s | hoch (`textLanguage`, `lang`) | `string` (ISO 639-1, `un` = unbekannt) | beide |
| `stats` | Reichweite/Engagement als Kontext für Engagement-Bait, Virality | hoch | `{ likes?, comments?, shares?, views?, saves?, quotes?, bookmarks? }` (number) | beide |
| `stickerTexts` | Bildschirmtext ist bei Videos ohne Sprache oft die eigentliche Aussage | mittel (3/33 gefüllt) | `string[]` | TikTok |
| `mentions` | Zielgruppen/Beteiligte, us-vs-them | hoch | `string[]` | beide |
| `communityNote` | stärkstes Glaubwürdigkeitssignal auf X | unbekannt live (GraphQL) | `string` | X |
| `links` (expandierte URLs) | Quellenangabe vs. keine Quelle (`factual_claim`) | hoch | `string[]` | beide (TikTok: `anchors`, selten) |
| `isAd` / `aiLabel` | Commercial persuasion, synthetic media | hoch | `boolean`, `string` | TikTok |
| `music` | Sound-Trends, Original vs. fremd | hoch | `{ title?, author?, original? }` | TikTok |
| `durationSec` | STT-Budget, Chunk-Planung | hoch | `number` | TikTok |
| `topComments` | Rezeption, Widerspruch, Kontext („das ist Satire") | mittel (unsignierter Endpunkt) | `{ text, likes, replies, language? }[]` | TikTok |
| `possiblySensitive`, `inReplyToId`, `conversationId` | Thread-Kontext | unbekannt live | `boolean`, `string` | X |

Alle als **optionale** Felder — die Teamregel „Neue Felder lieber optional hinzufügen" (START_HERE.md §4).

---

## 10. Transcript Integration

- **Kanal:** `sink.onTranscript({ itemId, text, isFinal, t, source })` — existiert im Contract, wird jetzt bedient.
- **Zuordnung:** `itemId` = `FeedItem.id` (`tiktok:<id>`); der Controller kennt nur das aktive Video.
- **Auslöser:** das `play`-Ereignis des Videos (capture-Listener auf `document`), nicht die Sichtbarkeit — so
  läuft nie ein Transcript für ein sichtbares, aber pausiertes Video.
- **Captions-Pfad:** VTT wird geladen, sobald das Item aus dem Netz kommt (Prefetch) → oft steht der volle Text
  schon in `item.captions` beim `onItem`. Zusätzlich werden die Cues im Takt der Wiedergabe als Chunks nachgereicht
  (`isFinal: true`, `t` = Cue-Start, `source: "captions"`, höchstens ein Chunk je 750 ms, gebündelt), damit die
  Werte „mitlaufen". Erster Chunk: 504 ms (Lauf 3), 13 ms und 201 ms (Lauf 7, vorab geladen) nach `play`.
  TikTok nennt je Spur bis zu drei URL-Varianten (`url`, `urlList`: zwei CDN-Hosts + `tiktok.com/aweme/v1/play`);
  der Abruf probiert sie der Reihe nach — mit nur der ersten scheiterten 5 von 7 Abrufen (Lauf 6), mit Fallback 0 (Lauf 7).
- **STT-Pfad:** ohne Track → `sttAvailable()` (GET-Sonde, 5-s-Deckel, negatives Ergebnis nur 10 s gecacht — eine
  frühere 800-ms-Sonde lief während des Seitenstarts in ein 3,5-s-Timeout und schaltete STT für eine Minute ab)
  → MP4 laden → dekodieren → 10-s-Fenster → je Fenster ein Chunk (`source: "stt"`, `t` = Fensterbeginn).
  Erster Chunk 840–1.413 ms nach `play` (4 von 6), Ausreißer 3,0 s und 4,4 s beim Seitenstart.
- **Abbruch:** `setActive` für ein anderes Item ruft `stop()` (AbortController auf Fetches und POST, Pace-Timer
  weg). Gemessen: 0 Nachzügler-Chunks in drei Läufen.
- **Parallelität:** genau ein Job; nur VTT-Dateien werden für kommende Items vorab geladen (wenige KB).
- **Was die Glue-Schicht daraus macht (gelesen, `extension/src/content.ts`):** jeder Chunk ersetzt den letzten
  nicht-finalen und löst eine **komplette** Neu-Analyse mit allen Chunks aus; `background.ts` cached nur
  `kind: "post"`. Folgen: (a) Chunk-Rate begrenzen (gemacht: 750 ms / 10-s-Fenster), (b) ein zweites `onItem` für
  dieselbe ID würde vom Cache verschluckt — darum wird `onItem` genau einmal je Anchor emittiert.
- **Doppelung, Entscheidung für den AI-Dev:** bei Items mit VTT steht der Text in `captions` **und** kommt als
  Chunks; `ai/state.ts` schreibt beides in den State (`captions:` + `spoken_text:`). Vorschlag: bei `kind:
  "transcript"` `captions` weglassen, wenn `transcript[0].source === "captions"`. Nicht meine Datei.
- **Minimale Contract-Erweiterung, falls gewünscht (nicht gemacht):** keine nötig für den Betrieb. Sinnvoll wären
  optional `TranscriptChunk.language?: string` und `TranscriptChunk.endT?: number`.

---

## 11. Wann `sink.onItem` ausgelöst wird — Option A/B/C

- **Option C (später aktualisieren)** scheidet aus: `background.ts` cached das Ergebnis je `item.id`; ein zweites
  `onItem` mit mehr Daten würde nie analysiert.
- **Option B (kurzes Fenster)** ist nur für den DOM-Fallback nötig: ein gefüllter Artikel wartet bis zu 1,5 s auf die
  ID aus der MAIN world (Messung: normalerweise kommt sie im selben Frame; einmal in 7 dauerte es länger als 400 ms
  und erzeugte ein Doppel-Item mit Hash-ID — daher 1,5 s).
- **Option A (sofort)** ist der Normalfall: das Item-JSON liegt 1–3,6 s vor dem Video vor, `onItem` feuert beim
  Füllen des Artikels, `captions` sind oft schon dabei. Gemessen in drei Läufen (Abschnitt 14).

---

## 12. Robustheit und Risiken

| Risiko | Einschätzung | Gegenmaßnahme |
|---|---|---|
| TikTok ändert das Item-JSON | Form seit Jahren stabil (`itemList`, `desc`, `author`, `video`); zwei Autor-Formen gesehen | Mapper mit optionalen Feldern, Tests gegen Fixtures, DOM-Fallback |
| React-Hook-Reihenfolge ändert sich | wahrscheinlich bei größeren Deploys | Fiber nur für die ID-Zuordnung; Suche bis Tiefe 6/60 Hooks; Fallback Hash |
| `data-e2e`-Attribute ändern sich | selten, aber DOKUMENTATION.md fand 2 Selektoren, die heute fehlen | nur `feed-video`, `video-desc`, `/@`-Link im Einsatz |
| Kommentar-Endpunkt verlangt wieder Signatur | möglich | Feature ist optional; dann Panel-Mithören |
| Seiten-CSP blockt `127.0.0.1` | trifft nur den **Seitenkontext**; Content-Scripts umgehen die Seiten-CSP in Chrome — im CDP-Testlauf musste `bypassCSP` gesetzt werden | in der echten Extension prüfen (Abschnitt 15); Reserve: STT-POST über den Background-Worker (neuer Nachrichtentyp) |
| Chrome „Local Network Access" (Berechtigungsabfrage für Loopback) | in Chromium 153 hier **nicht** ausgelöst (GET von tiktok.com an 127.0.0.1 kam mit CORS-Antwort zurück) | beobachten; Reserve wie oben |
| Login-Wände (X) | X ohne Login nutzlos; TikTok ausgeloggt voll nutzbar | Zielnutzer ist eingeloggt |
| Rate-Limits | Item-JSON: keine eigenen Aufrufe (mithören); VTT: 1 Datei je Video; STT: lokal; Kommentare: 1 Aufruf je Video | — |
| Anti-Bot | wir senden nichts Zusätzliches an TikTok außer VTT/MP4-Abrufen, die der Player ohnehin macht | — |
| CPU/RAM | MAIN-world-Wrapper: ~0 ms; Fiber-Suche 0,1 ms; Decode 50 ms; whisper ~1 s GPU je Fenster | ein Job gleichzeitig |
| Datenschutz | alles lokal; keine Cloud; Fixtures bereinigt (keine Cookies/Tokens, Avatare/`secUid` entfernt) | — |
| Seitenfehler `a.init is not a function` (einmal, Lauf 4) | Uncaught in TikToks Code, nicht unserem zuzuordnen; kein Funktionsverlust beobachtet | beobachten (T-007) |
| Same-Origin-Spoofing auf der Bridge | Seitencode könnte Fake-Items posten | Mapper validieren die Form; kein Code-Pfad vertraut Strings blind |

---

## 13. Was gebaut wurde

Nur `scraper/` plus drei ausgewiesene Glue-Zeilen. `contracts/` unberührt.

| Datei | Aufgabe |
|---|---|
| `scraper/bridge.ts` | Protokoll MAIN ↔ isolated (`postMessage`, Namespace, Flag, Attributname) |
| `scraper/main-world.ts` | fetch/XHR-Wrapper, TikTok-Fiber → `data-fedo-tiktok-id`, Präsenz-Flag |
| `scraper/platforms/tiktok-item.ts` | Item-JSON (beide Formen) → `FeedItem` + `TikTokExtras` |
| `scraper/platforms/tiktok.ts` | Adapter: Bridge-Cache, `trackFeed`, DOM-Fallback, `play` → Transcript, `onItemRemoved` |
| `scraper/platforms/x-graphql.ts` | Tweet-Entität → `FeedItem` + `XExtras` (note_tweet, Retweet, Quote, Medien, Community Note) |
| `scraper/platforms/x-syndication.ts` | Syndication-JSON → `FeedItem`, Token-Formel |
| `scraper/platforms/x.ts` | Adapter: Bridge-Cache nach Status-ID, DOM-Fallback, Kürzungs-Erkennung |
| `scraper/observe.ts` | neu: `trackFeed` (Platzhalter-Listen, `onLeave`); `observeFeed` unverändert |
| `scraper/transcript/captions.ts` | VTT laden/parsen, `paceCues` |
| `scraper/transcript/stt.ts` | Sonde, MP4 → PCM 16 kHz → WAV → `whisper-server` |
| `scraper/transcript/controller.ts` | ein Job, Prefetch, `captionsNow`, Abbruch |
| `scraper/companion/whisper-server.sh` | Start des lokalen STT-Servers mit den gemessenen Flags |
| `scraper/test/*.test.ts`, `scraper/test/fixtures/*` | 15 Tests; echte TikTok-Capture (bereinigt), echte Syndication-Antwort, synthetische GraphQL-Timeline |
| `scraper/research/console-probes/*` | DevTools-Sonden (ohne Tooling reproduzierbar) |
| `scraper/research/playwright/*` | Harness + Integrationssonde |
| **Glue:** `extension/manifest.json` | zweiter `content_scripts`-Eintrag: `main-world.js`, `document_start`, `"world": "MAIN"` |
| **Glue:** `scripts/build.mjs` | Bundle-Eintrag `scraper/main-world.ts → dist/main-world.js` |
| **Root:** `package.json` | Script `test:scraper` (`node --import tsx --test`, keine neue Abhängigkeit) |

Nicht gebaut, bewusst: Kommentar-Abruf (kein Feld), X-STT (CORS ungeklärt), Bild-OCR, IntersectionObserver-Pfad,
Safari.

---

## 14. Integrationsläufe (Playwright, tiktok.com/foryou, ausgeloggt)

| Lauf | Aufbau | Ergebnis |
|---|---|---|
| 1 | MAIN-world-Skript scheiterte an fehlendem `documentElement` (CDP injiziert früher als `document_start`) → reiner DOM-Fallback | 6 Items (Hash-IDs, Handle, Text, Hashtags), 3 `onItemRemoved`, 0 Transcripts — der Fallback trägt |
| 2 | MAIN world aktiv (Präsenz-Flag robust) | 10/10 Artikel mit ID-Attribut, 7 Items (6 echte IDs, 1 Hash nach 400 ms Wartezeit), `onItem` 0 ms bzw. 3,2 s vor `play`, 4 `onItemRemoved`; STT stumm (OPTIONS-Sonde → Preflight abgelehnt) |
| 3 | Sonde auf GET, Wartezeit 1,5 s, 18 Videos | 12 Items, 0 Hash, 12× `createdAt`/Anzeigename, 3× `captions` beim `onItem`, 2 Captions-Chunks (erster 504 ms nach `play`), 9 `onItemRemoved`, 0 Nachzügler; STT stumm (800-ms-Sonden-Timeout beim Seitenstart) |
| 4 | Sonde 5 s, negativer Cache 10 s, 16 Tasten (Tastatur-Navigation griff nur 6×) | 7 Items, 0 Hash, **9 STT-Chunks für 6 Videos**, erster Chunk 840/855/876/1.413 ms (Ausreißer 3.013, 4.441 ms), 0 Nachzügler, 4 `onItemRemoved` |
| 5 | **Späte Installation** (Harness erst 5 s nach Laden, wie ein `document_idle`-Content-Script nach der ersten Item-Antwort) | **Regression gefunden:** 1 Item (Hash), danach nichts — `activeVideo` war mit `let` erst nach `emit` deklariert, der erste synchrone Scan warf einen ReferenceError; außerdem griff der DOM-Fallback, obwohl die ID am Artikel stand und der Replay-Datensatz Millisekunden später kam |
| 6 | nach Fix (Deklarationsreihenfolge, „bereit" = Datensatz im Cache, Replay-Puffer in der MAIN world) | 14 Items, 0 Hash, erste zwei Items **29 ms nach Installation** (Replay), 13 Videos, 11 `onItemRemoved`, 3 Captions-Chunks (ab 763 ms), 7 STT-Chunks (ab 1.812 ms), 0 Nachzügler; **5 von 7 VTT-Abrufe scheiterten** („Failed to fetch") |
| 7 | nach VTT-Fallback über alle `urlList`-Varianten | 11 Items, 0 Hash, 16 Chunks (5 Captions, 11 STT), **0 fehlgeschlagene VTT-Abrufe**, Captions-Chunks 13 ms / 201 ms nach `play` (vorab geladen), STT 926–1.983 ms (einmal 3.027), 8 `onItemRemoved`, 0 Nachzügler |

Die STT-Pipeline isoliert (Lauf zwischen 3 und 4): Sonde 404/cors, MP4 2,9 MB in 324 ms, Decode 52 ms
(17,9 s Audio), POST 10-s-Fenster 918 ms → Text.

### 14.1 Kaltreview (Codex, gpt-6-astra, nur der Diff) und was daraus wurde

| Befund (alle SUSPECTED, 0 CONFIRMED) | Klassifikation | Behebung |
|---|---|---|
| Harness startet vor `documentElement` | gültig | Harness wartet auf `DOMContentLoaded` |
| `onPlay` umgeht die Wartefrist → Doppel-Item (Hash-ID, dann echte ID) | gültig | `onPlay` emittiert nur „bereite" Artikel; beim Wechsel Hash → echte ID wird die alte ID per `onItemRemoved` zurückgezogen |
| späterer GraphQL-Datensatz aktualisiert ein per DOM emittiertes X-Item nicht | Trade-off (Glue-Cache, §11) | Entscheidung T-011 für den Glue-Dev |
| `source` aus der URL statt aus dem tatsächlichen Pfad abgeleitet | gültig | Quelle wird vom jeweiligen Pfad übergeben (`captions` / `stt`) |
| offen: Bridge-Nachrichten vor `document_idle` gehen verloren | gültig | Replay-Puffer (64 Datensätze) in der MAIN world, Content-Script fordert ihn beim Start an |
| offen: `records: [null]` würde den Empfänger werfen lassen | gültig | `isBridgeMessage` prüft jeden Datensatz (Test `bridge.test.ts`) |

**Zweiter Kaltleser (cg-diff-reviewer, Claude, mit Repro-Skripten gegen ein DOM-Fake):** auf dem Patch
2 × CONFIRMED 🟡 (die `source`-Ableitung und die `onPlay`-Doppelemission — beide oben, beide auf dem Endstand mit
Repro als behoben belegt), 1 × SUSPECTED (verlorene Bridge-Nachrichten vor `document_idle` — durch den Replay-Puffer
adressiert, live nur in Lauf 6/7 geprüft, nicht in der echten Extension), und auf einem Zwischenstand 1 × CONFIRMED
🔴: die `let activeVideo`-Deklaration nach `emit` (Lauf 5) — behoben. Schlussurteil: **REVIEW: CLEAN** für den
Endstand, mit der Empfehlung, den eingefrorenen End-Diff noch einmal kalt lesen zu lassen (T-012), weil sich der
Baum während des Reviews bewegte. Offene Fragen des Lesers: Verschachtelung der beiden `SEL.post`-Selektoren
(T-013; gemessen treffen beide dasselbe Element), die synthetische X-Fixture (bekannt, T-006), der Syndication-Mapper
ohne Laufzeit-Konsumenten (bewusst: dokumentierter Baustein).

---

## 15. Verifikation für den nächsten Dev

```bash
cd <Fedo-Repo> && npm run check          # ✓ path boundaries OK, dist/main-world.js
cd <Fedo-Repo> && npm run test:scraper   # tests 17 · pass 17 · fail 0
```

Echte Extension (der Schritt, den diese Sitzung nicht tun konnte — Playwright kann in den MCP-Browser keine
Extension laden):

1. Terminal A: `cd <Fedo-Repo> && bash scraper/companion/whisper-server.sh`
2. Terminal B: `cd <Fedo-Repo> && npm run dev:scraper`, dann `dist/` in
   `chrome://extensions` laden (Developer mode → Load unpacked), tiktok.com/foryou öffnen, Konsole öffnen.
3. Erwartung: `[fedo:scraper] TikTok scraper started (bridge active)`, je Video `NEW VIDEO {id: "tiktok:<Zahl>", …}`
   **bevor** es läuft, bei Videos mit Sprache innerhalb von ~1–2 s Analyse-Updates (Transcript-Chunks).
   Steht dort `(DOM fallback only …)`, ist `main-world.js` nicht geladen (Manifest prüfen).
4. Prüfpunkt CSP/LNA: erscheint in der Konsole ein Fehler mit `127.0.0.1` (blocked / preflight / permission), gilt
   der Reserveweg aus Abschnitt 12 (STT-POST über den Background-Worker).
5. X eingeloggt: `scraper/research/console-probes/x-graphql-capture.js` in die Konsole, scrollen; echte Antwort
   als Fixture sichern und `x-graphql.test.ts` daran anpassen (T-006).

DevTools-Sonden ohne Extension: `scraper/research/console-probes/README.md`.

---

## 16. Offene Punkte und nächste Schritte

(Die T-Nummern in den Abschnitten 14 und 15 stammen aus einer lokalen Aufgabenliste des Autors, die nicht im Repo
liegt. Die Punkte selbst stehen vollständig hier.)

1. **X eingeloggt verifizieren** (Feed-DOM, HomeTimeline-GraphQL, `video.twimg.com`-CORS) — Sonde liegt bei.
2. **Echte Extension auf tiktok.com laufen lassen** (CSP/LNA-Punkt, Abschnitt 15).
3. Entscheidung AI-Dev: `captions` vs. Chunks (Abschnitt 10).
4. Entscheidung Team: Zusatzfelder (9.2), zuerst `language`, `stats`, `stickerTexts`, `communityNote`.
5. Kommentar-Abruf einbauen, sobald ein Feld existiert (Code-Skizze in 4.6).
6. TikTok eingeloggt: sind mehr Untertitel-Spuren da? (unbekannt)
7. Tastatur-Navigation im Test greift nicht immer (5/30 bzw. 10/16 Fehlversuche) — Test-Harness, nicht Produkt.
8. Beobachten: einmaliger TikTok-Fehler `a.init is not a function` (Lauf 4).
9. `SEL.post` in `platforms/tiktok.ts` gegen Verschachtelung absichern (falls `recommend-list-item-container` je ein
   `article[feed-video]` umschließt, gäbe es zwei Emissionen je Video; gemessen treffen beide Selektoren dasselbe Element).

---

## 17. Beleg-Block (Zahlen mit zwei Herleitungen)

- **Frage:** Wie schnell und wie vollständig füllt der Scraper `FeedItem`/`onTranscript` auf TikTok, und was liefern die Plattformen?
- **Grundgesamtheit:** `tiktok.com/foryou` ausgeloggt (33 Items Stichprobe, 4 Integrationsläufe à 6–12 Videos); `x.com` ausgeloggt; whisper.cpp auf einem M4.
- **Zeitraum:** 2026-09-21, 12:10–13:20 Uhr.
- **Einheit:** Millisekunden (Wall-Clock), Anzahl Items/Chunks.

| Zahl | Herleitung A | Herleitung B | Abgleich |
|---|---|---|---|
| Neues Video aktiv ~0,3 s nach Taste | Polling `video.paused` alle 25 ms: 21 gültige Werte 261–357 ms, Median 0,29 s | `play`-Event-Listener: 10 Werte 287–418 ms, Median 0,33 s | EINIG auf 0,1 s (0,3 s) |
| Untertitel-Abdeckung 5/33 | `claInfo.captionInfos.length > 0` → 5 | `subtitleInfos.length > 0` → 5 | EINIG |
| VTT-Cues 53 | `grep -c -- '-->'` in der Fixture | `parseVtt().length` im Test | EINIG (Test) |
| Tests 15/15 | `npm run test:scraper` SUMMARY | `grep -c 'test("' scraper/test/*.test.ts` | EINIG (gegenprobe.py) |
| Item-JSON → DOM ≤ 50 ms | Node-Zeitstempel Body vs. In-Page-Mutation: −14 ms | Resource-Timing `responseEnd` vs. Mutation: +43 ms | EINIG in der Größenordnung (Vorzeichen = Body-Lesezeit in Node) |
| whisper 10 s ≈ 0,8 s (Server, `-ac 768`) | `curl time_total` 0,805 s / 0,790 s | Encode 0,49 s (`-ac 768`, CLI) + Decode + Overhead ≈ 0,7–0,8 s | EINIG |
| `onItem` vor `play` | Lauf 3: 1, 1, −1.024 … −3.526 ms | Lauf 4: 0, 0, −1.283 … −3.561 ms | EINIG (Muster identisch) |
| erster STT-Chunk 0,84–1,4 s | Lauf 4 (4 von 6 Videos) | isolierte Pipeline: 324 + 52 + 918 ms ≈ 1,3 s | EINIG |
| Kommentare je Seite 15–18 | App-Anfrage (count=20): 18, 18, 18, 17 | minimale URL: 18, 15, 17 | EINIG (Bereich) |

**Nicht gemessen:** X eingeloggt (DOM, GraphQL, Video-CORS); TikTok eingeloggt; Langzeitverhalten; echte
Extension (statt CDP-Simulation); IntersectionObserver-Pfad.

**ERGEBNIS:** `FeedItem` ist auf TikTok mit Bridge in 12 von 12 Fällen vollständig (id, url, author.handle/
displayName, text, hashtags, media, createdAt) und liegt vor dem Video vor; `captions` bei 3/12 sofort;
`onTranscript` liefert bei Untertiteln nach ~0,5 s, per lokalem STT nach ~0,8–1,4 s; `verified` und `quotedText`
bleiben auf TikTok leer. X ist nur über Mapper und Sonden vorbereitet — **live unverifiziert**.

---

## 18. Entwurf für UPDATE.md (erst nach dem Merge eintragen)

```markdown
## JJJJ-MM-TT · `main @ <hash>` · Scraper · TikTok liest Item-JSON + Untertitel, lokales STT, Transcript-Kanal live

**Was hat sich geändert:**
- Neues MAIN-world-Skript `scraper/main-world.ts` (Manifest: zweiter content_scripts-Eintrag, Build: Entry `main-world.js`).
- TikTok-Adapter neu: echte Video-IDs, Zähler, Erstellzeit, Untertitel (`captions`), `onTranscript` (Captions/STT), `onItemRemoved`.
- X: GraphQL-/Syndication-Mapper (Fixture-getestet), DOM-Pfad unverändert. Live-Verifikation eingeloggt offen.
- Tests: `npm run test:scraper` (node:test + tsx, keine neue Abhängigkeit). Doku: `scraper/RESEARCH.md`.

**Was musst du tun:**
- `git pull --rebase origin main` · `npm run build` + in chrome://extensions auf ↻ (Manifest hat sich geändert → Extension neu laden)
- Für Video-Transkripte: `bash scraper/companion/whisper-server.sh` (braucht `brew install whisper-cpp` + Modell)

**Wichtig zu wissen:**
- AI-Dev: Bei Videos mit Untertiteln kommt der Text in `item.captions` UND als `onTranscript`-Chunks (RESEARCH.md §10).
  Empfehlung: bei `kind: "transcript"` das Feld `captions` im State weglassen, wenn `transcript[0].source === "captions"`.
- Team (Entscheidung Owner 2026-09-21): als erste Contract-Erweiterung die vier optionalen Felder `language`, `stats`,
  `stickerTexts`, `communityNote` vorschlagen (Typen in RESEARCH.md §9.2). Eigener kleiner PR auf `contracts/`.
- Glue-Dev (Entscheidung Owner 2026-09-21): Vorschlag — `background.ts` soll den Cache-Eintrag verwerfen, wenn ein
  zweites `onItem` derselben ID längeren Text bringt; dann kann der Scraper einen per DOM gekürzten X-Langpost nachreichen.
```

---

## Anhang: Quellen

| Thema | Quelle |
|---|---|
| TikTok Item-JSON, DOM, Kommentare, VTT, MP4 | selbst gemessen 2026-09-21 (Playwright, ausgeloggt) |
| X Syndication-API | selbst gemessen 2026-09-21; Token-Formel wie in X' Embed-Code |
| X GraphQL-Entitätsform | github.com/the-convocation/twitter-scraper, `src/timeline-v1.ts`, `src/timeline-v2.ts` (abgerufen 2026-09-21) — nicht selbst beobachtet |
| whisper.cpp | lokal gemessen (`whisper-cli`, `whisper-server` 1.x via Homebrew, Metal) |
| Chrome MV3 `content_scripts.world` | developer.chrome.com/docs/extensions/reference/manifest/content-scripts (Stand Doku) — nicht neu abgerufen |
| Erster Test | `DOKUMENTATION.md` (2026-09-21, Vor-Sitzung) |
