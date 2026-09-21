/**
 * PATH 3 — UI. Public entry point. Only this file is imported by the glue code.
 * Contract: render(itemId, anchor, OverlayState) — see contracts/modules.ts.
 * Everything lives inside a Shadow DOM, so X/TikTok CSS can't leak in and ours can't leak out.
 *
 * Design rules (see the Fedo Shield design system):
 *   colour = category of the technique, fill weight = strength, red = LIVE only, always a label next to a colour.
 */
import { DEFAULT_SETTINGS, SIGNALS, type AnalysisResult, type OverlayRenderer, type OverlayState, type Signal } from "@contracts";
import { loadPrefs, onStorageChange, bumpStats, DEFAULT_PREFS, type Layout, type UiPrefs } from "./prefs";
import { appendLog, authorFrom, entryFrom } from "./log";
import { GLYPH, groupOf, hostIsDark, isTopic, resolveTheme, type ThemeId } from "./theme";
import { OVERLAY_CSS } from "./styles";

export interface OverlayOptions {
  minScore?: number;
  /** Force a theme (playground). Default: follows the popup's Appearance setting and the host page. */
  theme?: ThemeId;
  /** Count analyzed posts into the popup readout. Default true inside the extension. */
  stats?: boolean;
  /** Force a layout (playground). Default: the popup's setting; "hud" = one fixed panel top-right, "strip" = a line under each post. */
  layout?: Layout;
  /** Where the HUD's Dashboard button goes. Default: the extension's dashboard.html. */
  dashboardUrl?: string;
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
  /** when the pending state started (for "still analyzing · 4s") */
  pendingSince?: number;
  /** full-post cover for AI slop, and whether the reader dismissed it */
  cover?: HTMLElement;
  slopDismissed: boolean;
}

