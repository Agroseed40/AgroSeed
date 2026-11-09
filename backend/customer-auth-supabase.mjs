import { randomBytes, randomUUID } from "node:crypto";
import { createContextClient, verifyCredentials } from "@supabase/server/core";

const COOKIE = "agroseed_customer";
const REFRESH_COOKIE = `${COOKIE}_refresh`;
const CSRF_COOKIE = `${COOKIE}_csrf`;
const REFRESH_DAYS = 30;
const send = (res, status, body, extra = {}) => {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...extra });
  res.end(JSON.stringify(body));
};
async function body(req) {
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > 16 * 1024) throw Object.assign(new Error("Request is too large."), { statusCode: 413 }); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw Object.assign(new Error("Request must contain valid JSON."), { statusCode: 400 }); }
}
function config() {
  const url = String(process.env.SUPABASE_URL || "").trim().replace(/\/$/, "");
  const key = String(process.env.SUPABASE_PUBLISHABLE_KEY || "").trim();
  if (!url || !key) throw Object.assign(new Error("Email sign-in is not configured. Add the Supabase project URL and publishable key to the server environment."), { statusCode: 503 });
  return { url, issuer: `${url}/auth/v1` };
}
function supabase(token) {
  config();
  return token ? createContextClient({ auth: { token } }) : createContextClient();
}
function emailAddress(input) {
  const value = String(input || "").trim().toLowerCase();
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : null;
}
function readCookie(req, name) {
  const value = (req.headers.cookie || "").split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  try { return decodeURIComponent(value?.slice(name.length + 1) || ""); } catch { return ""; }
}
function secureRequest(req) {
  const forwarded = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim().toLowerCase();
  const host = String(req.headers.host || "").toLowerCase();
  const localHost = /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host);
  return forwarded === "https" || Boolean(req.socket.encrypted) || process.env.NODE_ENV === "production" || (Boolean(host) && !localHost);
}
function cookieHeader(name, value, secure, maxAge, httpOnly = true) {
  return `${name}=${value ? encodeURIComponent(value) : ""}; ${httpOnly ? "HttpOnly; " : ""}SameSite=Lax; Path=/; Max-Age=${value ? maxAge : 0}${secure ? "; Secure" : ""}`;
}
function cookieHeaders(req, session, csrf) {
  const secure = secureRequest(req), expires = Math.max(60, Number(session.expires_in) || 3600);
  const refreshSeconds = Number(process.env.SUPABASE_REFRESH_TOKEN_MAX_AGE_SECONDS || REFRESH_DAYS * 86400);
  return [
    cookieHeader(COOKIE, session.access_token, secure, expires),
    cookieHeader(`${COOKIE}_access`, session.access_token, secure, expires),
    cookieHeader(REFRESH_COOKIE, session.refresh_token || readCookie(req, REFRESH_COOKIE), secure, refreshSeconds),
    cookieHeader(CSRF_COOKIE, csrf, secure, refreshSeconds, false)
  ];
}
function clearAuthCookies(req) {
  const secure = secureRequest(req);
  return [COOKIE, `${COOKIE}_access`, REFRESH_COOKIE, CSRF_COOKIE].map((name) => cookieHeader(name, "", secure, 0, name !== CSRF_COOKIE));
}
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
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
function mergeCartItems(accountItems, guestItems, priorGuestItems) {
  const account = new Map(normalizeCartItems(accountItems).map((item) => [item.sku, item.quantity]));
  const priorGuest = new Map(normalizeCartItems(priorGuestItems).map((item) => [item.sku, item.quantity]));
  for (const item of normalizeCartItems(guestItems)) {
    const addition = Math.max(0, item.quantity - (priorGuest.get(item.sku) || 0));
    if (addition) account.set(item.sku, Math.min(99, (account.get(item.sku) || 0) + addition));
  }
  return [...account].map(([sku, quantity]) => ({ sku, quantity }));
}
function safeDbError(error) {
  const code = String(error?.code || "");
  if (code.startsWith("PGRST") || code === "42P01" || code === "42883") return Object.assign(new Error("Supabase customer tables are not ready yet. Apply the customer-account migration in the Supabase SQL Editor."), { statusCode: 503 });
  return Object.assign(new Error("Customer account data could not be saved. Please try again."), { statusCode: 503 });
}
async function supabaseSession(req, res) {
  let accessToken = readCookie(req, `${COOKIE}_access`) || readCookie(req, COOKIE);
  let refreshToken = readCookie(req, REFRESH_COOKIE), verified = null;
  if (!accessToken && !refreshToken) return null;
  const { issuer } = config();
  if (accessToken) {
    try {
      const result = await verifyCredentials({ token: accessToken, apikey: null }, { auth: "user", issuer });
      if (!result.error) verified = result.data;
    } catch {}
  }
  if (!verified && refreshToken) {
    try {
      const refreshed = await supabase().auth.refreshSession({ refresh_token: refreshToken });
      if (refreshed.error || !refreshed.data.session) return null;
      const newSession = refreshed.data.session;
      const result = await verifyCredentials({ token: newSession.access_token, apikey: null }, { auth: "user", issuer });
      if (result.error) return null;
      verified = result.data; accessToken = newSession.access_token; refreshToken = newSession.refresh_token;
      const csrf = readCookie(req, CSRF_COOKIE) || randomBytes(24).toString("base64url");
      res.setHeader("Set-Cookie", cookieHeaders(req, newSession, csrf));
    } catch { return null; }
  }
  const claims = verified?.jwtClaims;
  if (!claims?.sub) return null;
  let csrf = readCookie(req, CSRF_COOKIE);
  if (!csrf) { csrf = randomBytes(24).toString("base64url"); res.setHeader("Set-Cookie", cookieHeader(CSRF_COOKIE, csrf, secureRequest(req), REFRESH_DAYS * 86400, false)); }
  const metadata = claims.user_metadata || {};
  return { id: claims.sub, phone: claims.phone || null, name: metadata.full_name || metadata.name || null, email: claims.email || null, csrf_token: csrf, access_token: accessToken, refresh_token: refreshToken };
}
async function ensureCustomerRecord(current, db) {
  const { error } = await db.from("customers").upsert({ id: current.id, phone: current.phone, name: current.name, email: current.email, updated_at: new Date().toISOString() }, { onConflict: "id" });
  if (error) throw safeDbError(error);
}
function authError(error, phase) {
  const status = Number(error?.status || 0), message = String(error?.message || "").toLowerCase();
  if (status === 429 || /rate.?limit|too many|wait .*second/.test(message)) return Object.assign(new Error("Too many code requests. Wait a little and try again."), { statusCode: 429 });
  if (phase === "verify" && (status === 400 || /otp|token|expired|invalid/.test(message))) return Object.assign(new Error("That code is incorrect or expired. Request a new code."), { statusCode: 400 });
  if (phase === "request") return Object.assign(new Error("Supabase could not send a sign-in code. Check that Email sign-in is enabled and email delivery is configured in Supabase Auth."), { statusCode: status >= 400 && status < 500 ? status : 502 });
  return Object.assign(new Error("Email sign-in could not be completed. Please try again."), { statusCode: 502 });
}
async function issueCustomerSession(req, res, data, email) {
  const session = data?.session, user = data?.user || session?.user;
  if (!session?.access_token || !session?.refresh_token || !user?.id) throw Object.assign(new Error("Supabase did not return a complete customer session."), { statusCode: 502 });
  const verifiedEmail = String(user.email || "").trim().toLowerCase();
  if (!user.email_confirmed_at || verifiedEmail !== email) throw Object.assign(new Error("Supabase did not confirm ownership of this email address."), { statusCode: 401 });
  const csrf = randomBytes(24).toString("base64url");
  const current = { id: user.id, phone: user.phone || null, name: user.user_metadata?.full_name || user.user_metadata?.name || null, email: verifiedEmail };
  return send(res, 200, { ok: true, customer: current, csrf }, { "Set-Cookie": cookieHeaders(req, session, csrf) });
}
export async function handleSupabaseCustomerAuth(req, res, pathname) {
  const method = req.method;
  if (!pathname.startsWith("/api/v1/customer/")) return false;
  let phase = "session";
  try {
    if (method === "POST" && ["/api/v1/customer/otp/request", "/api/v1/customer/otp/verify"].includes(pathname) && !sameOrigin(req)) return send(res, 403, { error: "Request origin could not be verified." });
    if (method === "POST" && pathname === "/api/v1/customer/otp/request") {
      phase = "request";
      const data = await body(req), email = emailAddress(data.email);
      if (!email) return send(res, 400, { error: "Enter a valid email address." });
      const { error } = await supabase().auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
      if (error) throw authError(error, phase);
      return send(res, 200, { ok: true, flow: "supabase", email, challengeSession: "", message: "Verification code sent by email." });
    }
    if (method === "POST" && pathname === "/api/v1/customer/otp/verify") {
      phase = "verify";
      const data = await body(req), email = emailAddress(data.email), otp = String(data.otp || "").trim();
      if (!email || !/^\d{4,9}$/.test(otp)) return send(res, 400, { error: "Enter your email address and the verification code." });
      const result = await supabase().auth.verifyOtp({ email, token: otp, type: "email" });
      if (result.error) throw authError(result.error, phase);
      return issueCustomerSession(req, res, result.data, email);
    }
    if (method === "GET" && pathname === "/api/v1/customer/session") {
      const current = await supabaseSession(req, res);
      if (!current) return send(res, 200, { customer: null });
      return send(res, 200, { customer: { id: current.id, phone: current.phone, name: current.name, email: current.email, authProvider: "supabase" }, csrf: current.csrf_token });
    }
    if (method === "DELETE" && pathname === "/api/v1/customer/session") {
      if (!sameOrigin(req)) return send(res, 403, { error: "Request origin could not be verified." });
      const accessToken = readCookie(req, `${COOKIE}_access`) || readCookie(req, COOKIE), refreshToken = readCookie(req, REFRESH_COOKIE);
      if (accessToken && refreshToken) {
        try {
          const client = supabase();
          const established = await client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
          if (!established.error) await client.auth.signOut({ scope: "local" });
        } catch {}
      }
      return send(res, 200, { ok: true }, { "Set-Cookie": clearAuthCookies(req) });
    }
    const current = await supabaseSession(req, res);
    if (!current) return send(res, 401, { error: "Sign in with your verified email address to continue." });
    if (!sameOrigin(req)) return send(res, 403, { error: "Request origin could not be verified." });
    if (method !== "GET" && (!current.csrf_token || req.headers["x-agroseed-csrf"] !== current.csrf_token)) return send(res, 403, { error: "Refresh your account page and try again." });
    const db = supabase(current.access_token);
    if (["/api/v1/customer/cart", "/api/v1/customer/cart/merge", "/api/v1/customer/profile"].includes(pathname) || pathname.startsWith("/api/v1/customer/addresses")) await ensureCustomerRecord(current, db);
    if (method === "GET" && pathname === "/api/v1/customer/cart") {
      const { data, error } = await db.from("customer_carts").select("items_json").eq("customer_id", current.id).maybeSingle();
      if (error) throw safeDbError(error);
      return send(res, 200, { items: Array.isArray(data?.items_json) ? data.items_json : [] });
    }
    if ((method === "PUT" || method === "POST") && pathname === "/api/v1/customer/cart") {
      const items = normalizeCartItems((await body(req)).items);
      const { error } = await db.from("customer_carts").upsert({ customer_id: current.id, items_json: items, guest_snapshot_json: items, updated_at: new Date().toISOString() }, { onConflict: "customer_id" });
      if (error) throw safeDbError(error);
      return send(res, 200, { items });
    }
    if (method === "POST" && pathname === "/api/v1/customer/cart/merge") {
      const guestItems = normalizeCartItems((await body(req)).items);
      const { data, error } = await db.rpc("merge_customer_cart", { p_guest_items: guestItems });
      if (error) throw safeDbError(error);
      return send(res, 200, { items: normalizeCartItems(data || []) });
    }
    if (method === "GET" && pathname === "/api/v1/customer/addresses") {
      const { data, error } = await db.from("customer_addresses").select("id, name, phone, line1, line2, city, state, pincode, is_default, created_at").eq("customer_id", current.id).order("is_default", { ascending: false }).order("created_at", { ascending: false });
      if (error) throw safeDbError(error);
      return send(res, 200, { items: (data || []).map((row) => ({ ...row, isDefault: row.is_default })) });
    }
    if (method === "PATCH" && pathname === "/api/v1/customer/profile") {
      const data = await body(req), name = String(data.name || "").trim(), email = String(data.email || "").trim();
      if (name.length > 120 || email.length > 254 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) return send(res, 400, { error: "Enter a valid name and email address." });
      const { error } = await db.from("customers").update({ name: name || null, email: email || null, updated_at: new Date().toISOString() }).eq("id", current.id);
      if (error) throw safeDbError(error);
      return send(res, 200, { ok: true });
    }
    if ((method === "POST" || method === "PUT") && pathname === "/api/v1/customer/addresses") {
      const data = await body(req), fields = ["name", "phone", "line1", "city", "state", "pincode"];
      if (fields.some((key) => !String(data[key] || "").trim()) || !/^\d{6}$/.test(String(data.pincode))) return send(res, 400, { error: "Complete recipient, address, state, and six-digit PIN code." });
      const addrId = String(data.id || randomUUID());
      const { data: savedId, error } = await db.rpc("save_customer_address", { p_id: addrId, p_name: String(data.name).trim(), p_phone: String(data.phone).trim(), p_line1: String(data.line1).trim(), p_line2: String(data.line2 || "").trim(), p_city: String(data.city).trim(), p_state: String(data.state).trim(), p_pincode: String(data.pincode), p_is_default: Boolean(data.isDefault) });
      if (error) throw safeDbError(error);
      return send(res, 200, { ok: true, id: savedId });
    }
    const addressId = pathname.match(/^\/api\/v1\/customer\/addresses\/([0-9a-f-]{36})$/i)?.[1];
    if (method === "DELETE" && addressId) {
      const { data, error } = await db.from("customer_addresses").delete().eq("id", addressId).eq("customer_id", current.id).select("id");
      if (error) throw safeDbError(error);
      return send(res, data?.length ? 200 : 404, data?.length ? { ok: true } : { error: "Address not found." });
    }
    return send(res, 404, { error: "Customer route not found." });
  } catch (error) {
    if (res.headersSent || res.destroyed) return true;
    const safeError = error.statusCode ? error : phase === "verify" || phase === "request" ? authError(error, phase) : Object.assign(new Error("Customer account service is temporarily unavailable."), { statusCode: 503 });
    return send(res, safeError.statusCode || 500, { error: safeError.message });
  }
}
