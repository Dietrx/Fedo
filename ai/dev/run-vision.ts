/**
 * Image understanding end to end: picture(s) → vision → text analysis with the image text → result.
 *   npx tsx ai/dev/run-vision.ts [--jev] [--text "post text"] <image file or https url> [more images…]
 * Local files are sent inline (data: URL); in the extension the scraper's https URLs are passed as they are.
 */
import { existsSync, readFileSync } from "node:fs";
import { SIGNALS, type FeedItem } from "@contracts";
import { createAnalyzer } from "../index";
import { createVision } from "../vision";

if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1]! in process.env)) process.env[m[1]!] = m[2]!;
  }
}
const args = process.argv.slice(2);
const textAt = args.indexOf("--text");
const text = textAt >= 0 ? (args[textAt + 1] ?? "") : "";
const images = args.filter((a, i) => !a.startsWith("--") && i !== textAt + 1 - (textAt < 0 ? 1 : 0) && (textAt < 0 || i !== textAt + 1));
if (!images.length) throw new Error('usage: npx tsx ai/dev/run-vision.ts [--jev] [--text "post text"] <image file or https url> …');

const e = process.env;
const config = {
  // vision is an API feature → the harness always runs an API mode; without --jev the text side still uses Jev config if present
  mode: "jev" as const,
  jevApiUrl: e.JEV_API_URL,
  jevApiKey: e.JEV_API_KEY,
  sttApiUrl: e.STT_API_URL,
  sttApiKey: e.STT_API_KEY,
  sttModel: e.STT_MODEL,
  visionApiUrl: e.VISION_API_URL,
  visionApiKey: e.VISION_API_KEY,
  visionModel: e.VISION_MODEL,
};
const toUrl = (src: string) => (/^https?:/.test(src) ? src : `data:image/${src.endsWith(".png") ? "png" : "jpeg"};base64,${readFileSync(src).toString("base64")}`);
const item: FeedItem = { id: "x:vision-test", platform: "x", author: { handle: "test" }, text, hashtags: [], media: images.map((src) => ({ type: "image" as const, url: toUrl(src) })), scrapedAt: 0 };

const vision = createVision(config);
if (!vision) throw new Error("no vision endpoint: set VISION_API_URL/KEY, or STT_API_URL (…/chat/completions) + STT_API_KEY in .env");
let t0 = Date.now();
const seen = await vision.look(item);
console.log(`vision ${Date.now() - t0}ms:`, seen);

t0 = Date.now();
const result = await createAnalyzer(config).analyze({ kind: "post", item });
console.log(`\nanalysis ${Date.now() - t0}ms · source ${result.source} · coverage ${result.coverage} · ${result.overall?.level} (${result.overall?.score})`);
for (const s of [...result.signals].sort((a, b) => b.score - a.score).filter((s) => s.score >= 0.5)) {
  console.log(`   ${String(Math.round(s.score * 100)).padStart(3)}%  ${SIGNALS[s.key].label}${s.evidence ? `  ← "${s.evidence}"` : ""}`);
}
console.log(`why: ${result.explanation ?? "—"}`);
