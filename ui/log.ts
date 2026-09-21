/**
 * The analysis log: one entry per analyzed post, newest first, kept in chrome.storage.local under a UI-owned key.
 * Written by the overlay (content script), read by the dashboard page. No contract change needed.
 * The overlay only knows the item id, the anchor element and the result, so author/text are read
 * best-effort from the anchor for display; a FeedItem passed to render() would make this exact (proposal in UPDATE.md).
 */
import type { AnalysisResult, IntensityLevel, Platform, SignalKey } from "@contracts";

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
  /** signals ≥ 0.3, highest first, at most 6 */
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

/** Build a log entry from what the overlay has: the id, the post's DOM element and the result. */
export function entryFrom(itemId: string, anchor: HTMLElement, r: AnalysisResult, slop: boolean): LogEntry {
  const [platform, postId] = itemId.split(":") as [Platform, string];
  const q = (sel: string) => anchor.querySelector<HTMLElement>(sel)?.innerText?.trim() ?? "";
  // X: data-testid="User-Name" holds "Name\n@handle"; tweetText the body. TikTok: data-e2e attributes. Else: the element's text.
  const userBlock = q('[data-testid="User-Name"]') || q('[data-e2e="video-author-uniqueid"]') || q('[data-e2e="browse-username"]');
  const handle = (/@([A-Za-z0-9_.]+)/.exec(userBlock)?.[1] ?? userBlock.split("\n")[0] ?? "").trim() || "unknown";
  const displayName = userBlock.includes("\n") ? userBlock.split("\n")[0]?.trim() : undefined;
  const body = q('[data-testid="tweetText"]') || q('[data-e2e="video-desc"]') || q('[data-e2e="browse-video-desc"]') || anchor.innerText || "";
  const url =
    platform === "x" ? `https://x.com/i/status/${postId}` :
    (anchor.querySelector<HTMLAnchorElement>('a[href*="/video/"]')?.href ?? undefined);
  return {
    id: itemId, platform, handle, displayName, url,
    text: body.replace(/\s+/g, " ").slice(0, 160),
    ts: Date.now(),
    overall: r.overall,
    signals: r.signals.filter((s) => s.score >= 0.3).sort((a, b) => b.score - a.score).slice(0, 6).map(({ key, score, evidence }) => ({ key, score, evidence })),
    explanation: r.explanation,
    slop,
  };
}
