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
import type { AnalysisInput, Analyzer, FeedItem, Signal, SignalKey, TimelineEvent, TranscriptChunk } from "@contracts";
import { overall } from "./assess";
import { MIN_WORDS, wordCount } from "./coverage";
import { scoreSignals } from "./engine";
import { buildExplanation } from "./explain";
import { analyzeLocally, isPartial } from "./mock";
import { JEV_KEYS, JEV_QUESTIONS, TONE_QUESTIONS, type NoulQuestion, type ToneKey } from "./questions";
import { buildStateObject } from "./state";
import { applyTone, capForHumor, toneFrom, toneNote } from "./tone";

const DEFAULT_MODEL = "typesafe/jev-1.13";
const TIMEOUT_MS = 8_000;

export function createJevAnalyzer(apiUrl: string, apiKey: string): Analyzer {
  const [endpoint = apiUrl, fragment] = apiUrl.split("#");
  const model = fragment || DEFAULT_MODEL;

  /** Sentence scores per video (a sentence never changes once final). Oldest video is dropped first. */
  const memos = new Map<string, Map<string, Answers>>();
  function memoFor(itemId: string): Map<string, Answers> {
    const memo = memos.get(itemId) ?? new Map<string, Answers>();
    memos.delete(itemId);
    memos.set(itemId, memo);
    if (memos.size > MAX_MEMO_VIDEOS) memos.delete(memos.keys().next().value!);
    return memo;
  }
  async function scoreSentence(text: string, memo?: Map<string, Answers>): Promise<Answers> {
    const known = memo?.get(text);
    if (known) return known;
    const answers = await callJev(endpoint, apiKey, model, { post_text: text }, JEV_QUESTIONS);
    memo?.set(text, answers);
    return answers;
  }

  return {
    async analyze(input) {
      const t0 = Date.now();
      let scores: Answers;
      // Whole post and every sentence go out in parallel → sentence scores cost no extra latency.
      // Posts: split the text. Videos: every finished transcript chunk IS a sentence; its scores are cached,
      // so each update only pays for the sentences that are new.
      const spoken = input.kind === "transcript" ? input.transcript.filter((c) => c.isFinal && isSentence(c.text)) : [];
      const sentences = input.kind === "post" ? splitSentences(input.item.text) : spoken.map((c) => c.text);
      const memo = input.kind === "transcript" ? memoFor(input.item.id) : undefined;
      const perSentence = Promise.allSettled(sentences.map((text) => scoreSentence(text, memo)));
      try {
        scores = await callJev(endpoint, apiKey, model, buildStateObject(input), WHOLE_POST_QUESTIONS);
      } catch (e) {
        console.warn("[fedo:ai] Jev failed → local engine result:", e instanceof Error ? e.message : e);
        return analyzeLocally(input, t0);
      }
      const located = locate(sentences, await perSentence);
      const tone = toneFrom(scores);

      const local = new Map(scoreSignals(input).map((l) => [l.key, l]));
      const thin = wordCount(input) < MIN_WORDS;
      const signals: Signal[] = JEV_KEYS.map((key) => {
        const loc = located.get(key);
        let score = clamp(scores[key] ?? 0);
        // A technique has to be locatable: if no single sentence shows it, the whole-post score is mostly
        // "mood" spilling over from the other signals (measured on real feeds) → pull it down.
        if (loc && sentences.length >= 2) score = Math.min(score, loc.score + LOCATE_MARGIN);
        // Hashtag-only / two-word posts give the model nothing to judge → it needs local support there.
        if (thin && key !== "political_content" && (local.get(key)?.score ?? 0) < 0.3) score *= 0.5;
        score = applyTone(key, score, tone);
        score = round(fuse(key, score, local.get(key)?.score ?? 0, Boolean(input.item.quotedText)));
        // Quote: the precise local phrase if there is one, else the sentence Jev itself rated highest.
        const evidence = local.get(key)?.evidence ?? (loc && loc.score >= 0.5 ? loc.quote : undefined);
        return { key, score, evidence: score >= 0.3 ? evidence : undefined };
      });
      return {
        itemId: input.item.id,
        signals,
        timeline: memo ? spokenTimeline(spoken, memo) : undefined,
        overall: capForHumor(overall(signals), tone),
        explanation: buildExplanation(signals, input.kind === "transcript", toneNote(tone)),
        partial: isPartial(input),
        source: "jev",
        latencyMs: Date.now() - t0,
      };
    },
  };
}

const LOCATE_MARGIN = 0.25;
const MAX_SENTENCES = 6;
const MAX_MEMO_VIDEOS = 30;
/** Timeline: a sentence must show the technique clearly, and at most this many techniques per sentence. */
const TIMELINE_FROM = 0.6;
const TIMELINE_PER_SENTENCE = 2;
const MAX_QUOTE = 90;

