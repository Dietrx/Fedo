/**
 * Builds the Chrome extension into dist/.
 *   node scripts/build.mjs [--watch] [--analyzer=mock|jev]
 * Then: chrome://extensions → Developer mode → "Load unpacked" → select dist/
 */
import * as esbuild from "esbuild";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { loadEnv } from "./env.mjs";

const args = process.argv.slice(2);
const watch = args.includes("--watch");
const env = loadEnv();
const mode = args.find((a) => a.startsWith("--analyzer="))?.split("=")[1] ?? env.FEDO_ANALYZER ?? "mock";

const config = {
  mode,
  jevApiUrl: env.JEV_API_URL || undefined,
  jevApiKey: env.JEV_API_KEY || undefined,
  sttApiUrl: env.STT_API_URL || undefined,
  sttApiKey: env.STT_API_KEY || undefined,
  sttModel: env.STT_MODEL || undefined,
  visionApiUrl: env.VISION_API_URL || undefined,
  visionApiKey: env.VISION_API_KEY || undefined,
  visionModel: env.VISION_MODEL || undefined,
};

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });
// Host permissions: only the analyzer API origin (if any) — never every site.
const manifest = JSON.parse(readFileSync("extension/manifest.json", "utf8"));
manifest.host_permissions = [...new Set([config.jevApiUrl, config.sttApiUrl, config.visionApiUrl].filter(Boolean).map((u) => new URL(u).origin + "/*"))];
writeFileSync("dist/manifest.json", JSON.stringify(manifest, null, 2));
cpSync("ui/popup/popup.html", "dist/popup.html");
cpSync("ui/dashboard/dashboard.html", "dist/dashboard.html");

const common = {
  bundle: true,
  target: "chrome120",
  sourcemap: "inline",
  logLevel: "info",
  define: { __FEDO_CONFIG__: JSON.stringify(config) },
};

const builds = [
  { ...common, entryPoints: ["extension/src/background.ts"], outfile: "dist/background.js", format: "esm" },
  { ...common, entryPoints: ["extension/src/content.ts"], outfile: "dist/content.js", format: "iife" },
  // scraper's MAIN-world script (page world, see extension/manifest.json content_scripts[0])
  { ...common, entryPoints: ["scraper/main-world.ts"], outfile: "dist/main-world.js", format: "iife" },
  { ...common, entryPoints: ["ui/popup/popup.ts"], outfile: "dist/popup.js", format: "iife" },
  { ...common, entryPoints: ["ui/dashboard/dashboard.ts"], outfile: "dist/dashboard.js", format: "iife" },
];

console.log(`[fedo] analyzer mode: ${mode}, speech-to-text: ${config.sttApiUrl ? "on" : "off (no STT_API_URL)"}`);
if (watch) {
  for (const b of builds) await (await esbuild.context(b)).watch();
  console.log("[fedo] watching… reload the extension in chrome://extensions after changes");
} else {
  await Promise.all(builds.map((b) => esbuild.build(b)));
}
