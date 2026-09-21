/**
 * Offline analyzer (mode "mock"): no API key, no network. Runs the local scoring engine
 * (engine.ts + lexicon.ts), so scraper + UI devs get realistic results from minute one
 * and the demo still works when Jev is unreachable.
 */
import type { AnalysisInput, AnalysisResult, Analyzer } from "@contracts";
import { scoreSignals } from "./engine";
import { buildExplanation } from "./explain";

export function analyzeLocally(input: AnalysisInput, t0 = Date.now()): AnalysisResult {
  const signals = scoreSignals(input);
  return {
    itemId: input.item.id,
    signals,
    explanation: buildExplanation(signals, input.kind === "transcript"),
    partial: isPartial(input),
    source: "mock",
    latencyMs: Date.now() - t0,
  };
}

/** A video is still "live" while its latest transcript chunk is not final. */
export function isPartial(input: AnalysisInput): boolean {
  return input.kind === "transcript" && !input.transcript.at(-1)?.isFinal;
}

export function createMockAnalyzer(): Analyzer {
  return {
    async analyze(input) {
      return analyzeLocally(input);
    },
  };
}
