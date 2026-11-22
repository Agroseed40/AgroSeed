import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(root, "public");
const output = path.join(root, "cloudflare", "static-assets.generated.mjs");
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png"
};
const assets = {};

async function collect(directory, prefix = "") {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) { await collect(filename, relative); continue; }
    const extension = path.extname(entry.name).toLowerCase();
    if (!contentTypes[extension]) continue;
    const contents = await readFile(filename);
    assets[`/${relative}`] = { contentType: contentTypes[extension], base64: contents.toString("base64") };
  }
}
await collect(publicDir);

await writeFile(output, `export const staticAssets = Object.freeze(${JSON.stringify(assets)});\n`, "utf8");
console.log(`Embedded ${Object.keys(assets).length} static assets for Worker deployment.`);
