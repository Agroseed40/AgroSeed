const customerTable = "agroseed_customers";
import { createCustomerTestOrder, verifyCustomerTestPayment, closeCustomerTestOrder, customerOrders } from "../backend/store.mjs";

let jwksCache;
let jwksCacheUntil = 0;

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  }
});

function decodeBase64Url(value) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

function decodeJsonSegment(value) {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(value)));
}

async function accessKeys(domain) {
  if (jwksCache && Date.now() < jwksCacheUntil) return jwksCache;
  const response = await fetch(`https://${domain}/cdn-cgi/access/certs`, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("Cloudflare Access signing keys could not be loaded.");
  const body = await response.json();
  if (!Array.isArray(body.keys)) throw new Error("Cloudflare Access returned an invalid signing-key set.");
  jwksCache = body.keys;
  jwksCacheUntil = Date.now() + 5 * 60 * 1000;
  return jwksCache;
}

async function verifyAccess(request, env) {
  const domain = String(env.ACCESS_AUTH_DOMAIN || "").trim().toLowerCase();
  const audience = String(env.ACCESS_CUSTOMER_AUD || "").trim();
  const token = request.headers.get("cf-access-jwt-assertion") || "";
  if (!domain || !audience || !token) return null;

  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const header = decodeJsonSegment(parts[0]);
    const claims = decodeJsonSegment(parts[1]);
    if (header.alg !== "RS256" || !header.kid || claims.iss !== `https://${domain}`) return null;
    if (!Array.isArray(claims.aud) || !claims.aud.includes(audience)) return null;
    if (typeof claims.sub !== "string" || !claims.sub || typeof claims.email !== "string" || !claims.email || claims.email_verified === false ||
        !Number.isFinite(claims.exp) || claims.exp * 1000 <= Date.now() ||
        (claims.nbf != null && (!Number.isFinite(claims.nbf) || claims.nbf * 1000 > Date.now()))) return null;
    const key = (await accessKeys(domain)).find((item) => item.kid === header.kid && item.kty === "RSA");
    if (!key) return null;
    const cryptoKey = await crypto.subtle.importKey("jwk", key, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const valid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      cryptoKey,
      decodeBase64Url(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
    );
    if (!valid) return null;
    return {
      id: String(claims.sub),
      email: String(claims.email).trim().toLowerCase(),
      name: String(claims.name || "").trim() || null
    };
  } catch {
    return null;
  }
}

async function customerRecord(db, identity) {
  const csrf = crypto.randomUUID();
  await db.prepare(`INSERT INTO ${customerTable} (id, email, name, csrf_token) VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET email = excluded.email, name = COALESCE(${customerTable}.name, excluded.name), updated_at = CURRENT_TIMESTAMP`)
    .bind(identity.id, identity.email, identity.name, csrf).run();
  return db.prepare(`SELECT id, email, name, csrf_token FROM ${customerTable} WHERE id = ?`).bind(identity.id).first();
}

async function body(request, maxBytes = 16 * 1024) {
  const reader = request.body?.getReader();
  const decoder = new TextDecoder();
  let raw = "", bytes = 0;
  try {
    while (reader) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) throw Object.assign(new Error("Request body is too large."), { status: 413 });
      raw += decoder.decode(value, { stream: true });
    }
  } finally {
    if (reader) { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  }
  try {
    const input = JSON.parse(raw + decoder.decode());
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error();
    return input;
  } catch { throw Object.assign(new Error("Request must contain a JSON object."), { status: 400 }); }
}

function sameOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try { return new URL(origin).origin === new URL(request.url).origin; } catch { return false; }
}

