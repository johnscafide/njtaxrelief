(function(){'use strict';
/* Data Workbench provider-state summary and cell styling.
   The Workbench renderer writes every cell's text, tooltip and data-provider-status. This script
   only styles missing cells by state and summarizes the visible grid; it never rewrites cell text,
   so it cannot fight the renderer or re-trigger itself. */
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
const CLASS={provider_missing:'dw-provider-missing',source_checked_no_value:'dw-provider-empty',not_computed:'dw-provider-pending',dependency_missing:'dw-provider-pending',not_entitled:'dw-provider-denied',provider_error:'dw-provider-missing'};
function setText(node,value){if(node&&node.textContent!==value)node.textContent=value}
function style(){$$('#dw-rows td[data-provider-status]').forEach(cell=>{const want=CLASS[cell.dataset.providerStatus]||'';Object.values(CLASS).forEach(c=>{const on=c===want;if(cell.classList.contains(c)!==on)cell.classList.toggle(c,on)})})}
function summarize(){const host=$('#dw-col-note'),w=window.WatchdogDataWorkbench;if(!host||!w)return;const byPin=new Map(w.rows().filter(r=>r&&r.pams_pin).map(r=>[String(r.pams_pin),r])),cols=$$('#dw-head th[data-col]').map(x=>x.dataset.col),count={available:0,source_checked_no_value:0,not_computed:0,provider_missing:0,other:0};$$('#dw-rows [data-row]').forEach(cb=>{const row=byPin.get(cb.dataset.row);if(!row)return;cols.forEach(id=>{if(w.hasValue(row,id)){count.available++;return}const st=row.__meta&&row.__meta[id]&&row.__meta[id].status;if(!st)return;if(st in count)count[st]++;else count.other++})});let note=$('#dw-provider-summary',host);if(!note){note=document.createElement('span');note.id='dw-provider-summary';note.title='Field results across the properties and fields shown in the grid.';host.appendChild(note)}setText(note,' · '+count.available.toLocaleString()+' values'+(count.source_checked_no_value?' · '+count.source_checked_no_value.toLocaleString()+' no value at source':'')+(count.not_computed?' · '+count.not_computed.toLocaleString()+' not yet scored':'')+(count.provider_missing?' · '+count.provider_missing.toLocaleString()+' not connected yet':''))}
let timer=0;function apply(){clearTimeout(timer);timer=setTimeout(()=>{style();summarize()},30)}
function start(){const boot=()=>{const rows=$('#dw-rows');if(!rows)return false;new MutationObserver(apply).observe(rows,{childList:true});apply();return true};if(boot())return;const mo=new MutationObserver(()=>{if(boot())mo.disconnect()});mo.observe(document.documentElement,{childList:true,subtree:true})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
