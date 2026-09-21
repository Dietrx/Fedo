/**
 * PATH 3 — UI. Public entry point. Only this file is imported by the glue code.
 * Contract: render(itemId, anchor, OverlayState) — see contracts/modules.ts.
 * Everything lives inside a Shadow DOM, so X/TikTok CSS can't leak in and ours can't leak out.
 *
 * Design rules (see the Fedo Shield design system):
 *   colour = category of the technique, fill weight = strength, red = LIVE only, always a label next to a colour.
 */
import { DEFAULT_SETTINGS, RESEARCH, SIGNALS, type AnalysisResult, type OverlayRenderer, type OverlayState, type Signal, type VideoProgress } from "@contracts";
import { loadPrefs, onStorageChange, bumpStats, DEFAULT_PREFS, type Layout, type UiPrefs } from "./prefs";
import { appendLog, authorFrom, entryFrom } from "./log";
import { GLYPH, groupOf, hostIsDark, isTopic, rankSignals, resolveTheme, type ThemeId } from "./theme";
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
  /** Calm mode: dim (never hide) posts whose overall level is "high" until the reader reveals them. Follows Settings.calmMode. */
  calmMode?: boolean;
}

interface Entry {
  host: HTMLElement;
  root: ShadowRoot;
  anchor: HTMLElement;
  state: OverlayState;
  /** "Under post" layout: is the panel open? (the top-right card has one shared switch instead) */
  expanded: boolean;
  /** techniques whose "what is this / research" box is open, and whether all techniques are listed instead of the top five */
  why: Set<string>;
  showAll: boolean;
  /** last meter widths, so a re-render animates from the previous value */
  widths: Map<string, number>;
  /** live tracker: when the first partial result arrived, and the moments logged so far */
  liveStart?: number;
  log: { t: number; key: Signal["key"]; evidence?: string }[];
  peak: Map<string, number>;
  counted: boolean;
  /** when the pending state started (for "still analyzing · 4s") */
  pendingSince?: number;
  /** calm mode: the reader chose to see this dimmed post */
  revealed: boolean;
  /** full-post cover for AI slop, and whether the reader dismissed it */
  cover?: HTMLElement;
  slopDismissed: boolean;
}

