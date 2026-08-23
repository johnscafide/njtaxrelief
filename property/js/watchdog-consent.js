/* Watchdog privacy preferences.
   Necessary storage supports authentication, security and saved preferences.
   Optional analytics covers Google Analytics and Microsoft Clarity only. */
(function(){
  'use strict';
  if(window.__WATCHDOG_CONSENT__) return;
  window.__WATCHDOG_CONSENT__ = true;

  var VERSION = 1;
  var STORAGE_KEY = 'watchdog_cookie_preferences_v1';
  var GA_ID = 'G-ENP9182L0J';
  var CLARITY_ID = 'wjeklv0exl';
  var CSS_URL = '/property/css/watchdog-consent.css';
  var stored = readStored();
  var lastFocus = null;

  function readStored(){
    try{
      var parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if(!parsed || Number(parsed.version) !== VERSION || typeof parsed.analytics !== 'boolean') return null;
      return parsed;
    }catch(_){ return null; }
  }
  function persist(analytics){
    stored = {version:VERSION,analytics:!!analytics,updatedAt:new Date().toISOString()};
    try{ localStorage.setItem(STORAGE_KEY,JSON.stringify(stored)); }catch(_){}
  }
  function current(){
    return {version:VERSION,decided:!!stored,necessary:true,analytics:!!(stored && stored.analytics)};
  }
  function ensureCss(){
    if(document.querySelector('link[href="'+CSS_URL+'"]')) return;
    var link=document.createElement('link');link.rel='stylesheet';link.href=CSS_URL;link.setAttribute('data-watchdog-consent-style','1');
    (document.head||document.documentElement).appendChild(link);
  }
  function ensureGoogleQueue(){
    window.dataLayer=window.dataLayer||[];
    if(typeof window.gtag!=='function') window.gtag=function(){window.dataLayer.push(arguments);};
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
  function signalGoogle(analytics,mode){
    ensureGoogleQueue();
    window.gtag('consent',mode||'update',consentPayload(!!analytics));
  }
  function signalClarity(analytics){
    ensureClarityQueue();
    try{
      window.clarity('consentv2',{
        ad_Storage:'denied',
        analytics_Storage:analytics?'granted':'denied'
      });
    }catch(_){}
  }
  function loadGoogle(){
    ensureGoogleQueue();
    if(!window.__watchdogGaConfigured){
      window.__watchdogGaConfigured=true;
      window.gtag('js',new Date());
      window.gtag('config',GA_ID,{anonymize_ip:true});
    }
    if(document.querySelector('script[data-watchdog-consent-ga],script[src*="googletagmanager.com/gtag/js?id='+GA_ID+'"]')) return;
    var script=document.createElement('script');script.async=true;script.src='https://www.googletagmanager.com/gtag/js?id='+encodeURIComponent(GA_ID);script.setAttribute('data-watchdog-consent-ga','1');
    document.head.appendChild(script);
  }
  function loadClarity(){
    ensureClarityQueue();
    signalClarity(true);
    if(document.querySelector('script[data-watchdog-consent-clarity],script[src*="clarity.ms/tag/'+CLARITY_ID+'"]')) return;
    var script=document.createElement('script');script.async=true;script.src='https://www.clarity.ms/tag/'+CLARITY_ID;script.setAttribute('data-watchdog-consent-clarity','1');
    var first=document.getElementsByTagName('script')[0];
    if(first&&first.parentNode) first.parentNode.insertBefore(script,first); else document.head.appendChild(script);
  }
  function clearAnalyticsCookies(){
    var prefixes=['_ga','_gid','_gat','_clck','_clsk'];
    var names=(document.cookie||'').split(';').map(function(v){return v.split('=')[0].trim();}).filter(Boolean);
    names.forEach(function(name){
      if(!prefixes.some(function(prefix){return name===prefix||name.indexOf(prefix+'_')===0;})) return;
      document.cookie=name+'=; Max-Age=0; path=/; SameSite=Lax';
      var host=String(location.hostname||'').replace(/^www\./,'');
      if(host && host.indexOf('.')>0) document.cookie=name+'=; Max-Age=0; path=/; domain=.'+host+'; SameSite=Lax';
    });
  }
  function apply(analytics,save){
    analytics=!!analytics;
    if(save) persist(analytics);
    signalGoogle(analytics,'update');
    signalClarity(analytics);
    if(analytics){ loadGoogle(); loadClarity(); }
    else clearAnalyticsCookies();
    syncControls();
    hideBanner();
    if(save) window.dispatchEvent(new CustomEvent('watchdog:consent-change',{detail:current()}));
  }
  function syncAnalytics(){
    var choice=current();
    signalGoogle(choice.analytics,'update');
    signalClarity(choice.analytics);
    if(choice.analytics){ loadGoogle(); loadClarity(); }
    else clearAnalyticsCookies();
  }
  function privacyHref(){ return '/property/privacy'; }
  function bannerMarkup(){
    return '<div class="wd-consent-copy"><span class="wd-consent-mark" aria-hidden="true"><i class="fas fa-dog"></i></span><div><strong>Choose your cookie preferences</strong><p>Watchdog uses necessary storage for sign-in, security and saved preferences. With your permission, we also use Google Analytics and Microsoft Clarity to understand what is working. We do not use advertising cookies. <a href="'+privacyHref()+'">Privacy Policy</a></p></div></div><div class="wd-consent-actions"><button type="button" class="wd-consent-settings" data-wd-consent-action="settings">Cookie settings</button><button type="button" class="wd-consent-secondary" data-wd-consent-action="reject">Reject optional</button><button type="button" class="wd-consent-primary" data-wd-consent-action="accept">Accept analytics</button></div>';
  }
  function ensureBanner(){
    if(stored || document.getElementById('wd-cookie-banner')) return;
    var banner=document.createElement('section');banner.id='wd-cookie-banner';banner.className='wd-consent-banner';banner.setAttribute('role','region');banner.setAttribute('aria-label','Cookie preferences');banner.innerHTML=bannerMarkup();document.body.appendChild(banner);
  }
  function hideBanner(){ var banner=document.getElementById('wd-cookie-banner');if(banner) banner.remove(); }
  function ensureModal(){
    var shade=document.getElementById('wd-consent-shade');
    if(shade) return shade;
    shade=document.createElement('div');shade.id='wd-consent-shade';shade.className='wd-consent-shade';shade.hidden=true;
    shade.innerHTML='<section class="wd-consent-modal" role="dialog" aria-modal="true" aria-labelledby="wd-consent-title"><header><div><span class="wd-consent-kicker">WATCHDOG PRIVACY</span><h2 id="wd-consent-title">Cookie preferences</h2></div><button class="wd-consent-close" type="button" data-wd-consent-action="close" aria-label="Close cookie settings"><i class="fas fa-xmark"></i></button></header><p class="wd-consent-intro">Choose whether Watchdog may use optional analytics. Necessary storage remains on because it supports account security, authentication and preferences.</p><div class="wd-consent-option"><div><b>Necessary</b><span>Sign-in, security and saved preferences</span></div><span class="wd-consent-always">Always on</span></div><label class="wd-consent-option wd-consent-toggle-row" for="wd-consent-analytics"><div><b>Analytics</b><span>Google Analytics and Microsoft Clarity</span></div><span class="wd-consent-toggle"><input id="wd-consent-analytics" type="checkbox"><span aria-hidden="true"></span></span></label><p class="wd-consent-note">Advertising and personalization storage stays off. Read the <a href="'+privacyHref()+'">Privacy Policy</a> for details.</p><footer><button type="button" class="wd-consent-secondary" data-wd-consent-action="reject">Reject optional</button><button type="button" class="wd-consent-primary" data-wd-consent-action="save">Save preferences</button></footer></section>';
    document.body.appendChild(shade);return shade;
  }
  function syncControls(){
    var input=document.getElementById('wd-consent-analytics');
    if(input) input.checked=!!(stored&&stored.analytics);
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
    if(name==='accept'){apply(true,true);close();return;}
    if(name==='reject'){apply(false,true);close();return;}
    if(name==='save'){var input=document.getElementById('wd-consent-analytics');apply(!!(input&&input.checked),true);close();}
  }

  ensureCss();
  ensureGoogleQueue();
  signalGoogle(false,'default');
  signalClarity(false);
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
    rejectOptional:function(){apply(false,true);},
    setAnalytics:function(value){apply(!!value,true);},
    syncAnalytics:syncAnalytics
  });
})();