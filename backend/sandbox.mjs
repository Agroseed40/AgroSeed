import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { allowSandboxOrders, demoMode } from "../config/features.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const storeFile = path.join(root, "storage", "sandbox-store.json");
const seedFile = path.join(root, "backend", "seed", "products.json");
const demoEnabled = demoMode && process.env.NODE_ENV !== "production";
const sessions = new Map();
const loginAttempts = new Map();
const orderPattern = /^AS-SBX-[A-Z0-9-]{8,40}$/;
let statePromise;
let writes = Promise.resolve();

const clone = (value) => JSON.parse(JSON.stringify(value));
const slug = (value) => String(value || "product").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "product";
const now = () => new Date().toISOString();
const hash = (value) => createHash("sha256").update(value).digest("hex");

function normalizeProduct(product, index) {
  const variants = Array.isArray(product.variants) && product.variants.length ? product.variants : [{
    sku: product.sku || `SB-${String(index + 1).padStart(4, "0")}`,
    pack: product.pack || "1 pack",
    pricePaise: Number(product.pricePaise ?? Math.round(Number(product.price || 0) * 100)),
    mrpPaise: Number(product.mrpPaise ?? Math.round(Number(product.old || product.price || 0) * 100)),
    stock: Number(product.stock || 0), active: true
  }];
  const cleanVariants = variants.map((v, i) => ({
    sku: String(v.sku || `${product.sku || `SB-${index + 1}`}-${i + 1}`).trim().toUpperCase(),
    pack: String(v.pack || v.label || "1 pack").trim(),
    pricePaise: Math.max(0, Math.round(Number(v.pricePaise ?? v.price * 100 ?? 0))),
    mrpPaise: Math.max(0, Math.round(Number(v.mrpPaise ?? v.mrp * 100 ?? v.pricePaise ?? 0))),
    stock: Math.max(0, Math.floor(Number(v.stock ?? product.stock ?? 0))),
    reserved: Math.max(0, Math.floor(Number(v.reserved ?? 0))),
    active: v.active !== false
  }));
  const primary = cleanVariants[0];
  const status = ["draft", "review", "published", "archived"].includes(product.status) ? product.status : (product.active === false ? "archived" : "published");
  return {
    ...product, id: Number(product.id) || index + 1,
    slug: String(product.slug || slug(product.nameEn || product.name)),
    sku: primary.sku, variants: cleanVariants,
    pricePaise: primary.pricePaise, mrpPaise: primary.mrpPaise,
    stock: cleanVariants.reduce((sum, variant) => sum + variant.stock, 0),
    status, active: status === "published",
    featured: product.featured === true,
    name: String(product.name || product.nameEn || "Untitled product"),
    nameEn: String(product.nameEn || product.name || "Untitled product"),
    brand: String(product.brand || product.brandEn || "AgroSeed"),
    brandEn: String(product.brandEn || product.brand || "AgroSeed"),
    category: String(product.category || product.categoryEn || "Farm supplies"),
    categoryEn: String(product.categoryEn || product.category || "Farm supplies"),
    labelInfo: String(product.labelInfo || "").slice(0, 20000), labelInfoHi: String(product.labelInfoHi || "").slice(0, 20000),
    directions: String(product.directions || "").slice(0, 20000), directionsHi: String(product.directionsHi || "").slice(0, 20000),
    safetyInfo: String(product.safetyInfo || "").slice(0, 20000), safetyInfoHi: String(product.safetyInfoHi || "").slice(0, 20000),
    images: Array.isArray(product.images) ? product.images : [],
    imageAlt: Array.isArray(product.imageAlt) ? product.imageAlt.map((alt) => String(alt || "").slice(0, 180)) : []
  };
}

async function readState() {
  await mkdir(path.dirname(storeFile), { recursive: true });
  try {
    const state = JSON.parse(await readFile(storeFile, "utf8"));
    const legacyReservationSkus = new Set((state.products || []).flatMap((product) => (product.variants || []).filter((variant) => !Object.hasOwn(variant, "reserved")).map((variant) => String(variant.sku || "").toUpperCase())));
    state.products = (state.products || []).map(normalizeProduct);
    if (legacyReservationSkus.size) {
      const held = new Map();
      for (const order of state.orders || []) if (["sandbox_pending", "confirmed", "packing"].includes(order.status)) for (const line of order.items || []) held.set(String(line.sku).toUpperCase(), (held.get(String(line.sku).toUpperCase()) || 0) + Number(line.quantity || 0));
      for (const product of state.products) for (const variant of product.variants) if (legacyReservationSkus.has(variant.sku)) { const quantity = held.get(variant.sku) || 0; variant.stock += quantity; variant.reserved = quantity; }
      for (const product of state.products) product.stock = product.variants.reduce((sum, variant) => sum + variant.stock, 0);
    }
    return Object.assign({ orders: [], carts: {}, serviceAreas: [], coupons: [], audit: [], inventoryTransactions: [], supportRequests: [], settings: {} }, state);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    const seed = JSON.parse(await readFile(seedFile, "utf8"));
    const initial = { products: (seed.products || seed).map(normalizeProduct), orders: [], carts: {}, serviceAreas: [], coupons: [], audit: [], inventoryTransactions: [], supportRequests: [], settings: { storeName: "AgroSeed", currency: "INR" } };
    const temp = `${storeFile}.tmp`;
    await writeFile(temp, `${JSON.stringify(initial, null, 2)}\n`, "utf8");
    await rename(temp, storeFile);
    return initial;
  }
}

function state() { statePromise ??= readState(); return statePromise; }

async function change(mutator) {
  let result;
  const operation = writes.then(async () => {
    const current = await state();
    result = await mutator(current);
    await mkdir(path.dirname(storeFile), { recursive: true });
    const temp = `${storeFile}.tmp`;
    await writeFile(temp, `${JSON.stringify(current, null, 2)}\n`, "utf8");
    await rename(temp, storeFile);
  });
  writes = operation.catch(() => {});
  await operation;
  return result;
}

async function expireSandboxReservations() {
  const data = await state();
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  if (!data.orders.some((order) => order.status === "sandbox_pending" && Date.parse(order.createdAt) < cutoff)) return;
  await change((current) => {
    for (const order of current.orders) {
      if (order.status !== "sandbox_pending" || Date.parse(order.createdAt) >= cutoff) continue;
      order.status = "expired"; order.updatedAt = now();
      order.statusHistory ||= [{ status: "sandbox_pending", actor: "Preview customer", at: order.createdAt }];
      order.statusHistory.push({ status: "expired", actor: "Preview system", at: now() });
      for (const line of order.items || []) {
        const found = findVariant(current, line.sku);
        if (!found) continue;
        found.variant.stock += line.quantity; found.variant.reserved = Math.max(0, found.variant.reserved - line.quantity);
        found.product.stock = found.product.variants.reduce((sum, variant) => sum + variant.stock, 0);
        current.inventoryTransactions.unshift({ id: randomBytes(8).toString("hex"), sku: line.sku, delta: line.quantity, reason: "Expired preview reservation", orderNumber: order.orderNumber, actor: "Preview system", createdAt: now() });
      }
      audit(current, "sandbox_reservation_expired", "order", order.orderNumber, "Preview reservation released after 24 hours");
    }
  });
}

