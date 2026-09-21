/**
 * Timestamped events for videos: WHEN was which technique used ("00:04 Fear framing").
 * Each finished sentence is scored on its own by the local engine — synchronous and free, so the
 * timeline can update on every chunk while the (slower, throttled) API scores the whole transcript.
 */
import type { FeedItem, SignalKey, TimelineEvent, TranscriptChunk } from "@contracts";
import { scoreSignals } from "./engine";

const MIN_SCORE = 0.5;
/** A topic, not a technique → would only add noise to the timeline. */
const SKIP = new Set<SignalKey>(["political_content"]);

export function buildTimeline(transcript: TranscriptChunk[]): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  const seen = new Set<string>();
  for (const chunk of transcript) {
    // Interim chunks still change while the person is speaking → only finished sentences create events.
    if (!chunk.isFinal || !chunk.text.trim()) continue;
    for (const s of scoreSignals({ kind: "post", item: sentenceItem(chunk) })) {
      if (s.score < MIN_SCORE || SKIP.has(s.key)) continue;
      const id = `${chunk.t}:${s.key}`;
      if (seen.has(id)) continue;
      seen.add(id);
      events.push({ t: chunk.t, key: s.key, score: s.score, evidence: s.evidence });
    }
  }
  return events.sort((a, b) => a.t - b.t || b.score - a.score);
}

function sentenceItem(chunk: TranscriptChunk): FeedItem {
  return { id: chunk.itemId, platform: "tiktok", author: { handle: "" }, text: chunk.text, hashtags: [], media: [], scrapedAt: 0 };
}