export function createOverlay(opts: OverlayOptions = {}): OverlayRenderer {
  let minScore = opts.minScore ?? DEFAULT_SETTINGS.minScore;
  let prefs: UiPrefs = DEFAULT_PREFS;
  let forcedTheme = opts.theme;
  const countStats = opts.stats ?? true;
  const entries = new Map<string, Entry>();
  const layout = (): Layout => opts.layout ?? prefs.layout;

  const theme = (): ThemeId => forcedTheme ?? resolveTheme(prefs.theme, prefs.colorBlind, hostIsDark());

  // ── HUD: one fixed panel that follows the post most in view ─────────────────────────
  let hud: { host: HTMLElement; root: ShadowRoot } | undefined;
  let currentId: string | undefined;
  const ratio = new Map<string, number>();
  const io = typeof IntersectionObserver === "function"
    ? new IntersectionObserver((recs) => {
        for (const r of recs) { const id = (r.target as HTMLElement).dataset.fedoId; if (id) ratio.set(id, r.isIntersecting ? r.intersectionRatio : 0); }
        let best: string | undefined, bestR = 0;
        for (const [id, x] of ratio) if (x > bestR) { best = id; bestR = x; }
        if (best !== currentId) { currentId = best; renderHud(); }
      }, { threshold: [0, 0.25, 0.5, 0.75, 1] })
    : undefined;

  function ensureHud() {
    if (layout() !== "hud") { hud?.host.remove(); hud = undefined; return; }
    if (hud?.host.isConnected) return;
    const host = document.createElement("fedo-hud");
    host.className = "hud";
    for (const ev of ["click", "mousedown", "pointerdown", "touchstart", "wheel"]) host.addEventListener(ev, (x) => x.stopPropagation());
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${OVERLAY_CSS}</style><div class="hud"><div class="prog"><i></i></div>
      <div class="top"><span class="brand">Fedo <span data-count></span></span><button class="dash" data-dash>Dashboard ↗</button></div>
      <div class="who" data-who></div><div class="view"></div></div>`;
    root.querySelector("[data-dash]")!.addEventListener("click", () => {
      const url = opts.dashboardUrl ?? (typeof chrome !== "undefined" && chrome.runtime?.getURL ? chrome.runtime.getURL("dashboard.html") : undefined);
      const w = url ? window.open(url, "_blank", "noopener") : null;
      if (!w) { const b = root.querySelector("[data-dash]")!; b.textContent = "Use the Fedo icon"; setTimeout(() => (b.textContent = "Dashboard ↗"), 1800); }
    });
    document.body.appendChild(host);
    hud = { host, root };
  }

  function renderHud() {
    ensureHud();
    if (!hud) return;
    hud.host.dataset.theme = theme();
    const done = [...entries.values()].filter((x) => x.state.status === "done").length;
    hud.root.querySelector("[data-count]")!.textContent = done ? `· ${done} analyzed` : "";
    const e = currentId ? entries.get(currentId) : undefined;
    const who = hud.root.querySelector("[data-who]")!, view = hud.root.querySelector(".view")!, prog = hud.root.querySelector(".prog")!;
    if (!e) { who.innerHTML = ""; prog.className = "prog"; view.innerHTML = `<div class="idle">Scroll — Fedo analyzes each post as it comes into view.</div>`; return; }
    const a = authorFrom(e.anchor);
    const lvl = e.state.status === "done" && e.state.result.overall && e.state.result.overall.level !== "none" ? `<span class="lvl">${e.state.result.overall.level}</span>` : "";
    who.innerHTML = `<span>${a.displayName ? `<b>${esc(a.displayName)}</b> ` : ""}@${esc(a.handle)}</span>${lvl}`;
    prog.className = `prog ${progClass(e.state)}`;
    view.innerHTML = `<div class="body swap">${renderView(e, e.state, minScore, theme().endsWith("-cb"))}</div>`;
    view.querySelectorAll("[data-toggle]").forEach((el) => el.addEventListener("click", (ev) => { ev.stopPropagation(); e.expanded = !e.expanded; renderHud(); }));
    animateMeters({ ...e, root: hud.root } as Entry);
  }

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

  // once a second: update "still analyzing · Ns" on pending posts (text only, no re-render)
  setInterval(() => {
    for (const e of entries.values()) {
      if (e.state.status !== "pending" || !e.pendingSince) continue;
      const secs = Math.floor((Date.now() - e.pendingSince) / 1000);
      const t = pendingText(secs);
      e.root.querySelectorAll("[data-elapsed]").forEach((el) => (el.textContent = t));
      if (hud && currentId === e.host.dataset.fedoId) hud.root.querySelectorAll("[data-elapsed]").forEach((el) => (el.textContent = t));
    }
  }, 1000);

  function rerenderAll() {
    for (const [id, e] of entries) api.render(id, e.anchor, e.state);
    renderHud();
  }

  function mount(itemId: string, anchor: HTMLElement): Entry {
    let e = entries.get(itemId);
    if (e && e.anchor === anchor) {
      // strip: under the post · hud: nothing under the post
      if (layout() === "strip" && !e.host.isConnected) anchor.appendChild(e.host);
      if (layout() === "hud" && e.host.isConnected) e.host.remove();
      return e;
    }
    e?.host.remove();
    const host = document.createElement("fedo-overlay");
    for (const ev of ["click", "mousedown", "pointerdown", "touchstart"]) host.addEventListener(ev, (x) => x.stopPropagation());
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${OVERLAY_CSS}</style><div class="prog"><i></i></div><div class="view"></div>`;
    anchor.dataset.fedoId = itemId;
    host.dataset.fedoId = itemId;
    io?.observe(anchor);
    e = { host, root, anchor, state: { status: "pending" }, expanded: false, widths: new Map(), log: [], peak: new Map(), counted: false, slopDismissed: false };
    entries.set(itemId, e);
    if (layout() === "strip") anchor.appendChild(host);
    return e;
  }

  const api: OverlayRenderer = {
    render(itemId, anchor, state) {
      const e = mount(itemId, anchor);
      if (state.status === "pending" && e.state.status !== "pending") e.pendingSince = Date.now();
      if (state.status === "pending" && !e.pendingSince) e.pendingSince = Date.now();
      if (state.status !== "pending") e.pendingSince = undefined;
      e.state = state;
      e.host.dataset.theme = theme();
      if (state.status === "done") track(e, state.result);
      // progress bar: fills while the AI works (eased to 90%), completes on done, fades out, stays as a hairline
      const prog = e.root.querySelector(".prog")!;
      prog.className = `prog ${progClass(state)}`;
      const view = e.root.querySelector(".view")!;
      view.innerHTML = renderView(e, state, minScore, theme().endsWith("-cb"));
      const toggle = () => { e.expanded = !e.expanded; api.render(itemId, anchor, e.state); };
      view.querySelectorAll("[data-toggle]").forEach((el) => el.addEventListener("click", (ev) => { ev.stopPropagation(); toggle(); }));
      animateMeters(e);
      if (layout() === "hud" && (itemId === currentId || !currentId)) { if (!currentId) currentId = itemId; renderHud(); } else if (layout() === "hud") renderHud();
      renderCover(e, state, prefs.slopCover, theme(), () => { e.slopDismissed = true; api.render(itemId, anchor, e.state); });
      if (state.status === "done" && !state.result.partial && !e.counted && countStats) {
        e.counted = true;
        const shown = visible(state.result, minScore);
        bumpStats(shown.length > 0, shown[0] ? groupOf(shown[0].key) : undefined).catch(() => {});
        appendLog(entryFrom(itemId, anchor, state.result, isSlop(state.result))).catch(() => {});
      }
    },
    remove(itemId) {
      const e = entries.get(itemId);
      if (e) { io?.unobserve(e.anchor); ratio.delete(itemId); e.host.remove(); e.cover?.remove(); }
      entries.delete(itemId);
      if (currentId === itemId) { currentId = undefined; renderHud(); }
    },
    clear() { entries.forEach((e) => { io?.unobserve(e.anchor); e.host.remove(); e.cover?.remove(); }); entries.clear(); ratio.clear(); currentId = undefined; hud?.host.remove(); hud = undefined; },
  };
  return api;
}

