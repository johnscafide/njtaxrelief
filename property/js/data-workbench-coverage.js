(function(){'use strict';
/* Field-library coverage line from the database-governed provider registry
   (get_workbench_provider_coverage). Writes are idempotent so the document observer settles.
   A marker with no registry row keeps its catalog status; it is not labeled "not connected". */
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>Array.from(r.querySelectorAll(s));let coverage=new Map(),ready=false,timer=0;
const planLabel=s=>String(s||'').replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
function scopeText(scopes){const a=Array.isArray(scopes)?scopes:[];if(!a.length)return'Catalog';return a.map(x=>x==='property'?'Property':x==='town'?'Town':x==='county'?'County':planLabel(x)).join(' · ')}
function set(node,key,value){if(node&&node[key]!==value)node[key]=value}
function decorate(){if(!ready)return;const host=$('#dw-fields-list');if(!host)return;$$('.dw-field',host).forEach(row=>{const input=$('[data-field]',row);if(!input)return;const c=coverage.get(input.dataset.field);let line=$('.dw-coverage-line',row);if(!c){if(line)line.remove();return}if(!line){line=document.createElement('small');line.className='dw-coverage-line';const copy=$('.dw-field-copy',row)||$('span',row);if(!copy)return;copy.appendChild(line)}set(line,'textContent','Resolves at: '+scopeText(c.scopes));if(line.dataset.coverage!==String(c.value_status||'registered'))line.dataset.coverage=String(c.value_status||'registered');if(row.dataset.providerCoverage!==String(c.value_status||'registered'))row.dataset.providerCoverage=String(c.value_status||'registered')})}
async function load(){const c=window.NJPTRAccess&&window.NJPTRAccess.client?window.NJPTRAccess.client():null;if(!c)return false;const r=await c.rpc('get_workbench_provider_coverage');if(r.error)throw r.error;coverage=new Map((r.data||[]).map(x=>[x.marker_id,x]));ready=true;decorate();return true}
window.WatchdogWorkbenchCoverage={get:id=>coverage.get(String(id||''))||null,ready:()=>ready};
function start(){Promise.resolve(window.njptrAccessReady).then(()=>load()).catch(e=>{if(window.WatchdogAgentSafety)window.WatchdogAgentSafety.report('workbench-provider-coverage',e)});new MutationObserver(()=>{if(ready){clearTimeout(timer);timer=setTimeout(decorate,40)}}).observe(document.documentElement,{childList:true,subtree:true})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
