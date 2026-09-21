/** UI playground dev server: http://localhost:8000 */
import * as esbuild from "esbuild";

const ctx = await esbuild.context({
  entryPoints: ["ui/playground/playground.ts"],
  outfile: "ui/playground/playground.js",
  bundle: true,
  format: "iife",
  sourcemap: "inline",
  logLevel: "info",
});
await ctx.watch();
const { port } = await ctx.serve({ servedir: "ui/playground", port: 8000 });
console.log(`[fedo] UI playground → http://localhost:${port}`);
