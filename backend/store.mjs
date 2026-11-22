import { catalogImageUrl, saveCatalogImage } from "../cloudflare/catalog-images.mjs";
import { randomBytes, createHash, createHmac, timingSafeEqual } from "node:crypto";
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
    pricePaise: Math.max(0, Math.round(Number(v.pricePaise ?? (v.price == null ? 0 : v.price * 100)))),
    mrpPaise: Math.max(0, Math.round(Number(v.mrpPaise ?? (v.mrp == null ? v.pricePaise ?? 0 : v.mrp * 100)))),
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

const emptyState = () => ({
  products: [], serviceAreas: [], coupons: [], audit: [], inventoryTransactions: [],
  supportRequests: [], paymentAttempts: [], settings: { storeName: "AgroSeed", currency: "INR" }
});

async function readState(env) {
  const row = await env.DB.prepare("SELECT revision, payload FROM agroseed_app_state WHERE state_id = 1").first();
  if (!row) throw new Error("Apply the AgroSeed D1 migrations before starting the Worker.");
  const data = Object.assign(emptyState(), JSON.parse(row.payload));
  data.products = data.products.map(normalizeProduct);
  return { data, revision: row.revision };
}

async function state(env) {
  return (await readState(env)).data;
}

async function change(env, mutator) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, revision } = await readState(env);
    const result = mutator(data);
    const write = await env.DB.prepare(
      "UPDATE agroseed_app_state SET payload = ?, revision = revision + 1, updated_at = CURRENT_TIMESTAMP WHERE state_id = 1 AND revision = ?"
    ).bind(JSON.stringify(data), revision).run();
    if (write.meta.changes === 1) return result;
    await new Promise(resolve => setTimeout(resolve, 8 * (attempt + 1) + Math.random() * 12));
  }
  throw Object.assign(new Error("The store changed during this request. Please try again."), { statusCode: 409 });
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

async function adminSession(request, env) {
  const raw = cookieValue(request, "agroseed_admin");
  if (!raw) return null;
  const session = await env.DB.prepare(
    "SELECT role, csrf_token FROM agroseed_admin_sessions WHERE token_hash = ? AND datetime(expires_at) > CURRENT_TIMESTAMP"
  ).bind(hash(raw)).first();
  return session ? { role: session.role, csrf: session.csrf_token } : null;
}

async function requireAdmin(request, response, mutating = false, env) {
  const session = await adminSession(request, env);
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
  if (path === "/catalog" || /^\/catalog\//.test(path) || path === "/sponsored-ads") return "catalog";
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
  const collection = { product: "products", coupon: "coupons", "service-area": "serviceAreas", support: "supportRequests", category: "categories", brand: "brands" }[entity];
  const demo = collection ? data[collection]?.some((item) => String(item.id) === String(entityId) && item.demo === true) : entity === "variant" && data.products.some((product) => product.demo === true && product.variants.some((variant) => variant.sku === entityId));
  data.audit.unshift({ id: randomBytes(9).toString("hex"), actor: "Store owner", demo: demo || undefined, action, entity, entityId: String(entityId), detail: String(detail || ""), createdAt: now() });
  data.audit = data.audit.slice(0, 1500);
}
function deriveCollections(products, configuredCategories = [], configuredBrands = [], includeInactive = false) {
  const categoryMap = new Map(products.map((p) => [p.categoryEn, { id: slug(p.categoryEn), name: p.category, nameEn: p.categoryEn, slug: slug(p.categoryEn), active: true, order: 0 }]));
  const brandMap = new Map(products.map((p) => [p.brandEn, { id: slug(p.brandEn), name: p.brand, nameEn: p.brandEn, slug: slug(p.brandEn), active: true, order: 0 }]));
  configuredCategories.forEach((item) => categoryMap.set(item.nameEn, { id: item.id || slug(item.nameEn), slug: item.slug || slug(item.nameEn), active: true, order: 0, ...item }));
  configuredBrands.forEach((item) => brandMap.set(item.nameEn, { id: item.id || slug(item.nameEn), slug: item.slug || slug(item.nameEn), active: true, order: 0, ...item }));
  const orderRows = (rows) => [...rows.values()].filter((item) => includeInactive || item.active !== false).sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0) || a.nameEn.localeCompare(b.nameEn));
  const categories = orderRows(categoryMap).map((entry) => ({ ...entry, sections: categorySections(entry) }));
  const brands = orderRows(brandMap);
  return { categories, brands };
}

function categorySections(category) {
  if (Array.isArray(category.sections)) return category.sections;
  return String(category.sectionCopy || "").split("\n").flatMap((line, index) => {
    const [title = "", skus = ""] = line.split("|");
    return title.trim() ? [{ id: `legacy-${index}`, title: title.trim(), skus: sectionSkus(skus), image: "" }] : [];
  });
}

function sectionSkus(value) {
  return [...new Set(String(value || "").split(/[,\s]+/).map((sku) => sku.trim().toUpperCase()).filter(Boolean))].slice(0, 100);
}

function updateTaxonomyPresentation(entry, input, kind) {
  if (Object.hasOwn(input, "image")) entry.image = catalogImageUrl(input.image);
  if (kind !== "category") return;
  if (Object.hasOwn(input, "banner")) entry.banner = String(input.banner || "").trim().slice(0, 100);
  if (Object.hasOwn(input, "bannerImage")) entry.bannerImage = catalogImageUrl(input.bannerImage);
  if (Object.hasOwn(input, "sectionCopy")) {
    entry.sectionCopy = String(input.sectionCopy || "").trim().slice(0, 2000);
    delete entry.sections;
  }
}

function saveTaxonomyEntry(data, key, entry, previousId = entry.id) {
  const configured = data[key] || [];
  const index = configured.findIndex((item) => (item.id || slug(item.nameEn)) === previousId);
  if (index < 0) data[key] = [...configured, entry];
  else data[key] = configured.map((item, position) => position === index ? entry : item);
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
    const entry = { id: slug(nameEn), slug: slug(nameEn), name: String(row.name || nameEn).trim().slice(0, 100), nameEn, active: row.active !== false && row.active !== "false", order: Math.min(1000, Math.max(0, Number(row.order) || 0)) };
    updateTaxonomyPresentation(entry, row, label === "Categories" ? "category" : "brand");
    return entry;
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
  if (new Set(variants.map(v => v.sku)).size !== variants.length) throw Object.assign(new Error("Variant SKUs must be unique."), { statusCode: 400 });
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
    status, active: status === "published", images: Array.isArray(input.images) ? input.images.filter(Boolean).slice(0, 8).map((image) =>
      previous?.images?.some((existing) => (typeof existing === "string" ? existing : existing?.url) === image) ? image : catalogImageUrl(image)) : (previous?.images || []),
    imageAlt: Array.isArray(input.imageAlt) ? input.imageAlt.slice(0, 8).map((alt) => String(alt || "").trim().slice(0, 180)) : (previous?.imageAlt || []),
    featured: input.featured === true || input.featured === "true" || input.featured === "on",
    variants, sku: variants[0].sku, pricePaise: variants[0].pricePaise, mrpPaise: variants[0].mrpPaise, stock: variants.reduce((sum, v) => sum + v.stock, 0),
    updatedAt: now(), createdAt: previous?.createdAt || now()
  };
}

