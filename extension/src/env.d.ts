import type { AnalyzerConfig } from "@contracts";

declare global {
  /** Injected at build time from .env by scripts/build.mjs */
  const __FEDO_CONFIG__: AnalyzerConfig;
}
