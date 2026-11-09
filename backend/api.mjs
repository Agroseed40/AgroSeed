import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { demoMode } from "../config/features.mjs";
import { handleSandboxRequest } from "./sandbox.mjs";
import { handleCustomerAuth } from "./customer-auth.mjs";

const backendDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(backendDir, "..");
const dataDir = path.join(appRoot, "storage");
const dataFile = path.join(dataDir, "sandbox-store.json");
const seedFile = path.join(backendDir, "seed", "products.json");
const orderNumberPattern = /^AS-SBX-[A-Z0-9-]{8,40}$/;

let statePromise;
let writeQueue = Promise.resolve();

async function readState() {
  if (process.env.NODE_ENV === "production") {
    const products = JSON.parse(await readFile(seedFile, "utf8"));
    return { products, orders: [] };
  }
  await mkdir(dataDir, { recursive: true });
  try {
    return JSON.parse(await readFile(dataFile, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    const products = JSON.parse(await readFile(seedFile, "utf8"));
    const initialState = { products, orders: [] };
    await writeState(initialState);
    return initialState;
  }
}

function getState() {
  statePromise ??= readState();
  return statePromise;
}

function writeState(state) {
  const operation = writeQueue.then(async () => {
    await mkdir(dataDir, { recursive: true });
    const tempFile = `${dataFile}.tmp`;
    await writeFile(tempFile, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    await rename(tempFile, dataFile);
  });
  writeQueue = operation.catch(() => {});
  return operation;
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(JSON.stringify(body));
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 64 * 1024) {
      const error = new Error("Request body is too large");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("Request body must be valid JSON");
    error.statusCode = 400;
    throw error;
  }
}

function createOrderNumber() {
  const time = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `AS-SBX-${time}-${random}`;
}

export async function handleApiRequest(request, response, pathname) {
  if (await handleCustomerAuth(request, response, pathname)) return true;
  if (await handleSandboxRequest(request, response, pathname)) return true;
  try {
    if (request.method === "GET" && pathname === "/api/v1/health") {
      sendJson(response, 200, { status: "ok", service: "agroseed-api", mode: "sandbox" });
      return true;
    }

    if (request.method === "GET" && pathname === "/api/v1/products") {
      if (!demoMode) {
        sendJson(response, 503, { error: "Live catalog is not connected" });
        return true;
      }
      const state = await getState();
      const url = new URL(request.url || "/", "http://localhost");
      const query = (url.searchParams.get("q") || "").trim().toLocaleLowerCase();
      const category = url.searchParams.get("category");
      const products = state.products.filter((product) => product.active &&
        (!category || product.categoryEn === category || product.category === category) &&
        (!query || [product.name, product.nameEn, product.brand, product.brandEn, product.sku]
          .some((value) => value.toLocaleLowerCase().includes(query))));
      sendJson(response, 200, { items: products, total: products.length });
      return true;
    }

    const productMatch = pathname.match(/^\/api\/v1\/products\/(\d+)$/);
    if (request.method === "GET" && productMatch) {
      if (!demoMode) {
        sendJson(response, 503, { error: "Live catalog is not connected" });
        return true;
      }
      const state = await getState();
      const product = state.products.find((item) => item.id === Number(productMatch[1]) && item.active);
      if (!product) sendJson(response, 404, { error: "Product not found" });
      else sendJson(response, 200, product);
      return true;
    }

    if (request.method === "POST" && pathname === "/api/v1/orders") {
      if (!demoMode) {
        sendJson(response, 503, { error: "Sandbox order creation is disabled" });
        return true;
      }
      if (process.env.NODE_ENV === "production") {
        sendJson(response, 503, { error: "Order storage is local-only; connect a staging database before hosted order tests" });
        return true;
      }
      const body = await readJsonBody(request);
      if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > 20) {
        sendJson(response, 400, { error: "Provide between 1 and 20 order items" });
        return true;
      }

      const state = await getState();
      const quantities = new Map();
      for (const item of body.items) {
        const productId = Number(item?.productId);
        const quantity = Number(item?.quantity);
        if (!Number.isInteger(productId) || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
          sendJson(response, 400, { error: "Each item needs a valid productId and quantity from 1 to 99" });
          return true;
        }
        quantities.set(productId, (quantities.get(productId) || 0) + quantity);
      }

      const lines = [];
      for (const [productId, quantity] of quantities) {
        const product = state.products.find((item) => item.id === productId && item.active);
        if (!product) {
          sendJson(response, 400, { error: `Unknown product: ${productId}` });
          return true;
        }
        if (quantity > product.stock) {
          sendJson(response, 409, { error: `Not enough sandbox stock for product ${productId}` });
          return true;
        }
        lines.push({ productId, sku: product.sku, name: product.name, quantity, unitPricePaise: product.pricePaise });
      }

      const order = {
        orderNumber: createOrderNumber(),
        status: "sandbox_pending",
        paymentStatus: "not_connected",
        items: lines,
        totalPaise: lines.reduce((total, line) => total + line.unitPricePaise * line.quantity, 0),
        createdAt: new Date().toISOString()
      };
      state.orders.push(order);
      await writeState(state);
      sendJson(response, 201, order);
      return true;
    }

    const orderMatch = pathname.match(/^\/api\/v1\/orders\/([^/]+)$/);
    if (request.method === "GET" && orderMatch) {
      if (!demoMode) {
        sendJson(response, 503, { error: "Sandbox order lookup is disabled" });
        return true;
      }
      if (process.env.NODE_ENV === "production") {
        sendJson(response, 503, { error: "Order storage is local-only; connect a staging database before hosted order tests" });
        return true;
      }
      const orderNumber = decodeURIComponent(orderMatch[1]);
      if (!orderNumberPattern.test(orderNumber)) {
        sendJson(response, 404, { error: "Order not found" });
        return true;
      }
      const state = await getState();
      const order = state.orders.find((item) => item.orderNumber === orderNumber);
      if (!order) sendJson(response, 404, { error: "Order not found" });
      else sendJson(response, 200, order);
      return true;
    }

    if (pathname.startsWith("/api/")) {
      sendJson(response, 404, { error: "API route not found" });
      return true;
    }
    return false;
  } catch (error) {
    sendJson(response, error.statusCode || 500, {
      error: error.statusCode ? error.message : "Sandbox API error"
    });
    return true;
  }
}
