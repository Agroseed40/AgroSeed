import { readFile, readdir } from "node:fs/promises";
import mysql from "mysql2/promise";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let connection;
if (process.env.DATABASE_URL) connection = await mysql.createConnection(process.env.DATABASE_URL);
else if (process.env.DB_HOST && process.env.DB_NAME && process.env.DB_USER) connection = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD || "", ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: true } : undefined, multipleStatements: false });
else throw new Error("Set DATABASE_URL or DB_HOST, DB_NAME, DB_USER, and DB_PASSWORD before running this migration.");
try {
  const migrationDir = path.join(root, "backend/migrations");
  const migrations = (await readdir(migrationDir)).filter((name) => /^\d+_.*\.sql$/.test(name)).sort();
  for (const name of migrations) {
    const sql = await readFile(path.join(migrationDir, name), "utf8");
    for (const statement of sql.split(";").map((item) => item.trim()).filter(Boolean)) await connection.query(statement);
    console.log(`Applied ${name}.`);
  }
  console.log("Customer account and cart tables are ready.");
} finally { await connection.end(); }
