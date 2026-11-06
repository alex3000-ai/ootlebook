// Bundles the client's signer (client/keys.mjs, with its @noble dependencies) into public/router-keys.js for the
// /router page, which signs Ootlebook lane vouchers in the browser. Run again when that file changes:
//   node scripts/build-router-keys.mjs
import { build } from "esbuild";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const site = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(site, "../client/keys.mjs");
await build({
  entryPoints: [source],
  outfile: join(site, "public/router-keys.js"),
  bundle: true,
  format: "esm",
  minify: true,
  target: "es2022",
  legalComments: "inline",
  banner: { js: `// Built from client/keys.mjs (github.com/alex3000-ai/ootlebook) by scripts/build-router-keys.mjs.` },
});
console.log(`public/router-keys.js from ${source}`);
