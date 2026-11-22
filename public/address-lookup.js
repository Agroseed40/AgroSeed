// Optional location helpers for verified customer address and checkout forms.
// GPS is requested only after a click. Coordinates go from the browser directly
// to BigDataCloud; AgroSeed never receives or stores precise coordinates.
(() => {
  "use strict";
  const pinPattern = /^[0-9]{6}$/;
  const geoUrl = "https://api.bigdatacloud.net/data/reverse-geocode-client";
  let pinTimer = null;

  function field(form, key) {
    return form?.querySelector(`[data-checkout-address="${key}"]`) ||
      form?.elements.namedItem(key) || null;
  }
  function status(form, message, error = false) {
    const el = form?.querySelector("[data-address-status]");
    if (!el) return;
    el.textContent = message;
    el.classList.toggle("text-danger", error);
  }
  const controls = () => `<div class="table-actions address-lookup-actions">
    <button type="button" class="btn btn-secondary btn-small" data-address-locate>⌖ Use my current location</button>
    <button type="button" class="btn btn-secondary btn-small" data-address-pin>Find city/state from PIN</button>
  </div><p class="hint" data-address-status role="status" aria-live="polite">Location fills only approximate city, state and possibly PIN. Enter your house, street and landmark manually. If you allow location access, your coordinates go directly to BigDataCloud; AgroSeed does not save them.</p>`;
  window.AgroSeedAddressControls = controls;

  function updateCheckout(form) {
    if(form.id === "checkout-form") {
      const pin = field(form,"pincode");
      pin?.dispatchEvent(new Event("change",{ bubbles:true }));
    }
  }
  async function lookupPin(form, button=null, automatic=false) {
    const pinField = field(form,"pincode"), pin = String(pinField?.value||"").trim();
    if(!pinPattern.test(pin)) {
      if(!automatic) status(form,"Enter a valid six-digit PIN first.",true);
      return;
    }
    if(form.dataset.lookupPin === pin) return;
    form.dataset.lookupPin=pin;
    if(button) button.disabled=true;
    if(!automatic) status(form,"Looking up PIN code…");
    try {
      const response = await fetch("/api/v1/address/pincode/"+encodeURIComponent(pin),{
        credentials:"same-origin",
        headers:{"Accept":"application/json"},
        signal:AbortSignal.timeout(7500)
      });
      const data = await response.json();
      if(!response.ok)throw new Error(data.error||"PIN lookup unavailable.");
      if(String(pinField.value).trim()!==pin)return;
      const city = field(form,"city"), state = field(form,"state");
      const pinChanged = pin !== pinField.defaultValue;
      if(city && (button || !city.value.trim() || pinChanged)) city.value=String(data.city||"").slice(0,100);
      if(state && (button || !state.value.trim() || pinChanged)) state.value=String(data.state||"").slice(0,100);
      status(form,"Found "+data.city+", "+data.state+". Verify your village/city and full street address before saving.");
      updateCheckout(form);
    } catch(error) {
      // Postal provider outages must never block manual entry or saving.
      status(form,error?.message||"Postal lookup unavailable; enter city and state manually.",true);
    } finally {
      if(form.dataset.lookupPin===pin)delete form.dataset.lookupPin;
      if(button)button.disabled=false;
    }
  }

  async function useLocation(form,button) {
    if(!navigator.geolocation){
      status(form,"Your browser does not support location access. Enter the address manually.",true);return;
    }
    button.disabled=true;
    status(form,"Allow location access in your browser to fill approximate city and state…");
    try {
      const position = await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{
        enableHighAccuracy:true,timeout:15000,maximumAge:0
      }));
      const {latitude,longitude} = position.coords;
      const url=new URL(geoUrl);
      url.searchParams.set("latitude",String(latitude));
      url.searchParams.set("longitude",String(longitude));
      url.searchParams.set("localityLanguage","en");
      const response=await fetch(url.toString(),{signal:AbortSignal.timeout(12000)});
      if(!response.ok)throw new Error("Location lookup unavailable. Enter address manually.");
      const data=await response.json();
      if(data.countryCode!=="IN")throw new Error("Your device appears outside India. Enter address manually.");
      const approximate={
        city:String(data.city||data.locality||"").slice(0,100),
        state:String(data.principalSubdivision||"").slice(0,100),
        pincode:pinPattern.test(String(data.postcode||""))?String(data.postcode):""
      };
      if(!Object.values(approximate).some(Boolean))throw new Error("This location has no usable address details.");
      for(const [key,value] of Object.entries(approximate)){
        const input=field(form,key);
        if(input&&value)input.value=value;
      }
      status(form,"Approximate location filled. Please verify the PIN and add your correct house, street and landmark before saving.");
      updateCheckout(form);
    } catch(error) {
      const message=error?.code===1?"Location permission denied. You can still type your address.":
        error?.code===2?"Location unavailable. Enable GPS or enter the address manually.":
        error?.code===3?"Location timed out. Try again or enter the address manually.":
        error?.message||"Location could not be determined.";
      status(form,message,true);
    } finally {button.disabled=false;}
  }

  async function saveCheckoutAddress(form,button) {
    const addressId=form.elements.namedItem("addressId")?.value;
    if(!addressId)throw new Error("Choose a saved address first.");
    const address={id:addressId};
    for(const key of ["name","phone","line1","line2","city","state","pincode"])address[key]=String(field(form,key)?.value||"").trim();
    button.disabled=true;
    status(form,"Saving these changes to your account…");
    try {
      const sessionResponse=await fetch("/api/v1/customer/session",{credentials:"same-origin",headers:{"Accept":"application/json"}});
      if(!sessionResponse.ok)throw new Error("Sign in again before saving your address.");
      const session=await sessionResponse.json();
      if(!session.csrf)throw new Error("The account session is invalid. Sign in again.");
      const listResponse=await fetch("/api/v1/customer/addresses",{credentials:"same-origin"});
      if(!listResponse.ok)throw new Error("Could not read your saved addresses.");
      const list=await listResponse.json();
      const selected=(list.items||[]).find(row=>row.id===addressId);
      if(!selected)throw new Error("The saved address is no longer available.");
      address.isDefault=Boolean(selected.isDefault);
      const response=await fetch("/api/v1/customer/addresses",{
        method:"PUT",credentials:"same-origin",
        headers:{"Content-Type":"application/json","X-Requested-With":"XMLHttpRequest","x-agroseed-csrf":session.csrf},
        body:JSON.stringify(address)
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.error||"Could not save address.");
      status(form,"Address saved to your account for future checkouts.");
    } finally {button.disabled=false;}
  }

  document.addEventListener("click",async event=>{
    const button=event.target.closest("[data-address-locate],[data-address-pin],[data-save-checkout-address]");
    if(!button)return;
    const form=button.closest("form");
    if(!form)return;
    event.preventDefault();
    try {
      if(button.hasAttribute("data-address-locate"))await useLocation(form,button);
      else if(button.hasAttribute("data-address-pin"))await lookupPin(form,button);
      else await saveCheckoutAddress(form,button);
    } catch(error) {status(form,error?.message||"Address could not be saved.",true);}
  });
  // Fetch city/state as soon as a six-digit PIN is entered; do not alter street or recipient.
  document.addEventListener("input",event=>{
    const target=event.target,form=target?.form;
    if(!form||!["address-form","checkout-form"].includes(form.id)||target!==field(form,"pincode"))return;
    clearTimeout(pinTimer);
    if(pinPattern.test(String(target.value||"").trim())){
      pinTimer=setTimeout(()=>{if(target.isConnected)lookupPin(form,null,true);},450);
    }
  });
})();
