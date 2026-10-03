/* Watchdog privacy preferences.
   Necessary storage supports authentication, security and saved preferences.
   Google Analytics and OpenAI Ads measurement remain opt-in. Microsoft Clarity
   may load in cookieless no-consent mode on Watchdog so installation is verifiable
   without setting optional cookies; full Clarity analytics is enabled only after consent.
   Advertising cookies are a separate opt-in that only exists on WatchdogIndex once an
   ad platform ID is filled in below. Until then the banner, the Google consent signals
   and the cookie settings stay exactly as they are (ad storage and personalization denied).
   Global Privacy Control or Do Not Track keeps advertising off whatever was chosen. */
(function(){
  'use strict';
  if(window.__WATCHDOG_CONSENT__) return;
  window.__WATCHDOG_CONSENT__ = true;

  var VERSION = 1;
  var STORAGE_KEY = 'watchdog_cookie_preferences_v1';
  var GA_IDS = Object.freeze({
    watchdog:'G-EDW7CZV66M',
    legacy:'G-ENP9182L0J'
  });
  /* Google combined the Watchdog stream into the Google tag that also serves the
     NJPTR property, so gtag/js?id=G-EDW7CZV66M 404s and configuring it alone sends
     nothing. Load and configure that Google tag instead, and route events to the
     Watchdog stream only with send_to. */
  var GA_GOOGLE_TAG = Object.freeze({'G-EDW7CZV66M':'GT-PZ6GJ8Z4'});
  var CLARITY_IDS = Object.freeze({
    watchdog:'y8g1uivano',
    legacy:'wjeklv0exl'
  });
  /* Ad platform IDs. Blank means that platform never loads. Before filling any of
     these in: publish the Advertising section of the Privacy Policy (draft in
     property/docs/ad-tracking-setup.md) and send the account-holder notice the policy
     promises for new sharing. property/tests/ad-pixels-contract.mjs enforces this. */
  var AD_PIXELS = {
    meta:{pixel_id:''},
    google_ads:{conversion_id:'',labels:{lead:'',sign_up:'',checkout_started:'',trial_started:'',subscribe:'',purchase:''}},
    linkedin:{partner_id:'',conversion_ids:{lead:'',sign_up:'',checkout_started:'',trial_started:'',subscribe:'',purchase:''}},
    tiktok:{pixel_id:''},
    microsoft:{uet_tag_id:''},
    reddit:{pixel_id:''},
    pinterest:{tag_id:''},
    snapchat:{pixel_id:''},
    x:{pixel_id:'',event_ids:{lead:'',sign_up:'',checkout_started:'',trial_started:'',subscribe:'',purchase:''}},
    nextdoor:{pixel_id:''}
  };
  var AD_RUNTIME_URL = '/property/js/watchdog-ad-pixels.js';
  var CSS_URL = '/property/css/watchdog-consent.css';
  var CONTACT_POLICY_URL = '/property/js/contact-routing-policy.js';
  var stored = readStored();
  var lastFocus = null;
  var analyticsLoadQueued = false;

  function normalizedHost(){
    return String(location.hostname||'').toLowerCase().replace(/\.$/,'');
  }
  function googleAnalyticsId(){
    var host=normalizedHost();
    if(host==='watchdogindex.com'||host==='www.watchdogindex.com') return GA_IDS.watchdog;
    if(host==='njpropertytaxrelief.com'||host==='www.njpropertytaxrelief.com') return GA_IDS.legacy;
    return '';
  }
  function clarityId(){
    var host=normalizedHost();
    if(host==='watchdogindex.com'||host==='www.watchdogindex.com') return CLARITY_IDS.watchdog;
    if(host==='njpropertytaxrelief.com'||host==='www.njpropertytaxrelief.com') return CLARITY_IDS.legacy;
    return '';
  }
  var GA_ID = googleAnalyticsId();
  var CLARITY_ID = clarityId();
  function privacySignal(){
    return navigator.globalPrivacyControl===true||String(navigator.doNotTrack||'')==='1';
  }
  function adPlatformConfigured(){
    return Object.keys(AD_PIXELS).some(function(key){
      var row=AD_PIXELS[key]||{};
      return ['pixel_id','conversion_id','partner_id','uet_tag_id','tag_id'].some(function(field){return String(row[field]||'').trim()!=='';});
    });
  }
  function isWatchdogHost(){
    var host=normalizedHost();
    return host==='watchdogindex.com'||host==='www.watchdogindex.com';
  }
  var ADS_AVAILABLE = isWatchdogHost() && adPlatformConfigured();

  function ensureContactPolicy(){
    if(window.WatchdogContactPolicy || document.querySelector('script[src="'+CONTACT_POLICY_URL+'"]')) return;
    var script=document.createElement('script');script.src=CONTACT_POLICY_URL;script.async=false;script.setAttribute('data-watchdog-contact-policy-runtime','1');
    (document.head||document.documentElement).appendChild(script);
  }
  ensureContactPolicy();

  function readStored(){
    try{
      var parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if(!parsed || Number(parsed.version) !== VERSION || typeof parsed.analytics !== 'boolean') return null;
      if(typeof parsed.advertising !== 'boolean') parsed.advertising = false;
      return parsed;
    }catch(_){ return null; }
  }
  function persist(analytics,advertising){
    stored = {version:VERSION,analytics:!!analytics,advertising:!!advertising,adChoiceMade:ADS_AVAILABLE,updatedAt:new Date().toISOString()};
    try{ localStorage.setItem(STORAGE_KEY,JSON.stringify(stored)); }catch(_){}
  }
  function advertisingAllowed(){
    return ADS_AVAILABLE && !privacySignal() && !!(stored && stored.advertising);
  }
  function needsChoice(){
    if(!stored) return true;
    return ADS_AVAILABLE && stored.adChoiceMade !== true;
  }
  function current(){
    return {version:VERSION,decided:!!stored,necessary:true,analytics:!!(stored && stored.analytics),advertising:advertisingAllowed(),advertisingAvailable:ADS_AVAILABLE};
  }
  function ensureCss(){
    if(document.querySelector('link[href="'+CSS_URL+'"]')) return;
    var link=document.createElement('link');link.rel='stylesheet';link.href=CSS_URL;link.setAttribute('data-watchdog-consent-style','1');
    (document.head||document.documentElement).appendChild(link);
  }
  function ensureGoogleQueue(){
    window.dataLayer=window.dataLayer||[];
    if(typeof window.gtag!=='function') window.gtag=function(){window.dataLayer.push(arguments);};
    if(GA_ID&&GA_GOOGLE_TAG[GA_ID]&&!window.gtag.__watchdogSendTo){
      var base=window.gtag;
      window.gtag=function(cmd,name,params){
        if(cmd==='event'&&!(params&&params.send_to)){
          var routed={};for(var k in (params||{})) if(Object.prototype.hasOwnProperty.call(params,k)) routed[k]=params[k];
          routed.send_to=GA_ID;
          return base(cmd,name,routed);
        }
        return base.apply(this,arguments);
      };
      window.gtag.__watchdogSendTo=true;
    }
  }
  function ensureClarityQueue(){
    if(typeof window.clarity!=='function') window.clarity=function(){(window.clarity.q=window.clarity.q||[]).push(arguments);};
  }
  function consentPayload(analytics){
    return {
      ad_storage:'denied',
      ad_user_data:'denied',
      ad_personalization:'denied',
      analytics_storage:analytics?'granted':'denied',
      functionality_storage:'granted',
      security_storage:'granted',
      personalization_storage:'denied'
    };
  }
  /* Only reached when the visitor opted into advertising on a host with an ad
     platform configured and no Global Privacy Control / Do Not Track signal. */
  function advertisingPayload(analytics){
    var payload=consentPayload(analytics);
    payload.ad_storage='granted';
    payload.ad_user_data='granted';
    payload.ad_personalization='granted';
    return payload;
  }
  function signalGoogle(analytics,mode){
    ensureGoogleQueue();
    window.gtag('consent',mode||'update',mode!=='default'&&advertisingAllowed()?advertisingPayload(!!analytics):consentPayload(!!analytics));
  }
  function signalClarity(analytics){
    if(!CLARITY_ID) return;
    ensureClarityQueue();
    try{
      window.clarity('consentv2',{
        ad_Storage:'denied',
        analytics_Storage:analytics?'granted':'denied'
      });
    }catch(_){}
  }
  function loadGoogle(){
    if(!GA_ID) return;
    ensureGoogleQueue();
    if(!window.__watchdogGaConfigured){
      window.__watchdogGaConfigured=true;
      window.gtag('js',new Date());
      if(GA_GOOGLE_TAG[GA_ID]){
        window.gtag('config',GA_GOOGLE_TAG[GA_ID],{anonymize_ip:true,send_page_view:false});
        window.gtag('event','page_view',{send_to:GA_ID});
      }else{
        window.gtag('config',GA_ID,{anonymize_ip:true});
      }
    }
    var tagId=GA_GOOGLE_TAG[GA_ID]||GA_ID;
    if(document.querySelector('script[data-watchdog-consent-ga],script[src*="googletagmanager.com/gtag/js?id='+tagId+'"]')) return;
    var script=document.createElement('script');script.async=true;script.src='https://www.googletagmanager.com/gtag/js?id='+encodeURIComponent(tagId);script.setAttribute('data-watchdog-consent-ga','1');
    document.head.appendChild(script);
  }
  function loadClarity(analytics){
    if(!CLARITY_ID) return;
    ensureClarityQueue();
    signalClarity(!!analytics);
    if(document.querySelector('script[data-watchdog-consent-clarity],script[src*="clarity.ms/tag/'+CLARITY_ID+'"]')) return;
    var script=document.createElement('script');script.async=true;script.src='https://www.clarity.ms/tag/'+CLARITY_ID;script.setAttribute('data-watchdog-consent-clarity','1');
    var first=document.getElementsByTagName('script')[0];
    if(first&&first.parentNode) first.parentNode.insertBefore(script,first); else document.head.appendChild(script);
  }
  function loadAllowedAnalytics(){
    if(document.readyState!=='loading'){loadGoogle();loadClarity(true);return;}
    if(analyticsLoadQueued)return;
    analyticsLoadQueued=true;
    document.addEventListener('DOMContentLoaded',function(){analyticsLoadQueued=false;loadGoogle();loadClarity(true);},{once:true});
  }
  function loadAdvertising(){
    if(!advertisingAllowed()) return;
    if(window.WatchdogAdPixels&&typeof window.WatchdogAdPixels.enable==='function'){window.WatchdogAdPixels.enable();return;}
    if(document.querySelector('script[src="'+AD_RUNTIME_URL+'"]')) return;
    var script=document.createElement('script');script.src=AD_RUNTIME_URL;script.async=true;script.setAttribute('data-watchdog-ad-pixels-runtime','1');
    (document.head||document.documentElement).appendChild(script);
  }
  function stopAdvertising(){
    if(window.WatchdogAdPixels&&typeof window.WatchdogAdPixels.disable==='function') window.WatchdogAdPixels.disable();
    var prefixes=['_fbp','_fbc','_gcl_au','_gcl_aw','_gcl_dc','_gcl_gb','_ttp','_uetsid','_uetvid','_uetmsclkid','_rdt_uuid','_rdt_cid','_pin_unauth','_pinterest_ct_ua','_epik','_scid','_sctr','_twclid','muc_ads'];
    var names=(document.cookie||'').split(';').map(function(v){return v.split('=')[0].trim();}).filter(Boolean);
    names.forEach(function(name){
      if(!prefixes.some(function(prefix){return name===prefix||name.indexOf(prefix+'_')===0;})) return;
      document.cookie=name+'=; Max-Age=0; path=/; SameSite=Lax';
      var host=String(location.hostname||'').replace(/^www\./,'');
      if(host && host.indexOf('.')>0) document.cookie=name+'=; Max-Age=0; path=/; domain=.'+host+'; SameSite=Lax';
    });
  }
  function syncAdvertising(){
    if(advertisingAllowed()) loadAdvertising(); else if(ADS_AVAILABLE) stopAdvertising();
  }
  function clearAnalyticsCookies(){
    var prefixes=['_ga','_gid','_gat','_clck','_clsk','__oppref','__obref'];
    var names=(document.cookie||'').split(';').map(function(v){return v.split('=')[0].trim();}).filter(Boolean);
    names.forEach(function(name){
      if(!prefixes.some(function(prefix){return name===prefix||name.indexOf(prefix+'_')===0;})) return;
      document.cookie=name+'=; Max-Age=0; path=/; SameSite=Lax';
      var host=String(location.hostname||'').replace(/^www\./,'');
      if(host && host.indexOf('.')>0) document.cookie=name+'=; Max-Age=0; path=/; domain=.'+host+'; SameSite=Lax';
    });
  }
  function apply(analytics,save,advertising){
    analytics=!!analytics;
    if(save) persist(analytics,typeof advertising==='boolean'?advertising:!!(stored&&stored.advertising));
    signalGoogle(analytics,'update');
    signalClarity(analytics);
    if(analytics) loadAllowedAnalytics();
    else clearAnalyticsCookies();
    syncAdvertising();
    syncControls();
    hideBanner();
    if(save) window.dispatchEvent(new CustomEvent('watchdog:consent-change',{detail:current()}));
  }
  function syncAnalytics(){
    var choice=current();
    signalGoogle(choice.analytics,'update');
    signalClarity(choice.analytics);
    if(choice.analytics) loadAllowedAnalytics();
    else clearAnalyticsCookies();
    syncAdvertising();
  }
  function privacyHref(){ return '/property/privacy'; }
  function bannerMarkup(){
    // content-architecture: dynamic — consent disclosure reflects the optional measurement providers enabled by this runtime.
    if(ADS_AVAILABLE) return '<div class="wd-consent-copy"><span class="wd-consent-mark" aria-hidden="true"><i class="fas fa-dog"></i></span><div><strong>Choose your cookie preferences</strong><p>Watchdog uses cookies to keep you signed in and remember preferences. Optional measurement cookies help us understand product use. Optional advertising cookies let ad platforms measure Watchdog ads and show you Watchdog ads on other sites. Both stay off unless you turn them on. <a href="'+privacyHref()+'">Privacy Policy</a></p></div></div><div class="wd-consent-actions"><button type="button" class="wd-consent-settings" data-wd-consent-action="settings">Cookie settings</button><button type="button" class="wd-consent-secondary" data-wd-consent-action="reject">Reject optional cookies</button><button type="button" class="wd-consent-primary" data-wd-consent-action="accept">Accept all cookies</button></div>';
    return '<div class="wd-consent-copy"><span class="wd-consent-mark" aria-hidden="true"><i class="fas fa-dog"></i></span><div><strong>Choose your cookie preferences</strong><p>Watchdog uses cookies to keep you signed in and remember preferences. Optional measurement cookies help us understand product use and whether Watchdog ads lead to sign-ups or purchases. We do not sell personal information or enable ad personalization on Watchdog. <a href="'+privacyHref()+'">Privacy Policy</a></p></div></div><div class="wd-consent-actions"><button type="button" class="wd-consent-settings" data-wd-consent-action="settings">Cookie settings</button><button type="button" class="wd-consent-secondary" data-wd-consent-action="reject">Reject optional cookies</button><button type="button" class="wd-consent-primary" data-wd-consent-action="accept">Accept all cookies</button></div>';
  }
  function ensureBanner(){
    if(!needsChoice() || document.getElementById('wd-cookie-banner')) return;
    var banner=document.createElement('section');banner.id='wd-cookie-banner';banner.className='wd-consent-banner';banner.setAttribute('role','region');banner.setAttribute('aria-label','Cookie preferences');banner.innerHTML=bannerMarkup();document.body.appendChild(banner);
  }
  function hideBanner(){ var banner=document.getElementById('wd-cookie-banner');if(banner) banner.remove(); }
  function ensureModal(){
    var shade=document.getElementById('wd-consent-shade');
    if(shade) return shade;
    shade=document.createElement('div');shade.id='wd-consent-shade';shade.className='wd-consent-shade';shade.hidden=true;
    // content-architecture: dynamic — modal disclosure mirrors the enabled consent-gated measurement providers, the advertising row when an ad platform is configured, and their opt-out boundary.
    shade.innerHTML='<section class="wd-consent-modal" role="dialog" aria-modal="true" aria-labelledby="wd-consent-title"><header><div><span class="wd-consent-kicker">WATCHDOG PRIVACY</span><h2 id="wd-consent-title">Cookie preferences</h2></div><button class="wd-consent-close" type="button" data-wd-consent-action="close" aria-label="Close cookie settings"><i class="fas fa-xmark"></i></button></header><p class="wd-consent-intro">Choose whether Watchdog may use optional measurement cookies. Necessary cookies stay on because they support account security, sign-in and saved preferences.</p><div class="wd-consent-option"><div><b>Necessary cookies</b><span>Sign-in, security and saved preferences</span></div><span class="wd-consent-always">Always on</span></div><label class="wd-consent-option wd-consent-toggle-row" for="wd-consent-analytics"><div><b>Optional analytics &amp; ad measurement</b><span>Site analytics and attribution for Watchdog campaigns</span></div><span class="wd-consent-toggle"><input id="wd-consent-analytics" type="checkbox"><span aria-hidden="true"></span></span></label>'+advertisingRow()+'<footer><button type="button" class="wd-consent-secondary" data-wd-consent-action="reject">Reject optional cookies</button><button type="button" class="wd-consent-primary" data-wd-consent-action="save">Save preferences</button></footer></section>';
    document.body.appendChild(shade);return shade;
  }
  // content-architecture: dynamic — the advertising row exists only when an ad platform is configured, and its toggle and note change with the visitor's Global Privacy Control / Do Not Track signal.
  function advertisingRow(){
    if(!ADS_AVAILABLE) return '<p class="wd-consent-note">Ad personalization stays off. OpenAI ad measurement can use a privacy-preserving click or browser reference only after you opt in. Read the <a href="'+privacyHref()+'">Privacy Policy</a> for details.</p>';
    var blocked=privacySignal();
    return '<label class="wd-consent-option wd-consent-toggle-row" for="wd-consent-advertising"><div><b>Advertising cookies</b><span>Lets ad platforms such as Meta, Google, LinkedIn and TikTok measure Watchdog ads and show you Watchdog ads on other sites</span></div><span class="wd-consent-toggle"><input id="wd-consent-advertising" type="checkbox"'+(blocked?' disabled':'')+'><span aria-hidden="true"></span></span></label><p class="wd-consent-note">'+(blocked?'Your browser is sending a Global Privacy Control or Do Not Track signal, so advertising cookies stay off. ':'')+'Advertising cookies are off unless you turn them on, and you can turn them off here at any time. Read the <a href="'+privacyHref()+'">Privacy Policy</a> for the full list of ad platforms.</p>';
  }
  function syncControls(){
    var input=document.getElementById('wd-consent-analytics');
    if(input) input.checked=!!(stored&&stored.analytics);
    var ads=document.getElementById('wd-consent-advertising');
    if(ads) ads.checked=advertisingAllowed();
  }
  function open(){
    ensureCss();var shade=ensureModal();lastFocus=document.activeElement;syncControls();shade.hidden=false;document.documentElement.classList.add('wd-consent-open');
    var close=shade.querySelector('.wd-consent-close');if(close) close.focus();
  }
  function close(){
    var shade=document.getElementById('wd-consent-shade');if(shade) shade.hidden=true;document.documentElement.classList.remove('wd-consent-open');
    if(lastFocus&&lastFocus.focus) try{lastFocus.focus();}catch(_){} lastFocus=null;
  }
  function appendOnboardingLink(){
    var footer=document.getElementById('wd-onboarding-footer');
    if(!footer||footer.querySelector('[data-watchdog-cookie-settings]')) return;
    var button=document.createElement('button');button.type='button';button.className='wd-onboarding-cookie-link';button.setAttribute('data-watchdog-cookie-settings','');button.textContent='Cookie preferences';footer.appendChild(document.createTextNode(' · '));footer.appendChild(button);
  }
  function onClick(event){
    var settings=event.target.closest&&event.target.closest('[data-watchdog-cookie-settings]');
    if(settings){event.preventDefault();open();return;}
    var action=event.target.closest&&event.target.closest('[data-wd-consent-action]');if(!action)return;
    var name=action.getAttribute('data-wd-consent-action');
    if(name==='settings'){open();return;}
    if(name==='close'){close();return;}
    if(name==='accept'){apply(true,true,ADS_AVAILABLE&&!privacySignal());close();return;}
    if(name==='reject'){apply(false,true,false);close();return;}
    if(name==='save'){var input=document.getElementById('wd-consent-analytics');var ads=document.getElementById('wd-consent-advertising');apply(!!(input&&input.checked),true,!!(ads&&ads.checked&&!privacySignal()));close();}
  }

  ensureCss();
  ensureGoogleQueue();
  signalGoogle(false,'default');
  signalClarity(false);
  if(CLARITY_ID===CLARITY_IDS.watchdog) loadClarity(!!(stored&&stored.analytics));
  if(stored) apply(stored.analytics,false);

  function ready(){ ensureBanner();ensureModal();appendOnboardingLink();syncControls(); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',ready,{once:true}); else ready();
  document.addEventListener('click',onClick);
  document.addEventListener('keydown',function(event){if(event.key==='Escape')close();});

  window.WatchdogConsent=Object.freeze({
    version:VERSION,
    state:current,
    open:open,
    acceptAnalytics:function(){apply(true,true);},
    rejectOptional:function(){apply(false,true,false);},
    setAnalytics:function(value){apply(!!value,true);},
    setAdvertising:function(value){apply(!!(stored&&stored.analytics),true,!!value&&ADS_AVAILABLE&&!privacySignal());},
    adPixels:function(){return ADS_AVAILABLE?JSON.parse(JSON.stringify(AD_PIXELS)):null;},
    syncAnalytics:syncAnalytics
  });
})();