(function(){'use strict';
if(window.__watchdogStudioOpenAITransport)return;
window.__watchdogStudioOpenAITransport=true;
const nativeFetch=window.fetch.bind(window);
const SOURCE='/api/marketing-studio-visual';
const TARGET='/api/marketing-studio-visual-openai';
function urlOf(input){return typeof input==='string'?input:(input&&input.url)||''}
function actionOf(init,input){try{const body=(init&&init.body)||(typeof Request!=='undefined'&&input instanceof Request?null:null);if(typeof body!=='string')return'';return String(JSON.parse(body||'{}')?.action||'')}catch{return''}}
window.fetch=function(input,init){
  const url=urlOf(input);
  if(!String(url).includes(SOURCE))return nativeFetch(input,init);
  const action=actionOf(init,input);
  if(action!=='status'&&action!=='generate')return nativeFetch(input,init);
  const next=String(url).replace(SOURCE,TARGET);
  if(typeof Request!=='undefined'&&input instanceof Request){return nativeFetch(new Request(next,input),init)}
  return nativeFetch(next,init);
};
})();
