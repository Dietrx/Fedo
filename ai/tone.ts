/**
 * Tone: is the post meant seriously? Turns the three context answers from Jev into decisions.
 *
 *  - playful  = humor without a real group as target (absurd jokes, Onion-style headlines, cat memes).
 *               Literal readings ("DESTROY EVERYTHING", "like an insane animal") are not techniques
 *               there → sincerity-dependent signals are scaled down.
 *  - humor AT a real group is NOT playful: "just joking" is a classic cover for dehumanizing or
 *               scapegoating, so those scores stay untouched and the explanation says so.
 *  - sarcasm  changes nothing about the scores (mock praise of "our genius government" is still
 *               persuasion), it is only named, because the quoted words mean the opposite.
 */
import type { OverallIntensity, SignalKey } from "@contracts";
import type { ToneKey } from "./questions";

export interface Tone {
  humor: number;
  sarcasm: number;
  targetsGroup: number;
}

const HUMOR_FROM = 0.6;
const SARCASM_FROM = 0.7;
const GROUP_FROM = 0.5;
/** At humor = 1 a playful post keeps this share of a sincerity-dependent score. */
const PLAYFUL_KEEP = 0.35;
const HUMOR_MAX_SCORE = 0.8;

/** These describe form or topic, not a sincere attempt to persuade → a joke doesn't change them. */
const TONE_INDEPENDENT = new Set<SignalKey>(["political_content", "commercial_persuasion", "engagement_bait", "possible_ai_slop"]);

export function toneFrom(answers: Partial<Record<ToneKey, number>>): Tone | undefined {
  if (answers.humor === undefined) return undefined;
  return { humor: answers.humor, sarcasm: answers.sarcasm ?? 0, targetsGroup: answers.targets_group ?? 0 };
}

export const isPlayful = (tone?: Tone) => Boolean(tone && tone.humor >= HUMOR_FROM && tone.targetsGroup < GROUP_FROM);

export function applyTone(key: SignalKey, score: number, tone?: Tone): number {
  if (!tone || !isPlayful(tone) || TONE_INDEPENDENT.has(key)) return score;
  return score * (1 - (1 - PLAYFUL_KEEP) * tone.humor);
}

/** One neutral sentence for the explanation, or undefined when the post reads as sincere. */
export function toneNote(tone?: Tone): string | undefined {
  if (!tone) return undefined;
  if (tone.humor >= HUMOR_FROM) {
    return tone.targetsGroup >= GROUP_FROM
      ? "This reads as humor or satire aimed at a group of people; the techniques are described as worded."
      : "This reads as humor or satire, so the wording is probably not meant literally.";
  }
  if (tone.sarcasm >= SARCASM_FROM) return "The author uses sarcasm, so quoted praise is meant as criticism.";
  return undefined;
}

/**
 * Recognised humor never ends up "high", even when it names real groups (satire bots, cabaret).
 * Hate dressed up as a joke is unaffected: Jev does not rate that as humor in the first place.
 */
export function capForHumor(overall: OverallIntensity, tone?: Tone): OverallIntensity {
  if (!tone || tone.humor < HUMOR_FROM || overall.level !== "high") return overall;
  return { level: "medium", score: Math.min(overall.score, HUMOR_MAX_SCORE) };
}
