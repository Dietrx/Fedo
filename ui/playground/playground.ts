/**
 * UI dev playground — fake X feed + fixture results. No extension, no x.com, no AI needed.
 *   npm run dev:ui  → http://localhost:8000  (rebuilds on save, just reload)
 * Theme dropdown = the four design-system themes; the host background flips with it like x.com's light/dark mode.
 */
import { FIXTURE_ITEMS, FIXTURE_RESULTS, type AnalysisResult, type OverlayRenderer } from "@contracts";
import { createOverlay } from "../index";
import type { ThemeId } from "../theme";

const feed = document.getElementById("feed")!;
const themeSel = document.getElementById("theme") as HTMLSelectElement;
const minSel = document.getElementById("min") as HTMLInputElement;
const anchors = new Map<string, HTMLElement>();
const last = new Map<string, AnalysisResult>();
let overlay: OverlayRenderer;

for (const item of FIXTURE_ITEMS) {
  const el = document.createElement("article");
  const img = item.media.find((m) => m.type === "image");
  el.innerHTML = `
    <div class="author">${item.author.displayName ?? item.author.handle} <span class="handle">@${item.author.handle}${item.media.some((m) => m.type === "video") ? " · video" : ""}</span></div>
    <div class="text">${item.text}${img ? `<img src="${img.url}">` : ""}</div>`;
  feed.appendChild(el);
  anchors.set(item.id, el);
}

function build() {
  overlay?.clear();
  const theme = themeSel.value as ThemeId;
  document.body.classList.toggle("light", theme.startsWith("light"));
  overlay = createOverlay({ theme, minScore: Number(minSel.value), stats: false });
  for (const [id, anchor] of anchors) {
    const r = last.get(id);
    overlay.render(id, anchor, r ? { status: "done", result: r } : { status: "pending" });
  }
}

function replay() {
  last.clear();
  build();
  for (const [id, anchor] of anchors) {
    const result = FIXTURE_RESULTS.find((r) => r.itemId === id);
    setTimeout(() => {
      if (result) last.set(id, result);
      overlay.render(id, anchor, result ? { status: "done", result } : { status: "error", message: "no fixture" });
    }, 400 + Math.random() * 1200);
  }
}

/** Simulates a video whose scores grow as the speaker talks; evidence quotes arrive one by one. */
function simulateLive() {
  const base = FIXTURE_RESULTS.find((r) => r.itemId === "tiktok:2001")!;
  const anchor = anchors.get(base.itemId)!;
  overlay.remove(base.itemId); // fresh tracker: clock and log start now
  overlay.render(base.itemId, anchor, { status: "pending" });
  let step = 0;
  const timer = setInterval(() => {
    step++;
    const f = Math.min(1, step / 8);
    const result: AnalysisResult = {
      ...base, partial: f < 1,
      signals: base.signals.map((s, i) => ({ ...s, score: Math.min(s.score, s.score * f * (1 + i * 0.15)), evidence: f * (1 + i * 0.15) > 0.55 ? s.evidence : undefined })),
    };
    last.set(base.itemId, result);
    overlay.render(base.itemId, anchor, { status: "done", result });
    if (f >= 1) clearInterval(timer);
  }, 900);
}

themeSel.addEventListener("change", build);
minSel.addEventListener("input", () => { document.getElementById("minv")!.textContent = `${Math.round(Number(minSel.value) * 100)}%`; build(); });
document.getElementById("replay")!.addEventListener("click", replay);
document.getElementById("live")!.addEventListener("click", simulateLive);
replay();
