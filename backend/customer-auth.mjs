import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import {
  CognitoIdentityProviderClient,
  GlobalSignOutCommand
} from "@aws-sdk/client-cognito-identity-provider";
import { defaultProvider } from "@aws-sdk/credential-provider-node";
import { SignatureV4 } from "@smithy/signature-v4";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import mysql from "mysql2/promise";

const COOKIE = "agroseed_customer";
const REFRESH_COOKIE = `${COOKIE}_refresh`;
const CSRF_COOKIE = `${COOKIE}_csrf`;
const REFRESH_DAYS = 30;
const COGNITO_SECRET_CACHE_MS = 5 * 60 * 1000;
const OAUTH_STATE_COOKIE = `${COOKIE}_oauth_state`;
const OAUTH_VERIFIER_COOKIE = `${COOKIE}_oauth_verifier`;
const OAUTH_NONCE_COOKIE = `${COOKIE}_oauth_nonce`;
const CUSTOMER_CLAIMS = new Set(["address", "birthdate", "email", "email_verified", "family_name", "gender", "given_name", "locale", "middle_name", "name", "nickname", "phone_number", "phone_number_verified", "picture", "preferred_username", "profile", "updated_at", "website", "zoneinfo", "cognito:username"]);
const pool = process.env.DATABASE_URL
  ? mysql.createPool(process.env.DATABASE_URL)
  : process.env.DB_HOST && process.env.DB_NAME && process.env.DB_USER
    ? mysql.createPool({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD || "", waitForConnections: true, connectionLimit: 8, timezone: "Z", ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: true } : undefined })
    : null;

let cognitoSecretCache = "";
let cognitoSecretCacheUntil = 0;
let cognitoSecretLoad;

class NodeSha256 {
  constructor(secret) { this.hash = secret ? createHmac("sha256", secret) : createHash("sha256"); }
  update(data) { this.hash.update(data); return this; }
  digest() { return Promise.resolve(this.hash.digest()); }
}

