import { createHash, randomBytes, randomUUID } from "node:crypto";
import mysql from "mysql2/promise";

const COOKIE = "agroseed_customer";
const SESSION_DAYS = 30;
const pool = process.env.DATABASE_URL
  ? mysql.createPool(process.env.DATABASE_URL)
  : process.env.DB_HOST && process.env.DB_NAME && process.env.DB_USER
    ? mysql.createPool({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD || "", waitForConnections: true, connectionLimit: 8, timezone: "Z", ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: true } : undefined })
    : null;

const hash = (value) => createHash("sha256").update(value).digest("hex");
const send = (res, status, body, extra = {}) => {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...extra });
  res.end(JSON.stringify(body));
};
async function body(req) {
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > 16 * 1024) throw Object.assign(new Error("Request is too large."), { statusCode: 413 }); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw Object.assign(new Error("Request must contain valid JSON."), { statusCode: 400 }); }
}
function phoneNumber(input) {
  const value = String(input || "").replace(/[\s()-]/g, "");
  if (/^[6-9]\d{9}$/.test(value)) return `91${value}`;
  if (/^\+?[1-9]\d{7,14}$/.test(value)) return value.replace(/^\+/, "");
  return null;
}
function cookie(req) {
  const value = (req.headers.cookie || "").split(";").map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE}=`));
  try { return decodeURIComponent(value?.slice(COOKIE.length + 1) || ""); } catch { return ""; }
}
function cookieHeader(token, secure, clear = false) {
  return `${COOKIE}=${clear ? "" : encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${clear ? 0 : SESSION_DAYS * 86400}${secure ? "; Secure" : ""}`;
}
async function dbReady() {
  if (!pool) throw Object.assign(new Error("Customer accounts are not enabled yet: configure the production MySQL database in GoDaddy."), { statusCode: 503 });
}
function normalizeCartItems(items) {
  if (!Array.isArray(items) || items.length > 50) throw Object.assign(new Error("A cart can contain at most 50 items."), { statusCode: 400 });
  const quantities = new Map();
  for (const item of items) {
    const sku = String(item?.sku || "").trim().toUpperCase(), quantity = Number(item?.quantity);
    if (!/^[A-Z0-9_-]{1,64}$/.test(sku) || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) throw Object.assign(new Error("Each cart item needs a valid SKU and a quantity from 1 to 99."), { statusCode: 400 });
    const total = (quantities.get(sku) || 0) + quantity;
    if (total > 99) throw Object.assign(new Error("A SKU can have at most 99 items in the cart."), { statusCode: 400 });
    quantities.set(sku, total);
  }
  return [...quantities].map(([sku, quantity]) => ({ sku, quantity }));
}
function storedCartItems(value) {
  if (Array.isArray(value)) return value;
  try { return JSON.parse(String(value || "[]")); } catch { return []; }
}
function mergeCartItems(accountItems, guestItems, priorGuestItems) {
  const account = new Map(normalizeCartItems(accountItems).map((item) => [item.sku, item.quantity]));
  const priorGuest = new Map(normalizeCartItems(priorGuestItems).map((item) => [item.sku, item.quantity]));
  for (const item of normalizeCartItems(guestItems)) {
    const addition = Math.max(0, item.quantity - (priorGuest.get(item.sku) || 0));
    if (addition) account.set(item.sku, Math.min(99, (account.get(item.sku) || 0) + addition));
  }
  return [...account].map(([sku, quantity]) => ({ sku, quantity }));
}
function otpReady() {
  if (!process.env.MSG91_AUTH_KEY || !process.env.MSG91_TEMPLATE_ID) throw Object.assign(new Error("Phone verification is not enabled yet: configure the MSG91 auth key and approved OTP template in GoDaddy."), { statusCode: 503 });
}
async function session(req) {
  const raw = cookie(req); if (!raw) return null;
  const [rows] = await pool.execute("SELECT s.id AS session_id, s.csrf_token, c.id, c.phone, c.name, c.email FROM customer_sessions s JOIN customers c ON c.id=s.customer_id WHERE s.token_hash=? AND s.expires_at > UTC_TIMESTAMP()", [hash(raw)]);
  return rows[0] || null;
}
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}
async function msg91(path, query, method = "GET") {
  const url = new URL(`https://control.msg91.com/api/v5/otp${path}`);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  const response = await fetch(url, { method, headers: { authkey: process.env.MSG91_AUTH_KEY, "content-type": "application/json", accept: "application/json" }, ...(method === "POST" ? { body: "{}" } : {}), signal: AbortSignal.timeout(12000) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.type === "error") throw Object.assign(new Error("The SMS provider could not complete phone verification. Please try again."), { statusCode: response.status === 429 ? 429 : 502 });
  return result;
}

