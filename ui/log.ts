/**
 * The analysis log: one entry per analyzed post, newest first, kept in chrome.storage.local under a UI-owned key.
 * Written by the overlay (content script), read by the dashboard page. No contract change needed.
 * The overlay only knows the item id, the anchor element and the result, so author/text are read
 * best-effort from the anchor for display; a FeedItem passed to render() would make this exact (proposal in UPDATE.md).
 */
import type { AnalysisResult, IntensityLevel, Platform, SignalKey } from "@contracts";
import { isTopic, rankSignals } from "./theme";

export interface LogEntry {
  id: string;
  platform: Platform;
  handle: string;
  displayName?: string;
  url?: string;
  /** first ~160 chars of the post text */
  text: string;
  /** when it was analyzed, ms since epoch */
  ts: number;
  overall?: { level: IntensityLevel; score: number };
  /** topics ≥ 0.5, then the ranked techniques: always the top five (however low, like the card shows them), then anything else ≥ 0.3. At most 6. */
  signals: { key: SignalKey; score: number; evidence?: string }[];
  explanation?: string;
  slop: boolean;
}

const KEY = "fedo.ui.log";
const CAP = 500;
const storage = () => (typeof chrome !== "undefined" && chrome.storage?.local ? chrome.storage.local : null);

export async function loadLog(): Promise<LogEntry[]> {
  const s = storage();
  if (!s) return [];
  const got = await s.get(KEY);
  return (got[KEY] as LogEntry[] | undefined) ?? [];
}

export async function appendLog(entry: LogEntry): Promise<void> {
  const s = storage();
  if (!s) return;
  const log = (await loadLog()).filter((e) => e.id !== entry.id);
  log.unshift(entry);
  await s.set({ [KEY]: log.slice(0, CAP) });
}

export async function clearLog(): Promise<void> {
  await storage()?.set({ [KEY]: [] });
}

export function onLogChange(cb: (log: LogEntry[]) => void): () => void {
  const s = storage();
  if (!s || !chrome.storage.onChanged) return () => {};
  const h = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === "local" && changes[KEY]) cb((changes[KEY].newValue as LogEntry[]) ?? []);
  };
  chrome.storage.onChanged.addListener(h);
  return () => chrome.storage.onChanged.removeListener(h);
}

/** Only http(s) URLs may reach the dashboard page (an extension page): anything else from the host DOM is dropped. */
export function safeHttpUrl(u: string | undefined | null): string | undefined {
  if (!u) return undefined;
  try { const p = new URL(u); return p.protocol === "https:" || p.protocol === "http:" ? p.href : undefined; } catch { return undefined; }
}

/** Author of a post, read best-effort from its DOM element (X: data-testid="User-Name" = "Name\n@handle"; TikTok: data-e2e). */
export function authorFrom(anchor: HTMLElement): { handle: string; displayName?: string } {
  const q = (sel: string) => anchor.querySelector<HTMLElement>(sel)?.innerText?.trim() ?? "";
  const userBlock = q('[data-testid="User-Name"]') || q('[data-e2e="video-author-uniqueid"]') || q('[data-e2e="browse-username"]') || q(".author");
  const handle = (/@([A-Za-z0-9_.]+)/.exec(userBlock)?.[1] ?? userBlock.split("\n")[0] ?? "").trim() || "unknown";
  const displayName = userBlock.includes("\n") ? userBlock.split("\n")[0]?.trim() : undefined;
  return { handle, displayName };
}

/** Build a log entry from what the overlay has: the id, the post's DOM element and the result. */
export function entryFrom(itemId: string, anchor: HTMLElement, r: AnalysisResult, slop: boolean): LogEntry {
  const [platform, postId] = itemId.split(":") as [Platform, string];
  const q = (sel: string) => anchor.querySelector<HTMLElement>(sel)?.innerText?.trim() ?? "";
  const { handle, displayName } = authorFrom(anchor);
  const body = q('[data-testid="tweetText"]') || q('[data-e2e="video-desc"]') || q('[data-e2e="browse-video-desc"]') || anchor.innerText || "";
  const url =
    platform === "x" ? (/^\d+$/.test(postId) ? `https://x.com/i/status/${postId}` : undefined) :
    safeHttpUrl(anchor.querySelector<HTMLAnchorElement>('a[href*="/video/"]')?.href);
  return {
    id: itemId, platform, handle, displayName, url,
    text: body.replace(/\s+/g, " ").slice(0, 160),
    ts: Date.now(),
    overall: r.overall,
    signals: [...r.signals.filter((s) => isTopic(s.key) && s.score >= 0.5), ...rankSignals(r.signals).filter((s, i) => i < 5 || s.score >= 0.3)].slice(0, 6).map(({ key, score, evidence }) => ({ key, score, evidence })),
    explanation: r.explanation,
    slop,
  };
}
