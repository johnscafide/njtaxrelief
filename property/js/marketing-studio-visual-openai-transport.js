(function(){'use strict';
if(window.__watchdogStudioOpenAITransport)return;
window.__watchdogStudioOpenAITransport=true;
const nativeFetch=window.fetch.bind(window);
const SOURCE='/api/marketing-studio-visual';
const TARGET='/api/marketing-studio-visual-openai-v2';
function urlOf(input){return typeof input==='string'?input:(input&&input.url)||''}
function bodyOf(init,input){try{const body=(init&&init.body)||(typeof Request!=='undefined'&&input instanceof Request?null:null);if(typeof body!=='string')return{};return JSON.parse(body||'{}')||{}}catch{return{}}}
async function activateStudioVisual(payload){const campaignId=String(payload?.campaign_id||''),assetId=String(payload?.asset_id||'');if(!campaignId||!assetId)return;await window.njptrAccessReady;const client=window.NJPTRAccess?.client?.();if(!client)throw new Error('Marketing Studio session is unavailable.');const r=await client.rpc('marketing_activate_studio_visual',{p_campaign_id:campaignId,p_asset_id:assetId});if(r.error)throw r.error;try{sessionStorage.removeItem('watchdog_pcm_design')}catch{}return r.data}
window.fetch=async function(input,init){
  const url=urlOf(input);
  if(!String(url).includes(SOURCE))return nativeFetch(input,init);
  const payload=bodyOf(init,input),action=String(payload?.action||'');
  if(action==='status'||action==='generate'){
    const next=String(url).replace(SOURCE,TARGET);
    if(typeof Request!=='undefined'&&input instanceof Request)return nativeFetch(new Request(next,input),init);
    return nativeFetch(next,init);
  }
  const response=await nativeFetch(input,init);
  if(action==='select'&&response.ok){
    try{await activateStudioVisual(payload)}catch(e){return new Response(JSON.stringify({error:e?.message||'Could not activate this Studio visual.'}),{status:409,headers:{'Content-Type':'application/json'}})}
  }
  return response;
};
})();
