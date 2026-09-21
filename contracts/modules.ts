/**
 * The three module interfaces. Each path implements exactly ONE of these and exports a factory:
 *
 *   scraper/index.ts  → export function createScraper(platform): Scraper
 *   ai/index.ts       → export function createAnalyzer(config): Analyzer
 *   ui/index.ts       → export function createOverlay(): OverlayRenderer
 *
 * The glue code in extension/src wires them together. Nobody imports another path directly.
 */
import type { AnalysisInput, AnalysisResult, FeedItem, OverlayState, Platform, TranscriptChunk } from "./types";

// ── Path 1: Scraper (runs in the content script, on x.com / tiktok.com) ─────────────

export interface ScraperSink {
  /** Called once per newly seen post. `anchor` = the post's DOM element (the UI attaches its overlay there). */
  onItem(item: FeedItem, anchor: HTMLElement): void;
  /** Called with new spoken text for a video item (optional feature). */
  onTranscript?(chunk: TranscriptChunk): void;
  /** Called when a post leaves the DOM / is recycled by the virtual list. */
  onItemRemoved?(itemId: string): void;
}

export interface Scraper {
  readonly platform: Platform;
  /** Start observing the page. Returns a stop function. */
  start(sink: ScraperSink): () => void;
}

// ── Path 2: AI (runs in the background service worker, and in Node for the dev harness) ──

export interface AnalyzerConfig {
  mode: "mock" | "jev";
  jevApiUrl?: string;
  jevApiKey?: string;
}

export interface Analyzer {
  /** Must never touch `chrome.*` or `document` — pure logic + fetch, so it runs in Node too. */
  analyze(input: AnalysisInput): Promise<AnalysisResult>;
}

// ── Path 3: UI (runs in the content script) ─────────────────────────────────────────

export interface OverlayRenderer {
  /** Create or update the overlay for an item. Called repeatedly (pending → done → partial updates). */
  render(itemId: string, anchor: HTMLElement, state: OverlayState): void;
  remove(itemId: string): void;
  /** Remove everything (extension disabled). */
  clear(): void;
}

export type { Platform };
