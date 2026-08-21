(function(){'use strict';
const mq=window.matchMedia('(max-width: 720px)');
if(!mq.matches)return;
const $=(s,r=document)=>r.querySelector(s);
let bootTimer=null;
function makeAction(label,attr){return `<button type="button" class="ms-primary msar-mobile-recovery-action" ${attr}>${label}</button>`;}
function enhanceTableState(){
 const body=$('#msar-body');if(!body)return;
 const cell=$('.msar-loading',body);if(!cell)return;
 const text=(cell.textContent||'').trim();
 if(cell.querySelector('.fa-spin')){
   cell.setAttribute('role','status');
   cell.setAttribute('aria-live','polite');
   return;
 }
 if(cell.dataset.mobileRecovery==='1')return;
 if(/^No properties match/i.test(text)){
   cell.dataset.mobileRecovery='1';
   cell.innerHTML=`<div class="msar-mobile-state" role="status"><strong>No matching properties</strong><p>${text}</p>${makeAction('Reset filters','data-msar-mobile-reset')}</div>`;
   return;
 }
 if(text){
   cell.dataset.mobileRecovery='1';
   cell.innerHTML=`<div class="msar-mobile-state msar-mobile-state-error" role="alert"><strong>Audience data could not load</strong><p>${text}</p>${makeAction('Retry','data-msar-mobile-retry')}</div>`;
 }
}
function enhanceBootState(){
 const shell=$('#ms-audience-review');
 if(shell){if(bootTimer){clearTimeout(bootTimer);bootTimer=null;}return;}
 const loader=$('#ms-app .ms-loading');
 if(!loader||loader.dataset.mobileRecovery==='1')return;
 if(bootTimer)return;
 bootTimer=setTimeout(()=>{
   bootTimer=null;
   if($('#ms-audience-review'))return;
   const stale=$('#ms-app .ms-loading');if(!stale)return;
   stale.dataset.mobileRecovery='1';
   stale.innerHTML=`<div class="msar-mobile-state msar-mobile-state-error" role="alert"><strong>Audience Review did not finish opening</strong><p>Your campaign data may be temporarily unavailable. Retry without losing the campaign URL.</p>${makeAction('Retry Audience Review','data-msar-mobile-reload')}</div>`;
 },12000);
}
function retryPage(){
 const pageSize=$('#msar-page-size');
 if(pageSize){pageSize.dispatchEvent(new Event('change',{bubbles:true}));return;}
 const search=$('#msar-search');
 if(search)search.dispatchEvent(new Event('input',{bubbles:true}));
}
document.addEventListener('click',e=>{
 const reset=e.target.closest('[data-msar-mobile-reset]');
 if(reset){
   const filterReset=$('#msar-filter-reset');
   if(filterReset){filterReset.click();return;}
   const search=$('#msar-search');if(search){search.value='';search.dispatchEvent(new Event('input',{bubbles:true}));}
   return;
 }
 if(e.target.closest('[data-msar-mobile-retry]')){retryPage();return;}
 if(e.target.closest('[data-msar-mobile-reload]'))location.reload();
});
function scan(){enhanceBootState();enhanceTableState();}
scan();
const root=$('#ms-app')||document.body;
new MutationObserver(scan).observe(root,{childList:true,subtree:true,characterData:true});
})();
