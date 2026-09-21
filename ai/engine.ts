/**
 * Local scoring engine: raw FeedItem / transcript → one Signal (score 0..1 + evidence) per signal key.
 * Pure + synchronous, no network → used as the offline analyzer, as evidence provider for Jev
 * results, and as the fallback when Jev is unreachable.
 *
 * Pipeline:
 *   1. buildSegments()  raw data split by source, each with a trust weight        (state.ts)
 *   2. lexical cues     every cue hit contributes  cue.weight × segment.weight     (lexicon.ts)
 *   3. style features   things regex cues can't see: SHOUTING, list structure, hashtag spam
 *   4. noisy-OR         score = 1 − Π(1 − contribution) → several medium cues add up
 *   5. context rules    signals that depend on others (sourced claims, political persuasion)
 */
import { SIGNAL_KEYS, type AnalysisInput, type Signal, type SignalKey } from "@contracts";
import { LEXICON } from "./lexicon";
import { buildSegments, type Segment } from "./state";

/** The engine can't see images/video → it never claims anything about synthetic_media. */
const TEXT_SIGNALS = SIGNAL_KEYS.filter((k) => k !== "synthetic_media");

const FLOOR = 0.02;
const CEILING = 0.97;
/** The same cue firing again counts, but less: 2nd hit at half weight, further hits are ignored. */
const REPEAT_FACTORS = [1, 0.5];

interface Hit {
  contribution: number;
  evidence?: string;
}

export function scoreSignals(input: AnalysisInput): Signal[] {
  const segments = buildSegments(input);
  const hits = new Map<SignalKey, Hit[]>(TEXT_SIGNALS.map((k) => [k, []]));

  for (const key of TEXT_SIGNALS) {
    for (const cue of LEXICON[key] ?? []) {
      let n = 0;
      for (const seg of segments) {
        for (const m of seg.text.matchAll(cue.re)) {
          const factor = REPEAT_FACTORS[n++];
          if (factor === undefined) break;
          hits.get(key)!.push({ contribution: cue.weight * seg.weight * factor, evidence: snippet(seg.text, m.index ?? 0, m[0].length, key === "political_content" ? 0 : 2) });
        }
      }
    }
  }
  for (const seg of segments) styleFeatures(seg, hits);
  hashtagSpam(input, hits);

  const scores = new Map<SignalKey, number>();
  for (const key of TEXT_SIGNALS) scores.set(key, noisyOr(hits.get(key)!.map((h) => h.contribution)));
  contextRules(scores, segments);

  return TEXT_SIGNALS.map((key) => {
    const score = round(Math.max(FLOOR, Math.min(CEILING, scores.get(key)!)));
    const best = hits.get(key)!.reduce<Hit | undefined>((a, b) => (!a || b.contribution > a.contribution ? b : a), undefined);
    return { key, score, evidence: score >= 0.3 ? best?.evidence : undefined };
  });
}

// ── 3. style features ────────────────────────────────────────────────────────────────

function styleFeatures(seg: Segment, hits: Map<SignalKey, Hit[]>): void {
  if (seg.source === "hashtags") return;
  const add = (key: SignalKey, contribution: number, evidence?: string) => hits.get(key)!.push({ contribution: contribution * seg.weight, evidence });

  // SHOUTING: fully upper-case words (4+ letters, no hashtags/handles)
  const shouted = [...seg.text.matchAll(/(?<![#@\p{L}])\p{Lu}{4,}(?!\p{L})/gu)].map((m) => m[0]);
  if (shouted.length) add("sensationalism", shouted.length >= 3 ? 0.55 : shouted.length === 2 ? 0.4 : 0.25, shouted.slice(0, 3).join(" … "));

  // An emphasised THEY / THEM / SIE is a much stronger out-group marker than a plain pronoun
  const they = seg.text.match(/(?<!\p{L})(THEY|THEM|THEIR|DIE DA)(?!\p{L})/u);
  if (they) add("us_vs_them", 0.4, they[0]);

  // Listicle structure: 3+ lines that start with a number, bullet or emoji
  const bullets = seg.text.split("\n").filter((l) => /^\s*(?:\d+[.)]|[-•→✅🔹▪️]|\p{Extended_Pictographic})\s*\S/u.test(l)).length;
  if (bullets >= 3) add("possible_ai_slop", 0.4);
}

function hashtagSpam(input: AnalysisInput, hits: Map<SignalKey, Hit[]>): void {
  const tags = input.item.hashtags;
  if (tags.length >= 6) hits.get("engagement_bait")!.push({ contribution: tags.length >= 10 ? 0.5 : 0.35, evidence: tags.slice(0, 4).map((t) => "#" + t).join(" ") + " …" });
}

// ── 5. context rules ─────────────────────────────────────────────────────────────────

const SOURCE_MARKER = /https?:\/\/|\bwww\.|(?<!\p{L})(?:according to|source:|sources:|via @|study by|report by|reported by|data from|laut|quelle:|quellen:|studie (?:der|des|von))(?!\p{L})/iu;
const RHETORIC: SignalKey[] = ["fear_framing", "anger_framing", "us_vs_them", "scapegoating", "urgency_language"];

function contextRules(scores: Map<SignalKey, number>, segments: Segment[]): void {
  const get = (k: SignalKey) => scores.get(k) ?? 0;

  // "Unsupported factual claim": a claim that names a source or links somewhere is not unsupported.
  if (segments.some((s) => s.source !== "quoted" && SOURCE_MARKER.test(s.text))) {
    scores.set("factual_claim", get("factual_claim") * 0.35);
  }

  // "20% off" is a price, not a claim about the world.
  if (get("commercial_persuasion") >= 0.5) scores.set("factual_claim", get("factual_claim") * 0.4);

  // Political persuasion = explicit calls (own cues) OR political topic pushed with emotional rhetoric.
  const rhetoric = Math.max(...RHETORIC.map(get));
  scores.set("political_persuasion", noisyOr([get("political_persuasion"), get("political_content") * rhetoric * 0.9]));

  // Blaming an out-group for a threat: fear + out-group framing make a scapegoating hit more certain.
  if (get("scapegoating") >= 0.4 && get("us_vs_them") >= 0.5) {
    scores.set("scapegoating", noisyOr([get("scapegoating"), 0.3 * Math.max(get("fear_framing"), get("anger_framing"))]));
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────────────

function noisyOr(contributions: number[]): number {
  return 1 - contributions.reduce((p, c) => p * (1 - Math.max(0, Math.min(1, c))), 1);
}

const round = (n: number) => Math.round(n * 100) / 100;

const STOPWORDS = new Set("a an and are as at by for if in is of on or since so that the this to with you der die das und ist in zu von mit wenn".split(" "));

/** The matched words plus up to `tailWords` following words of the same clause → readable quote for the UI. */
function snippet(text: string, index: number, length: number, tailWords = 2): string {
  const rest = text.slice(index + length);
  const tail = (rest.match(/^(?:[ \t]+[^\s.,;:!?…"“”()#@]+){0,2}/u)?.[0] ?? "").trim().split(/\s+/).filter(Boolean).slice(0, tailWords);
  while (tail.length && STOPWORDS.has(tail.at(-1)!.toLowerCase())) tail.pop();
  const out = [text.slice(index, index + length).trim(), ...tail].join(" ");
  return out.length > 80 ? out.slice(0, 77) + "…" : out;
}
