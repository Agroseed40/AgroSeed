import { randomBytes, randomUUID } from "node:crypto";
import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  RespondToAuthChallengeCommand,
  SignUpCommand,
  ConfirmSignUpCommand,
  ResendConfirmationCodeCommand,
  GlobalSignOutCommand
} from "@aws-sdk/client-cognito-identity-provider";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import mysql from "mysql2/promise";
import { handleSupabaseCustomerAuth } from "./customer-auth-supabase.mjs";

const COOKIE = "agroseed_customer";
const REFRESH_COOKIE = `${COOKIE}_refresh`;
const CSRF_COOKIE = `${COOKIE}_csrf`;
const REFRESH_DAYS = 30;
const pool = process.env.DATABASE_URL
  ? mysql.createPool(process.env.DATABASE_URL)
  : process.env.DB_HOST && process.env.DB_NAME && process.env.DB_USER
    ? mysql.createPool({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD || "", waitForConnections: true, connectionLimit: 8, timezone: "Z", ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: true } : undefined })
    : null;

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
function clearAuthCookies(req) {
  const secure = secureRequest(req);
  return [COOKIE, `${COOKIE}_access`, REFRESH_COOKIE, CSRF_COOKIE, `${COOKIE}_challenge`].map((name) => cookieHeader(name, "", secure, 0, name !== CSRF_COOKIE));
}
function cognitoConfig() {
  const userPoolId = String(process.env.COGNITO_USER_POOL_ID || "").trim();
  const clientId = String(process.env.COGNITO_CLIENT_ID || "").trim();
  const region = String(process.env.COGNITO_REGION || userPoolId.split("_")[0] || "").trim();
  if (!userPoolId || !clientId || !region) throw Object.assign(new Error("Phone sign-in is not configured yet. Add the Cognito user pool ID and app client ID to the Amplify app settings."), { statusCode: 503 });
  return { userPoolId, clientId, region };
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
  const phone = String(current.phone || "").replace(/^\+/, "");
  if (!current.id || !/^[0-9a-f-]{36}$/i.test(current.id) || !phone) throw Object.assign(new Error("Your verified phone details could not be loaded. Sign out and sign in again."), { statusCode: 401 });
  await pool.execute("INSERT INTO customers (id, phone, name, email, created_at, updated_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE phone=VALUES(phone), name=COALESCE(customers.name, VALUES(name)), email=COALESCE(customers.email, VALUES(email)), updated_at=UTC_TIMESTAMP()", [current.id, phone, current.name || null, current.email || null]);
}
async function session(req, res) {
  const idToken = readCookie(req, COOKIE), refreshToken = readCookie(req, REFRESH_COOKIE);
  if (!idToken && !refreshToken) return null;
  const { clientId, verifier, client } = cognito();
  let claims = null;
  if (idToken) { try { claims = await verifier.verify(idToken); } catch {} }
  if (!claims && refreshToken) {
    try {
      const refreshed = await client.send(new InitiateAuthCommand({ AuthFlow: "REFRESH_TOKEN_AUTH", ClientId: clientId, AuthParameters: { REFRESH_TOKEN: refreshToken } }));
      const tokens = refreshed.AuthenticationResult;
      if (tokens?.IdToken && tokens?.AccessToken) {
        claims = await verifier.verify(tokens.IdToken);
        const csrf = readCookie(req, CSRF_COOKIE) || randomBytes(24).toString("base64url");
        res.setHeader("Set-Cookie", cookieHeaders(req, { ...tokens, RefreshToken: tokens.RefreshToken || refreshToken }, csrf));
      }
    } catch { return null; }
  }
  if (!claims?.sub) return null;
  let csrf = readCookie(req, CSRF_COOKIE);
  if (!csrf) { csrf = randomBytes(24).toString("base64url"); res.setHeader("Set-Cookie", cookieHeader(CSRF_COOKIE, csrf, secureRequest(req), REFRESH_DAYS * 86400)); }
  return { id: claims.sub, phone: claims.phone_number ? String(claims.phone_number).replace(/^\+/, "") : null, name: claims.name || claims.given_name || null, email: claims.email || null, csrf_token: csrf, access_token: readCookie(req, `${COOKIE}_access`) };
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
function cognitoError(error) {
  const name = error?.name || "";
  if (["CodeMismatchException", "ExpiredCodeException"].includes(name)) return Object.assign(new Error("That code is incorrect or expired. Request a new code."), { statusCode: 400 });
  if (["TooManyRequestsException", "TooManyFailedAttemptsException", "LimitExceededException"].includes(name)) return Object.assign(new Error("Too many attempts. Wait a little before requesting another code."), { statusCode: 429 });
  if (["UserNotFoundException", "NotAuthorizedException"].includes(name)) return Object.assign(new Error("We couldn't start sign-in for this number. Check the number and try again. If it continues, ask AgroSeed support to check the phone sign-in setup."), { statusCode: 400 });
  if (["InvalidParameterException", "InvalidPasswordException", "UsernameExistsException"].includes(name)) return Object.assign(new Error("Cognito is not configured for phone OTP sign-in yet. Check the user pool and app client settings."), { statusCode: 503 });
  return Object.assign(new Error("Phone sign-in could not be completed. Please try again."), { statusCode: 502 });
}
function challengeReply(phone, result, flow = "sms") {
  if (result.ChallengeName === "SELECT_CHALLENGE") {
    return { ok: true, flow: "select_sms", phone: `+${phone}`, challengeSession: result.Session };
  }
  if (result.ChallengeName !== "SMS_OTP" || !result.Session) throw Object.assign(new Error("Cognito did not return an SMS verification challenge. Check the user pool's SMS OTP settings."), { statusCode: 503 });
  return { ok: true, flow, phone: `+${phone}`, challengeSession: result.Session, message: "Verification code sent by SMS." };
}
async function initiatePhoneAuth(phone, sessionToken = undefined) {
  const { client, clientId } = cognito();
  return client.send(new InitiateAuthCommand({
    AuthFlow: "USER_AUTH", ClientId: clientId,
    ...(sessionToken ? { Session: sessionToken } : {}),
    AuthParameters: { USERNAME: `+${phone}`, ...(sessionToken ? {} : { PREFERRED_CHALLENGE: "SMS_OTP" }) }
  }));
}
async function startExistingPhoneSignIn(phone) {
  const { client, clientId } = cognito();
  try {
    const result = await initiatePhoneAuth(phone);
    if (result.ChallengeName === "SELECT_CHALLENGE") {
      const selected = await client.send(new RespondToAuthChallengeCommand({ ClientId: clientId, ChallengeName: "SELECT_CHALLENGE", Session: result.Session, ChallengeResponses: { USERNAME: `+${phone}`, ANSWER: "SMS_OTP" } }));
      return challengeReply(phone, selected);
    }
    return challengeReply(phone, result);
  } catch (error) {
    if (error.name === "UserNotConfirmedException") {
      await client.send(new ResendConfirmationCodeCommand({ ClientId: clientId, Username: `+${phone}` }));
      return { ok: true, flow: "signup", phone: `+${phone}`, challengeSession: "", message: "Verification code sent by SMS." };
    }
    throw error;
  }
}
async function startPhoneSignIn(phone) {
  const { client, clientId } = cognito();
  try {
    const signup = await client.send(new SignUpCommand({ ClientId: clientId, Username: `+${phone}`, UserAttributes: [{ Name: "phone_number", Value: `+${phone}` }] }));
    if (signup.UserConfirmed) return startExistingPhoneSignIn(phone);
    return { ok: true, flow: "signup", phone: `+${phone}`, challengeSession: signup.Session || "", message: "Verification code sent by SMS." };
  } catch (error) {
    if (error.name === "UsernameExistsException") return startExistingPhoneSignIn(phone);
    throw error;
  }
}async function issueCustomerSession(req, res, tokens, phone) {
  if (!tokens?.IdToken || !tokens?.AccessToken) throw Object.assign(new Error("Cognito sign-in did not return a complete session."), { statusCode: 502 });
  const { verifier } = cognito(), claims = await verifier.verify(tokens.IdToken);
  if (claims.phone_number_verified !== true || String(claims.phone_number || "").replace(/^\+/, "") !== phone) throw Object.assign(new Error("Cognito did not confirm ownership of this mobile number."), { statusCode: 401 });
  const csrf = randomBytes(24).toString("base64url");
  const current = { id: claims.sub, phone: `+${phone}`, name: claims.name || claims.given_name || null, email: claims.email || null };
  return send(res, 200, { ok: true, customer: current, csrf }, { "Set-Cookie": cookieHeaders(req, tokens, csrf) });
}
export async function handleCustomerAuth(req, res, pathname) {
  if (String(process.env.CUSTOMER_AUTH_PROVIDER || "supabase").trim().toLowerCase() === "supabase") {
    return handleSupabaseCustomerAuth(req, res, pathname);
  }
  const method = req.method;
  if (!pathname.startsWith("/api/v1/customer/")) return false;
  try {
    if (method === "POST" && ["/api/v1/customer/otp/request", "/api/v1/customer/otp/verify"].includes(pathname) && !sameOrigin(req)) return send(res, 403, { error: "Request origin could not be verified." });
    if (method === "POST" && pathname === "/api/v1/customer/otp/request") {
      const data = await body(req), phone = phoneNumber(data.phone);
      if (!phone) return send(res, 400, { error: "Enter a valid mobile number with country code, or a 10-digit Indian mobile number." });
      const result = await startPhoneSignIn(phone);
      return send(res, 200, result);
    }
    if (method === "POST" && pathname === "/api/v1/customer/otp/verify") {
      const data = await body(req), phone = phoneNumber(data.phone), otp = String(data.otp || "").trim(), flow = String(data.flow || "sms"), challengeSession = String(data.challengeSession || "");
      if (!phone || !/^\d{4,9}$/.test(otp)) return send(res, 400, { error: "Enter your mobile number and the verification code." });
      if (flow === "signup") {
        const { client, clientId } = cognito();
        const confirmed = await client.send(new ConfirmSignUpCommand({ ClientId: clientId, Username: `+${phone}`, ConfirmationCode: otp, ...(challengeSession ? { Session: challengeSession } : {}) }));
        let auth = await initiatePhoneAuth(phone, confirmed.Session);
        if (auth.AuthenticationResult) return issueCustomerSession(req, res, auth.AuthenticationResult, phone);
        if (auth.ChallengeName === "SELECT_CHALLENGE") {
          auth = await client.send(new RespondToAuthChallengeCommand({ ClientId: clientId, ChallengeName: "SELECT_CHALLENGE", Session: auth.Session, ChallengeResponses: { USERNAME: `+${phone}`, ANSWER: "SMS_OTP" } }));
        }
        return send(res, 200, { ...challengeReply(phone, auth), pendingOtp: true });
      }
      const { client, clientId } = cognito();
      const result = flow === "select_sms"
        ? await client.send(new RespondToAuthChallengeCommand({ ClientId: clientId, ChallengeName: "SELECT_CHALLENGE", Session: challengeSession, ChallengeResponses: { USERNAME: `+${phone}`, ANSWER: "SMS_OTP" } }))
        : await client.send(new RespondToAuthChallengeCommand({ ClientId: clientId, ChallengeName: "SMS_OTP", Session: challengeSession, ChallengeResponses: { USERNAME: `+${phone}`, SMS_OTP_CODE: otp } }));
      if (result.AuthenticationResult) return issueCustomerSession(req, res, result.AuthenticationResult, phone);
      return send(res, 200, { ...challengeReply(phone, result), pendingOtp: true });
    }
    if (method === "GET" && pathname === "/api/v1/customer/session") {
      const current = await session(req, res);
      if (!current) return send(res, 200, { customer: null });
      return send(res, 200, { customer: { id: current.id, phone: current.phone ? `+${current.phone}` : null, name: current.name, email: current.email, authProvider: "cognito" }, csrf: current.csrf_token });
    }
    if (method === "DELETE" && pathname === "/api/v1/customer/session") {
      if (!sameOrigin(req)) return send(res, 403, { error: "Request origin could not be verified." });
      const accessToken = readCookie(req, `${COOKIE}_access`);
      if (accessToken) { try { const { client } = cognito(); await client.send(new GlobalSignOutCommand({ AccessToken: accessToken })); } catch {} }
      return send(res, 200, { ok: true }, { "Set-Cookie": clearAuthCookies(req) });
    }
    const current = await session(req, res);
    if (!current) return send(res, 401, { error: "Sign in with your verified mobile number to continue." });
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
    const isCognitoError = Boolean(error?.name && error.name.endsWith("Exception"));
    const safeError = error.statusCode ? error : isCognitoError ? cognitoError(error) : Object.assign(new Error("Customer account service is temporarily unavailable."), { statusCode: 500 });
    return send(res, safeError.statusCode || 500, { error: safeError.message });
  }
}