export async function handleCustomerAuth(req, res, pathname) {
  const method = req.method;
  if (!pathname.startsWith("/api/v1/customer/")) return false;
  try {
    await dbReady();
    if (method === "POST" && pathname === "/api/v1/customer/otp/request") {
      otpReady();
      const data = await body(req), phone = phoneNumber(data.phone);
      if (!phone) return send(res, 400, { error: "Enter a valid mobile number with country code, or a 10-digit Indian mobile number." });
      const ip = String(req.socket.remoteAddress || "unknown");
      const [limits] = await pool.execute("SELECT SUM(phone_hash=?) AS phone_count, SUM(ip_hash=?) AS ip_count FROM customer_otp_requests WHERE created_at > DATE_SUB(UTC_TIMESTAMP(), INTERVAL 15 MINUTE)", [hash(phone), hash(ip)]);
      if (Number(limits[0]?.phone_count || 0) >= 3 || Number(limits[0]?.ip_count || 0) >= 10) return send(res, 429, { error: "Too many code requests. Wait 15 minutes before trying again." });
      const result = await msg91("", { template_id: process.env.MSG91_TEMPLATE_ID, mobile: phone, otp_length: "6", otp_expiry: "10", realTimeResponse: "1" }, "POST");
      if (!result.request_id && result.type !== "success") return send(res, 502, { error: "SMS provider did not confirm the code request." });
      await pool.execute("INSERT INTO customer_otp_requests (id, phone_hash, ip_hash, provider_request_id, created_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP())", [randomUUID(), hash(phone), hash(ip), result.request_id || ""]);
      return send(res, 200, { ok: true, phone: `+${phone}`, message: "Verification code sent." });
    }
    if (method === "POST" && pathname === "/api/v1/customer/otp/verify") {
      otpReady();
      const data = await body(req), phone = phoneNumber(data.phone), otp = String(data.otp || "").trim();
      if (!phone || !/^\d{4,9}$/.test(otp)) return send(res, 400, { error: "Enter your mobile number and the verification code." });
      const [attempts] = await pool.execute("UPDATE customer_otp_requests SET attempt_count=attempt_count+1 WHERE phone_hash=? AND created_at > DATE_SUB(UTC_TIMESTAMP(), INTERVAL 15 MINUTE) AND attempt_count < 5", [hash(phone)]);
      if (!attempts.affectedRows) return send(res, 429, { error: "Request a new verification code. Too many attempts were made." });
      const verified = await msg91("/verify", { mobile: phone, otp });
      if (verified.type !== "success") return send(res, 400, { error: "That code is incorrect or expired. Request a new code." });
      const customerId = randomUUID();
      await pool.execute("INSERT INTO customers (id, phone, created_at, updated_at) VALUES (?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE updated_at=UTC_TIMESTAMP()", [customerId, phone]);
      const [customers] = await pool.execute("SELECT id, phone, name, email FROM customers WHERE phone=? LIMIT 1", [phone]);
      const customer = customers[0], rawToken = randomBytes(32).toString("base64url"), csrf = randomBytes(24).toString("base64url");
      await pool.execute("INSERT INTO customer_sessions (id, customer_id, token_hash, csrf_token, expires_at, created_at) VALUES (?, ?, ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? DAY), UTC_TIMESTAMP())", [randomUUID(), customer.id, hash(rawToken), csrf, SESSION_DAYS]);
      await pool.execute("DELETE FROM customer_otp_requests WHERE phone_hash=?", [hash(phone)]);
      const secure = process.env.NODE_ENV === "production";
      return send(res, 200, { ok: true, customer, csrf }, { "Set-Cookie": cookieHeader(rawToken, secure) });
    }
    if (method === "GET" && pathname === "/api/v1/customer/session") {
      const current = await session(req);
      if (!current) return send(res, 200, { customer: null });
      return send(res, 200, { customer: { id: current.id, phone: `+${current.phone}`, name: current.name, email: current.email }, csrf: current.csrf_token });
    }
    if (method === "DELETE" && pathname === "/api/v1/customer/session") {
      const current = await session(req);
      if (current && sameOrigin(req)) await pool.execute("DELETE FROM customer_sessions WHERE id=?", [current.session_id]);
      return send(res, 200, { ok: true }, { "Set-Cookie": cookieHeader("", process.env.NODE_ENV === "production", true) });
    }
    const current = await session(req);
    if (!current) return send(res, 401, { error: "Sign in with your verified mobile number to continue." });
    if (!sameOrigin(req)) return send(res, 403, { error: "Request origin could not be verified." });
    if (method !== "GET" && req.headers["x-agroseed-csrf"] !== current.csrf_token) return send(res, 403, { error: "Refresh your account page and try again." });
    if (method === "GET" && pathname === "/api/v1/customer/cart") {
      const [rows] = await pool.execute("SELECT items_json FROM customer_carts WHERE customer_id=?", [current.id]);
      return send(res, 200, { items: storedCartItems(rows[0]?.items_json) });
    }
    if ((method === "PUT" || method === "POST") && pathname === "/api/v1/customer/cart") {
      const items = normalizeCartItems((await body(req)).items);
      await pool.execute("INSERT INTO customer_carts (customer_id, items_json, guest_snapshot_json, updated_at) VALUES (?, ?, ?, UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE items_json=VALUES(items_json), guest_snapshot_json=VALUES(guest_snapshot_json), updated_at=UTC_TIMESTAMP()", [current.id, JSON.stringify(items), JSON.stringify(items)]);
      return send(res, 200, { items });
    }
    if (method === "POST" && pathname === "/api/v1/customer/cart/merge") {
      const guestItems = normalizeCartItems((await body(req)).items), connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        await connection.execute("INSERT INTO customer_carts (customer_id, items_json, guest_snapshot_json, updated_at) VALUES (?, '[]', '[]', UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE customer_id=VALUES(customer_id)", [current.id]);
        const [rows] = await connection.execute("SELECT items_json, guest_snapshot_json FROM customer_carts WHERE customer_id=? FOR UPDATE", [current.id]);
        const existing = rows[0], merged = mergeCartItems(storedCartItems(existing.items_json), guestItems, storedCartItems(existing.guest_snapshot_json));
        await connection.execute("UPDATE customer_carts SET items_json=?, guest_snapshot_json=?, updated_at=UTC_TIMESTAMP() WHERE customer_id=?", [JSON.stringify(merged), JSON.stringify(guestItems), current.id]);
        await connection.commit();
        return send(res, 200, { items: merged });
      } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
    }
    if (method === "GET" && pathname === "/api/v1/customer/addresses") {
      const [rows] = await pool.execute("SELECT id, name, phone, line1, line2, city, state, pincode, is_default AS isDefault FROM customer_addresses WHERE customer_id=? ORDER BY is_default DESC, created_at DESC", [current.id]);
      return send(res, 200, { items: rows });
    }
    if (method === "PATCH" && pathname === "/api/v1/customer/profile") {
      const data = await body(req), name = String(data.name || "").trim(), email = String(data.email || "").trim();
      if (name.length > 120 || email.length > 254 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) return send(res, 400, { error: "Enter a valid name and email address." });
      await pool.execute("UPDATE customers SET name=?, email=?, updated_at=UTC_TIMESTAMP() WHERE id=?", [name || null, email || null, current.id]);
      return send(res, 200, { ok: true });
    }
    if ((method === "POST" || method === "PUT") && pathname === "/api/v1/customer/addresses") {
      const data = await body(req); const fields = ["name", "phone", "line1", "city", "state", "pincode"];
      if (fields.some((key) => !String(data[key] || "").trim()) || !/^\d{6}$/.test(String(data.pincode))) return send(res, 400, { error: "Complete recipient, address, state, and six-digit PIN code." });
      const addrId = String(data.id || randomUUID());
      const connection = await pool.getConnection();
      try { await connection.beginTransaction(); if (data.isDefault) await connection.execute("UPDATE customer_addresses SET is_default=0 WHERE customer_id=?", [current.id]);
        await connection.execute("INSERT INTO customer_addresses (id, customer_id, name, phone, line1, line2, city, state, pincode, is_default, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE name=VALUES(name), phone=VALUES(phone), line1=VALUES(line1), line2=VALUES(line2), city=VALUES(city), state=VALUES(state), pincode=VALUES(pincode), is_default=VALUES(is_default), updated_at=UTC_TIMESTAMP()", [addrId, current.id, String(data.name).trim(), String(data.phone).trim(), String(data.line1).trim(), String(data.line2 || "").trim(), String(data.city).trim(), String(data.state).trim(), String(data.pincode), data.isDefault ? 1 : 0]);
        const [ownership] = await connection.execute("SELECT id FROM customer_addresses WHERE id=? AND customer_id=?", [addrId, current.id]); if (!ownership.length) throw Object.assign(new Error("Address not found in this account."), { statusCode: 404 });
        await connection.commit(); return send(res, 200, { ok: true, id: addrId });
      } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
    }
    const addressId = pathname.match(/^\/api\/v1\/customer\/addresses\/([0-9a-f-]{36})$/i)?.[1];
    if (method === "DELETE" && addressId) { const [result] = await pool.execute("DELETE FROM customer_addresses WHERE id=? AND customer_id=?", [addressId, current.id]); return send(res, result.affectedRows ? 200 : 404, result.affectedRows ? { ok: true } : { error: "Address not found." }); }
    return send(res, 404, { error: "Customer route not found." });
  } catch (error) {
    if (res.headersSent || res.destroyed) return true;
    return send(res, error.statusCode || 500, { error: error.statusCode ? error.message : "Customer account service is temporarily unavailable." });
  }
}
