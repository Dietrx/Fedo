/**
 * Offline keyword heuristics. Purpose: the scraper + UI devs get realistic-looking results
 * from minute one, without API keys. Not meant to be smart.
 */
import type { Analyzer, Signal, SignalKey } from "@contracts";
import { allText } from "./state";

const RULES: Partial<Record<SignalKey, RegExp>> = {
  political_content: /\b(government|election|vote|party|immigra\w*|minister|president|policy|left|right|regierung|wahl|partei)\b/i,
  fear_framing: /\b(destroy\w*|danger\w*|threat|invasion|collapse|attack|afraid|terror\w*)\b/i,
  anger_framing: /\b(disgusting|outrage\w*|shame|furious|betray\w*)\b/i,
  us_vs_them: /\b(they|them|these people|our country|real \w+s)\b/i,
  urgency_language: /\b(share before|act now|right now|before (it'?s|this gets) deleted|wake up)\b/i,
  sensationalism: /(🤯|!!|\bshocking\b|\bunbelievable\b|\b[A-Z]{5,}\b)/,
  conspiracy_framing: /\b(won'?t tell you|don'?t want you to know|hiding|cover.?up|lying to you|mainstream media)\b/i,
  factual_claim: /\b\d+(\.\d+)?\s?%|\b\d{2,}\s?(people|times|million|billion)\b/i,
  engagement_bait: /\b(like and (rt|share)|rt if|follow for|comment below|🧵)\b/i,
  possible_ai_slop: /\b(in today'?s fast.paced world|game.changing|unlock(ing)? your|delve|here are \d+ tips)\b/i,
  commercial_persuasion: /\b(link in bio|discount|use code|buy now|sponsored)\b/i,
};

export function createMockAnalyzer(): Analyzer {
  return {
    async analyze(input) {
      const t0 = Date.now();
      const text = allText(input);
      const signals: Signal[] = [];
      for (const [key, re] of Object.entries(RULES) as [SignalKey, RegExp][]) {
        const m = text.match(re);
        signals.push({ key, score: m ? 0.7 + ((m[0].length * 7) % 25) / 100 : 0.05, evidence: m?.[0] });
      }
      await new Promise((r) => setTimeout(r, 80 + Math.random() * 200)); // simulate latency
      const hits = signals.filter((s) => s.score > 0.5).length;
      return {
        itemId: input.item.id,
        signals,
        explanation: hits ? `Mock analysis: ${hits} persuasion/credibility signal(s) found by keyword rules.` : undefined,
        partial: input.kind === "transcript" && !input.transcript.at(-1)?.isFinal,
        source: "mock",
        latencyMs: Date.now() - t0,
      };
    },
  };
}
