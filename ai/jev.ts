/**
 * Jev (TypeSafe) client — SKELETON. The AI dev fills in the real request/response format
 * from the TypeSafe docs. Everything around it (state building, signal questions, result
 * mapping) is already wired, so only `callJev` should need changes.
 *
 * Next steps (AI dev):
 *  - real Jev request/response shape in `callJev`
 *  - STT for videos (tab audio → streaming transcript) → produce `kind: "transcript"` inputs
 *  - vision/deepfake branch → fill `synthetic_media`, source: "combined"
 */
import { SIGNAL_KEYS, SIGNALS, type Analyzer, type Signal, type SignalKey } from "@contracts";
import { buildState } from "./state";
import { buildExplanation } from "./explain";
import { overall } from "./assess";
import { scoreSignals } from "./engine";
import { analyzeLocally, isPartial } from "./mock";

interface JevDecision {
  key: SignalKey;
  question: string;
}

const DECISIONS: JevDecision[] = SIGNAL_KEYS.filter((k) => k !== "synthetic_media").map((key) => ({
  key,
  question: SIGNALS[key].question,
}));

export function createJevAnalyzer(apiUrl: string, apiKey: string): Analyzer {
  return {
    async analyze(input) {
      const t0 = Date.now();
      // The local engine always runs: it provides the evidence quotes, and the result if Jev fails.
      const local = scoreSignals(input);
      let scores: Partial<Record<SignalKey, number>>;
      try {
        scores = await callJev(apiUrl, apiKey, buildState(input), DECISIONS);
      } catch (e) {
        console.warn("[fedo:ai] Jev failed → local engine result:", e);
        return analyzeLocally(input, t0);
      }
      const signals: Signal[] = DECISIONS.map((d) => {
        const score = clamp(scores[d.key] ?? 0);
        return { key: d.key, score, evidence: score >= 0.3 ? local.find((l) => l.key === d.key)?.evidence : undefined };
      });
      return {
        itemId: input.item.id,
        signals,
        overall: overall(signals),
        explanation: buildExplanation(signals, input.kind === "transcript"),
        partial: isPartial(input),
        source: "jev",
        latencyMs: Date.now() - t0,
      };
    },
  };
}

/** TODO: adapt to the real Jev API. Must return a probability 0..1 per decision key. */
async function callJev(apiUrl: string, apiKey: string, state: string, decisions: JevDecision[]): Promise<Partial<Record<SignalKey, number>>> {
  const res = await fetch(apiUrl, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      state,
      decisions: decisions.map((d) => ({ name: d.key, question: d.question, type: "probability" })),
    }),
  });
  if (!res.ok) throw new Error(`Jev ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { decisions?: Record<string, number> };
  return (json.decisions ?? {}) as Partial<Record<SignalKey, number>>;
}

const clamp = (n: number) => Math.max(0, Math.min(1, n));
