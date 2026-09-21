/**
 * Extension popup: the "Feed Diet" dashboard + settings.
 * Data comes from the background (fedo/getStats); nothing here talks to the network.
 */
import { SIGNALS, type ExposureRecord, type FeedStats, type IntensityLevel, type Settings, type SignalKey, type StatsWindow } from "@contracts";
import { send } from "@contracts/messages";

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const pct = (n: number) => `${Math.round(n * 100)}%`;

const LEVELS: { key: IntensityLevel; label: string; color: string }[] = [
  { key: "high", label: "High", color: "var(--high)" },
  { key: "medium", label: "Medium", color: "var(--medium)" },
  { key: "low", label: "Low", color: "var(--low)" },
  { key: "none", label: "None", color: "var(--none)" },
];

let window_: StatsWindow = "session";

// ── dashboard ────────────────────────────────────────────────────────────────────────

async function refresh() {
  for (const b of $("#tabs").querySelectorAll<HTMLButtonElement>("button")) b.setAttribute("aria-selected", String(b.dataset.window === window_));
  const stats = await send({ type: "fedo/getStats", window: window_ });
  $("#dash").innerHTML = dashboard(stats);
}

function dashboard(s: FeedStats): string {
  if (!s.total) {
    return `<p class="empty">No posts analyzed ${windowLabel(s.window)} yet.<br>Open <b>x.com</b> and scroll — every post you pass gets analyzed and counted here.</p>`;
  }
  const flagged = s.byLevel.medium + s.byLevel.high;
  return `
    <div class="hero">
      <div><div class="n">${s.total}</div><div class="l">posts analyzed ${windowLabel(s.window)}</div></div>
      <div><div class="n">${pct(s.flaggedShare)}</div><div class="l">used strong persuasion techniques (${flagged} medium or high)</div></div>
    </div>
    <h2>Feed diet</h2>
    <div class="diet">${donut(s)}${legend(s)}</div>
    <h2>Top techniques</h2>
    ${bars(s)}
    ${s.topSources.length ? `<h2>Top sources of flagged posts</h2>${sources(s)}` : ""}`;
}

function windowLabel(w: StatsWindow): string {
  return { session: "this session", today: "today", "7d": "in the last 7 days", all: "in total" }[w];
}

/** Part-of-whole by intensity level (levels are exclusive, so the slices add up to `total`). */
function donut(s: FeedStats): string {
  const r = 40;
  const c = 2 * Math.PI * r;
  const gap = 2; // px of surface between slices
  let offset = 0;
  const slices = LEVELS.filter((l) => s.byLevel[l.key] > 0).map((l) => {
    const n = s.byLevel[l.key];
    const len = (n / s.total) * c;
    const dash = Math.max(0, len - gap);
    const el = `<circle r="${r}" cx="50" cy="50" fill="none" stroke="${l.color}" stroke-width="14"
        stroke-dasharray="${dash} ${c - dash}" stroke-dashoffset="${-offset}" transform="rotate(-90 50 50)">
        <title>${l.label}: ${n} posts (${pct(n / s.total)})</title></circle>`;
    offset += len;
    return el;
  });
  return `<svg width="100" height="100" viewBox="0 0 100 100" role="img" aria-label="Share of posts by intensity level">
    <circle r="${r}" cx="50" cy="50" fill="none" stroke="var(--surface-2)" stroke-width="14"/>
    ${slices.join("")}
    <text x="50" y="47" text-anchor="middle" fill="var(--text)" font-size="18" font-weight="700">${s.byLevel.high}</text>
    <text x="50" y="62" text-anchor="middle" fill="var(--text-2)" font-size="9">high</text>
  </svg>`;
}

function legend(s: FeedStats): string {
  return `<div class="legend">${LEVELS.map(
    (l) => `<div><i style="background:${l.color}"></i><span>${l.label}</span><b>${s.byLevel[l.key]}</b><span class="pct">${pct(s.byLevel[l.key] / s.total)}</span></div>`,
  ).join("")}</div>`;
}

