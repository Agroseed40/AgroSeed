import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import worker, { lookupIndianPin } from "../cloudflare/worker.mjs";

test("PIN lookup returns sanitized district and state", async () => {
  let calls=0;
  const fetchPostal = async url => {
    calls++;
    assert.match(url, /^https:\/\/api\.postalpincode\.in\/pincode\/462001$/);
    return new Response(JSON.stringify([{
      Status:"Success",
      PostOffice:[{District:"Bhopal",State:"Madhya Pradesh",Name:"Bhopal H.O."}]
    }]),{status:200,headers:{"Content-Type":"application/json"}});
  };
  const response=await lookupIndianPin("462001",fetchPostal);
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{pincode:"462001",city:"Bhopal",state:"Madhya Pradesh"});
  assert.equal(calls,1);
});

test("PIN lookup rejects invalid PIN without upstream request", async () => {
  const response=await lookupIndianPin("bad",()=>{throw new Error("should not fetch");});
  assert.equal(response.status,400);
});

test("PIN lookup preserves manual entry during provider failure", async () => {
  const response=await lookupIndianPin("462099",async ()=>new Response("unavailable",{status:503}));
  assert.equal(response.status,503);
  assert.match((await response.json()).error,/manually/i);
});

test("PIN lookup rejects postal records without district/state", async () => {
  const response=await lookupIndianPin("462098",async ()=>new Response(JSON.stringify([
    {Status:"Success",PostOffice:[{Name:"Only office name"}]}
  ]),{status:200}));
  assert.equal(response.status,503);
});

test("Worker allows opt-in geolocation but blocks camera and microphone", async () => {
  const response=await worker.fetch(new Request("https://example.com/runtime-config.js"),{});
  assert.equal(response.status,200);
  assert.equal(response.headers.get("Permissions-Policy"),"camera=(), geolocation=(self), microphone=()");
});

test("Account and checkout address controls remain wired and same-origin saves use CSRF", async () => {
  const source=await readFile(new URL("../public/app.js",import.meta.url),"utf8");
  const helper=await readFile(new URL("../public/address-lookup.js",import.meta.url),"utf8");
  const html=await readFile(new URL("../public/app.html",import.meta.url),"utf8");
  assert.equal(source.includes('if(!justReturned&&localStorage.getItem(customerAuthKey)!=="1")'),false);
  assert.equal((source.match(/window\.AgroSeedAddressControls\(\)/g)||[]).length,2);
  assert.match(helper,/navigator\.geolocation\.getCurrentPosition/);
  assert.match(helper,/x-agroseed-csrf/);
  assert.match(helper,/data-save-checkout-address/);
  assert.match(html,/\/address-lookup\.js/);
});

test("Both browser scripts parse cleanly", () => {
 for(const file of ["public/app.js","public/address-lookup.js"]){
  const checked=spawnSync(process.execPath,["--check",file],{encoding:"utf8"});
  assert.equal(checked.status,0,`${file} syntax check failed: ${checked.stderr}`);
 }
});
