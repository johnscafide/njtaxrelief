(function(){
'use strict';
function normalizeTransactionUrl(){
  var path=window.location.pathname.replace(/\/+$/,'');
  if(path==='/transaction/index.html'){
    try{window.history.replaceState(window.history.state,'','/transaction'+window.location.search+window.location.hash);}catch(e){}
  }
}
function loadEvidenceFirst(){
  if(window.__WATCHDOG_TRANSACTION_EVIDENCE_FIRST__||document.querySelector('script[data-transaction-evidence-first]'))return;
  var evidence=document.createElement('script');
  evidence.src='/transaction/evidence-first.js?v=20260916b';
  evidence.async=false;
  evidence.dataset.transactionEvidenceFirst='true';
  document.body.appendChild(evidence);
}
function loadRefinements(){
  if(window.__WATCHDOG_TRANSACTION_REFINEMENTS__||document.querySelector('script[data-transaction-refinements]')){setTimeout(loadEvidenceFirst,0);return;}
  var refinements=document.createElement('script');
  refinements.src='/transaction/refinements.js?v=20260916b';
  refinements.async=false;
  refinements.dataset.transactionRefinements='true';
  refinements.addEventListener('load',loadEvidenceFirst,{once:true});
  document.body.appendChild(refinements);
}
function loadDocuments(){
  if(window.__WATCHDOG_TRANSACTION_DOCUMENTS__||document.querySelector('script[data-transaction-documents]')){setTimeout(loadRefinements,0);return;}
  var documents=document.createElement('script');
  documents.src='/transaction/documents.js?v=20260915a';
  documents.async=false;
  documents.dataset.transactionDocuments='true';
  documents.addEventListener('load',loadRefinements,{once:true});
  document.body.appendChild(documents);
}
function loadMunicipalStatus(){
  if(window.__WATCHDOG_MUNICIPAL_STATUS_WORKFLOWS__||document.querySelector('script[data-transaction-municipal-status]')){setTimeout(loadDocuments,0);return;}
  var status=document.createElement('script');
  status.src='/transaction/municipal-status.js?v=20260915a';
  status.async=false;
  status.dataset.transactionMunicipalStatus='true';
  status.addEventListener('load',loadDocuments,{once:true});
  document.body.appendChild(status);
}
function loadMunicipalClearance(){
  if(window.__WATCHDOG_MUNICIPAL_CLEARANCE_WORKFLOW__||document.querySelector('script[data-transaction-municipal-clearance]')){setTimeout(loadMunicipalStatus,0);return;}
  var workflow=document.createElement('script');
  workflow.src='/transaction/municipal-clearance.js?v=20260915a';
  workflow.async=false;
  workflow.dataset.transactionMunicipalClearance='true';
  workflow.addEventListener('load',loadMunicipalStatus,{once:true});
  document.body.appendChild(workflow);
}
function loadEvidenceAddons(){
  if(window.__WATCHDOG_TRANSACTION_EVIDENCE_ADDONS__||document.querySelector('script[data-transaction-evidence-addons]')){setTimeout(loadMunicipalClearance,0);return;}
  var addon=document.createElement('script');
  addon.src='/transaction/evidence-addons.js?v=20260915a';
  addon.async=false;
  addon.dataset.transactionEvidenceAddons='true';
  addon.addEventListener('load',loadMunicipalClearance,{once:true});
  document.body.appendChild(addon);
}
function loadPreflight(){
  if(window.__WATCHDOG_TRANSACTION_AUTO_PREFLIGHT__||document.querySelector('script[data-transaction-preflight]')){setTimeout(loadEvidenceAddons,0);return;}
  if(document.readyState==='loading'){
    document.write('<script data-transaction-preflight src="/transaction/preflight.js?v=20260916b"><\/script>');
    document.write('<script data-transaction-evidence-addons src="/transaction/evidence-addons.js?v=20260915a"><\/script>');
    document.write('<script data-transaction-municipal-clearance src="/transaction/municipal-clearance.js?v=20260915a"><\/script>');
    document.write('<script data-transaction-municipal-status src="/transaction/municipal-status.js?v=20260915a"><\/script>');
    document.write('<script data-transaction-documents src="/transaction/documents.js?v=20260915a"><\/script>');
    document.write('<script data-transaction-refinements src="/transaction/refinements.js?v=20260916b"><\/script>');
    document.write('<script data-transaction-evidence-first src="/transaction/evidence-first.js?v=20260916b"><\/script>');
    return;
  }
  var script=document.createElement('script');
  script.src='/transaction/preflight.js?v=20260916b';
  script.async=false;
  script.dataset.transactionPreflight='true';
  script.addEventListener('load',loadEvidenceAddons,{once:true});
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
normalizeTransactionUrl();
loadPreflight();
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(patch,0);setTimeout(patch,250);},{once:true});else{setTimeout(patch,0);setTimeout(patch,250);}
})();
