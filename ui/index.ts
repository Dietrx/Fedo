/**
 * PATH 3 — UI. Public entry point. Only this file is imported by the glue code.
 * Contract: render(itemId, anchor, OverlayState) — see contracts/modules.ts.
 * Everything lives inside a Shadow DOM, so X/TikTok CSS can't leak in and ours can't leak out.
 */
import { DEFAULT_SETTINGS, SIGNALS, type OverlayRenderer, type OverlayState, type Signal } from "@contracts";
import { OVERLAY_CSS } from "./styles";

export interface OverlayOptions {
  minScore?: number;
}

export function createOverlay(opts: OverlayOptions = {}): OverlayRenderer {
  const minScore = opts.minScore ?? DEFAULT_SETTINGS.minScore;
  const hosts = new Map<string, { host: HTMLElement; root: ShadowRoot; expanded: boolean }>();

  function mount(itemId: string, anchor: HTMLElement) {
    let entry = hosts.get(itemId);
    if (entry && entry.host.isConnected && anchor.contains(entry.host)) return entry;
    entry?.host.remove();

    const host = document.createElement("fedo-overlay");
    // Keep clicks inside our overlay from opening the post on X/TikTok
    for (const ev of ["click", "mousedown", "pointerdown"]) host.addEventListener(ev, (e) => e.stopPropagation());
    const root = host.attachShadow({ mode: "open" });
    anchor.appendChild(host);
    entry = { host, root, expanded: false };
    hosts.set(itemId, entry);
    return entry;
  }

  return {
    render(itemId, anchor, state) {
      const entry = mount(itemId, anchor);
      entry.root.innerHTML = `<style>${OVERLAY_CSS}</style>${view(state, minScore, entry.expanded)}`;
      entry.root.querySelector("[data-toggle]")?.addEventListener("click", () => {
        entry.expanded = !entry.expanded;
        this.render(itemId, anchor, state);
      });
    },
    remove(itemId) {
      hosts.get(itemId)?.host.remove();
      hosts.delete(itemId);
    },
    clear() {
      hosts.forEach((e) => e.host.remove());
      hosts.clear();
    },
  };
}

function view(state: OverlayState, minScore: number, expanded: boolean): string {
  if (state.status === "pending") return `<div class="bar pending"><span class="dot"></span>Analyzing…</div>`;
  if (state.status === "error") return `<div class="bar error">Analysis unavailable</div>`;

  const { result } = state;
  const shown = result.signals.filter((s) => s.score >= minScore).sort((a, b) => b.score - a.score);
  if (!shown.length) return `<div class="bar clean">✓ No strong manipulation signals</div>`;

  const chips = shown.slice(0, 3).map(chip).join("");
  const more = shown.length > 3 ? `<span class="more">+${shown.length - 3}</span>` : "";
  const live = result.partial ? `<span class="live">LIVE</span>` : "";

  return `
    <div class="bar">
      ${live}${chips}${more}
      <button data-toggle class="why">${expanded ? "Hide" : "Why?"}</button>
    </div>
    ${expanded ? details(shown, result.explanation) : ""}`;
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
  return `
    <div class="panel">
      ${explanation ? `<p class="explain">${esc(explanation)}</p>` : ""}
      ${rows}
      <p class="note">Signals describe persuasion techniques, not whether an opinion is right.</p>
    </div>`;
}

const level = (score: number) => (score >= 0.85 ? "high" : score >= 0.65 ? "mid" : "low");
const pct = (score: number) => `${Math.round(score * 100)}%`;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
