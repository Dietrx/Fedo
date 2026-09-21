/**
 * Test harness for the scraper WITHOUT the extension glue: starts the real scraper with a logging sink.
 * Injected into an isolated world (like a content script) by run-feed-probe.mjs, next to dist-equivalent
 * main-world.js in the page world. Every sink call is appended to a hidden <script type="application/json">
 * element, which both worlds can read (DOM is shared, JS globals are not).
 *
 * INTENTIONAL-UNTESTED: research harness that only runs inside a browser page; it is the pin for the
 * page-world code, not a unit under test itself.
 */
import type { ScraperSink } from "@contracts";
import { createScraper, detectPlatform } from "../../index";

const LOG_ID = "fedo-harness-log";
const t0 = performance.now();
const entries: Record<string, unknown>[] = [];

function flush() {
  let el = document.getElementById(LOG_ID);
  if (!el) {
    el = document.createElement("script");
    el.id = LOG_ID;
    el.setAttribute("type", "application/json");
    document.documentElement.appendChild(el);
  }
  el.textContent = JSON.stringify(entries);
}

const stamp = () => Math.round(performance.now() - t0);

// Injected at document creation (Page.addScriptToEvaluateOnNewDocument) there is no <html>/<body> yet — a real
// content script at document_idle has both. Start only once the document exists.
if (document.body) start();
else document.addEventListener("DOMContentLoaded", start, { once: true });

function start() {
  const platform = detectPlatform(location.hostname);
  if (!platform) return;
  const sink: ScraperSink = {
    onItem(item, anchor) {
      entries.push({
        ev: "item",
        t: stamp(),
        id: item.id,
        handle: item.author.handle,
        displayName: item.author.displayName,
        verified: item.author.verified,
        textLen: item.text.length,
        hashtags: item.hashtags,
        media: item.media.map((m) => m.type),
        captionsLen: item.captions?.length ?? 0,
        createdAt: item.createdAt,
        url: item.url,
        anchor: anchor.tagName + (anchor.getAttribute("data-e2e") ? `[${anchor.getAttribute("data-e2e")}]` : ""),
      });
      flush();
    },
    onTranscript(chunk) {
      entries.push({ ev: "transcript", t: stamp(), id: chunk.itemId, source: chunk.source, at: chunk.t, isFinal: chunk.isFinal, text: chunk.text.slice(0, 100) });
      flush();
    },
    onItemRemoved(itemId) {
      entries.push({ ev: "removed", t: stamp(), id: itemId });
      flush();
    },
  };
  entries.push({ ev: "start", t: stamp(), platform, mainWorld: document.documentElement.dataset.fedoMainWorld === "1" });
  flush();
  createScraper(platform).start(sink);
}
