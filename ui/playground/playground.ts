/**
 * UI dev playground — fake X feed + fixture results. No extension, no x.com, no AI needed.
 *   npm run dev:ui  → http://localhost:8000  (rebuilds on save, just reload)
 */
import { FIXTURE_ITEMS, FIXTURE_RESULTS, type AnalysisResult } from "@contracts";
import { createOverlay } from "../index";

const overlay = createOverlay();
const feed = document.getElementById("feed")!;
const anchors = new Map<string, HTMLElement>();

for (const item of FIXTURE_ITEMS) {
  const el = document.createElement("article");
  const img = item.media.find((m) => m.type === "image");
  el.innerHTML = `
    <div class="author">${item.author.displayName ?? item.author.handle} <span class="handle">@${item.author.handle}</span></div>
    <div class="text">${item.text}${img ? `<img src="${img.url}">` : ""}</div>`;
  feed.appendChild(el);
  anchors.set(item.id, el);
}

function replay() {
  for (const [id, anchor] of anchors) {
    overlay.render(id, anchor, { status: "pending" });
    const result = FIXTURE_RESULTS.find((r) => r.itemId === id);
    setTimeout(
      () => overlay.render(id, anchor, result ? { status: "done", result } : { status: "error", message: "no fixture" }),
      400 + Math.random() * 1200,
    );
  }
}

/** Simulates a video whose scores grow as the speaker talks. */
function simulateLive() {
  const base = FIXTURE_RESULTS.find((r) => r.itemId === "tiktok:2001")!;
  const anchor = anchors.get(base.itemId)!;
  let step = 0;
  const timer = setInterval(() => {
    step++;
    const f = Math.min(1, step / 6);
    const result: AnalysisResult = { ...base, partial: f < 1, signals: base.signals.map((s) => ({ ...s, score: s.score * f })) };
    overlay.render(base.itemId, anchor, { status: "done", result });
    if (f >= 1) clearInterval(timer);
  }, 800);
}

document.getElementById("replay")!.addEventListener("click", replay);
document.getElementById("live")!.addEventListener("click", simulateLive);
replay();