function send(response, status, value, extra = {}) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...extra });
  response.end(JSON.stringify(value));
}

async function body(request, limit = 6 * 1024 * 1024) {
  let size = 0; const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error("Request is too large"), { statusCode: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw Object.assign(new Error("Request body must be valid JSON"), { statusCode: 400 }); }
}

function cookieValue(request, name) {
  const row = (request.headers.cookie || "").split(";").map((item) => item.trim()).find((item) => item.startsWith(`${name}=`));
  return row ? decodeURIComponent(row.slice(name.length + 1)) : "";
}

function adminSession(request) {
  const raw = cookieValue(request, "agroseed_admin");
  const session = raw ? sessions.get(hash(raw)) : null;
  if (!session || session.expires < Date.now()) { if (raw) sessions.delete(hash(raw)); return null; }
  return session;
}

function requireAdmin(request, response, mutating = false) {
  const session = adminSession(request);
  if (!session) { send(response, 401, { error: "Sign in to the staff console." }); return null; }
  if (mutating && request.headers["x-agroseed-csrf"] !== session.csrf) { send(response, 403, { error: "Your staff session expired. Sign in again." }); return null; }
  return session;
}

const ADMIN_ROLE_PERMISSIONS = Object.freeze({
  Owner: Object.freeze(["*"]),
  "Owner/Admin": Object.freeze(["*"]),
  Catalog: Object.freeze(["products", "media", "import", "catalog", "inventory"]),
  Orders: Object.freeze(["orders", "support", "inventory"])
});

