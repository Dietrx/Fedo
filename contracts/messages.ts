/**
 * Messages between content script and background service worker (glue layer only).
 * The individual paths don't need to care about this.
 */
import type { AnalysisInput, AnalysisResult, Settings } from "./types";

export type Request =
  | { type: "fedo/analyze"; input: AnalysisInput }
  | { type: "fedo/getSettings" }
  | { type: "fedo/setSettings"; settings: Partial<Settings> };

export type Response<T> = { ok: true; data: T } | { ok: false; error: string };

export interface ResponseMap {
  "fedo/analyze": AnalysisResult;
  "fedo/getSettings": Settings;
  "fedo/setSettings": Settings;
}

export async function send<R extends Request>(req: R): Promise<ResponseMap[R["type"]]> {
  const res = (await chrome.runtime.sendMessage(req)) as Response<ResponseMap[R["type"]]>;
  if (!res) throw new Error(`No response for ${req.type}`);
  if (!res.ok) throw new Error(res.error);
  return res.data;
}
