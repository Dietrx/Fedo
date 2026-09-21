/**
 * GLUE — background service worker. Hosts the AI path (API keys & network live here, not in the page).
 * Keep this file thin: routing + caching only. Logic belongs in ai/.
 */
import { DEFAULT_SETTINGS, type AnalysisResult, type Settings } from "@contracts";
import type { Request, Response } from "@contracts/messages";
import { createAnalyzer } from "../../ai";

const analyzer = createAnalyzer(__FEDO_CONFIG__);
const cache = new Map<string, AnalysisResult>();

async function getSettings(): Promise<Settings> {
  const { settings } = await chrome.storage.local.get("settings");
  return { ...DEFAULT_SETTINGS, ...(settings as Partial<Settings> | undefined) };
}

async function handle(req: Request): Promise<unknown> {
  switch (req.type) {
    case "fedo/analyze": {
      const { input } = req;
      // Posts are immutable → cache. Transcripts change → always re-analyze.
      if (input.kind === "post" && cache.has(input.item.id)) return cache.get(input.item.id);
      const result = await analyzer.analyze(input);
      if (input.kind === "post") cache.set(input.item.id, result);
      return result;
    }
    case "fedo/getSettings":
      return getSettings();
    case "fedo/setSettings": {
      const settings = { ...(await getSettings()), ...req.settings };
      await chrome.storage.local.set({ settings });
      return settings;
    }
  }
}

chrome.runtime.onMessage.addListener((req: Request, _sender, sendResponse: (r: Response<unknown>) => void) => {
  handle(req)
    .then((data) => sendResponse({ ok: true, data }))
    .catch((e) => sendResponse({ ok: false, error: String(e?.message ?? e) }));
  return true; // async response
});

console.log("[fedo] background ready, analyzer:", __FEDO_CONFIG__.mode);
