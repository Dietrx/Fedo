/**
 * Integration probe: runs the real scraper on tiktok.com (or x.com) inside Playwright, without loading the
 * extension. main-world.js goes into the page world, harness-entry.js into an isolated world — the same split
 * Chrome gives a MV3 extension. Prints every sink call with a timestamp.
 *
 *   node scraper/research/playwright/build-harness.mjs /tmp/fedo-harness
 *   node scraper/research/playwright/run-feed-probe.mjs /tmp/fedo-harness https://www.tiktok.com/foryou 10
 *
 * Needs the `playwright` package (not a project dependency: `npx playwright@latest install chromium` or a global
 * install) and, for the STT path, a running scraper/companion/whisper-server.sh. `bypassCSP` is on because a CDP
 * isolated world — unlike a real extension content script — is subject to the page's connect-src policy.
 */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const [outdir = "scraper/research/playwright/.out", url = "https://www.tiktok.com/foryou", stepsArg = "10"] = process.argv.slice(2);
const steps = Number(stepsArg);
const mainWorld = readFileSync(`${outdir}/main-world.js`, "utf8");
const harness = readFileSync(`${outdir}/harness-entry.js`, "utf8");

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({ bypassCSP: true });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send("Page.enable");
await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: mainWorld });
await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: harness, worldName: "fedo-harness", runImmediately: false });

await page.goto(url, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(4000);
for (let i = 0; i < steps; i++) {
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(2500);
}
const log = await page.evaluate(() => JSON.parse(document.getElementById("fedo-harness-log")?.textContent ?? "[]"));
for (const e of log) console.log(JSON.stringify(e));
console.log(`items=${log.filter((e) => e.ev === "item").length} transcripts=${log.filter((e) => e.ev === "transcript").length} removed=${log.filter((e) => e.ev === "removed").length}`);
await browser.close();
