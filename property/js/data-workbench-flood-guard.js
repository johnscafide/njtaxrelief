/* Data Workbench FEMA request boundary.
   Invalid/missing/out-of-NJ coordinates never leave the browser. */
(function(){
'use strict';
if(window.__WATCHDOG_DW_FLOOD_GUARD__)return;
window.__WATCHDOG_DW_FLOOD_GUARD__=true;

var nativeFetch=window.fetch.bind(window);
var inflight=new Map();

function numeric(value){
  if(value===null||value===undefined||value==='')return null;
  var n=Number(value);
  return Number.isFinite(n)&&n!==0?n:null;
}
function validNj(lat,lon){
  lat=numeric(lat);lon=numeric(lon);
  return lat!==null&&lon!==null&&lat>=38.8&&lat<=41.4&&lon>=-75.7&&lon<=-73.8;
}
function floodUrl(input){
  try{
    var raw=typeof input==='string'?input:(input&&input.url)||'';
    var u=new URL(raw,location.origin);
    return u.origin===location.origin&&u.pathname==='/api/flood-zone'?u:null;
  }catch(_e){return null;}
}
function rejectedResponse(){
  return Promise.resolve(new Response(JSON.stringify({
    error:'Valid New Jersey lat/lon required',
    code:'INVALID_NJ_COORDINATES',
    local_guard:true
  }),{status:400,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}}));
}
function guardedFetch(input,init){
  var url=floodUrl(input);
  if(!url)return nativeFetch(input,init);
  var lat=url.searchParams.get('lat'),lon=url.searchParams.get('lon');
  if(!validNj(lat,lon)){
    console.warn('[data-workbench.flood-request-blocked]',JSON.stringify({reason:'invalid_nj_coordinates'}));
    return rejectedResponse();
  }
  var key=url.pathname+'?lat='+Number(lat).toFixed(6)+'&lon='+Number(lon).toFixed(6);
  if(inflight.has(key))return inflight.get(key).then(function(r){return r.clone();});
  var request=nativeFetch(input,init).then(function(r){return r;}).finally(function(){inflight.delete(key);});
  inflight.set(key,request);
  return request.then(function(r){return r.clone();});
}

window.fetch=guardedFetch;
window.WatchdogFloodRequestGuard={validNj:validNj,contract:'watchdog-data-workbench-flood-guard-v1'};
})();