const send = (res, status, body, extra = {}) => {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...extra });
  res.end(JSON.stringify(body));
};
async function body(req) {
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > 16 * 1024) throw Object.assign(new Error("Request is too large."), { statusCode: 413 }); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw Object.assign(new Error("Request must contain valid JSON."), { statusCode: 400 }); }
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
function cookieHeaders(req, tokens, csrf) {
  const secure = secureRequest(req), expires = Math.max(60, Number(tokens.ExpiresIn) || 3600);
  const refreshSeconds = Number(process.env.COGNITO_REFRESH_TOKEN_MAX_AGE_SECONDS || REFRESH_DAYS * 86400);
  return [
    cookieHeader(COOKIE, tokens.IdToken, secure, expires),
    cookieHeader(`${COOKIE}_access`, tokens.AccessToken, secure, expires),
    cookieHeader(REFRESH_COOKIE, tokens.RefreshToken || readCookie(req, REFRESH_COOKIE), secure, refreshSeconds),
    cookieHeader(CSRF_COOKIE, csrf, secure, refreshSeconds)
  ];
}
function oauthCookies(req, state, verifier, nonce) {
  const secure = secureRequest(req), maxAge = 600;
  return [
    cookieHeader(OAUTH_STATE_COOKIE, state, secure, maxAge),
    cookieHeader(OAUTH_VERIFIER_COOKIE, verifier, secure, maxAge),
    cookieHeader(OAUTH_NONCE_COOKIE, nonce, secure, maxAge)
  ];
}
function clearOauthCookies(req) {
  const secure = secureRequest(req);
  return [OAUTH_STATE_COOKIE, OAUTH_VERIFIER_COOKIE, OAUTH_NONCE_COOKIE].map((name) => cookieHeader(name, "", secure, 0));
}
function clearAuthCookies(req) {
  const secure = secureRequest(req);
  return [COOKIE, `${COOKIE}_access`, REFRESH_COOKIE, CSRF_COOKIE, `${COOKIE}_challenge`].map((name) => cookieHeader(name, "", secure, 0, name !== CSRF_COOKIE));
}
function cognitoConfig() {
  const userPoolId = String(process.env.COGNITO_USER_POOL_ID || "").trim();
  const clientId = String(process.env.COGNITO_CLIENT_ID || "").trim();
  const region = String(process.env.COGNITO_REGION || userPoolId.split("_")[0] || "").trim();
  const domain = String(process.env.COGNITO_DOMAIN || "").trim().replace(/\/$/, "");
  if (!userPoolId || !clientId || !region || !domain) throw Object.assign(new Error("Cognito Managed Login is not configured yet. Add the user pool ID, app client ID, and user pool domain."), { statusCode: 503 });
  if (!/^https:\/\//i.test(domain)) throw Object.assign(new Error("COGNITO_DOMAIN must be the HTTPS domain configured for your user pool."), { statusCode: 503 });
  return { userPoolId, clientId, region, domain };
}
let cognitoClient, cognitoVerifier, cognitoKey = "";
function cognito() {
  const config = cognitoConfig(), key = `${config.region}:${config.userPoolId}:${config.clientId}`;
  if (key !== cognitoKey) {
    cognitoClient = new CognitoIdentityProviderClient({ region: config.region });
    cognitoVerifier = CognitoJwtVerifier.create({ userPoolId: config.userPoolId, clientId: config.clientId, tokenUse: "id" });
    cognitoKey = key;
  }
  return { ...config, client: cognitoClient, verifier: cognitoVerifier };
}
async function dbReady() {
  if (!pool) throw Object.assign(new Error("Customer data storage is not configured. Sign-in can work, but saved addresses and carts need a MySQL database."), { statusCode: 503 });
}
async function ensureCustomerRecord(current) {
  await dbReady();
  const phone = current.phone ? String(current.phone).replace(/^\+/, "") : null;
  if (!current.id || !/^[0-9a-f-]{36}$/i.test(current.id)) throw Object.assign(new Error("Your account details could not be loaded. Sign out and sign in again."), { statusCode: 401 });
  await pool.execute("INSERT INTO customers (id, phone, name, email, created_at, updated_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE phone=COALESCE(VALUES(phone), customers.phone), name=COALESCE(VALUES(name), customers.name), email=COALESCE(VALUES(email), customers.email), updated_at=UTC_TIMESTAMP()", [current.id, phone, current.name || null, current.email || null]);
}
async function session(req, res) {
  const idToken = readCookie(req, COOKIE), refreshToken = readCookie(req, REFRESH_COOKIE);
  if (!idToken && !refreshToken) return null;
  const { clientId, verifier, domain } = cognito();
  let claims = null;
  if (idToken) { try { claims = await verifier.verify(idToken); } catch {} }
  if (!claims && refreshToken) {
    try {
      const response = await cognitoTokenRequest(domain, clientId, { grant_type: "refresh_token", refresh_token: refreshToken });
      if (!response.ok) return null;
      const refreshed = await response.json();
      const tokens = { IdToken: refreshed.id_token, AccessToken: refreshed.access_token, RefreshToken: refreshed.refresh_token || refreshToken, ExpiresIn: refreshed.expires_in };
      if (tokens.IdToken && tokens.AccessToken) {
        claims = await verifier.verify(tokens.IdToken);
        const csrf = readCookie(req, CSRF_COOKIE) || randomBytes(24).toString("base64url");
        res.setHeader("Set-Cookie", cookieHeaders(req, { ...tokens, RefreshToken: tokens.RefreshToken || refreshToken }, csrf));
      }
    } catch { return null; }
  }
  if (!claims?.sub) return null;
  let csrf = readCookie(req, CSRF_COOKIE);
  if (!csrf) { csrf = randomBytes(24).toString("base64url"); res.setHeader("Set-Cookie", cookieHeader(CSRF_COOKIE, csrf, secureRequest(req), REFRESH_DAYS * 86400)); }
  const attributes = Object.fromEntries(Object.entries(claims).filter(([key, value]) => (CUSTOMER_CLAIMS.has(key) || key.startsWith("custom:")) && value != null));
  return { id: claims.sub, phone: claims.phone_number ? String(claims.phone_number).replace(/^\+/, "") : null, name: claims.name || [claims.given_name, claims.family_name].filter(Boolean).join(" ") || null, email: claims.email || null, username: claims["cognito:username"] || claims.preferred_username || null, attributes, csrf_token: csrf, access_token: readCookie(req, `${COOKIE}_access`) };
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
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}
function requestOrigin(req) {
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const forwardedHost = String(req.headers["x-forwarded-host"] || "").split(",")[0].trim();
  const protocol = forwardedProto || (req.socket.encrypted ? "https" : "http");
  const host = forwardedHost || req.headers.host;
  if (!host || !/^(https?)$/i.test(protocol)) throw Object.assign(new Error("Could not determine the sign-in callback address."), { statusCode: 400 });
  return `${protocol}://${host}`;
}
function callbackUri(req) {
  return String(process.env.COGNITO_REDIRECT_URI || `${requestOrigin(req)}/api/v1/customer/callback`).trim();
}
async function getCognitoClientSecret() {
  const directSecret = String(process.env.COGNITO_CLIENT_SECRET || "").trim();
  if (directSecret) return directSecret;
  const secretArn = String(process.env.COGNITO_CLIENT_SECRET_ARN || "").trim();
  if (!secretArn) return "";
  if (cognitoSecretCache && Date.now() < cognitoSecretCacheUntil) return cognitoSecretCache;
  if (cognitoSecretLoad) return cognitoSecretLoad;
  cognitoSecretLoad = (async () => {
    try {
      const region = String(process.env.COGNITO_REGION || process.env.COGNITO_USER_POOL_ID?.split("_")[0] || "").trim();
      if (!region) throw new Error("Missing Cognito region.");
      const host = `secretsmanager.${region}.amazonaws.com`;
      const target = "secretsmanager.GetSecretValue";
      const payload = JSON.stringify({ SecretId: secretArn });
      const signer = new SignatureV4({ credentials: defaultProvider(), region, service: "secretsmanager", sha256: NodeSha256 });
      const request = await signer.sign({ protocol: "https:", hostname: host, method: "POST", path: "/", headers: { "content-type": "application/x-amz-json-1.1", "x-amz-target": target }, body: payload });
      const response = await fetch(`https://${host}/`, { method: "POST", headers: request.headers, body: payload });
      if (!response.ok) throw new Error("Secrets Manager request failed.");
      const result = await response.json();
      if (typeof result.SecretString !== "string" || !result.SecretString.trim()) throw new Error("SecretString is empty.");
      let secretValue = result.SecretString.trim();
      if (secretValue.startsWith("{")) {
        const parsed = JSON.parse(secretValue);
        secretValue = String(parsed.COGNITO_CLIENT_SECRET || parsed.client_secret || parsed.ClientSecret || "").trim();
      }
      if (!secretValue) throw new Error("SecretString does not contain a Cognito client secret.");
      cognitoSecretCache = secretValue;
      cognitoSecretCacheUntil = Date.now() + COGNITO_SECRET_CACHE_MS;
      return cognitoSecretCache;
    } catch {
      throw Object.assign(new Error("The site is available, but Cognito sign-in cannot read its client secret. Check COGNITO_CLIENT_SECRET_ARN and the Amplify compute role's Secrets Manager permission."), { statusCode: 503 });
    } finally {
      cognitoSecretLoad = null;
    }
  })();
  return cognitoSecretLoad;
}
async function cognitoTokenRequest(domain, clientId, parameters) {
  const headers = { "Content-Type": "application/x-www-form-urlencoded" };
  const clientSecret = await getCognitoClientSecret();
  if (clientSecret) headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
  return fetch(`${domain}/oauth2/token`, { method: "POST", headers, body: new URLSearchParams({ client_id: clientId, ...parameters }) });
}
async function cognitoTokenError(response) {
  let data = {};
  try { data = await response.json(); } catch {}
  const messages = {
    invalid_client: "Cognito rejected the app client credentials. Confirm COGNITO_CLIENT_ID matches this user pool; if this client has a secret, configure COGNITO_CLIENT_SECRET_ARN in Amplify and grant the compute role access to that Secrets Manager secret.",
    invalid_grant: "Cognito rejected the authorization code or PKCE proof. Start sign-in again; if it repeats, check that the callback URL exactly matches and the code has not already been used.",
    unauthorized_client: "This Cognito app client is not enabled for the authorization code grant. Enable the code grant for this app client.",
    invalid_scope: "Cognito does not allow the openid scope for this app client. Enable openid in its allowed OAuth scopes."
  };
  const message = messages[String(data.error || "")] || "Cognito rejected the token exchange. Check the app client grant, callback URL, and PKCE settings.";
  return Object.assign(new Error(message), { statusCode: 502 });
}
function constantTimeEqual(left, right) {
  const a = Buffer.from(String(left || "")), b = Buffer.from(String(right || ""));
  return a.length === b.length && timingSafeEqual(a, b);
}
async function managedLogin(req, res) {
  const { domain, clientId } = cognito();
  const state = randomBytes(32).toString("base64url"), nonce = randomBytes(32).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const authorize = new URL(`${domain}/oauth2/authorize`);
  authorize.search = new URLSearchParams({ client_id: clientId, response_type: "code", scope: "openid", redirect_uri: callbackUri(req), state, nonce, code_challenge_method: "S256", code_challenge: challenge }).toString();
  res.writeHead(302, { Location: authorize.toString(), "Cache-Control": "no-store", "Set-Cookie": oauthCookies(req, state, verifier, nonce) });
  res.end();
}
async function managedLoginCallback(req, res, url) {
  const { domain, clientId, verifier } = cognito();
  const code = url.searchParams.get("code"), state = url.searchParams.get("state");
  const expectedState = readCookie(req, OAUTH_STATE_COOKIE), codeVerifier = readCookie(req, OAUTH_VERIFIER_COOKIE), nonce = readCookie(req, OAUTH_NONCE_COOKIE);
  if (url.searchParams.has("error")) throw Object.assign(new Error("Cognito sign-in was cancelled or could not be completed."), { statusCode: 400 });
  if (!code) throw Object.assign(new Error("Cognito did not return an authorization code. Start sign-in again from the site."), { statusCode: 400 });
  if (!state || !expectedState || !constantTimeEqual(state, expectedState)) throw Object.assign(new Error("The Cognito sign-in state did not match this browser session. Start sign-in again from the site in the same browser."), { statusCode: 400 });
  if (!codeVerifier || !nonce) throw Object.assign(new Error("The Cognito PKCE cookies are missing. Start sign-in again from the site in the same browser."), { statusCode: 400 });
  const response = await cognitoTokenRequest(domain, clientId, { grant_type: "authorization_code", code, redirect_uri: callbackUri(req), code_verifier: codeVerifier });
  if (!response.ok) throw await cognitoTokenError(response);
  const tokenResponse = await response.json();
  const tokens = { IdToken: tokenResponse.id_token, AccessToken: tokenResponse.access_token, RefreshToken: tokenResponse.refresh_token, ExpiresIn: tokenResponse.expires_in };
  if (!tokens.IdToken || !tokens.AccessToken || !tokens.RefreshToken) throw Object.assign(new Error("Cognito did not return a complete sign-in session."), { statusCode: 502 });
  const claims = await verifier.verify(tokens.IdToken);
  if (!claims.sub || !constantTimeEqual(claims.nonce, nonce)) throw Object.assign(new Error("Cognito sign-in could not be verified. Please start again."), { statusCode: 401 });
  const csrf = randomBytes(24).toString("base64url");
  const headers = [...cookieHeaders(req, tokens, csrf), ...clearOauthCookies(req)];
  res.writeHead(302, { Location: "/", "Cache-Control": "no-store", "Set-Cookie": headers });
  res.end();
}
export async function handleCustomerAuth(req, res, pathname) {
  const method = req.method;
  if (!pathname.startsWith("/api/v1/customer/")) return false;
  try {
    if (method === "GET" && pathname === "/api/v1/customer/login") { await managedLogin(req, res); return true; }
    if (method === "GET" && pathname === "/api/v1/customer/callback") { await managedLoginCallback(req, res, new URL(req.url, requestOrigin(req))); return true; }
    if (method === "GET" && pathname === "/api/v1/customer/logout") {
      const { domain, clientId } = cognito(), logout = new URL(`${domain}/logout`);
      logout.search = new URLSearchParams({ client_id: clientId, logout_uri: `${requestOrigin(req)}/` }).toString();
      res.writeHead(302, { Location: logout.toString(), "Cache-Control": "no-store", "Set-Cookie": clearAuthCookies(req) });
      res.end();
      return true;
    }
    if (method === "GET" && pathname === "/api/v1/customer/session") {
      const current = await session(req, res);
      if (!current) return send(res, 200, { customer: null });
      return send(res, 200, { customer: { id: current.id, phone: current.phone ? `+${current.phone}` : null, name: current.name, email: current.email, username: current.username, attributes: current.attributes, authProvider: "cognito" }, csrf: current.csrf_token });
    }
    if (method === "DELETE" && pathname === "/api/v1/customer/session") {
      if (!sameOrigin(req)) return send(res, 403, { error: "Request origin could not be verified." });
      const accessToken = readCookie(req, `${COOKIE}_access`);
      if (accessToken) { try { const { client } = cognito(); await client.send(new GlobalSignOutCommand({ AccessToken: accessToken })); } catch {} }
      return send(res, 200, { ok: true }, { "Set-Cookie": clearAuthCookies(req) });
    }
    const current = await session(req, res);
    if (!current) return send(res, 401, { error: "Sign in to your Cognito customer account to continue." });
    if (!sameOrigin(req)) return send(res, 403, { error: "Request origin could not be verified." });
    if (method !== "GET" && (!current.csrf_token || req.headers["x-agroseed-csrf"] !== current.csrf_token)) return send(res, 403, { error: "Refresh your account page and try again." });
    if (pathname === "/api/v1/customer/cart" || pathname === "/api/v1/customer/cart/merge" || pathname.startsWith("/api/v1/customer/addresses") || pathname === "/api/v1/customer/profile") await ensureCustomerRecord(current);
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
    const safeError = error.statusCode ? error : Object.assign(new Error("Customer account service is temporarily unavailable."), { statusCode: 500 });
    return send(res, safeError.statusCode || 500, { error: safeError.message });
  }
}
















