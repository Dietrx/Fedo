/**
 * Exactly one transcript job at a time — the video the user is watching. Switching videos aborts the old job
 * (no chunk of a left-behind video reaches the sink), and caption files are prefetched as soon as an item is
 * known so `FeedItem.captions` can be filled before the user even reaches the video.
 */
import type { ScraperSink } from "@contracts";
import { cuesToText, fetchCaptions, paceCues, type Cue } from "./captions";
import { sttAvailable, transcribeFromUrl } from "./stt";

export interface TranscriptTarget {
  itemId: string;
  video: HTMLVideoElement;
  /** WebVTT URL variants, tried in order (INTENTIONAL-UNTESTED: browser-only module, pinned by run-feed-probe.mjs) */
  captionUrls?: string[];
  /** direct media URL (mp4) for the STT fallback */
  mediaUrl?: string;
  language?: string;
}

export interface TranscriptController {
  /** Start loading the caption file for an item that will probably be watched soon. */
  prefetch(itemId: string, captionUrls: string[]): void;
  /** Full caption text if the file already arrived — for `FeedItem.captions` at `onItem` time. */
  captionsNow(itemId: string): string | undefined;
  /** Make this item the (only) live transcript job. Idempotent for the same item. */
  setActive(target: TranscriptTarget): void;
  stop(): void;
}

export function createTranscriptController(sink: ScraperSink, opts: { sttEndpoint?: string; log?: (...a: unknown[]) => void } = {}): TranscriptController {
  const log = opts.log ?? (() => {});
  const pending = new Map<string, Promise<Cue[]>>();
  const ready = new Map<string, Cue[]>();
  let current: { itemId: string; abort: AbortController; stopPace?: () => void } | undefined;

  // INTENTIONAL-UNTESTED: browser-only (fetch, <video>), pinned by scraper/research/playwright/run-feed-probe.mjs
  const load = (itemId: string, urls: string[]): Promise<Cue[]> => {
    let p = pending.get(itemId);
    if (!p) {
      p = fetchCaptions(urls)
        .then((cues) => {
          ready.set(itemId, cues);
          return cues;
        })
        .catch((e) => {
          log("captions failed", itemId, String(e));
          return [];
        });
      pending.set(itemId, p);
    }
    return p;
  };

  const stop = () => {
    if (!current) return;
    current.abort.abort();
    current.stopPace?.();
    current = undefined;
  };

  return {
    // INTENTIONAL-UNTESTED: browser-only, pinned by scraper/research/playwright/run-feed-probe.mjs
    prefetch(itemId, captionUrls) {
      void load(itemId, captionUrls);
    },
    captionsNow(itemId) {
      const cues = ready.get(itemId);
      return cues?.length ? cuesToText(cues) : undefined;
    },
    setActive(target) {
      if (current?.itemId === target.itemId) return;
      stop();
      if (!sink.onTranscript) return;
      const abort = new AbortController();
      const job = { itemId: target.itemId, abort, stopPace: undefined as (() => void) | undefined };
      current = job;
      // INTENTIONAL-UNTESTED: drives <video>, fetch and AudioContext — no DOM in node:test; pinned by the Playwright
      // probe (scraper/research/playwright/run-feed-probe.mjs). The source names the path that produced the text:
      // a caption track that fails to load falls back to STT and must then say "stt".
      const emit = (text: string, t: number, source: "captions" | "stt") => {
        if (abort.signal.aborted || !text) return;
        sink.onTranscript!({ itemId: target.itemId, text, isFinal: true, t, source });
      };

      // INTENTIONAL-UNTESTED: browser-only, pinned by scraper/research/playwright/run-feed-probe.mjs
      if (target.captionUrls?.length) {
        void load(target.itemId, target.captionUrls).then((cues) => {
          if (abort.signal.aborted || current !== job) return;
          if (!cues.length) return startStt();
          job.stopPace = paceCues(cues, target.video, (c) => emit(c.text, c.t, "captions"));
        });
        return;
      }
      startStt();

      function startStt() {
        if (!target.mediaUrl) return;
        void sttAvailable(opts.sttEndpoint).then((ok) => {
          if (!ok || abort.signal.aborted || current !== job) return;
          transcribeFromUrl(target.mediaUrl!, {
            endpoint: opts.sttEndpoint,
            language: target.language && target.language !== "un" ? target.language : undefined,
            signal: abort.signal,
            onChunk: (c) => emit(c.text, c.t, "stt"),
          }).catch((e) => {
            if (!abort.signal.aborted) log("stt failed", target.itemId, String(e));
          });
        });
      }
    },
    stop,
  };
}
