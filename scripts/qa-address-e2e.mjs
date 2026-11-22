import { chromium } from "playwright";

const url = "https://agroseed-address-qa-temp.durgesh5757g.workers.dev/account/addresses";
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
const network = [], errors = [];
page.on("request", r => { if (r.url().includes("/api/v1/customer/addresses")) network.push({kind:"request",method:r.method(),url:r.url()}); });
page.on("response", r => { if (r.url().includes("/api/v1/customer/addresses")) network.push({kind:"response",status:r.status(),url:r.url()}); });
page.on("pageerror", e => errors.push(String(e)));
page.on("console", m => { errors.push(m.type()+": "+m.text()); });
await page.addInitScript(() => {
 window.__submitEvents = 0;
 document.addEventListener("submit", () => window.__submitEvents++, true);
 document.addEventListener("invalid", e => { (window.__invalidEvents||=[]).push({name:e.target.name,message:e.target.validationMessage}); }, true);
});
await page.goto(url,{waitUntil:"domcontentloaded",timeout:30000});
await page.locator("#address-form").waitFor({timeout:25000});
const data={name:"QA Test User",phone:"9876543210",line1:"123 Test Lane",line2:"QA landmark",city:"Bhopal",state:"Madhya Pradesh",pincode:"462001"};
for(const [key,value] of Object.entries(data))await page.locator('#address-form [name="'+key+'"]').fill(value);
const before=await page.evaluate(() => {
 const f=document.querySelector("#address-form");
 return {valid:f.checkValidity(),fields:[...f.elements].filter(el=>el.name).map(el=>({name:el.name,required:el.required,value:el.value,valid:el.validity?.valid,message:el.validationMessage})),submitButton:f.querySelector(".btn-primary")?.outerHTML.slice(0,500)};
});
const pre = await page.evaluate(() => ({
  isForm: document.querySelector("#address-form") instanceof HTMLFormElement,
  saving: document.querySelector("#address-form").dataset.saving || null,
  readFormType:typeof readForm,
  requestSubmitType:typeof document.querySelector("#address-form").requestSubmit,
  csrfValue:typeof csrf !== "undefined" ? String(csrf).slice(0,12) : null,
  customerSessionType: typeof customerSession,
  account:typeof customerSession!=="undefined" ? !!customerSession : null
}));
console.log("QA_PRE="+JSON.stringify(pre));
await page.locator("#address-form .btn-primary").click();
await page.waitForTimeout(2000);
const after=await page.evaluate(() => ({url:location.href,submitEvents:window.__submitEvents,button:document.querySelector("#address-form .btn-primary")?.outerHTML,formDataset:document.querySelector("#address-form")?.dataset.saving||null,invalidEvents:window.__invalidEvents||[],formPresent:!!document.querySelector("#address-form"),status:document.querySelector("[data-address-status]")?.textContent,toast:[...document.querySelectorAll(".toast")].map(x=>x.textContent),addressText:document.querySelector(".account-content")?.innerText.slice(-1000)}));
console.log("QA_RESULT="+JSON.stringify({before,after,network,errors}));
await browser.close();
if(!network.some(x=>x.kind==="request"&&x.method==="POST"))process.exitCode=2;
