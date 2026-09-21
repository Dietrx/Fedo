/**
 * PATH 2 — AI. Public entry point. Only this file is imported by the glue code.
 * Contract: AnalysisInput in → AnalysisResult out (see contracts/types.ts).
 * Rule: no `chrome.*`, no `document` in here → everything runs in Node via `npm run dev:ai`.
 */
import type { Analyzer, AnalyzerConfig } from "@contracts";
import { createMockAnalyzer } from "./mock";
import { createJevAnalyzer } from "./jev";
import { createLlmAnalyzer, isChatCompletionsUrl } from "./llm";

export function createAnalyzer(config: AnalyzerConfig): Analyzer {
  if (config.mode === "jev") {
    if (!config.jevApiUrl || !config.jevApiKey) {
      console.warn("[fedo:ai] Jev selected but JEV_API_URL / JEV_API_KEY missing → falling back to mock");
      return createMockAnalyzer();
    }
    // An OpenAI-compatible endpoint (OpenRouter, …) in JEV_API_URL → generic LLM analyzer instead of the Jev client.
    if (isChatCompletionsUrl(config.jevApiUrl)) return createLlmAnalyzer(config.jevApiUrl, config.jevApiKey);
    return createJevAnalyzer(config.jevApiUrl, config.jevApiKey);
  }
  return createMockAnalyzer();
}
