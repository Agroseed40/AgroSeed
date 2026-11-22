import assert from "node:assert/strict";
import { test } from "node:test";
import worker from "../cloudflare/worker.mjs";

test("Worker adds baseline security headers to API responses", async () => {
  const env = { DB: { prepare: () => ({ first: async () => ({ revision: 1 }) }) } };
  const response = await worker.fetch(new Request("https://agroseed.example/health"), env);

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-security-policy"), "frame-ancestors 'none'");
  assert.equal(response.headers.get("permissions-policy"), "camera=(), geolocation=(), microphone=()");
  assert.equal(response.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(response.headers.get("strict-transport-security"), "max-age=31536000");
});

test("Worker does not send HSTS over HTTP", async () => {
  const env = { DB: { prepare: () => ({ first: async () => ({ revision: 1 }) }) } };
  const response = await worker.fetch(new Request("http://agroseed.example/health"), env);

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("strict-transport-security"), null);
});

test("Worker preserves storefront document responses while adding headers", async () => {
  const html = "<!doctype html><title>AgroSeed</title>";
  const env = { ASSETS: { fetch: async () => new Response(html, { headers: { "content-type": "text/html" } }) } };
  const response = await worker.fetch(new Request("https://agroseed.example/"), env);

  assert.equal(response.status, 200);
  assert.match(await response.text(), /AgroSeed/);
  assert.equal(response.headers.get("content-type"), "text/html");
  assert.equal(response.headers.get("content-security-policy"), "frame-ancestors 'none'");
});
