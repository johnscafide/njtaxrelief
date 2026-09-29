(function(){'use strict';
/* Data Workbench derived-marker bridge.
   Asks workbench-derived for visible property/field pairs the base resolver did not answer, and
   merges the governed results into the Workbench state (window.WatchdogDataWorkbench), which
   renders every cell. Each pair is asked once per loaded row, so a re-render never re-requests. */
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>Array.from(r.querySelectorAll(s));
let busy=false,again=false,timer=0;
function client(){return window.NJPTRAccess&&window.NJPTRAccess.client?window.NJPTRAccess.client():null}
function api(){return window.WatchdogDataWorkbench||null}
function pins(){return [...new Set($$('#dw-rows [data-row]').map(x=>x.dataset.row).filter(Boolean))]}
function cols(){return $$('#dw-head th[data-col]').map(x=>x.dataset.col).filter(id=>id!=='fema.flood_zone'&&id!=='fema.flood_risk')}
function present(v){return v!==null&&v!==undefined&&v!==''}
function asked(row){if(!row.__derivedChecked)Object.defineProperty(row,'__derivedChecked',{value:new Set(),enumerable:false});return row.__derivedChecked}
// Derived formulas answer pairs with no value whose only state is "no base provider" (or no state yet).
function wants(row,id){if(!row)return false;const w=api();if(w&&w.hasValue(row,id))return false;if(asked(row).has(id))return false;const st=row.__meta&&row.__meta[id]&&row.__meta[id].status;return !st||st==='provider_missing'}
// Only pairs that still have no value and no specific state are marked; a base-provider answer is kept.
function markMeta(byPin,batch,ids,status,reason){const w=api(),meta={};batch.forEach(pin=>{const row=byPin.get(pin);if(!row)return;ids.forEach(id=>{const st=row.__meta&&row.__meta[id]&&row.__meta[id].status;if(w.hasValue(row,id)||(st&&st!=='provider_missing'))return;(meta[pin]||(meta[pin]={}))[id]={status,provider_kind:'derived_governed',source:'Watchdog governed formula registry',reason,checked_at:new Date().toISOString()}})});w.mergeProviderPayload({meta})}
async function hydrate(){if(busy){again=true;return}const c=client(),w=api();if(!c||!w)return;const byPin=new Map(w.rows().filter(r=>r&&r.pams_pin).map(r=>[String(r.pams_pin),r])),ids=cols(),todo=pins().filter(pin=>ids.some(id=>wants(byPin.get(pin),id)));if(!todo.length)return;busy=true;let merged=false;try{for(let i=0;i<todo.length;i+=250){const batch=todo.slice(i,i+250),want=ids.filter(id=>batch.some(pin=>wants(byPin.get(pin),id))).slice(0,250);if(!want.length)continue;batch.forEach(pin=>{const row=byPin.get(pin);if(row)want.forEach(id=>asked(row).add(id))});try{const r=await c.functions.invoke('workbench-derived',{body:{pams_pins:batch,marker_ids:want}});if(r.error)throw r.error;w.mergeProviderPayload({markers:r.data&&r.data.markers,meta:r.data&&r.data.meta});merged=true}catch(e){const status=e&&e.context&&e.context.status;if(status===403){markMeta(byPin,batch,want,'not_entitled','Calculated Watchdog fields are included with Pro and higher plans.');merged=true}if(window.WatchdogAgentSafety)window.WatchdogAgentSafety.report('workbench-derived-bridge',e)}}}finally{busy=false;if(merged)w.scheduleRender();if(again){again=false;setTimeout(hydrate,80)}}}
function later(){clearTimeout(timer);timer=setTimeout(hydrate,120)}
function start(){const ready=()=>$('#dw-head')&&$('#dw-rows');const boot=()=>{new MutationObserver(later).observe($('#dw-head'),{childList:true});new MutationObserver(later).observe($('#dw-rows'),{childList:true});document.addEventListener('change',e=>{if(e.target.matches('[data-field]'))later()});later()};if(ready())boot();else{const mo=new MutationObserver(()=>{if(ready()){mo.disconnect();boot()}});mo.observe(document.documentElement,{childList:true,subtree:true})}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
