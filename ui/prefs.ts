/**
 * UI-owned preferences and counters, kept in chrome.storage.local under our own keys.
 * No contract change needed: the popup and the overlay share them without going through the background.
 * Everything is guarded so the playground (no `chrome`) still works.
 */
import type { AnyGroup } from "./theme";
import type { ThemePref } from "./theme";

export interface UiPrefs { theme: ThemePref; colorBlind: boolean; /** cover posts that look like mass-produced AI content */ slopCover: boolean }
export interface Stats { analyzed: number; withSignals: number; byGroup: Record<AnyGroup, number> }

export const DEFAULT_PREFS: UiPrefs = { theme: "system", colorBlind: false, slopCover: true };
export const EMPTY_STATS: Stats = { analyzed: 0, withSignals: 0, byGroup: { political: 0, rhetoric: 0, credibility: 0, synthetic: 0, other: 0 } };

const PREFS_KEY = "fedo.ui.prefs";
const STATS_KEY = "fedo.ui.stats";

const storage = () => (typeof chrome !== "undefined" && chrome.storage?.local ? chrome.storage.local : null);

export async function loadPrefs(): Promise<UiPrefs> {
  const s = storage();
  if (!s) return DEFAULT_PREFS;
  const got = await s.get(PREFS_KEY);
  return { ...DEFAULT_PREFS, ...(got[PREFS_KEY] as Partial<UiPrefs> | undefined) };
}
export async function savePrefs(patch: Partial<UiPrefs>): Promise<UiPrefs> {
  const next = { ...(await loadPrefs()), ...patch };
  await storage()?.set({ [PREFS_KEY]: next });
  return next;
}

export async function loadStats(): Promise<Stats> {
  const s = storage();
  if (!s) return EMPTY_STATS;
  const got = await s.get(STATS_KEY);
  const raw = got[STATS_KEY] as Partial<Stats> | undefined;
  return { ...EMPTY_STATS, ...raw, byGroup: { ...EMPTY_STATS.byGroup, ...raw?.byGroup } };
}
export async function bumpStats(withSignals: boolean, group?: AnyGroup): Promise<void> {
  const s = storage();
  if (!s) return;
  const cur = await loadStats();
  cur.analyzed++;
  if (withSignals) cur.withSignals++;
  if (group) cur.byGroup[group] = (cur.byGroup[group] ?? 0) + 1;
  await s.set({ [STATS_KEY]: cur });
}
export async function resetStats(): Promise<void> {
  await storage()?.set({ [STATS_KEY]: EMPTY_STATS });
}

/**
 * Subscribe to changes of our prefs, our stats, and the background's `settings` key (enabled / minScore).
 * Returns an unsubscribe function.
 */
export function onStorageChange(cb: (change: { prefs?: UiPrefs; stats?: Stats; settings?: Record<string, unknown> }) => void): () => void {
  const s = storage();
  if (!s || !chrome.storage.onChanged) return () => {};
  const handler = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area !== "local") return;
    const out: Parameters<typeof cb>[0] = {};
    if (changes[PREFS_KEY]) out.prefs = { ...DEFAULT_PREFS, ...(changes[PREFS_KEY].newValue as Partial<UiPrefs>) };
    if (changes[STATS_KEY]) out.stats = changes[STATS_KEY].newValue as Stats;
    if (changes["settings"]) out.settings = changes["settings"].newValue as Record<string, unknown>;
    if (Object.keys(out).length) cb(out);
  };
  chrome.storage.onChanged.addListener(handler);
  return () => chrome.storage.onChanged.removeListener(handler);
}
