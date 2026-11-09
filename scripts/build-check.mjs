import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requiredFiles = [
  "package.json",
  "public/app.html",
  "public/app.css",
  "public/app.js",
  "server.mjs",
  "backend/api.mjs",
  "backend/customer-auth.mjs",
  "backend/sandbox.mjs",
  "backend/seed/products.json",
  "backend/migrations/001_customer_accounts.sql",
  "backend/migrations/002_customer_carts.sql",
  "config/features.mjs",
  "package-lock.json",
  "scripts/godaddy-preflight.mjs",
  "scripts/package-preview.mjs",
  "scripts/migrate-customer-accounts.mjs"
];

for (const file of requiredFiles) {
  await access(path.join(projectRoot, file));
}

console.log(`AgroSeed sandbox build check passed (${requiredFiles.length} required files).`);
