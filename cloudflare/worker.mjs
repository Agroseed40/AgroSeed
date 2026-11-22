import { handleStoreRequest } from "../backend/store.mjs";
import { handleCustomerAuth } from "./customer-auth.mjs";
import { staticAssets } from "./static-assets.generated.mjs";
import { serveCatalogImage } from "./catalog-images.mjs";

const appRoutes = new Set([
  "/", "/categories", "/shop", "/cart", "/checkout", "/search", "/help", "/contact", "/shipping-returns",
  "/privacy", "/terms"
]);

function isAppRoute(pathname) {
  return appRoutes.has(pathname) ||
    /^\/(category|brand|product)\/[^/]+$/.test(pathname) ||
    /^\/account(?:\/(?:login|orders|addresses))?$/.test(pathname) ||
    /^\/admin(?:\/.*)?$/.test(pathname);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

function staticResponse(request, pathname) {
  const asset = staticAssets[pathname];
  if (!asset) return new Response("Not found", { status: 404, headers: { "X-Content-Type-Options": "nosniff" } });
  const binary = atob(asset.base64);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const headers = {
    "Content-Type": asset.contentType,
    "Cache-Control": asset.contentType.startsWith("image/") ? "public, max-age=3600" : "no-cache",
    "X-Content-Type-Options": "nosniff"
  };
  return new Response(request.method === "HEAD" ? null : bytes, { headers });
}

function requestAdapter(request) {
  const headers = Object.fromEntries(request.headers.entries());
  const url = new URL(request.url);
  return {
    method: request.method,
    url: request.url,
    headers,
    socket: {
      encrypted: url.protocol === "https:",
      remoteAddress: headers["cf-connecting-ip"] || "unknown"
    },
    async *[Symbol.asyncIterator]() {
      if (!request.body) return;
      const reader = request.body.getReader();
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          yield Buffer.from(value);
        }
      } finally {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
    }
  };
}

function responseAdapter() {
  let status = 200;
  let body = null;
  const headers = new Headers({
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  const response = {
    headersSent: false,
    destroyed: false,
    writeHead(code, supplied = {}) {
      status = code;
      for (const [name, value] of Object.entries(supplied)) {
        headers.delete(name);
        for (const part of Array.isArray(value) ? value : [value]) headers.append(name, String(part));
      }
      this.headersSent = true;
      return this;
    },
    setHeader(name, value) {
      headers.delete(name);
      for (const part of Array.isArray(value) ? value : [value]) headers.append(name, String(part));
    },
    end(value = null) {
      body = value == null ? null : String(value);
      this.headersSent = true;
    },
    toResponse() {
      return new Response(body, { status, headers });
    }
  };
  return response;
}

async function handleRequest(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname.replace(/\/+$/, "") || "/";

    const catalogImage = pathname.match(/^\/media\/images\/([a-f0-9]{64})$/);
    if (catalogImage && (request.method === "GET" || request.method === "HEAD")) {
      return await serveCatalogImage(request, env.DB, catalogImage[1]);
    }

    if (pathname === "/health" || pathname === "/api/v1/health") {
      try {
        await env.DB.prepare("SELECT revision FROM agroseed_app_state WHERE state_id = 1").first("revision").then(revision => {
          if (revision == null) throw new Error("Store state unavailable");
        });
        return json({ status: "ok" });
      } catch {
        return json({ status: "unavailable" }, 503);
      }
    }

    if (pathname === "/runtime-config.js") {
      const runtimeConfig = { customerAuthEnabled: Boolean(env.ACCESS_AUTH_DOMAIN && env.ACCESS_CUSTOMER_AUD) };
      return new Response(
        `window.AGROSEED_CONFIG = Object.freeze(${JSON.stringify(runtimeConfig)});`,
        { headers: { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } }
      );
    }

    if (pathname === "/account/login" && request.method === "GET") {
      const login = new URL("/api/v1/customer/login", url);
      const returnTo = url.searchParams.get("returnTo");
      if (returnTo) login.searchParams.set("returnTo", returnTo);
      return Response.redirect(login, 302);
    }

    if (pathname === "/account/logout" && request.method === "GET") {
      if (!env.ACCESS_AUTH_DOMAIN) return Response.redirect(new URL("/account", url), 302);
      const logout = new URL("/cdn-cgi/access/logout", url);
      logout.searchParams.set("returnTo", new URL("/account", url).href);
      return Response.redirect(logout, 302);
    }

    if (pathname.startsWith("/api/v1/customer/")) {
      return await handleCustomerAuth(request, env, pathname) || json({ error: "Customer API route not found." }, 404);
    }

    if (pathname.startsWith("/api/")) {
      const req = requestAdapter(request);
      const res = responseAdapter();
      const handled = await handleStoreRequest(req, res, pathname, env);
      return handled ? res.toResponse() : json({ error: "API route not found." }, 404);
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405, headers: { "Allow": "GET, HEAD" } });
    }

    if (isAppRoute(pathname)) {
      if (env.ASSETS) {
        const appRequest = new Request(new URL("/app", request.url), request);
        return env.ASSETS.fetch(appRequest);
      }
      return staticResponse(request, "/app.html");
    }

    if (env.ASSETS) return env.ASSETS.fetch(request);
    return staticResponse(request, pathname);
}

function secureResponse(response, request) {
  const headers = new Headers(response.headers);
  headers.set("Content-Security-Policy", "frame-ancestors 'none'");
  headers.set("Permissions-Policy", "camera=(), geolocation=(self), microphone=()");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-Frame-Options", "DENY");
  headers.set("X-Content-Type-Options", "nosniff");
  if (new URL(request.url).protocol === "https:") headers.set("Strict-Transport-Security", "max-age=31536000");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request, env) {
    return secureResponse(await handleRequest(request, env), request);
  }
};
