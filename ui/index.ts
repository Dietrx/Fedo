/**
 * PATH 3 — UI. Public entry point. Only this file is imported by the glue code.
 * Contract: render(itemId, anchor, OverlayState) — see contracts/modules.ts.
 * Everything lives inside a Shadow DOM, so X/TikTok CSS can't leak in and ours can't leak out.
 *
 * Design rules (see the Fedo Shield design system):
 *   colour = category of the technique, fill weight = strength, red = LIVE only, always a label next to a colour.
 */
import { DEFAULT_SETTINGS, SIGNALS, type AnalysisResult, type OverlayRenderer, type OverlayState, type Signal } from "@contracts";
import { loadPrefs, onStorageChange, bumpStats, DEFAULT_PREFS, type UiPrefs } from "./prefs";
import { GLYPH, groupOf, hostIsDark, resolveTheme, type ThemeId } from "./theme";
import { OVERLAY_CSS } from "./styles";

export interface OverlayOptions {
  minScore?: number;
  /** Force a theme (playground). Default: follows the popup's Appearance setting and the host page. */
  theme?: ThemeId;
  /** Count analyzed posts into the popup readout. Default true inside the extension. */
  stats?: boolean;
}

interface Entry {
  host: HTMLElement;
  root: ShadowRoot;
  anchor: HTMLElement;
  state: OverlayState;
  expanded: boolean;
  /** last meter widths, so a re-render animates from the previous value */
  widths: Map<string, number>;
  /** live tracker: when the first partial result arrived, and the moments logged so far */
  liveStart?: number;
  log: { t: number; key: Signal["key"]; evidence?: string }[];
  peak: Map<string, number>;
  counted: boolean;
}

