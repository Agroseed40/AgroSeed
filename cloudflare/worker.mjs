import { handleSandboxRequest } from "../backend/sandbox.mjs";
import { handleCustomerAuth } from "./customer-auth.mjs";
import { staticAssets } from "./static-assets.generated.mjs";

const appRoutes = new Set([
  "/", "/shop", "/cart", "/checkout", "/search", "/help", "/contact", "/shipping-returns",
  "/privacy", "/terms", "/guides", "/track-order"
]);

function isAppRoute(pathname) {
  return appRoutes.has(pathname) ||
    /^\/(category|brand|product|order|guides)\/[^/]+$/.test(pathname) ||
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
    "Cache-Control": "public, max-age=3600",
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
      yield Buffer.from(await request.arrayBuffer());
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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname.replace(/\/+$/, "") || "/";

    if (pathname === "/health" || pathname === "/api/v1/health") {
      return json({ status: "ok", service: "agroseed-worker", database: "D1", mode: "preview" });
    }

    if (pathname === "/runtime-config.js") {
      const runtimeConfig = { mode: "preview", demoMode: true, checkoutEnabled: false, customerAuthEnabled: Boolean(env.ACCESS_CUSTOMER_AUD) };
      return new Response(
        `window.AGROSEED_CONFIG = Object.freeze(${JSON.stringify(runtimeConfig)});`,
        { headers: { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } }
      );
    }

    if (pathname === "/account/login" && request.method === "GET") {
      return Response.redirect(new URL("/api/v1/customer/login", url), 302);
    }

    if (pathname.startsWith("/api/v1/customer/")) {
      return await handleCustomerAuth(request, env, pathname) || json({ error: "Customer API route not found." }, 404);
    }

    if (pathname.startsWith("/api/")) {
      const req = requestAdapter(request);
      const res = responseAdapter();
      const handled = await handleSandboxRequest(req, res, pathname, env);
      return handled ? res.toResponse() : json({ error: "API route not found." }, 404);
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405, headers: { "Allow": "GET, HEAD" } });
    }

    if (isAppRoute(pathname)) {
      return staticResponse(request, "/app.html");
    }

    return staticResponse(request, pathname);
  }
};
