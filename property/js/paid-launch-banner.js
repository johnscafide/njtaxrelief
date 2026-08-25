(function(){
  'use strict';

  var LAUNCH_LABEL='September 16';
  var CTA_HREF='/pro#launch-list';
  var DISMISS_KEY='watchdog:paid-launch-banner:dismissed:2026-09-16';

  function track(name,params){
    try{if(typeof window.gtag==='function')window.gtag('event',name,params||{});}catch(_){}
  }

  function addStyles(){
    if(document.getElementById('wd-paid-launch-styles'))return;
    var style=document.createElement('style');
    style.id='wd-paid-launch-styles';
    style.textContent='\
#wd-paid-launch-banner{position:relative;z-index:4990;background:#111d38;color:#fff;font-family:Inter,"Source Sans 3",system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;border-bottom:1px solid rgba(255,255,255,.12)}\
#wd-paid-launch-banner *{box-sizing:border-box}\
#wd-paid-launch-banner .wdpl-inner{min-height:46px;max-width:1540px;margin:0 auto;padding:8px 28px;display:flex;align-items:center;justify-content:center;gap:14px}\
#wd-paid-launch-banner .wdpl-copy{display:flex;align-items:center;justify-content:center;gap:10px;min-width:0;font-size:13px;line-height:1.35}\
#wd-paid-launch-banner .wdpl-pill{display:inline-flex;align-items:center;gap:6px;flex:0 0 auto;border:1px solid rgba(255,255,255,.18);border-radius:999px;padding:4px 8px;color:#dbe7ff;font-size:10px;font-weight:800;letter-spacing:.07em;text-transform:uppercase}\
#wd-paid-launch-banner .wdpl-pill i{color:#7da4ff}\
#wd-paid-launch-banner strong{font-weight:800;color:#fff}\
#wd-paid-launch-banner .wdpl-plans{color:#aebbd0;white-space:nowrap}\
#wd-paid-launch-banner .wdpl-cta{display:inline-flex;align-items:center;gap:7px;flex:0 0 auto;background:#2f6df6;color:#fff!important;border-radius:10px;padding:8px 12px;text-decoration:none;font-size:12px;font-weight:800;line-height:1;transition:background .15s ease,transform .15s ease}\
#wd-paid-launch-banner .wdpl-cta:hover,#wd-paid-launch-banner .wdpl-cta:focus-visible{background:#2559ca;transform:translateY(-1px);outline:none}\
#wd-paid-launch-banner .wdpl-close{position:absolute;right:10px;top:50%;transform:translateY(-50%);width:34px;height:34px;border:0;border-radius:9px;background:transparent;color:#aebbd0;cursor:pointer;display:grid;place-items:center}\
#wd-paid-launch-banner .wdpl-close:hover,#wd-paid-launch-banner .wdpl-close:focus-visible{background:rgba(255,255,255,.09);color:#fff;outline:none}\
#launch-list{display:block;position:relative;top:-18px;visibility:hidden}\
@media(max-width:760px){#wd-paid-launch-banner .wdpl-inner{min-height:54px;padding:7px 48px 7px 14px;justify-content:flex-start;gap:9px}#wd-paid-launch-banner .wdpl-copy{display:block;font-size:12px}#wd-paid-launch-banner .wdpl-pill,#wd-paid-launch-banner .wdpl-plans{display:none}#wd-paid-launch-banner .wdpl-cta{margin-left:auto;padding:8px 10px;font-size:11px;white-space:nowrap}}\
@media(max-width:430px){#wd-paid-launch-banner .wdpl-inner{align-items:center}.wdpl-copy strong{display:block}#wd-paid-launch-banner .wdpl-copy .wdpl-date-copy{display:none}}';
    document.head.appendChild(style);
  }

  function dismissed(){
    try{return sessionStorage.getItem(DISMISS_KEY)==='1';}catch(_){return false;}
  }

  function dismiss(){
    try{sessionStorage.setItem(DISMISS_KEY,'1');}catch(_){}
    var banner=document.getElementById('wd-paid-launch-banner');
    if(banner)banner.remove();
    track('paid_launch_banner_dismiss',{launch_date:'2026-09-16'});
  }

  function bannerMarkup(){
    var node=document.createElement('aside');
    node.id='wd-paid-launch-banner';
    node.setAttribute('role','region');
    node.setAttribute('aria-label','Watchdog paid plans launch announcement');
    node.innerHTML='<div class="wdpl-inner">'+
      '<span class="wdpl-pill"><i class="fas fa-bolt"></i> Paid plans</span>'+
      '<div class="wdpl-copy"><strong>Agent, Pro &amp; Pro+ are scheduled to open '+LAUNCH_LABEL+'.</strong> <span class="wdpl-date-copy">Join the launch list now.</span></div>'+
      '<span class="wdpl-plans">Agent $59 · Pro $129 · Pro+ $399 / mo</span>'+
      '<a class="wdpl-cta" href="'+CTA_HREF+'" data-paid-launch-cta>Join the launch list <i class="fas fa-arrow-right"></i></a>'+
      '</div><button class="wdpl-close" type="button" aria-label="Dismiss launch announcement"><i class="fas fa-xmark"></i></button>';
    node.querySelector('.wdpl-close').addEventListener('click',dismiss);
    node.querySelector('[data-paid-launch-cta]').addEventListener('click',function(){track('paid_launch_banner_click',{launch_date:'2026-09-16',destination:'launch-list'});});
    return node;
  }

  function placeBanner(){
    if(dismissed()||document.getElementById('wd-paid-launch-banner'))return true;
    var nav=document.getElementById('wd-property-nav')||document.getElementById('wd-nav');
    if(nav&&nav.parentNode){nav.insertAdjacentElement('afterend',bannerMarkup());return true;}
    return false;
  }

  function ensureBanner(){
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

  function init(){ensureBanner();adaptProPage();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
