/**
 * Adds eyes to any analyzer (local, Jev, LLM).
 *
 *   text analysis ──┐ start together: a post without text in its picture costs no extra time
 *   vision ─────────┤
 *                   └─ picture contains real text → analyze once more WITH that text
 *                      (it is part of the message: memes, overlaid headlines, screenshots)
 *
 * Then: `synthetic_media` signal from the vision score, overall + explanation rebuilt,
 * source "combined", and coverage "full" when every picture of an image post was looked at.
 */
import type { AnalysisInput, AnalysisResult, Analyzer, Signal } from "@contracts";
import { overall } from "./assess";
import { MIN_WORDS, coverageOf } from "./coverage";
import { buildExplanation } from "./explain";
import type { SeenItem } from "./state";
import type { Vision, VisionResult } from "./vision";

/** Below this the picture has no message of its own (a logo, a street sign) → not worth a second pass. */
const MIN_IMAGE_WORDS = MIN_WORDS;
/**
 * Vision latency varies a lot by provider (measured 1–14 s). A post never waits longer than this for its
 * picture: after that the text-only result is shown (coverage stays "text_only"). The answer still lands in
 * the vision cache, so the next analysis of the same picture gets it for free.
 */
const VISION_WAIT_MS = 6_000;

export function withVision(inner: Analyzer, vision?: Vision): Analyzer {
  if (!vision) return inner;
  return {
    async analyze(input) {
      const looking = vision.look(input.item);
      const blind = inner.analyze(input);
      const seen = await Promise.race([looking, new Promise<undefined>((r) => setTimeout(() => r(undefined), VISION_WAIT_MS))]);
      if (!seen) return blind;

      const hasMessage = wordsIn(seen.text) >= MIN_IMAGE_WORDS;
      const item: SeenItem = { ...input.item, imageText: hasMessage ? calm(seen.text) : undefined, imageDescription: seen.description || undefined };
      // The blind result is only good enough if the picture says nothing. Otherwise score again with the image text.
      const base = hasMessage ? await inner.analyze({ ...input, item } as AnalysisInput) : await blind;
      return merge(base, seen, input, hasMessage);
    },
  };
}

function merge(base: AnalysisResult, seen: VisionResult, input: AnalysisInput, hasMessage: boolean): AnalysisResult {
  const synthetic: Signal = { key: "synthetic_media", score: seen.synthetic, evidence: seen.syntheticReason };
  const signals = [...base.signals.filter((s) => s.key !== "synthetic_media"), synthetic];
  const changed = synthetic.score >= 0.5;
  const onlyImages = input.item.media.every((m) => m.type === "image");
  return {
    ...base,
    signals,
    // A visible "signs of AI generation" hit is a driver like any other → level and explanation must include it.
    overall: changed ? overall(signals) : base.overall,
    explanation: changed ? buildExplanation(signals, input.kind === "transcript") : base.explanation,
    source: "combined",
    // Videos: we saw one still frame, not the video → coverage stays whatever the text/speech side says.
    coverage: onlyImages && seen.seen >= input.item.media.length ? "full" : hasMessage && coverageOf(input) === "insufficient" ? "text_only" : base.coverage,
  };
}

/**
 * Meme and poster text is set in capitals by convention, not to shout. Left as it is, every meme would
 * score as "sensational language". Mostly-uppercase image text is therefore brought to sentence case.
 */
function calm(text: string): string {
  const letters = text.replace(/[^\p{L}]/gu, "");
  const upper = letters.replace(/[^\p{Lu}]/gu, "").length;
  if (letters.length < 8 || upper / letters.length < 0.7) return text;
  return text.toLowerCase().replace(/(^|[.!?…]\s+)(\p{L})/gu, (_, lead: string, first: string) => lead + first.toUpperCase()).replace(/\bi\b/g, "I");
}

const wordsIn = (t: string) => t.split(/\s+/).filter((w) => /\p{L}{2,}/u.test(w)).length;
