import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { test } from "node:test";
import { handleCustomerAuth } from "../cloudflare/customer-auth.mjs";

test("customer sessions use the keys of the configured Access issuer", async t => {
  const domains = ["first.example.test", "second.example.test"];
  const pairs = domains.map(() => generateKeyPairSync("rsa", { modulusLength: 2048 }));
  const fetched = [];
  t.mock.method(globalThis, "fetch", async url => {
    const domain = new URL(url).hostname;
    fetched.push(domain);
    const key = pairs[domains.indexOf(domain)].publicKey.export({ format: "jwk" });
    return Response.json({ keys: [{ ...key, kid: "current" }] });
  });
  const profile = { id: "customer", email: "buyer@example.test", csrf_token: "fixture" };
  const DB = { prepare: () => ({ bind: () => ({ run: async () => ({}), first: async () => profile }) }) };
  const path = "/api/v1/customer/session";
  const encode = data => Buffer.from(JSON.stringify(data)).toString("base64url");
  for (const [index, domain] of domains.entries()) {
    const claims = { sub: profile.id, email: profile.email, iss: `https://${domain}`, aud: ["store"], exp: Date.now() / 1000 + 60 };
    const data = encode({ alg: "RS256", kid: "current" }) + "." + encode(claims);
    const signature = sign("sha256", Buffer.from(data), pairs[index].privateKey).toString("base64url");
    const request = new Request("https://store.example.test" + path, { headers: { "cf-access-jwt-assertion": data + "." + signature } });
    const env = { DB, ACCESS_AUTH_DOMAIN: domain, ACCESS_CUSTOMER_AUD: "store" };
    for (let i = 0; i < 2; i++) {
      const response = await handleCustomerAuth(request, env, path);
      assert.equal(response.status, 200);
      assert.equal((await response.json()).customer.email, profile.email);
    }
  }
  assert.deepEqual(fetched, domains);
});
