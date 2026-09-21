/**
 * Live video support, wrapped around any analyzer (local, Jev, LLM).
 *
 * The glue calls `analyze({ kind: "transcript" })` for EVERY transcript chunk, with the whole
 * transcript so far. Interim STT chunks arrive several times per second, an API call takes ~0.5 s.
 * Without care that means wasted calls and, worse, an old slow answer overwriting a newer one.
 *
 * Per video this wrapper guarantees:
 *   - at most ONE request in flight, and at most one every MIN_INTERVAL_MS
 *   - calls that arrive meanwhile are coalesced: only the LATEST transcript is analyzed,
 *     and everyone who was waiting gets that same, newest result (→ results never go backwards)
 *   - an unchanged transcript is answered from memory
 *   - every result carries the `timeline` (timestamped events, computed locally → free and instant)
 */
import type { AnalysisInput, AnalysisResult, Analyzer } from "@contracts";
import { isPartial } from "./mock";
import { buildTimeline } from "./timeline";

type TranscriptInput = Extract<AnalysisInput, { kind: "transcript" }>;

const MIN_INTERVAL_MS = 750;
/** Finished videos are forgotten once this many newer ones were seen (a feed is endless). */
const MAX_TRACKED_VIDEOS = 50;

interface Waiter {
  resolve(result: AnalysisResult): void;
  reject(error: unknown): void;
}

interface VideoState {
  latest?: TranscriptInput;
  waiters: Waiter[];
  running: boolean;
  lastStart: number;
  last?: { text: string; result: AnalysisResult };
}

export function withLiveVideo(inner: Analyzer): Analyzer {
  const videos = new Map<string, VideoState>();

  function stateFor(itemId: string): VideoState {
    let state = videos.get(itemId);
    if (state) videos.delete(itemId); // re-insert → Map order = least recently used first
    else state = { waiters: [], running: false, lastStart: 0 };
    videos.set(itemId, state);
    for (const [key, other] of videos) {
      if (videos.size <= MAX_TRACKED_VIDEOS) break;
      if (!other.running) videos.delete(key);
    }
    return state;
  }

  /** One loop per video: runs strictly one request after the other until no newer transcript is waiting. */
  async function drain(state: VideoState): Promise<void> {
    state.running = true;
    try {
      while (state.latest) {
        const wait = state.lastStart + MIN_INTERVAL_MS - Date.now();
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        // Take the newest transcript only now → everything that arrived while we waited is included.
        const input = state.latest;
        const waiters = state.waiters;
        state.latest = undefined;
        state.waiters = [];
        state.lastStart = Date.now();
        try {
          const result = decorate(await inner.analyze(input), input);
          state.last = { text: textOf(input), result };
          for (const w of waiters) w.resolve(result);
        } catch (e) {
          for (const w of waiters) w.reject(e);
        }
      }
    } finally {
      state.running = false;
    }
  }

  return {
    async analyze(input) {
      if (input.kind !== "transcript") return inner.analyze(input);
      const state = stateFor(input.item.id);
      if (state.last?.text === textOf(input)) return decorate(state.last.result, input);

      state.latest = input;
      const result = new Promise<AnalysisResult>((resolve, reject) => state.waiters.push({ resolve, reject }));
      if (!state.running) void drain(state);
      return result;
    },
  };
}

function decorate(result: AnalysisResult, input: TranscriptInput): AnalysisResult {
  return { ...result, timeline: buildTimeline(input.transcript), partial: isPartial(input) };
}

const textOf = (input: TranscriptInput) => input.transcript.map((c) => c.text).join(" ");