/** Worth scoring on its own: real words, not just links or hashtags. */
const isSentence = (t: string) => t.replace(/https?:\/\/\S+|[#@][\p{L}\p{N}_.]+/gu, "").split(/\s+/).filter((w) => /\p{L}{2,}/u.test(w)).length >= 3;

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?…])\s+|\n+/u)
    .map((t) => t.trim())
    .filter(isSentence)
    .slice(0, MAX_SENTENCES);
}

const BLANK_ITEM: FeedItem = { id: "", platform: "tiktok", author: { handle: "" }, text: "", hashtags: [], media: [], scrapedAt: 0 };

/** Videos: WHEN was which technique spoken, judged by Jev sentence by sentence (the local lexicon rarely matches real speech). */
function spokenTimeline(spoken: TranscriptChunk[], memo: Map<string, Answers>): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  for (const chunk of spoken) {
    const answers = memo.get(chunk.text);
    if (!answers) continue;
    // Same rule as for the whole post: pattern-defined signals need the local engine to agree.
    const local = new Map(scoreSignals({ kind: "post", item: { ...BLANK_ITEM, text: chunk.text } }).map((l) => [l.key, l.score]));
    JEV_KEYS.map((key) => ({ key, score: fuse(key, answers[key] ?? 0, local.get(key) ?? 0, false) }))
      .filter((e) => e.key !== "political_content" && e.score >= TIMELINE_FROM)
      .sort((a, b) => b.score - a.score)
      .slice(0, TIMELINE_PER_SENTENCE)
      .forEach((e) => events.push({ t: chunk.t, key: e.key, score: round(e.score), evidence: shorten(chunk.text) }));
  }
  return events;
}

/** Per signal: the sentence with the highest score (→ evidence quote + "is it locatable at all?"). */
function locate(sentences: string[], results: PromiseSettledResult<Answers>[]): Map<SignalKey, { score: number; quote: string }> {
  const best = new Map<SignalKey, { score: number; quote: string }>();
  // If any sentence call failed we can't tell "not locatable" from "not measured" → no locatability data at all.
  if (!sentences.length || results.some((r) => r.status === "rejected")) return best;
  results.forEach((r, i) => {
    if (r.status !== "fulfilled") return;
    for (const key of JEV_KEYS) {
      const score = r.value[key] ?? 0;
      if (score > (best.get(key)?.score ?? -1)) best.set(key, { score, quote: shorten(sentences[i]!) });
    }
  });
  return best;
}

const shorten = (t: string) => (t.length > MAX_QUOTE ? t.slice(0, MAX_QUOTE - 1).trimEnd() + "…" : t);

/**
 * Signals that are DEFINED by surface patterns (a number without a source, a discount code, "like and RT").
 * Measured on ai/dev/cases.ts: Jev over-fires on these (any declarative sentence looks like a "factual claim"),
 * while the local cues are precise. So both have to agree: without local support the Jev score is
 * scaled to below the 0.5 display threshold.
 */
const PATTERN_SIGNALS = new Set<SignalKey>(["factual_claim", "engagement_bait", "possible_ai_slop"]);

function fuse(key: SignalKey, jev: number, local: number, hasQuote: boolean): number {
  let score = jev;
  if (PATTERN_SIGNALS.has(key)) score = jev * (0.45 + 0.55 * Math.min(1, local / 0.5));
  // The quoted post is not part of the Jev state (Jev can't weigh it down as "someone else's words").
  // The local engine scores it at reduced weight → take that if it is higher.
  if (hasQuote) score = Math.max(score, local);
  return score;
}

type Answers = Partial<Record<SignalKey | ToneKey, number>>;

/** Tone is a property of the whole post → only asked there, sentences get the signal questions only. */
const WHOLE_POST_QUESTIONS: Record<string, NoulQuestion> = { ...JEV_QUESTIONS, ...TONE_QUESTIONS };

interface DecisionsResponse {
  answers?: Record<string, { type: string; noul?: number }>;
  error?: { message?: string };
}

/** One request, all questions: every Noul is evaluated independently against the same state. */
async function callJev(endpoint: string, apiKey: string, model: string, state: Record<string, unknown>, questions: Record<string, NoulQuestion>): Promise<Answers> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}`, "X-Title": "Fedo Shield" },
    body: JSON.stringify({ model, state, questions }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Jev ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as DecisionsResponse;
  if (!json.answers) throw new Error(`Jev returned no answers: ${json.error?.message ?? "unknown"}`);
  const scores: Answers = {};
  for (const key of Object.keys(questions) as (SignalKey | ToneKey)[]) {
    const noul = json.answers[key]?.noul;
    if (typeof noul === "number") scores[key] = noul;
  }
  return scores;
}

const round = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0);