const pendingText = (secs: number) => (secs < 3 ? "Analyzing" : secs < 12 ? `Still analyzing · ${secs}s` : `Taking longer than usual · ${secs}s`);
const progClass = (state: OverlayState) => (state.status === "pending" ? "loading" : state.status === "error" ? "err" : state.result.partial ? "live" : "done");

// ── AI slop cover ──────────────────────────────────────────────────────────────────────
const SLOP_KEYS = ["possible_ai_slop", "synthetic_media"] as const;
const SLOP_MIN = 0.85;
export const isSlop = (r: AnalysisResult) => r.signals.some((s) => (SLOP_KEYS as readonly string[]).includes(s.key) && s.score >= SLOP_MIN);

/** Lays a full-width cover over the whole post when it reads as mass-produced AI content. The reader can dismiss it. */
function renderCover(e: Entry, state: OverlayState, enabled: boolean, theme: ThemeId, onDismiss: () => void) {
  const show = enabled && !e.slopDismissed && state.status === "done" && !state.result.partial && isSlop(state.result);
  if (!show) { e.cover?.remove(); e.cover = undefined; return; }
  if (!e.cover || !e.cover.isConnected) {
    if (getComputedStyle(e.anchor).position === "static") e.anchor.style.position = "relative";
    const cover = document.createElement("fedo-cover");
    for (const ev of ["click", "mousedown", "pointerdown", "touchstart", "wheel"]) cover.addEventListener(ev, (x) => x.stopPropagation());
    const root = cover.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${OVERLAY_CSS}</style><div class="cover"></div>`;
    e.anchor.appendChild(cover);
    e.cover = cover;
  }
  e.cover.dataset.theme = theme;
  const r = (state as { result: AnalysisResult }).result;
  const top = r.signals.filter((s) => (SLOP_KEYS as readonly string[]).includes(s.key)).sort((a, b) => b.score - a.score)[0]!;
  const box = e.cover.shadowRoot!.querySelector(".cover")!;
  box.innerHTML = `
    <button class="x" aria-label="Show post">×</button>
    <div class="tag">AI slop</div>
    <div class="why">${esc(SIGNALS[top.key].label)} <b>${pct(top.score)}</b>${top.evidence ? ` · <q>${esc(top.evidence)}</q>` : ""}</div>
    <button class="btn secondary show">Show post anyway</button>`;
  box.querySelectorAll("button").forEach((b) => b.addEventListener("click", (ev) => { ev.stopPropagation(); onDismiss(); }));
}

// ── live tracker bookkeeping ───────────────────────────────────────────────────────────
function track(e: Entry, r: AnalysisResult) {
  if (!r.partial && !e.liveStart) return;
  if (!e.liveStart) e.liveStart = Date.now();
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
const visible = (r: AnalysisResult, min: number) => r.signals.filter((s) => s.score >= min && !isTopic(s.key)).sort((a, b) => b.score - a.score);
const topics = (r: AnalysisResult, min: number) => r.signals.filter((s) => s.score >= min && isTopic(s.key));
const topicTag = (r: AnalysisResult, min: number) => topics(r, min).map((s) => `<span class="topic">${esc(SIGNALS[s.key].label.replace(/ content$/i, ""))} topic</span>`).join("");

function renderView(e: Entry, state: OverlayState, minScore: number, cb: boolean): string {
  if (state.status === "pending") {
    const secs = e.pendingSince ? Math.floor((Date.now() - e.pendingSince) / 1000) : 0;
    return `<div class="strip pending"><span class="dot"></span><span class="muted" data-elapsed>${pendingText(secs)}</span><span class="skel w1"></span><span class="skel w2"></span></div>`;
  }
  if (state.status === "error") return `<div class="strip"><span class="muted">Analysis unavailable</span></div>`;

  const { result } = state;
  const shown = visible(result, minScore);
  if (!shown.length && !result.partial) return `<div class="strip muted">${CHECK}No strong signals${topicTag(result, minScore)}</div>`;

  // The strip: LIVE · up to three labels with a category dot · +N · Details ›   (colour only on the dots)
  const live = result.partial ? `<span class="live"><i></i>LIVE</span>` : "";
  const labels = shown.slice(0, 3).map((s) => label(s, cb)).join(`<span class="sep">·</span>`);
  const more = shown.length > 3 ? `<span class="more">+${shown.length - 3}</span>` : "";
  const toggle = `<span class="details">${e.expanded ? "Hide" : "Details"} <span class="chev">${e.expanded ? "‹" : "›"}</span></span>`;
  return `<div class="strip" data-toggle role="button" tabindex="0" aria-expanded="${e.expanded}">${live}<span class="labs">${labels}${more}</span>${topicTag(result, minScore)}${toggle}</div>` + (e.expanded ? panel(e, result, shown, cb) : "");
}

function label(s: Signal, cb: boolean): string {
  const g = groupOf(s.key);
  const mark = cb ? `<span class="glyph">${GLYPH[g]}</span>` : `<span class="k"></span>`;
  return `<span class="lab" data-group="${g}">${mark}${esc(SIGNALS[s.key].label)} <b>${pct(s.score)}</b></span>`;
}

function panel(e: Entry, r: AnalysisResult, shown: Signal[], cb: boolean): string {
  const isLive = !!e.liveStart;
  const tl = r.timeline ?? [];
  const rows = (isLive ? r.signals.filter((s) => s.score >= 0.3 && !isTopic(s.key)).sort((a, b) => b.score - a.score) : shown).map((s) => row(s, cb)).join("");
  const topic = topicTag(r, 0.5);
  const overall = r.overall && r.overall.level !== "none" ? `<span class="lvl">${r.overall.level} · ${pct(r.overall.score)}</span>` : "";
  const status = isLive
    ? (r.partial ? `<span class="live"><i></i>LIVE</span>` : `<span class="t">DONE</span>`) + `<span class="t">${mmss(tl.length ? tl[tl.length - 1]!.t : (Date.now() - e.liveStart!) / 1000)}</span>`
    : `<span class="t">${r.signals.length} signals · ${r.source} · ${r.latencyMs} ms</span>`;
  // the AI's own timeline (t = seconds since video start) beats our derived log
  const events = tl.length ? tl : e.log;
  const log = isLive && events.length ? `<div class="sec">Timeline</div><div class="log">${events.map((l) => logLine(l, cb)).join("")}</div>` : "";
  return `
    <div class="panel${isLive ? " tracker" : ""}">
      <i class="c tl"></i><i class="c tr"></i><i class="c bl"></i><i class="c br"></i>
      <div class="head"><h3>${isLive ? "Live analysis" : "Post analysis"}</h3><div class="meta">${status}</div></div>
      ${overall ? `<div class="overall"><span class="muted">Overall use of persuasion techniques</span>${overall}</div>` : ""}
      ${r.explanation ? `<p class="explain">${esc(r.explanation)}</p>` : ""}
      <div class="sec">Signals ${topic}</div>
      ${rows || `<p class="muted">No technique above the threshold.</p>`}
      ${log}
      <div class="foot"><span class="note">Techniques, not opinions</span><button data-toggle class="btn ghost">Hide ‹</button></div>
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

function logLine(l: { t: number; key: Signal["key"]; evidence?: string }, cb: boolean): string {
  const g = groupOf(l.key);
  const mark = cb ? `<span class="glyph">${GLYPH[g]}</span> ` : `<span class="k"></span>`;
  return `<div><span class="t">${mmss(l.t)}</span><span data-group="${g}">${mark}${esc(SIGNALS[l.key].label)}${l.evidence ? ` · <q>${esc(l.evidence)}</q>` : ""}</span></div>`;
}

const CHECK = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5l3 3 7-7"/></svg>`;
const pct = (score: number) => `${Math.round(score * 100)}%`;
const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