/** Share of posts in which each technique fired. political_content is a topic, not a technique → not ranked. */
function bars(s: FeedStats): string {
  const rows = (Object.entries(s.bySignal) as [SignalKey, number][])
    .filter(([k]) => k !== "political_content")
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  if (!rows.length) return `<p class="empty">No technique crossed the threshold ${windowLabel(s.window)}.</p>`;
  const max = rows[0]![1];
  return `<div class="bars">${rows
    .map(
      ([k, n]) => `<div class="bar" title="${esc(SIGNALS[k].description)} — ${n} of ${s.total} posts">
        <span class="label">${esc(SIGNALS[k].label)}</span>
        <span class="track"><span class="fill" style="width:${(n / max) * 100}%"></span></span>
        <span class="val">${pct(n / s.total)}</span></div>`,
    )
    .join("")}</div>`;
}

function sources(s: FeedStats): string {
  return `<div class="sources">${s.topSources
    .slice(0, 3)
    .map((src) => {
      const url = src.platform === "x" ? `https://x.com/${encodeURIComponent(src.author)}` : `https://www.tiktok.com/@${encodeURIComponent(src.author)}`;
      const top = src.topSignal ? ` · ${esc(SIGNALS[src.topSignal].label)}` : "";
      return `<div class="src">
        <div><div class="h">@${esc(src.author)}</div><div class="m">${src.flagged} of ${src.items} ${src.items === 1 ? "post" : "posts"} flagged${top}</div></div>
        <a href="${url}" target="_blank" rel="noopener">Open ↗</a></div>`;
    })
    .join("")}</div>`;
}

// ── settings ─────────────────────────────────────────────────────────────────────────

function showSettings(s: Settings) {
  $<HTMLInputElement>("#enabled").checked = s.enabled;
  $<HTMLInputElement>("#calm").checked = !!s.calmMode;
  for (const b of $("#sensitivity").querySelectorAll<HTMLButtonElement>("button")) {
    b.setAttribute("aria-pressed", String(Math.abs(Number(b.dataset.min) - s.minScore) < 0.01));
  }
  const mode = s.mode ?? "local";
  for (const b of $("#mode").querySelectorAll<HTMLButtonElement>("button")) b.setAttribute("aria-pressed", String(b.dataset.mode === mode));
  $("#modeHint").textContent =
    mode === "local" ? "Local: the rules run in your browser, nothing leaves your device." : "Cloud: post text is sent to Jev (TypeSafe) for scoring. Falls back to local if no key is configured.";
}

async function update(patch: Partial<Settings>) {
  showSettings(await send({ type: "fedo/setSettings", settings: patch }));
}

$("#enabled").addEventListener("change", (e) => update({ enabled: (e.target as HTMLInputElement).checked }));
$("#calm").addEventListener("change", (e) => update({ calmMode: (e.target as HTMLInputElement).checked }));
$("#sensitivity").addEventListener("click", (e) => {
  const min = (e.target as HTMLElement).closest("button")?.dataset.min;
  if (min) update({ minScore: Number(min) });
});
$("#mode").addEventListener("click", (e) => {
  const mode = (e.target as HTMLElement).closest("button")?.dataset.mode as Settings["mode"] | undefined;
  if (mode) update({ mode });
});
$("#tabs").addEventListener("click", (e) => {
  const w = (e.target as HTMLElement).closest("button")?.dataset.window as StatsWindow | undefined;
  if (w) {
    window_ = w;
    refresh();
  }
});
$("#export").addEventListener("click", async () => {
  const records: ExposureRecord[] = await send({ type: "fedo/getRecords" });
  const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), records }, null, 2)], { type: "application/json" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `fedo-feed-diet-${new Date().toISOString().slice(0, 10)}.json` });
  a.click();
  URL.revokeObjectURL(a.href);
});
$("#reset").addEventListener("click", async () => {
  if (!confirm("Delete all feed statistics stored in this browser?")) return;
  await send({ type: "fedo/clearStats" });
  refresh();
});

send({ type: "fedo/getSettings" }).then(showSettings);
refresh();
