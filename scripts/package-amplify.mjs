import { cp, mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, ".amplify-hosting");
const compute = path.join(output, "compute", "default");
// These public identifiers were supplied for AgroSeed's Cognito pool. Amplify
// environment variables can override them when the project moves to another pool.
const cognitoUserPoolId = process.env.COGNITO_USER_POOL_ID || "ap-south-1_XbcHEhauT";
const cognitoClientId = process.env.COGNITO_CLIENT_ID || "6tf8mnnek8c7er59vk2phv0dlh";
const cognitoRegion = process.env.COGNITO_REGION || cognitoUserPoolId.split("_")[0];
const cognitoDomain = process.env.COGNITO_DOMAIN || "https://ap-south-1xbchehaut.auth.ap-south-1.amazoncognito.com";
const cognitoRedirectUri = process.env.COGNITO_REDIRECT_URI || "https://main.d1r4w0u6vll4kh.amplifyapp.com/api/v1/customer/callback";
const cognitoClientSecret = process.env.COGNITO_CLIENT_SECRET || "";
const manifest = {
  version: 1,
  framework: { name: "agroseed-node", version: "1.0.0" },
  routes: [{ path: "/*", target: { kind: "Compute", src: "default" } }],
  computeResources: [{ name: "default", runtime: "nodejs22.x", entrypoint: "amplify-entry.mjs" }]
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
await writeFile(path.join(compute, "amplify-entry.mjs"), [
  'import { mkdir } from "node:fs/promises";',
  'process.env.NODE_ENV = "development";',
  'process.env.AGROSEED_DEMO_MODE = "true";',
  'process.env.AGROSEED_STORAGE_DIR = "/tmp/agroseed";',
  `process.env.COGNITO_USER_POOL_ID = ${JSON.stringify(cognitoUserPoolId)};`,
  `process.env.COGNITO_CLIENT_ID = ${JSON.stringify(cognitoClientId)};`,
  `process.env.COGNITO_REGION = ${JSON.stringify(cognitoRegion)};`,
  `process.env.COGNITO_DOMAIN = ${JSON.stringify(cognitoDomain)} || process.env.COGNITO_DOMAIN || "";`,
  `process.env.COGNITO_REDIRECT_URI = ${JSON.stringify(cognitoRedirectUri)} || process.env.COGNITO_REDIRECT_URI || "";`,
  `process.env.COGNITO_CLIENT_SECRET = ${JSON.stringify(cognitoClientSecret)} || process.env.COGNITO_CLIENT_SECRET || "";`,
  'await mkdir(process.env.AGROSEED_STORAGE_DIR, { recursive: true });',
  'await import("./server.mjs");',
  ""
].join("\n"));
await writeFile(path.join(output, "deploy-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

const size = await directorySize(compute);
const limit = 220 * 1024 * 1024;
if (size > limit) {
  await rm(output, { recursive: true, force: true });
  throw new Error(`Amplify compute bundle is ${(size / 1024 / 1024).toFixed(1)} MB; the limit is 220 MB.`);
}
console.log(`Created .amplify-hosting (Node.js 22 compute bundle, ${(size / 1024 / 1024).toFixed(1)} MB).`);