function normalizeCartItems(items) {
  if (!Array.isArray(items) || items.length > 50) throw Object.assign(new Error("A cart can contain at most 50 items."), { status: 400 });
  const quantities = new Map();
  for (const item of items) {
    const sku = String(item?.sku || "").trim().toUpperCase();
    const quantity = Number(item?.quantity);
    if (!/^[A-Z0-9._-]{1,64}$/.test(sku) || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      throw Object.assign(new Error("Each cart item needs a valid SKU and a quantity from 1 to 99."), { status: 400 });
    }
    const total = (quantities.get(sku) || 0) + quantity;
    if (total > 99) throw Object.assign(new Error("A SKU can have at most 99 items in the cart."), { status: 400 });
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

export async function handleCustomerAuth(request, env, pathname) {
  if (!pathname.startsWith("/api/v1/customer/")) return null;
  if (!env.ACCESS_CUSTOMER_AUD || !env.ACCESS_AUTH_DOMAIN) {
    return json({ error: "Cloudflare Access customer sign-in is not configured." }, 503);
  }

  if (pathname === "/api/v1/customer/login" && request.method === "GET") {
    const identity = await verifyAccess(request, env);
    if (!identity) return json({ error: "Complete Cloudflare email-code sign-in and try again." }, 401);
    try {
      await customerRecord(env.DB, identity);
      const requested = new URL(request.url).searchParams.get("returnTo") || "/account";
      const returnTo = new Set(["/checkout", "/account/orders", "/account/addresses"]).has(requested) ? requested : "/account";
      return new Response(null, { status: 302, headers: {
        Location: new URL(`${returnTo}?access=1`, request.url).href, "Cache-Control": "no-store"
      } });
    } catch (error) {
      console.error("Customer provisioning failed", { message: String(error?.message || "unknown").slice(0, 300) });
      return json({ error: "Your account could not be opened. Try signing in again." }, 503);
    }
  }

  const identity = await verifyAccess(request, env);
  if (!identity) return json({ error: "Sign in with your email code to continue." }, 401);

  try {
    const profile = await customerRecord(env.DB, identity);
    const method = request.method;
    if (method !== "GET") {
      if (!sameOrigin(request)) return json({ error: "Request origin could not be verified." }, 403);
      if (request.headers.get("x-agroseed-csrf") !== profile.csrf_token) return json({ error: "Refresh your account page and try again." }, 403);
    }

    if (method === "GET" && pathname === "/api/v1/customer/session") {
      return json({ customer: { id: profile.id, email: profile.email, name: profile.name, phone: null, authProvider: "cloudflare_access" }, csrf: profile.csrf_token });
    }

    if (method === "GET" && pathname === "/api/v1/customer/cart") {
      const row = await env.DB.prepare("SELECT items_json FROM agroseed_customer_carts WHERE customer_id = ?").bind(identity.id).first();
      let items = [];
      try { items = JSON.parse(row?.items_json || "[]"); } catch {}
      return json({ items: normalizeCartItems(items) });
    }

    if ((method === "PUT" || method === "POST") && pathname === "/api/v1/customer/cart") {
      const items = normalizeCartItems((await body(request)).items);
      await env.DB.prepare(`INSERT INTO agroseed_customer_carts (customer_id, items_json, guest_snapshot_json, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(customer_id) DO UPDATE SET items_json = excluded.items_json, guest_snapshot_json = excluded.guest_snapshot_json, updated_at = CURRENT_TIMESTAMP`)
        .bind(identity.id, JSON.stringify(items), JSON.stringify(items)).run();
      return json({ items });
    }

    if (method === "POST" && pathname === "/api/v1/customer/cart/merge") {
      const guestItems = normalizeCartItems((await body(request)).items);
      const snapshot = JSON.stringify(guestItems);
      await env.DB.prepare(`INSERT OR IGNORE INTO agroseed_customer_carts
        (customer_id, items_json, guest_snapshot_json) VALUES (?, '[]', '[]')`).bind(identity.id).run();
      for (let attempt = 0; attempt < 5; attempt++) {
        const row = await env.DB.prepare("SELECT items_json, guest_snapshot_json FROM agroseed_customer_carts WHERE customer_id = ?").bind(identity.id).first();
        const items = mergeCartItems(JSON.parse(row.items_json), guestItems, JSON.parse(row.guest_snapshot_json));
        if (items.length > 50) return json({ error: "Remove items from your bag before combining carts." }, 409);
        const result = await env.DB.prepare(`UPDATE agroseed_customer_carts
          SET items_json = ?, guest_snapshot_json = ?, updated_at = CURRENT_TIMESTAMP
          WHERE customer_id = ? AND items_json = ? AND guest_snapshot_json = ?`)
          .bind(JSON.stringify(items), snapshot, identity.id, row.items_json, row.guest_snapshot_json).run();
        if (result.meta.changes === 1) return json({ items });
      }
      return json({ error: "Your bag changed during syncing. Try again." }, 409);
    }

    if (method === "GET" && pathname === "/api/v1/customer/addresses") {
      const { results = [] } = await env.DB.prepare(`SELECT id, name, phone, line1, line2, city, state, pincode, is_default, created_at
        FROM agroseed_customer_addresses WHERE customer_id = ? ORDER BY is_default DESC, created_at DESC`).bind(identity.id).all();
      return json({ items: results.map((row) => ({ ...row, isDefault: Boolean(row.is_default) })) });
    }

    if (method === "GET" && pathname === "/api/v1/customer/orders") {
      return json({ items: await customerOrders(env, identity.id) });
    }

    if (method === "POST" && pathname === "/api/v1/customer/checkout/create-order") {
      const input = await body(request);
      const addressId = String(input.addressId || "");
      if (!/^[0-9a-f-]{36}$/i.test(addressId)) return json({ error: "Choose a valid saved delivery address." }, 400);
      const addressRow = await env.DB.prepare(`SELECT id, name, phone, line1, line2, city, state, pincode, is_default
        FROM agroseed_customer_addresses WHERE id = ? AND customer_id = ?`).bind(addressId, identity.id).first();
      if (!addressRow) return json({ error: "That saved address does not belong to this account." }, 404);
      const submittedAddress = input.address && typeof input.address === "object" && !Array.isArray(input.address) ? input.address : addressRow;
      const cartRow = await env.DB.prepare("SELECT items_json FROM agroseed_customer_carts WHERE customer_id = ?").bind(identity.id).first();
      let items = [];
      try { items = normalizeCartItems(JSON.parse(cartRow?.items_json || "[]")); } catch { return json({ error: "Your saved bag is invalid. Review it and try again." }, 400); }
      if (!items.length) return json({ error: "Your bag is empty." }, 400);
      const address = {
        id: addressRow?.id || crypto.randomUUID(),
        name: String(submittedAddress.name || "").trim().slice(0, 120),
        phone: String(submittedAddress.phone || "").replace(/\D/g, "").slice(0, 10),
        line1: String(submittedAddress.line1 || "").trim().slice(0, 200),
        line2: String(submittedAddress.line2 || "").trim().slice(0, 200),
        city: String(submittedAddress.city || "").trim().slice(0, 100),
        state: String(submittedAddress.state || "").trim().slice(0, 100),
        pincode: String(submittedAddress.pincode || "").trim(),
        isDefault: Boolean(addressRow?.is_default)
      };
      const order = await createCustomerTestOrder(env, { id: identity.id, email: identity.email, name: profile.name || identity.name }, { items, couponCode: input.couponCode || "", address, idempotencyKey: input.idempotencyKey });
      return json(order, 201);
    }

    if (method === "POST" && pathname === "/api/v1/customer/checkout/verify-payment") {
      const details = await body(request);
      const result = await verifyCustomerTestPayment(env, identity.id, details);
      await env.DB.prepare("UPDATE agroseed_customer_carts SET items_json = '[]', guest_snapshot_json = '[]', updated_at = CURRENT_TIMESTAMP WHERE customer_id = ?")
        .bind(identity.id).run();
      return json(result);
    }

    const checkoutClose = pathname.match(/^\/api\/v1\/customer\/checkout\/orders\/(order_[A-Za-z0-9]+)\/(cancel|failed)$/);
    if (method === "POST" && checkoutClose) {
      const reason = checkoutClose[2] === "failed" ? "payment_failed" : "cancelled";
      return json(await closeCustomerTestOrder(env, identity.id, checkoutClose[1], reason));
    }

    if (method === "PATCH" && pathname === "/api/v1/customer/profile") {
      const input = await body(request);
      const name = String(input.name || "").trim();
      if (name.length > 120) return json({ error: "Enter a name up to 120 characters." }, 400);
      await env.DB.prepare("UPDATE agroseed_customers SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(name || null, identity.id).run();
      return json({ ok: true });
    }

    if ((method === "POST" || method === "PUT") && pathname === "/api/v1/customer/addresses") {
      const input = await body(request);
      const fields = ["name", "phone", "line1", "city", "state", "pincode"];
      if (fields.some((key) => !String(input[key] || "").trim()) || !/^\d{6}$/.test(String(input.pincode))) return json({ error: "Complete recipient, address, state, and six-digit PIN code." }, 400);
      const phone = String(input.phone).replace(/\D/g, "");
      if (!/^[6-9]\d{9}$/.test(phone)) return json({ error: "Enter a valid Indian mobile number." }, 400);
      const id = String(input.id || crypto.randomUUID());
      const existing = await env.DB.prepare("SELECT customer_id FROM agroseed_customer_addresses WHERE id = ?").bind(id).first();
      if (existing && existing.customer_id !== identity.id) return json({ error: "Address not found." }, 404);
      if (input.isDefault) await env.DB.prepare("UPDATE agroseed_customer_addresses SET is_default = 0 WHERE customer_id = ?").bind(identity.id).run();
      const hasDefault = await env.DB.prepare("SELECT id FROM agroseed_customer_addresses WHERE customer_id = ? AND is_default = 1 AND id <> ? LIMIT 1").bind(identity.id, id).first();
      const isDefault = Boolean(input.isDefault || !hasDefault);
      await env.DB.prepare(`INSERT INTO agroseed_customer_addresses (id, customer_id, name, phone, line1, line2, city, state, pincode, is_default)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET name = excluded.name, phone = excluded.phone, line1 = excluded.line1, line2 = excluded.line2,
          city = excluded.city, state = excluded.state, pincode = excluded.pincode, is_default = excluded.is_default`)
        .bind(id, identity.id, String(input.name).trim(), phone, String(input.line1).trim(), String(input.line2 || "").trim(), String(input.city).trim(), String(input.state).trim(), String(input.pincode), isDefault ? 1 : 0).run();
      return json({ ok: true, id });
    }

    const addressId = pathname.match(/^\/api\/v1\/customer\/addresses\/([0-9a-f-]{36})$/i)?.[1];
    if (method === "DELETE" && addressId) {
      const result = await env.DB.prepare("DELETE FROM agroseed_customer_addresses WHERE id = ? AND customer_id = ?").bind(addressId, identity.id).run();
      return result.meta?.changes ? json({ ok: true }) : json({ error: "Address not found." }, 404);
    }

    return json({ error: "Customer route not found." }, 404);
  } catch (error) {
    if (error.statusCode) return json({ error: error.message }, error.statusCode);
    console.error("Customer API error", { message: String(error?.message || "unknown").slice(0, 300) });
    return json({ error: "Customer account service is temporarily unavailable." }, 503);
  }
}
