(function(){
  'use strict';
  var path=(location.pathname||'').replace(/\/+$/,'');
  if(path!=='/property/for/real-estate-agents')return;
  var busy=false;
  var toast=document.getElementById('apl-toast');

  function track(name,params){
    params=params||{};
    params.page_type='agent_paid_landing';
    if(typeof window.gtag==='function')window.gtag('event',name,params);
  }

  function show(message){
    if(!toast)return;
    toast.textContent=message;
    toast.hidden=false;
    clearTimeout(window.__aplToastTimer);
    window.__aplToastTimer=setTimeout(function(){toast.hidden=true;},8000);
  }

  function attribution(){
    var q=new URLSearchParams(location.search||'');
    var value={source:q.get('utm_source')||'',medium:q.get('utm_medium')||'',campaign:q.get('utm_campaign')||'',content:q.get('utm_content')||'',term:q.get('utm_term')||'',landing_path:location.pathname,captured_at:new Date().toISOString()};
    if(!value.source&&!value.medium&&!value.campaign)return;
    try{sessionStorage.setItem('watchdog:agent-paid-attribution',JSON.stringify(value));}catch(_){ }
  }

  async function startLifetime(){
    if(busy)return;
    busy=true;
    var buttons=Array.prototype.slice.call(document.querySelectorAll('[data-agent-lifetime-checkout]'));
    buttons.forEach(function(b){b.disabled=true;});
    track('agent_lifetime_checkout_start',{tier:'agent',amount_cents:149900,utm_source:new URLSearchParams(location.search||'').get('utm_source')||''});
    try{
      var billing=window.WatchdogBilling;
      if(!billing||typeof billing.client!=='function'||typeof billing.invoke!=='function')throw new Error('Secure checkout is unavailable. Please refresh and try again.');
      var client=billing.client();
      if(!client)throw new Error('Sign in service is unavailable.');
      var result=await client.auth.getSession();
      var session=result&&result.data&&result.data.session;
      if(!session){
        try{sessionStorage.setItem('watchdog:lifetime:pending','agent');sessionStorage.setItem('watchdog:agent-paid:return',location.pathname+location.search);}catch(_){ }
        track('agent_lifetime_signin_required',{tier:'agent'});
        location.href='/property/dashboard?billing=signin&offer=lifetime&from=agent-landing';
        return;
      }
      var checkout=await billing.invoke('create-lifetime-checkout',{tier:'agent'});
      if(!checkout||!checkout.url)throw new Error('Secure checkout did not return a destination.');
      location.href=checkout.url;
    }catch(err){
      busy=false;
      buttons.forEach(function(b){b.disabled=false;});
      console.error('Agent lifetime checkout failed',err);
      var message=(err&&err.message)||'Checkout could not be opened.';
      if(err&&err.code==='LIFETIME_ACTIVE_SUBSCRIPTION')message='This account already has recurring billing. Manage that subscription before switching to Lifetime.';
      if(err&&err.code==='LIFETIME_ALREADY_ACTIVE')message='Agent Founding Lifetime is already active on this account.';
      if(err&&err.code==='WATCHDOG_TEST_NO_REAL_SPEND')message='This test account cannot create a real charge.';
      show(message);
      track('agent_lifetime_checkout_error',{tier:'agent',code:err&&err.code||''});
    }
  }

  function bind(){
    attribution();
    document.querySelectorAll('[data-agent-lifetime-checkout]').forEach(function(button){button.addEventListener('click',startLifetime);});
    document.querySelectorAll('a[href^="#"]').forEach(function(link){link.addEventListener('click',function(){track('agent_landing_section_click',{target:link.getAttribute('href')||''});});});
    track('agent_paid_landing_view',{utm_source:new URLSearchParams(location.search||'').get('utm_source')||'',utm_campaign:new URLSearchParams(location.search||'').get('utm_campaign')||''});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
})();
