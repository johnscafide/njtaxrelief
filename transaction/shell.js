(function(){
'use strict';
function loadPreflight(){
  if(window.__WATCHDOG_TRANSACTION_AUTO_PREFLIGHT__||document.querySelector('script[data-transaction-preflight]'))return;
  if(document.readyState==='loading'){
    document.write('<script data-transaction-preflight src="/transaction/preflight.js?v=20260915b"><\/script>');
    return;
  }
  var script=document.createElement('script');
  script.src='/transaction/preflight.js?v=20260915b';
  script.async=false;
  script.dataset.transactionPreflight='true';
  document.body.appendChild(script);
}
function patch(){
  var bar=document.querySelector('.wdx-pagebar');
  if(bar){
    var kicker=bar.querySelector('.wdx-kicker'),h=bar.querySelector('h1'),p=bar.querySelector('p');
    if(kicker)kicker.textContent='Pro+ transaction intelligence';
    if(h)h.textContent='Transaction Command Center';
    if(p)p.textContent='Coordinate closing readiness, disclosures, assignments and source-aware Watchdog evidence across every active deal.';
    var primary=bar.querySelector('.wdx-page-actions .primary');
    if(primary){primary.href='/property/pro';primary.innerHTML='<i class="fas fa-briefcase"></i> Professional Hub';}
  }
  var nav=document.querySelector('.wd4-nav-links');
  if(nav&&!nav.querySelector('a[href="/transaction"]')){
    var link=document.createElement('a');link.href='/transaction';link.className='active';link.innerHTML='<i class="fas fa-file-signature"></i>Transactions';
    var account=nav.querySelector('a[href="/property/account"]');nav.insertBefore(link,account||null);
  }
}
loadPreflight();
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(patch,0);setTimeout(patch,250);},{once:true});else{setTimeout(patch,0);setTimeout(patch,250);}
})();
