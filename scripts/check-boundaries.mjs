/**
 * Enforces the path boundaries:
 *   scraper/, ai/, ui/  may import only from their own folder, "@contracts" and npm packages.
 *   contracts/          may import only from itself.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const PATHS = ["contracts", "scraper", "ai", "ui"];
const walk = (dir) =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(p) ? [p] : [];
  });

let errors = 0;
for (const area of PATHS) {
  for (const file of walk(area)) {
    const src = readFileSync(file, "utf8");
    for (const [, spec] of src.matchAll(/(?:import|export)[^'"]*?from\s+["']([^"']+)["']/g)) {
      if (spec.startsWith("@contracts")) {
        if (area === "contracts") { console.error(`✗ ${file}: contracts must use relative imports`); errors++; }
        continue;
      }
      if (!spec.startsWith(".")) continue; // npm / node builtin
      const target = relative(process.cwd(), resolve(file, "..", spec)).split("/")[0];
      if (target !== area) {
        console.error(`✗ ${file}: imports "${spec}" from ${target}/ — only ${area}/ and @contracts are allowed`);
        errors++;
      }
    }
  }
}
if (errors) process.exit(1);
console.log("✓ path boundaries OK");
