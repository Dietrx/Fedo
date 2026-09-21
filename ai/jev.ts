/**
 * Jev (TypeSafe) client via the OpenRouter Decisions API.
 *
 *   FEDO_ANALYZER=jev
 *   JEV_API_URL=https://openrouter.ai/api/alpha/decisions      (optional model override: …/decisions#typesafe/jev-1.13)
 *   JEV_API_KEY=sk-or-...
 *
 * Jev is a decision model, not a chat model: we send ONE state plus one Noul (yes/no) question per
 * signal and get a calibrated probability per question back. It does not write text, so evidence
 * quotes and the explanation come from the local engine / explain.ts.
 * Docs: https://openrouter.ai/docs/api/api-reference/alphadecisions/submit-a-decisions-questions-and-answers-request
 *       https://docs.typesafe.ai/primitives/noul
 *
 * Next steps (AI dev):
 *  - STT for videos (tab audio → streaming transcript) → produce `kind: "transcript"` inputs
 *  - vision/deepfake branch → fill `synthetic_media`, source: "combined"
 */
import type { Analyzer, Signal, SignalKey } from "@contracts";
import { overall } from "./assess";
import { scoreSignals } from "./engine";
import { buildExplanation } from "./explain";
import { analyzeLocally, isPartial } from "./mock";
import { JEV_KEYS, JEV_QUESTIONS } from "./questions";
import { buildStateObject } from "./state";

const DEFAULT_MODEL = "typesafe/jev-1.13";
const TIMEOUT_MS = 8_000;

export function createJevAnalyzer(apiUrl: string, apiKey: string): Analyzer {
  const [endpoint = apiUrl, fragment] = apiUrl.split("#");
  const model = fragment || DEFAULT_MODEL;

  return {
    async analyze(input) {
      const t0 = Date.now();
      let scores: Partial<Record<SignalKey, number>>;
      try {
        scores = await callJev(endpoint, apiKey, model, buildStateObject(input));
      } catch (e) {
        console.warn("[fedo:ai] Jev failed → local engine result:", e instanceof Error ? e.message : e);
        return analyzeLocally(input, t0);
      }
      // Jev returns probabilities only → the quote that explains a score comes from the local engine.
      const local = new Map(scoreSignals(input).map((l) => [l.key, l]));
      const signals: Signal[] = JEV_KEYS.map((key) => {
        const score = round(fuse(key, clamp(scores[key] ?? 0), local.get(key)?.score ?? 0, Boolean(input.item.quotedText)));
        return { key, score, evidence: score >= 0.3 ? local.get(key)?.evidence : undefined };
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

/**
 * Signals that are DEFINED by surface patterns (a number without a source, a discount code, "like and RT").
 * Measured on ai/dev/cases.ts: Jev over-fires on these (any declarative sentence looks like a "factual claim"),
 * while the local cues are precise. So both have to agree: without local support the Jev score is
 * scaled to below the 0.5 display threshold.
 */
const PATTERN_SIGNALS = new Set<SignalKey>(["factual_claim", "commercial_persuasion", "engagement_bait", "possible_ai_slop"]);

function fuse(key: SignalKey, jev: number, local: number, hasQuote: boolean): number {
  let score = jev;
  if (PATTERN_SIGNALS.has(key)) score = jev * (0.45 + 0.55 * Math.min(1, local / 0.5));
  // The quoted post is not part of the Jev state (Jev can't weigh it down as "someone else's words").
  // The local engine scores it at reduced weight → take that if it is higher.
  if (hasQuote) score = Math.max(score, local);
  return score;
}

interface DecisionsResponse {
  answers?: Record<string, { type: string; noul?: number }>;
  error?: { message?: string };
}

/** One request, all questions: every Noul is evaluated independently against the same state. */
async function callJev(endpoint: string, apiKey: string, model: string, state: Record<string, unknown>): Promise<Partial<Record<SignalKey, number>>> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}`, "X-Title": "Fedo Shield" },
    body: JSON.stringify({ model, state, questions: JEV_QUESTIONS }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Jev ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as DecisionsResponse;
  if (!json.answers) throw new Error(`Jev returned no answers: ${json.error?.message ?? "unknown"}`);
  const scores: Partial<Record<SignalKey, number>> = {};
  for (const key of JEV_KEYS) {
    const noul = json.answers[key]?.noul;
    if (typeof noul === "number") scores[key] = noul;
  }
  return scores;
}

const round = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0);
