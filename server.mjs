import { createReadStream } from "node:fs";
import { access } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { handleApiRequest } from "./backend/api.mjs";
import { runtimeConfig } from "./config/features.mjs";

const appRoot = path.dirname(fileURLToPath(import.meta.url));
const publicRoot = path.join(appRoot, "public");
const uploadRoot = path.resolve(appRoot, "storage", "uploads");
const portValue = process.env.PORT || "3000";
const port = Number(portValue);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535.");
}
const host = "0.0.0.0";
const allowedExtensions = new Set([
  ".css", ".html", ".ico", ".jpeg", ".jpg", ".js", ".png", ".svg", ".webp", ".woff2"
]);
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff2": "font/woff2"
};

function sendText(response, statusCode, body, contentType = "text/plain; charset=utf-8") {
  response.writeHead(statusCode, {
    "Content-Type": contentType,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-store"
  });
  response.end(body);
}

const server = createServer(async (request, response) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url || "/", "http://localhost").pathname);
  } catch {
    sendText(response, 400, "Bad request");
    return;
  }

  const isApiMutation = ["POST", "PUT", "PATCH", "DELETE"].includes(request.method) && pathname.startsWith("/api/");
  if (request.method !== "GET" && request.method !== "HEAD" && !isApiMutation) {
    sendText(response, 405, "Method not allowed");
    return;
  }

  if (request.method === "GET" && pathname === "/runtime-config.js") {
    response.writeHead(200, {
      "Content-Type": "text/javascript; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    });
    response.end(`window.AGROSEED_CONFIG = Object.freeze(${JSON.stringify(runtimeConfig)});`);
    return;
  }

  if (await handleApiRequest(request, response, pathname)) return;

  if (pathname === "/health") {
    sendText(response, 200, JSON.stringify({ status: "ok", app: "agroseed-storefront", mode: process.env.NODE_ENV || "development" }), "application/json; charset=utf-8");
    return;
  }

  const routePath = pathname.replace(/\/+$/, "") || "/";
  const isAppRoute = routePath === "/" || routePath === "/shop" || routePath === "/cart" || routePath === "/checkout" ||
    routePath === "/search" || routePath === "/help" || routePath === "/contact" || routePath === "/shipping-returns" ||
    routePath === "/privacy" || routePath === "/terms" || routePath === "/guides" || routePath === "/track-order" ||
    /^\/(category|brand|product|order|guides)\/[^/]+$/.test(routePath) ||
    /^\/account(?:\/(?:login|orders|addresses))?$/.test(routePath) ||
    /^\/admin(?:\/(?:login|products(?:\/new|\/import|\/\d+)?|inventory|orders(?:\/[^/]+)?|catalog|promotions|shipping|reports|settings|audit|support))?$/.test(routePath);
  if (/^\/uploads\/[a-zA-Z0-9_-]+\.(?:png|jpe?g|webp)$/.test(routePath)) {
    const filename = path.basename(routePath);
    const filePath = path.join(uploadRoot, filename);
    try { await access(filePath); } catch { sendText(response, 404, "Not found"); return; }
    const extension = path.extname(filePath).toLowerCase();
    response.writeHead(200, { "Content-Type": contentTypes[extension] || "application/octet-stream", "X-Content-Type-Options": "nosniff", "Cache-Control": "public, max-age=31536000, immutable" });
    if (request.method === "HEAD") { response.end(); return; }
    createReadStream(filePath).pipe(response);
    return;
  }
  const requestedPath = isAppRoute ? "/app.html" : pathname;
  const normalizedPath = path.normalize(requestedPath).replace(/^([/\\])+/, "");
  const filePath = path.resolve(publicRoot, normalizedPath);
  const rootPrefix = publicRoot.endsWith(path.sep) ? publicRoot : `${publicRoot}${path.sep}`;
  const extension = path.extname(filePath).toLowerCase();

  if (!filePath.startsWith(rootPrefix) || !allowedExtensions.has(extension)) {
    sendText(response, 404, "Not found");
    return;
  }

  try {
    await access(filePath);
  } catch {
    sendText(response, 404, "Not found");
    return;
  }

  response.writeHead(200, {
    "Content-Type": contentTypes[extension],
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-cache"
  });
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  createReadStream(filePath).pipe(response);
});

server.listen(port, host, () => {
  console.log(`AgroSeed sandbox listening on http://${host}:${port}`);
});
