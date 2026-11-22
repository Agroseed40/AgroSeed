const endpoint = "https://agroseed-preview.durgesh5757g.workers.dev/api/v1/checkout/quote";
const payload = pin => ({items:[{sku:"AGS-VEG-01-A",quantity:1}],couponCode:"",address:{name:"Checkout QA",phone:"9876543210",line1:"123 Fake QA Street",city:"Bhopal",state:"Madhya Pradesh",pincode:pin}});
const request=async pin => {
 const response=await fetch(endpoint,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload(pin))});
 let json;try{json=await response.json();}catch{throw Error("Non-JSON quote response "+response.status)}
 return {status:response.status,json};
};
const valid=await request("462001");
const invalid=await request("abc123");
if(valid.status!==200||valid.json.totalPaise!==4900||valid.json.shippingPaise!==0||valid.json.serviceability!=="preview_only")throw Error("Valid test quote failed: "+JSON.stringify(valid).slice(0,1300));
if(invalid.status!==400||!/valid 6-digit PIN/i.test(invalid.json.error||""))throw Error("Bad PIN was not rejected: "+JSON.stringify(invalid));
console.log("PRODUCTION_QUOTE_TEST_PASSED",JSON.stringify({valid:{status:valid.status,totalPaise:valid.json.totalPaise,serviceability:valid.json.serviceability,shippingPaise:valid.json.shippingPaise},invalid:{status:invalid.status,error:invalid.json.error}}));
