const $ = (s, root = document) => root.querySelector(s);
const app = $("#app");
const esc = (s = "") => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money = n => new Intl.NumberFormat("en-IN", { style:"currency", currency:"INR", maximumFractionDigits:2 }).format((Number(n)||0)/100);
const slug = s => String(s||"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
const icons = {Seeds:"🌱","Plant nutrition":"🌿","Crop protection":"🛡️","Farm tools":"🧤",Irrigation:"💧","Organic growing":"🍃","Nursery supplies":"🪴"};
let csrf = "", importRows = [], rawImportRows = [], importErrors = [], pickedVariant = "", customerSession = null, customerCartHydrated = false;
let storefrontSettings = {}, storefrontOffers = [];
const cartKey = "agroseed-cart-v1", cartIdKey="agroseed-cart-id-v1", cartUpdatedKey="agroseed-cart-updated-v1", tokenKey = "agroseed-order-tokens-v1", languageKey = "agroseed-language";
const couponKey = "agroseed-coupon-v1", addressBookKey = "agroseed-addresses-v1", profileKey = "agroseed-profile-v1";
function addressBook(){try{const rows=JSON.parse(localStorage.getItem(addressBookKey)||"null");if(Array.isArray(rows))return rows;const old=JSON.parse(localStorage.getItem("agroseed-address")||"{}");if(old.name){const row={...old,id:"legacy-address",isDefault:true};localStorage.setItem(addressBookKey,JSON.stringify([row]));return [row];}}catch{}return [];}
function saveAddressBook(rows){localStorage.setItem(addressBookKey,JSON.stringify(rows));const primary=rows.find(x=>x.isDefault)||rows[0]||{};localStorage.setItem("agroseed-address",JSON.stringify(primary));}
function savedProfile(){try{return JSON.parse(localStorage.getItem(profileKey)||"{}");}catch{return {};}}
const language = () => localStorage.getItem(languageKey) || storefrontSettings.language || "en";
const say = (en, hi) => language()==="hi" ? hi : en;
const hindiCopy = {
 "PREVIEW STORE":"पूर्वावलोकन स्टोर","Sample products and prices · Checkout creates a local demo order only.":"नमूना उत्पाद और कीमतें · चेकआउट केवल एक डेमो ऑर्डर बनाता है।",
 "Account":"खाता","Bag":"कार्ट","Shop all":"सभी उत्पाद","Seeds":"बीज","Plant nutrition":"पौधों का पोषण","Crop protection":"फसल सुरक्षा","Farm tools":"खेती के औज़ार","Irrigation":"सिंचाई","Track order":"ऑर्डर ट्रैक करें","Search":"खोजें","Search products":"उत्पाद खोजें",
 "GROW WELL · LIVE WELL":"अच्छी खेती · बेहतर जीवन","Good growing":"बेहतर खेती","starts":"शुरू होती है","here.":"यहाँ से।","Farm products":"कैटलॉग देखें","Get growing advice":"खेती की सलाह लें","Seeds and farm supplies":"चुने हुए कृषि उत्पाद","Compare pack sizes and prices":"उत्पाद की साफ़ जानकारी","Hindi & English":"हिंदी और अंग्रेज़ी","FIND YOUR FIELD":"अपनी ज़रूरत चुनें","Shop by category":"श्रेणी के अनुसार खरीदें","Start with what your crop needs today.":"आज अपनी फसल की ज़रूरत से शुरुआत करें।","Browse products":"उत्पाद देखें","FARMER PICKS":"आपके लिए चुने गए","Farm products":"कैटलॉग देखें","Browse products available from AgroSeed.":"पूर्वावलोकन के नमूने। कर्मचारी एडमिन पैनल में उत्पाद संभाल सकते हैं।","Shop all":"सभी उत्पाद","Need a hand choosing?":"चुनने में मदद चाहिए?","Tell us what you’re growing and we’ll point you to the right place.":"आप क्या उगा रहे हैं, हमें बताइए — हम सही उत्पाद खोजने में मदद करेंगे।","Talk to AgroSeed":"AgroSeed से बात करें","Good value":"अच्छा मूल्य","Details":"विवरण","Add to cart":"कार्ट में जोड़ें","Add to bag":"कार्ट में जोड़ें","available":"उपलब्ध","Out of stock":"स्टॉक में नहीं","Search seeds, nutrition, tools…":"बीज, पोषण और औज़ार खोजें…",
 "Shop all products":"सभी उत्पाद","Results for":"इनके परिणाम","Categories":"श्रेणियाँ","Brands":"ब्रांड","Sort by":"क्रमबद्ध करें","Featured":"विशेष","Price: low to high":"कम कीमत पहले","Price: high to low":"ज़्यादा कीमत पहले","Name":"नाम","products":"उत्पाद","No matches yet":"अभी कोई उत्पाद नहीं मिला","Try another search or browse the full catalog.":"दूसरी खोज करें या पूरा कैटलॉग देखें।","Clear filters":"फ़िल्टर हटाएँ","Product not found":"उत्पाद नहीं मिला","Browse catalog":"कैटलॉग देखें","Your bag":"आपका कार्ट","Continue browsing":"खरीदारी जारी रखें","Order preview":"ऑर्डर पूर्वावलोकन","Estimated subtotal":"अनुमानित उप-योग","Delivery":"डिलीवरी","Calculated at checkout":"चेकआउट पर गणना होगी","Estimated total":"अनुमानित कुल","Continue to checkout":"चेकआउट पर जाएँ","No payment is collected in this.":"इस पूर्वावलोकन स्टोर में भुगतान नहीं लिया जाता।",
 "Checkout preview":"चेकआउट पूर्वावलोकन","Delivery address":"डिलीवरी का पता","Full name *":"पूरा नाम *","Mobile number *":"मोबाइल नंबर *","Address *":"पता *","Village / city *":"गाँव / शहर *","State *":"राज्य *","PIN code *":"पिन कोड *","Promotion code":"प्रमोशन कोड","Delivery notes":"डिलीवरी के लिए नोट","Review preview total":"पूर्वावलोकन कुल देखें","Create sandbox preview order":"डेमो ऑर्डर बनाएँ","Contact AgroSeed":"AgroSeed से संपर्क करें","Send message":"संदेश भेजें","Help centre":"सहायता केंद्र","Your account":"आपका खाता","Overview":"अवलोकन","My orders":"मेरे ऑर्डर","Addresses":"पते","Sign in":"साइन इन","Track an order":"ऑर्डर ट्रैक करें","Track your order":"अपना ऑर्डर ट्रैक करें","Order number":"ऑर्डर नंबर","Private tracking code":"निजी ट्रैकिंग कोड","Find order":"ऑर्डर खोजें","Shipping & returns":"शिपिंग और रिटर्न","Privacy":"गोपनीयता","Terms of service":"सेवा की शर्तें","Contact us":"संपर्क करें","Back to home":"मुखपृष्ठ पर जाएँ","Continue":"जारी रखें"
};
Object.assign(hindiCopy, {
 "Profile details":"प्रोफ़ाइल विवरण","Full name":"पूरा नाम","Email":"ईमेल","Mobile number":"मोबाइल नंबर","Username":"उपयोगकर्ता नाम","Customer ID":"ग्राहक आईडी","Email verified":"ईमेल सत्यापित","Mobile verified":"मोबाइल सत्यापित","Date of birth":"जन्म तिथि","Family name":"उपनाम","First name":"पहला नाम","Gender":"लिंग","Language":"भाषा","Middle name":"मध्य नाम","Nickname":"उपनाम","Preferred username":"पसंदीदा उपयोगकर्ता नाम","Profile image":"प्रोफ़ाइल छवि","Profile updated":"प्रोफ़ाइल अपडेट","Time zone":"समय क्षेत्र","Website":"वेबसाइट","Your email is verified when you sign in.":"ये विवरण आपके Cloudflare ईमेल साइन-इन से जुड़े हैं।","No additional profile details.":"Cloudflare ने इस खाते के लिए अतिरिक्त जानकारी नहीं दी है।","Yes":"हाँ","No":"नहीं",
 "Farm supplies for your season":"इस मौसम की खेती के लिए ज़रूरी सामान",
 "Find seeds, plant nutrition, crop care, tools and irrigation supplies. Compare pack sizes and prices before adding products to your bag.":"बीज, पौध पोषण, फसल सुरक्षा, औज़ार और सिंचाई का सामान देखें। कार्ट में जोड़ने से पहले पैक और कीमतों की तुलना करें।",
 "Browse the catalog":"उत्पाद देखें",
 "Search by product, category or crop need.":"उत्पाद, श्रेणी या फसल की ज़रूरत से खोजें।",
 "SPECIAL PRICES":"विशेष कीमतें",
 "Offers on farm supplies":"खेती के सामान पर ऑफ़र",
 "Compare the listed price with MRP. ":"सूचीबद्ध कीमत और MRP की तुलना करें। पूर्वावलोकन कीमतों की बिक्री से पहले पुष्टि ज़रूरी है।",
 "See all products →":"सभी उत्पाद देखें →",
 "Browse everything →":"सब कुछ देखें →",
 "Browse products ↗":"उत्पाद देखें ↗",
 "Talk to AgroSeed →":"AgroSeed से बात करें →",
 "⌕ Search":"⌕ खोजें",
 "Home":"मुख्य पृष्ठ",
 "Shop":"दुकान",
 "AgroSeed catalog product.":"AgroSeed के पूर्वावलोकन कैटलॉग का उत्पाद।",
 "Product details are currently unavailable.":"पूर्वावलोकन कैटलॉग की सूची। उत्पाद की जानकारी की पुष्टि AgroSeed करेगा।"
});
Object.assign(hindiCopy, {
 "Browse the AgroSeed catalog.":"AgroSeed का कैटलॉग देखें।",
 "All products":"सभी उत्पाद","Help":"सहायता","Information":"जानकारी","Terms":"नियम और शर्तें",
 "Preview environment":"पूर्वावलोकन वातावरण","Demo orders do not accept payments.":"डेमो ऑर्डर में भुगतान स्वीकार नहीं किया जाता।",
 "© AgroSeed · Preview environment":"© AgroSeed · पूर्वावलोकन वातावरण",
 "Shop farm supplies, compare pack sizes and see current offers.":"खेती का सामान देखें, पैक और कीमतों की तुलना करें और मौजूदा ऑफ़र जानें।"
});
function translateCustomer() {
 const walker=document.createTreeWalker(app,NodeFilter.SHOW_TEXT);let node;
 while((node=walker.nextNode())) {const raw=node.nodeValue.trim();if(hindiCopy[raw])node.nodeValue=node.nodeValue.replace(raw,hindiCopy[raw]);else node.nodeValue=node.nodeValue.replace(/\b(\d+) products\b/g,"$1 उत्पाद");}
 app.querySelectorAll(".stock-note,#detail-stock").forEach(el=>{const value=el.textContent.trim(),match=value.match(/^(.*?)(?:\s*·\s*)?(\d+)\s+available$/i);if(match)el.textContent=`${match[1].replace(/\bpack\b/gi,"पैक").trim()}${match[1].trim()?" · ":""}${match[2]} उपलब्ध`;else if(value==="Currently unavailable")el.textContent="अभी उपलब्ध नहीं";});
 app.querySelectorAll(".variant-choice label,.cart-line p").forEach(el=>{el.childNodes.forEach(child=>{if(child.nodeType===Node.TEXT_NODE)child.nodeValue=child.nodeValue.replace(/\bpack\b/gi,"पैक");});});
 app.querySelectorAll("input[placeholder],textarea[placeholder],button[aria-label],a[aria-label]").forEach(el=>{for(const attr of ["placeholder","aria-label"]){const value=el.getAttribute(attr);if(value&&hindiCopy[value])el.setAttribute(attr,hindiCopy[value]);}});
}
async function api(url, options={}) {
  const headers = { "X-Requested-With": "XMLHttpRequest", ...(options.body ? {"Content-Type":"application/json"}:{}), ...(options.headers||{}) };
  if (csrf && options.method && options.method !== "GET") headers["x-agroseed-csrf"] = csrf;
  const res = await fetch(url, { credentials:"same-origin", ...options, headers });
  let data={}; try { data=await res.json(); } catch {}
  if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status})`), { status: res.status });
  if (!res.headers.get("content-type")?.includes("application/json")) throw Object.assign(new Error("Sign in again to continue."), { status: 401 });
  return data;
}
const toast = (message, error=false) => { const n=document.createElement("div"); n.className="toast"+(error?" error":""); n.textContent=message; $("#toast-region").append(n); setTimeout(()=>n.remove(),4300); };
const cart = () => { try { const rows=JSON.parse(localStorage.getItem(cartKey)||"[]"); return Array.isArray(rows)?rows:[]; } catch { return []; } };
async function migrateLegacyCart(){try{const raw=JSON.parse(localStorage.getItem(cartKey)||"null");if(!raw||Array.isArray(raw)||typeof raw!=="object")return null;const entries=Object.entries(raw).filter(([,quantity])=>Number.isFinite(Number(quantity))&&Number(quantity)>0);if(!entries.length)return [];const {items=[]}=await api("/api/v1/products?limit=500");const rows=[];for(const [key,value] of entries){const [id,...sizeParts]=String(key).split("::");let size="";try{size=decodeURIComponent(sizeParts.join("::"));}catch{size=sizeParts.join("::");}const product=items.find(item=>Number(item.id)===Number(id));if(!product)continue;const variant=(product.variants||[]).find(item=>size&&item.pack===size)|| (product.variants||[]).find(item=>item.active!==false&&item.stock>0);if(!variant)continue;const quantity=Math.min(99,Math.floor(Number(value)));if(quantity>0)rows.push({sku:variant.sku,quantity});}return rows;}catch{return null;}}
function guestCartId(){try{let id=localStorage.getItem(cartIdKey);if(!id){id=crypto.randomUUID().replaceAll("-","");localStorage.setItem(cartIdKey,id);}return id;}catch{return crypto.randomUUID().replaceAll("-","");}}
function saveCartLocal(rows,updatedAt=Date.now()){localStorage.setItem(cartKey,JSON.stringify(rows));localStorage.setItem(cartUpdatedKey,String(typeof updatedAt==="number"?updatedAt:Date.parse(updatedAt)||Date.now()));}
async function syncGuestCart(rows){try{const response=await fetch("/api/v1/cart",{method:"PUT",credentials:"same-origin",headers:{"Content-Type":"application/json","x-agroseed-cart-id":guestCartId()},body:JSON.stringify({items:rows})});if(!response.ok)throw new Error(`Cart sync failed (${response.status}).`);return true;}catch{return false;}}
let cartHydrated=false;
async function hydrateGuestCart(){if(cartHydrated)return;cartHydrated=true;try{const id=guestCartId(),legacy=await migrateLegacyCart();let local=cart();if(legacy!==null){local=legacy;saveCartLocal(local);await syncGuestCart(local);return;}const localStamp=Number(localStorage.getItem(cartUpdatedKey)||0);const response=await fetch("/api/v1/cart",{credentials:"same-origin",headers:{"x-agroseed-cart-id":id},signal:AbortSignal.timeout(2500)}),remote=response.ok?await response.json():null;if(remote?.updatedAt&&Array.isArray(remote.items)){if(localStamp>Date.parse(remote.updatedAt)){await syncGuestCart(local);return;}saveCartLocal(remote.items,remote.updatedAt);return;}if(local.length)await syncGuestCart(local);}catch{}}
async function mergeCustomerCartWithGuest(){if(!customerSession)return true;try{const result=await api("/api/v1/customer/cart/merge",{method:"POST",body:JSON.stringify({items:cart()}),signal:AbortSignal.timeout(8000)});saveCartLocal(result.items||[]);await syncGuestCart([]);return true;}catch{return false;}}
const customerAuthKey="agroseed-cloudflare-auth-v1";
async function hydrateCustomerCart(){if(customerCartHydrated)return;customerCartHydrated=true;if(!window.AGROSEED_CONFIG?.customerAuthEnabled||localStorage.getItem(customerAuthKey)!=="1")return;try{const current=await api("/api/v1/customer/session",{signal:AbortSignal.timeout(4000)});customerSession=current.customer||null;csrf=current.csrf||"";if(customerSession){const remote=await api("/api/v1/customer/cart",{signal:AbortSignal.timeout(4000)});saveCartLocal(remote.items||[]);}else localStorage.removeItem(customerAuthKey);}catch(error){if(error.status===401||error.status===403){customerSession=null;csrf="";localStorage.removeItem(customerAuthKey);saveCartLocal([]);}else customerCartHydrated=false;}}
async function syncCustomerCart(rows){if(!customerSession)return true;try{await api("/api/v1/customer/cart",{method:"PUT",body:JSON.stringify({items:rows}),signal:AbortSignal.timeout(8000)});return true;}catch{return false;}}
const saveCart = async rows => { saveCartLocal(rows); return customerSession ? syncCustomerCart(rows) : syncGuestCart(rows); };
const cartCount = () => cart().reduce((n,x)=>n+Number(x.quantity||0),0);
const prodName = p => language()==="hi" ? (p.name||p.nameEn) : (p.nameEn||p.name);
function productImage(p, large=false) {
  const imageEntry=p.images?.[0],image=typeof imageEntry==="string"?imageEntry:imageEntry?.url,imageAlt=p.imageAlt?.[0]||imageEntry?.alt||prodName(p);
  return image ? `<img src="${esc(image)}" alt="${esc(imageAlt)}">` : `<span class="product-emoji">${icons[p.categoryEn]||"🌾"}</span>`;
}
function productCard(p) {
  const v=(p.variants||[]).find(x=>x.active!==false) || p.variants?.[0] || {sku:p.sku,pricePaise:p.pricePaise,mrpPaise:p.mrpPaise,stock:p.stock,pack:"1 pack"};
  return `<article class="product-card"><a href="/product/${esc(p.slug)}"><div class="product-visual">${p.featured?'<span class="product-badge">Featured</span>':(v.mrpPaise>v.pricePaise?'<span class="product-badge">Good value</span>':'')}${productImage(p)}</div><div class="product-card-body"><div class="product-brand">${esc(p.brandEn||p.brand)}</div><b class="product-title">${esc(prodName(p))}</b><div class="product-category">${esc(language()==="hi"?p.category:p.categoryEn)}</div><div class="product-price"><b>${money(v.pricePaise)}</b>${v.mrpPaise>v.pricePaise?`<del>${money(v.mrpPaise)}</del>`:""}</div><div class="stock-note">${v.stock>0?`${esc(v.pack)} · ${v.stock} available`:"Currently unavailable"}</div></div></a><div class="product-actions"><a class="btn btn-secondary" href="/product/${esc(p.slug)}">Details</a><button class="btn btn-primary" data-add="${esc(v.sku)}" ${v.stock<1?"disabled":""}>Add to cart</button></div></article>`;
}
function header() {
 return `<header class="site-header"><div class="header-main"><button class="menu-button" data-menu aria-label="Menu">☰</button><a class="logo" href="/"><span class="logo-mark"><img src="${esc(storefrontSettings.brandLogo || "/agroseed-mark-v2.png")}" alt="" aria-hidden="true"></span><span>${esc(storefrontSettings.storeName || "AgroSeed")}</span></a><form class="searchbar" action="/search"><label class="sr-only" for="site-search">Search products</label><input id="site-search" type="search" name="q" placeholder="Search seeds, nutrition, tools…"><button>⌕ Search</button></form><div class="header-actions"><a class="header-link" href="/account">Account</a><a class="cart-link" href="/cart">Bag <span class="cart-count">${cartCount()}</span></a></div></div><div class="nav-row"><nav class="nav-links"><a href="/shop">Shop all</a><a href="/category/seeds">Seeds</a><a href="/category/plant-nutrition">Plant nutrition</a><a href="/category/crop-protection">Crop protection</a><a href="/category/farm-tools">Farm tools</a><a href="/category/irrigation">Irrigation</a><span class="nav-spacer"></span><button class="language-btn" data-language>${language()==="en"?"हिन्दी":"English"}</button></nav></div></header>`;
}
function footer(){return `<footer class="site-footer"><div class="container"><div class="footer-grid"><div class="footer-brand"><a class="logo" href="/"><span class="logo-mark"><img src="${esc(storefrontSettings.brandLogo || "/agroseed-mark-v2.png")}" alt="" aria-hidden="true"></span><span>${esc(storefrontSettings.storeName || "AgroSeed")}</span></a><p>${esc(storefrontSettings.storeAbout||"Shop farm supplies, compare pack sizes and see current offers.")}</p></div><div class="footer-col"><h3>Shop</h3><a href="/shop">All products</a><a href="/category/seeds">Seeds</a><a href="/category/plant-nutrition">Plant nutrition</a></div><div class="footer-col"><h3>Help</h3><a href="/help">Help centre</a><a href="/contact">Contact us</a></div><div class="footer-col"><h3>Information</h3><a href="/shipping-returns">Shipping & returns</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a></div></div><div class="footer-bottom"><span>© ${esc(storefrontSettings.storeName || "AgroSeed")}</span></div></div></footer>`;}
function offerStrip(){if(!storefrontOffers.length)return "";return `<section class="deal-strip" aria-label="Current coupon offers"><div class="deal-strip-head"><b>Deals for your farm</b><a href="/shop">Shop products →</a></div><div class="deal-list">${storefrontOffers.map(offer=>`<a class="deal-card" href="/shop?coupon=${encodeURIComponent(offer.code)}"><span class="deal-mark">OFFER</span><b>${offer.type==="percent"?`${esc(offer.value)}% off`:`${money(offer.value)} off`}</b><span>Code <strong>${esc(offer.code)}</strong></span>${offer.minSubtotalPaise?`<small>On orders above ${money(offer.minSubtotalPaise)}</small>`:""}</a>`).join("")}</div></section>`;}
function discountShelf(items){const discounted=items.filter(p=>(p.variants||[]).some(v=>v.active!==false&&v.mrpPaise>v.pricePaise)).slice(0,8);if(!discounted.length)return "";return `<section class="section sale-shelf"><div class="section-head"><div><p class="eyebrow">SPECIAL PRICES</p><h2>Offers on farm supplies</h2><p>Compare the listed price with MRP. </p></div><a class="text-link" href="/shop">See all products →</a></div><div class="product-grid">${discounted.map(productCard).join("")}</div></section>`;}
const bottomNavItems = [
 {key:"home", href:"/", field:"navHome", en:"Home", hi:"मुखपृष्ठ"},
 {key:"shop", href:"/categories", field:"navCategories", en:"Categories", hi:"श्रेणियाँ"},
 {key:"search", href:"/search", field:"navSearch", en:"Search", hi:"खोज"},
 {key:"bag", href:"/cart", field:"navCart", en:"Cart", hi:"कार्ट"},
 {key:"account", href:"/account", field:"navAccount", en:"Account", hi:"खाता"}
];
function bottomNavLabel(item, settings){
 return settings[item.field] || say(item.en,item.hi);
}
function bottomNavIcon(key){
 return `<span class="store-nav-icon store-nav-icon-${key}" aria-hidden="true"><i></i></span>`;
}
function bottomNavLink(item, current, settings = {}){
 return `<a href="${item.href}"${current?' aria-current="page"':''}>${bottomNavIcon(item.key)}<small>${esc(bottomNavLabel(item,settings))}</small></a>`;
}
function adminNavigationFields(settings){
 return `<fieldset class="span-2 admin-nav-fields"><legend>Mobile navigation</legend>
   <div class="admin-nav-preview">${bottomNavItems.map(item => `<label>
     ${bottomNavIcon(item.key)}<b>${item.en}</b>
     <input class="control" name="${item.field}" value="${esc(settings[item.field]||"")}" maxlength="20" placeholder="${item.en}">
   </label>`).join("")}</div>
   <small>Leave a label blank to use the default in the shopper’s language.</small>
 </fieldset>`;
}
function customerBottomNav(){
 const path=decodeURI(location.pathname.replace(/\/+$/,""))||"/";
 const active={home:path==="/",shop:path==="/categories"||path==="/shop"||path.startsWith("/category/")||path.startsWith("/brand/")||path.startsWith("/product/"),search:path==="/search",bag:path==="/cart"||path==="/checkout"||path.startsWith("/order/"),account:path==="/account"||path.startsWith("/account/")};
 return `<nav class="customer-bottom-nav" aria-label="Main navigation">${bottomNavItems.map(item => bottomNavLink(item,active[item.key],storefrontSettings)).join("")}</nav>`;
}
const wrap = (content, cls="") => `${header()}<main class="site-main ${cls}">${content}</main>${footer()}${customerBottomNav()}`;
function pageTitle(title,sub="",action=""){return `<div class="page-title"><div><h1>${title}</h1>${sub?`<p>${sub}</p>`:""}</div>${action}</div>`;}
function updatePageMetadata(path){
 const storeName=String(storefrontSettings.storeName||"AgroSeed").trim()||"AgroSeed",title=app.querySelector("main h1")?.textContent.trim()||`${storeName}`,description=(app.querySelector(".page-title p")||app.querySelector(".detail-copy>p")||app.querySelector("main p"))?.textContent.trim().replace(/\s+/g," ").slice(0,160)||"Browse farm and garden essentials in the AgroSeed catalog.",pageTitleText=`${title} | ${storeName}`;
 document.title=pageTitleText;document.documentElement.lang=language()==="hi"?"hi":"en";
 const setMeta=(kind,key,value)=>{let node=document.head.querySelector(`meta[${kind}="${key}"]`);if(!value){node?.remove();return;}if(!node){node=document.createElement("meta");node.setAttribute(kind,key);document.head.append(node);}node.content=value;};
 setMeta("name","description",description);setMeta("property","og:site_name",storeName);setMeta("property","og:title",pageTitleText);setMeta("property","og:description",description);setMeta("property","og:type",path.startsWith("/product/")?"product":"website");setMeta("name","twitter:title",pageTitleText);setMeta("name","twitter:description",description);
 const base=String(storefrontSettings.publicDomain||"").trim().replace(/\/+$/,"");let canonical=document.head.querySelector('link[rel="canonical"]');if(base){if(!canonical){canonical=document.createElement("link");canonical.rel="canonical";document.head.append(canonical);}const route=location.pathname.replace(/\/+$/,"")||"/";canonical.href=`${base}${route}`;setMeta("property","og:url",canonical.href);}else{canonical?.remove();setMeta("property","og:url","");}
 const imageSource=path.startsWith("/product/")?app.querySelector(".detail-image img")?.getAttribute("src"):"";let imageUrl="";if(imageSource){try{imageUrl=new URL(imageSource,`${base||location.origin}/`).href;}catch{}}
 setMeta("property","og:image",imageUrl);setMeta("property","og:image:alt",imageUrl?(app.querySelector(".detail-image img")?.alt||title):"");setMeta("name","twitter:card",imageUrl?"summary_large_image":"summary");setMeta("name","twitter:image",imageUrl);
}
async function home(){
 const data = await api("/api/v1/products?limit=48").catch(() => null);
 const products = data?.items || [];
 const categories = data?.categories || [];
 const settings = storefrontSettings;
 const categoryLinks = categories.length
   ? categories.map(category => ({
       name: language()==="hi" ? category.name : category.nameEn,
       url: "/category/" + encodeURIComponent(category.slug || slug(category.nameEn)),
       icon: browseCategoryArt(category)
     }))
   : [{ name: say("Browse catalog", "कैटलॉग देखें"), url: "/shop", icon: "🌱" }];
 const featured = [...products].sort((a,b) => Number(Boolean(b.featured))-Number(Boolean(a.featured)));
 const banner = (title, detail, href, symbol, theme) => `
   <a class="field-banner ${theme}" href="${href}">
     <span><strong>${esc(title)}</strong><small>${esc(detail)}</small></span>
     <span class="field-banner-art" aria-hidden="true">${symbol}</span>
     <span class="field-banner-arrow" aria-hidden="true">↗</span>
   </a>`;
 return wrap(`
   <section class="field-hero">
     <div class="container">
       <div class="field-intro"><div>
         ${settings.homeHeroEyebrow ? `<p>${esc(settings.homeHeroEyebrow)}</p>` : ""}
         <h1>${esc(settings.homeHeroHeadline || say("Find what your farm needs", "खेती का ज़रूरी सामान"))}</h1>
         <p>${esc(settings.homeHeroBody || say("Seeds, crop care and farm supplies.", "बीज, फसल सुरक्षा और कृषि सामग्री।"))}</p>
       </div><a href="/shop">${esc(settings.homeHeroPrimaryCta || say("Shop all", "सभी उत्पाद"))} ↗</a></div>
       <form class="home-search" action="/search" role="search"><label class="sr-only" for="home-search">Search the AgroSeed catalog</label><span aria-hidden="true">⌕</span><input id="home-search" type="search" name="q" placeholder="Search products, crops, brands or SKU"><button class="btn btn-primary">Search</button></form>
       <nav class="field-categories" aria-label="Shop categories">
         ${categoryLinks.map(({name,url,icon})=>`<a href="${url}"><span aria-hidden="true">${icon}</span><b>${esc(name)}</b></a>`).join("")}
       </nav>
       ${settings.homeHeroNote ? `<p class="field-note">${esc(settings.homeHeroNote)}</p>` : ""}
     </div>
   </section>
   <div class="container field-shelves">
     ${offerStrip()}
     <div class="field-banners">
       ${banner(settings.homeBannerTitle || say("Explore farm supplies", "कृषि सामग्री देखें"), settings.homeBannerText || say("Browse the AgroSeed catalog", "AgroSeed कैटलॉग देखें"), "/shop", browseImage(settings.homeBannerImage,"🌾"), "field-gold")}
       ${banner(settings.homeHelpTitle || say("Find the right supplies", "सही कृषि सामग्री चुनें"), settings.homeHelpText || say("Ask AgroSeed for help", "AgroSeed से मदद लें"), "/contact", browseImage(settings.homeHelpImage,"🌿"), "field-mint")}
     </div>
     <section class="field-products">
       <div class="section-head"><h2>${esc(settings.homeProductsTitle || say("Shop farm products", "कृषि उत्पाद देखें"))}</h2><a class="text-link" href="/shop">${say("View all →", "सभी देखें →")}</a></div>
       ${featured.length ? `<div class="product-grid">${featured.slice(0,12).map(productCard).join("")}</div>` :
         empty(data ? say("No products listed yet", "अभी कोई उत्पाद सूचीबद्ध नहीं है") : say("Catalog unavailable", "कैटलॉग उपलब्ध नहीं है"),
           data ? say("Check back for new listings.", "नए उत्पादों के लिए फिर आएँ।") : say("Please try again shortly.", "कुछ देर बाद फिर कोशिश करें।"))}
     </section>
   </div>`, "agro-home");
}
function empty(title,desc,button="") {return `<div class="empty-state"><div class="empty-icon">🌱</div><h2>${esc(title)}</h2><p>${esc(desc)}</p>${button}</div>`;}
function pagination(page,pages,total,base=location.href){if(pages<2)return `<p class="pagination-meta">${total} products</p>`;const href=n=>{const u=new URL(base);u.searchParams.set("page",n);return u.pathname+u.search;};return `<nav class="pagination" aria-label="Catalog pages"><span>Page ${page} of ${pages} · ${total} products</span><div>${page>1?`<a class="btn btn-secondary btn-small" href="${esc(href(page-1))}">← Previous</a>`:""}${page<pages?`<a class="btn btn-secondary btn-small" href="${esc(href(page+1))}">Next →</a>`:""}</div></nav>`;}
const browseCategoryPath = (category, editing = false) =>
 (editing ? "/admin/catalog" : "/categories") + (category ? "?" + new URLSearchParams({category}) : "");
const browseCategoryLabel = category => (language() === "hi" ? category.name : category.nameEn) || category.nameEn;
const browseImage = (src, fallback, cls = "") => src ? `<img class="${cls}" src="${esc(src)}" alt="">` : fallback;
const browseCategoryArt = category => browseImage(category.image, icons[category.nameEn.replace(/^Demo /,"")] || "🌱", "browse-category-image");

function browseAction(action, label, id = "") {
 return `<button type="button" class="browse-action" data-browse-action="${action}" data-browse-id="${esc(id)}">${esc(label)}</button>`;
}

function browseCatalog(data, editor) {
 const selected = new URLSearchParams(location.search).get("category") || "";
 const editing = Boolean(editor);
 const hidden = (editor?.categories || []).filter(category => !data.categories.some(item => item.id === category.id));
 const categories = [...data.categories, ...hidden];
 const active = categories.find(category => category.slug === selected);
 const path = value => browseCategoryPath(value, editing);
 const products = active || !selected ? data.items : [];
 const edit = (action, label, id = "") => editing ? browseAction(action, label, id) : "";
 const productLink = id => `/admin/products/${id}?${new URLSearchParams({from:"categories", category:selected})}`;
 const rail = (text, art, category) => {
  const slug = category?.slug || "";
  return `<div class="browse-rail-row"><a href="${esc(path(slug))}" ${slug === selected ? 'aria-current="page"' : ""}><span aria-hidden="true">${art}</span><b>${esc(text)}</b>${category?.active === false ? "<small>Hidden</small>" : ""}</a>
   ${category ? edit("category", "Edit", category.id) : ""}</div>`;
 };
 const tile = (name, art, href, action = "") =>
  `<div class="browse-tile-wrap"><a class="browse-tile" href="${esc(href)}"><span class="browse-tile-art">${art}</span><b>${esc(name)}</b></a>${action}</div>`;
 const section = (title, tiles, controls = "", image = "") => tiles || editing ?
  `<section class="browse-section"><div class="browse-section-heading"><h2>${browseImage(image, "", "browse-section-image")}${esc(title)}</h2>${controls}</div>
    <div class="browse-tiles">${tiles}</div></section>` : "";
 const productTiles = rows => rows.slice(0, 9).map(product =>
  tile(prodName(product), productImage(product), editing ? productLink(product.id) : `/product/${encodeURIComponent(product.slug)}`)).join("");
 const custom = (active?.sections || []).map(item => {
  const shown = item.skus.map(sku => products.find(product => product.variants.some(variant => variant.sku === sku))).filter(Boolean);
  return section(item.title, productTiles([...new Set(shown)]), edit("section", "+ Add products / edit", item.id), item.image);
 }).join("");
 const categoryTiles = data.categories.map(category => tile(browseCategoryLabel(category), browseCategoryArt(category), path(category.slug))).join("");
 const knownBrands = new Set(products.map(product => product.brandEn));
 const brandTiles = data.brands.filter(brand => knownBrands.has(brand.nameEn) || active?.brandIds?.includes(brand.id)).slice(0, 9).map(brand =>
  tile(browseCategoryLabel(brand), browseImage(brand.image, '<span aria-hidden="true">✿</span>'),
   `/brand/${encodeURIComponent(brand.slug)}?${new URLSearchParams({category:selected})}`, edit("brand", "Edit", brand.id))).join("");
 const globalBanner = editor?.banner ?? storefrontSettings.catalogBannerTitle;
 const globalBannerImage = editor?.bannerImage ?? storefrontSettings.catalogBannerImage;
 const bannerTitle = active ? active.banner || browseCategoryLabel(active) : globalBanner || "Browse farm supplies";
 const bannerImage = active ? active.bannerImage : globalBannerImage;
 const shopLink = active ? `/category/${encodeURIComponent(active.slug)}` : "/shop";
 return `<div class="container browse-page${editing ? " browse-editor" : ""}"><h1>All categories</h1><div class="browse-layout">
  <nav class="browse-rail" aria-label="Categories">
   ${rail("All categories", "✿")}${categories.map(category => rail(browseCategoryLabel(category), browseCategoryArt(category), category)).join("")}
   ${edit("category", "+ Add category")}
  </nav>
  <div class="browse-content">
   <a class="browse-banner" href="${esc(shopLink)}"><span><strong>${esc(bannerTitle)}</strong><small>View catalog ↗</small></span>
     <i aria-hidden="true">${browseImage(bannerImage, active ? browseCategoryArt(active) : "🌾", "browse-banner-image")}</i></a>
   ${edit("banner", bannerImage ? "Edit banner" : "+ Add banner image")}
   ${active ? custom + edit("section", "+ Add section") : section("Shop by category", categoryTiles, edit("category", "+ Add category") + edit("brands", "Manage brands"))}
   ${section("Featured products", productTiles(products.filter(product => product.featured)), edit("featured", "+ Add featured product"))}
   ${active ? section("Shop by brand", brandTiles, edit("brand", "+ Add brand")) : ""}
   ${section("Browse products", productTiles(products), editing ? `<a class="browse-action" href="${esc(productLink("new"))}">+ Add product</a>` : "")}
   ${!products.length ? '<p class="browse-empty">No products listed here yet.</p>' : ""}
  </div></div></div>`;
}

let browseEditor;
async function categoriesPage(editing = false) {
 const selected = new URLSearchParams(location.search).get("category") || "";
 const query = new URLSearchParams({limit:"100", ...(selected ? {category:selected} : {})});
 const [data, editor] = await Promise.all([
  api(`/api/v1/products?${query}`),
  editing ? api(`/api/v1/admin/catalog?${query}`) : null
 ]);
 if (editing) {
  browseEditor = { ...editor, active: editor.categories.find(category => category.slug === selected) };
  return browseCatalog(data, editor);
 }
 return wrap(browseCatalog(data));
}

function imageFields(name, label, url = "") {
 return `<fieldset class="image-fields"><legend>${esc(label)}</legend>
  ${url ? `<img class="editor-image-preview" src="${esc(url)}" alt="">` : ""}
  <label>Upload an image <input type="file" name="${name}File" accept="image/png,image/jpeg,image/webp,image/gif"></label>
  <label>Image URL <input type="text" name="${name}" value="${esc(url)}" placeholder="https://…" maxlength="1000"></label>
  <small>PNG, JPEG, WebP or GIF, up to 750 KB. Clear the URL to remove the image.</small>
 </fieldset>`;
}

async function uploadImage(file) {
 if (file.size > 750 * 1024) throw new Error("Images must be 750 KB or smaller.");
 const encoded = await new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).split(",")[1]);
  reader.onerror = () => reject(new Error("Could not read the image."));
  reader.readAsDataURL(file);
 });
 const { url } = await api("/api/v1/admin/media", {method:"POST",body:JSON.stringify({type:file.type,content:encoded})});
 return url;
}

async function saveImageFields(form, values) {
 for (const input of form.querySelectorAll('.image-fields input[type="file"]')) {
  const name = input.name.slice(0, -4);
  if (input.files[0]) values[name] = await uploadImage(input.files[0]);
  delete values[input.name];
 }
}

function productVariantEditor(product) {
 const variants=product.variants?.length?product.variants:[{pack:"",sku:"",pricePaise:"",mrpPaise:"",stock:""}];
 const row=v=>'<div class="variant-row" data-variant-row><label><span>Pack size *</span><input data-variant-field="pack" value="'+esc(v.pack||"")+'" placeholder="e.g. 250 g" required></label><label><span>SKU *</span><input data-variant-field="sku" value="'+esc(v.sku||"")+'" placeholder="AG-250G" required></label><label><span>Selling price (₹) *</span><input data-variant-field="price" type="number" min="0" step="0.01" value="'+(v.pricePaise===""?"":(Number(v.pricePaise||0)/100).toFixed(2))+'" placeholder="199.00" required></label><label><span>MRP (₹)</span><input data-variant-field="mrp" type="number" min="0" step="0.01" value="'+(v.mrpPaise===""?"":(Number(v.mrpPaise||0)/100).toFixed(2))+'" placeholder="249.00"></label><label><span>Available stock *</span><input data-variant-field="stock" type="number" min="0" step="1" value="'+esc(v.stock??"")+'" placeholder="0" required></label><button type="button" class="variant-remove" data-remove-variant aria-label="Remove pack option">×</button></div>';
 return '<section class="product-editor-section product-variant-section"><div class="product-section-heading"><div><span class="section-kicker">03 · PRICE & INVENTORY</span><h2>Pack options</h2><p>Each pack size has its own SKU, price and stock count.</p></div><button type="button" class="btn btn-secondary" data-add-variant>＋ Add pack</button></div><div class="variant-editor-head"><span>Pack</span><span>SKU</span><span>Selling price</span><span>MRP</span><span>Available stock</span><span></span></div><div data-variant-list>'+variants.map(row).join("")+'</div><small class="hint">Use a different SKU for every pack. Stock is the number currently available to sell.</small></section>';
}
function productImageFields(product) {
 const entries=(product.images||[]).map((entry,index)=>({url:typeof entry==="string"?entry:entry?.url,alt:product.imageAlt?.[index]||entry?.alt||""})).filter(item=>item.url);
 return '<section class="product-editor-section product-media-section"><div class="product-section-heading"><div><span class="section-kicker">02 · PRODUCT MEDIA</span><h2>Photos</h2><p>Use clear pack shots. The first photo is the main storefront image.</p></div><span class="media-count">'+entries.length+'/8 images</span></div><div class="product-image-grid">'+entries.map((entry,index)=>'<div class="product-image-tile"><img src="'+esc(entry.url)+'" alt=""><label>Image URL<input name="existingImage" value="'+esc(entry.url)+'" maxlength="1000"></label><label>Alt text<input name="existingAlt" value="'+esc(entry.alt)+'" maxlength="180" placeholder="Describe the product photo"></label><small>Image '+(index+1)+(index===0?" · Main photo":"")+'</small></div>').join("")+'</div><div class="media-upload-row"><label class="media-upload-control"><span aria-hidden="true">＋</span><b>Upload product photos</b><small>PNG, JPEG, WebP or GIF · max 750 KB each</small><input type="file" name="productFiles" accept="image/png,image/jpeg,image/webp,image/gif" multiple></label><div class="field media-url-field"><label>Or add an image URL</label><input name="additionalImage" placeholder="https://…/product-image.png" maxlength="1000"><small>Up to 8 photos in total. Clear an existing URL to remove it.</small></div></div></section>';
}

async function readProductImages(form) {
 const fields = new FormData(form);
 const alts = fields.getAll("existingAlt");
 const pictures = fields.getAll("existingImage").map((url, index) => [url.trim(), alts[index]]).filter(([url]) => url);
 const additional = fields.get("additionalImage").trim();
 if (additional) pictures.push([additional, ""]);
 const files = [...form.elements.productFiles.files];
 if (pictures.length + files.length > 8) throw new Error("A product can have up to eight images.");
 for (const file of files) pictures.push([await uploadImage(file), ""]);
 return { images:pictures.map(([url]) => url), imageAlt:pictures.map(([, alt]) => alt) };
}

function openBrowseEditor(action, id) {
 const { active, categories, brands, items, banner, bannerImage } = browseEditor;
 const labelInput = (name, label, value, required = false) =>
  `<label>${label}<input name="${name}" value="${esc(value || "")}" maxlength="100" ${required ? "required" : ""}></label>`;
 const selectOption = (value, label) => `<option value="${esc(value)}">${esc(label)}</option>`;
 let title, description = "", fields;
 if (action === "brands") {
  title = "Manage brands";
  fields = `<button type="button" class="browse-action" data-browse-action="brand" data-browse-id="">+ Add brand</button>
   ${brands.map(row => `<div class="browse-brand-row"><span>${esc(row.nameEn)}${row.active === false ? " · Hidden" : ""}</span>
    ${browseAction("brand", "Edit", row.id)}</div>`).join("")}`;
 } else if (action === "category" || action === "brand") {
  const current = (action === "category" ? categories : brands).find(row => row.id === id);
  title = `${current ? "Edit" : "Add"} ${action}`;
  const canLink = action === "brand" && !current && active && brands.some(row => row.active !== false);
  fields = `${canLink ? `<label>Existing brand <select name="existingId">${selectOption("", "Create a new brand")}${brands.filter(row => row.active !== false).map(row => selectOption(row.id, row.nameEn)).join("")}</select></label>` : ""}
   ${labelInput("nameEn", "English name", current?.nameEn, !canLink)}
   ${labelInput("name", "Hindi name", current?.name)}
   <label>Display order <input type="number" name="order" min="0" max="1000" value="${current?.order ?? (action === "category" ? categories.length : brands.length)}"></label>
   <label>Visibility <select name="active"><option value="true">Visible</option><option value="false" ${current?.active === false ? "selected" : ""}>Hidden</option></select></label>
   ${imageFields("image", action === "category" ? "Category icon" : "Brand logo", current?.image)}`;
 } else if (action === "banner") {
  title = "Edit category banner";
  fields = labelInput("banner", "Banner title", active ? active.banner : banner) +
   imageFields("bannerImage", "Banner image", active ? active.bannerImage : bannerImage);
 } else if (action === "section") {
  const current = active.sections.find(section => section.id === id);
  title = current ? "Edit section" : "Add section";
  description = "Choose the published products to display in this section.";
  const available = items.map(item => [item.skus.find(sku => current?.skus.includes(sku)) || item.skus[0], item.nameEn]);
  const choices = new Map([...(current?.skus || []).map(sku => [sku, sku]), ...available]);
  fields = labelInput("title", "Section title", current?.title, true) +
   `<fieldset class="browse-product-choices"><legend>Products</legend>${[...choices].map(([sku, name]) =>
    `<label><input type="checkbox" name="sectionSku" value="${esc(sku)}" ${current?.skus.includes(sku) ? "checked" : ""}> ${esc(name)} <small>${esc(sku)}</small></label>`).join("") || "<p>Publish a product in this category to add it here.</p>"}</fieldset>` +
   imageFields("image", "Section image", current?.image);
 } else if (action === "featured") {
  title = "Add featured product";
  description = "Featuring a product also adds it to the store’s featured selection.";
  fields = `<label>Published product <select name="productId" required>${selectOption("", "Choose a product")}
   ${items.filter(item => !item.featured).map(item => selectOption(item.id, item.nameEn)).join("")}</select></label>`;
 }
 showDialog(title, description, `<div class="browse-edit-fields">${fields}</div>`);
 const form = $("#dialog-form");
 if (action === "brands") form.querySelector(".dialog-actions .btn-primary").remove();
 else form.dataset.browseForm = action;
 form.dataset.browseId = id;
 form.querySelector('input:not([type="file"]),select')?.focus();
}

async function saveBrowseEditor(form) {
 const action = form.dataset.browseForm;
 const id = form.dataset.browseId;
 const { active } = browseEditor;
 const input = readForm(form);
 if (action === "section") input.skus = new FormData(form).getAll("sectionSku").join(",");
 delete input.sectionSku;
 await saveImageFields(form, input);
 let path = `/api/v1/admin/catalog/${action}${id ? "/" + encodeURIComponent(id) : ""}`;
 let method = id ? "PATCH" : "POST";
 if (action === "banner") {
  if (active) path = `/api/v1/admin/catalog/category/${encodeURIComponent(active.id)}`;
  method = "PATCH";
 }
 if (action === "section") path = `/api/v1/admin/catalog/category/${encodeURIComponent(active.id)}/sections${id ? "/" + encodeURIComponent(id) : ""}`;
 if (action === "brand" && !id && active) input.categoryId = active.id;
 if (action === "featured") {
  path = `/api/v1/admin/catalog/featured/${encodeURIComponent(input.productId)}`;
  input.featured = true;
  method = "PATCH";
 }
 const saved = await api(path, {method,body:JSON.stringify(input)});
 $("#dialog-root").innerHTML = "";
 toast("Saved.");
 if (action === "category" && saved.slug !== active?.slug && (!id || active?.id === id)) {
  history.replaceState(null, "", browseCategoryPath(saved.slug, true));
 }
 await render();
}

async function listing(pathname){
 const params=new URLSearchParams(location.search); let category=params.get("category")||"",brand="",title="Shop all products",description="Browse the AgroSeed catalog.";
 if(pathname==="/search"){title=`Results for “${esc(params.get("q")||"")}”`;}
 if(pathname.startsWith("/category/")){category=decodeURIComponent(pathname.split("/").pop()); title=category.replace(/-/g," ").replace(/\b\w/g,c=>c.toUpperCase()); description=`Farm and garden products in ${title}.`;}
 if(pathname.startsWith("/brand/")){brand=decodeURIComponent(pathname.split("/").pop()); title=brand.replace(/-/g," ").replace(/\b\w/g,c=>c.toUpperCase()); description=`Products from ${title}.`;}
 const q=params.get("q")||"";const sort=params.get("sort")||"featured";
 const query=new URLSearchParams({limit:"24",sort,page:String(Math.max(1,Number(params.get("page"))||1))});if(q)query.set("q",q);if(category)query.set("category",category);if(brand)query.set("brand",brand);
 try{const data=await api(`/api/v1/products?${query}`);return wrap(`<div class="container page-wrap"><div class="breadcrumbs"><a href="/">Home</a><span>›</span><span>${esc(title)}</span></div>${offerStrip()}${pageTitle(esc(title),description)}<div class="catalog-layout"><aside class="filter-panel"><h3>Categories</h3>${(data.categories||[]).map(c=>`<a class="filter-option" href="/category/${esc(c.slug)}">${esc(c.nameEn)}</a>`).join("")}<h3>Brands</h3>${(data.brands||[]).map(b=>`<a class="filter-option" href="/brand/${esc(b.slug)}">${esc(b.nameEn)}</a>`).join("")}</aside><section><div class="filter-search"><span>${data.total} products</span><span class="nav-spacer"></span><label for="sort-list">Sort by</label><select class="control" id="sort-list" style="width:auto;padding:8px" data-sort><option value="featured" ${sort==="featured"?"selected":""}>Featured</option><option value="price-low" ${sort==="price-low"?"selected":""}>Price: low to high</option><option value="price-high" ${sort==="price-high"?"selected":""}>Price: high to low</option><option value="name" ${sort==="name"?"selected":""}>Name</option></select></div><div class="product-grid">${data.items.map(productCard).join("")||empty("No matches yet","Try another search or browse the full catalog.",'<a class="btn btn-secondary" href="/shop">Clear filters</a>')}</div>${pagination(data.page,data.pages,data.total)}</section></div></div>`);}catch(e){return wrap(`<div class="container page-wrap">${empty("Catalog unavailable",e.message)}</div>`);}
}
async function productPage(pathname){
 const id=decodeURIComponent(pathname.split("/").pop());try{const p=await api(`/api/v1/products/${encodeURIComponent(id)}`);const variants=p.variants||[];const v=variants.find(x=>x.active!==false)||variants[0];pickedVariant=v?.sku;const localized=(en,hi)=>language()==="hi"?(hi||en||""):(en||hi||"");const labelInfo=localized(p.labelInfo,p.labelInfoHi),directions=localized(p.directions,p.directionsHi),safetyInfo=localized(p.safetyInfo,p.safetyInfoHi),labelSection=(title,value)=>`<section class="panel-card product-info-section"><h2>${title}</h2>${value?`<p>${esc(value).replace(/\r?\n/g,"<br>")}</p>`:`<p class="muted">${say("Not provided for this product yet.","इस उत्पाद के लिए अभी जानकारी उपलब्ध नहीं है।")}</p>`}</section>`;return wrap(`<div class="container page-wrap"><div class="breadcrumbs"><a href="/">Home</a><span>›</span><a href="/shop">Shop</a><span>›</span><span>${esc(prodName(p))}</span></div><div class="detail-layout"><div class="detail-image">${productImage(p,true)}</div><section class="detail-copy"><div class="product-brand">${esc(p.brandEn||p.brand)}</div><h1>${esc(prodName(p))}</h1><p>${esc(language()==="hi"?(p.description||p.descriptionEn||"AgroSeed catalog product."):(p.descriptionEn||"Product details are currently unavailable."))}</p><div class="variant-choice">${variants.map((x,i)=>`<label><input type="radio" name="variant" value="${esc(x.sku)}" ${i===0?"checked":""} ${x.stock<1?"disabled":""} data-variant> ${esc(x.pack)} · ${money(x.pricePaise)}</label>`).join("")}</div><div class="detail-price" id="detail-price">${money(v?.pricePaise)} ${v?.mrpPaise>v?.pricePaise?`<del>${money(v.mrpPaise)}</del>`:""}</div><div class="detail-meta"><span>SKU <b id="detail-sku">${esc(v?.sku||"")}</b></span><span id="detail-stock">${v?.stock>0?`${v.stock} available`:"Out of stock"}</span><span>${esc(p.categoryEn)}</span></div><div class="buy-row"><div class="quantity-control"><button data-detail-qty="-1">−</button><output id="detail-qty">1</output><button data-detail-qty="1">+</button></div><button class="btn btn-primary" data-detail-add ${v?.stock<1?"disabled":""}>Add to bag</button><a class="btn btn-secondary" href="/cart">View bag</a></div></section></div><div class="product-info-grid">${labelSection(say("Label information","लेबल की जानकारी"),labelInfo)}${labelSection(say("Directions for use","उपयोग के निर्देश"),directions)}${labelSection(say("Safety and precautions","सुरक्षा और सावधानियां"),safetyInfo)}</div></div>`);}catch(e){return wrap(`<div class="container page-wrap">${empty("Product not found",e.message,'<a class="btn btn-primary" href="/shop">Browse products</a>')}</div>`);}
}
async function allCatalogProducts() {
 const first=await api("/api/v1/products?limit=100");
 const products=[...first.items];
 for(let page=2;page<=first.pages;page++) {
  const next=await api("/api/v1/products?limit=100&page="+page);
  products.push(...next.items);
 }
 return products;
}
async function cartPage(){
 const rows=cart();if(!rows.length)return wrap(`<div class="container page-wrap">${pageTitle("Your bag","A little room for everything you need.")} ${empty("Your bag is waiting","Browse the catalog and add products you need.",'<a class="btn btn-primary" href="/shop">Explore products</a>')}</div>`);
 let products=[];try{products=await allCatalogProducts();}catch(e){return wrap(`<div class="container page-wrap">${empty("Bag unavailable",e.message)}</div>`);}
 const lines=[];for(const row of rows){const p=products.find(x=>x.variants.some(v=>v.sku===row.sku));const v=p?.variants.find(x=>x.sku===row.sku);if(p&&v)lines.push({p,v,q:row.quantity});}
 if(lines.length!==rows.length)await saveCart(lines.map(x=>({sku:x.v.sku,quantity:x.q})));
 const items=lines.map(({p,v,q})=>`<div class="cart-line"><a class="cart-thumb" href="/product/${esc(p.slug)}">${productImage(p)}</a><div><h3>${esc(prodName(p))}</h3><p>${esc(v.pack)} · ${esc(v.sku)}</p><div class="line-tools"><div class="quantity-control"><button data-cart-step="-1" data-sku="${esc(v.sku)}">−</button><output>${q}</output><button data-cart-step="1" data-sku="${esc(v.sku)}">+</button></div><button class="link-button text-danger" data-remove="${esc(v.sku)}">Remove</button></div></div><div class="line-price">${money(v.pricePaise*q)}</div></div>`).join("");
 const estimate=lines.reduce((a,x)=>a+x.v.pricePaise*x.q,0);
 return wrap(`<div class="container page-wrap">${pageTitle("Your bag",`${cartCount()} item${cartCount()===1?"":"s"} · prices are rechecked at checkout.`)}<div class="cart-layout"><section class="panel-card">${items}<a class="text-link" href="/shop">← Continue browsing</a></section><aside class="summary-card"><h2>Order preview</h2><div class="summary-row"><span>Estimated subtotal</span><b>${money(estimate)}</b></div><div class="summary-row"><span>Delivery</span><span>Calculated at checkout</span></div><div class="summary-row total"><span>Estimated total</span><b>${money(estimate)}</b></div><a class="btn btn-primary" href="/checkout">Continue to checkout</a><p class="hint">No payment is collected in this.</p></aside></div></div>`);
}
async function checkoutPage(){
 const rows = cart();
 let saved={};try{saved=JSON.parse(localStorage.getItem("agroseed-address")||"{}");}catch{}
 return wrap(`<div class="container page-wrap">${pageTitle("Checkout","Ordering will open once checkout is ready.")}<form class="checkout-layout" id="checkout-form"><div><fieldset disabled style="border:0;padding:0;margin:0;min-width:0"><section class="form-card"><h2>Delivery address</h2><div class="field-grid"><div class="field"><label for="c-name">Full name *</label><input id="c-name" name="name" required autocomplete="name" value="${esc(saved.name||"")}"></div><div class="field"><label for="c-phone">Mobile number *</label><input id="c-phone" name="phone" required inputmode="tel" autocomplete="tel" value="${esc(saved.phone||"")}"></div><div class="field span-2"><label for="c-line">Address *</label><input id="c-line" name="line1" required autocomplete="street-address" value="${esc(saved.line1||"")}"></div><div class="field"><label for="c-city">Village / city *</label><input id="c-city" name="city" required value="${esc(saved.city||"")}"></div><div class="field"><label for="c-state">State *</label><input id="c-state" name="state" required value="${esc(saved.state||"")}"></div><div class="field"><label for="c-pin">PIN code *</label><input id="c-pin" name="pincode" required inputmode="numeric" pattern="[0-9]{6}" maxlength="6" value="${esc(saved.pincode||"")}"></div><div class="field"><label for="c-coupon">Promotion code</label><input id="c-coupon" name="couponCode" autocomplete="off"></div><div class="field span-2"><label for="c-notes">Delivery notes</label><input id="c-notes" name="notes" maxlength="180"></div></div></section></fieldset><div class="callout">Order placement and payments are currently unavailable.</div></div><aside class="summary-card"><h2>Order summary</h2><div id="checkout-summary"><div class="checkout-lines">${rows.map(x=>`<div class="checkout-line"><span>${esc(x.quantity)} × ${esc(x.sku)}</span><span>Price pending</span></div>`).join("")}</div><p class="hint">Totals will be available when checkout opens.</p></div><button class="btn btn-primary" type="button" disabled>Place order</button></aside></form></div>`);
}
function policyPage(path){
 const policies={"/shipping-returns":["Shipping & returns","Shipping regions, rates, delivery estimates, cancellation and return rules still need AgroSeed’s approval. Ordering is currently unavailable."],"/privacy":["Privacy","AgroSeed’s approved privacy notice and business contact details have not been supplied. Thiss demo cart and address details in this browser, and sample orders in a local development file."],"/terms":["Terms of service","AgroSeed’s approved terms and legal business identity have not been supplied. Do not use this preview to make a real purchase."],"/help":["Help centre","Find your order with its order number and private tracking code. Product directions on sample listings are not approved for real-world use."]};const [title,desc]=policies[path]||policies["/help"];
 if(path==="/help")return wrap(`<div class="container page-wrap">${pageTitle(title,"A few quick ways to find the help you need.")}<div class="category-grid"><a class="category-card" href="/contact"><span class="category-icon">✉️</span><b>Send a message</b><small>Requests are saved in the local preview</small></a><a class="category-card" href="/shop"><span class="category-icon">🌱</span><b>Browse catalog</b><small>Sample products and details</small></a></div><div class="callout">${esc(desc)}</div></div>`);
 return wrap(`<div class="container page-wrap"><div class="policy-copy">${pageTitle(title)}<div class="callout">Draft status: client-approved policy text has not been provided.</div><p>${esc(desc)}</p><p>For questions, use the contact form. The locals the request for staff review; it does not send email notifications.</p></div></div>`);
}
function contactPage(){return wrap(`<div class="container page-wrap">${pageTitle("Contact AgroSeed","Send a question to AgroSeed.")}<form id="support-form" class="form-card" style="max-width:680px"><div class="field-grid"><div class="field"><label>Name</label><input name="name" required autocomplete="name"></div><div class="field"><label>Email</label><input name="email" required type="email" autocomplete="email"></div><div class="field span-2"><label>What can we help with?</label><select class="control" name="topic"><option>Product question</option><option>Order support</option><option>Delivery</option><option>Other</option></select></div><div class="field span-2"><label>Message</label><textarea name="message" required minlength="10" maxlength="4000"></textarea></div></div><button class="btn btn-primary" style="margin-top:14px">Send message</button><p class="hint">Messages are sent to the AgroSeed support inbox.</p></form></div>`);}
function customerDetails(session){
 const labels={address:"Address",birthdate:"Date of birth",email_verified:"Email verified",family_name:"Family name",gender:"Gender",given_name:"First name",locale:"Language",middle_name:"Middle name",name:"Full name",nickname:"Nickname",phone_number_verified:"Mobile verified",picture:"Profile image",preferred_username:"Preferred username",profile:"Profile",updated_at:"Profile updated",website:"Website",zoneinfo:"Time zone"};
 const valueText=value=>{if(typeof value==="boolean")return value?"Yes":"No";if(value&&typeof value==="object")return Object.values(value).filter(Boolean).join(", ");if(typeof value==="string"&&value.startsWith("{")){try{return Object.values(JSON.parse(value)).filter(Boolean).join(", ");}catch{}}return String(value??"");};
 const rows=[["Full name",session.name],["Email",session.email],["Mobile number",session.phone],["Username",session.username]];
 for(const [key,value] of Object.entries(session.attributes||{}))if(!["name","email","phone_number","preferred_username","given_name","family_name"].includes(key))rows.push([labels[key]||key.replace(/^custom:/,"" ).replaceAll("_"," ").replace(/^./,c=>c.toUpperCase()),valueText(value)]);
 rows.push(["Customer ID",session.id]);
 const visible=rows.filter(([,value])=>value!==null&&value!==undefined&&value!=="");
 return `<section class="panel-card account-profile-card"><div class="account-section-title"><div><p class="eyebrow">YOUR DETAILS</p><h2>Profile details</h2></div><span class="account-secure">Private account</span></div><form id="customer-profile-form" class="account-profile-edit"><label for="account-display-name">Display name</label><div><input id="account-display-name" name="name" maxlength="120" value="${esc(session.name||"")}" placeholder="Add your name"><button class="btn btn-primary">Save name</button></div></form><div class="account-detail-list">${visible.filter(([label])=>label!=="Full name").map(([label,value])=>`<div class="account-detail-row"><span>${esc(label)}</span><b>${esc(value)}</b></div>`).join("")||'<p class="hint">No additional profile details.</p>'}</div><p class="hint">Your email is verified through Cloudflare Access. Change the email through your sign-in provider.</p></section>`;
}
async function accountPage(path){
 const authEnabled=Boolean(window.AGROSEED_CONFIG?.customerAuthEnabled),params=new URLSearchParams(location.search),justReturned=params.get("access")==="1";
 if(!authEnabled)return wrap(`<div class="container page-wrap">${pageTitle("Your account","Your saved details on this device.")}<div class="panel-card"><p>Customer sign-in is not configured yet. Your guest cart remains available on this device.</p><a class="btn btn-secondary" href="/cart">View your bag</a></div></div>`);
 if(!justReturned&&localStorage.getItem(customerAuthKey)!=="1")return wrap(`<div class="container page-wrap">${pageTitle("Your account","Sign in to see your saved details across devices.")}<div class="panel-card"><p>Use a one-time code sent to your email to access saved cart and address details across devices.</p><a class="btn btn-primary" href="/account/login">Sign in or create an account</a></div></div>`);
 let current;try{current=await api("/api/v1/customer/session");}catch(error){localStorage.removeItem(customerAuthKey);customerSession=null;csrf="";return wrap(`<div class="container page-wrap">${pageTitle("Your account","Sign in with your email.")}<div class="callout">${esc(error.message)}</div><p><a class="btn btn-primary" href="/account/login">Sign in or create an account</a></p></div>`);}
 customerSession=current.customer;csrf=current.csrf||"";if(customerSession){if(justReturned && !customerCartHydrated && !await mergeCustomerCartWithGuest()) toast("Your guest bag could not be merged. Its items are still on this device.", true);localStorage.setItem(customerAuthKey,"1");if(justReturned){params.delete("access");history.replaceState(null,"",`${location.pathname}${params.size?`?${params}`:""}${location.hash}`);}}
 if(!customerSession)return wrap(`<div class="container page-wrap">${pageTitle("Your account","Sign in to see your saved details across devices.")}<div class="panel-card"><p>Use a one-time code sent to your email to access saved cart and address details across devices.</p><a class="btn btn-primary" href="/account/login">Sign in or create an account</a></div></div>`);
 const tabs=[["/account","Overview"],["/account/orders","My orders"],["/account/addresses","Addresses"]];let body="";
 if(path==="/account/orders")body=`<section class="account-empty-state"><span class="account-empty-icon" aria-hidden="true">▤</span><div><h2>Order history is not available yet</h2><p>Checkout is still disabled, so this account has no online orders to show.</p><a class="btn btn-secondary" href="/shop">Browse the catalog</a></div></section>`;
 else if(path==="/account/addresses"){
  const {items:rows=[]}=await api("/api/v1/customer/addresses"),editId=new URLSearchParams(location.search).get("edit"),editing=rows.find(x=>x.id===editId)||{},field=(name,label,required=true)=>`<div class="field"><label>${label}${required?" *":""}</label><input name="${name}" ${required?"required":""} value="${esc(editing[name]||"")}"></div>`;
  body=`<form id="address-form" class="form-card"><h2>${editing.id?"Edit address":"Add an address"}</h2><input type="hidden" name="id" value="${esc(editing.id||"")}"><div class="field-grid">${field("name","Full name")}${field("phone","Mobile number")}${field("line1","Address")}${field("line2","Landmark",false)}${field("city","Village / city")}${field("state","State")}${field("pincode","PIN code")}</div><label class="filter-option"><input type="checkbox" name="isDefault" ${editing.isDefault||!rows.length?"checked":""}> Use as default checkout address</label><div class="table-actions"><button class="btn btn-primary">${editing.id?"Save address":"Add address"}</button>${editing.id?'<a class="btn btn-secondary" href="/account/addresses">Cancel</a>':""}</div><p class="hint">Saved securely to your account.</p></form>${rows.length?`<div class="panel-card">${rows.map(a=>`<div class="cart-line"><div class="category-icon">⌂</div><div><h3>${esc(a.name)} ${a.isDefault?'<span class="status-pill">Default</span>':""}</h3><p>${esc([a.line1,a.line2,a.city,a.state,a.pincode].filter(Boolean).join(", "))}</p><p>${esc(a.phone||"")}</p></div><div class="table-actions"><a class="btn btn-secondary btn-small" href="/account/addresses?edit=${encodeURIComponent(a.id)}">Edit</a><button class="btn btn-danger btn-small" data-delete-address="${esc(a.id)}">Delete</button>${!a.isDefault?`<button class="btn btn-secondary btn-small" data-default-address="${esc(a.id)}">Make default</button>`:""}</div></div>`).join("")}</div>`:empty("No saved addresses","Add an address to reuse it when ordering.")}`;
 } else body=`<div class="account-overview-links"><a href="/account/addresses"><span>⌂</span><b>Saved addresses</b><small>Manage delivery details</small><i>↗</i></a><a href="/shop"><span>✿</span><b>Browse products</b><small>Explore the AgroSeed catalog</small><i>↗</i></a></div>${customerDetails(customerSession)}`;
 const signedInAs=customerSession.name||customerSession.email||customerSession.phone||"your AgroSeed account";
 const initial=String(signedInAs).trim().charAt(0).toUpperCase()||"A";
 return wrap(`<div class="container page-wrap account-page"><section class="account-welcome"><div class="account-avatar">${esc(initial)}</div><div class="account-welcome-copy"><p class="eyebrow">AGROSEED ACCOUNT</p><h1>Welcome${customerSession.name?`, ${esc(customerSession.name.split(" ")[0])}`:" back"}</h1><p>${esc(customerSession.email||"Signed in with Cloudflare email verification")}</p></div><span class="account-verified"><b>✓</b> Verified email</span></section><div class="account-layout"><nav class="account-nav" aria-label="Account navigation">${tabs.map(([href,t])=>`<a class="${path===href?"active":""}" href="${href}"><span>${t==="Overview"?"◉":t==="My orders"?"▤":"⌂"}</span>${t}</a>`).join("")}<button type="button" class="account-nav-signout" data-customer-logout>↪ Sign out</button></nav><section class="account-content">${body}</section></div></div>`);
}
const adminLinks=[
 ["/admin","Overview","⌂","WORKSPACE"],["/admin/products","Products","▦"],["/admin/orders","Orders","▤"],["/admin/inventory","Inventory","◈"],["/admin/support","Support inbox","✉"],
 ["/admin/catalog","Categories & brands","◉","STORE SETUP"],["/admin/promotions","Promotions","％"],["/admin/shipping","Delivery areas","⌖"],["/admin/audit","Activity log","◷"],["/admin/settings","Settings","⚙"]
];
function adminLogin(error="") {return `<main class="admin-login"><form id="admin-login-form" class="login-card"><a class="logo" href="/"><span class="logo-mark"><img src="/agroseed-mark-v2.png" alt="" aria-hidden="true"></span><span>AGRO <b>SEED</b></span></a><h1>Staff sign in</h1><p>This preview console is protected by a password stored in Cloudflare Worker secrets.</p>${error?`<div class="callout">${esc(error)}</div>`:""}<div class="field"><label for="admin-password">Owner password</label><input id="admin-password" type="password" name="password" required autocomplete="current-password"></div><button class="btn btn-primary">Sign in</button><p class="hint">The staff password is configured privately in Cloudflare.</p><a class="text-link" href="/">← Back to storefront</a></form></main>`;}
const adminBottomTabs = [
 {href:"/admin", key:"home", en:"Overview"},
 {href:"/admin/catalog", key:"shop", en:"Categories"},
 {href:"/admin/products", key:"bag", en:"Products"},
 {href:"/admin/inventory", key:"inventory", en:"Inventory"},
 {href:"/admin/orders", key:"orders", en:"Orders"},
 {href:"/admin/support", key:"support", en:"Support"}
];

function adminPageIsActive(path, href) {
 return path === href || (href !== "/admin" && path.startsWith(href + "/"));
}

function adminBottomNav(path, links) {
 const allowed = new Set(links.map(([href]) => href));
 const tabs = adminBottomTabs.filter(({href}) => allowed.has(href)).slice(0, 4);
 const primary = new Set(tabs.map(({href}) => href));
 const moreLinks = links.filter(([href]) => !primary.has(href));
 const moreActive = moreLinks.some(([href]) => adminPageIsActive(path, href));
 return `<nav class="customer-bottom-nav staff-bottom-nav" aria-label="Staff navigation" style="--bottom-nav-columns:${tabs.length+1}">
  ${tabs.map(tab => bottomNavLink(tab, adminPageIsActive(path, tab.href))).join("")}
  <button type="button" popovertarget="staff-more-menu"${moreActive ? ' data-current' : ""}>${bottomNavIcon("more")}<small>More</small></button>
 </nav>
 <nav id="staff-more-menu" class="staff-more-menu" aria-label="More staff pages" popover>
  ${moreLinks.map(([href,label]) => `<a href="${href}"${adminPageIsActive(path, href) ? ' aria-current="page"' : ""}>${esc(label)}</a>`).join("")}
  <a href="/">View storefront ↗</a>
 </nav>`;
}

function adminShell(path,content,role="Owner"){
 const allowed=role==="Catalog"?new Set(["/admin/products","/admin/inventory","/admin/catalog"]):role==="Orders"?new Set(["/admin/inventory","/admin/orders","/admin/support"]):null,links=allowed?adminLinks.filter(([href])=>allowed.has(href)):adminLinks;
 const nav=links.map(([href,label,icon,group])=>`${group?`<div class="side-label">${group}</div>`:""}<a class="${adminPageIsActive(path,href)?"active":""}" href="${href}"><span>${icon}</span> &nbsp;${label}</a>`).join("");
 return `<div class="admin-app"><header class="admin-top"><a class="logo" href="/admin"><span class="logo-mark">✳</span><span>AGRO <b>SEED</b> <small class="muted">/ ADMIN</small></span></a><form class="admin-global-search" action="/admin/search" role="search"><label class="sr-only" for="admin-global-search">Search the admin workspace</label><span aria-hidden="true">⌕</span><input id="admin-global-search" data-admin-search name="q" type="search" placeholder="Search products, SKU, support…"><kbd>Ctrl K</kbd><button aria-label="Search admin">Search</button></form><div class="staff-tag"><span class="staff-avatar">${esc(role[0])}</span><span>${esc(role)}</span><button class="btn btn-secondary btn-small" data-logout>Sign out</button></div></header><div class="admin-layout"><aside class="admin-sidebar"><nav class="admin-nav">${nav}</nav><a class="admin-nav" href="/" style="margin-top:25px">↗ View storefront</a></aside><main class="admin-content">${content}</main></div>${adminBottomNav(path,links)}</div>`;
}
const adminHead=(title,desc,action="")=>`<div class="admin-page-head"><div><h1>${title}</h1><p>${desc}</p></div>${action}</div>`;
async function adminPage(path){
 let session;try{session=await api("/api/v1/admin/session");csrf=session.csrf||"";}catch(e){if(path!=="/admin/login"){location.replace("/admin/login");return "";}return adminLogin(e.message==="Sign in to the staff console."?"":e.message);}
 if(path==="/admin/login"){location.replace("/admin");return "";}
 const role=session.user?.role||"Owner";if((path==="/admin"||path==="/admin/")&&role==="Catalog"){location.replace("/admin/products");return "";}if((path==="/admin"||path==="/admin/")&&role==="Orders"){location.replace("/admin/orders");return "";}
 let content="";
 if(path==="/admin/search"){
  const q=(new URLSearchParams(location.search).get("q")||"").trim();let results=[];if(q){const d=await api("/api/v1/admin/search?"+new URLSearchParams({q}));results=d.items||[];}
  content=adminHead("Search",q?"Results for “"+esc(q)+"”":"Search across the store, stock and customer support.")+
   '<form class="admin-search-page" action="/admin/search"><label for="admin-search-query">Search everything you can manage</label><div><input id="admin-search-query" name="q" type="search" value="'+esc(q)+'" placeholder="Product name, SKU, PIN, promotion code…"><button class="btn btn-primary">Search</button></div><small>Products, pack variants, inventory, promotions, delivery areas and support requests.</small></form>'+
   (q?'<section class="admin-card admin-search-results"><div class="admin-search-summary">'+results.length+' result'+(results.length===1?"":"s")+'</div>'+(results.length?results.map(item=>'<a class="admin-search-result" href="'+esc(item.href)+'"><span class="admin-search-type">'+esc(item.type)+'</span><span class="admin-search-copy"><b>'+esc(item.title)+'</b><small>'+esc(item.detail||"")+'</small></span>'+(item.status?'<span class="status-pill '+(item.status==="published"||item.status==="resolved"||item.status==="Active"?"":"warning")+'">'+esc(item.status)+'</span>':"")+'<span class="admin-search-arrow" aria-hidden="true">↗</span></a>').join(""):'<div class="admin-search-empty"><b>No matches found</b><span>Try a product name, pack SKU, support email or delivery PIN.</span></div>')+'</section>':'<section class="admin-search-hints"><article><b>Catalog</b><span>Search names, brands, categories and SKU.</span></article><article><b>Inventory</b><span>Jump to a product or stock adjustment.</span></article><article><b>Store operations</b><span>Find promotions, shipping and support records.</span></article></section>');

 } else if(path==="/admin"||path==="/admin/"){
  const d = await api("/api/v1/admin/overview");
  const demoActive = Object.values(d.demo || {}).some(Boolean);
  const attention = d.outOfStock + d.lowStock;
  const metric = (label,value,detail,href,icon,tone="") => `<a class="overview-metric ${tone}" href="${href}"><span class="overview-metric-icon" aria-hidden="true">${icon}</span><span class="overview-metric-label">${label}</span><strong>${value}</strong><small>${detail}</small></a>`;
  const quick = (href,icon,title,detail) => `<a class="overview-quick-link" href="${href}"><span aria-hidden="true">${icon}</span><span><b>${title}</b><small>${detail}</small></span><i aria-hidden="true">↗</i></a>`;
  const demoPanel = `<section class="admin-card overview-demo"><div><span class="overview-eyebrow">STORE PREVIEW</span><h2>Demo data</h2><p>Fill the store with sample catalog and service records, or remove them in one click.</p></div><button class="btn ${demoActive ? "btn-danger" : "btn-secondary"}" data-demo-action="${demoActive ? "remove" : "add"}">${demoActive ? "Remove demo data" : "Add demo data"}</button></section>`;
  content = `<div class="overview-page">
    <section class="overview-welcome"><div><span class="overview-eyebrow">AGROSEED CONTROL ROOM</span><h1>Good ${new Date().getHours()<12?"morning":new Date().getHours()<17?"afternoon":"evening"}</h1><p>Your store at a glance. Update products, check stock and keep the storefront current.</p></div><a class="btn btn-primary" href="/admin/products/new">＋ Add product</a></section>
    <section class="overview-metrics" aria-label="Store summary">
      ${metric("Published products",d.published,`${d.products-d.published} drafts or archived`,"/admin/products","▦")}
      ${metric("Stock to review",attention,`${d.outOfStock} out of stock · ${d.lowStock} low`,"/admin/inventory","◈",attention?"attention":"")}
      ${metric("Support requests",d.openSupport,`${d.resolvedSupport} resolved`,"/admin/support","✉",d.openSupport?"attention":"")}
      ${metric("Active promotions",d.activePromotions,`${d.totalPromotions} total promotions`,"/admin/promotions","％")}
    </section>
    <section class="overview-workspace"><div class="overview-section-head"><div><span class="overview-eyebrow">STORE MANAGEMENT</span><h2>Pick up where you left off</h2></div><a href="/" class="text-link">View storefront ↗</a></div>
      <div class="overview-quick-grid">
       ${quick("/admin/catalog","◉","Categories & brands","Edit browse pages and imagery")}
       ${quick("/admin/inventory","◈","Inventory","Review stock and adjustments")}
       ${quick("/admin/shipping","⌖","Delivery areas",`${d.deliveryAreas} configured PIN codes`)}
       ${quick("/admin/settings","⚙","Website settings","Branding, homepage and policies")}
      </div>
    </section>
    ${attention ? `<a class="overview-alert" href="/admin/inventory"><span>!</span><div><b>Inventory needs attention</b><small>${d.outOfStock} out of stock and ${d.lowStock} low stock variants to review.</small></div><i>↗</i></a>` : ""}
    ${demoPanel}
    <p class="overview-footnote">Orders remain unavailable until checkout is enabled.</p>
   </div>`;
 } else if(path==="/admin/products"||path==="/admin/products/"){
  const params=new URLSearchParams(location.search),q=params.get("q")||"",status=params.get("status")||"",page=Math.max(1,Number(params.get("page"))||1);const query=new URLSearchParams({page:String(page),limit:"20"});if(q)query.set("q",q);if(status)query.set("status",status);const d=await api(`/api/v1/admin/products?${query}`);content=adminHead("Products","Create, review, feature and publish the store catalog.",'<a class="btn btn-primary" href="/admin/products/new">＋ Add product</a>')+`<div class="admin-card"><form class="search-tools" action="/admin/products"><input class="control" name="q" placeholder="Search name, brand, SKU…" value="${esc(q)}"><select class="control" name="status"><option value="">All statuses</option><option value="published" ${status==="published"?"selected":""}>Published</option><option value="draft" ${status==="draft"?"selected":""}>Draft</option><option value="review" ${status==="review"?"selected":""}>Review</option><option value="archived" ${status==="archived"?"selected":""}>Archived</option></select><button class="btn btn-secondary">Filter</button><a class="btn btn-secondary" href="/admin/products/import">CSV import</a></form><div class="table-wrap"><table class="data-table"><thead><tr><th>Product</th><th>SKU / variants</th><th>Price</th><th>Stock</th><th>Status</th><th>Actions</th></tr></thead><tbody>${d.items.map(p=>`<tr data-product-row><td><b class="table-primary">${esc(p.nameEn)}</b><span class="table-secondary">${esc(p.brandEn)} · ${esc(p.categoryEn)}${p.featured?" · Featured":""}</span></td><td>${esc(p.sku)}<span class="table-secondary">${p.variants.length} pack option(s)</span></td><td>${money(p.pricePaise)}</td><td>${p.stock}</td><td><span class="status-pill ${p.status==="published"?"":"warning"}">${p.status}</span></td><td><div class="table-actions"><a class="btn btn-secondary btn-small" href="/admin/products/${p.id}">Edit</a><button class="btn btn-secondary btn-small" data-publish="${p.id}" data-next="${p.status==="published"?"draft":"published"}">${p.status==="published"?"Unpublish":"Publish"}</button><button class="btn btn-secondary btn-small" data-feature="${p.id}" data-next="${!p.featured}">${p.featured?"Unfeature":"Feature"}</button></div></td></tr>`).join("")||"<tr><td colspan='6'>No products match these filters.</td></tr>"}</tbody></table></div>${pagination(d.page,d.pages,d.total)}</div>`;
 } else if(path==="/admin/products/new"||/^\/admin\/products\/\d+$/.test(path)){
  const id=Number(path.split("/").pop());let p={name:"",nameEn:"",brand:"",brandEn:"",category:"",categoryEn:"",description:"",descriptionEn:"",labelInfo:"",labelInfoHi:"",directions:"",directionsHi:"",safetyInfo:"",safetyInfoHi:"",status:"draft",images:[],variants:[{sku:"",pack:"",pricePaise:0,mrpPaise:0,stock:0}]};if(id)p=await api(`/api/v1/admin/products/${id}`);
  const params = new URLSearchParams(location.search);
  if (!id && params.get("from") === "categories" && params.get("category")) {
   const { categories } = await api("/api/v1/admin/catalog?" + new URLSearchParams({category:params.get("category")}));
   const category = categories.find(item => item.slug === params.get("category"));
   if (category) { p.category = category.name; p.categoryEn = category.nameEn; }
  }
  const returnTo = params.get("from") === "categories" ? browseCategoryPath(params.get("category"), true) : "/admin/products";
   content=adminHead(id?"Edit product":"Add product",id?"Update this listing. Changes affect the live catalog when published.":"Add a new item to the AgroSeed catalog.",'<a class="btn btn-secondary" href="/admin/products">← All products</a>')+
    '<form id="product-form" class="product-editor" data-id="'+(id||"")+'" data-return="'+esc(returnTo)+'">'+
    '<section class="product-editor-section"><div class="product-section-heading"><div><span class="section-kicker">01 · PRODUCT DETAILS</span><h2>What are you selling?</h2><p>Use the exact product name and brand shown on the pack.</p></div><label class="status-select"><span>Listing status</span><select name="status"><option value="draft" '+(p.status==="draft"?"selected":"")+'>Draft</option><option value="review" '+(p.status==="review"?"selected":"")+'>Needs review</option><option value="published" '+(p.status==="published"?"selected":"")+'>Published</option><option value="archived" '+(p.status==="archived"?"selected":"")+'>Archived</option></select></label></div><div class="field-grid"><div class="field"><label>Product name · English *</label><input name="nameEn" required maxlength="180" value="'+esc(p.nameEn)+'" placeholder="e.g. Hybrid Tomato Seeds"></div><div class="field"><label>Product name · Hindi *</label><input name="name" required maxlength="180" value="'+esc(p.name)+'" placeholder="हाइब्रिड टमाटर के बीज"></div><div class="field"><label>Brand · English</label><input name="brandEn" maxlength="100" value="'+esc(p.brandEn)+'" placeholder="Brand name"></div><div class="field"><label>Brand · Hindi</label><input name="brand" maxlength="100" value="'+esc(p.brand)+'" placeholder="ब्रांड का नाम"></div><div class="field"><label>Category · English</label><input name="categoryEn" maxlength="100" value="'+esc(p.categoryEn)+'" placeholder="Seeds, Crop protection…"></div><div class="field"><label>Category · Hindi</label><input name="category" maxlength="100" value="'+esc(p.category)+'" placeholder="बीज, फसल सुरक्षा…"></div></div></section>'+
    productImageFields(p)+productVariantEditor(p)+
    '<section class="product-editor-section"><div class="product-section-heading"><div><span class="section-kicker">04 · PRODUCT DESCRIPTION</span><h2>Tell shoppers about it</h2><p>Describe the item clearly. Keep claims factual and supplier-approved.</p></div></div><div class="field-grid"><div class="field"><label>Description · English</label><textarea name="descriptionEn" maxlength="20000" placeholder="What the product is and what it is used for.">'+esc(p.descriptionEn||"")+'</textarea></div><div class="field"><label>Description · Hindi</label><textarea name="description" maxlength="20000" placeholder="उत्पाद का विवरण।">'+esc(p.description||"")+'</textarea></div></div></section>'+
    '<details class="product-editor-section product-label-details"><summary><span class="section-kicker">05 · LABEL & SAFETY</span><b>Usage, directions and safety information</b><small>Add information copied from the approved supplier label.</small></summary><div class="field-grid"><div class="field"><label>Label information · English</label><textarea name="labelInfo" maxlength="20000" placeholder="Composition or manufacturer information">'+esc(p.labelInfo||"")+'</textarea></div><div class="field"><label>Label information · Hindi</label><textarea name="labelInfoHi" maxlength="20000" placeholder="लेबल की जानकारी">'+esc(p.labelInfoHi||"")+'</textarea></div><div class="field"><label>Directions for use · English</label><textarea name="directions" maxlength="20000" placeholder="Use only the directions supplied with this product">'+esc(p.directions||"")+'</textarea></div><div class="field"><label>Directions for use · Hindi</label><textarea name="directionsHi" maxlength="20000" placeholder="उपयोग के निर्देश">'+esc(p.directionsHi||"")+'</textarea></div><div class="field"><label>Safety and precautions · English</label><textarea name="safetyInfo" maxlength="20000" placeholder="Safety information from the approved label">'+esc(p.safetyInfo||"")+'</textarea></div><div class="field"><label>Safety and precautions · Hindi</label><textarea name="safetyInfoHi" maxlength="20000" placeholder="सुरक्षा और सावधानियां">'+esc(p.safetyInfoHi||"")+'</textarea></div></div></details>'+
    '<div class="product-editor-actions"><div><b>'+(id?"Editing product":"New product")+'</b><small>Save as draft and publish when ready.</small></div><div><a class="btn btn-secondary" href="'+esc(returnTo)+'">Cancel</a>'+(id?'<button type="button" class="btn btn-danger" data-archive="'+id+'">Archive</button>':"")+'<button class="btn btn-primary">Save product</button></div></div></form>';
 } else if(path==="/admin/products/import"){
  content=adminHead("Catalog import","Preview rows and resolve duplicates before applying changes.")+`<section class="admin-card"><p>Upload a CSV with columns: name,nameEn,brand,brandEn,category,categoryEn,sku,pack,pricePaise,mrpPaise,stock,status. Use integer paise for prices.</p><button class="btn btn-secondary" data-template>Download CSV template</button><div class="field" style="margin-top:17px"><label>Choose CSV</label><input id="csv-file" type="file" accept=".csv,text/csv"></div><div id="csv-preview"></div><div class="field" style="max-width:300px;margin-top:12px"><label>Duplicate SKU behavior</label><select class="control" id="import-mode"><option value="create">Create only · report duplicates</option><option value="upsert">Update matching products</option></select></div><button class="btn btn-primary" id="apply-import" data-import disabled style="margin-top:12px">Apply reviewed import</button></section>`;
 } else if(path==="/admin/orders"){
  content=adminHead("Orders","Order management will appear when checkout is enabled.")+`<section class="admin-card admin-unavailable"><span aria-hidden="true">▤</span><div><h2>Online orders are switched off</h2><p>Customers can review the checkout interface, but order submission and payment are disabled. No order queue or status controls are available yet.</p><a class="btn btn-secondary" href="/admin/products">Manage products</a></div></section>`;
 } else if(path==="/admin/inventory"){
  const d=await api("/api/v1/admin/inventory");const vars=d.products.flatMap(p=>p.variants.map(v=>({p,v})));content=adminHead("Inventory","Adjust stock by SKU and leave a reason for each change.")+`<section class="admin-card"><div class="table-wrap"><table class="data-table"><thead><tr><th>Product</th><th>Pack</th><th>SKU</th><th>Available</th><th>Reserved</th><th>Action</th></tr></thead><tbody>${vars.map(({p,v})=>`<tr><td>${esc(p.nameEn)}</td><td>${esc(v.pack)}</td><td>${esc(v.sku)}</td><td>${v.stock}</td><td>${v.reserved||0}</td><td><button class="btn btn-secondary btn-small" data-adjust="${esc(v.sku)}">Adjust stock</button></td></tr>`).join("")}</tbody></table></div><h2 style="margin-top:22px">Recent adjustments</h2><div class="table-wrap"><table class="data-table"><thead><tr><th>When</th><th>SKU</th><th>Change</th><th>Reason</th><th>Order</th></tr></thead><tbody>${d.transactions.slice(0,40).map(x=>`<tr><td>${new Date(x.createdAt).toLocaleString()}</td><td>${esc(x.sku)}</td><td>${x.delta>0?"+":""}${x.delta}</td><td>${esc(x.reason)}</td><td>${esc(x.orderNumber||"—")}</td></tr>`).join("")}</tbody></table></div></section>`;
 } else if(path==="/admin/catalog"){
  content=await categoriesPage(true);
 } else if(path==="/admin/promotions"){
  const d=await api("/api/v1/admin/coupons");content=adminHead("Promotions","Set a discount, expiry, minimum order and usage cap.")+`<section class="admin-card"><form id="coupon-form" class="field-grid"><div class="field"><label>Code</label><input class="control" name="code" placeholder="GROW10" required maxlength="20"></div><div class="field"><label>Discount type</label><select class="control" name="type"><option value="percent">Percent off</option><option value="flat">Amount in ₹</option></select></div><div class="field"><label>Discount value</label><input class="control" name="value" type="number" min="0.01" step="0.01" required></div><div class="field"><label>Minimum order · ₹</label><input class="control" name="minSubtotal" type="number" min="0" step="0.01" value="0"></div><div class="field"><label>Maximum uses (optional)</label><input class="control" name="maxUses" type="number" min="1" step="1" placeholder="Unlimited"></div><div class="field"><label>Expires (optional)</label><input class="control" name="expiresAt" type="date"></div><div class="span-2"><button class="btn btn-primary">Create promotion</button></div></form></section><section class="admin-card"><div class="table-wrap"><table class="data-table"><thead><tr><th>Code</th><th>Discount</th><th>Minimum</th><th>Uses</th><th>Expires</th><th>Status</th><th>Action</th></tr></thead><tbody>${d.items.map(c=>`<tr><td><b>${esc(c.code)}</b></td><td>${c.type==="percent"?`${c.value}%`:`${money(c.value)}`}</td><td>${money(c.minSubtotalPaise||0)}</td><td>${Number(c.usesCount)||0}${c.maxUses?` / ${c.maxUses}`:" / ∞"}</td><td>${c.expiresAt?esc(c.expiresAt):"No expiry"}</td><td>${c.active===false?"Paused":"Active"}</td><td><div class="table-actions"><button class="btn btn-secondary btn-small" data-toggle-coupon="${c.id}" data-active="${c.active===false?"true":"false"}">${c.active===false?"Activate":"Pause"}</button><button class="btn btn-danger btn-small" data-delete-coupon="${c.id}">Remove</button></div></td></tr>`).join("")||"<tr><td colspan='7'>No codes yet.</td></tr>"}</tbody></table></div></section>`;
 } else if(path==="/admin/shipping"){
  const d=await api("/api/v1/admin/service-areas");content=adminHead("Delivery areas","Add service PIN codes, delivery fees and estimates.")+`<div class="callout">Set the delivery areas and rates AgroSeed serves.</div><section class="admin-card"><form id="area-form" class="hero-actions"><input class="control" name="pincode" required inputmode="numeric" pattern="[0-9]{6}" maxlength="6" placeholder="6-digit PIN" style="max-width:150px"><input class="control" name="city" placeholder="City / area" style="max-width:180px"><input class="control" name="feeRupees" type="number" min="0" step="0.01" placeholder="Delivery fee ₹" style="max-width:150px"><input class="control" name="estimate" placeholder="Estimate e.g. 3–5 days" style="max-width:200px"><button class="btn btn-primary">Add PIN</button></form></section><section class="admin-card"><div class="table-wrap"><table class="data-table"><thead><tr><th>PIN</th><th>Area</th><th>Fee</th><th>Estimate</th><th></th></tr></thead><tbody>${d.items.map(x=>`<tr><td>${esc(x.pincode)}</td><td>${esc(x.city)}</td><td>${money(x.feePaise)}</td><td>${esc(x.estimate)}</td><td><button class="btn btn-danger btn-small" data-delete-area="${x.id}">Remove</button></td></tr>`).join("")||"<tr><td colspan='5'>No delivery areas configured.</td></tr>"}</tbody></table></div></section>`;
 } else if(path==="/admin/settings"){
  const d=await api("/api/v1/admin/settings");content=adminHead("Website settings","Manage branding, homepage content, contact details and policies.")+`<section class="admin-card"><h2>Store profile</h2><form id="settings-form" class="field-grid"><div class="field"><label>Store name</label><input name="storeName" value="${esc(d.settings.storeName||"AgroSeed")}"></div><div class="field"><label>Support email</label><input name="supportEmail" type="email" value="${esc(d.settings.supportEmail||"")}" placeholder="Set after client approval"></div><div class="field span-2"><label for="public-domain">Public website domain</label><input id="public-domain" name="publicDomain" type="url" inputmode="url" maxlength="255" value="${esc(d.settings.publicDomain||"")}" placeholder="https://agroseed.in"><small class="hint">Optional until your domain is connected. Enter the full public base URL; used for canonical and social sharing links.</small></div><div class="field"><label>Default language</label><select name="language"><option value="en" ${d.settings.language==="en"?"selected":""}>English</option><option value="hi" ${d.settings.language==="hi"?"selected":""}>Hindi</option></select></div><div class="field"><label>Staff identity</label><input disabled value="Store owner"></div><div class="span-2"><button class="btn btn-primary">Save website settings</button></div></form></section>`;
 } else if(path==="/admin/audit"){
  const d=await api("/api/v1/admin/audit");content=adminHead("Activity log","Recent product, stock, order and store actions.")+`<section class="admin-card"><div class="table-wrap"><table class="data-table"><thead><tr><th>When</th><th>Staff</th><th>Action</th><th>Item</th><th>Details</th></tr></thead><tbody>${d.items.map(x=>`<tr><td>${new Date(x.createdAt).toLocaleString()}</td><td>${esc(x.actor)}</td><td>${esc(x.action)}</td><td>${esc(x.entity)} · ${esc(x.entityId)}</td><td>${esc(x.detail)}</td></tr>`).join("")||"<tr><td colspan='5'>No changes logged yet.</td></tr>"}</tbody></table></div></section>`;
 } else if(path==="/admin/support"){
  const d=await api("/api/v1/admin/support");content=adminHead("Support inbox","Read and manage customer messages.")+`<section class="admin-card"><div class="table-wrap"><table class="data-table"><thead><tr><th>Received</th><th>Customer</th><th>Topic</th><th>Message</th><th>Status</th><th></th></tr></thead><tbody>${d.items.map(x=>`<tr><td>${new Date(x.createdAt).toLocaleString()}</td><td>${esc(x.name)}<span class="table-secondary">${esc(x.email)}</span></td><td>${esc(x.topic)}</td><td>${esc(x.message)}</td><td>${esc(x.status)}</td><td><div class="table-actions">${x.status==="new"?`<button class="btn btn-secondary btn-small" data-support-id="${x.id}" data-status="in_progress">In progress</button>`:""}${x.status!=="resolved"?`<button class="btn btn-secondary btn-small" data-support-id="${x.id}" data-status="resolved">Resolve</button>`:"Resolved"}</div></td></tr>`).join("")||"<tr><td colspan='6'>No messages yet.</td></tr>"}</tbody></table></div></section>`;
 }
 return adminShell(path,content,role);
}
function readForm(form){return Object.fromEntries(new FormData(form).entries());}
function parseVariants(text){return text.split(/\r?\n/).map(line=>line.trim()).filter(Boolean).map(line=>{const [pack,sku,price,mrp,stock]=line.split("|").map(x=>x.trim());return {pack,sku,pricePaise:Math.round(Number(price)*100),mrpPaise:Math.round(Number(mrp)*100),stock:Number(stock)};});}
function parseCsv(text){const rows=[];let row=[],value="",quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'&&quoted&&text[i+1]==='"'){value+='"';i++;}else if(c==='"')quoted=!quoted;else if(c===","&&!quoted){row.push(value.trim());value="";}else if((c==="\n"||c==="\r")&&!quoted){if(c==="\r"&&text[i+1]==="\n")i++;row.push(value.trim());if(row.some(Boolean))rows.push(row);row=[];value="";}else value+=c;}if(quoted)throw new Error("CSV has an unclosed quoted field.");row.push(value.trim());if(row.some(Boolean))rows.push(row);const head=rows.shift()?.map(x=>x.replace(/^\uFEFF/,""))||[];if(!head.length||head.some(x=>!x))throw new Error("CSV needs a header row with column names.");return rows.map(r=>Object.fromEntries(head.map((h,i)=>[h,r[i]||""])));}
async function validateImport(mode){
 const errors=[],valid=[];
 if(rawImportRows.length>1000){importRows=[];importErrors=[{row:0,error:"Import is limited to 1,000 rows per batch."}];renderImportPreview();return;}
 const products=[];let page=1,pages=1;do{const data=await api(`/api/v1/admin/products?page=${page}&limit=100`);products.push(...data.items);pages=data.pages;page++;}while(page<=pages);
 const existing=new Set(products.flatMap(p=>p.variants.map(v=>v.sku.toUpperCase()))),seen=new Set();
 rawImportRows.forEach((row,index)=>{
  const line=index+2,sku=String(row.sku||"").trim().toUpperCase(),price=Number(row.pricePaise),mrp=Number(row.mrpPaise),stock=Number(row.stock),nameEn=String(row.nameEn||"").trim(),name=String(row.name||"").trim(),pack=String(row.pack||"").trim();let message="";
  if(!name||!nameEn)message="English and Hindi product names are required.";
  else if(!pack)message="Pack is required.";
  else if(!/^[A-Z0-9][A-Z0-9._-]{1,39}$/.test(sku))message="SKU must be 2–40 letters, digits, dots, underscores or hyphens.";
  else if(!Number.isSafeInteger(price)||price<0||!Number.isSafeInteger(mrp)||mrp<price)message="Prices must be whole paise and MRP cannot be below selling price.";
  else if(!Number.isSafeInteger(stock)||stock<0)message="Stock must be a non-negative whole number.";
  else if(row.status&&!['draft','review','published','archived'].includes(String(row.status).toLowerCase()))message="Status must be draft, review, published or archived.";
  else if(seen.has(sku))message="This SKU is repeated in the CSV.";
  else if(existing.has(sku)&&mode!=="upsert")message="SKU already exists. Choose Update only after reviewing the matching row.";
  seen.add(sku);if(message)errors.push({row:line,error:message});else valid.push({...row,sku,status:String(row.status||"draft").toLowerCase()});
 });
 importRows=valid;importErrors=errors;renderImportPreview();
}
function renderImportPreview(){const target=$("#csv-preview");if(!target)return;const shown=rawImportRows.slice(0,20);target.innerHTML=`<p class="hint">${rawImportRows.length} CSV rows · ${importRows.length} ready · ${importErrors.length} need correction${importErrors.some(x=>x.row===0)?`<br>${esc(importErrors[0].error)}`:""}</p><div class="table-wrap"><table class="data-table"><thead><tr><th>Row</th><th>English name</th><th>SKU</th><th>Pack</th><th>Price paise</th><th>Stock</th><th>Validation</th></tr></thead><tbody>${shown.map((x,i)=>{const err=importErrors.find(y=>y.row===i+2);return `<tr><td>${i+2}</td><td>${esc(x.nameEn)}</td><td>${esc(x.sku)}</td><td>${esc(x.pack)}</td><td>${esc(x.pricePaise)}</td><td>${esc(x.stock)}</td><td class="${err?"text-danger":""}">${err?esc(err.error):"Ready"}</td></tr>`;}).join("")}</tbody></table></div>${rawImportRows.length>20?`<p class="hint">Showing first 20 rows.</p>`:""}`;$("[data-import]").disabled=!importRows.length;}
function showDialog(title,desc,fields,confirmLabel="Save"){$("#dialog-root").innerHTML=`<div class="dialog-scrim"><form id="dialog-form" class="dialog-card"><h2>${esc(title)}</h2><p>${esc(desc)}</p>${fields}<div class="dialog-actions"><button type="button" class="btn btn-secondary" data-dismiss>Cancel</button><button class="btn btn-primary">${esc(confirmLabel)}</button></div></form></div>`;}
function formDataJson(form){return JSON.stringify(readForm(form));}
async function initPublicGallery(path){try{const product=await api(`/api/v1/products/${encodeURIComponent(path.split("/").pop())}`),images=(product.images||[]).map((image,index)=>({url:typeof image==="string"?image:image?.url,alt:product.imageAlt?.[index]||image?.alt||prodName(product)})).filter(image=>image.url);if(images.length<2)return;const host=$(".detail-image");if(!host)return;host.outerHTML=`<div class="product-gallery-display"><div class="detail-image"><img id="detail-main-image" src="${esc(images[0].url)}" alt="${esc(images[0].alt)}"></div><div class="gallery-thumbnails">${images.map((image,index)=>`<button type="button" class="gallery-thumbnail ${index===0?"active":""}" data-public-image="${index}" aria-label="View product image ${index+1}"><img src="${esc(image.url)}" alt=""></button>`).join("")}</div></div>`;app.dataset.galleryImages=JSON.stringify(images);}catch{}}
function initProductDeliveryCheck(){const detail=$(".detail-copy");if(!detail||$("#delivery-check-form"))return;detail.insertAdjacentHTML("beforeend",'<form id="delivery-check-form" class="product-delivery-check"><label for="product-pincode">Check delivery by PIN code</label><div><input id="product-pincode" name="pincode" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required placeholder="6-digit PIN"><button class="btn btn-secondary">Check</button></div><p id="delivery-check-result" class="hint" aria-live="polite">Enter your PIN to check delivery availability.</p></form>');}
async function initAdminSettingsEditor(){const form=$("#settings-form");if(!form)return;try{const d=await api("/api/v1/admin/settings"),settings=d.settings||{},sections=[{"Page and business copy":[["storeAbout","Store introduction"],["businessDetails","Legal business identity and address"],["supportPhone","Support phone"],["supportDetails","Support hours and contact instructions"]]},{"Home page copy":[["homeHeroEyebrow","Home eyebrow"],["homeHeroHeadline","Home headline"],["homeHeroBody","Home introduction"],["homeHeroNote","Supporting note"],["homeHeroPrimaryCta","Primary button label"],["homeBannerTitle","Catalog banner title"],["homeBannerText","Catalog banner description"],["homeHelpTitle","Help banner title"],["homeHelpText","Help banner description"],["homeProductsTitle","Product shelf heading"]]},{"Policies and operating rules":[["deliveryRules","Delivery regions, fees and estimates (text)"],["codPolicy","Cash on delivery policy"],["cancellationReturnsRules","Cancellation and return rules"],["shippingReturnsPolicy","Shipping & returns page"],["privacyPolicy","Privacy page"],["termsPolicy","Terms page"],["productUseNotice","Product-use notice"]]}];const save=form.querySelector(".span-2:last-child");const markup=sections.flatMap(section=>Object.entries(section)).map(([title,fields])=>`<div class="span-2 settings-section"><h3>${esc(title)}</h3><p class="hint">Leave blank until AgroSeed provides approved text. These values appear on the customer site.</p></div>${fields.map(([name,label])=>`<div class="field span-2"><label for="setting-${name}">${esc(label)}</label><textarea id="setting-${name}" name="${name}" maxlength="20000" placeholder="Not configured. Enter approved text here.">${esc(settings[name]||"")}</textarea></div>`).join("")}`).join("");save?.insertAdjacentHTML("beforebegin",markup + imageFields("brandLogo","Store logo",settings.brandLogo) + imageFields("homeBannerImage","Catalog banner image",settings.homeBannerImage) + imageFields("homeHelpImage","Help banner image",settings.homeHelpImage) + adminNavigationFields(settings));}catch(error){toast("Could not load website settings. "+error.message,true);}}
function applyEditableCustomerCopy(path){const lineBreak=value=>esc(value).replace(/\r?\n/g,"<br>");if(path==="/contact"){const title=$(".page-title")?.outerHTML,form=$("#support-form");if(form){const support=[storefrontSettings.supportDetails,storefrontSettings.supportPhone,storefrontSettings.supportEmail?`Email: ${storefrontSettings.supportEmail}`:"",storefrontSettings.businessDetails].filter(Boolean);form.insertAdjacentHTML("beforebegin",support.length?`<div class="notice support-details">${support.map(lineBreak).join("<br>")}</div>`:`<div class="notice support-details">Support contact details are not configured. Add approved details in Admin &gt; Settings.</div>`);}return title;}
 if(path==="/help"){const callout=$(".category-grid")?.nextElementSibling;if(callout)callout.textContent=storefrontSettings.supportDetails||"Support contact details are not configured. Add approved details in Admin > Settings.";return;}
 const map={"/shipping-returns":["Shipping & returns","shippingReturnsPolicy",[["Delivery rules","deliveryRules"],["Cash on delivery","codPolicy"],["Cancellation and returns","cancellationReturnsRules"]]],"/privacy":["Privacy","privacyPolicy",[]],"/terms":["Terms of service","termsPolicy",[["Business details","businessDetails"]]]},entry=map[path],copy=$(".policy-copy");if(!entry||!copy)return;const [title,key,extra]=entry,sections=[];if(storefrontSettings[key]?.trim())sections.push(`<p>${lineBreak(storefrontSettings[key])}</p>`);for(const [label,field] of extra)if(storefrontSettings[field]?.trim())sections.push(`<h2>${esc(label)}</h2><p>${lineBreak(storefrontSettings[field])}</p>`);copy.innerHTML=`${pageTitle(title)}${sections.length?`<div class="callout">Preview copy. Confirm this content before launch.</div>${sections.join("")}`:`<div class="notice">${esc(title)} text is not configured. Add AgroSeed-approved content in Admin &gt; Settings.</div>`}`;}
async function render(){
 const path=decodeURI(location.pathname.replace(/\/+$/,""))||"/";if(path==="/account/login"){location.replace("/api/v1/customer/login");return;}let html="";if(path==="/shop"){const code=new URLSearchParams(location.search).get("coupon")||"";try{if(/^[A-Z0-9_-]{3,20}$/i.test(code))localStorage.setItem(couponKey,code.toUpperCase());}catch{}}if(!path.startsWith("/admin")){if(localStorage.getItem(customerAuthKey)==="1") await hydrateCustomerCart(); else await hydrateGuestCart();[storefrontSettings,storefrontOffers]=await Promise.all([api("/api/v1/storefront/settings").catch(()=>({})),api("/api/v1/storefront/offers").then(d=>d.items||[]).catch(()=>[])]);}
 try{
  if(path.startsWith("/admin"))html=await adminPage(path);
  else if(path==="/")html=await home();
  else if(path==="/categories")html=await categoriesPage();
  else if(["/shop","/search"].includes(path)||path.startsWith("/category/")||path.startsWith("/brand/"))html=await listing(path);
  else if(path.startsWith("/product/"))html=await productPage(path);
  else if(path==="/cart")html=await cartPage();
  else if(path==="/checkout")html=await checkoutPage();
  else if(path==="/contact")html=contactPage();
  else if(["/help","/shipping-returns","/privacy","/terms"].includes(path))html=policyPage(path);
  else if(path==="/account"||path.startsWith("/account/"))html=await accountPage(path);
  else html=wrap(`<div class="container page-wrap">${empty("Page not found","We couldn't find that page.",'<a class="btn btn-primary" href="/">Back to home</a>')}</div>`);
 }catch(e){html=path.startsWith("/admin")?adminLogin(e.message):wrap(`<div class="container page-wrap">${empty("Something went wrong",e.message,'<a class="btn btn-secondary" href="/">Back to home</a>')}</div>`);}
 if(html)app.innerHTML=html;
 if(path==="/cart"&&$(".summary-card"))$(".summary-card").insertAdjacentHTML("beforeend",`<p class="hint">${language()==="hi"?"कर की गणना नहीं हुई है; अनुमानित कुल में कर शामिल नहीं है।":"Taxes are not calculated yet; the estimated total excludes tax."}</p>`);
 if(path==="/admin/settings")await initAdminSettingsEditor();
 if(!path.startsWith("/admin"))applyEditableCustomerCopy(path);
 if(path.startsWith("/product/")){await initPublicGallery(path);initProductDeliveryCheck();}
 if(path==="/checkout"&&$("#c-coupon")){const profile=savedProfile();$("#c-coupon").value=localStorage.getItem(couponKey)||"";if(!$("#c-name").value)$("#c-name").value=profile.name||"";if(!$("#c-phone").value)$("#c-phone").value=profile.phone||"";}
 if(path==="/cart"&&$(".summary-card .btn-primary")){const code=localStorage.getItem(couponKey)||"";$(".summary-card .btn-primary").insertAdjacentHTML("beforebegin",`<form id="cart-coupon-form"><label class="sr-only" for="cart-coupon">Promotion code</label><div class="coupon-row"><input id="cart-coupon" name="couponCode" placeholder="Promotion code" value="${esc(code)}"><button>Apply</button></div></form><p class="hint">${code?`Promotion ${esc(code)} saved; checkout will recalculate eligibility.`:"Check a promotion code."}</p>`);}
 document.documentElement.lang=language()==="hi"?"hi":"en";
 if(language()==="hi"&&!path.startsWith("/admin"))translateCustomer();
 if(!path.startsWith("/admin"))updatePageMetadata(path);
}
async function addToCart(sku,quantity=1){const rows=cart(),row=rows.find(x=>x.sku===sku);if(row)row.quantity=Math.min(99,row.quantity+quantity);else rows.push({sku,quantity});if(!await saveCart(rows)){toast("Bag saved on this device, but could not sync to the server.",true);return;}toast("Added to your bag.");render();}
async function updateCart(sku,delta){const rows=cart().map(x=>x.sku===sku?{...x,quantity:x.quantity+delta}:x).filter(x=>x.quantity>0);if(!await saveCart(rows)){toast("Bag saved on this device, but could not sync to the server.",true);return;}render();}
function route(path){location.assign(path);}
document.addEventListener("click",async e=>{
 const t=e.target.closest("button,[data-add],[data-remove],[data-cart-step],[data-detail-qty],[data-detail-add],[data-logout],[data-customer-logout],[data-publish],[data-feature],[data-archive],[data-adjust],[data-template],[data-import],[data-delete-coupon],[data-toggle-coupon],[data-delete-area],[data-order-status],[data-support-id],[data-delete-address],[data-default-address],[data-image-up],[data-image-down],[data-image-remove],[data-public-image],[data-dismiss],[data-menu],[data-language],[data-add-variant],[data-remove-variant]");if(!t)return;
 try{
  if(t.hasAttribute("data-add")){addToCart(t.dataset.add);return;}
  if(t.hasAttribute("data-remove")){if(await saveCart(cart().filter(x=>x.sku!==t.dataset.remove)))render();else toast("Bag saved on this device, but could not sync to the server.",true);return;}
  if(t.hasAttribute("data-cart-step")){updateCart(t.dataset.sku,Number(t.dataset.cartStep));return;}
  if(t.hasAttribute("data-detail-qty")){const out=$("#detail-qty");out.value=String(Math.max(1,Math.min(99,Number(out.value)+Number(t.dataset.detailQty))));return;}
  if(t.hasAttribute("data-detail-add")){addToCart(pickedVariant,Number($("#detail-qty").value||1));return;}
  if(t.hasAttribute("data-add-variant")){const list=$("[data-variant-list]");const row=list?.querySelector("[data-variant-row]")?.cloneNode(true);if(row){row.querySelectorAll("input").forEach(input=>{input.value="";});list.append(row);row.querySelector("input")?.focus();}return;}
   if(t.hasAttribute("data-remove-variant")){const rows=[...document.querySelectorAll("[data-variant-row]")],row=t.closest("[data-variant-row]");if(rows.length>1)row.remove();else row?.querySelectorAll("input").forEach(input=>input.value="");return;}
   if(t.hasAttribute("data-menu")){ $(".site-header")?.classList.toggle("menu-open");return;}
  if(t.hasAttribute("data-language")){localStorage.setItem(languageKey,language()==="en"?"hi":"en");render();return;}
  if(t.dataset.browseAction){openBrowseEditor(t.dataset.browseAction,t.dataset.browseId);return;}
  if(t.dataset.demoAction){
   const remove=t.dataset.demoAction==="remove";
   t.disabled=true;
   try{
    await api("/api/v1/admin/demo",{method:remove?"DELETE":"POST"});
    toast(remove?"Demo data removed.":"Demo data added.");
    await render();
   }finally{t.disabled=false;}
   return;
  }
  if(t.hasAttribute("data-logout")){await api("/api/v1/admin/session",{method:"DELETE"});csrf="";route("/admin/login");return;}
  if(t.hasAttribute("data-publish")){const p=await api(`/api/v1/admin/products/${t.dataset.publish}`);p.status=t.dataset.next;await api(`/api/v1/admin/products/${t.dataset.publish}`,{method:"PATCH",body:JSON.stringify(p)});toast("Product status updated.");render();return;}
  if(t.hasAttribute("data-feature")){const p=await api(`/api/v1/admin/products/${t.dataset.feature}`);p.featured=t.dataset.next==="true";await api(`/api/v1/admin/products/${t.dataset.feature}`,{method:"PATCH",body:JSON.stringify(p)});toast("Featured placement updated.");render();return;}
  if(t.hasAttribute("data-archive")){await api(`/api/v1/admin/products/${t.dataset.archive}`,{method:"DELETE"});toast("Product archived.");route("/admin/products");return;}
  if(t.hasAttribute("data-adjust")){showDialog(`Adjust ${t.dataset.adjust}`,"Enter a positive or negative whole number and a reason.",`<div class="field"><label>Stock change (+/-)</label><input name="delta" type="number" step="1" required></div><div class="field" style="margin-top:10px"><label>Reason</label><input name="reason" minlength="5" required></div>`);$("#dialog-form").dataset.sku=t.dataset.adjust;return;}
  if(t.hasAttribute("data-dismiss")){ $("#dialog-root").innerHTML="";return;}
  if(t.hasAttribute("data-delete-coupon")){await api(`/api/v1/admin/coupons/${t.dataset.deleteCoupon}`,{method:"DELETE"});toast("Promotion removed.");render();return;}
  if(t.hasAttribute("data-toggle-coupon")){await api(`/api/v1/admin/coupons/${t.dataset.toggleCoupon}`,{method:"PATCH",body:JSON.stringify({active:t.dataset.active==="true"})});toast("Promotion status updated.");render();return;}
  if(t.hasAttribute("data-delete-area")){await api(`/api/v1/admin/service-areas/${t.dataset.deleteArea}`,{method:"DELETE"});toast("PIN code removed.");render();return;}
  if(t.hasAttribute("data-support-id")){await api(`/api/v1/admin/support/${t.dataset.supportId}`,{method:"PATCH",body:JSON.stringify({status:t.dataset.status||"in_progress"})});toast(t.dataset.status==="resolved"?"Request resolved.":"Request updated.");render();return;}
  if(t.hasAttribute("data-customer-logout")){localStorage.removeItem(customerAuthKey);customerSession=null;csrf="";saveCartLocal([]);location.assign("/account/logout");return;}
  if(t.hasAttribute("data-delete-address")){if(customerSession){await api(`/api/v1/customer/addresses/${encodeURIComponent(t.dataset.deleteAddress)}`,{method:"DELETE"});toast("Address deleted.");render();return;}let rows=addressBook().filter(x=>x.id!==t.dataset.deleteAddress);if(rows.length&&!rows.some(x=>x.isDefault))rows[0].isDefault=true;saveAddressBook(rows);toast("Address deleted from this device.");render();return;}
  if(t.hasAttribute("data-default-address")){if(customerSession){const {items}=await api("/api/v1/customer/addresses"),address=items.find(x=>x.id===t.dataset.defaultAddress);if(address)await api("/api/v1/customer/addresses",{method:"PUT",body:JSON.stringify({...address,isDefault:true})});toast("Default address updated.");render();return;}const rows=addressBook().map(x=>({...x,isDefault:x.id===t.dataset.defaultAddress}));saveAddressBook(rows);toast("Default address updated.");render();return;}
  if(t.hasAttribute("data-public-image")){const images=JSON.parse(app.dataset.galleryImages||"[]"),index=Number(t.dataset.publicImage),image=images[index];if(image){$("#detail-main-image").src=image.url;$("#detail-main-image").alt=image.alt;app.querySelectorAll("[data-public-image]").forEach((button,i)=>button.classList.toggle("active",i===index));}return;}
  if(t.hasAttribute("data-template")){const csv="name,nameEn,brand,brandEn,category,categoryEn,sku,pack,pricePaise,mrpPaise,stock,status\n";const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.download="agroseed-catalog-template.csv";a.click();URL.revokeObjectURL(a.href);return;}
 }catch(err){toast(err.message,true);}
});
document.addEventListener("change",async e=>{
 const t=e.target;
 if(t.matches("[data-variant]")){pickedVariant=t.value;try{const p=await api(`/api/v1/products/${encodeURIComponent(location.pathname.split("/").pop())}`);const v=p.variants.find(x=>x.sku===pickedVariant);$("#detail-price").innerHTML=`${money(v.pricePaise)} ${v.mrpPaise>v.pricePaise?`<del>${money(v.mrpPaise)}</del>`:""}`;$("#detail-sku").textContent=v.sku;$("#detail-stock").textContent=v.stock>0?`${v.stock} available`:"Out of stock";$("[data-detail-add]").disabled=v.stock<1;}catch{}}
 if(t.matches("[data-sort]")){const params=new URLSearchParams(location.search);params.set("sort",t.value);params.set("page","1");location.search=params.toString();}
 if(t.id==="product-filter"||t.id==="status-filter"){const q=$("#product-filter")?.value.toLowerCase()||"",status=$("#status-filter")?.value||"";document.querySelectorAll("[data-product-row]").forEach(r=>r.hidden=!(r.dataset.search.includes(q)&&(!status||r.dataset.status===status)));}
 if(t.id==="csv-file"&&t.files?.[0]){try{rawImportRows=parseCsv(await t.files[0].text());await validateImport($("#import-mode")?.value||"create");}catch(err){rawImportRows=[];importRows=[];importErrors=[];toast(err.message,true);}}
 if(t.id==="import-mode"&&rawImportRows.length){try{await validateImport(t.value);}catch(err){toast(err.message,true);}}
});
document.addEventListener("submit",async e=>{
 const f=e.target;if(!(f instanceof HTMLFormElement))return;
 if(f.matches('form[action="/search"]'))return;
 e.preventDefault();
 try{
  if(f.matches('form.search-tools[action="/admin/products"]')){const params=new URLSearchParams();const q=String(new FormData(f).get("q")||"").trim(),status=String(new FormData(f).get("status")||"");if(q)params.set("q",q);if(status)params.set("status",status);route(`/admin/products${params.size?`?${params}`:""}`);return;}
   if(f.matches('form[action="/admin/search"]')){const q=String(new FormData(f).get("q")||"").trim();route(`/admin/search${q?"?"+new URLSearchParams({q}):""}`);return;}
  if(f.id==="cart-coupon-form"){const code=String(readForm(f).couponCode||"").trim().toUpperCase();if(!code){localStorage.removeItem(couponKey);toast("Promotion removed.");render();return;}const quote=await api("/api/v1/checkout/quote",{method:"POST",body:JSON.stringify({items:cart(),couponCode:code})});localStorage.setItem(couponKey,quote.couponCode);toast(`Promotion applied. Discount: ${money(quote.discountPaise)}.`);render();return;}
  if(f.id==="customer-profile-form"){await api("/api/v1/customer/profile",{method:"PATCH",body:JSON.stringify(readForm(f))});toast("Profile saved to your account.");render();return;}
  if(f.id==="delivery-check-form"){const pin=String(readForm(f).pincode||"").trim(),result=$("#delivery-check-result");result.textContent="Checking delivery availability…";const data=await api(`/api/v1/serviceability/${encodeURIComponent(pin)}`);result.textContent=!data.configured?"No delivery areas are configured yet.":data.available?`Delivery available${data.area.city?` to ${data.area.city}`:""}. Fee: ${money(data.area.feePaise)}${data.area.estimate?` · estimate ${data.area.estimate}`:""}. Confirm current delivery details with AgroSeed.`:"This PIN is not included in the configured delivery areas.";return;}
  if(f.id==="profile-form"){localStorage.setItem(profileKey,JSON.stringify(readForm(f)));toast("Guest profile saved on this device.");return;}
  if(f.id==="address-form"){const d=readForm(f);d.isDefault=d.isDefault==="on";if(customerSession){await api("/api/v1/customer/addresses",{method:d.id?"PUT":"POST",body:JSON.stringify(d)});toast("Address saved to your account.");route("/account/addresses");return;}const rows=addressBook(),id=d.id||`address-${Date.now()}`,isDefault=d.isDefault||!rows.length,record={...d,id,isDefault};const next=rows.filter(x=>x.id!==id).map(x=>({...x,isDefault:isDefault?false:!!x.isDefault}));next.push(record);if(!next.some(x=>x.isDefault))next[0].isDefault=true;saveAddressBook(next);toast("Address saved on this device.");route("/account/addresses");return;}
  if(f.id==="checkout-form") return;
  if(f.id==="support-form"){const d=await api("/api/v1/support/requests",{method:"POST",body:formDataJson(f)});f.innerHTML=`<div class="notice">Your message was sent to AgroSeed. Reference: <b>${esc(d.ticket)}</b>.</div>`;return;}
  if(f.id==="admin-login-form"){const d=await api("/api/v1/admin/session",{method:"POST",body:formDataJson(f)});csrf=d.csrf;route(d.user?.role==="Catalog"?"/admin/products":d.user?.role==="Orders"?"/admin/orders":"/admin");return;}
  if(f.id==="product-form"){
   if(f.dataset.saving)return;
   f.dataset.saving="true";
   try {
   const d=readForm(f);
   for(const name of ["existingImage","existingAlt","productFiles","additionalImage"])delete d[name];
   d.variants=[...f.querySelectorAll("[data-variant-row]")].map(row=>{const value=name=>row.querySelector(`[data-variant-field="${name}"]`)?.value.trim()||"";const price=Number(value("price")),mrp=value("mrp")===""?price:Number(value("mrp"));return {pack:value("pack"),sku:value("sku"),pricePaise:Math.round(price*100),mrpPaise:Math.round(mrp*100),stock:Number(value("stock"))};}).filter(item=>item.pack||item.sku);
   Object.assign(d,await readProductImages(f));
   const id=f.dataset.id;
   await api(id?`/api/v1/admin/products/${id}`:"/api/v1/admin/products",{method:id?"PATCH":"POST",body:JSON.stringify(d)});
   toast("Product saved.");
   route(f.dataset.return);
   }finally{delete f.dataset.saving;}
   return;
  }
  if(f.dataset.browseForm){
   if(f.dataset.saving)return;
   f.dataset.saving="true";
   const submit=f.querySelector(".dialog-actions .btn-primary");
   submit.disabled=true;
   try{await saveBrowseEditor(f);}finally{delete f.dataset.saving;submit.disabled=false;}
   return;
  }
  if(f.id==="dialog-form"){await api("/api/v1/admin/inventory",{method:"POST",body:JSON.stringify({...readForm(f),sku:f.dataset.sku,delta:Number(readForm(f).delta)})});$("#dialog-root").innerHTML="";toast("Inventory adjustment saved.");render();return;}
  if(f.id==="coupon-form"){await api("/api/v1/admin/coupons",{method:"POST",body:formDataJson(f)});toast("Promotion created.");render();return;}
  if(f.id==="area-form"){await api("/api/v1/admin/service-areas",{method:"POST",body:formDataJson(f)});toast("Delivery area added.");render();return;}
  if(f.id==="settings-form"){
   if(f.dataset.saving)return;
   f.dataset.saving="true";
   const button=f.querySelector('button[type="submit"],button.btn-primary');
   button.disabled=true;
   try{
    const values=readForm(f);
    await saveImageFields(f,values);
    await api("/api/v1/admin/settings",{method:"PATCH",body:JSON.stringify(values)});
    toast("Website settings saved.");
   }finally{delete f.dataset.saving;button.disabled=false;}
   return;
  }
 }catch(err){toast(err.message,true);}
});
document.addEventListener("click",async e=>{
 const b=e.target.closest("[data-import]");if(b){try{if(!importRows.length)return;const out=await api("/api/v1/admin/import",{method:"POST",body:JSON.stringify({rows:importRows,mode:$("#import-mode").value})});toast(`Import finished: ${out.created.length} created, ${out.updated.length} updated, ${out.errors.length} errors.`);$("#csv-preview").insertAdjacentHTML("beforeend",out.errors.length?`<div class="callout">${out.errors.map(x=>`Row ${x.row}: ${esc(x.error)}`).join("<br>")}</div>`:`<div class="notice">${out.created.length+out.updated.length} rows applied.</div>`);}catch(err){toast(err.message,true);}}
});
render();







document.addEventListener("keydown",event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="k"&&location.pathname.startsWith("/admin")){event.preventDefault();$("[data-admin-search]")?.focus();}});

document.addEventListener("keydown",event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="k"&&location.pathname.startsWith("/admin")){event.preventDefault();$("[data-admin-search]")?.focus();}});
