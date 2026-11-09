import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "dist", "agroseed-preview.zip");
const rootFiles = [
  "package.json", "package-lock.json", ".env.example", "server.mjs",
  "public/app.html", "public/app.css", "public/app.js", "public/agroseed-mark-v2.png",
  "docs/development/SANDBOX.md"
];
const nestedFiles = [
  "config/features.mjs", "backend/api.mjs", "backend/customer-auth.mjs", "backend/sandbox.mjs", "backend/seed/products.json",
  "backend/migrations/001_customer_accounts.sql",
  "backend/migrations/002_customer_carts.sql",
  "scripts/build-check.mjs", "scripts/godaddy-preflight.mjs", "scripts/package-preview.mjs",
  "scripts/migrate-customer-accounts.mjs",
  "docs/godaddy-deployment.md", "docs/AGROSEED_ONE_GO_DELIVERY.md"
];

const files = [...rootFiles, ...nestedFiles];
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0; }
function crc32(buffer) { let c = 0xffffffff; for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function dosStamp(date = new Date()) { return { time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2), day: ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate() }; }

const localParts = [], centralParts = [];
let offset = 0;
for (const file of files) {
  const name = Buffer.from(file.replaceAll("\\", "/"), "utf8");
  const raw = await readFile(path.join(root, file));
  const compressed = deflateRawSync(raw, { level: 9 });
  const checksum = crc32(raw), stamp = dosStamp();
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8);
  local.writeUInt16LE(stamp.time, 10); local.writeUInt16LE(stamp.day, 12); local.writeUInt32LE(checksum, 14);
  local.writeUInt32LE(compressed.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(name.length, 26);
  localParts.push(local, name, compressed);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
  central.writeUInt16LE(8, 10); central.writeUInt16LE(stamp.time, 12); central.writeUInt16LE(stamp.day, 14);
  central.writeUInt32LE(checksum, 16); central.writeUInt32LE(compressed.length, 20); central.writeUInt32LE(raw.length, 24);
  central.writeUInt16LE(name.length, 28); central.writeUInt32LE(offset, 42);
  centralParts.push(central, name);
  offset += local.length + name.length + compressed.length;
}
const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(centralSize, 12); end.writeUInt32LE(offset, 16);
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, Buffer.concat([...localParts, ...centralParts, end]));
console.log(`Created ${path.relative(root, output)} (${files.length} files).`);
