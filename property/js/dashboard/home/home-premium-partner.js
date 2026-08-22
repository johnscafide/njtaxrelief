/* Property Home premium Intel + partner composition.
   Keeps Analyst Intel intact while presenting it as a compact half-width brief
   beside the existing Greentree mortgage partner used elsewhere in Watchdog. */
(function(){
'use strict';
if(window.__WATCHDOG_HOME_PREMIUM_PARTNER__)return;
window.__WATCHDOG_HOME_PREMIUM_PARTNER__=true;
var timer=0;

function partner(){
  return '<aside class="wdai-partner" aria-label="Sponsored mortgage partner">'+
    '<a class="wdai-partner-link" href="https://johnvarano.com/" target="_blank" rel="noopener sponsored">'+
      '<div class="wdai-partner-photo"><img src="/johnvarano.jpg" alt="John Varano, Branch Manager at Greentree Mortgage, an HMA Company" loading="lazy"></div>'+
      '<div class="wdai-partner-copy">'+
        '<span class="wdai-partner-label"><i></i> Advertisement · Mortgage partner</span>'+
        '<div class="wdai-partner-brand">Greentree Mortgage <small>an HMA Company</small></div>'+
        '<h3>Know the payment before you fall in love with the house.</h3>'+
        '<p>Taxes are only part of the monthly number. John Varano can help you review the payment, including escrow, before you make a move.</p>'+
        '<div class="wdai-partner-person"><b>John Varano</b><span>Branch Manager | Senior Loan Officer · NMLS #142739</span></div>'+
        '<span class="wdai-partner-cta">Talk Financing <i class="fas fa-arrow-right"></i></span>'+
        '<small class="wdai-partner-disc">Greentree Mortgage, an HMA Company, is a separate company and is not affiliated with Opus Elite Real Estate. You are never required to use a particular lender and are free to shop for a mortgage. Nothing here is a loan commitment, offer of credit, or guarantee of terms.</small>'+
      '</div>'+
    '</a>'+
  '</aside>';
}

function mount(){
  var panel=document.querySelector('#hm-body .ai.wdai[data-watchdog-analyst-intel]');
  if(!panel)return;
  var main=panel.querySelector(':scope > .wdai-main');
  if(!main){
    main=document.createElement('div');
    main.className='wdai-main';
    Array.prototype.slice.call(panel.children).forEach(function(child){
      if(!child.classList.contains('wdai-partner'))main.appendChild(child);
    });
    panel.insertBefore(main,panel.firstChild);
  }else{
    Array.prototype.slice.call(panel.children).forEach(function(child){
      if(child!==main&&!child.classList.contains('wdai-partner'))main.appendChild(child);
    });
  }
  if(!panel.querySelector(':scope > .wdai-partner')){
    var box=document.createElement('div');
    box.innerHTML=partner();
    panel.appendChild(box.firstElementChild);
  }
  panel.classList.add('wdai-split');
}

function schedule(){clearTimeout(timer);timer=setTimeout(mount,80)}
function boot(){
  mount();
  var body=document.getElementById('hm-body');
  if(body)new MutationObserver(schedule).observe(body,{childList:true,subtree:true});
  ['watchdog:intent-ready','watchdog:intent-updated','watchdog:context-refresh','watchdog:profession-updated'].forEach(function(name){window.addEventListener(name,schedule)});
}

window.WatchdogHomePremiumPartner={mount:mount};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
