(function(){'use strict';
if(window.__watchdogMarketingFunctionTransport)return;
window.__watchdogMarketingFunctionTransport=true;
const nativeFetch=window.fetch.bind(window);
const TARGET='/functions/v1/marketing-direct-mail-launch';
function isTarget(input){const url=typeof input==='string'?input:(input&&input.url)||'';return String(url).includes(TARGET)}
function safeHeaders(source){const incoming=new Headers(source||{}),out=new Headers();['authorization','apikey','content-type','accept'].forEach(name=>{const value=incoming.get(name);if(value)out.set(name,value)});return out}
window.fetch=function(input,init){
  if(!isTarget(input))return nativeFetch(input,init);
  const source=(init&&init.headers)||(typeof Request!=='undefined'&&input instanceof Request?input.headers:null);
  const headers=safeHeaders(source);
  if(typeof Request!=='undefined'&&input instanceof Request){return nativeFetch(new Request(input,{...(init||{}),headers}))}
  return nativeFetch(input,{...(init||{}),headers});
};
})();
