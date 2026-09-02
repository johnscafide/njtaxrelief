(function(){
  'use strict';
  if(!/(^|\.)njpropertytaxrelief\.com$/i.test(location.hostname))return;
  if(window.__wdxLegacyPromo)return;window.__wdxLegacyPromo=true;

  var DEST='https://www.watchdogindex.com/?utm_source=njpropertytaxrelief&utm_medium=referral&utm_campaign=watchdog_handoff&utm_content=';
  var SEEN='njptr_watchdog_promo_seen_v1';
  var FIVE_DAYS=5*24*60*60*1000;
  var LOGO='/property/branding/watchdog-logo-horizontal.svg';

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
    band.innerHTML='<div class="wdx-promo-card"><div class="wdx-promo-copy"><div class="wdx-promo-brandrow"><img src="'+LOGO+'" alt="Watchdog Property Intelligence"><span>From NJ Property Tax Relief</span></div><div class="wdx-promo-eyebrow">Property intelligence for New Jersey</div><h2>Your tax-relief answer is only one part of the property story.</h2><p>Watchdog brings New Jersey assessments, tax records, Watchdog Score and property intelligence into one place—so you can see what is happening with the property beyond a single rebate.</p></div><div class="wdx-promo-actions"><a class="wdx-promo-btn primary" data-wdx-cta="home-band" href="'+DEST+'home_band">Explore Watchdog <span aria-hidden="true">→</span></a><a class="wdx-promo-btn secondary" data-wdx-cta="home-band-search" href="https://www.watchdogindex.com/?utm_source=njpropertytaxrelief&utm_medium=referral&utm_campaign=watchdog_handoff&utm_content=home_band_search">Search a property</a></div></div>';
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
    var host=el('aside','wdx-anchor-brand');host.id='wdx-anchor-brand';host.setAttribute('aria-label','Watchdog secure result handoff');
    host.innerHTML='<div class="wdx-anchor-brand-inner"><div class="wdx-anchor-brand-main"><div class="wdx-anchor-logo-wrap"><img src="'+LOGO+'" alt="Watchdog Property Intelligence"></div><div class="wdx-anchor-brand-copy"><span class="wdx-anchor-kicker">Your next step after the estimate</span><b>Your ANCHOR result continues securely in Watchdog.</b><span class="wdx-anchor-desc">Finish the estimator here. After email verification, your estimate opens in Watchdog beside public property intelligence for the residence you entered.</span></div></div><div class="wdx-anchor-proof" aria-label="Secure handoff details"><span><i aria-hidden="true">✓</i> Estimate first</span><span><i aria-hidden="true">✓</i> Secure handoff</span><span><i aria-hidden="true">✓</i> Public property context</span></div></div>';
    var cardWrap=document.querySelector('.est-card-wrap');
    if(cardWrap){
      var card=cardWrap.querySelector('.est-card');
      if(card)cardWrap.insertBefore(host,card);else cardWrap.insertBefore(host,cardWrap.firstChild);
    }else{
      var hero=document.querySelector('.est-hero');
      if(hero&&hero.parentNode)hero.parentNode.insertBefore(host,hero.nextSibling);
    }
  }

  function modal(){
    if(!shouldModal()||document.getElementById('wdx-modal-backdrop'))return;
    var back=el('div','wdx-modal-backdrop');back.id='wdx-modal-backdrop';back.setAttribute('role','dialog');back.setAttribute('aria-modal','true');back.setAttribute('aria-labelledby','wdx-modal-title');
    back.innerHTML='<div class="wdx-modal"><button class="wdx-modal-close" type="button" aria-label="Close Watchdog introduction">×</button><div class="wdx-modal-grid"><section class="wdx-modal-main"><div class="wdx-modal-brand"><img src="'+LOGO+'" alt="Watchdog Property Intelligence"><span>Introduced by NJ Property Tax Relief</span></div><div class="wdx-modal-kicker">New Jersey property intelligence</div><h2 id="wdx-modal-title">Go beyond the rebate.</h2><p class="wdx-modal-lede">A tax-relief estimate answers one question. Watchdog helps you understand the property behind it—assessment, taxes, public records and meaningful property signals in one modern workspace.</p><div class="wdx-modal-actions"><a data-wdx-cta="modal" href="'+DEST+'promo_modal">Explore Watchdog <span aria-hidden="true">→</span></a><button type="button" data-wdx-close>Not right now</button></div><div class="wdx-modal-footnote">No signup is required to explore public property intelligence.</div></section><aside class="wdx-modal-visual" aria-label="Examples of Watchdog property intelligence"><div class="wdx-visual-top"><span class="wdx-visual-label">PROPERTY SNAPSHOT</span><span class="wdx-visual-live"><i></i> WATCHDOG</span></div><div class="wdx-visual-property"><span class="wdx-visual-home" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M3 11.2 12 4l9 7.2v8.3a.5.5 0 0 1-.5.5h-5.3v-5.7H8.8V20H3.5a.5.5 0 0 1-.5-.5v-8.3Z"/></svg></span><div><small>YOUR NEW JERSEY PROPERTY</small><strong>See the full property story</strong></div></div><div class="wdx-visual-score"><div class="wdx-score-ring"><span>W</span><small>INTEL</small></div><div><small>WATCHDOG CONTEXT</small><strong>One place to investigate</strong><span>Signals are shown only when supported by available property evidence.</span></div></div><div class="wdx-visual-signals"><div class="wdx-signal-row"><span class="wdx-signal-icon assessment" aria-hidden="true">A</span><div><small>ASSESSMENT</small><b>Public record context</b></div><em>VIEW</em></div><div class="wdx-signal-row"><span class="wdx-signal-icon taxes" aria-hidden="true">$</span><div><small>PROPERTY TAX</small><b>Tax history &amp; context</b></div><em>VIEW</em></div><div class="wdx-signal-row"><span class="wdx-signal-icon signals" aria-hidden="true">⌁</span><div><small>PROPERTY SIGNALS</small><b>Evidence-backed intelligence</b></div><em>OPEN</em></div></div><div class="wdx-visual-bottom"><span>One property.</span><strong>More context.</strong></div></aside></div></div>';
    document.body.appendChild(back);

    var previousFocus=document.activeElement;
    var closeButton=back.querySelector('.wdx-modal-close');
    function close(){
      back.classList.remove('open');
      markSeen();
      track('watchdog_promo_dismiss',{path:location.pathname});
      document.removeEventListener('keydown',onKey);
      setTimeout(function(){
        if(back.parentNode)back.parentNode.removeChild(back);
        try{if(previousFocus&&typeof previousFocus.focus==='function')previousFocus.focus();}catch(_){}
      },240);
    }
    function onKey(e){if(e.key==='Escape')close();}
    if(closeButton)closeButton.addEventListener('click',close);
    var dismiss=back.querySelector('[data-wdx-close]');if(dismiss)dismiss.addEventListener('click',close);
    back.addEventListener('click',function(e){if(e.target===back)close();});
    document.addEventListener('keydown',onKey);
    setTimeout(function(){
      back.classList.add('open');
      track('watchdog_promo_view',{path:location.pathname});
      try{if(closeButton)closeButton.focus({preventScroll:true});}catch(_){}
    },/anchor-estimator/i.test(location.pathname)?2200:1400);
  }

  function bind(){
    Array.prototype.slice.call(document.querySelectorAll('[data-wdx-cta]')).forEach(function(a){
      if(a.dataset.wdxBound)return;
      a.dataset.wdxBound='1';
      a.addEventListener('click',function(){
        markSeen();
        track('watchdog_promo_click',{placement:a.getAttribute('data-wdx-cta')||'unknown',path:location.pathname});
      });
    });
  }

  function boot(){
    if(location.pathname==='/'||/index\.html$/i.test(location.pathname))addBand();
    addEstimatorBrand();
    bind();
    modal();
    setTimeout(bind,1800);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