const demoCollections = [
  "products",
  "categories",
  "brands",
  "coupons",
  "serviceAreas",
  "supportRequests",
  "inventoryTransactions",
  "audit"
];
function demoCounts(data) {
  return Object.fromEntries(demoCollections.map((key) => [
    key,
    (data[key] || []).filter((row) => row.demo === true).length
  ]));
}
function updateDemo(data, remove) {
  if (remove) {
    for (const key of demoCollections) {
      if (data[key]) data[key] = data[key].filter((row) => row.demo !== true);
    }
    return demoCounts(data);
  }
  const samples = [
    {
      nameEn: "Demo · Tomato Seeds (Pusa Ruby)", name: "डेमो · टमाटर के बीज (पूसा रूबी)", category: "Vegetable Seeds", categoryHi: "सब्ज़ियों के बीज",
      image: "/images/demo/tomato-seeds.png", alt: "Open-license vintage tomato seed packet, used as illustrative demo product art",
      descriptionEn: "Demo listing for a tomato seed variety. The seed packet photo is illustrative; replace it with the exact AgroSeed pack before selling.",
      description: "टमाटर बीज का डेमो उत्पाद। पैकेट की तस्वीर केवल उदाहरण है; बिक्री से पहले असली पैक की तस्वीर लगाएं।",
      directions: "Demo only: follow the sowing depth and seasonal guidance printed on the actual seed packet.",
      labelInfo: "Demo catalog listing · Illustrative open-license image · Replace pack artwork before launch.",
      safetyInfo: "Demo listing only. Verify variety, germination rate, lot, expiry and certification before selling.",
      variants: [["10 g", 49, 69, 28], ["25 g", 99, 129, 16]]
    },
    {
      nameEn: "Demo · Carrot Seeds (Nantes)", name: "डेमो · गाजर के बीज (नांतेस)", category: "Vegetable Seeds",
      image: "/images/demo/carrot-seeds.png", alt: "Open-license vintage carrot seed packet, used as illustrative demo product art",
      descriptionEn: "Demo listing for carrot seeds with small and value packs. Replace the illustrative seed packet with the exact retail pack before selling.",
      description: "छोटे और बड़े पैक के साथ गाजर बीज का डेमो उत्पाद। बिक्री से पहले असली पैक की तस्वीर लगाएं।",
      directions: "Demo only: follow the sowing depth and seasonal guidance printed on the actual seed packet.",
      labelInfo: "Demo catalog listing · Illustrative open-license image · Replace pack artwork before launch.",
      safetyInfo: "Demo listing only. Verify variety, germination rate, lot, expiry and certification before selling.",
      variants: [["10 g", 39, 59, 34], ["25 g", 79, 99, 18]]
    },
    {
      nameEn: "Demo · Onion Seeds (Nashik Red)", name: "डेमो · प्याज के बीज (नासिक रेड)", category: "Vegetable Seeds",
      image: "/images/demo/onion-seeds.png", alt: "Open-license vintage onion seed packet, used as illustrative demo product art",
      descriptionEn: "Demo listing for onion seed packs. Replace the illustrative seed packet with the exact retail pack before selling.",
      description: "प्याज बीज पैक का डेमो उत्पाद। बिक्री से पहले असली पैक की तस्वीर लगाएं।",
      directions: "Demo only: follow the sowing depth and seasonal guidance printed on the actual seed packet.",
      labelInfo: "Demo catalog listing · Illustrative open-license image · Replace pack artwork before launch.",
      safetyInfo: "Demo listing only. Verify variety, germination rate, lot, expiry and certification before selling.",
      variants: [["5 g", 59, 79, 26], ["10 g", 99, 129, 14]]
    },
    {
      nameEn: "Demo · Watermelon Seeds (Sugar Baby)", name: "डेमो · तरबूज के बीज (शुगर बेबी)", category: "Fruit Seeds", categoryHi: "फलों के बीज",
      image: "/images/demo/watermelon-seeds.png", alt: "Open-license vintage watermelon seed packet, used as illustrative demo product art",
      descriptionEn: "Demo listing for watermelon seeds with two pack sizes. Replace the illustrative seed packet with the exact retail pack before selling.",
      description: "दो पैक आकारों के साथ तरबूज बीज का डेमो उत्पाद। बिक्री से पहले असली पैक की तस्वीर लगाएं।",
      directions: "Demo only: follow the sowing depth and seasonal guidance printed on the actual seed packet.",
      labelInfo: "Demo catalog listing · Illustrative open-license image · Replace pack artwork before launch.",
      safetyInfo: "Demo listing only. Verify variety, germination rate, lot, expiry and certification before selling.",
      variants: [["5 g", 49, 69, 24], ["10 g", 89, 109, 12]]
    },
    {
      nameEn: "Demo · Thyme Seeds (Common)", name: "डेमो · थाइम के बीज (कॉमन)", category: "Herb Seeds", categoryHi: "जड़ी-बूटी के बीज",
      image: "/images/demo/thyme-seeds.png", alt: "Open-license vintage thyme seed packet, used as illustrative demo product art",
      descriptionEn: "Demo listing for culinary herb seeds with two pack choices. Replace the illustrative seed packet with the exact retail pack before selling.",
      description: "दो पैक विकल्पों के साथ हर्ब बीज का डेमो उत्पाद। बिक्री से पहले असली पैक की तस्वीर लगाएं।",
      directions: "Demo only: follow the sowing depth and seasonal guidance printed on the actual seed packet.",
      labelInfo: "Demo catalog listing · Illustrative open-license image · Replace pack artwork before launch.",
      safetyInfo: "Demo listing only. Verify variety, germination rate, lot, expiry and certification before selling.",
      variants: [["2 g", 69, 89, 20], ["5 g", 129, 159, 10]]
    }
  ];
  for (const [index, sample] of samples.entries()) {
    const number = index + 1;
    const key = randomBytes(6).toString("hex");
    const code = "GROW" + (10 + number);
    const brandEn = "AgroSeed Select";
    const product = cleanProduct({
      nameEn: sample.nameEn,
      name: sample.name,
      categoryEn: sample.category,
      category: sample.categoryHi,
      brandEn,
      brand: brandEn,
      status: "published",
      featured: index < 3,
      descriptionEn: sample.descriptionEn,
      description: sample.description,
      directions: sample.directions,
      labelInfo: sample.labelInfo,
      safetyInfo: sample.safetyInfo,
      images: [sample.image],
      imageAlt: [sample.alt],
      variants: sample.variants.map(([pack, priceRupees, mrpRupees, stock], variantIndex) => ({
        sku: "AGS-" + sample.category.slice(0, 3).toUpperCase() + "-" + String(number).padStart(2, "0") + (variantIndex ? "-B" : "-A"),
        pack,
        pricePaise: priceRupees * 100,
        mrpPaise: mrpRupees * 100,
        stock
      }))
    }, null, data);
    data.products.push({ ...product, demo: true });
    for (const [collection, label, nativeName] of [["categories", sample.category, sample.categoryHi], ["brands", brandEn, brandEn]]) {
      data[collection] ||= [];
      if (!data[collection].some((row) => row.slug === slug(label))) {
        data[collection].push({ id: slug(label), slug: slug(label), name: nativeName, nameEn: label, active: true, order: index, demo: true });
      }
    }
    const minSubtotalPaise = Math.min(...sample.variants.map((variant) => variant[1] * 100));
    data.coupons.push({ id: key, code, type: "percent", value: 5 + index, minSubtotalPaise, maxUses: 20, usesCount: 0, active: true, demo: true });
    let pin = 900000 + number;
    while (data.serviceAreas.some((row) => row.pincode === String(pin))) pin += 7;
    data.serviceAreas.push({ id: key, pincode: String(pin), city: "Sample service area " + number, feePaise: 2900, estimate: "2–4 days", active: true, demo: true });
    data.supportRequests.unshift({ id: key, name: "Sample shopper " + number, email: "shopper" + number + "@example.invalid", topic: "Product question", message: "Demo request about " + sample.nameEn.replace(/^Demo · /, "").toLowerCase() + ".", status: ["new", "in_progress", "resolved"][index % 3], createdAt: now(), demo: true });
    for (const variant of product.variants) {
      data.inventoryTransactions.unshift({ id: randomBytes(8).toString("hex"), sku: variant.sku, delta: variant.stock, reason: "Demo opening stock", actor: "Demo data", createdAt: now(), demo: true });
    }
    data.audit.unshift({ id: key, actor: "Demo data", action: "demo_product_created", entity: "product", entityId: String(product.id), detail: product.nameEn, createdAt: now(), demo: true });
  }
  return demoCounts(data);
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

function orderHistoryEntry(status, actor, note) { return { status, actor, note, createdAt: now() }; }
function refreshProductStock(data, product) { product.stock = product.variants.reduce((sum, variant) => sum + Number(variant.stock || 0), 0); }
function existingTestOrder(data, customerId, idempotencyKey, input, keyId) {
  const attempt = data.paymentAttempts?.find(row => row.customerId === customerId && row.idempotencyKey === idempotencyKey);
  if (!attempt) return null;
  const order = data.orders?.find(row => row.id === attempt.localOrderId && row.customerId === customerId);
  if (!order) throw Object.assign(new Error("The previous checkout could not be recovered. Contact support before retrying."), { statusCode: 409 });
  const requestedItems = Array.isArray(input.items) ? input.items.map(item => ({ sku: String(item?.sku || "").trim().toUpperCase(), quantity: Number(item?.quantity) })).sort((a, b) => a.sku.localeCompare(b.sku)) : [];
  const savedItems = (order.items || []).map(item => ({ sku: String(item.sku || "").trim().toUpperCase(), quantity: Number(item.quantity) })).sort((a, b) => a.sku.localeCompare(b.sku));
  const addressFields = ["name", "phone", "line1", "line2", "city", "state", "pincode"];
  const requestedAddress = addressFields.map(field => String(input.address?.[field] || "").trim());
  const savedAddress = addressFields.map(field => String(order.address?.[field] || "").trim());
  const sameIntent = JSON.stringify(requestedItems) === JSON.stringify(savedItems) &&
    String(order.address?.id || "") === String(input.address?.id || "") &&
    JSON.stringify(requestedAddress) === JSON.stringify(savedAddress) &&
    String(order.couponCode || "") === String(input.couponCode || "").trim().toUpperCase();
  if (!sameIntent) throw Object.assign(new Error("This checkout retry key is already attached to a different bag or address. Refresh checkout and try again."), { statusCode: 409 });
  if (attempt.status !== "created" || order.status !== "pending_payment") {
    throw Object.assign(new Error("This checkout attempt is closed. Start a fresh checkout."), { statusCode: 409 });
  }
  return { order_id: attempt.orderId, amount: attempt.amount, currency: attempt.currency, key_id: keyId, order_number: order.orderNumber, order_status: order.status };
}

export async function customerCheckoutQuote(env, input) {
  return { ...calculate(await state(env), input), currency: "INR" };
}

export async function createCustomerTestOrder(env, customer, input) {
  if (!String(env.RAZORPAY_KEY_ID || "").startsWith("rzp_test_") || !env.RAZORPAY_KEY_SECRET) {
    throw Object.assign(new Error("Razorpay test checkout is not configured."), { statusCode: 503 });
  }
  const idempotencyKey = String(input.idempotencyKey || "");
  if (!/^[0-9a-f-]{36}$/i.test(idempotencyKey)) throw Object.assign(new Error("Refresh checkout and try again."), { statusCode: 400 });
  const initialData = await state(env);
  const existing = existingTestOrder(initialData, customer.id, idempotencyKey, input, env.RAZORPAY_KEY_ID);
  if (existing) return existing;
  const initialQuote = calculate(initialData, input);
  if (!Number.isSafeInteger(initialQuote.totalPaise) || initialQuote.totalPaise < 100) {
    throw Object.assign(new Error("The order total must be at least ₹1.00."), { statusCode: 400 });
  }
  const receipt = `test_${randomBytes(12).toString("hex")}`;
  let upstream;
  try {
    upstream = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { Authorization: `Basic ${btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`)}`, "Content-Type": "application/json" },
      body: JSON.stringify({ amount: initialQuote.totalPaise, currency: "INR", receipt })
    });
  } catch {
    throw Object.assign(new Error("Razorpay order service could not be reached."), { statusCode: 500 });
  }
  if (upstream.status === 401 || upstream.status === 403) throw Object.assign(new Error("Razorpay credentials were rejected."), { statusCode: 401 });
  if (!upstream.ok) throw Object.assign(new Error("Razorpay could not create the test order."), { statusCode: 500 });
  const gatewayOrder = await upstream.json();
  if (!/^order_[A-Za-z0-9]+$/.test(gatewayOrder.id || "") || gatewayOrder.amount !== initialQuote.totalPaise || gatewayOrder.currency !== "INR") {
    throw Object.assign(new Error("Razorpay returned an invalid order."), { statusCode: 500 });
  }

  const id = randomBytes(16).toString("hex");
  const orderNumber = `AS-${new Date().toISOString().slice(2, 10).replaceAll("-", "")}-${randomBytes(3).toString("hex").toUpperCase()}`;
  const created = await change(env, (data) => {
    const duplicate = existingTestOrder(data, customer.id, idempotencyKey, input, env.RAZORPAY_KEY_ID);
    if (duplicate) return duplicate;
    const quote = calculate(data, input);
    if (quote.totalPaise !== initialQuote.totalPaise) throw Object.assign(new Error("Prices or availability changed. Review your bag and try again."), { statusCode: 409 });
    for (const line of quote.items) {
      const found = findVariant(data, line.sku);
      if (!found || found.variant.stock < line.quantity) throw Object.assign(new Error(`${line.nameEn} is no longer available in the requested quantity.`), { statusCode: 409 });
      found.variant.stock -= line.quantity;
      found.variant.reserved = (Number(found.variant.reserved) || 0) + line.quantity;
      refreshProductStock(data, found.product);
    }
    const order = {
      id, orderNumber, customerId: customer.id, customerEmail: customer.email,
      customerName: String(input.address.name || customer.name || "Customer").trim(),
      address: input.address, items: quote.items, subtotalPaise: quote.subtotalPaise,
      discountPaise: quote.discountPaise, shippingPaise: quote.shippingPaise,
      totalPaise: quote.totalPaise, currency: "INR", couponCode: quote.couponCode,
      status: "pending_payment", paymentStatus: "created", paymentMode: "test",
      razorpayOrderId: gatewayOrder.id, paymentId: null, trackingCode: randomBytes(4).toString("hex").toUpperCase(),
      createdAt: now(), updatedAt: now(), history: [orderHistoryEntry("pending_payment", "system", "Razorpay test checkout opened.")]
    };
    data.orders ||= [];
    data.paymentAttempts ||= [];
    data.orders.unshift(order);
    data.paymentAttempts.unshift({ orderId: gatewayOrder.id, receipt, amount: quote.totalPaise, currency: "INR", status: "created", customerId: customer.id, localOrderId: id, idempotencyKey, createdAt: order.createdAt });
    audit(data, "test_order_created", "order", orderNumber, `Test checkout opened for ${moneyLabel(quote.totalPaise)}.`);
    return { order_id: gatewayOrder.id, amount: gatewayOrder.amount, currency: gatewayOrder.currency, key_id: env.RAZORPAY_KEY_ID, order_number: orderNumber, order_status: order.status };
  });
  return created;
}

function moneyLabel(paise) { return `₹${(Number(paise) / 100).toFixed(2)}`; }

export async function verifyCustomerTestPayment(env, customerId, details) {
  if (!String(env.RAZORPAY_KEY_ID || "").startsWith("rzp_test_") || !env.RAZORPAY_KEY_SECRET) {
    throw Object.assign(new Error("Razorpay test checkout is not configured."), { statusCode: 503 });
  }
  const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = details || {};
  if (typeof orderId !== "string" || typeof paymentId !== "string" || typeof signature !== "string" ||
      !/^order_[A-Za-z0-9]+$/.test(orderId) || !/^pay_[A-Za-z0-9]+$/.test(paymentId) || !/^[a-f0-9]{64}$/i.test(signature)) {
    throw Object.assign(new Error("Missing or invalid payment details."), { statusCode: 400 });
  }
  const attempt = (await state(env)).paymentAttempts?.find(row => row.orderId === orderId && row.customerId === customerId);
  if (!attempt) throw Object.assign(new Error("Payment order not found for this account."), { statusCode: 404 });
  if (["cancelled", "payment_failed"].includes(attempt.status)) throw Object.assign(new Error("This checkout attempt is closed. Start a new checkout."), { statusCode: 409 });
  const expected = createHmac("sha256", env.RAZORPAY_KEY_SECRET).update(`${orderId}|${paymentId}`).digest();
  const supplied = Buffer.from(signature, "hex");
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    throw Object.assign(new Error("Payment signature did not match."), { statusCode: 400 });
  }
  return change(env, data => {
    const storedAttempt = data.paymentAttempts?.find(row => row.orderId === orderId && row.customerId === customerId);
    const order = data.orders?.find(row => row.id === storedAttempt?.localOrderId && row.customerId === customerId);
    if (!storedAttempt || !order) throw Object.assign(new Error("Payment order not found for this account."), { statusCode: 404 });
    if (["cancelled", "payment_failed"].includes(storedAttempt.status)) throw Object.assign(new Error("This checkout attempt is closed. Start a new checkout."), { statusCode: 409 });
    if (storedAttempt.paymentId && storedAttempt.paymentId !== paymentId) throw Object.assign(new Error("Order already verified with another payment."), { statusCode: 409 });
    storedAttempt.status = "signature_verified";
    storedAttempt.paymentId = paymentId;
    storedAttempt.verifiedAt ||= now();
    if (order.status === "pending_payment") {
      order.status = "paid";
      order.paymentStatus = "test_paid";
      order.paymentId = paymentId;
      order.updatedAt = now();
      order.history.push(orderHistoryEntry("paid", "system", "Razorpay test payment signature verified. No real money was collected."));
      audit(data, "test_payment_verified", "order", order.orderNumber, `Test payment verified: ${paymentId}.`);
    }
    return { success: true, testMode: true, order_id: orderId, payment_id: paymentId, amount: storedAttempt.amount, order_number: order.orderNumber, order_status: order.status };
  });
}

export async function closeCustomerTestOrder(env, customerId, orderId, reason = "cancelled") {
  if (!new Set(["cancelled", "payment_failed"]).has(reason)) throw Object.assign(new Error("Invalid payment attempt status."), { statusCode: 400 });
  return change(env, data => {
    const attempt = data.paymentAttempts?.find(row => row.orderId === orderId && row.customerId === customerId);
    const order = data.orders?.find(row => row.id === attempt?.localOrderId && row.customerId === customerId);
    if (!order) throw Object.assign(new Error("Order not found."), { statusCode: 404 });
    if (order.status !== "pending_payment") return { ok: true, order_status: order.status };
    for (const line of order.items) {
      const found = findVariant(data, line.sku);
      if (found) {
        found.variant.stock += line.quantity;
        found.variant.reserved = Math.max(0, (Number(found.variant.reserved) || 0) - line.quantity);
        refreshProductStock(data, found.product);
      }
    }
    order.status = reason;
    order.paymentStatus = reason === "payment_failed" ? "failed" : "cancelled";
    order.updatedAt = now();
    order.history.push(orderHistoryEntry(reason, "customer", reason === "payment_failed" ? "Razorpay reported a failed test payment." : "Customer closed the Razorpay checkout."));
    if (attempt) attempt.status = reason;
    return { ok: true, order_status: order.status };
  });
}

export async function customerOrders(env, customerId) {
  const data = await state(env);
  return (data.orders || []).filter(order => order.customerId === customerId).map(({ paymentSignature, ...order }) => order);
}

function catalogProduct(product) { return { ...product, variants: product.variants.map(({ reserved, ...variant }) => variant) }; }

function publicCatalogProducts(data) {
  const hiddenCategories = new Set((data.categories || []).filter((item) => item.active === false).map((item) => item.nameEn));
  const hiddenBrands = new Set((data.brands || []).filter((item) => item.active === false).map((item) => item.nameEn));
  return data.products.filter((item) => item.status === "published" && !hiddenCategories.has(item.categoryEn) && !hiddenBrands.has(item.brandEn));
}

function defaultSponsoredAdSlots(products) {
  const candidates = [...products].sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)) || Number(a.id) - Number(b.id)).slice(0, 6);
  return [0, 1, 2].map((slot) => ({ label: "", productIds: candidates.slice(slot * 2, slot * 2 + 2).map((product) => Number(product.id)) }));
}

function sponsoredAds(data) {
  const products = publicCatalogProducts(data);
  const saved = data.settings?.sponsoredAds;
  const slots = Array.isArray(saved?.slots) && saved.slots.length === 3 ? saved.slots : defaultSponsoredAdSlots(products);
  return {
    titleEn: String(saved?.titleEn || "").slice(0, 120),
    titleHi: String(saved?.titleHi || "").slice(0, 120),
    subtitleEn: String(saved?.subtitleEn || "").slice(0, 180),
    subtitleHi: String(saved?.subtitleHi || "").slice(0, 180),
    slots: slots.map((slot) => {
      const productIds = Array.isArray(slot?.productIds) ? slot.productIds.map(Number).filter((id) => Number.isInteger(id) && id > 0) : [];
      return {
        label: String(slot?.label || "").slice(0, 50),
        productIds,
        products: productIds.map((id) => products.find((product) => Number(product.id) === id)).filter(Boolean).map(catalogProduct)
      };
    })
  };
}

export async function handleStoreRequest(request, response, pathname, env) {
  if (!pathname.startsWith("/api/")) return false;
  try {
    const url = new URL(request.url || "/", "http://localhost");
    const method = request.method;
    if (pathname === "/api/v1/storefront/settings" && method === "GET") { const data = await state(env), allowed = ["brandLogo", "homeBannerImage", "homeHelpImage", "storeName", "publicDomain", "storeAbout", "supportEmail", "supportPhone", "supportDetails", "businessDetails", "language", "homeHeroEyebrow", "homeHeroHeadline", "homeHeroBody", "homeHeroNote", "homeHeroPrimaryCta", "homeBannerTitle", "homeBannerText", "homeHelpTitle", "homeHelpText", "homeProductsTitle", "catalogBannerTitle", "catalogBannerImage", "navHome", "navCategories", "navSearch", "navCart", "navAccount", "deliveryRules", "codPolicy", "cancellationReturnsRules", "shippingReturnsPolicy", "privacyPolicy", "termsPolicy", "productUseNotice"]; send(response, 200, Object.fromEntries(allowed.map((key) => [key, String(data.settings?.[key] || "")]))); return true; }
    if (pathname === "/api/v1/storefront/sponsored-ads" && method === "GET") {
      send(response, 200, sponsoredAds(await state(env)));
      return true;
    }
    if (pathname === "/api/v1/storefront/offers" && method === "GET") { const data = await state(env), time = Date.now(), items = (data.coupons || []).filter((item) => item.active !== false && (!item.expiresAt || time <= Date.parse(`${item.expiresAt}T23:59:59Z`)) && (!item.maxUses || (Number(item.usesCount) || 0) < item.maxUses)).map(({ code, type, value, minSubtotalPaise, expiresAt }) => ({ code, type, value, minSubtotalPaise: Number(minSubtotalPaise) || 0, expiresAt: expiresAt || null })); send(response, 200, { items }); return true; }
    if (pathname === "/api/v1/cart" && (method === "GET" || method === "PUT")) {
      const id = String(request.headers["x-agroseed-cart-id"] || "").trim();
      if (!/^[a-f0-9]{32}$/i.test(id)) { send(response, 400, { error: "A valid guest cart ID is required." }); return true; }
      const key = hash(id);
      if (method === "GET") {
        const row = await env.DB.prepare("SELECT items, updated_at FROM agroseed_guest_carts WHERE id = ? AND updated_at > datetime('now', '-30 days')").bind(key).first();
        send(response, 200, row ? { items: JSON.parse(row.items), updatedAt: row.updated_at.replace(" ", "T") + "Z" } : { items: [], updatedAt: null });
        return true;
      }
      const input = await body(request, 12000);
      if (!Array.isArray(input?.items) || input.items.length > 50) {
        send(response, 400, { error: "A guest cart can contain at most 50 lines." }); return true;
      }
      const data = await state(env);
      const quantities = new Map();
      for (const item of input.items) {
        const sku = String(item?.sku || "").trim().toUpperCase();
        const quantity = Number(item?.quantity);
        const found = findVariant(data, sku);
        if (!found || found.product.status !== "published" || !found.variant.active) {
          send(response, 409, { error: "A product in this cart is no longer available." }); return true;
        }
        const total = (quantities.get(sku) || 0) + quantity;
        if (!Number.isInteger(quantity) || quantity < 1 || total > 99) {
          send(response, 400, { error: "Cart quantities must be whole numbers from 1 to 99." }); return true;
        }
        quantities.set(sku, total);
      }
      const items = [...quantities].map(([sku, quantity]) => ({ sku, quantity }));
      const updatedAt = now();
      const storedAt = updatedAt.slice(0, -1).replace("T", " ");
      await env.DB.prepare(`INSERT INTO agroseed_guest_carts (id, items, updated_at) VALUES (?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET items = excluded.items, updated_at = excluded.updated_at`)
        .bind(key, JSON.stringify(items), storedAt).run();
      await env.DB.prepare("DELETE FROM agroseed_guest_carts WHERE id IN (SELECT id FROM agroseed_guest_carts WHERE updated_at <= datetime('now', '-30 days') ORDER BY updated_at LIMIT 20)").run();
      send(response, 200, { items, updatedAt }); return true;
    }
    if (pathname === "/api/v1/admin/session" && method === "POST") {
      const input = await body(request, 2048);
      const configured = String(env.AGROSEED_ADMIN_PASSWORD || "");
      if (!configured) { send(response, 503, { error: "The staff password is not configured." }); return true; }
      const supplied = Buffer.from(String(input.password || "")); const expected = Buffer.from(configured);
      const match = supplied.length === expected.length && timingSafeEqual(supplied, expected);
      if (!match) {
        send(response, 401, { error: "That password did not match." }); return true;
      }

      const raw = randomBytes(32).toString("base64url");
      const csrf = randomBytes(24).toString("base64url");
      const expires = Date.now() + 8 * 60 * 60_000;
      await env.DB.prepare("INSERT INTO agroseed_admin_sessions (token_hash, role, csrf_token, expires_at) VALUES (?, ?, ?, ?)")
        .bind(hash(raw), "Owner", csrf, new Date(expires).toISOString()).run();

      const secure = request.socket.encrypted ? "; Secure" : "";
      send(response, 200, { user: { name: "Store owner", role: "Owner" }, csrf }, { "Set-Cookie": `agroseed_admin=${encodeURIComponent(raw)}; HttpOnly; SameSite=Strict; Path=/api/v1/admin; Max-Age=28800${secure}` }); return true;
    }
    if (pathname === "/api/v1/admin/session" && (method === "GET" || method === "DELETE")) {
      const session = await requireAdmin(request, response, method === "DELETE", env); if (!session) return true;
      if (method === "DELETE") {
        const tokenHash = hash(cookieValue(request, "agroseed_admin"));
        await env.DB.prepare("DELETE FROM agroseed_admin_sessions WHERE token_hash = ?").bind(tokenHash).run();

        send(response, 200, { ok: true }, { "Set-Cookie": "agroseed_admin=; HttpOnly; SameSite=Strict; Path=/api/v1/admin; Max-Age=0" });
      }
      else send(response, 200, { user: { name: "Store owner", role: session.role || "Owner" }, csrf: session.csrf }); return true;
    }

    if (pathname === "/api/v1/products" && method === "GET") {
      const data = await state(env);
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
      const data = await state(env); const needle = publicProduct[1]; const hiddenCategories = new Set((data.categories || []).filter((item) => item.active === false).map((item) => item.nameEn)); const hiddenBrands = new Set((data.brands || []).filter((item) => item.active === false).map((item) => item.nameEn)); const product = data.products.find((item) => item.status === "published" && !hiddenCategories.has(item.categoryEn) && !hiddenBrands.has(item.brandEn) && (String(item.id) === needle || item.slug === needle));
      if (!product) send(response, 404, { error: "Product not found." }); else send(response, 200, catalogProduct(product)); return true;
    }
    const service = pathname.match(/^\/api\/v1\/serviceability\/(\d{6})$/);
    if (service && method === "GET") {
      const data = await state(env); const area = data.serviceAreas.find((item) => item.pincode === service[1] && item.active !== false);
      send(response, 200, { available: data.serviceAreas.length ? Boolean(area) : false, configured: data.serviceAreas.length > 0, area: area || null }); return true;
    }
    if (pathname === "/api/v1/support/requests" && method === "POST") {
      const input = await body(request, 12_000);
      if (!String(input.name || "").trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(input.email || "")) || String(input.message || "").trim().length < 10) { send(response, 400, { error: "Add your name, a valid email, and a message of at least 10 characters." }); return true; }
      const ticket = await change(env, (data) => { const item = { id: randomBytes(6).toString("hex").toUpperCase(), name: String(input.name).trim(), email: String(input.email).trim(), topic: String(input.topic || "General"), message: String(input.message).trim().slice(0, 4000), status: "new", createdAt: now() }; data.supportRequests.unshift(item); return item.id; });
      send(response, 201, { received: true, ticket }); return true;
    }
    if (pathname === "/api/v1/checkout/quote" && method === "POST") {
      const input = await body(request, 16_000); const data = await state(env);
      const quote = calculate(data, input);
      if (input.address && !/^\d{6}$/.test(String(input.address.pincode || ""))) { send(response, 400, { error: "Enter a valid 6-digit PIN code." }); return true; }
      send(response, 200, { ...quote, currency: "INR" }); return true;
    }
    if ((pathname === "/api/create-order" || pathname === "/api/verify-payment") && method === "POST") {
      send(response, 401, { error: "Sign in with a verified customer account to check out." }); return true;
    }
    if (pathname === "/api/v1/orders" && method === "POST") {
      send(response, 503, { error: "Order placement is currently unavailable." }); return true;
    }
    if (pathname.startsWith("/api/v1/admin/")) {
      const mutating = method !== "GET";
      const session = await requireAdmin(request, response, mutating, env); if (!session) return true;
      const adminPath = pathname.slice("/api/v1/admin".length);
      if (!canAccessAdminPath(session.role || "Owner", adminPath)) { send(response, 403, { error: "Your staff role cannot access this area." }); return true; }
      if (adminPath === "/orders" && method === "GET") {
        const data = await state(env), status = String(url.searchParams.get("status") || ""), query = String(url.searchParams.get("q") || "").trim().toLowerCase();
        let items = [...(data.orders || [])];
        if (status) items = items.filter(order => order.status === status);
        if (query) items = items.filter(order => [order.orderNumber, order.customerName, order.customerEmail, order.paymentId, ...order.items.map(line => `${line.nameEn} ${line.sku}`)].join(" ").toLowerCase().includes(query));
        send(response, 200, { items: items.slice(0, 250), total: items.length, counts: (data.orders || []).reduce((counts, order) => { counts[order.status] = (counts[order.status] || 0) + 1; return counts; }, {}) });
        return true;
      }
      const adminOrderStatus = adminPath.match(/^\/orders\/([a-f0-9]{32})$/i);
      if (adminOrderStatus && method === "PATCH") {
        const input = await body(request), nextStatus = String(input.status || "");
        const allowedTransitions = { pending_payment: ["cancelled"], paid: ["confirmed", "cancelled"], confirmed: ["packing", "cancelled"], packing: ["shipped", "cancelled"], shipped: ["delivered"] };
        const result = await change(env, data => {
          const order = data.orders?.find(item => item.id === adminOrderStatus[1]);
          if (!order) throw Object.assign(new Error("Order not found."), { statusCode: 404 });
          if (!(allowedTransitions[order.status] || []).includes(nextStatus)) throw Object.assign(new Error(`Cannot move an order from ${order.status} to ${nextStatus}.`), { statusCode: 409 });
          if (nextStatus === "cancelled" || nextStatus === "delivered") {
            for (const line of order.items) {
              const found = findVariant(data, line.sku);
              if (found) {
                if (nextStatus === "cancelled") found.variant.stock += line.quantity;
                found.variant.reserved = Math.max(0, (Number(found.variant.reserved) || 0) - line.quantity);
                refreshProductStock(data, found.product);
              }
            }
          }
          order.status = nextStatus;
          if (nextStatus === "cancelled") order.paymentStatus = order.paymentStatus === "test_paid" ? "test_refunded" : order.paymentStatus === "captured" ? "refund_required" : "cancelled";
          if (nextStatus === "cancelled") {
            const payment = (data.paymentAttempts || []).find(item => item.localOrderId === order.id);
            if (payment && payment.status === "created") payment.status = "cancelled";
          }
          order.updatedAt = now();
          order.history.push(orderHistoryEntry(nextStatus, session.role || "Owner", String(input.note || `Order marked ${nextStatus}.`).trim().slice(0, 240)));
          audit(data, "order_status_updated", "order", order.orderNumber, `${order.status}${order.paymentMode === "test" ? " (test order)" : ""}`);
          return order;
        });
        send(response, 200, result);
        return true;
      }
      if (adminPath === "/sponsored-ads" && method === "GET") {
        const data = await state(env);
        send(response, 200, { ...sponsoredAds(data), products: data.products.map(catalogProduct) });
        return true;
      }
      if (adminPath === "/sponsored-ads" && method === "PATCH") {
        const input = await body(request);
        const result = await change(env, (data) => {
          if (!Array.isArray(input.slots) || input.slots.length !== 3) throw Object.assign(new Error("Keep exactly three sponsored slots."), { statusCode: 400 });
          const eligible = new Map(publicCatalogProducts(data).map((product) => [Number(product.id), product]));
          const slots = input.slots.map((slot, index) => {
            if (!Array.isArray(slot.productIds) || slot.productIds.length > 12) throw Object.assign(new Error(`Slot ${index + 1} can contain at most 12 slides.`), { statusCode: 400 });
            const productIds = slot.productIds.map(Number);
            if (productIds.some((id) => !Number.isInteger(id) || id < 1) || new Set(productIds).size !== productIds.length) throw Object.assign(new Error(`Remove invalid or duplicate products from slot ${index + 1}.`), { statusCode: 400 });
            if (productIds.some((id) => !eligible.has(id))) throw Object.assign(new Error(`Slot ${index + 1} can only use published, visible products.`), { statusCode: 400 });
            return { label: String(slot.label || "").trim().slice(0, 50), productIds };
          });
          data.settings.sponsoredAds = {
            titleEn: String(input.titleEn || "").trim().slice(0, 120),
            titleHi: String(input.titleHi || "").trim().slice(0, 120),
            subtitleEn: String(input.subtitleEn || "").trim().slice(0, 180),
            subtitleHi: String(input.subtitleHi || "").trim().slice(0, 180),
            slots
          };
          audit(data, "sponsored_ads_updated", "settings", "sponsored-ads", "Sponsored product slides updated");
          return sponsoredAds(data);
        });
        send(response, 200, result);
        return true;
      }
      if (adminPath === "/media" && method === "POST") {
        const input = await body(request, 1100 * 1024);
        send(response, 201, await saveCatalogImage(env.DB, input));
        return true;
      }
      if (adminPath === "/catalog" && method === "GET") {
        const data = await state(env);
        const category = url.searchParams.get("category");
        const items = data.products.filter(p => p.status === "published" && (!category || slug(p.categoryEn) === category));
        send(response, 200, {
          ...deriveCollections(data.products, data.categories, data.brands, true),
          items: items.map(({ id, nameEn, variants, featured }) => ({ id, nameEn, skus: variants.map(v => v.sku), featured })),
          banner: data.settings.catalogBannerTitle || "",
          bannerImage: data.settings.catalogBannerImage || ""
        });
        return true;
      }
      if (adminPath === "/catalog/banner" && method === "PATCH") {
        const input = await body(request);
        await change(env, (data) => {
          data.settings.catalogBannerTitle = String(input.banner || "").trim().slice(0, 100);
          data.settings.catalogBannerImage = catalogImageUrl(input.bannerImage);
          audit(data, "catalog_banner_updated", "settings", "catalog", "Categories banner updated");
        });
        send(response, 200, { ok: true });
        return true;
      }
      const featuredRoute = adminPath.match(/^\/catalog\/featured\/(\d+)$/);
      if (featuredRoute && method === "PATCH") {
        const input = await body(request);
        await change(env, (data) => {
          const product = data.products.find((item) => item.id === Number(featuredRoute[1]) && item.status === "published");
          if (!product) throw Object.assign(new Error("Published product not found."), { statusCode: 404 });
          product.featured = input.featured === true;
          audit(data, "product_featured_updated", "product", product.id, product.nameEn);
        });
        send(response, 200, { ok: true });
        return true;
      }
      const sectionRoute = adminPath.match(/^\/catalog\/category\/([^/]+)\/sections(?:\/([^/]+))?$/);
      if (sectionRoute && (sectionRoute[2] ? method === "PATCH" : method === "POST")) {
        const input = await body(request);
        const title = String(input.title || "").trim().slice(0, 80);
        if (!title) { send(response, 400, { error: "Enter a section name." }); return true; }
        const image = catalogImageUrl(input.image);
        const skus = sectionSkus(input.skus);
        const entry = await change(env, (data) => {
          const { categories } = deriveCollections(data.products, data.categories, data.brands, true);
          const category = categories.find((item) => item.id === sectionRoute[1]);
          if (!category) throw Object.assign(new Error("Category not found."), { statusCode: 404 });
          const index = category.sections.findIndex((item) => item.id === sectionRoute[2]);
          if (method === "PATCH" && index < 0) throw Object.assign(new Error("Section not found."), { statusCode: 404 });
          if (index < 0 && category.sections.length >= 30) throw Object.assign(new Error("A category can have up to 30 sections."), { statusCode: 400 });
          const section = { id: index < 0 ? randomBytes(8).toString("hex") : category.sections[index].id, title, skus, image };
          category.sections = category.sections.slice();
          if (index < 0) category.sections.push(section);
          else category.sections[index] = section;
          saveTaxonomyEntry(data, "categories", category);
          audit(data, "catalog_section_saved", "category", category.id, title);
          return section;
        });
        send(response, method === "POST" ? 201 : 200, entry);
        return true;
      }
      if (adminPath === "/demo" && ["POST", "DELETE"].includes(method)) {
        const counts = await change(env, (data) => {
          if (method === "POST" && Object.values(demoCounts(data)).some(Boolean)) return demoCounts(data);
          return updateDemo(data, method === "DELETE");
        });
        send(response, 200, { counts });
        return true;
      }
      if (adminPath === "/overview" && method === "GET") {
        const data = await state(env);
        const variants = data.products.flatMap((product) => product.variants);
        const openSupport = data.supportRequests.filter((item) => item.status !== "resolved").length;
        const published = data.products.filter((product) => product.status === "published").length;
        const activePromotions = data.coupons.filter((item) => item.active !== false && (!item.expiresAt || Date.now() <= Date.parse(`${item.expiresAt}T23:59:59Z`)) && (!item.maxUses || item.usesCount < item.maxUses)).length;
        send(response, 200, {
          demo: demoCounts(data),
          products: data.products.length,
          published,
          lowStock: variants.filter((variant) => variant.stock > 0 && variant.stock <= 5).length,
          outOfStock: variants.filter((variant) => variant.stock <= 0).length,
          openSupport,
          resolvedSupport: data.supportRequests.length - openSupport,
          activePromotions,
          totalPromotions: data.coupons.length,
          deliveryAreas: data.serviceAreas.filter((area) => area.active !== false).length
        }); return true;
      }
      if (adminPath === "/products" && method === "GET") {
        const data = await state(env); let products = data.products;
        const q = (url.searchParams.get("q") || "").trim().toLocaleLowerCase();
        const status = url.searchParams.get("status") || "";
        if (q) products = products.filter((p) => [p.name, p.nameEn, p.brand, p.brandEn, p.sku, ...p.variants.map((v) => v.sku)].join(" ").toLocaleLowerCase().includes(q));
        if (status) products = products.filter((p) => p.status === status);
        const total = products.length; const page = Math.max(1, Number(url.searchParams.get("page")) || 1); const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 20));
        send(response, 200, { items: products.slice((page - 1) * limit, page * limit), total, page, limit, pages: Math.max(1, Math.ceil(total / limit)), ...deriveCollections(data.products, data.categories, data.brands) }); return true;
      }
      if (adminPath === "/products" && method === "POST") {
        const input = await body(request); const result = await change(env, (data) => { const product = cleanProduct(input, null, data); data.products.push(product); audit(data, "product_created", "product", product.id, product.nameEn); return product; }); send(response, 201, result); return true;
      }
      const productRoute = adminPath.match(/^\/products\/(\d+)$/);
      if (productRoute && (method === "GET" || method === "PATCH" || method === "DELETE")) {
        if (method === "GET") { const data = await state(env); const product = data.products.find((p) => p.id === Number(productRoute[1])); if (!product) send(response, 404, { error: "Product not found." }); else send(response, 200, product); return true; }
        const input = method === "PATCH" ? await body(request) : null; const product = await change(env, (data) => { const current = data.products.find((p) => p.id === Number(productRoute[1])); if (!current) throw Object.assign(new Error("Product not found."), { statusCode: 404 }); if (method === "DELETE") { current.status = "archived"; current.active = false; current.updatedAt = now(); audit(data, "product_archived", "product", current.id, current.nameEn); return current; } const updated = cleanProduct(input, current, data); Object.assign(current, updated); audit(data, "product_updated", "product", current.id, current.nameEn); return current; }); send(response, 200, product); return true;
      }
      if (adminPath === "/inventory" && method === "GET") { const data = await state(env); send(response, 200, { products: data.products, transactions: data.inventoryTransactions.slice(0, 300) }); return true; }
      if (adminPath === "/inventory" && method === "POST") {
        const input = await body(request); const result = await change(env, (data) => { const found = findVariant(data, input.sku); const delta = Number(input.delta); const reason = String(input.reason || "").trim(); if (!found) throw Object.assign(new Error("SKU not found."), { statusCode: 404 }); if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 10000) throw Object.assign(new Error("Stock change must be a non-zero whole number."), { statusCode: 400 }); if (found.variant.stock + delta < 0) throw Object.assign(new Error("Stock cannot go below zero."), { statusCode: 400 }); if (reason.length < 5) throw Object.assign(new Error("Add a reason (at least 5 characters)."), { statusCode: 400 }); found.variant.stock += delta; found.product.stock = found.product.variants.reduce((sum, item) => sum + item.stock, 0); const row = { id: randomBytes(8).toString("hex"), sku: found.variant.sku, demo: found.product.demo === true || undefined, delta, reason, actor: "Store owner", createdAt: now() }; data.inventoryTransactions.unshift(row); audit(data, "inventory_adjusted", "variant", found.variant.sku, `${delta > 0 ? "+" : ""}${delta}: ${reason}`); return row; }); send(response, 201, result); return true;
      }
      if (adminPath === "/import" && method === "POST") {
        const input = await body(request); if (!Array.isArray(input.rows) || !["create", "upsert"].includes(input.mode)) { send(response, 400, { error: "Choose create or update, and include CSV rows." }); return true; }
        const result = await change(env, (data) => { const created = []; const updated = []; const errors = []; input.rows.slice(0, 1000).forEach((row, index) => { try { const incoming = { ...row, status: row.status || "draft", variants: Array.isArray(row.variants) ? row.variants : [{ sku: row.sku, pack: row.pack || "1 pack", pricePaise: Number(row.pricePaise), mrpPaise: Number(row.mrpPaise), stock: Number(row.stock) }] }; const existing = data.products.find((p) => p.variants.some((v) => v.sku === String(incoming.variants[0]?.sku || "").toUpperCase())); if (existing) { if (input.mode !== "upsert") throw new Error("SKU already exists; select update after reviewing."); Object.assign(existing, cleanProduct(incoming, existing, data)); updated.push(existing.sku); audit(data, "product_import_updated", "product", existing.id, existing.sku); } else { const product = cleanProduct(incoming, null, data); data.products.push(product); created.push(product.sku); audit(data, "product_import_created", "product", product.id, product.sku); } } catch (error) { errors.push({ row: index + 2, error: error.message }); } }); return { created, updated, errors }; }); send(response, 200, result); return true;
      }
      if (adminPath === "/settings" && (method === "GET" || method === "PATCH")) {
        if (method === "GET") { const data = await state(env); const collections = deriveCollections(data.products, data.categories, data.brands, true); send(response, 200, { settings: data.settings, categories: collections.categories, brands: collections.brands, serviceAreas: data.serviceAreas, coupons: data.coupons }); return true; }
        const input = await body(request); const rawDomain = Object.hasOwn(input, "publicDomain") ? String(input.publicDomain || "").trim() : String((await state(env)).settings?.publicDomain || ""); let publicDomain = ""; if (rawDomain) { let parsed; try { parsed = new URL(rawDomain); } catch { send(response, 400, { error: "Public website domain must be a full URL such as https://agroseed.in." }); return true; } if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) { send(response, 400, { error: "Enter only the public site base URL, such as https://agroseed.in, without a path." }); return true; } publicDomain = parsed.origin; } const result = await change(env, (data) => { data.settings ||= {}; data.settings = { ...data.settings, storeName: String(input.storeName || data.settings.storeName || "AgroSeed").slice(0, 80), publicDomain, supportEmail: Object.hasOwn(input, "supportEmail") ? String(input.supportEmail || "").trim().slice(0, 160) : String(data.settings.supportEmail || ""), supportPhone: Object.hasOwn(input, "supportPhone") ? String(input.supportPhone || "").trim().slice(0, 40) : String(data.settings.supportPhone || ""), language: ["en", "hi"].includes(input.language) ? input.language : (data.settings.language || "en") }; for (const field of ["storeAbout", "supportDetails", "businessDetails", "homeHeroEyebrow", "homeHeroHeadline", "homeHeroBody", "homeHeroNote", "homeHeroPrimaryCta", "homeBannerTitle", "homeBannerText", "homeHelpTitle", "homeHelpText", "homeProductsTitle", "deliveryRules", "codPolicy", "cancellationReturnsRules", "shippingReturnsPolicy", "privacyPolicy", "termsPolicy", "productUseNotice"]) if (Object.hasOwn(input, field)) data.settings[field] = String(input[field] || "").trim().slice(0, 20000); for (const field of ["brandLogo","homeBannerImage","homeHelpImage"]) if (Object.hasOwn(input,field)) data.settings[field]=catalogImageUrl(input[field]); for (const field of ["navHome", "navCategories", "navSearch", "navCart", "navAccount"]) if (Object.hasOwn(input, field)) data.settings[field] = String(input[field] ?? "").trim().slice(0, 20);
          if (Array.isArray(input.categories)) data.categories = normalizeTaxonomy(input.categories, "Categories").map((row) => ({ ...data.categories?.find((old) => old.slug === row.slug), ...row }));
          if (Array.isArray(input.brands)) data.brands = normalizeTaxonomy(input.brands, "Brands").map((row) => ({ ...data.brands?.find((old) => old.slug === row.slug), ...row })); audit(data, "store_settings_updated", "settings", "store", "Store details and editable copy updated"); return data.settings; }); send(response, 200, result); return true;
      }
      const taxonomyRoute = adminPath.match(/^\/catalog\/(category|brand)(?:\/([^/]+))?$/);
      if (taxonomyRoute && (taxonomyRoute[2] ? method === "PATCH" : method === "POST")) {
        const input = await body(request);
        const [ , kind, id] = taxonomyRoute;
        const key = kind === "category" ? "categories" : "brands";
        const creating = method === "POST";
        const result = await change(env, (data) => {
          const collections = deriveCollections(data.products, data.categories, data.brands, true);
          const rows = collections[key];
          const existingId = creating ? (kind === "brand" ? input.existingId : "") : id;
          const current = existingId ? rows.find((row) => String(row.id) === existingId) : null;
          if ((!creating || existingId) && !current) throw Object.assign(new Error("Browse label not found."), { statusCode: 404 });
          const entry = current ? { ...current } : { active: true, order: rows.length };
          if (!creating || !current) {
            const nameEn = String(input.nameEn ?? entry.nameEn ?? "").trim();
            const nextSlug = slug(nameEn);
            if (!nameEn || nameEn.length > 80) throw Object.assign(new Error("Add an English label up to 80 characters."), { statusCode: 400 });
            if (rows.some((row) => row !== current && (row.slug === nextSlug || row.nameEn.toLowerCase() === nameEn.toLowerCase()))) {
              throw Object.assign(new Error("That label already exists."), { statusCode: 409 });
            }
            entry.nameEn = nameEn;
            entry.name = String(input.name ?? entry.name ?? nameEn).trim().slice(0, 100) || nameEn;
            entry.slug = nextSlug;
            entry.id = nextSlug;
            if (Object.hasOwn(input, "order")) entry.order = Math.min(1000, Math.max(0, Number(input.order) || 0));
            if (Object.hasOwn(input, "active")) entry.active = input.active !== false && input.active !== "false";
            updateTaxonomyPresentation(entry, input, kind);
          }
          if (current && (current.nameEn !== entry.nameEn || current.name !== entry.name)) {
            for (const product of data.products) {
              if (kind === "category" && product.categoryEn === current.nameEn) {
                product.categoryEn = entry.nameEn; product.category = entry.name;
              }
              if (kind === "brand" && product.brandEn === current.nameEn) {
                product.brandEn = entry.nameEn; product.brand = entry.name;
              }
            }
          }
          if (!creating || !current) saveTaxonomyEntry(data, key, entry, current?.id);
          if (kind === "brand") {
            const categoryId = String(input.categoryId || "");
            const linked = collections.categories.find((row) => row.id === categoryId);
            if (categoryId && !linked) throw Object.assign(new Error("Category not found."), { statusCode: 404 });
            if (current && current.id !== entry.id) {
              data.categories = (data.categories || []).map((row) => ({
                ...row, brandIds: row.brandIds?.map((value) => value === current.id ? entry.id : value)
              }));
            }
            if (linked) saveTaxonomyEntry(data, "categories", {
              ...linked, brandIds: [...new Set([...(linked.brandIds || []), entry.id])]
            });
          }
          audit(data, "catalog_label_saved", kind, entry.id, entry.nameEn);
          return entry;
        });
        send(response, creating ? 201 : 200, result);
        return true;
      }
      if (adminPath === "/coupons" && method === "GET") { const data = await state(env); send(response, 200, { items: data.coupons }); return true; }
      if (adminPath === "/coupons" && method === "POST") { const input = await body(request); const result = await change(env, (data) => { const code = String(input.code || "").trim().toUpperCase(); const value = Number(input.value); const maxUses = input.maxUses === "" || input.maxUses === undefined ? null : Number(input.maxUses); const minimum = input.minSubtotal === "" || input.minSubtotal === undefined ? 0 : Number(input.minSubtotal); if (!/^[A-Z0-9_-]{3,20}$/.test(code) || !["percent", "flat"].includes(input.type) || !Number.isFinite(value) || value <= 0 || (input.type === "percent" && value > 100)) throw Object.assign(new Error("Check promotion code and discount value."), { statusCode: 400 }); if (maxUses !== null && (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 1000000)) throw Object.assign(new Error("Maximum uses must be a positive whole number."), { statusCode: 400 }); if (!Number.isFinite(minimum) || minimum < 0) throw Object.assign(new Error("Minimum order amount cannot be negative."), { statusCode: 400 }); if (input.expiresAt && !/^\d{4}-\d{2}-\d{2}$/.test(input.expiresAt)) throw Object.assign(new Error("Enter a valid expiration date."), { statusCode: 400 }); if (data.coupons.some((c) => c.code === code)) throw Object.assign(new Error("That code already exists."), { statusCode: 409 }); const item = { id: randomBytes(6).toString("hex"), code, type: input.type, value: input.type === "flat" ? Math.round(value * 100) : Math.round(value), minSubtotalPaise: Math.round(minimum * 100), maxUses, usesCount: 0, active: true, expiresAt: input.expiresAt || null, createdAt: now() }; data.coupons.push(item); audit(data, "coupon_created", "coupon", item.id, code); return item; }); send(response, 201, result); return true; }
      const couponRoute = adminPath.match(/^\/coupons\/([^/]+)$/);
      if (couponRoute && method === "PATCH") { const input = await body(request); const result = await change(env, (data) => { const item = data.coupons.find((row) => row.id === couponRoute[1]); if (!item) throw Object.assign(new Error("Promotion not found."), { statusCode: 404 }); item.active = input.active === true || input.active === "true"; audit(data, "coupon_status_changed", "coupon", item.id, item.active ? "activated" : "paused"); return item; }); send(response, 200, result); return true; }
      if (couponRoute && method === "DELETE") { await change(env, (data) => { audit(data, "coupon_deleted", "coupon", couponRoute[1], "Promotion removed"); data.coupons = data.coupons.filter((item) => item.id !== couponRoute[1]); }); send(response, 200, { ok: true }); return true; }
      if (adminPath === "/service-areas" && method === "GET") { const data = await state(env); send(response, 200, { items: data.serviceAreas }); return true; }
      if (adminPath === "/service-areas" && method === "POST") { const input = await body(request); const result = await change(env, (data) => { const pincode = String(input.pincode || "").trim(); if (!/^\d{6}$/.test(pincode)) throw Object.assign(new Error("PIN code must have 6 digits."), { statusCode: 400 }); if (data.serviceAreas.some((area) => area.pincode === pincode)) throw Object.assign(new Error("That PIN code is already configured."), { statusCode: 409 }); const area = { id: randomBytes(6).toString("hex"), pincode, city: String(input.city || "").slice(0, 80), feePaise: Math.max(0, Math.round(Number(input.feeRupees || 0) * 100)), estimate: String(input.estimate || "").slice(0, 80), active: true }; data.serviceAreas.push(area); audit(data, "service_area_added", "service-area", area.id, pincode); return area; }); send(response, 201, result); return true; }
      const areaRoute = adminPath.match(/^\/service-areas\/([^/]+)$/);
      if (areaRoute && method === "DELETE") { await change(env, (data) => { audit(data, "service_area_removed", "service-area", areaRoute[1], "PIN code removed"); data.serviceAreas = data.serviceAreas.filter((item) => item.id !== areaRoute[1]); }); send(response, 200, { ok: true }); return true; }
      if (adminPath === "/support" && method === "GET") { const data = await state(env); send(response, 200, { items: data.supportRequests }); return true; }
      const supportRoute = adminPath.match(/^\/support\/([^/]+)$/);
      if (supportRoute && method === "PATCH") { const input = await body(request); const result = await change(env, (data) => { const item = data.supportRequests.find((row) => row.id === supportRoute[1]); if (!item) throw Object.assign(new Error("Request not found."), { statusCode: 404 }); item.status = input.status === "resolved" ? "resolved" : "in_progress"; audit(data, "support_request_updated", "support", item.id, item.status); return item; }); send(response, 200, result); return true; }
      if (adminPath === "/audit" && method === "GET") { const data = await state(env); send(response, 200, { items: data.audit.slice(0, 500), inventory: data.inventoryTransactions.slice(0, 500) }); return true; }
      send(response, 404, { error: "Staff API route not found." }); return true;
    }
    if (pathname.startsWith("/api/")) { send(response, 404, { error: "API route not found." }); return true; }
    return false;
  } catch (error) {
    if (response.headersSent || response.destroyed) return true;
    if (!error.statusCode) console.error("Store request failed", { route: pathname, message: String(error.message).slice(0, 200) });
    send(response, error.statusCode || 500, { error: error.statusCode ? error.message : "Store service is temporarily unavailable" });
    return true;
  }
}
