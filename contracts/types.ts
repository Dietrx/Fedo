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
  source: "mock" | "jev" | "vision" | "combined";
  latencyMs: number;
}

/** What the UI renders for one item. */
export type OverlayState =
  | { status: "pending" }
  | { status: "done"; result: AnalysisResult }
  | { status: "error"; message: string };

export interface Settings {
  enabled: boolean;
  /** signals below this score are hidden by the UI */
  minScore: number;
}

export const DEFAULT_SETTINGS: Settings = { enabled: true, minScore: 0.5 };
