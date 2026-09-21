/**
 * The three module interfaces. Each path implements exactly ONE of these and exports a factory:
 *
 *   scraper/index.ts  → export function createScraper(platform): Scraper
 *   ai/index.ts       → export function createAnalyzer(config): Analyzer
 *   ui/index.ts       → export function createOverlay(): OverlayRenderer
 *
 * The glue code in extension/src wires them together. Nobody imports another path directly.
 */
import type { AnalysisInput, AnalysisResult, AudioChunk, FeedItem, OverlayState, Platform, TranscriptChunk, TranscriptionResult } from "./types";

// ── Path 1: Scraper (runs in the content script, on x.com / tiktok.com) ─────────────

export interface ScraperSink {
  /** Called once per newly seen post. `anchor` = the post's DOM element (the UI attaches its overlay there). */
  onItem(item: FeedItem, anchor: HTMLElement): void;
  /** Called with new spoken text for a video item (platform captions). */
  onTranscript?(chunk: TranscriptChunk): void;
  /** Called with a few seconds of captured video audio; the glue sends it to speech-to-text. Return false to stop capturing this item. */
  onAudio?(chunk: AudioChunk): void;
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
  /** Speech-to-text for videos: an OpenAI-style `/audio/transcriptions` URL or an OpenAI-compatible `/chat/completions` URL of an audio-capable model. */
  sttApiUrl?: string;
  sttApiKey?: string;
  sttModel?: string;
  /**
   * Image understanding (text in images, video posters, signs of AI generation): an OpenAI-compatible
   * `/chat/completions` URL of a multimodal model. Optional — when unset, ai/ reuses the STT chat model.
   */
  visionApiUrl?: string;
  visionApiKey?: string;
  visionModel?: string;
}

export interface Transcriber {
  /** Must never touch `chrome.*` or `document` — fetch only, so it runs in Node too. */
  transcribe(chunk: AudioChunk): Promise<TranscriptionResult>;
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
