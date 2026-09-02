(function(){
  'use strict';
  if(!/(^|\.)njpropertytaxrelief\.com$/i.test(location.hostname))return;
  if(window.__wdxLegacyPromo)return;window.__wdxLegacyPromo=true;

  var DEST='https://www.watchdogindex.com/?utm_source=njpropertytaxrelief&utm_medium=referral&utm_campaign=watchdog_handoff&utm_content=';
  var SEEN='njptr_watchdog_promo_seen_v1';
  var FIVE_DAYS=5*24*60*60*1000;

  function track(name,params){
    try{
      if(window.AnchorFunnel&&typeof window.AnchorFunnel.track==='function')window.AnchorFunnel.track(name,params||{});
      else if(typeof window.gtag==='function')window.gtag('event',name,params||{});
    }catch(_){}
  }
  function markSeen(){try{localStorage.setItem(SEEN,String(Date.now()));}catch(_){}}
  function shouldModal(){try{var n=Number(localStorage.getItem(SEEN)||0);return !n||Date.now()-n>FIVE_DAYS;}catch(_){return true;}}
  function el(tag,cls,html){var node=document.createElement(tag);if(cls)node.className=cls;if(html!=null)node.innerHTML=html;return node;}
  function addBand(){
    if(document.getElementById('wdx-promo-band'))return;
    var band=el('section','wdx-promo-band');band.id='wdx-promo-band';
    band.innerHTML='<div class="wdx-promo-card"><div class="wdx-promo-copy"><div class="wdx-promo-eyebrow">From NJ Property Tax Relief · Meet Watchdog</div><h2>Your tax-relief answer is only one part of the property story.</h2><p>Watchdog brings New Jersey assessments, tax records, Watchdog Score and property intelligence into one place—so you can see what is happening with the property beyond a single rebate.</p></div><div class="wdx-promo-actions"><a class="wdx-promo-btn primary" data-wdx-cta="home-band" href="'+DEST+'home_band">Explore Watchdog</a><a class="wdx-promo-btn secondary" data-wdx-cta="home-band-search" href="https://www.watchdogindex.com/?utm_source=njpropertytaxrelief&utm_medium=referral&utm_campaign=watchdog_handoff&utm_content=home_band_search">Search a property</a></div></div>';
    var hero=document.querySelector('.hero,.hero-section,.home-hero,.main-hero');
    var target=hero&&hero.parentNode?hero.nextSibling:null;
    if(target&&hero.parentNode)hero.parentNode.insertBefore(band,target);
    else{
      var main=document.querySelector('main');
      if(main)main.insertBefore(band,main.firstChild);
      else{var header=document.querySelector('header');if(header&&header.parentNode)header.parentNode.insertBefore(band,header.nextSibling);else document.body.insertBefore(band,document.body.firstChild);}
    }
  }
  function addEstimatorBrand(){
    if(!/anchor-estimator\.html$/i.test(location.pathname)||document.getElementById('wdx-anchor-brand'))return;
    var host=el('div','wdx-anchor-brand');host.id='wdx-anchor-brand';
    host.innerHTML='<div class="wdx-anchor-brand-inner"><div class="wdx-anchor-mark">W</div><div><b>Your property result continues in Watchdog.</b><span>Finish the ANCHOR estimator here. After email verification, your secure result opens on Watchdog with the residence\'s public property intelligence beside it.</span></div></div>';
    var card=document.querySelector('.est-card-wrap');if(card&&card.parentNode)card.parentNode.insertBefore(host,card);else{var hero=document.querySelector('.est-hero');if(hero&&hero.parentNode)hero.parentNode.insertBefore(host,hero.nextSibling);}
  }
  function modal(){
    if(!shouldModal()||document.getElementById('wdx-modal-backdrop'))return;
    var back=el('div','wdx-modal-backdrop');back.id='wdx-modal-backdrop';back.setAttribute('role','dialog');back.setAttribute('aria-modal','true');back.setAttribute('aria-label','Meet Watchdog');
    back.innerHTML='<div class="wdx-modal"><div class="wdx-modal-head"><button class="wdx-modal-close" type="button" aria-label="Close">×</button><div class="wdx-modal-kicker">NJ Property Tax Relief introduces Watchdog</div><h2>Go beyond the rebate.</h2><p>See the property itself—assessment, taxes, public records and Watchdog intelligence—in one New Jersey property workspace.</p></div><div class="wdx-modal-body"><div class="wdx-modal-points"><div class="wdx-modal-point"><b>Assessments</b><span>Public record context</span></div><div class="wdx-modal-point"><b>Watchdog Score</b><span>When evidence supports it</span></div><div class="wdx-modal-point"><b>Property signals</b><span>One place to investigate</span></div></div><div class="wdx-modal-actions"><a data-wdx-cta="modal" href="'+DEST+'promo_modal">Explore Watchdog</a><button type="button" data-wdx-close>Not right now</button></div></div></div>';
    document.body.appendChild(back);
    function close(){back.classList.remove('open');markSeen();track('watchdog_promo_dismiss',{path:location.pathname});setTimeout(function(){if(back.parentNode)back.parentNode.removeChild(back);},240);}
    var x=back.querySelector('.wdx-modal-close');if(x)x.addEventListener('click',close);var b=back.querySelector('[data-wdx-close]');if(b)b.addEventListener('click',close);back.addEventListener('click',function(e){if(e.target===back)close();});
    setTimeout(function(){back.classList.add('open');track('watchdog_promo_view',{path:location.pathname});},/anchor-estimator/i.test(location.pathname)?2200:1400);
  }
  function bind(){Array.prototype.slice.call(document.querySelectorAll('[data-wdx-cta]')).forEach(function(a){if(a.dataset.wdxBound)return;a.dataset.wdxBound='1';a.addEventListener('click',function(){markSeen();track('watchdog_promo_click',{placement:a.getAttribute('data-wdx-cta')||'unknown',path:location.pathname});});});}
  function boot(){
    if(location.pathname==='/'||/index\.html$/i.test(location.pathname))addBand();
    addEstimatorBrand();
    bind();
    modal();
    setTimeout(bind,1800);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
