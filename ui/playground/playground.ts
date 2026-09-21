/**
 * UI dev playground — fake X feed + fixture results. No extension, no x.com, no AI needed.
 *   npm run dev:ui  → http://localhost:8000  (rebuilds on save, just reload)
 */
import { FIXTURE_ITEMS, FIXTURE_RESULTS, type AnalysisResult, type TimelineEvent, type VideoProgress } from "@contracts";
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

/**
 * Simulates a 45-second video that is being listened to: the speech-to-text delivers a chunk every
 * ~8 s of video time, the scores grow, the timeline fills, the progress strip counts down.
 */
function simulateLive() {
  const base = FIXTURE_RESULTS.find((r) => r.itemId === "tiktok:2001")!;
  const anchor = anchors.get(base.itemId)!;
  const DURATION = 45;
  const CHUNK = 8;
  const EVENTS: TimelineEvent[] = [
    { t: 3, key: "conspiracy_framing", score: 0.9, evidence: "what the government is hiding" },
    { t: 11, key: "us_vs_them", score: 0.71, evidence: "they are lying to you" },
    { t: 19, key: "sensationalism", score: 0.88, evidence: "nobody wants you to know" },
    { t: 31, key: "urgency_language", score: 0.8, evidence: "time we fight back" },
  ];
  // first: listening, nothing transcribed yet
  overlay.render(base.itemId, anchor, { status: "pending", progress: { phase: "transcribing", coveredSec: 0, durationSec: DURATION, etaAt: Date.now() + (DURATION + 6) * 1000 } });
  let covered = 0;
  const timer = setInterval(() => {
    covered = Math.min(DURATION, covered + CHUNK);
    const f = covered / DURATION;
    const done = covered >= DURATION;
    const progress: VideoProgress = { phase: done ? "done" : "listening", coveredSec: covered, durationSec: DURATION, etaAt: done ? undefined : Date.now() + (DURATION - covered + 6) * 1000 };
    const result: AnalysisResult = {
      ...base,
      partial: !done,
      signals: base.signals.map((s) => ({ ...s, score: Math.min(s.score, s.score * (0.4 + f)) })),
      timeline: EVENTS.filter((e) => e.t <= covered),
    };
    overlay.render(base.itemId, anchor, { status: "done", result, progress });
    if (done) clearInterval(timer);
  }, 1500);
}

document.getElementById("replay")!.addEventListener("click", replay);
document.getElementById("live")!.addEventListener("click", simulateLive);
replay();
