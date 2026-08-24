/* Property Home premium Intelligence + partner composition.
   Watchdog Intelligence remains primary; the inline Greentree unit is a compact quarter-width rail.
   A separate rotating sponsor banner is mounted immediately before the official footer. */
(function(){
'use strict';
if(window.__WATCHDOG_HOME_PREMIUM_PARTNER__)return;
window.__WATCHDOG_HOME_PREMIUM_PARTNER__=true;
var timer=0;

function ensureAssets(){
  if(!document.querySelector('script[data-watchdog-home-hero-intelligence]')){
    var hero=document.createElement('script');hero.src='/property/js/dashboard/home/home-hero-intelligence.js';hero.async=false;hero.setAttribute('data-watchdog-home-hero-intelligence','1');document.body.appendChild(hero);
  }
  if(!document.querySelector('link[data-watchdog-home-ad-quarter]')){
    var css=document.createElement('link');css.rel='stylesheet';css.href='/property/css/home/home-ad-quarter.css';css.setAttribute('data-watchdog-home-ad-quarter','1');document.head.appendChild(css);
  }
  if(!document.querySelector('script[data-watchdog-home-intelligence-brand]')){
    var brand=document.createElement('script');brand.src='/property/js/dashboard/home/home-watchdog-intelligence-brand.js';brand.async=false;brand.setAttribute('data-watchdog-home-intelligence-brand','1');document.body.appendChild(brand);
  }
  if(!document.querySelector('script[data-watchdog-home-intelligence]')){
    var intelligence=document.createElement('script');intelligence.src='/property/js/dashboard/home/home-watchdog-intelligence.js';intelligence.async=false;intelligence.setAttribute('data-watchdog-home-intelligence','1');document.body.appendChild(intelligence);
  }
  ensureMobileRefreshStyle();
}

function ensureMobileRefreshStyle(){
  if(document.getElementById('wd-home-mobile-refresh-20260824'))return;
  var style=document.createElement('style');
  style.id='wd-home-mobile-refresh-20260824';
  style.textContent=[
    '@media(max-width:820px){',
    'body.hm-dashboard-page .hm-top-in{padding:18px 18px 20px!important;display:grid!important;grid-template-columns:52px minmax(0,1fr)!important;grid-template-areas:"back switch" "actions actions"!important;gap:14px!important;align-items:center!important}',
    'body.hm-dashboard-page .hm-back{grid-area:back!important;width:52px!important;height:52px!important;min-height:52px!important;padding:0!important;justify-content:center!important;font-size:0!important;border-radius:15px!important}',
    'body.hm-dashboard-page .hm-back i{font-size:17px!important;margin:0!important}',
    'body.hm-dashboard-page .hm-switch-label,body.hm-dashboard-page .hm-saved{display:none!important}',
    'body.hm-dashboard-page #hm-switch{grid-area:switch!important;grid-column:auto!important;width:100%!important;height:54px!important;min-height:54px!important;padding:0 16px!important;font-size:16px!important;border-radius:15px!important}',
    'body.hm-dashboard-page .hm27-page-actions{grid-area:actions!important;grid-column:auto!important;display:grid!important;width:100%!important;grid-template-columns:1fr!important;gap:0!important}',
    'body.hm-dashboard-page .hm27-page-actions .hm27-action{display:none!important}',
    'body.hm-dashboard-page .hm27-page-actions .hm27-action.primary{display:flex!important;width:100%!important;min-height:52px!important;font-size:16px!important;border-radius:15px!important}',
    'body.hm-dashboard-page .hm-hero{padding-top:4px!important}',
    'body.hm-dashboard-page .hm-wrap>.ai:not(.wdai) .ai-h img{display:none!important}',
    'body.hm-dashboard-page .hm-wrap>.ai:not(.wdai) .ai-h:before{content:"\\f6d3"!important;font-family:"Font Awesome 6 Free"!important;font-weight:900!important;width:50px!important;height:50px!important;min-width:50px!important;border-radius:15px!important;display:grid!important;place-items:center!important;background:rgba(255,255,255,.14)!important;color:#fff!important;font-size:22px!important}',
    'body.hm-dashboard-page .hm-wrap>.ai:not(.wdai) .ai-h{align-items:center!important}',
    'body.hm-dashboard-page .hm-figs{grid-template-columns:1fr!important;gap:14px!important;text-align:center!important}',
    'body.hm-dashboard-page .hm-figs>div{min-height:150px!important;padding:24px 22px!important;display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important}',
    'body.hm-dashboard-page .hm-figs dt,body.hm-dashboard-page .hm-figs dd{text-align:center!important;width:100%!important}',
    'body.hm-dashboard-page .hm-figs dd{font-size:30px!important}',
    'body.hm-dashboard-page .hm-figs dd em{font-size:14px!important}',
    'body.hm-dashboard-page .hm-secbar{margin-top:24px!important;padding:24px 22px 18px!important;background:#fff!important;border:1px solid #dfe6ef!important;border-bottom:0!important;border-radius:22px 22px 0 0!important;gap:14px!important}',
    'body.hm-dashboard-page .hm-secbar h2{font-size:22px!important}',
    'body.hm-dashboard-page .hm-secbar p{font-size:15px!important;line-height:1.5!important}',
    'body.hm-dashboard-page .hm-secbar~.sec2{background:#fff!important;border-left:1px solid #dfe6ef!important;border-right:1px solid #dfe6ef!important;padding-left:20px!important;padding-right:20px!important}',
    'body.hm-dashboard-page .hm-secbar~.sec2:last-of-type{border-radius:0 0 22px 22px!important;border-bottom:1px solid #dfe6ef!important;padding-bottom:12px!important}',
    'body.hm-dashboard-page .wd-home-agent-ad{margin-left:auto!important;margin-right:auto!important;text-align:center!important}',
    'body.hm-dashboard-page .wd-home-agent-ad>*{margin-left:auto!important;margin-right:auto!important}',
    '}',
    '@media(max-width:430px){body.hm-dashboard-page .hm-top-in{padding-left:16px!important;padding-right:16px!important}}'
  ].join('');
  document.head.appendChild(style);
}

function partner(){
  return '<aside class="wdai-partner" aria-label="Sponsored mortgage partner"><a class="wdai-partner-link" href="https://johnvarano.com/?utm_source=watchdog&utm_medium=internal_ad&utm_campaign=greentree_financing&utm_content=property_home_rail" target="_blank" rel="noopener sponsored"><div class="wdai-partner-photo"><img src="/johnvarano.jpg" alt="John Varano, Branch Manager at Greentree Mortgage, an HMA Company" loading="lazy"></div><div class="wdai-partner-copy"><span class="wdai-partner-label"><i></i> Advertisement · Mortgage partner</span><div class="wdai-partner-brand">Greentree Mortgage <small>an HMA Company</small></div><h3>Know the payment before you fall in love with the house.</h3><p>Taxes are only part of the monthly number. John Varano can help you review the payment, including escrow, before you make a move.</p><div class="wdai-partner-person"><b>John Varano</b><span>Branch Manager | Senior Loan Officer · NMLS #142739</span></div><span class="wdai-partner-cta">Talk Financing <i class="fas fa-arrow-right"></i></span><small class="wdai-partner-disc">Greentree Mortgage, an HMA Company, is a separate company and is not affiliated with Opus Elite Real Estate. You are never required to use a particular lender and are free to shop for a mortgage. Nothing here is a loan commitment, offer of credit, or guarantee of terms.</small></div></a></aside>';
}

function footerAdMarkup(){
  return '<section class="hm-footer-ad" id="hm-footer-ad" aria-label="Watchdog advertising"><div class="hm-footer-ad-in"><a href="https://johnvarano.com/" target="_blank" rel="noopener sponsored" class="gt-banner" aria-label="Sponsored Watchdog partner"><div class="gt-banner-inner"><div class="gt-photo"><img src="/johnvarano.jpg" alt="John Varano, Branch Manager, Greentree Mortgage an HMA Company" loading="lazy" onerror="this.parentNode.style.display=\'none\'"></div><div class="gt-text"><div class="gt-eyebrow">Greentree Mortgage, an HMA Company · John Varano, Branch Manager</div><div class="gt-headline">Know the payment before you fall in love with the house.</div><div class="gt-sub">Taxes are only part of the monthly number. Review principal, interest, taxes, insurance and escrow before you make a move.</div></div><div class="gt-cta">Talk Financing <i class="fas fa-arrow-right"></i></div></div><div class="gt-disc">Advertisement. Greentree Mortgage, an HMA Company, is a separate company and is not affiliated with Opus Elite Real Estate. You are never required to use any particular lender, and you are free to shop for a mortgage. Nothing here is a loan commitment, an offer of credit, or a guarantee of terms.</div></a></div></section>';
}

function mountFooterAd(){
  if(document.getElementById('hm-footer-ad'))return;var footer=document.getElementById('wd-property-footer');if(!footer)return;var box=document.createElement('div');box.innerHTML=footerAdMarkup();footer.parentNode.insertBefore(box.firstElementChild,footer);
  if(!document.querySelector('script[data-watchdog-home-footer-ads]')){var script=document.createElement('script');script.src='/property/js/dashboard/home/home-footer-ad-rotator.js';script.async=true;script.setAttribute('data-watchdog-home-footer-ads','1');document.body.appendChild(script);}
}

function refreshLegacyIntelBrand(){
  var legacy=document.querySelector('#hm-body .ai:not(.wdai) .ai-h');
  if(legacy){var img=legacy.querySelector('img');if(img){img.alt='';img.setAttribute('aria-hidden','true');}}
}

function refreshAgentAd(){
  Array.prototype.forEach.call(document.querySelectorAll('#hm-body section,#hm-body article,#hm-body div'),function(el){
    var text=(el.textContent||'').replace(/\s+/g,' ').trim();
    if(text.indexOf('SELLER STRATEGY')===-1&&text.indexOf('Seller strategy')===-1)return;
    if(el.parentElement&&((el.parentElement.textContent||'').indexOf('SELLER STRATEGY')!==-1))return;
    el.classList.add('wd-home-agent-ad');
    var walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT),node;
    while((node=walker.nextNode()))if((node.nodeValue||'').indexOf('John and Heather')!==-1)node.nodeValue=node.nodeValue.replace(/John and Heather/g,'John Scafide and Heather');
  });
}

function mount(){
  ensureMobileRefreshStyle();refreshLegacyIntelBrand();refreshAgentAd();
  var panel=document.querySelector('#hm-body .ai.wdai[data-watchdog-analyst-intel]');if(!panel)return;
  var main=panel.querySelector(':scope > .wdai-main');
  if(!main){main=document.createElement('div');main.className='wdai-main';Array.prototype.slice.call(panel.children).forEach(function(child){if(!child.classList.contains('wdai-partner'))main.appendChild(child);});panel.insertBefore(main,panel.firstChild);}else{Array.prototype.slice.call(panel.children).forEach(function(child){if(child!==main&&!child.classList.contains('wdai-partner'))main.appendChild(child);});}
  if(!panel.querySelector(':scope > .wdai-partner')){var box=document.createElement('div');box.innerHTML=partner();panel.appendChild(box.firstElementChild);}
  panel.classList.add('wdai-split');
}

function schedule(){clearTimeout(timer);timer=setTimeout(mount,80)}
function boot(){ensureAssets();mountFooterAd();mount();var body=document.getElementById('hm-body');if(body)new MutationObserver(schedule).observe(body,{childList:true,subtree:true});['watchdog:intent-ready','watchdog:intent-updated','watchdog:context-refresh','watchdog:profession-updated'].forEach(function(name){window.addEventListener(name,schedule)});}

ensureAssets();
window.WatchdogHomePremiumPartner={mount:mount,mountFooterAd:mountFooterAd};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
