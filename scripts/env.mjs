import { existsSync, readFileSync } from "node:fs";

export function loadEnv(path = ".env") {
  const env = {};
  if (existsSync(path)) {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m) env[m[1]] = m[2];
    }
  }
  return { ...env, ...process.env };
}
