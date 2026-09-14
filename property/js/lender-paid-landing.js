(function(){
  'use strict';
  var path=(location.pathname||'').replace(/\/+$/,'');
  if(path!=='/lender')return;

  var busy=false;
  var exitShown=false;
  var exitEligible=false;
  var toast=document.getElementById('apl-toast');
  var exit=document.getElementById('apl-exit');
  var priorFocus=null;
  var lifetimeAmounts={pro:349900,pro_plus:999900};

  function track(name,params){
    params=params||{};
    params.page_type='lender_paid_landing';
    if(typeof window.gtag==='function')window.gtag('event',name,params);
  }

  function show(message){
    if(!toast)return;
    toast.textContent=message;
    toast.hidden=false;
    clearTimeout(window.__lplToastTimer);
    window.__lplToastTimer=setTimeout(function(){toast.hidden=true;},8000);
  }

  function attribution(){
    var q=new URLSearchParams(location.search||'');
    var value={
      source:q.get('utm_source')||'',
      medium:q.get('utm_medium')||'',
      campaign:q.get('utm_campaign')||'',
      content:q.get('utm_content')||'',
      term:q.get('utm_term')||'',
      landing_path:location.pathname,
      captured_at:new Date().toISOString()
    };
    if(!value.source&&!value.medium&&!value.campaign)return;
    try{sessionStorage.setItem('watchdog:lender-paid-attribution',JSON.stringify(value));}catch(_){ }
  }

  function markExitSeen(){
    exitShown=true;
    try{sessionStorage.setItem('watchdog:lender-exit-offer-seen','1');}catch(_){ }
  }

  function hasSeenExit(){
    try{return sessionStorage.getItem('watchdog:lender-exit-offer-seen')==='1';}catch(_){return false;}
  }

  function openExitOffer(){
    if(!exit||exitShown||busy||!exitEligible||hasSeenExit())return;
    markExitSeen();
    priorFocus=document.activeElement;
    exit.hidden=false;
    document.body.style.overflow='hidden';
    var close=exit.querySelector('.apl-exit-x');
    if(close)close.focus();
    track('lender_annual_exit_offer_view',{tier:'pro',annual_amount_cents:129000});
  }

  function closeExitOffer(reason){
    if(!exit||exit.hidden)return;
    exit.hidden=true;
    document.body.style.overflow='';
    if(priorFocus&&typeof priorFocus.focus==='function')priorFocus.focus();
    if(reason)track('lender_annual_exit_offer_dismiss',{reason:reason});
  }

  async function startLifetime(event){
    if(busy)return;
    var button=event&&event.currentTarget;
    var tier=button&&button.getAttribute('data-tier');
    if(!lifetimeAmounts[tier]){
      show('Choose Pro or Pro+ to continue.');
      return;
    }
    busy=true;
    markExitSeen();
    closeExitOffer('lifetime_selected');
    var buttons=Array.prototype.slice.call(document.querySelectorAll('[data-lender-lifetime-checkout]'));
    buttons.forEach(function(b){b.disabled=true;});
    track('lender_lifetime_checkout_start',{tier:tier,amount_cents:lifetimeAmounts[tier],utm_source:new URLSearchParams(location.search||'').get('utm_source')||''});
    try{
      var billing=window.WatchdogBilling;
      if(!billing||typeof billing.client!=='function'||typeof billing.invoke!=='function')throw new Error('Secure checkout is unavailable. Please refresh and try again.');
      var client=billing.client();
      if(!client)throw new Error('Sign in service is unavailable.');
      var result=await client.auth.getSession();
      var session=result&&result.data&&result.data.session;
      if(!session){
        try{
          sessionStorage.setItem('watchdog:lifetime:pending',tier);
          sessionStorage.setItem('watchdog:lender-paid:return',location.pathname+location.search);
        }catch(_){ }
        track('lender_lifetime_signin_required',{tier:tier});
        location.href='/property/dashboard?billing=signin&offer=lifetime&from=lender-landing';
        return;
      }
      var checkout=await billing.invoke('create-lifetime-checkout',{tier:tier});
      if(!checkout||!checkout.url)throw new Error('Secure checkout did not return a destination.');
      location.href=checkout.url;
    }catch(err){
      busy=false;
      buttons.forEach(function(b){b.disabled=false;});
      console.error('Lender lifetime checkout failed',err);
      var message=(err&&err.message)||'Checkout could not be opened.';
      if(err&&err.code==='LIFETIME_ACTIVE_SUBSCRIPTION')message='This account already has recurring billing. Manage that subscription before switching to Lifetime.';
      if(err&&err.code==='LIFETIME_ALREADY_ACTIVE')message='Founding Lifetime is already active on this account.';
      if(err&&err.code==='WATCHDOG_TEST_NO_REAL_SPEND')message='This test account cannot create a real charge.';
      show(message);
      track('lender_lifetime_checkout_error',{tier:tier,code:err&&err.code||''});
    }
  }

  function startAnnual(){
    if(busy)return;
    var billing=window.WatchdogBilling;
    if(!billing||typeof billing.checkout!=='function'){
      show('Secure checkout is unavailable. Please refresh and try again.');
      return;
    }
    busy=true;
    closeExitOffer();
    track('lender_annual_checkout_start',{tier:'pro',amount_cents:129000,cadence:'yearly'});
    Promise.resolve(billing.checkout('pro',{cadence:'yearly'})).catch(function(err){
      busy=false;
      console.error('Lender annual checkout failed',err);
      show((err&&err.message)||'Annual checkout could not be opened.');
    });
  }

  function onExitIntent(event){
    if(!exitEligible||exitShown||busy||hasSeenExit())return;
    var related=event.relatedTarget||event.toElement;
    if(related)return;
    if(typeof event.clientY==='number'&&event.clientY>8)return;
    openExitOffer();
  }

  function bind(){
    attribution();
    exitShown=hasSeenExit();
    window.setTimeout(function(){exitEligible=true;},7000);

    document.querySelectorAll('[data-lender-lifetime-checkout]').forEach(function(button){button.addEventListener('click',startLifetime);});
    document.querySelectorAll('[data-lender-annual-checkout]').forEach(function(button){button.addEventListener('click',startAnnual);});
    document.querySelectorAll('[data-exit-close]').forEach(function(button){button.addEventListener('click',function(){closeExitOffer('dismissed');});});

    var keep=document.querySelector('[data-exit-keep-lifetime]');
    if(keep)keep.addEventListener('click',function(){
      closeExitOffer('keep_lifetime');
      var offer=document.getElementById('founding-access');
      if(offer)offer.scrollIntoView({behavior:'smooth',block:'start'});
    });

    document.addEventListener('mouseout',onExitIntent);
    document.addEventListener('keydown',function(event){if(event.key==='Escape'&&exit&&!exit.hidden)closeExitOffer('escape');});
    document.querySelectorAll('a[href^="#"]').forEach(function(link){link.addEventListener('click',function(){track('lender_landing_section_click',{target:link.getAttribute('href')||''});});});

    track('lender_paid_landing_view',{
      utm_source:new URLSearchParams(location.search||'').get('utm_source')||'',
      utm_campaign:new URLSearchParams(location.search||'').get('utm_campaign')||''
    });
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
})();
