/**
 * PATH 3 — UI. Public entry point. Only this file is imported by the glue code.
 * Contract: render(itemId, anchor, OverlayState) — see contracts/modules.ts.
 * Everything lives inside a Shadow DOM, so X/TikTok CSS can't leak in and ours can't leak out.
 */
import { DEFAULT_SETTINGS, RESEARCH, SIGNALS, type AnalysisResult, type OverlayRenderer, type OverlayState, type Signal } from "@contracts";
import { OVERLAY_CSS } from "./styles";

export interface OverlayOptions {
  minScore?: number;
  /** Dim (never hide) posts with overall level "high"; the reader can always reveal them. */
  calmMode?: boolean;
}

export function createOverlay(opts: OverlayOptions = {}): OverlayRenderer {
  const minScore = opts.minScore ?? DEFAULT_SETTINGS.minScore;
  const calmMode = opts.calmMode ?? false;
  const hosts = new Map<string, { host: HTMLElement; root: ShadowRoot; expanded: boolean; revealed: boolean }>();

  function mount(itemId: string, anchor: HTMLElement) {
    let entry = hosts.get(itemId);
    if (entry && entry.host.isConnected && anchor.contains(entry.host)) return entry;
    entry?.host.remove();

    const host = document.createElement("fedo-overlay");
    // Keep clicks inside our overlay from opening the post on X/TikTok
    for (const ev of ["click", "mousedown", "pointerdown"]) host.addEventListener(ev, (e) => e.stopPropagation());
    const root = host.attachShadow({ mode: "open" });
    anchor.appendChild(host);
    entry = { host, root, expanded: false, revealed: false };
    hosts.set(itemId, entry);
    return entry;
  }

  /** Calm mode: fade the post's own content, keep our bar readable. Undone on reveal / remove / clear. */
  function dim(anchor: HTMLElement, host: HTMLElement, on: boolean) {
    for (const child of Array.from(anchor.children) as HTMLElement[]) {
      if (child === host) continue;
      child.style.opacity = on ? "0.25" : "";
      child.style.transition = "opacity .25s";
    }
  }

  const renderer: OverlayRenderer = {
    render(itemId, anchor, state) {
      const entry = mount(itemId, anchor);
      const dimmed = calmMode && !entry.revealed && state.status === "done" && state.result.overall?.level === "high";
      dim(anchor, entry.host, dimmed);
      entry.root.innerHTML = `<style>${OVERLAY_CSS}</style>${view(state, minScore, entry.expanded, dimmed)}`;
      entry.root.querySelector("[data-toggle]")?.addEventListener("click", () => {
        entry.expanded = !entry.expanded;
        renderer.render(itemId, anchor, state);
      });
      entry.root.querySelector("[data-reveal]")?.addEventListener("click", () => {
        entry.revealed = true;
        renderer.render(itemId, anchor, state);
      });
    },
    remove(itemId) {
      const entry = hosts.get(itemId);
      if (entry?.host.parentElement) dim(entry.host.parentElement, entry.host, false);
      entry?.host.remove();
      hosts.delete(itemId);
    },
    clear() {
      for (const id of Array.from(hosts.keys())) renderer.remove(id);
    },
  };
  return renderer;
}

function view(state: OverlayState, minScore: number, expanded: boolean, dimmed: boolean): string {
  if (state.status === "pending") return `<div class="bar pending"><span class="dot"></span>Analyzing…</div>`;
  if (state.status === "error") return `<div class="bar error">Analysis unavailable</div>`;

  const { result } = state;
  // No verdict without enough text: a green check here would be a false "clean".
  if (result.coverage === "insufficient") return `<div class="bar muted">– Not enough text to assess</div>`;

  const shown = result.signals.filter((s) => s.score >= minScore).sort((a, b) => b.score - a.score);
  const textOnly = result.coverage === "text_only" ? `<span class="tag" title="Images and video are not analyzed yet">text only</span>` : "";
  if (!shown.length) return `<div class="bar clean">✓ No strong manipulation signals in the text ${textOnly}</div>`;

  const chips = shown.slice(0, 3).map(chip).join("");
  const more = shown.length > 3 ? `<span class="more">+${shown.length - 3}</span>` : "";
  const live = result.partial ? `<span class="live">LIVE</span>` : "";
  const reveal = dimmed ? `<button data-reveal class="why">Show post</button>` : "";

  return `
    <div class="bar">
      ${live}${badge(result)}${chips}${more}${textOnly}
      <span class="actions">${reveal}<button data-toggle class="why">${expanded ? "Hide" : "Why?"}</button></span>
    </div>
    ${expanded ? details(shown, result.explanation) : ""}`;
}

/** Overall intensity per post (from `result.overall`, optional in the contract). */
function badge(result: AnalysisResult): string {
  const o = result.overall;
  if (!o || o.level === "none") return "";
  const cls = o.level === "high" ? "high" : o.level === "medium" ? "mid" : "low";
  const label = o.level === "high" ? "High" : o.level === "medium" ? "Medium" : "Low";
  return `<span class="badge ${cls}" title="How heavily persuasion techniques are used overall (${pct(o.score)}). Not a truth or intent rating.">${label}</span>`;
}

function chip(s: Signal): string {
  return `<span class="chip ${level(s.score)}">${esc(SIGNALS[s.key].label)} <b>${pct(s.score)}</b></span>`;
}

function details(signals: Signal[], explanation?: string): string {
  const rows = signals
    .map(
      (s) => `
      <div class="row" title="${esc(SIGNALS[s.key].description)}">
        <span class="label">${esc(SIGNALS[s.key].label)}</span>
        <span class="meter"><span class="fill ${level(s.score)}" style="width:${pct(s.score)}"></span></span>
        <span class="val">${pct(s.score)}</span>
        ${s.evidence ? `<span class="evidence">“${esc(s.evidence)}”</span>` : ""}
      </div>`,
    )
    .join("");
  const research = signals.map((s) => RESEARCH[s.key]).find(Boolean);
  return `
    <div class="panel">
      ${explanation ? `<p class="explain">${esc(explanation)}</p>` : ""}
      ${rows}
      ${research ? `<p class="research">Research: ${esc(research)}</p>` : ""}
      <p class="note">Signals describe persuasion techniques, not whether an opinion is right. Nothing is ever hidden from you.</p>
    </div>`;
}

const level = (score: number) => (score >= 0.85 ? "high" : score >= 0.65 ? "mid" : "low");
const pct = (score: number) => `${Math.round(score * 100)}%`;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