function adminPermissionFor(path) {
  if (path === "/overview" || path === "/audit" || path === "/reports" || path === "/settings" || path === "/coupons" || /^\/coupons\//.test(path) || path === "/service-areas" || /^\/service-areas\//.test(path)) return "owner";
  if (path === "/products" || /^\/products\//.test(path)) return "products";
  if (path === "/media") return "media";
  if (path === "/import") return "import";
  if (path === "/catalog" || /^\/catalog\//.test(path)) return "catalog";
  if (path === "/inventory") return "inventory";
  if (path === "/orders" || /^\/orders\//.test(path)) return "orders";
  if (path === "/support" || /^\/support\//.test(path)) return "support";
  return "owner";
}

export function canAccessAdminPath(role, path) {
  const permissions = ADMIN_ROLE_PERMISSIONS[role] || [];
  const required = adminPermissionFor(path);
  return permissions.includes("*") || permissions.includes(required);
}

function audit(data, action, entity, entityId, detail) {
  data.audit.unshift({ id: randomBytes(9).toString("hex"), actor: "Store owner", action, entity, entityId: String(entityId), detail: String(detail || ""), createdAt: now() });
  data.audit = data.audit.slice(0, 1500);
}

function deriveCollections(products, configuredCategories = [], configuredBrands = [], includeInactive = false) {
  const categoryMap = new Map(products.map((p) => [p.categoryEn, { id: slug(p.categoryEn), name: p.category, nameEn: p.categoryEn, slug: slug(p.categoryEn), active: true, order: 0 }]));
  const brandMap = new Map(products.map((p) => [p.brandEn, { id: slug(p.brandEn), name: p.brand, nameEn: p.brandEn, slug: slug(p.brandEn), active: true, order: 0 }]));
  configuredCategories.forEach((item) => categoryMap.set(item.nameEn, { id: item.id || slug(item.nameEn), slug: item.slug || slug(item.nameEn), active: true, order: 0, ...item }));
  configuredBrands.forEach((item) => brandMap.set(item.nameEn, { id: item.id || slug(item.nameEn), slug: item.slug || slug(item.nameEn), active: true, order: 0, ...item }));
  const orderRows = (rows) => [...rows.values()].filter((item) => includeInactive || item.active !== false).sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0) || a.nameEn.localeCompare(b.nameEn));
  const categories = orderRows(categoryMap);
  const brands = orderRows(brandMap);
  return { categories, brands };
}

function normalizeTaxonomy(rows, label) {
  if (!Array.isArray(rows) || rows.length > 100) throw Object.assign(new Error(`${label} must contain at most 100 rows.`), { statusCode: 400 });
  const seen = new Set();
  return rows.map((row) => {
    const nameEn = String(row.nameEn || "").trim();
    if (!nameEn || nameEn.length > 80) throw Object.assign(new Error(`${label} names must be 1–80 characters.`), { statusCode: 400 });
    const key = nameEn.toLocaleLowerCase();
    if (seen.has(key)) throw Object.assign(new Error(`${label} names must be unique.`), { statusCode: 400 });
    seen.add(key);
    return { id: slug(nameEn), slug: slug(nameEn), name: String(row.name || nameEn).trim().slice(0, 100), nameEn, active: row.active !== false && row.active !== "false", order: Math.min(1000, Math.max(0, Number(row.order) || 0)) };
  });
}

function cleanProduct(input, previous, data) {
  const name = String(input.name || input.nameEn || "").trim();
  const nameEn = String(input.nameEn || name).trim();
  const nameHi = String(input.name || nameEn).trim();
  if (!nameHi || !nameEn) throw Object.assign(new Error("Add a product name in English and Hindi."), { statusCode: 400 });
  const rawVariants = Array.isArray(input.variants) ? input.variants : [];
  if (!rawVariants.length) throw Object.assign(new Error("Add at least one pack variant."), { statusCode: 400 });
  const variants = rawVariants.map((variant) => {
    const sku = String(variant.sku || "").trim().toUpperCase();
    const pack = String(variant.pack || "").trim();
    const pricePaise = Number(variant.pricePaise);
    const mrpPaise = Number(variant.mrpPaise ?? pricePaise);
    const stock = Number(variant.stock ?? 0);
    if (!/^[A-Z0-9][A-Z0-9._-]{1,39}$/.test(sku) || !pack || !Number.isInteger(pricePaise) || pricePaise < 0 || !Number.isInteger(mrpPaise) || mrpPaise < pricePaise || !Number.isInteger(stock) || stock < 0) {
      throw Object.assign(new Error(`Check pack, SKU, price, MRP, and stock for ${sku || "each variant"}. Prices use paise.`), { statusCode: 400 });
    }
    const owner = data.products.find((p) => p.id !== previous?.id && p.variants.some((v) => v.sku === sku));
    if (owner) throw Object.assign(new Error(`SKU ${sku} already belongs to another product.`), { statusCode: 409 });
    const reserved = Math.max(0, Math.floor(Number(previous?.variants?.find((item) => item.sku === sku)?.reserved ?? variant.reserved ?? 0)));
    return { sku, pack, pricePaise, mrpPaise, stock, reserved, active: variant.active !== false };
  });
  if (previous?.variants?.some((variant) => variant.reserved > 0 && !variants.some((next) => next.sku === variant.sku))) throw Object.assign(new Error("A pack with active orders cannot be removed or renamed until its reservations are released."), { statusCode: 409 });
  const status = ["draft", "review", "published", "archived"].includes(input.status) ? input.status : "draft";
  let productSlug = slug(input.slug || nameEn);
  if (data.products.some((p) => p.id !== previous?.id && p.slug === productSlug)) productSlug += `-${previous?.id || Date.now().toString(36)}`;
  return {
    ...(previous || {}), id: previous?.id || Math.max(0, ...data.products.map((p) => p.id)) + 1, slug: productSlug,
    name: nameHi, nameEn, brand: String(input.brand || input.brandEn || "AgroSeed").trim(), brandEn: String(input.brandEn || input.brand || "AgroSeed").trim(),
    category: String(input.category || input.categoryEn || "Farm supplies").trim(), categoryEn: String(input.categoryEn || input.category || "Farm supplies").trim(),
    description: String(input.description || ""), descriptionEn: String(input.descriptionEn || ""),
    labelInfo: String(input.labelInfo || "").trim().slice(0, 20000), labelInfoHi: String(input.labelInfoHi || "").trim().slice(0, 20000),
    directions: String(input.directions || "").trim().slice(0, 20000), directionsHi: String(input.directionsHi || "").trim().slice(0, 20000),
    safetyInfo: String(input.safetyInfo || "").trim().slice(0, 20000), safetyInfoHi: String(input.safetyInfoHi || "").trim().slice(0, 20000),
    status, active: status === "published", images: Array.isArray(input.images) ? input.images.filter((image) => typeof image === "string" && image.length < 1000).slice(0, 8) : (previous?.images || []),
    imageAlt: Array.isArray(input.imageAlt) ? input.imageAlt.slice(0, 8).map((alt) => String(alt || "").trim().slice(0, 180)) : (previous?.imageAlt || []),
    featured: input.featured === true || input.featured === "true" || input.featured === "on",
    variants, sku: variants[0].sku, pricePaise: variants[0].pricePaise, mrpPaise: variants[0].mrpPaise, stock: variants.reduce((sum, v) => sum + v.stock, 0),
    updatedAt: now(), createdAt: previous?.createdAt || now()
  };
}

function findVariant(data, sku) {
  for (const product of data.products) {
    const variant = product.variants.find((item) => item.sku.toLowerCase() === String(sku || "").toLowerCase());
    if (variant) return { product, variant };
  }
  return null;
}

function calculate(data, input) {
  if (!Array.isArray(input.items) || !input.items.length || input.items.length > 50) throw Object.assign(new Error("Add between 1 and 50 cart items."), { statusCode: 400 });
  const consolidated = new Map();
  for (const item of input.items) {
    const sku = String(item?.sku || "").trim().toUpperCase();
    const quantity = Number(item?.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) throw Object.assign(new Error("Each quantity must be between 1 and 99."), { statusCode: 400 });
    const totalQuantity = (consolidated.get(sku) || 0) + quantity;
    if (totalQuantity > 99) throw Object.assign(new Error("A SKU can have at most 99 items in the cart."), { statusCode: 400 });
    consolidated.set(sku, totalQuantity);
  }
  const lines = [];
  for (const [sku, quantity] of consolidated) {
    const found = findVariant(data, sku);
    if (!found || found.product.status !== "published" || !found.variant.active) throw Object.assign(new Error(`Product ${sku} is no longer available.`), { statusCode: 409 });
    if (quantity > found.variant.stock) throw Object.assign(new Error(`Only ${found.variant.stock} of ${found.variant.pack} are in stock.`), { statusCode: 409 });
    lines.push({ sku, productId: found.product.id, name: found.product.name, nameEn: found.product.nameEn, brand: found.product.brandEn, pack: found.variant.pack, quantity, unitPricePaise: found.variant.pricePaise, lineTotalPaise: quantity * found.variant.pricePaise });
  }
  const subtotalPaise = lines.reduce((sum, item) => sum + item.lineTotalPaise, 0);
  const code = String(input.couponCode || "").trim().toUpperCase();
  const coupon = code && data.coupons.find((item) => item.code === code && item.active !== false && (!item.expiresAt || Date.now() <= Date.parse(`${item.expiresAt}T23:59:59Z`)) && (!item.maxUses || (Number(item.usesCount) || 0) < item.maxUses) && subtotalPaise >= (Number(item.minSubtotalPaise) || 0));
  if (code && !coupon) throw Object.assign(new Error("That promotion code is not currently available."), { statusCode: 400 });
  const discountPaise = !coupon ? 0 : coupon.type === "percent" ? Math.min(subtotalPaise, Math.floor(subtotalPaise * coupon.value / 100)) : Math.min(subtotalPaise, Number(coupon.valuePaise ?? coupon.value) || 0);
  const pin = String(input.address?.pincode || input.pincode || "").trim();
  const area = data.serviceAreas.find((item) => item.pincode === pin && item.active !== false);
  if (pin && !/^\d{6}$/.test(pin)) throw Object.assign(new Error("Enter a valid 6-digit PIN code."), { statusCode: 400 });
  if (input.address && !/^\d{6}$/.test(pin)) throw Object.assign(new Error("Enter a valid 6-digit PIN code."), { statusCode: 400 });
  if (input.address && (!String(input.address.name || "").trim() || !String(input.address.line1 || "").trim() || !String(input.address.city || "").trim() || !String(input.address.state || "").trim() || !/^[6-9]\d{9}$/.test(String(input.address.phone || "").replace(/\D/g, "")))) throw Object.assign(new Error("Add complete delivery details and a valid Indian mobile number."), { statusCode: 400 });
  if (input.address && data.serviceAreas.length && !area) throw Object.assign(new Error("Delivery is not configured for this PIN code."), { statusCode: 400 });
  const shippingPaise = area ? Math.max(0, Number(area.feePaise) || 0) : 0;
  return { items: lines, subtotalPaise, discountPaise, shippingPaise, totalPaise: subtotalPaise - discountPaise + shippingPaise, taxStatus: "not_configured", couponCode: coupon?.code || null, serviceArea: area || null, serviceability: data.serviceAreas.length ? (area ? "configured" : "not_checked") : "preview_only" };
}

function publicOrder(order) {
  const { lookupTokenHash, ...visible } = order;
  return visible;
}
function catalogProduct(product) { return { ...product, variants: product.variants.map(({ reserved, ...variant }) => variant) }; }

async function readAndSend(request, response, status, data) { send(response, status, data); }

export async function handleSandboxRequest(request, response, pathname) {
  if (!pathname.startsWith("/api/")) return false;
  try {
    const url = new URL(request.url || "/", "http://localhost");
    const method = request.method;
    if (pathname === "/api/v1/health" && method === "GET") { send(response, 200, { status: "ok", service: "agroseed-preview-api", mode: demoEnabled ? "local-sandbox" : "disabled" }); return true; }
    if (pathname === "/api/v1/storefront/settings" && method === "GET") { if (!demoEnabled) { send(response, 503, { error: "Store settings are available in local preview only." }); return true; } const data = await state(), allowed = ["storeName", "publicDomain", "storeAbout", "supportEmail", "supportPhone", "supportDetails", "businessDetails", "homeHeroEyebrow", "homeHeroHeadline", "homeHeroBody", "homeHeroNote", "homeHeroPrimaryCta", "deliveryRules", "codPolicy", "cancellationReturnsRules", "shippingReturnsPolicy", "privacyPolicy", "termsPolicy", "productUseNotice"]; send(response, 200, Object.fromEntries(allowed.map((key) => [key, String(data.settings?.[key] || "")]))); return true; }
    if (pathname === "/api/v1/storefront/offers" && method === "GET") { if (!demoEnabled) { send(response, 503, { error: "Store offers are available in local preview only." }); return true; } const data = await state(), time = Date.now(), items = (data.coupons || []).filter((item) => item.active !== false && (!item.expiresAt || time <= Date.parse(`${item.expiresAt}T23:59:59Z`)) && (!item.maxUses || (Number(item.usesCount) || 0) < item.maxUses)).map(({ code, type, value, minSubtotalPaise, expiresAt }) => ({ code, type, value, minSubtotalPaise: Number(minSubtotalPaise) || 0, expiresAt: expiresAt || null })); send(response, 200, { items }); return true; }
    if (pathname === "/api/v1/cart" && (method === "GET" || method === "PUT")) {
      if (!demoEnabled) { send(response, 503, { error: "Guest carts are available in local preview only." }); return true; }
      const id = String(request.headers["x-agroseed-cart-id"] || "").trim();
      if (!/^[a-f0-9]{32}$/i.test(id)) { send(response, 400, { error: "A valid guest cart ID is required." }); return true; }
      const key = hash(id);
      if (method === "GET") { const data = await state(); send(response, 200, data.carts?.[key] || { items: [], updatedAt: null }); return true; }
      const input = await body(request, 12_000);
      if (!Array.isArray(input.items) || input.items.length > 50) { send(response, 400, { error: "A guest cart can contain at most 50 lines." }); return true; }
      const quantities = new Map();
      for (const item of input.items) { const sku = String(item?.sku || "").trim().toUpperCase(), quantity = Number(item?.quantity), found = findVariant(await state(), sku); if (!found || found.product.status !== "published" || !found.variant.active) { send(response, 409, { error: `Product ${sku || "item"} is no longer available.` }); return true; } if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) { send(response, 400, { error: "Cart quantities must be whole numbers from 1 to 99." }); return true; } const total = (quantities.get(sku) || 0) + quantity; if (total > 99) { send(response, 400, { error: "A SKU can have at most 99 items in the cart." }); return true; } quantities.set(sku, total); }
      const result = await change((data) => { data.carts ||= {}; const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000; for (const [cartKey, cartValue] of Object.entries(data.carts)) if (Date.parse(cartValue.updatedAt || "") < cutoff) delete data.carts[cartKey]; const cart = { items: [...quantities].map(([sku, quantity]) => ({ sku, quantity })), updatedAt: now() }; data.carts[key] = cart; return cart; }); send(response, 200, result); return true;
    }
    if (pathname === "/api/v1/admin/session" && method === "POST") {
      if (!demoEnabled) { send(response, 503, { error: "The staff demo is available in local development only." }); return true; }
      const ip = request.socket.remoteAddress || "unknown";
      const attempt = loginAttempts.get(ip) || { count: 0, since: Date.now() };
      if (Date.now() - attempt.since > 15 * 60_000) { attempt.count = 0; attempt.since = Date.now(); }
      if (attempt.count >= 8) { send(response, 429, { error: "Too many sign-in attempts. Try again in 15 minutes." }); return true; }
      const input = await body(request, 2048);
      const configured = process.env.AGROSEED_ADMIN_PASSWORD || "";
      if (!configured) { send(response, 503, { error: "Set AGROSEED_ADMIN_PASSWORD in your local environment to enable the staff demo." }); return true; }
      const supplied = Buffer.from(String(input.password || "")); const expected = Buffer.from(configured);
      const match = supplied.length === expected.length && timingSafeEqual(supplied, expected);
      if (!match) { attempt.count++; loginAttempts.set(ip, attempt); send(response, 401, { error: "That password did not match." }); return true; }
      loginAttempts.delete(ip);
      const raw = randomBytes(32).toString("base64url");
      const csrf = randomBytes(24).toString("base64url");
      sessions.set(hash(raw), { role: "Owner", csrf, expires: Date.now() + 8 * 60 * 60_000 });
      send(response, 200, { user: { name: "Store owner", role: "Owner" }, csrf }, { "Set-Cookie": `agroseed_admin=${encodeURIComponent(raw)}; HttpOnly; SameSite=Strict; Path=/api/v1/admin; Max-Age=28800` }); return true;
    }
    if (pathname === "/api/v1/admin/session" && (method === "GET" || method === "DELETE")) {
      if (!demoEnabled) { send(response, 503, { error: "Staff demo is disabled." }); return true; }
      const session = requireAdmin(request, response, method === "DELETE"); if (!session) return true;
      if (method === "DELETE") { sessions.delete(hash(cookieValue(request, "agroseed_admin"))); send(response, 200, { ok: true }, { "Set-Cookie": "agroseed_admin=; HttpOnly; SameSite=Strict; Path=/api/v1/admin; Max-Age=0" }); }
      else send(response, 200, { user: { name: "Store owner", role: session.role || "Owner" }, csrf: session.csrf }); return true;
    }
    if (!demoEnabled) { send(response, 503, { error: "Preview workflows are disabled. Connect the approved production services before launch." }); return true; }
    await expireSandboxReservations();

    if (pathname === "/api/v1/products" && method === "GET") {
      const data = await state();
      const hiddenCategories = new Set((data.categories || []).filter((item) => item.active === false).map((item) => item.nameEn));
      const hiddenBrands = new Set((data.brands || []).filter((item) => item.active === false).map((item) => item.nameEn));
      let products = data.products.filter((item) => item.status === "published" && !hiddenCategories.has(item.categoryEn) && !hiddenBrands.has(item.brandEn));
      const q = (url.searchParams.get("q") || "").trim().toLocaleLowerCase();
      const category = url.searchParams.get("category"); const brand = url.searchParams.get("brand");
      if (category) products = products.filter((p) => slug(p.categoryEn) === category || p.categoryEn.toLocaleLowerCase() === category.toLocaleLowerCase());
      if (brand) products = products.filter((p) => slug(p.brandEn) === brand || p.brandEn.toLocaleLowerCase() === brand.toLocaleLowerCase());
      if (q) products = products.filter((p) => [p.name, p.nameEn, p.brand, p.brandEn, p.category, p.categoryEn, p.sku, ...p.variants.map((v) => v.sku)].join(" ").toLocaleLowerCase().includes(q));
      const sortBy = url.searchParams.get("sort");
      if (sortBy === "price-low") products.sort((a, b) => a.pricePaise - b.pricePaise);
      if (sortBy === "price-high") products.sort((a, b) => b.pricePaise - a.pricePaise);
      if (sortBy === "name") products.sort((a, b) => a.nameEn.localeCompare(b.nameEn));
      if (!sortBy || sortBy === "featured") products.sort((a, b) => Number(b.featured) - Number(a.featured));
      const total = products.length; const page = Math.max(1, Number(url.searchParams.get("page")) || 1); const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 24));
        send(response, 200, { items: products.slice((page - 1) * limit, page * limit).map(catalogProduct), total, page, limit, pages: Math.max(1, Math.ceil(total / limit)), ...deriveCollections(data.products.filter((p) => p.status === "published"), data.categories, data.brands) }); return true;
    }
    const publicProduct = pathname.match(/^\/api\/v1\/products\/(\d+|[a-z0-9-]+)$/);
    if (publicProduct && method === "GET") {
      const data = await state(); const needle = publicProduct[1]; const hiddenCategories = new Set((data.categories || []).filter((item) => item.active === false).map((item) => item.nameEn)); const hiddenBrands = new Set((data.brands || []).filter((item) => item.active === false).map((item) => item.nameEn)); const product = data.products.find((item) => item.status === "published" && !hiddenCategories.has(item.categoryEn) && !hiddenBrands.has(item.brandEn) && (String(item.id) === needle || item.slug === needle));
      if (!product) send(response, 404, { error: "Product not found." }); else send(response, 200, catalogProduct(product)); return true;
    }
    const service = pathname.match(/^\/api\/v1\/serviceability\/(\d{6})$/);
    if (service && method === "GET") {
      const data = await state(); const area = data.serviceAreas.find((item) => item.pincode === service[1] && item.active !== false);
      send(response, 200, { available: data.serviceAreas.length ? Boolean(area) : false, configured: data.serviceAreas.length > 0, previewOnly: !data.serviceAreas.length, area: area || null }); return true;
    }
    if (pathname === "/api/v1/support/requests" && method === "POST") {
      const input = await body(request, 12_000);
      if (!String(input.name || "").trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(input.email || "")) || String(input.message || "").trim().length < 10) { send(response, 400, { error: "Add your name, a valid email, and a message of at least 10 characters." }); return true; }
      const ticket = await change((data) => { const item = { id: randomBytes(6).toString("hex").toUpperCase(), name: String(input.name).trim(), email: String(input.email).trim(), topic: String(input.topic || "General"), message: String(input.message).trim().slice(0, 4000), status: "new", createdAt: now() }; data.supportRequests.unshift(item); return item.id; });
      send(response, 201, { received: true, ticket }); return true;
    }
    if (pathname === "/api/v1/checkout/quote" && method === "POST") {
      const input = await body(request, 16_000); const data = await state();
      const quote = calculate(data, input);
      if (input.address && !/^\d{6}$/.test(String(input.address.pincode || ""))) { send(response, 400, { error: "Enter a valid 6-digit PIN code." }); return true; }
      send(response, 200, { ...quote, expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(), currency: "INR", previewOnly: true }); return true;
    }
    if (pathname === "/api/v1/orders" && method === "POST") {
      const input = await body(request, 24_000);
      if (!allowSandboxOrders) { send(response, 503, { error: "Sandbox order creation is turned off." }); return true; }
      if (!input.items && input.productId) input.items = [{ sku: String(input.productId), quantity: input.quantity || 1 }];
      if (Array.isArray(input.items)) {
        const current = await state();
        input.items = input.items.map((item) => {
          if (item.sku || !item.productId) return item;
          const product = current.products.find((p) => p.id === Number(item.productId));
          return { ...item, sku: product?.variants?.[0]?.sku || String(item.productId) };
        });
      }
      if (input.address) {
        for (const field of ["name", "phone", "line1", "city", "state", "pincode"]) if (!String(input.address[field] || "").trim()) { send(response, 400, { error: `Complete the ${field} field.` }); return true; }
        if (!/^[6-9]\d{9}$/.test(String(input.address.phone).replace(/\D/g, ""))) { send(response, 400, { error: "Enter a valid Indian mobile number." }); return true; }
        if (!/^\d{6}$/.test(String(input.address.pincode))) { send(response, 400, { error: "Enter a valid 6-digit PIN code." }); return true; }
      }
      const order = await change((data) => {
        const quote = calculate(data, input);
        for (const line of quote.items) {
          const found = findVariant(data, line.sku); found.variant.stock -= line.quantity; found.variant.reserved += line.quantity;
          found.product.stock = found.product.variants.reduce((sum, item) => sum + item.stock, 0);
          data.inventoryTransactions.unshift({ id: randomBytes(8).toString("hex"), sku: line.sku, delta: -line.quantity, reason: "Sandbox order reservation", orderNumber: "pending", actor: "Preview customer", createdAt: now() });
        }
        if (quote.couponCode) { const coupon = data.coupons.find((item) => item.code === quote.couponCode); if (coupon) coupon.usesCount = (Number(coupon.usesCount) || 0) + 1; }
        const number = `AS-SBX-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`;
        const token = randomBytes(32).toString("base64url");
        const createdAt = now();
        const created = { orderNumber: number, status: "sandbox_pending", paymentStatus: "not_connected", paymentMethod: "not_connected", items: quote.items, subtotalPaise: quote.subtotalPaise, discountPaise: quote.discountPaise, shippingPaise: quote.shippingPaise, totalPaise: quote.totalPaise, taxStatus: quote.taxStatus, serviceability: quote.serviceability, address: input.address || null, couponCode: quote.couponCode, lookupTokenHash: hash(token), createdAt, reservationExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), statusHistory: [{ status: "sandbox_pending", actor: input.address?.name || "Preview customer", at: createdAt }], previewOnly: true };
        data.orders.unshift(created);
        data.inventoryTransactions.filter((row) => row.orderNumber === "pending").forEach((row) => { row.orderNumber = number; });
        audit(data, "sandbox_order_created", "order", number, "Preview order created and stock reserved");
        return { ...publicOrder(created), lookupToken: token };
      });
      send(response, 201, order); return true;
    }
    const customerOrder = pathname.match(/^\/api\/v1\/orders\/([^/]+)$/);
    if (customerOrder && method === "GET") {
      const number = decodeURIComponent(customerOrder[1]);
      if (!orderPattern.test(number)) { send(response, 404, { error: "Order not found." }); return true; }
      const credential = String(request.headers.authorization || "").replace(/^Bearer\s+/i, "");
      const data = await state(); const order = data.orders.find((item) => item.orderNumber === number);
      const credentialHash = Buffer.from(hash(credential)); const storedHash = Buffer.from(order?.lookupTokenHash || "");
      if (!order || !credential || credentialHash.length !== storedHash.length || !timingSafeEqual(credentialHash, storedHash)) { send(response, 404, { error: "Order not found. Check the number and private tracking code." }); return true; }
      send(response, 200, publicOrder(order)); return true;
    }

    if (pathname.startsWith("/api/v1/admin/")) {
      if (!demoEnabled) { send(response, 503, { error: "The staff preview is disabled." }); return true; }
      const mutating = method !== "GET";
      const session = requireAdmin(request, response, mutating); if (!session) return true;
      const adminPath = pathname.slice("/api/v1/admin".length);
      if (!canAccessAdminPath(session.role || "Owner", adminPath)) { send(response, 403, { error: "Your staff role cannot access this area." }); return true; }
      if (adminPath === "/media" && method === "POST") {
        const input = await body(request, 6 * 1024 * 1024);
        const match = String(input.data || "").match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
        if (!match) { send(response, 400, { error: "Choose a PNG, JPG, or WebP image." }); return true; }
        const buffer = Buffer.from(match[2], "base64");
        if (!buffer.length || buffer.length > 4 * 1024 * 1024) { send(response, 413, { error: "Images must be smaller than 4 MB." }); return true; }
        const isPng = buffer.length > 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
        const isJpeg = buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[buffer.length - 2] === 0xff && buffer[buffer.length - 1] === 0xd9;
        const isWebp = buffer.length > 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP";
        if (!(isPng || isJpeg || isWebp)) { send(response, 400, { error: "The image contents do not match PNG, JPG, or WebP format." }); return true; }
        const extension = isPng ? "png" : isJpeg ? "jpg" : "webp";
        const name = `${randomBytes(18).toString("hex")}.${extension}`;
        const directory = path.join(root, "storage", "uploads");
        await mkdir(directory, { recursive: true });
        await writeFile(path.join(directory, name), buffer, { flag: "wx" });
        await change((data) => audit(data, "image_uploaded", "image", name, "Product image uploaded to the local sandbox"));
        send(response, 201, { url: `/uploads/${name}`, filename: name }); return true;
      }
      if (adminPath === "/overview" && method === "GET") {
        const data = await state(); const published = data.products.filter((p) => p.status === "published").length;
        send(response, 200, { products: data.products.length, published, drafts: data.products.filter((p) => p.status === "draft" || p.status === "review").length, lowStock: data.products.flatMap((p) => p.variants.map((v) => ({ ...v, product: p.nameEn }))).filter((v) => v.stock <= 5).length, orders: data.orders.length, openOrders: data.orders.filter((o) => !["cancelled", "expired", "delivered", "refund_recorded"].includes(o.status)).length, revenuePaise: data.orders.filter((o) => o.status !== "cancelled").reduce((sum, o) => sum + o.totalPaise, 0), support: data.supportRequests.filter((item) => item.status === "new").length, recentOrders: data.orders.slice(0, 6).map(publicOrder) }); return true;
      }
      if (adminPath === "/products" && method === "GET") {
        const data = await state(); let products = data.products;
        const q = (url.searchParams.get("q") || "").trim().toLocaleLowerCase();
        const status = url.searchParams.get("status") || "";
        if (q) products = products.filter((p) => [p.name, p.nameEn, p.brand, p.brandEn, p.sku, ...p.variants.map((v) => v.sku)].join(" ").toLocaleLowerCase().includes(q));
        if (status) products = products.filter((p) => p.status === status);
        const total = products.length; const page = Math.max(1, Number(url.searchParams.get("page")) || 1); const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 20));
        send(response, 200, { items: products.slice((page - 1) * limit, page * limit), total, page, limit, pages: Math.max(1, Math.ceil(total / limit)), ...deriveCollections(data.products, data.categories, data.brands) }); return true;
      }
      if (adminPath === "/products" && method === "POST") {
        const input = await body(request); const result = await change((data) => { const product = cleanProduct(input, null, data); data.products.push(product); audit(data, "product_created", "product", product.id, product.nameEn); return product; }); send(response, 201, result); return true;
      }
      const productRoute = adminPath.match(/^\/products\/(\d+)$/);
      if (productRoute && (method === "GET" || method === "PATCH" || method === "DELETE")) {
        if (method === "GET") { const data = await state(); const product = data.products.find((p) => p.id === Number(productRoute[1])); if (!product) send(response, 404, { error: "Product not found." }); else send(response, 200, product); return true; }
        const product = await change(async (data) => { const current = data.products.find((p) => p.id === Number(productRoute[1])); if (!current) throw Object.assign(new Error("Product not found."), { statusCode: 404 }); if (method === "DELETE") { current.status = "archived"; current.active = false; current.updatedAt = now(); audit(data, "product_archived", "product", current.id, current.nameEn); return current; } const updated = cleanProduct(await body(request), current, data); Object.assign(current, updated); audit(data, "product_updated", "product", current.id, current.nameEn); return current; }); send(response, 200, product); return true;
      }
      if (adminPath === "/inventory" && method === "GET") { const data = await state(); send(response, 200, { products: data.products, transactions: data.inventoryTransactions.slice(0, 300) }); return true; }
      if (adminPath === "/inventory" && method === "POST") {
        const input = await body(request); const result = await change((data) => { const found = findVariant(data, input.sku); const delta = Number(input.delta); const reason = String(input.reason || "").trim(); if (!found) throw Object.assign(new Error("SKU not found."), { statusCode: 404 }); if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 10000) throw Object.assign(new Error("Stock change must be a non-zero whole number."), { statusCode: 400 }); if (found.variant.stock + delta < 0) throw Object.assign(new Error("Stock cannot go below zero."), { statusCode: 400 }); if (reason.length < 5) throw Object.assign(new Error("Add a reason (at least 5 characters)."), { statusCode: 400 }); found.variant.stock += delta; found.product.stock = found.product.variants.reduce((sum, item) => sum + item.stock, 0); const row = { id: randomBytes(8).toString("hex"), sku: found.variant.sku, delta, reason, actor: "Store owner", createdAt: now() }; data.inventoryTransactions.unshift(row); audit(data, "inventory_adjusted", "variant", found.variant.sku, `${delta > 0 ? "+" : ""}${delta}: ${reason}`); return row; }); send(response, 201, result); return true;
      }
      if (adminPath === "/import" && method === "POST") {
        const input = await body(request); if (!Array.isArray(input.rows) || !["create", "upsert"].includes(input.mode)) { send(response, 400, { error: "Choose create or update, and include CSV rows." }); return true; }
        const result = await change((data) => { const created = []; const updated = []; const errors = []; input.rows.slice(0, 1000).forEach((row, index) => { try { const incoming = { ...row, status: row.status || "draft", variants: Array.isArray(row.variants) ? row.variants : [{ sku: row.sku, pack: row.pack || "1 pack", pricePaise: Number(row.pricePaise), mrpPaise: Number(row.mrpPaise), stock: Number(row.stock) }] }; const existing = data.products.find((p) => p.variants.some((v) => v.sku === String(incoming.variants[0]?.sku || "").toUpperCase())); if (existing) { if (input.mode !== "upsert") throw new Error("SKU already exists; select update after reviewing."); Object.assign(existing, cleanProduct(incoming, existing, data)); updated.push(existing.sku); audit(data, "product_import_updated", "product", existing.id, existing.sku); } else { const product = cleanProduct(incoming, null, data); data.products.push(product); created.push(product.sku); audit(data, "product_import_created", "product", product.id, product.sku); } } catch (error) { errors.push({ row: index + 2, error: error.message }); } }); return { created, updated, errors }; }); send(response, 200, result); return true;
      }
      if (adminPath === "/orders" && method === "GET") {
        const data = await state(); let orders = data.orders;
        const status = url.searchParams.get("status") || "";
        const q = (url.searchParams.get("q") || "").trim().toLowerCase();
        if (status) orders = orders.filter((order) => order.status === status);
        if (q) orders = orders.filter((order) => [order.orderNumber, order.address?.name, order.address?.phone, order.address?.pincode].join(" ").toLowerCase().includes(q));
        const total = orders.length; const page = Math.max(1, Number(url.searchParams.get("page")) || 1); const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 20));
        send(response, 200, { items: orders.slice((page - 1) * limit, page * limit).map(publicOrder), total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) }); return true;
      }
      const orderRoute = adminPath.match(/^\/orders\/([^/]+)$/);
      if (orderRoute && method === "GET") { const data = await state(); const order = data.orders.find((item) => item.orderNumber === decodeURIComponent(orderRoute[1])); if (!order) send(response, 404, { error: "Order not found." }); else send(response, 200, publicOrder(order)); return true; }
      if (orderRoute && method === "PATCH") {
        const input = await body(request);
        const result = await change((data) => {
          const order = data.orders.find((item) => item.orderNumber === decodeURIComponent(orderRoute[1]));
          if (!order) throw Object.assign(new Error("Order not found."), { statusCode: 404 });
          const allowed = { sandbox_pending: ["confirmed", "cancelled"], confirmed: ["packing", "cancelled"], packing: ["shipped", "cancelled"], shipped: ["delivered", "returned"], delivered: ["returned"], returned: ["refund_recorded"], expired: [], cancelled: [], refund_recorded: [] };
          if (!allowed[order.status]?.includes(input.status)) throw Object.assign(new Error(`Cannot move an order from ${order.status} to ${input.status}.`), { statusCode: 400 });
          if (input.status === "cancelled") {
            for (const line of order.items) {
              const found = findVariant(data, line.sku); if (!found) continue;
              found.variant.stock += line.quantity; found.variant.reserved = Math.max(0, found.variant.reserved - line.quantity); found.product.stock = found.product.variants.reduce((sum, variant) => sum + variant.stock, 0);
              data.inventoryTransactions.unshift({ id: randomBytes(8).toString("hex"), sku: line.sku, delta: line.quantity, reason: "Sandbox cancellation stock release", orderNumber: order.orderNumber, actor: "Store owner", createdAt: now() });
            }
          }
          if (input.status === "shipped") {
            for (const line of order.items) { const found = findVariant(data, line.sku); if (!found || found.variant.reserved < line.quantity) throw Object.assign(new Error(`The reservation for ${line.sku} is missing or incomplete.`), { statusCode: 409 }); }
            for (const line of order.items) { const found = findVariant(data, line.sku); found.variant.reserved -= line.quantity; data.inventoryTransactions.unshift({ id: randomBytes(8).toString("hex"), sku: line.sku, delta: 0, reservedDelta: -line.quantity, reason: "Reservation fulfilled at shipment", orderNumber: order.orderNumber, actor: "Store owner", createdAt: now() }); }
          }
          if (input.status === "returned") {
            const reason = String(input.returnReason || "").trim();
            if (reason.length < 5) throw Object.assign(new Error("Record a return reason of at least 5 characters."), { statusCode: 400 });
            order.returnRecord = { reason: reason.slice(0, 500), recordedAt: now(), actor: "Store owner" };
          }
          if (input.status === "refund_recorded") {
            const amount = Number(input.refundAmountPaise);
            if (!Number.isSafeInteger(amount) || amount < 1 || amount > order.totalPaise) throw Object.assign(new Error("Enter a refund amount in paise, between 1 and the order total."), { statusCode: 400 });
            order.refundRecord = { amountPaise: amount, reference: String(input.refundReference || "").slice(0, 100), recordedAt: now(), actor: "Store owner", previewOnly: true };
          }
          if (input.trackingNumber !== undefined) order.trackingNumber = String(input.trackingNumber).trim().slice(0, 80);
          order.status = input.status; order.updatedAt = now();
          order.statusHistory ||= [{ status: "sandbox_pending", actor: "Preview customer", at: order.createdAt }];
          order.statusHistory.push({ status: input.status, actor: "Store owner", at: order.updatedAt, note: String(input.note || "").slice(0, 300) });
          audit(data, "order_status_changed", "order", order.orderNumber, input.status);
          return publicOrder(order);
        });
        send(response, 200, result); return true;
      }
      if (adminPath === "/settings" && (method === "GET" || method === "PATCH")) {
        if (method === "GET") { const data = await state(); const collections = deriveCollections(data.products, data.categories, data.brands, true); send(response, 200, { settings: data.settings, categories: collections.categories, brands: collections.brands, serviceAreas: data.serviceAreas, coupons: data.coupons }); return true; }
        const input = await body(request); const rawDomain = Object.hasOwn(input, "publicDomain") ? String(input.publicDomain || "").trim() : String((await state()).settings?.publicDomain || ""); let publicDomain = ""; if (rawDomain) { let parsed; try { parsed = new URL(rawDomain); } catch { send(response, 400, { error: "Public website domain must be a full URL such as https://agroseed.in." }); return true; } if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) { send(response, 400, { error: "Enter only the public site base URL, such as https://agroseed.in, without a path." }); return true; } publicDomain = parsed.origin; } const result = await change((data) => { data.settings ||= {}; data.settings = { ...data.settings, storeName: String(input.storeName || data.settings.storeName || "AgroSeed").slice(0, 80), publicDomain, supportEmail: Object.hasOwn(input, "supportEmail") ? String(input.supportEmail || "").trim().slice(0, 160) : String(data.settings.supportEmail || ""), supportPhone: Object.hasOwn(input, "supportPhone") ? String(input.supportPhone || "").trim().slice(0, 40) : String(data.settings.supportPhone || ""), language: ["en", "hi"].includes(input.language) ? input.language : (data.settings.language || "en") }; for (const field of ["storeAbout", "supportDetails", "businessDetails", "homeHeroEyebrow", "homeHeroHeadline", "homeHeroBody", "homeHeroNote", "homeHeroPrimaryCta", "deliveryRules", "codPolicy", "cancellationReturnsRules", "shippingReturnsPolicy", "privacyPolicy", "termsPolicy", "productUseNotice"]) if (Object.hasOwn(input, field)) data.settings[field] = String(input[field] || "").trim().slice(0, 20000); if (Array.isArray(input.categories)) data.categories = normalizeTaxonomy(input.categories, "Categories"); if (Array.isArray(input.brands)) data.brands = normalizeTaxonomy(input.brands, "Brands"); audit(data, "store_settings_updated", "settings", "store", "Store details and editable copy updated"); return data.settings; }); send(response, 200, result); return true;
      }
      const taxonomyRoute = adminPath.match(/^\/catalog\/(category|brand)\/([^/]+)$/);
      if (taxonomyRoute && method === "PATCH") {
        const input = await body(request);
        const result = await change((data) => {
          const key = taxonomyRoute[1] === "category" ? "categories" : "brands";
          const derived = deriveCollections(data.products, data.categories, data.brands, true)[key];
          const rows = (data[key]?.length ? data[key] : derived).map((item) => ({ ...item }));
          const entry = rows.find((item) => String(item.id || slug(item.nameEn)) === taxonomyRoute[2]);
          if (!entry) throw Object.assign(new Error("Browse label not found."), { statusCode: 404 });
          const nameEn = String(input.nameEn || "").trim();
          if (!nameEn || nameEn.length > 80) throw Object.assign(new Error("Add an English label up to 80 characters."), { statusCode: 400 });
          if (rows.some((item) => item !== entry && item.nameEn.toLowerCase() === nameEn.toLowerCase())) throw Object.assign(new Error("That label already exists."), { statusCode: 409 });
          const oldEn = entry.nameEn, oldHi = entry.name;
          entry.nameEn = nameEn; entry.name = String(input.name || nameEn).trim().slice(0, 100); entry.slug = slug(nameEn); entry.id = entry.slug;
          entry.order = Math.min(1000, Math.max(0, Number(input.order) || 0)); entry.active = input.active !== false && input.active !== "false";
          for (const product of data.products) {
            if (taxonomyRoute[1] === "category" && product.categoryEn === oldEn) { product.categoryEn = nameEn; product.category = String(input.name || oldHi || nameEn); }
            if (taxonomyRoute[1] === "brand" && product.brandEn === oldEn) { product.brandEn = nameEn; product.brand = String(input.name || oldHi || nameEn); }
          }
          data[key] = rows; audit(data, "catalog_label_updated", key.slice(0, -1), entry.id, `${oldEn} → ${nameEn}; ${entry.active ? "active" : "disabled"}`); return entry;
        });
        send(response, 200, result); return true;
      }
      if (adminPath === "/coupons" && method === "GET") { const data = await state(); send(response, 200, { items: data.coupons }); return true; }
      if (adminPath === "/coupons" && method === "POST") { const input = await body(request); const result = await change((data) => { const code = String(input.code || "").trim().toUpperCase(); const value = Number(input.value); const maxUses = input.maxUses === "" || input.maxUses === undefined ? null : Number(input.maxUses); const minimum = input.minSubtotal === "" || input.minSubtotal === undefined ? 0 : Number(input.minSubtotal); if (!/^[A-Z0-9_-]{3,20}$/.test(code) || !["percent", "flat"].includes(input.type) || !Number.isFinite(value) || value <= 0 || (input.type === "percent" && value > 100)) throw Object.assign(new Error("Check promotion code and discount value."), { statusCode: 400 }); if (maxUses !== null && (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 1000000)) throw Object.assign(new Error("Maximum uses must be a positive whole number."), { statusCode: 400 }); if (!Number.isFinite(minimum) || minimum < 0) throw Object.assign(new Error("Minimum order amount cannot be negative."), { statusCode: 400 }); if (input.expiresAt && !/^\d{4}-\d{2}-\d{2}$/.test(input.expiresAt)) throw Object.assign(new Error("Enter a valid expiration date."), { statusCode: 400 }); if (data.coupons.some((c) => c.code === code)) throw Object.assign(new Error("That code already exists."), { statusCode: 409 }); const item = { id: randomBytes(6).toString("hex"), code, type: input.type, value: input.type === "flat" ? Math.round(value * 100) : Math.round(value), minSubtotalPaise: Math.round(minimum * 100), maxUses, usesCount: 0, active: true, expiresAt: input.expiresAt || null, createdAt: now() }; data.coupons.push(item); audit(data, "coupon_created", "coupon", item.id, code); return item; }); send(response, 201, result); return true; }
      const couponRoute = adminPath.match(/^\/coupons\/([^/]+)$/);
      if (couponRoute && method === "PATCH") { const input = await body(request); const result = await change((data) => { const item = data.coupons.find((row) => row.id === couponRoute[1]); if (!item) throw Object.assign(new Error("Promotion not found."), { statusCode: 404 }); item.active = input.active === true || input.active === "true"; audit(data, "coupon_status_changed", "coupon", item.id, item.active ? "activated" : "paused"); return item; }); send(response, 200, result); return true; }
      if (couponRoute && method === "DELETE") { await change((data) => { data.coupons = data.coupons.filter((item) => item.id !== couponRoute[1]); audit(data, "coupon_deleted", "coupon", couponRoute[1], "Promotion removed"); }); send(response, 200, { ok: true }); return true; }
      if (adminPath === "/service-areas" && method === "GET") { const data = await state(); send(response, 200, { items: data.serviceAreas }); return true; }
      if (adminPath === "/service-areas" && method === "POST") { const input = await body(request); const result = await change((data) => { const pincode = String(input.pincode || "").trim(); if (!/^\d{6}$/.test(pincode)) throw Object.assign(new Error("PIN code must have 6 digits."), { statusCode: 400 }); if (data.serviceAreas.some((area) => area.pincode === pincode)) throw Object.assign(new Error("That PIN code is already configured."), { statusCode: 409 }); const area = { id: randomBytes(6).toString("hex"), pincode, city: String(input.city || "").slice(0, 80), feePaise: Math.max(0, Math.round(Number(input.feeRupees || 0) * 100)), estimate: String(input.estimate || "").slice(0, 80), active: true }; data.serviceAreas.push(area); audit(data, "service_area_added", "service-area", area.id, pincode); return area; }); send(response, 201, result); return true; }
      const areaRoute = adminPath.match(/^\/service-areas\/([^/]+)$/);
      if (areaRoute && method === "DELETE") { await change((data) => { data.serviceAreas = data.serviceAreas.filter((item) => item.id !== areaRoute[1]); audit(data, "service_area_removed", "service-area", areaRoute[1], "PIN code removed"); }); send(response, 200, { ok: true }); return true; }
      if (adminPath === "/support" && method === "GET") { const data = await state(); send(response, 200, { items: data.supportRequests }); return true; }
      const supportRoute = adminPath.match(/^\/support\/([^/]+)$/);
      if (supportRoute && method === "PATCH") { const input = await body(request); const result = await change((data) => { const item = data.supportRequests.find((row) => row.id === supportRoute[1]); if (!item) throw Object.assign(new Error("Request not found."), { statusCode: 404 }); item.status = input.status === "resolved" ? "resolved" : "in_progress"; audit(data, "support_request_updated", "support", item.id, item.status); return item; }); send(response, 200, result); return true; }
      if (adminPath === "/reports" && method === "GET") {
        const from = url.searchParams.get("from") || "", to = url.searchParams.get("to") || "";
        if ((from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) || (to && !/^\d{4}-\d{2}-\d{2}$/.test(to))) { send(response, 400, { error: "Report dates must use YYYY-MM-DD." }); return true; }
        const start = from ? Date.parse(`${from}T00:00:00Z`) : 0; const end = to ? Date.parse(`${to}T23:59:59.999Z`) : Date.now();
        if (start > end) { send(response, 400, { error: "Start date must be before end date." }); return true; }
        const data = await state(); const orders = data.orders.filter((order) => { const time = Date.parse(order.createdAt); return time >= start && time <= end && order.status !== "cancelled"; });
        const products = new Map();
        for (const order of orders) for (const line of order.items || []) { const row = products.get(line.sku) || { sku: line.sku, name: line.nameEn || line.name, quantity: 0, revenuePaise: 0 }; row.quantity += line.quantity; row.revenuePaise += line.lineTotalPaise || line.unitPricePaise * line.quantity; products.set(line.sku, row); }
        const lowStock = data.products.flatMap((product) => product.variants.map((variant) => ({ sku: variant.sku, product: product.nameEn, pack: variant.pack, stock: variant.stock }))).filter((variant) => variant.stock <= 5).sort((a, b) => a.stock - b.stock);
        send(response, 200, { from: from || null, to: to || null, orderCount: orders.length, revenuePaise: orders.reduce((sum, order) => sum + order.totalPaise, 0), lowStock, topProducts: [...products.values()].sort((a, b) => b.revenuePaise - a.revenuePaise).slice(0, 20) }); return true;
      }
      if (adminPath === "/audit" && method === "GET") { const data = await state(); send(response, 200, { items: data.audit.slice(0, 500), inventory: data.inventoryTransactions.slice(0, 500) }); return true; }
      send(response, 404, { error: "Staff API route not found." }); return true;
    }
    if (pathname.startsWith("/api/")) { send(response, 404, { error: "API route not found." }); return true; }
    return false;
  } catch (error) {
    if (response.headersSent || response.destroyed) return true;
    send(response, error.statusCode || 500, { error: error.statusCode ? error.message : "Sandbox API error" });
    return true;
  }
}
