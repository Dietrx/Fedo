/**
 * THE shared data model. Every path (scraper / ai / ui) only talks through these types.
 * Changing this file = changing the contract → needs a quick OK from all three devs.
 * Prefer ADDING optional fields over renaming/removing existing ones.
 */

export type Platform = "x" | "tiktok";

export interface MediaRef {
  type: "image" | "video" | "gif";
  url: string;
  posterUrl?: string;
  altText?: string;
}

/** One post/video as extracted by the scraper. Must be JSON-serializable (sent via chrome messaging). */
export interface FeedItem {
  /** Stable, unique id: `${platform}:${postId}` */
  id: string;
  platform: Platform;
  url?: string;
  author: {
    handle: string;
    displayName?: string;
    verified?: boolean;
  };
  /** Main post text / TikTok description */
  text: string;
  hashtags: string[];
  media: MediaRef[];
  /** Text of a quoted/embedded post, if any */
  quotedText?: string;
  /** Platform-provided subtitles (TikTok), if available */
  captions?: string;
  isRepost?: boolean;
  createdAt?: string;
  scrapedAt: number;
  /** "draft" = the user's own text in the compose box (analyzed live while typing). Default: "post". */
  kind?: "post" | "draft";
}

/** A piece of spoken text for a video item (from platform captions or live STT). */
export interface TranscriptChunk {
  itemId: string;
  text: string;
  /** false while the sentence is still being spoken / may still change */
  isFinal: boolean;
  /** seconds since the video started */
  t: number;
  source: "captions" | "stt";
}

/**
 * A few seconds of a video's audio, captured in the page (video.captureStream()) and handed to the
 * background for speech-to-text. Always 16 kHz mono WAV, base64 → small and every STT API accepts it.
 */
export interface AudioChunk {
  itemId: string;
  /** base64 of the WAV file */
  audio: string;
  mime: "audio/wav";
  /** video time (seconds) where this chunk starts / ends */
  t0: number;
  t1: number;
  /** total length of the video, if the player knows it */
  durationSec?: number;
  /** true for the last chunk (video ended or capture stopped) */
  ended: boolean;
}

/** Speech-to-text result for one AudioChunk. */
export interface TranscriptionResult {
  /** false when no STT endpoint is configured → the glue stops capturing */
  configured: boolean;
  text: string;
  /** sentences with their (approximate) start time in the video */
  segments: { text: string; t: number }[];
}

/** How far the live analysis of a video has come. Shown by the UI as a progress strip + countdown. */
export interface VideoProgress {
  phase: "listening" | "transcribing" | "done" | "muted" | "unavailable";
  /** seconds of the video that have been transcribed so far */
  coveredSec: number;
  durationSec?: number;
  /** ms since epoch when the full analysis is expected (UI shows a countdown) */
  etaAt?: number;
}

/** What the AI path gets asked to analyze. */
export type AnalysisInput =
  | { kind: "post"; item: FeedItem }
  | { kind: "transcript"; item: FeedItem; transcript: TranscriptChunk[] };

export const SIGNAL_KEYS = [
  "political_content",
  "political_persuasion",
  "fear_framing",
  "anger_framing",
  "us_vs_them",
  "scapegoating",
  "urgency_language",
  "sensationalism",
  "conspiracy_framing",
  "factual_claim",
  "personal_attack",
  "dehumanizing_language",
  "engagement_bait",
  "commercial_persuasion",
  "possible_ai_slop",
  "synthetic_media",
] as const;

export type SignalKey = (typeof SIGNAL_KEYS)[number];

export interface Signal {
  key: SignalKey;
  /** probability / confidence, 0..1 */
  score: number;
  /** short quote or reason that triggered it (optional) */
  evidence?: string;
}

export type IntensityLevel = "none" | "low" | "medium" | "high";

/** All signals folded into one value: how heavily persuasion TECHNIQUES are used (not: how true / how bad). */
export interface OverallIntensity {
  level: IntensityLevel;
  /** 0..1 */
  score: number;
}

/** One moment in a video where a technique was detected in the spoken text ("00:04 Fear framing"). */
export interface TimelineEvent {
  /** seconds since the video started (from TranscriptChunk.t) */
  t: number;
  key: SignalKey;
  score: number;
  /** the spoken words that triggered it */
  evidence?: string;
}

export interface AnalysisResult {
  itemId: string;
  /** Overall level for a badge per post. Optional: older/partial results may not have it → UI must handle `undefined`. */
  overall?: OverallIntensity;
  /** Only signals that were evaluated. UI decides what to show based on score. */
  signals: Signal[];
  /** 1–2 neutral sentences for "Why am I seeing this?" */
  explanation?: string;
  /** Videos only: detected techniques in chronological order. Grows while the video plays. Optional → UI must handle `undefined`. */
  timeline?: TimelineEvent[];
  /** true while a video is still being analyzed live (more results will follow) */
  partial?: boolean;
  /**
   * How much of the item the analysis could actually see. Missing = "full".
   * "text_only": media present but not analyzed · "insufficient": too little text for any verdict.
   * The UI must never show a clean "✓" for "insufficient".
   */
  coverage?: "full" | "text_only" | "insufficient";
  /** "local" = offline engine in ai/ ("mock" kept for older results). */
  source: "mock" | "local" | "jev" | "vision" | "combined";
  latencyMs: number;
}

/** What the UI renders for one item. `progress` is only set for videos that are being listened to. */
export type OverlayState =
  | { status: "pending"; progress?: VideoProgress }
  | { status: "done"; result: AnalysisResult; progress?: VideoProgress }
  | { status: "error"; message: string };

export interface Settings {
  enabled: boolean;
  /** signals below this score are hidden by the UI */
  minScore: number;
  /** "local": nothing leaves the browser. "cloud": Jev (falls back to local if not configured). */
  mode?: "local" | "cloud";
  /** Dim (never hide) posts with overall level "high". */
  calmMode?: boolean;
}

export const DEFAULT_SETTINGS: Settings = { enabled: true, minScore: 0.5, mode: "local", calmMode: false };

// ── Feed statistics ("Feed Diet") ─────────────────────────────────────────────────────
// The background keeps one compact record per analyzed item (deduplicated by item id) and
// aggregates them on request. Only the popup dashboard reads this. Records never leave the browser.

/** One analyzed item, reduced to what the dashboard needs. Stored in chrome.storage.local. */
export interface ExposureRecord {
  itemId: string;
  platform: Platform;
  /** author handle, used for "top sources" */
  author: string;
  /** ms since epoch, when the item was first analyzed in this browser */
  t: number;
  level: IntensityLevel;
  /** overall score 0..1 */
  score: number;
  /** signal keys with score >= 0.5 */
  signals: SignalKey[];
  source: AnalysisResult["source"];
}

export type StatsWindow = "session" | "today" | "7d" | "all";

export interface FeedStats {
  window: StatsWindow;
  /** ms since epoch: start of the window that was actually applied */
  since: number;
  /** items analyzed in the window (deduplicated) */
  total: number;
  byLevel: Record<IntensityLevel, number>;
  /** items where the signal fired (>= 0.5), per signal key */
  bySignal: Partial<Record<SignalKey, number>>;
  /** items where at least one signal of the group fired */
  byGroup: Record<"political" | "rhetoric" | "credibility" | "synthetic", number>;
  byPlatform: Partial<Record<Platform, number>>;
  /** authors ranked by medium+high items, then by total items */
  topSources: { author: string; platform: Platform; items: number; flagged: number; topSignal?: SignalKey }[];
  /** share of items that were medium or high, 0..1 */
  flaggedShare: number;
}
