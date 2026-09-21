/**
 * Builds the Chrome extension into dist/.
 *   node scripts/build.mjs [--watch] [--analyzer=mock|jev]
 * Then: chrome://extensions → Developer mode → "Load unpacked" → select dist/
 */
import * as esbuild from "esbuild";
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { loadEnv } from "./env.mjs";

const args = process.argv.slice(2);
const watch = args.includes("--watch");
const env = loadEnv();
const mode = args.find((a) => a.startsWith("--analyzer="))?.split("=")[1] ?? env.FEDO_ANALYZER ?? "mock";

const config = { mode, jevApiUrl: env.JEV_API_URL || undefined, jevApiKey: env.JEV_API_KEY || undefined };

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });
cpSync("extension/manifest.json", "dist/manifest.json");
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

console.log(`[fedo] analyzer mode: ${mode}`);
if (watch) {
  for (const b of builds) await (await esbuild.context(b)).watch();
  console.log("[fedo] watching… reload the extension in chrome://extensions after changes");
} else {
  await Promise.all(builds.map((b) => esbuild.build(b)));
}
