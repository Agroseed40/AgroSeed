import { cp, mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, ".amplify-hosting");
const compute = path.join(output, "compute", "default");
const manifest = {
  version: 1,
  framework: { name: "agroseed-node", version: "1.0.0" },
  routes: [{ path: "/*", target: { kind: "Compute", src: "default" } }],
  computeResources: [{ name: "default", runtime: "nodejs22.x", entrypoint: "server.mjs" }]
};

async function directorySize(directory) {
  let size = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    size += entry.isDirectory() ? await directorySize(entryPath) : (await stat(entryPath)).size;
  }
  return size;
}

await rm(output, { recursive: true, force: true });
await mkdir(compute, { recursive: true });
for (const entry of ["server.mjs", "package.json", "package-lock.json", "backend", "config", "public", "scripts", "node_modules"]) {
  await cp(path.join(root, entry), path.join(compute, entry), { recursive: true });
}
await writeFile(path.join(output, "deploy-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

const size = await directorySize(compute);
const limit = 220 * 1024 * 1024;
if (size > limit) {
  await rm(output, { recursive: true, force: true });
  throw new Error(`Amplify compute bundle is ${(size / 1024 / 1024).toFixed(1)} MB; the limit is 220 MB.`);
}
console.log(`Created .amplify-hosting (Node.js 22 compute bundle, ${(size / 1024 / 1024).toFixed(1)} MB).`);
