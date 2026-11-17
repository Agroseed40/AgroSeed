const appRoutes = new Set(["/","/shop","/cart","/checkout","/search","/help","/contact","/shipping-returns","/privacy","/terms","/guides","/track-order"]);
function isAppRoute(p){return appRoutes.has(p)||/^\/(category|brand|product|order|guides)\/[^/]+$/.test(p)||/^\/account(?:\/(?:login|orders|addresses))?$/.test(p)||/^\/admin(?:\/.*)?$/.test(p);}
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
export default {async fetch(request,env){
 const url=new URL(request.url),p=url.pathname.replace(/\/+$/,"")||"/";
 if(p==="/health"||p==="/api/v1/health")return json({status:"ok",service:"agroseed-worker",database:"D1",mode:"preview"});
 if(p==="/runtime-config.js")return new Response('window.AGROSEED_CONFIG = Object.freeze({"mode":"sandbox","demoMode":true});',{headers:{"content-type":"text/javascript; charset=utf-8","cache-control":"no-store"}});
 if(p==="/api/v1/products"&&request.method==="GET"){
  const search=(url.searchParams.get("q")||"").toLowerCase(),category=url.searchParams.get("category");
  const {results}=await env.DB.prepare("SELECT p.id,p.name,p.slug,p.price_paise,p.description,p.image_path,c.name AS category,i.quantity AS stock FROM products p LEFT JOIN categories c ON c.id=p.category_id LEFT JOIN inventory i ON i.product_id=p.id WHERE p.is_active=1 ORDER BY p.id").all();
  const items=results.map(r=>({...r,nameEn:r.name,categoryEn:r.category,pricePaise:r.price_paise,active:true,brand:"AgroSeed",brandEn:"AgroSeed",sku:"AS-"+r.id})).filter(r=>(!category||r.category===category)&&(!search||[r.name,r.category,r.sku].some(v=>String(v||"").toLowerCase().includes(search))));
  return json({items,total:items.length});
 }
 if(p.startsWith("/api/"))return json({error:"This endpoint has not yet been migrated to Cloudflare D1. Checkout and account operations are disabled."},503);
 if(request.method!=="GET"&&request.method!=="HEAD")return new Response("Method not allowed",{status:405});
 if(isAppRoute(p)){const assetUrl=new URL("/app.html",url);return env.ASSETS.fetch(new Request(assetUrl,request));}
 return env.ASSETS.fetch(request);
}};
