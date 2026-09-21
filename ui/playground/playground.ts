/**
 * UI dev playground — fake X feed + fixture results. No extension, no x.com, no AI needed.
 *   npm run dev:ui  → http://localhost:8000  (rebuilds on save, just reload)
 * Theme dropdown = the four design-system themes; the host background flips with it like x.com's light/dark mode.
 */
import { FIXTURE_ITEMS, FIXTURE_RESULTS, type AnalysisResult, type OverlayRenderer } from "@contracts";
import { createOverlay } from "../index";
import type { ThemeId } from "../theme";
import type { Layout } from "../prefs";

const feed = document.getElementById("feed")!;
// extra playground-only case: a paid AI-slop ad (not in contracts/fixtures.ts, so nothing outside ui/ changes)
const SLOP_ITEM = { id: "x:9001", platform: "x" as const, author: { handle: "promo_bot_9000", displayName: "Promo", verified: true }, text: "🚀 Unlock 10x productivity with our revolutionary AI-powered solution! Limited time offer — transform your workflow today! #ad", hashtags: ["ad"], media: [], scrapedAt: 0 };
const SLOP_RESULT: AnalysisResult = { itemId: "x:9001", source: "mock", latencyMs: 90, overall: { level: "medium", score: 0.6 }, explanation: "Generic promotional text with typical patterns of generated content.",
  signals: [{ key: "possible_ai_slop", score: 0.94, evidence: "Unlock 10x productivity" }, { key: "commercial_persuasion", score: 0.9 }, { key: "urgency_language", score: 0.7, evidence: "Limited time offer" }] };
const themeSel = document.getElementById("theme") as HTMLSelectElement;
const layoutSel = document.getElementById("layout") as HTMLSelectElement;
const minSel = document.getElementById("min") as HTMLInputElement;
const anchors = new Map<string, HTMLElement>();
const last = new Map<string, AnalysisResult>();
let overlay: OverlayRenderer;

for (const item of [...FIXTURE_ITEMS, SLOP_ITEM]) {
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
  overlay = createOverlay({ theme, minScore: Number(minSel.value), stats: false, layout: layoutSel.value as Layout, dashboardUrl: "http://localhost:8766/dashboard.html" });
  for (const [id, anchor] of anchors) {
    const r = last.get(id);
    overlay.render(id, anchor, r ? { status: "done", result: r } : { status: "pending" });
  }
}

function replay() {
  last.clear();
  build();
  for (const [id, anchor] of anchors) {
    const result = id === SLOP_RESULT.itemId ? SLOP_RESULT : FIXTURE_RESULTS.find((r) => r.itemId === id);
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
layoutSel.addEventListener("change", build);
minSel.addEventListener("input", () => { document.getElementById("minv")!.textContent = `${Math.round(Number(minSel.value) * 100)}%`; build(); });
document.getElementById("replay")!.addEventListener("click", replay);
document.getElementById("live")!.addEventListener("click", simulateLive);
replay();
