(function(){
  'use strict';

  var LAUNCH_LABEL='September 16';
  var CTA_HREF='/pro#launch-list';
  var DISMISS_KEY='watchdog:paid-launch-banner:dismissed:2026-09-16';

  function track(name,params){
    try{if(typeof window.gtag==='function')window.gtag('event',name,params||{});}catch(_){}
  }

  function isLanding(){
    var path=(location.pathname||'').replace(/\/+$/,'');
    var host=String(location.hostname||'').toLowerCase();
    var root=(host==='watchdogindex.com'||host==='www.watchdogindex.com')&&path==='';
    return path==='/property'||path==='/property/index.html'||root;
  }

  function addStyles(){
    if(document.getElementById('wd-paid-launch-styles'))return;
    var style=document.createElement('style');
    style.id='wd-paid-launch-styles';
    style.textContent='\
#wd-paid-launch-banner{position:relative;z-index:4990;background:var(--wd-navy-950,#0e2248);color:var(--surface,#fff);font-family:var(--font-ui,"Plus Jakarta Sans",Arial,sans-serif);border-bottom:1px solid rgba(255,255,255,.12)}\
#wd-paid-launch-banner *{box-sizing:border-box}\
#wd-paid-launch-banner .wdpl-inner{min-height:46px;max-width:var(--container-wide,1500px);margin:0 auto;padding:var(--space-2,8px) 28px;display:flex;align-items:center;justify-content:center;gap:var(--space-3,12px)}\
#wd-paid-launch-banner .wdpl-copy{display:flex;align-items:center;justify-content:center;gap:10px;min-width:0;font-size:var(--type-sm,.875rem);line-height:1.35}\
#wd-paid-launch-banner .wdpl-pill{display:inline-flex;align-items:center;gap:6px;flex:0 0 auto;border:1px solid rgba(255,255,255,.18);border-radius:999px;padding:4px 8px;color:#dbe7ff;font-size:.75rem;font-weight:800;letter-spacing:.07em;text-transform:uppercase}\
#wd-paid-launch-banner strong{font-weight:800;color:#fff}\
#wd-paid-launch-banner .wdpl-cta{display:inline-flex;align-items:center;gap:7px;flex:0 0 auto;background:#1456a0;color:#fff!important;border-radius:.75rem;padding:8px 12px;text-decoration:none;font-size:.75rem;font-weight:800;line-height:1;transition:filter .15s ease,transform .15s ease}\
#wd-paid-launch-banner .wdpl-cta:hover,#wd-paid-launch-banner .wdpl-cta:focus-visible{filter:brightness(.9);transform:translateY(-1px);outline:none}\
#wd-paid-launch-banner .wdpl-close{position:absolute;right:10px;top:50%;transform:translateY(-50%);width:34px;height:34px;border:0;border-radius:.5rem;background:transparent;color:#aebbd0;cursor:pointer;display:grid;place-items:center}\
#wd-paid-launch-banner .wdpl-close:hover,#wd-paid-launch-banner .wdpl-close:focus-visible{background:rgba(255,255,255,.09);color:#fff;outline:none}\
#wd-paid-launch-hero{box-sizing:border-box;position:relative;z-index:4;width:min(430px,100%);margin:14px 0 0 auto;color:#fff;font-family:var(--font-ui,"Plus Jakarta Sans",Arial,sans-serif);pointer-events:auto}\
#wd-paid-launch-hero *{box-sizing:border-box}\
#wd-paid-launch-hero .wdpl-hero-chip{display:flex;align-items:center;gap:10px;min-height:44px;padding:7px 8px 7px 12px;border-radius:999px;background:rgba(5,22,43,.74);border:1px solid rgba(255,255,255,.18);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);box-shadow:0 8px 24px rgba(3,14,29,.16)}\
#wd-paid-launch-hero .wdpl-hero-dot{width:7px;height:7px;flex:0 0 auto;border-radius:50%;background:#e7c866;box-shadow:0 0 0 3px rgba(231,200,102,.15)}\
#wd-paid-launch-hero .wdpl-hero-copy{min-width:0;flex:1;display:flex;align-items:baseline;gap:7px;white-space:nowrap;text-shadow:0 1px 8px rgba(0,0,0,.38)}\
#wd-paid-launch-hero strong{color:#fff;font-size:11.5px;font-weight:800;line-height:1.15;letter-spacing:-.015em}\
#wd-paid-launch-hero .wdpl-hero-meta{color:rgba(255,255,255,.76);font-size:10px;font-weight:650;line-height:1.2}\
#wd-paid-launch-hero .wdpl-get-started{display:inline-flex;align-items:center;gap:5px;flex:0 0 auto;padding:7px 9px;border-radius:999px;background:rgba(255,255,255,.12);color:#fff!important;text-decoration:none;font-size:10px;font-weight:800;line-height:1;transition:background .15s ease,transform .15s ease}\
#wd-paid-launch-hero .wdpl-get-started:hover,#wd-paid-launch-hero .wdpl-get-started:focus-visible{background:rgba(255,255,255,.21);transform:translateY(-1px);outline:none}\
body.wd-paid-launch-visible .wd-nav:not(.solid){top:var(--wd-paid-launch-height,46px)}\
@media(min-width:769px){html.wd-index-lean-runtime body.wd-paid-launch-visible #wd-nav:not(.solid){position:absolute!important;top:var(--wd-paid-launch-height,46px)!important;right:0!important;bottom:auto!important;left:0!important;height:78px!important;min-height:78px!important;margin:0!important;transform:none!important}html.wd-index-lean-runtime body.wd-paid-launch-visible #wd-nav:not(.solid) .wd-nav-in{height:78px!important;min-height:78px!important;box-sizing:border-box!important;padding:7px 26px!important;margin:0 auto!important;align-items:center!important;transform:none!important}}\
#launch-list{display:block;position:relative;top:-18px;visibility:hidden}\
@media(max-width:768px){#wd-paid-launch-banner .wdpl-inner{min-height:54px;padding:7px 48px 7px 14px;justify-content:flex-start;gap:9px}#wd-paid-launch-banner .wdpl-copy{display:block;font-size:.75rem}#wd-paid-launch-banner .wdpl-pill{display:none}#wd-paid-launch-banner .wdpl-cta{margin-left:auto;padding:8px 10px;font-size:.75rem;white-space:nowrap}#wd-paid-launch-hero{width:min(430px,100%);margin-top:12px}#wd-paid-launch-hero .wdpl-hero-chip{min-height:42px;padding:6px 7px 6px 10px}#wd-paid-launch-hero strong{font-size:10.5px}#wd-paid-launch-hero .wdpl-hero-meta{font-size:9px}#wd-paid-launch-hero .wdpl-get-started{font-size:9.5px;padding:7px 8px}}\
@media(max-width:480px){#wd-paid-launch-hero{width:100%;margin-top:11px}#wd-paid-launch-hero .wdpl-hero-chip{border-radius:14px;gap:8px}#wd-paid-launch-hero .wdpl-hero-copy{display:block;white-space:normal}#wd-paid-launch-hero .wdpl-hero-meta{display:block;margin-top:2px}#wd-paid-launch-hero .wdpl-get-started{font-size:9px}}';
    document.head.appendChild(style);
  }

  function dismissed(){
    try{return sessionStorage.getItem(DISMISS_KEY)==='1';}catch(_){return false;}
  }

  function clearNavOffset(){
    if(!document.body)return;
    document.body.classList.remove('wd-paid-launch-visible');
    document.body.style.removeProperty('--wd-paid-launch-height');
  }

  function syncNavOffset(){
    var banner=document.getElementById('wd-paid-launch-banner');
    if(!banner||!document.body){clearNavOffset();return;}
    document.body.classList.add('wd-paid-launch-visible');
    document.body.style.setProperty('--wd-paid-launch-height',Math.ceil(banner.getBoundingClientRect().height)+'px');
  }

  function dismiss(){
    try{sessionStorage.setItem(DISMISS_KEY,'1');}catch(_){}
    var banner=document.getElementById('wd-paid-launch-banner');
    if(banner)banner.remove();
    clearNavOffset();
    track('paid_launch_banner_dismiss',{launch_date:'2026-09-16'});
  }

  function bannerMarkup(){
    var node=document.createElement('aside');
    node.id='wd-paid-launch-banner';
    node.setAttribute('role','region');
    node.setAttribute('aria-label','Watchdog paid plans launch announcement');
    node.innerHTML='<div class="wdpl-inner">'+
      '<span class="wdpl-pill"><i class="fas fa-bolt"></i> Paid plans</span>'+
      '<div class="wdpl-copy"><strong>Professional plans are scheduled to open '+LAUNCH_LABEL+'.</strong> Get started for less than $2/day with annual billing.</div>'+
      '<a class="wdpl-cta" href="'+CTA_HREF+'" data-paid-launch-cta>Join the launch list <i class="fas fa-arrow-right"></i></a>'+
      '</div><button class="wdpl-close" type="button" aria-label="Dismiss launch announcement"><i class="fas fa-xmark"></i></button>';
    node.querySelector('.wdpl-close').addEventListener('click',dismiss);
    node.querySelector('[data-paid-launch-cta]').addEventListener('click',function(){track('paid_launch_banner_click',{launch_date:'2026-09-16',destination:'launch-list'});});
    return node;
  }

  function heroRailMarkup(){
    var node=document.createElement('aside');
    node.id='wd-paid-launch-hero';
    node.setAttribute('role','region');
    node.setAttribute('aria-label','Professional plan launch details');
    node.innerHTML='<div class="wdpl-hero-chip">'+
      '<span class="wdpl-hero-dot" aria-hidden="true"></span>'+
      '<span class="wdpl-hero-copy"><strong>Professional plans · Sep 16</strong><span class="wdpl-hero-meta">Less than $2/day annually</span></span>'+
      '<a class="wdpl-get-started" href="'+CTA_HREF+'" data-paid-launch-cta>Get started <i class="fas fa-arrow-right"></i></a>'+
      '</div>';
    node.querySelector('[data-paid-launch-cta]').addEventListener('click',function(){track('paid_launch_banner_click',{launch_date:'2026-09-16',destination:'launch-list',surface:'hero_facts'});});
    return node;
  }

  function placeHeroRail(){
    var existing=document.getElementById('wd-paid-launch-hero');
    if(existing){clearNavOffset();return true;}
    var hero=document.querySelector('.pl-hero');
    var inner=hero&&hero.querySelector('.pl-hero-inner');
    var search=inner&&inner.querySelector('.pl-search-card');
    if(!hero||!inner||!search)return false;
    var stale=document.getElementById('wd-paid-launch-banner');
    if(stale&&hero.contains(stale))stale.remove();
    search.insertAdjacentElement('afterend',heroRailMarkup());
    clearNavOffset();
    return true;
  }

  function placeBanner(){
    if(isLanding())return placeHeroRail();
    if(dismissed()){clearNavOffset();return true;}
    var existing=document.getElementById('wd-paid-launch-banner');
    if(existing){syncNavOffset();return true;}
    var nav=document.getElementById('wd-property-nav')||document.getElementById('wd-nav');
    if(nav&&nav.parentNode){nav.insertAdjacentElement('afterend',bannerMarkup());requestAnimationFrame(syncNavOffset);return true;}
    return false;
  }

  function ensureLaunchSurface(){
    addStyles();
    if(placeBanner())return;
    var attempts=0;
    var timer=setInterval(function(){
      attempts+=1;
      if(placeBanner()||attempts>40)clearInterval(timer);
    },100);
  }

  function text(el,value){if(el)el.textContent=value;}

  function adaptProPage(){
    var path=(location.pathname||'').replace(/\/+$/,'');
    if(path!=='/property/pro'&&path!=='/pro')return;

    var demo=document.querySelector('.pro-demo');
    if(demo&&!document.getElementById('launch-list')){
      var anchor=document.createElement('span');
      anchor.id='launch-list';
      demo.insertAdjacentElement('beforebegin',anchor);
    }

    if(demo){
      var copy=demo.querySelector('.pro-demo-copy');
      if(copy){
        text(copy.querySelector('.pro-kicker'),'September 16 launch list');
        var heading=copy.querySelector('h2');
        if(heading)heading.innerHTML='Be first in line.<br><em>We’ll let you know when enrollment opens.</em>';
        var intro=copy.querySelector('h2 + p');
        text(intro,'Tell us your role, expected property volume and plan interest. We’ll send the launch notice when paid enrollment is cleared to open.');
        var proof=copy.querySelectorAll('.pro-demo-proof span');
        if(proof[0])proof[0].innerHTML='<i class="fas fa-lock"></i> No payment required';
        if(proof[1])proof[1].innerHTML='<i class="fas fa-layer-group"></i> Agent · Pro · Pro+';
        if(proof[2])proof[2].innerHTML='<i class="fas fa-envelope"></i> Launch notice by email';
      }
    }

    var form=document.getElementById('pro-demo-form');
    if(form){
      var source=form.querySelector('input[name="source"]');
      if(source)source.value='paid-launch-list';
      var submit=form.querySelector('button[type="submit"]');
      if(submit)submit.innerHTML='Join the launch list <i class="fas fa-arrow-right"></i>';
      var privacy=form.querySelector('.pro-form-privacy');
      if(privacy)privacy.textContent='By submitting, you’re asking Watchdog Property Intelligence LLC to contact you about paid-plan availability and the plan you selected. No payment information is collected here.';
      form.addEventListener('submit',function(){track('paid_launch_interest_submit',{plan:(form.querySelector('[name="plan"]')||{}).value||'unsure'});},{capture:true});
    }

    document.querySelectorAll('[data-demo-plan]').forEach(function(cta){
      var plan=cta.dataset.demoPlan||'';
      cta.setAttribute('href','#launch-list');
      if(plan==='agent')cta.innerHTML='Join Agent launch list <i class="fas fa-arrow-right"></i>';
      else if(plan==='pro')cta.innerHTML='Join Pro launch list <i class="fas fa-arrow-right"></i>';
      else if(plan==='pro_plus')cta.innerHTML='Join Pro+ launch list <i class="fas fa-arrow-right"></i>';
    });

    var note=document.querySelector('.pro-checkout-note');
    if(note)note.innerHTML='<i class="fas fa-calendar-check"></i>Paid enrollment is scheduled to open September 16 after the final New Jersey tax-collection validation. Join the launch list now and we’ll notify you when enrollment opens.';

    var unsure=Array.prototype.find.call(document.querySelectorAll('.pro-faq-card'),function(card){return /Not sure which plan fits\?/i.test(card.textContent||'');});
    if(unsure){var p=unsure.querySelector('p');text(p,'Join the launch list and tell us your role and approximate property volume. We’ll use that context to point you toward Agent, Pro or Pro+.');}

    if(location.hash==='#launch-list')setTimeout(function(){var a=document.getElementById('launch-list');if(a)a.scrollIntoView({behavior:'smooth',block:'start'});},120);
  }

  function init(){ensureLaunchSurface();adaptProPage();window.addEventListener('resize',syncNavOffset,{passive:true});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
