/**
 * Overall assessment: folds the per-signal scores into ONE intensity level per post.
 *
 * Not every technique weighs the same: dehumanizing language or scapegoating matter far more than
 * a "like and RT". `SEVERITY` declares that ranking. A signal only counts once it is likely
 * present (≥ COUNT_FROM), and several techniques stack (noisy-OR with diminishing returns), so a post that combines
 * fear + out-group + conspiracy framing ends up higher than one with a single loud signal.
 *
 * Wording principle: this measures how heavily persuasion TECHNIQUES are used —
 * it says nothing about whether the message is true or what the author intends.
 */
import type { IntensityLevel, OverallIntensity, Signal, SignalKey } from "@contracts";

export interface Assessment extends OverallIntensity {
  /** Signals that counted, strongest contribution first */
  drivers: Signal[];
}

export const SEVERITY: Record<SignalKey, number> = {
  dehumanizing_language: 1,
  scapegoating: 0.9,
  conspiracy_framing: 0.75,
  fear_framing: 0.7,
  us_vs_them: 0.7,
  anger_framing: 0.65,
  personal_attack: 0.65,
  synthetic_media: 0.6,
  factual_claim: 0.55,
  political_persuasion: 0.5,
  urgency_language: 0.5,
  sensationalism: 0.4,
  possible_ai_slop: 0.35,
  engagement_bait: 0.3,
  commercial_persuasion: 0.3,
  // A topic, not a technique → talking about politics alone must never raise the level.
  political_content: 0,
};

const COUNT_FROM = 0.5;
/** Calibrated on ai/dev/cases.ts for BOTH analyzers (local scores run lower than Jev's). Re-run the eval after changing. */
const HIGH_FROM = 0.82;
const MEDIUM_FROM = 0.45;
const RANK_DECAY = [1, 0.6, 0.4, 0.3];
const RANK_DECAY_REST = 0.2;

export function assess(signals: Signal[]): Assessment {
  const drivers = signals
    .filter((s) => s.score >= COUNT_FROM && SEVERITY[s.key] > 0)
    .sort((a, b) => b.score * SEVERITY[b.key] - a.score * SEVERITY[a.key]);
  // Diminishing returns: the strongest technique counts fully, each further one less. Without this,
  // a handful of medium signals (which tend to fire together) would push almost any post to "high".
  const score = 1 - drivers.reduce((p, s, i) => p * (1 - s.score * SEVERITY[s.key] * (RANK_DECAY[i] ?? RANK_DECAY_REST)), 1);
  const level: IntensityLevel = !drivers.length ? "none" : score >= HIGH_FROM ? "high" : score >= MEDIUM_FROM ? "medium" : "low";
  return { level, score: Math.round(score * 100) / 100, drivers };
}

/** The part of the assessment that goes to the UI (`AnalysisResult.overall`). */
export function overall(signals: Signal[]): OverallIntensity {
  const { level, score } = assess(signals);
  return { level, score };
}
