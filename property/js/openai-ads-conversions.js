/* Watchdog OpenAI Ads conversion measurement.
   The browser Pixel ID is intentionally public configuration; the Conversions API key is server-only.
   Until WATCHDOG_OPENAI_ADS_PIXEL_ID is configured, this runtime is a safe no-op. */
(function(){
  'use strict';
  if(window.__WATCHDOG_OPENAI_ADS_RUNTIME__)return;
  window.__WATCHDOG_OPENAI_ADS_RUNTIME__=true;

  var SDK='https://bzrcdn.openai.com/sdk/oaiq.min.js';
  var configuredPixelId='';
  var initialized=false;
  var sdkRequested=false;
  var pageViewSent=false;

  function cleanPixelId(value){
    var id=String(value||'').trim();
    return id&&id.length<=128?id:'';
  }
  function pixelId(){
    return cleanPixelId(configuredPixelId||window.WATCHDOG_OPENAI_ADS_PIXEL_ID||'');
  }
  function paidSurface(){
    var path=String(location.pathname||'/').replace(/\/+$/,'')||'/';
    return ['/agent','/investor','/lender','/attorney','/property/pro','/pro'].indexOf(path)>=0;
  }
  function consentGranted(){
    try{return !!(window.WatchdogConsent&&window.WatchdogConsent.state&&window.WatchdogConsent.state().analytics);}catch(_){return false;}
  }
  function queue(){
    if(typeof window.oaiq==='function')return window.oaiq;
    var q=function(){q.q=q.q||[];q.q.push(arguments);};
    window.oaiq=q;
    return q;
  }
  function loadSdk(){
    if(sdkRequested||document.querySelector('script[data-watchdog-openai-ads-pixel]'))return;
    sdkRequested=true;
    var script=document.createElement('script');
    script.src=SDK;script.async=true;script.setAttribute('data-watchdog-openai-ads-pixel','1');
    script.onerror=function(){sdkRequested=false;};
    (document.head||document.documentElement).appendChild(script);
  }
  function pageDescriptor(){
    var path=String(location.pathname||'/').replace(/\/+$/,'')||'/';
    var map={
      '/agent':['agent_landing','Watchdog for New Jersey Agents'],
      '/investor':['investor_landing','Watchdog for New Jersey Investors'],
      '/lender':['lender_landing','Watchdog for New Jersey Lenders'],
      '/attorney':['attorney_landing','Watchdog for New Jersey Tax Attorneys'],
      '/property/pro':['professional_pricing','Watchdog Professional Plans'],
      '/pro':['professional_pricing','Watchdog Professional Plans']
    };
    return map[path]||null;
  }
  function safeMeasure(name,data,options){
    try{
      if(!initialized||!consentGranted())return false;
      queue()('measure',name,data,options||{opt_out:true});
      return true;
    }catch(_){return false;}
  }
  function measurePageView(){
    if(pageViewSent||!consentGranted())return false;
    var page=pageDescriptor();if(!page)return false;
    var sent=safeMeasure('page_viewed',{type:'contents',contents:[{id:page[0],name:page[1],content_type:'page'}]},{opt_out:true});
    if(sent)pageViewSent=true;
    return sent;
  }
  function init(){
    if(!paidSurface())return false;
    var id=pixelId();if(!id)return false;
    try{
      var q=queue();
      q('consent',consentGranted());
      if(!initialized){q('init',{pixelId:id});initialized=true;loadSdk();}
      if(consentGranted())measurePageView();
      return true;
    }catch(_){return false;}
  }
  function cookieRaw(name){
    var prefix=name+'=';
    var parts=String(document.cookie||'').split(';');
    for(var i=0;i<parts.length;i++){
      var part=parts[i].replace(/^\s+/,'');
      if(part.indexOf(prefix)===0)return part.slice(prefix.length);
    }
    return '';
  }
  function sourceUrl(){
    try{
      var u=new URL(location.href);
      if(u.protocol!=='https:'&&u.protocol!=='http:')return '';
      return u.origin+u.pathname;
    }catch(_){return '';}
  }
  function context(){
    if(!consentGranted())return null;
    try{
      return {
        measurement_allowed:true,
        oppref:cookieRaw('__oppref'),
        obref:cookieRaw('__obref'),
        source_url:sourceUrl(),
        user_agent:String(navigator.userAgent||'').slice(0,512)
      };
    }catch(_){return null;}
  }
  function planData(tier,amount){
    var raw=String(tier||'').toLowerCase();
    var normalized=raw==='pro+'?'pro_plus':raw;
    var names={agent:'Watchdog Agent Founding Lifetime',pro:'Watchdog Pro Founding Lifetime',pro_plus:'Watchdog Pro+ Founding Lifetime'};
    var cents=Number(amount||0);
    var data={type:'contents',contents:[{id:'watchdog_founding_lifetime_'+normalized,name:names[normalized]||'Watchdog Founding Lifetime',content_type:'plan',quantity:1}]};
    if(Number.isFinite(cents)&&cents>0){data.amount=Math.round(cents);data.currency='USD';}
    return data;
  }
  function measureCheckoutStarted(tier,amount){
    return safeMeasure('checkout_started',planData(tier,amount),{opt_out:true});
  }
  function measureOrderCreated(tier,amount,eventId){
    var id=String(eventId||'').trim();
    if(!id)return false;
    return safeMeasure('order_created',planData(tier,amount),{event_id:id,opt_out:true});
  }
  function configure(value){configuredPixelId=cleanPixelId(value);return init();}
  function syncConsent(){
    try{
      if(!pixelId())return;
      queue()('consent',consentGranted());
      if(!initialized)init();
      else if(consentGranted())measurePageView();
    }catch(_){}
  }

  window.WatchdogOpenAIAds=Object.freeze({
    init:init,
    configure:configure,
    context:context,
    measureCheckoutStarted:measureCheckoutStarted,
    measureOrderCreated:measureOrderCreated,
    consentGranted:consentGranted
  });

  window.addEventListener('watchdog:consent-change',syncConsent);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
