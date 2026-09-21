/**
 * GLUE — background service worker. Hosts the AI path (API keys & network live here, not in the page).
 * Keep this file thin: routing, caching, and the exposure log for the popup dashboard.
 * Scoring logic belongs in ai/, rendering in ui/.
 */
import {
  DEFAULT_SETTINGS,
  SIGNALS,
  type AnalysisInput,
  type AnalysisResult,
  type ExposureRecord,
  type FeedStats,
  type IntensityLevel,
  type Settings,
  type SignalKey,
  type StatsWindow,
} from "@contracts";
import type { Request, Response } from "@contracts/messages";
import { createAnalyzer, createTranscriber } from "../../ai";

// ── analyzers ────────────────────────────────────────────────────────────────────────
// "local" never talks to the network. "cloud" is Jev when the build has a key, else local too.
const analyzers = {
  local: createAnalyzer({ mode: "mock" }),
  cloud: createAnalyzer(__FEDO_CONFIG__),
};
const transcriber = createTranscriber(__FEDO_CONFIG__);
const cache = new Map<string, AnalysisResult>();

async function getSettings(): Promise<Settings> {
  const { settings } = await chrome.storage.local.get("settings");
  return { ...DEFAULT_SETTINGS, ...(settings as Partial<Settings> | undefined) };
}

async function analyze(input: AnalysisInput): Promise<AnalysisResult> {
  const mode = (await getSettings()).mode ?? "local";
  const key = `${mode}:${input.item.id}`;
  // Posts are immutable → cache. Transcripts change → always re-analyze.
  if (input.kind === "post" && cache.has(key)) return cache.get(key)!;
  const result = withCoverage(input, await analyzers[mode].analyze(input));
  if (input.kind === "post") cache.set(key, result);
  // The user's own draft is not feed exposure → never logged. Awaited, so the dashboard is never behind the overlay.
  if (input.item.kind !== "draft") await log.record(input, result);
  return result;
}

