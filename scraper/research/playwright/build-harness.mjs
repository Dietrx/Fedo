/**
 * Bundles the scraper test harness (isolated-world part) and the MAIN-world script for run-feed-probe.mjs.
 *   node scraper/research/playwright/build-harness.mjs [outdir]     (run from the repo root)
 */
import * as esbuild from "esbuild";

const outdir = process.argv[2] ?? "scraper/research/playwright/.out";
await esbuild.build({
  entryPoints: [
    { in: "scraper/research/playwright/harness-entry.ts", out: "harness-entry" },
    { in: "scraper/main-world.ts", out: "main-world" },
  ],
  outdir,
  bundle: true,
  format: "iife",
  target: "chrome120",
  logLevel: "info",
});
