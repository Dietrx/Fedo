/**
 * How much of the item the analysis could actually see (`AnalysisResult.coverage`).
 *  - "insufficient": fewer than MIN_WORDS real words → no verdict possible. The UI must not show a clean "✓".
 *  - "text_only":    the item has images/video we did not look at, and no spoken text either.
 *  - "full":         text-only posts, and videos whose speech we have (captions or transcript).
 * Applied to every analyzer in index.ts, so local, Jev and LLM results all carry it.
 */
import type { AnalysisInput, AnalysisResult, Analyzer } from "@contracts";
import { captionsOf } from "./state";

export const MIN_WORDS = 4;

/** Real words only: links, #hashtags and @mentions tell the analyzer nothing about wording. */
export function wordCount(input: AnalysisInput): number {
  const spoken = input.kind === "transcript" ? input.transcript.map((c) => c.text).join(" ") : "";
  const text = [input.item.text, captionsOf(input), spoken, input.item.quotedText].filter(Boolean).join(" ");
  return text
    .replace(/https?:\/\/\S+|[#@][\p{L}\p{N}_.]+/gu, "")
    .split(/\s+/)
    .filter((w) => /\p{L}{2,}/u.test(w)).length;
}

export function coverageOf(input: AnalysisInput): NonNullable<AnalysisResult["coverage"]> {
  if (wordCount(input) < MIN_WORDS) return "insufficient";
  const heard = input.kind === "transcript" || Boolean(input.item.captions);
  const hasVideo = input.item.media.some((m) => m.type !== "image");
  const hasImage = input.item.media.some((m) => m.type === "image" && !m.altText);
  if ((hasVideo && !heard) || hasImage) return "text_only";
  return "full";
}

export function withCoverage(inner: Analyzer): Analyzer {
  return {
    async analyze(input) {
      const result = await inner.analyze(input);
      return { ...result, coverage: result.coverage ?? coverageOf(input) };
    },
  };
}