/** Fallback until ai/ sets `coverage` itself: no verdict on media, and none on a handful of words. */
function withCoverage(input: AnalysisInput, result: AnalysisResult): AnalysisResult {
  if (result.coverage) return result;
  const words = [input.item.text, input.item.quotedText, input.item.captions, ...(input.kind === "transcript" ? input.transcript.map((c) => c.text) : [])]
    .filter(Boolean)
    .join(" ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  if (words < 4) return { ...result, coverage: "insufficient" };
  if (input.item.media.length && input.kind === "post") return { ...result, coverage: "text_only" };
  return result;
}

// ── exposure log ─────────────────────────────────────────────────────────────────────
// One record per item id (upserted, so a live video keeps its latest scores), capped, in
// chrome.storage.local. Writes are serialized so parallel analyses can't lose each other.
const MAX_RECORDS = 3000;

const log = {
  queue: Promise.resolve(),
  async all(): Promise<ExposureRecord[]> {
    const { records } = await chrome.storage.local.get("records");
    return (records as ExposureRecord[] | undefined) ?? [];
  },
  record(input: AnalysisInput, result: AnalysisResult): Promise<void> {
    const rec: ExposureRecord = {
      itemId: input.item.id,
      platform: input.item.platform,
      author: input.item.author.handle,
      t: Date.now(),
      level: result.overall?.level ?? levelFromSignals(result),
      score: result.overall?.score ?? 0,
      signals: result.signals.filter((s) => s.score >= 0.5).map((s) => s.key),
      source: result.source,
    };
    this.queue = this.queue.then(async () => {
      const records = await this.all();
      const i = records.findIndex((r) => r.itemId === rec.itemId);
      if (i >= 0) {
        rec.t = records[i]!.t; // keep the first-seen time, refresh the scores
        records[i] = rec;
      } else {
        records.push(rec);
      }
      if (records.length > MAX_RECORDS) records.splice(0, records.length - MAX_RECORDS);
      await chrome.storage.local.set({ records });
      await updateBadge(records);
    });
    return this.queue;
  },
  async clear(): Promise<number> {
    const n = (await this.all()).length;
    await chrome.storage.local.set({ records: [] });
    await updateBadge([]);
    return n;
  },
};

/** Older results without `overall`: derive a level from the signals so the dashboard still counts them. */
function levelFromSignals(result: AnalysisResult): IntensityLevel {
  const max = Math.max(0, ...result.signals.map((s) => s.score));
  return max >= 0.85 ? "high" : max >= 0.65 ? "medium" : max >= 0.5 ? "low" : "none";
}

/** "session" = since the browser was opened. chrome.storage.session survives service-worker restarts, not a browser restart. */
async function sessionStart(): Promise<number> {
  const { sessionStart } = await chrome.storage.session.get("sessionStart");
  if (typeof sessionStart === "number") return sessionStart;
  const now = Date.now();
  await chrome.storage.session.set({ sessionStart: now });
  return now;
}

async function updateBadge(records: ExposureRecord[]): Promise<void> {
  const since = await sessionStart();
  const high = records.filter((r) => r.t >= since && r.level === "high").length;
  await chrome.action.setBadgeBackgroundColor({ color: "#f4384a" });
  await chrome.action.setBadgeText({ text: high ? String(high) : "" });
}

async function windowStart(window: StatsWindow): Promise<number> {
  if (window === "session") return sessionStart();
  if (window === "today") return new Date().setHours(0, 0, 0, 0);
  if (window === "7d") return Date.now() - 7 * 24 * 3600 * 1000;
  return 0;
}

async function stats(window: StatsWindow): Promise<FeedStats> {
  const since = await windowStart(window);
  const records = (await log.all()).filter((r) => r.t >= since);

  const byLevel: FeedStats["byLevel"] = { none: 0, low: 0, medium: 0, high: 0 };
  const bySignal: FeedStats["bySignal"] = {};
  const byGroup: FeedStats["byGroup"] = { political: 0, rhetoric: 0, credibility: 0, synthetic: 0 };
  const byPlatform: FeedStats["byPlatform"] = {};
  const authors = new Map<string, { author: string; platform: ExposureRecord["platform"]; items: number; flagged: number; signals: Map<SignalKey, number> }>();

  for (const r of records) {
    byLevel[r.level]++;
    byPlatform[r.platform] = (byPlatform[r.platform] ?? 0) + 1;
    const groups = new Set<keyof FeedStats["byGroup"]>();
    for (const k of r.signals) {
      bySignal[k] = (bySignal[k] ?? 0) + 1;
      groups.add(SIGNALS[k].group);
    }
    for (const g of groups) byGroup[g]++;

    const id = `${r.platform}:${r.author}`;
    const a = authors.get(id) ?? { author: r.author, platform: r.platform, items: 0, flagged: 0, signals: new Map() };
    a.items++;
    if (r.level === "medium" || r.level === "high") {
      a.flagged++;
      for (const k of r.signals) a.signals.set(k, (a.signals.get(k) ?? 0) + 1);
    }
    authors.set(id, a);
  }

  const topSources = [...authors.values()]
    .filter((a) => a.flagged > 0)
    .sort((a, b) => b.flagged - a.flagged || b.items - a.items)
    .slice(0, 5)
    .map(({ author, platform, items, flagged, signals }) => ({
      author,
      platform,
      items,
      flagged,
      topSignal: [...signals.entries()].sort((a, b) => b[1] - a[1])[0]?.[0],
    }));

  const total = records.length;
  return {
    window,
    since,
    total,
    byLevel,
    bySignal,
    byGroup,
    byPlatform,
    topSources,
    flaggedShare: total ? (byLevel.medium + byLevel.high) / total : 0,
  };
}

// ── routing ──────────────────────────────────────────────────────────────────────────

async function handle(req: Request): Promise<unknown> {
  switch (req.type) {
    case "fedo/analyze":
      return analyze(req.input);
    case "fedo/transcribe":
      return transcriber.transcribe(req.chunk);
    case "fedo/getSettings":
      return getSettings();
    case "fedo/setSettings": {
      const settings = { ...(await getSettings()), ...req.settings };
      await chrome.storage.local.set({ settings });
      return settings;
    }
    case "fedo/getStats":
      return stats(req.window);
    case "fedo/getRecords":
      return log.all();
    case "fedo/clearStats":
      return { cleared: await log.clear() };
  }
}

chrome.runtime.onMessage.addListener((req: Request, _sender, sendResponse: (r: Response<unknown>) => void) => {
  handle(req)
    .then((data) => sendResponse({ ok: true, data }))
    .catch((e) => sendResponse({ ok: false, error: String(e?.message ?? e) }));
  return true; // async response
});

void sessionStart().then(() => log.all().then(updateBadge));
console.log("[fedo] background ready, cloud analyzer:", __FEDO_CONFIG__.mode, "· speech-to-text:", __FEDO_CONFIG__.sttApiUrl ? "on" : "off");
