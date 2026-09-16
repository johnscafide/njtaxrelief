(function(){
'use strict';
if(window.__WATCHDOG_TRANSACTION_ADD_FLOW_FIX__)return;
window.__WATCHDOG_TRANSACTION_ADD_FLOW_FIX__=true;

function patch(){
  var hiddenAdd=document.querySelector('.tx-command-strip [data-tx-action="add"]');
  if(hiddenAdd)hiddenAdd.removeAttribute('data-tx-action');
  var railAdd=document.querySelector('.tx-portfolio-head [data-tx-action="add"]');
  if(railAdd){
    railAdd.setAttribute('aria-label','Add transaction');
    railAdd.setAttribute('title','Add transaction');
  }
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',patch,{once:true});else patch();
})();
