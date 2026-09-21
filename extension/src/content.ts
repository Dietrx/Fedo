/**
 * GLUE — content script. Wires scraper → background (AI) → UI.
 * Keep this file thin. Logic belongs in scraper/, ai/ or ui/.
 */
import { DEFAULT_SETTINGS, type FeedItem, type OverlayState, type Settings, type TranscriptChunk } from "@contracts";
import { send } from "@contracts/messages";
import { createScraper, detectPlatform } from "../../scraper";
import { createOverlay } from "../../ui";

interface Entry {
  item: FeedItem;
  anchor: HTMLElement;
  transcript: TranscriptChunk[];
  /** last state shown, so a settings change can re-render without re-analyzing */
  state?: OverlayState;
  /** analysis requests sent for this item; only the newest response may render (transcripts can overtake each other) */
  seq: number;
}

async function main() {
  const platform = detectPlatform(location.hostname);
  if (!platform) return;

  let settings: Settings = { ...DEFAULT_SETTINGS, ...(await send({ type: "fedo/getSettings" })) };
  let overlay = createOverlay({ minScore: settings.minScore, calmMode: settings.calmMode });
  const items = new Map<string, Entry>();

  function show(entry: Entry, state: OverlayState) {
    entry.state = state;
    if (settings.enabled) overlay.render(entry.item.id, entry.anchor, state);
  }

  function analyze(entry: Entry) {
    const seq = ++entry.seq;
    const input = entry.transcript.length ? { kind: "transcript" as const, item: entry.item, transcript: entry.transcript } : { kind: "post" as const, item: entry.item };
    send({ type: "fedo/analyze", input })
      .then((result) => seq === entry.seq && show(entry, { status: "done", result }))
      .catch((e) => seq === entry.seq && !entry.transcript.length && show(entry, { status: "error", message: String(e) }));
  }

  // Popup changes apply live: no tab reload needed.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.settings) return;
    const next: Settings = { ...DEFAULT_SETTINGS, ...(changes.settings.newValue as Partial<Settings>) };
    const wasEnabled = settings.enabled;
    settings = next;
    overlay.clear();
    overlay = createOverlay({ minScore: settings.minScore, calmMode: settings.calmMode });
    if (!settings.enabled) return;
    for (const entry of items.values()) {
      if (!entry.state || (!wasEnabled && entry.state.status === "pending")) {
        show(entry, { status: "pending" });
        analyze(entry);
      } else {
        overlay.render(entry.item.id, entry.anchor, entry.state);
      }
    }
  });

  const scraper = createScraper(platform);
  scraper.start({
    onItem(item, anchor) {
      const entry: Entry = { item, anchor, transcript: [], seq: 0 };
      items.set(item.id, entry);
      if (!settings.enabled) return; // remembered; analyzed as soon as the user switches Fedo on
      show(entry, { status: "pending" });
      analyze(entry);
    },

    onTranscript(chunk) {
      const entry = items.get(chunk.itemId);
      if (!entry) return;
      // replace the trailing non-final chunk, append otherwise
      if (entry.transcript.at(-1)?.isFinal === false) entry.transcript.pop();
      entry.transcript.push(chunk);
      if (settings.enabled) analyze(entry); // errors keep the last good result on screen (see analyze)
    },

    onItemRemoved(itemId) {
      items.delete(itemId);
      overlay.remove(itemId);
    },
  });
}

main().catch((e) => console.error("[fedo]", e));