export function createOverlay(opts: OverlayOptions = {}): OverlayRenderer {
  let minScore = opts.minScore ?? DEFAULT_SETTINGS.minScore;
  let calmMode = opts.calmMode ?? DEFAULT_SETTINGS.calmMode ?? false;
  let prefs: UiPrefs = DEFAULT_PREFS;
  let forcedTheme = opts.theme;
  const countStats = opts.stats ?? true;
  const entries = new Map<string, Entry>();
  const layout = (): Layout => opts.layout ?? prefs.layout;

  const theme = (): ThemeId => forcedTheme ?? resolveTheme(prefs.theme, prefs.colorBlind, hostIsDark());

  // ── HUD: one fixed panel that follows the post most in view ─────────────────────────
  let hud: { host: HTMLElement; root: ShadowRoot } | undefined;
  let currentId: string | undefined;
  /** The card is open by default. Collapsing it holds for every following post until the page reloads (not stored). */
  let hudCollapsed = false;
  let hudShownId: string | undefined;
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
      <div class="top"><span class="brand">Fedo <span data-count></span></span><button class="dash" data-dash>Dashboard ↗</button><button class="fold" data-fold>${CHEVRON}</button></div>
      <div class="who" data-who></div><div class="view"></div></div>`;
    root.querySelector("[data-fold]")!.addEventListener("click", () => { hudCollapsed = !hudCollapsed; renderHud(); });
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
    const fold = hud.root.querySelector("[data-fold]")!;
    fold.setAttribute("aria-expanded", String(!hudCollapsed));
    fold.setAttribute("aria-label", hudCollapsed ? "Expand the Fedo card" : "Collapse the Fedo card");
    const e = currentId ? entries.get(currentId) : undefined;
    const who = hud.root.querySelector("[data-who]")!, view = hud.root.querySelector(".view")!, prog = hud.root.querySelector(".prog")!;
    if (!e) { hudShownId = undefined; who.innerHTML = ""; prog.className = "prog"; view.innerHTML = `<div class="idle">Scroll — Fedo analyzes each post as it comes into view.</div>`; return; }
    const id = currentId!;
    const a = authorFrom(e.anchor);
    setProg(prog, e.state);
    const dim = calmMode && !e.revealed && e.state.status === "done" && e.state.result.overall?.level === "high";
    // the card body is the panel itself, so the tags (topic, text only, countdown, "Dimmed · Show") sit next to the author
    who.innerHTML = `<span class="name">${a.displayName ? `<b>${esc(a.displayName)}</b> ` : ""}@${esc(a.handle)}</span>${e.state.status === "done" ? tags(e.state, minScore, dim) : ""}`;
    // fade only when another post takes over; a tap inside the card must not flicker or lose the scroll position
    const scrolled = hudShownId === id ? view.querySelector(".body")?.scrollTop ?? 0 : 0;
    view.innerHTML = `<div class="body${hudShownId === id ? "" : " swap"}">${renderView(e, e.state, { minScore, cb: theme().endsWith("-cb"), dim, open: !hudCollapsed, hud: true })}</div>`;
    view.querySelector(".body")!.scrollTop = scrolled;
    hudShownId = id;
    for (const part of [who, view]) wire(part, e, id, () => { hudCollapsed = !hudCollapsed; renderHud(); }, renderHud);
    animateMeters({ ...e, root: hud.root } as Entry);
  }

  /** Click + keyboard wiring of one rendered view. `toggle` opens/closes it, `again` re-renders it (and keeps the focus where it was). */
  function wire(root: Element, e: Entry, id: string, toggle: () => void, again: () => void) {
    const on = (sel: string, fn: (el: HTMLElement) => void) => root.querySelectorAll<HTMLElement>(sel).forEach((el) => {
      el.addEventListener("click", (ev) => { ev.stopPropagation(); fn(el); });
      if (el.tagName !== "BUTTON") el.addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); ev.stopPropagation(); fn(el); } });
    });
    on("[data-toggle]", toggle);
    on("[data-reveal]", () => { e.revealed = true; api.render(id, e.anchor, e.state); });
    on("[data-why]", (el) => { const key = el.dataset.why!; if (!e.why.delete(key)) e.why.add(key); again(); root.querySelector<HTMLElement>(`[data-why="${CSS.escape(key)}"]`)?.focus(); });
    on("[data-all]", () => { e.showAll = !e.showAll; again(); root.querySelector<HTMLElement>("[data-all]")?.focus(); });
  }

  // Live updates: popup Appearance / colour-blind switch, and the background's settings (minScore, enabled).
  if (!forcedTheme) loadPrefs().then((p) => { prefs = p; rerenderAll(); });
  onStorageChange((c) => {
    if (c.prefs) prefs = c.prefs;
    if (c.settings) {
      if (typeof c.settings.minScore === "number") minScore = c.settings.minScore;
      if (typeof c.settings.calmMode === "boolean") calmMode = c.settings.calmMode;
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
    // video ETA countdown ("full result in 12s")
    for (const e of entries.values()) {
      const eta = e.state.status !== "error" ? e.state.progress?.etaAt : undefined;
      if (!eta) continue;
      const t = etaText(eta);
      e.root.querySelectorAll("[data-eta]").forEach((el) => (el.textContent = t));
      if (hud && currentId === e.host.dataset.fedoId) hud.root.querySelectorAll("[data-eta]").forEach((el) => (el.textContent = t));
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
    e = { host, root, anchor, state: { status: "pending" }, expanded: false, why: new Set(), showAll: false, widths: new Map(), log: [], peak: new Map(), counted: false, slopDismissed: false, revealed: false };
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
      setProg(prog, state);
      // calm mode: dim, never hide
      const dim = calmMode && !e.revealed && state.status === "done" && state.result.overall?.level === "high";
      anchor.style.opacity = dim ? "0.35" : "";
      anchor.style.transition = "opacity .2s";
      const view = e.root.querySelector(".view")!;
      view.innerHTML = renderView(e, state, { minScore, cb: theme().endsWith("-cb"), dim, open: e.expanded, hud: false });
      const again = () => api.render(itemId, anchor, e.state);
      wire(view, e, itemId, () => { e.expanded = !e.expanded; again(); }, again);
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

/** The 2px line: real video progress (coveredSec / durationSec) when the glue reports it, else the eased "AI is working" fill. */
function setProg(prog: Element, state: OverlayState) {
  const vp = state.status !== "error" ? state.progress : undefined;
  const bar = prog.querySelector<HTMLElement>("i");
  if (vp && vp.phase !== "unavailable" && vp.durationSec && bar) {
    prog.className = `prog video${vp.phase === "muted" ? " muted" : ""}`;
    bar.style.width = `${Math.min(100, (vp.coveredSec / vp.durationSec) * 100)}%`;
    return;
  }
  if (bar) bar.style.width = "";
  prog.className = `prog ${progClass(state)}`;
}
const phaseText = (p: VideoProgress) =>
  p.phase === "muted" ? "Unmute the video to analyze the speech" :
  p.phase === "listening" ? "Listening to the video" :
  p.phase === "transcribing" ? (p.coveredSec ? `Listening · ${mmss(p.coveredSec)}${p.durationSec ? ` / ${mmss(p.durationSec)}` : ""}` : "Listening… first result in a few seconds") :
  p.phase === "done" ? "Whole video analyzed" : "";
const etaText = (etaAt: number) => { const s = Math.max(0, Math.round((etaAt - Date.now()) / 1000)); return s ? `full result in ${s}s` : "finishing…"; };
const etaSpan = (p?: VideoProgress) => (p && p.phase !== "unavailable" && p.phase !== "done" && p.etaAt ? `<span class="t" data-eta>${etaText(p.etaAt)}</span>` : "");
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

/** How many techniques the panel lists before "Show all". */
const TOP_N = 5;

interface ViewCtx {
  minScore: number;
  /** colour-blind theme: shape glyphs instead of colour dots */
  cb: boolean;
  /** calm mode dims this post */
  dim: boolean;
  open: boolean;
  /** top-right card (tags sit next to the author, the fold button sits in the header) vs. the line under a post */
  hud: boolean;
}

/** The quiet tags of a finished result: text only · topic · video countdown · "Dimmed · Show". */
function tags(state: Extract<OverlayState, { status: "done" }>, minScore: number, dim: boolean): string {
  const textOnly = state.result.coverage === "text_only" ? `<span class="topic" title="Images and video are not analyzed yet">text only</span>` : "";
  const reveal = dim ? `<button data-reveal class="btn ghost small">Dimmed · Show</button>` : "";
  return `${textOnly}${topicTag(state.result, minScore)}${etaSpan(state.progress)}${reveal}`;
}

function renderView(e: Entry, state: OverlayState, c: ViewCtx): string {
  const vp = state.status !== "error" ? state.progress : undefined;
  if (state.status === "pending") {
    // an open card keeps its height while the AI works, so it doesn't jump on every scroll
    const skeleton = c.hud && c.open ? SKELETON : "";
    if (vp && vp.phase !== "unavailable") return `<div class="strip pending"><span class="dot"></span><span class="muted">${phaseText(vp)}</span>${etaSpan(vp)}</div>${skeleton}`;
    const secs = e.pendingSince ? Math.floor((Date.now() - e.pendingSince) / 1000) : 0;
    return `<div class="strip pending"><span class="dot"></span><span class="muted" data-elapsed>${pendingText(secs)}</span><span class="skel w1"></span><span class="skel w2"></span></div>${skeleton}`;
  }
  if (state.status === "error") return `<div class="strip"><span class="muted">Analysis unavailable</span></div>`;

  const { result } = state;
  const shown = visible(result, c.minScore);
  // coverage: never a clean check when the analysis could not really see the item → no bars either, five 2% bars would read as "clean"
  if (result.coverage === "insufficient" && !shown.length) return `<div class="strip muted">Not enough text to assess</div>`;
  // the open card IS the panel: no summary line repeating its first row
  if (c.hud && c.open) return panel(e, result, shown, c);

  // The strip: LIVE · up to three labels with a category dot · +N · Details ›   (colour only on the dots)
  const clean = !shown.length && !result.partial;
  const live = result.partial ? `<span class="live"><i></i>LIVE</span>` : "";
  const lvl = c.hud && result.overall && result.overall.level !== "none" ? `<span class="lvl">${result.overall.level}</span>` : "";
  const labels = clean ? "No strong signals" : shown.slice(0, 3).map((s) => label(s, c.cb)).join(`<span class="sep">·</span>`);
  const more = shown.length > 3 ? `<span class="more">+${shown.length - 3}</span>` : "";
  const toggle = c.hud ? "" : `<span class="details">${c.open ? "Hide" : "Details"} <span class="chev">${c.open ? "‹" : "›"}</span></span>`;
  return `<div class="strip${clean ? " muted" : ""}" data-toggle role="button" tabindex="0" aria-expanded="${c.open}">${live}${clean ? CHECK : ""}${lvl}<span class="labs">${labels}${more}</span>${c.hud ? "" : tags(state, c.minScore, c.dim)}${toggle}</div>` + (c.open ? panel(e, result, shown, c) : "");
}

function label(s: Signal, cb: boolean): string {
  const g = groupOf(s.key);
  const mark = cb ? `<span class="glyph">${GLYPH[g]}</span>` : `<span class="k"></span>`;
  return `<span class="lab" data-group="${g}">${mark}${esc(SIGNALS[s.key].label)} <b>${pct(s.score)}</b></span>`;
}

/**
 * The panel: overall level as the title, then a ranking of the strongest techniques as bars.
 * The ranking is always there, also for a clean post (small grey bars): what was measured is shown, what is
 * below the threshold is shown quietly and still counts nowhere (`shown` = the techniques at or above it).
 */
function panel(e: Entry, r: AnalysisResult, shown: Signal[], c: ViewCtx): string {
  const isLive = !!e.liveStart;
  const tl = r.timeline ?? [];
  const all = rankSignals(r.signals);
  const rows = (e.showAll ? all : all.slice(0, TOP_N)).map((s, i) => row(s, i + 1, c, e.why.has(s.key))).join("");
  const allBtn = all.length > TOP_N ? `<button class="all" data-all aria-expanded="${e.showAll}">${e.showAll ? `Show top ${TOP_N}` : `Show all ${all.length}`} <span class="chev">${e.showAll ? "‹" : "›"}</span></button>` : "";
  const ov = r.overall && r.overall.level !== "none" ? r.overall : undefined;
  const title = ov ? `<h3 class="level">${ov.level}</h3><span class="score">${pct(ov.score)}</span>` : `<h3 class="level calm">${r.partial ? "Listening" : `${CHECK}No strong signals`}</h3>`;
  const status = isLive
    ? `<div class="status">${r.partial ? `<span class="live"><i></i>LIVE</span>` : `<span class="t">DONE</span>`}<span class="t">${mmss(tl.length ? tl[tl.length - 1]!.t : (Date.now() - e.liveStart!) / 1000)}</span></div>`
    : "";
  // the AI's own timeline (t = seconds since video start) beats our derived log
  const events = tl.length ? tl : e.log;
  const log = isLive && events.length ? `<div class="sec">Timeline</div><div class="log">${events.map((l) => logLine(l, c.cb)).join("")}</div>` : "";
  return `
    <div class="panel${isLive ? " tracker" : ""}">
      <i class="c tl"></i><i class="c tr"></i><i class="c bl"></i><i class="c br"></i>
      ${status}
      <div class="sum">
        <div class="lv">${title}</div>
        <div class="meter ov"><span class="fill" data-key="overall" data-w="${ov ? Math.round(ov.score * 100) : 0}"></span></div>
        <p class="cap">Persuasion techniques · ${shown.length} of ${all.length} above ${pct(c.minScore)}</p>
      </div>
      ${r.explanation ? `<p class="explain">${esc(r.explanation)}</p>` : ""}
      <div class="sec">Top techniques</div>
      <div class="rows" style="--th:${Math.round(c.minScore * 100)}%">${rows || `<p class="muted">No technique was measured.</p>`}</div>
      ${allBtn}
      ${log}
      <div class="foot">${r.explanation ? "" : `<span class="note">Techniques, not opinions</span>`}<span class="meta">${esc(r.source)} · ${r.latencyMs} ms</span></div>
    </div>`;
}

/** One technique: rank · label · score, its bar, the quote. Tapping it opens what the technique means and the research behind it. */
function row(s: Signal, rank: number, c: ViewCtx, open: boolean): string {
  const g = groupOf(s.key);
  const weak = s.score < c.minScore;
  const mark = c.cb ? `<span class="glyph">${GLYPH[g]}</span>` : `<span class="sw"></span>`;
  const quote = s.evidence ? `<div class="ev"><q>${esc(s.evidence)}</q></div>` : "";
  const research = RESEARCH[s.key];
  const why = open ? `<div class="whybox"><p>${esc(SIGNALS[s.key].description)}</p>${weak ? quote : ""}${research ? `<p class="src">${esc(research)}</p>` : ""}</div>` : "";
  return `
    <div class="row${weak ? " weak" : ""}" data-group="${g}">
      <button class="rbtn" data-why="${esc(s.key)}" aria-expanded="${open}">
        <span class="rank">${rank}</span><span class="lbl">${mark}<span class="name">${esc(SIGNALS[s.key].label)}</span></span><span class="val">${pct(s.score)}</span>
      </button>
      <div class="meter"><span class="fill" data-key="${esc(s.key)}" data-w="${Math.round(s.score * 100)}"></span></div>
      ${weak ? "" : quote}
      ${why}
    </div>`;
}

function logLine(l: { t: number; key: Signal["key"]; evidence?: string }, cb: boolean): string {
  const g = groupOf(l.key);
  const mark = cb ? `<span class="glyph">${GLYPH[g]}</span> ` : `<span class="k"></span>`;
  return `<div><span class="t">${mmss(l.t)}</span><span data-group="${g}">${mark}${esc(SIGNALS[l.key].label)}${l.evidence ? ` · <q>${esc(l.evidence)}</q>` : ""}</span></div>`;
}

const CHECK = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5l3 3 7-7"/></svg>`;
const CHEVRON = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 10l4.5-4.5 4.5 4.5"/></svg>`;
const SKELETON = `<div class="panel skeleton" aria-hidden="true"><span class="skel title"></span><span class="skel bar"></span>${`<span class="skel line"></span>`.repeat(TOP_N)}</div>`;
const pct = (score: number) => `${Math.round(score * 100)}%`;
const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
