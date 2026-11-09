import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(await readFile(path.join(projectRoot, "package.json"), "utf8"));
const lockFile = JSON.parse(await readFile(path.join(projectRoot, "package-lock.json"), "utf8"));
const failures = [];

function requireCondition(condition, message) {
  if (!condition) failures.push(message);
}

requireCondition(Boolean(packageJson.name?.trim()), "package.json needs a non-empty name.");
requireCondition(Boolean(packageJson.version?.trim()), "package.json needs a non-empty version.");
requireCondition(/^22(?:\.|$|\s|x)/.test(packageJson.engines?.node || ""), "Set engines.node to Node.js 22.x for GoDaddy.");
requireCondition(Boolean(packageJson.scripts?.build?.trim()), "package.json needs a build script.");
requireCondition(Boolean(packageJson.scripts?.start?.trim()), "package.json needs a start script.");
requireCondition(lockFile.name === packageJson.name && lockFile.version === packageJson.version, "package-lock.json name/version must match package.json.");
requireCondition(Boolean(lockFile.packages?.[""]), "package-lock.json must include the root package entry.");

const requiredFiles = [
  "package.json",
  "package-lock.json",
  "server.mjs",
  "backend/api.mjs",
  "backend/sandbox.mjs",
  "backend/seed/products.json",
  "config/features.mjs",
  "public/app.html",
  "public/app.css",
  "public/app.js",
  "public/agroseed-mark-v2.png",
  "backend/customer-auth.mjs",
  "backend/migrations/001_customer_accounts.sql",
  "backend/migrations/002_customer_carts.sql",
  "scripts/migrate-customer-accounts.mjs",
  "scripts/build-check.mjs",
  "scripts/godaddy-preflight.mjs",
  "scripts/package-preview.mjs"
];

for (const file of requiredFiles) {
  try {
    await access(path.join(projectRoot, file));
  } catch {
    failures.push(`Required deployment file is missing: ${file}`);
  }
}

const serverSource = await readFile(path.join(projectRoot, "server.mjs"), "utf8");
requireCondition(serverSource.includes("process.env.PORT"), "server.mjs must read process.env.PORT.");
requireCondition(serverSource.includes('"0.0.0.0"'), "server.mjs should bind to 0.0.0.0.");
requireCondition(packageJson.scripts.start.includes("server.mjs"), "The start script must launch server.mjs.");
requireCondition(packageJson.scripts.build.includes("scripts/build-check.mjs"), "The build script must run scripts/build-check.mjs.");

for (const section of ["dependencies", "devDependencies", "optionalDependencies"]) {
  const declared = packageJson[section] || {};
  const locked = lockFile.packages?.[""]?.[section] || {};
  const declaredSorted = Object.fromEntries(Object.entries(declared).sort(([a], [b]) => a.localeCompare(b)));
  const lockedSorted = Object.fromEntries(Object.entries(locked).sort(([a], [b]) => a.localeCompare(b)));
  requireCondition(JSON.stringify(declaredSorted) === JSON.stringify(lockedSorted), `package-lock.json ${section} do not match package.json.`);
}

const dependencies = packageJson.dependencies || {};
const dependencyNames = new Set(Object.keys(dependencies));
const sourceFiles = [];

async function collectSources(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist" || entry.name === "storage") continue;
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) await collectSources(entryPath);
    else if (/\.(?:mjs|js)$/.test(entry.name)) sourceFiles.push(entryPath);
  }
}

await collectSources(projectRoot);
const externalImports = new Set();
for (const sourceFile of sourceFiles) {
  if (path.basename(sourceFile) === "godaddy-preflight.mjs") continue;
  const source = await readFile(sourceFile, "utf8");
  const patterns = [
    /\b(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g,
    /\brequire\(\s*["']([^"']+)["']\s*\)/g
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier.startsWith(".") || specifier.startsWith("node:")) continue;
      const packageName = specifier.startsWith("@") ? specifier.split("/").slice(0, 2).join("/") : specifier.split("/")[0];
      externalImports.add(packageName);
    }
  }
}

for (const dependency of externalImports) {
  requireCondition(Boolean(dependencies[dependency]), `Runtime import '${dependency}' must be in dependencies (not only devDependencies).`);
}

if (failures.length) {
  console.error("GoDaddy preflight failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`GoDaddy preflight passed: ${requiredFiles.length} required files, Node ${packageJson.engines.node}, ${externalImports.size} external runtime packages.`);
}
