/**
 * GLUE — content script. Wires scraper → background (AI) → UI.
 * Keep this file thin. Logic belongs in scraper/, ai/ or ui/.
 */
import type { FeedItem, TranscriptChunk } from "@contracts";
import { send } from "@contracts/messages";
import { createScraper, detectPlatform } from "../../scraper";
import { createOverlay } from "../../ui";

async function main() {
  const platform = detectPlatform(location.hostname);
  if (!platform) return;

  const settings = await send({ type: "fedo/getSettings" });
  if (!settings.enabled) return;

  const overlay = createOverlay({ minScore: settings.minScore });
  const scraper = createScraper(platform);
  const items = new Map<string, { item: FeedItem; anchor: HTMLElement; transcript: TranscriptChunk[] }>();

  scraper.start({
    onItem(item, anchor) {
      items.set(item.id, { item, anchor, transcript: [] });
      overlay.render(item.id, anchor, { status: "pending" });
      send({ type: "fedo/analyze", input: { kind: "post", item } })
        .then((result) => overlay.render(item.id, anchor, { status: "done", result }))
        .catch((e) => overlay.render(item.id, anchor, { status: "error", message: String(e) }));
    },

    onTranscript(chunk) {
      const entry = items.get(chunk.itemId);
      if (!entry) return;
      // replace the trailing non-final chunk, append otherwise
      if (entry.transcript.at(-1)?.isFinal === false) entry.transcript.pop();
      entry.transcript.push(chunk);
      send({ type: "fedo/analyze", input: { kind: "transcript", item: entry.item, transcript: entry.transcript } })
        .then((result) => overlay.render(chunk.itemId, entry.anchor, { status: "done", result }))
        .catch(() => {}); // keep last good result on screen
    },

    onItemRemoved(itemId) {
      items.delete(itemId);
      overlay.remove(itemId);
    },
  });
}

main().catch((e) => console.error("[fedo]", e));