export function createOverlay(opts: OverlayOptions = {}): OverlayRenderer {
  let minScore = opts.minScore ?? DEFAULT_SETTINGS.minScore;
  let prefs: UiPrefs = DEFAULT_PREFS;
  let forcedTheme = opts.theme;
  const countStats = opts.stats ?? true;
  const entries = new Map<string, Entry>();

  const theme = (): ThemeId => forcedTheme ?? resolveTheme(prefs.theme, prefs.colorBlind, hostIsDark());

  // Live updates: popup Appearance / colour-blind switch, and the background's settings (minScore, enabled).
  if (!forcedTheme) loadPrefs().then((p) => { prefs = p; rerenderAll(); });
  onStorageChange((c) => {
    if (c.prefs) prefs = c.prefs;
    if (c.settings) {
      if (typeof c.settings.minScore === "number") minScore = c.settings.minScore;
      if (c.settings.enabled === false) { api.clear(); return; }
    }
    rerenderAll();
  });

  function rerenderAll() {
    for (const [id, e] of entries) api.render(id, e.anchor, e.state);
  }

  function mount(itemId: string, anchor: HTMLElement): Entry {
    let e = entries.get(itemId);
    if (e && e.host.isConnected && anchor.contains(e.host)) return e;
    e?.host.remove();
    const host = document.createElement("fedo-overlay");
    for (const ev of ["click", "mousedown", "pointerdown", "touchstart"]) host.addEventListener(ev, (x) => x.stopPropagation());
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${OVERLAY_CSS}</style><div class="view"></div>`;
    anchor.appendChild(host);
    e = { host, root, anchor, state: { status: "pending" }, expanded: false, widths: new Map(), log: [], peak: new Map(), counted: false };
    entries.set(itemId, e);
    return e;
  }

  const api: OverlayRenderer = {
    render(itemId, anchor, state) {
      const e = mount(itemId, anchor);
      e.state = state;
      e.host.dataset.theme = theme();
      if (state.status === "done") track(e, state.result);
      const view = e.root.querySelector(".view")!;
      view.innerHTML = renderView(e, state, minScore, theme().endsWith("-cb"));
      view.querySelector("[data-toggle]")?.addEventListener("click", () => { e.expanded = !e.expanded; api.render(itemId, anchor, e.state); });
      animateMeters(e);
      if (state.status === "done" && !state.result.partial && !e.counted && countStats) {
        e.counted = true;
        const shown = visible(state.result, minScore);
        bumpStats(shown.length > 0, shown[0] ? groupOf(shown[0].key) : undefined).catch(() => {});
      }
    },
    remove(itemId) { entries.get(itemId)?.host.remove(); entries.delete(itemId); },
    clear() { entries.forEach((e) => e.host.remove()); entries.clear(); },
  };
  return api;
}

// ── live tracker bookkeeping ───────────────────────────────────────────────────────────
function track(e: Entry, r: AnalysisResult) {
  if (!r.partial && !e.liveStart) return;
  if (!e.liveStart) e.liveStart = Date.now();
  if (r.partial) e.expanded = true;
  const t = (Date.now() - e.liveStart) / 1000;
  for (const s of r.signals) {
    const prev = e.peak.get(s.key) ?? 0;
    // log the moment a signal first crosses 0.5, or jumps by 15 points
    if ((prev < 0.5 && s.score >= 0.5) || (prev >= 0.5 && s.score - prev >= 0.15)) e.log.push({ t, key: s.key, evidence: s.evidence });
    if (s.score > prev) e.peak.set(s.key, s.score);
  }
}

function animateMeters(e: Entry) {
  const fills = e.root.querySelectorAll<HTMLElement>(".fill[data-key]");
  fills.forEach((f) => {
    const key = f.dataset.key!, target = Number(f.dataset.w);
    f.style.width = `${e.widths.get(key) ?? 0}%`;
    requestAnimationFrame(() => requestAnimationFrame(() => { f.style.width = `${target}%`; }));
    e.widths.set(key, target);
  });
}

// ── views ──────────────────────────────────────────────────────────────────────────────
const visible = (r: AnalysisResult, min: number) => r.signals.filter((s) => s.score >= min).sort((a, b) => b.score - a.score);

function renderView(e: Entry, state: OverlayState, minScore: number, cb: boolean): string {
  if (state.status === "pending") return `<div class="bar"><span class="dot"></span><span class="muted">Analyzing…</span></div>`;
  if (state.status === "error") return `<div class="bar"><span class="muted">Analysis unavailable</span></div>`;

  const { result } = state;
  const shown = visible(result, minScore);
  const live = result.partial ? `<span class="live"><i></i>LIVE</span>` : "";
  if (!shown.length && !result.partial) return `<div class="bar clean">${CHECK}No strong signals</div>`;

  const chips = shown.slice(0, 3).map((s) => chip(s, cb)).join("");
  const more = shown.length > 3 ? `<span class="more">+${shown.length - 3}</span>` : "";
  const bar = `<div class="bar">${live}${chips}${more}<button data-toggle class="btn primary">${e.expanded ? "Hide" : "Why?"}</button></div>`;
  return bar + (e.expanded ? panel(e, result, shown, cb) : "");
}

function chip(s: Signal, cb: boolean): string {
  const g = groupOf(s.key);
  return `<span class="chip ${level(s.score)}" data-group="${g}">${cb ? `<span class="glyph">${GLYPH[g]}</span>` : ""}${esc(SIGNALS[s.key].label)} <b>${pct(s.score)}</b></span>`;
}

function panel(e: Entry, r: AnalysisResult, shown: Signal[], cb: boolean): string {
  const isLive = !!e.liveStart;
  const rows = (isLive ? r.signals.filter((s) => s.score >= 0.3).sort((a, b) => b.score - a.score) : shown).map((s) => row(s, cb)).join("");
  const elapsed = isLive ? mmss((Date.now() - e.liveStart!) / 1000) : "";
  const head = isLive
    ? `<div class="head">${r.partial ? `<span class="live"><i></i>LIVE</span>` : `<span class="t">DONE</span>`}<span class="t">${elapsed}</span></div>`
    : `<div class="head"><h3>Why am I seeing this?</h3><button data-toggle class="btn ghost">Hide</button></div>`;
  const log = isLive && e.log.length ? `<div class="log">${e.log.map((l) => logLine(l, cb)).join("")}</div>` : "";
  return `
    <div class="panel${isLive ? " tracker" : ""}">
      ${isLive ? `<i class="c tl"></i><i class="c tr"></i><i class="c bl"></i><i class="c br"></i>` : ""}
      ${head}
      ${r.explanation && !isLive ? `<p class="explain">${esc(r.explanation)}</p>` : ""}
      ${rows}
      ${log}
      <p class="note">Techniques, not opinions</p>
    </div>`;
}

function row(s: Signal, cb: boolean): string {
  const g = groupOf(s.key);
  const mark = cb ? `<span class="glyph">${GLYPH[g]}</span>` : `<span class="sw"></span>`;
  return `
    <div class="row" data-group="${g}" title="${esc(SIGNALS[s.key].description)}">
      <div class="lbl">${mark}${esc(SIGNALS[s.key].label)}</div>
      <div class="val">${pct(s.score)}</div>
      <div class="meter"><span class="fill" data-key="${s.key}" data-w="${Math.round(s.score * 100)}"></span></div>
      ${s.evidence ? `<div class="ev"><q>${esc(s.evidence)}</q></div>` : ""}
    </div>`;
}

function logLine(l: Entry["log"][number], cb: boolean): string {
  const g = groupOf(l.key);
  const mark = cb ? `<span class="glyph">${GLYPH[g]}</span> ` : `<span class="k"></span>`;
  return `<div><span class="t">${mmss(l.t)}</span><span data-group="${g}">${mark}${esc(SIGNALS[l.key].label)}${l.evidence ? ` · <q>${esc(l.evidence)}</q>` : ""}</span></div>`;
}

const CHECK = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5l3 3 7-7"/></svg>`;
const level = (score: number) => (score >= 0.85 ? "high" : score >= 0.65 ? "mid" : "low");
const pct = (score: number) => `${Math.round(score * 100)}%`;
const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
