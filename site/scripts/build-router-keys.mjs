// Bundles ootleRouter's voucher signer (ootle/pay/keys.mjs, with its @noble dependencies) into public/router-keys.js
// for the /router page. Run again when that file changes:
//   node scripts/build-router-keys.mjs [path to the ootleRouter checkout, default ../../ootleRouter]
import { build } from "esbuild";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const site = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(process.argv[2] ?? join(site, "../../ootleRouter"), "ootle/pay/keys.mjs");
await build({
  entryPoints: [source],
  outfile: join(site, "public/router-keys.js"),
  bundle: true,
  format: "esm",
  minify: true,
  target: "es2022",
  legalComments: "inline",
  banner: { js: `// Built from ootleRouter's ootle/pay/keys.mjs (github.com/alex3000-ai/ootleRouter) by scripts/build-router-keys.mjs.` },
});
console.log(`public/router-keys.js from ${source}`);
