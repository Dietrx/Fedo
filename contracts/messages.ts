/**
 * Messages between content script and background service worker (glue layer only).
 * The individual paths don't need to care about this.
 */
import type { AnalysisInput, AnalysisResult, AudioChunk, ExposureRecord, FeedStats, Settings, StatsWindow, TranscriptionResult } from "./types";

export type Request =
  | { type: "fedo/analyze"; input: AnalysisInput }
  /** Speech-to-text for a captured piece of video audio (keys live in the background). */
  | { type: "fedo/transcribe"; chunk: AudioChunk }
  | { type: "fedo/getSettings" }
  | { type: "fedo/setSettings"; settings: Partial<Settings> }
  /** Aggregated feed statistics for the popup dashboard. */
  | { type: "fedo/getStats"; window: StatsWindow }
  /** Raw records, e.g. for the "export my data" button. */
  | { type: "fedo/getRecords" }
  | { type: "fedo/clearStats" };

export type Response<T> = { ok: true; data: T } | { ok: false; error: string };

export interface ResponseMap {
  "fedo/analyze": AnalysisResult;
  "fedo/transcribe": TranscriptionResult;
  "fedo/getSettings": Settings;
  "fedo/setSettings": Settings;
  "fedo/getStats": FeedStats;
  "fedo/getRecords": ExposureRecord[];
  "fedo/clearStats": { cleared: number };
}

export async function send<R extends Request>(req: R): Promise<ResponseMap[R["type"]]> {
  const res = (await chrome.runtime.sendMessage(req)) as Response<ResponseMap[R["type"]]>;
  if (!res) throw new Error(`No response for ${req.type}`);
  if (!res.ok) throw new Error(res.error);
  return res.data;
}
