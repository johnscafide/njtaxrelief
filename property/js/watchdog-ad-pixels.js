/* Watchdog advertising pixels.
   watchdog-consent.js loads this file only on WatchdogIndex, only after the visitor
   turns on Advertising cookies, and only when an ad platform ID is filled in there.
   This file checks all of that again and also stays off under Global Privacy Control
   or Do Not Track. A platform with a blank ID never loads.

   Where conversions come from (no other page needs to change):
   - the GA4 event names the site already sends through window.gtag, including any
     sent before this file loaded (read back from window.dataLayer);
   - clicks on plan buttons ([data-billing-plan]) for checkout starts;
   - return URLs from Stripe Checkout (/account?checkout=success, with &trial=1 for a
     14-day trial start, and the agent trial thank-you page);
   - a first sign-in within two hours of account creation, for sign-ups.
   No email, name, phone or property data is sent to any ad platform from here. */
(function(){
  'use strict';
  if(window.WatchdogAdPixels) return;

  var host=String(location.hostname||'').toLowerCase().replace(/\.$/,'');
  if(host!=='watchdogindex.com'&&host!=='www.watchdogindex.com') return;

  function privacySignal(){ return navigator.globalPrivacyControl===true||String(navigator.doNotTrack||'')==='1'; }
  function consented(){
    try{
      var c=window.WatchdogConsent&&typeof window.WatchdogConsent.state==='function'?window.WatchdogConsent.state():null;
      return !!(c&&c.advertising===true)&&!privacySignal();
    }catch(_){ return false; }
  }
  var config=window.WatchdogConsent&&typeof window.WatchdogConsent.adPixels==='function'?window.WatchdogConsent.adPixels():null;
  if(!config||!consented()) return;

  var enabled=true;
  var CURRENCY='USD';
  var LIFETIME_VALUE={agent:1499,pro:3499,pro_plus:9999};
  var PLAN_VALUE={agent:{monthly:59,yearly:590},pro:{monthly:129,yearly:1290},pro_plus:{monthly:399,yearly:3990}};
  var LANDING_PATHS=['/pro','/agents/trial','/real-estate-agents','/for/real-estate-agents','/agents','/agent','/pricing'];

  /* Site GA4 event name -> Watchdog conversion name. */
  var GA_EVENTS={
    view_landing:'view_landing',
    pro_demo_success:'lead',
    founding_invite_requested:'lead',
    checkout_started:'checkout_started',
    pro_lifetime_checkout_start:'checkout_started',
    trial_started:'trial_started',
    subscription_confirmed:'subscribe',
    pro_lifetime_checkout_complete:'purchase'
  };

  function id(v){ return String(v||'').trim(); }
  function uuid(){
    if(window.crypto&&typeof window.crypto.randomUUID==='function') return window.crypto.randomUUID();
    return 'wd-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10);
  }
  function addScript(src){
    var s=document.createElement('script');s.async=true;s.src=src;s.setAttribute('data-watchdog-ad-pixel','1');
    var first=document.getElementsByTagName('script')[0];
    if(first&&first.parentNode) first.parentNode.insertBefore(s,first); else (document.head||document.documentElement).appendChild(s);
  }
  function safe(fn){ try{ fn(); }catch(_){} }
  function normalizePlan(v){ var p=String(v||'').toLowerCase(); return p==='pro+'?'pro_plus':(PLAN_VALUE[p]?p:''); }

  /* ---------------------------------------------------------------- loaders */
  var platforms=[];

  var meta=config.meta||{};
  if(id(meta.pixel_id)) platforms.push({
    name:'meta',
    load:function(){
      !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
      window.fbq('init',id(meta.pixel_id));
      window.fbq('track','PageView');
    },
    send:function(ev){
      var map={view_landing:'ViewContent',lead:'Lead',sign_up:'CompleteRegistration',checkout_started:'InitiateCheckout',trial_started:'StartTrial',subscribe:'Subscribe',purchase:'Purchase'};
      var data={currency:CURRENCY,value:ev.value||0};if(ev.plan)data.content_name=ev.plan;
      if(ev.name==='trial_started'&&ev.predicted_ltv)data.predicted_ltv=ev.predicted_ltv;
      window.fbq('track',map[ev.name],data,{eventID:ev.event_id});
    },
    stop:function(){ if(typeof window.fbq==='function') window.fbq('consent','revoke'); }
  });

  var gads=config.google_ads||{};
  if(id(gads.conversion_id)) platforms.push({
    name:'google_ads',
    load:function(){
      window.dataLayer=window.dataLayer||[];
      if(typeof window.gtag!=='function') window.gtag=function(){window.dataLayer.push(arguments);};
      if(!document.querySelector('script[src*="googletagmanager.com/gtag/js"]')) addScript('https://www.googletagmanager.com/gtag/js?id='+encodeURIComponent(id(gads.conversion_id)));
      window.gtag('js',new Date());
      window.gtag('config',id(gads.conversion_id));
    },
    send:function(ev){
      var label=id((gads.labels||{})[ev.name]);if(!label)return;
      var data={send_to:id(gads.conversion_id)+'/'+label,currency:CURRENCY,transaction_id:ev.event_id};if(ev.value)data.value=ev.value;
      gtagOriginal('event','conversion',data);
    }
  });

  var li=config.linkedin||{};
  if(id(li.partner_id)) platforms.push({
    name:'linkedin',
    load:function(){
      window._linkedin_partner_id=id(li.partner_id);
      window._linkedin_data_partner_ids=window._linkedin_data_partner_ids||[];
      window._linkedin_data_partner_ids.push(window._linkedin_partner_id);
      (function(l){if(!l){window.lintrk=function(a,b){window.lintrk.q.push([a,b])};window.lintrk.q=[]}})(window.lintrk);
      addScript('https://snap.licdn.com/li.lms-analytics/insight.min.js');
    },
    send:function(ev){
      var cid=id((li.conversion_ids||{})[ev.name]);if(!cid)return;
      window.lintrk('track',{conversion_id:Number(cid)||cid});
    }
  });

  var tt=config.tiktok||{};
  if(id(tt.pixel_id)) platforms.push({
    name:'tiktok',
    load:function(){
      !function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=['page','track','identify','instances','debug','on','off','once','ready','alias','group','enableCookie','disableCookie','holdConsent','revokeConsent','grantConsent'];ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e};ttq.load=function(e,n){var r='https://analytics.tiktok.com/i18n/pixel/events.js';ttq._i=ttq._i||{};ttq._i[e]=[];ttq._i[e]._u=r;ttq._t=ttq._t||{};ttq._t[e]=+new Date;ttq._o=ttq._o||{};ttq._o[e]=n||{};var o=d.createElement('script');o.type='text/javascript';o.async=!0;o.src=r+'?sdkid='+e+'&lib='+t;var a=d.getElementsByTagName('script')[0];a.parentNode.insertBefore(o,a)};}(window,document,'ttq');
      window.ttq.load(id(tt.pixel_id));
      window.ttq.page();
    },
    send:function(ev){
      var map={view_landing:'ViewContent',lead:'SubmitForm',sign_up:'CompleteRegistration',checkout_started:'InitiateCheckout',trial_started:'Subscribe',subscribe:'CompletePayment',purchase:'CompletePayment'};
      var data={currency:CURRENCY,value:ev.value||0,content_type:'product'};if(ev.plan)data.content_id=ev.plan;
      window.ttq.track(map[ev.name],data,{event_id:ev.event_id});
    },
    stop:function(){ if(window.ttq&&typeof window.ttq.revokeConsent==='function') window.ttq.revokeConsent(); }
  });

  var ms=config.microsoft||{};
  if(id(ms.uet_tag_id)) platforms.push({
    name:'microsoft',
    load:function(){
      window.uetq=window.uetq||[];
      window.uetq.push('consent','default',{ad_storage:'granted'});
      (function(w,d,t,r,u){var f,n,i;w[u]=w[u]||[];f=function(){var o={ti:id(ms.uet_tag_id),enableAutoSpaTracking:true};o.q=w[u];w[u]=new w.UET(o);w[u].push('pageLoad')};n=d.createElement(t);n.src=r;n.async=1;n.onload=n.onreadystatechange=function(){var s=this.readyState;s&&s!=='loaded'&&s!=='complete'||(f(),n.onload=n.onreadystatechange=null)};i=d.getElementsByTagName(t)[0];i.parentNode.insertBefore(n,i)})(window,document,'script','https://bat.bing.com/bat.js','uetq');
    },
    send:function(ev){
      var data={event_category:'watchdog',event_label:ev.plan||''};if(ev.value){data.revenue_value=ev.value;data.currency=CURRENCY;}
      window.uetq.push('event',ev.name,data);
    },
    stop:function(){ if(window.uetq&&typeof window.uetq.push==='function') window.uetq.push('consent','update',{ad_storage:'denied'}); }
  });

  var rd=config.reddit||{};
  if(id(rd.pixel_id)) platforms.push({
    name:'reddit',
    load:function(){
      !function(w,d){if(!w.rdt){var p=w.rdt=function(){p.sendEvent?p.sendEvent.apply(p,arguments):p.callQueue.push(arguments)};p.callQueue=[];var t=d.createElement('script');t.src='https://www.redditstatic.com/ads/pixel.js';t.async=!0;var s=d.getElementsByTagName('script')[0];s.parentNode.insertBefore(t,s)}}(window,document);
      window.rdt('init',id(rd.pixel_id));
      window.rdt('track','PageVisit');
    },
    send:function(ev){
      var map={view_landing:'ViewContent',lead:'Lead',sign_up:'SignUp',subscribe:'Purchase',purchase:'Purchase'};
      var custom={checkout_started:'CheckoutStarted',trial_started:'TrialStarted'};
      var data={conversionId:ev.event_id,currency:CURRENCY};if(ev.value)data.value=ev.value;
      if(map[ev.name]) window.rdt('track',map[ev.name],data);
      else if(custom[ev.name]){data.customEventName=custom[ev.name];window.rdt('track','Custom',data);}
    }
  });

  var pin=config.pinterest||{};
  if(id(pin.tag_id)) platforms.push({
    name:'pinterest',
    load:function(){
      !function(e){if(!window.pintrk){window.pintrk=function(){window.pintrk.queue.push(Array.prototype.slice.call(arguments))};var n=window.pintrk;n.queue=[];n.version='3.0';var t=document.createElement('script');t.async=!0;t.src=e;var r=document.getElementsByTagName('script')[0];r.parentNode.insertBefore(t,r)}}('https://s.pinimg.com/ct/core.js');
      window.pintrk('load',id(pin.tag_id));
      window.pintrk('page');
    },
    send:function(ev){
      var map={lead:'lead',sign_up:'signup',trial_started:'signup',subscribe:'checkout',purchase:'checkout'};
      if(!map[ev.name])return;
      var data={event_id:ev.event_id,currency:CURRENCY};if(ev.value)data.value=ev.value;
      window.pintrk('track',map[ev.name],data);
    }
  });

  var snap=config.snapchat||{};
  if(id(snap.pixel_id)) platforms.push({
    name:'snapchat',
    load:function(){
      (function(e,t,n){if(e.snaptr)return;var a=e.snaptr=function(){a.handleRequest?a.handleRequest.apply(a,arguments):a.queue.push(arguments)};a.queue=[];var s='script';var r=t.createElement(s);r.async=!0;r.src=n;var u=t.getElementsByTagName(s)[0];u.parentNode.insertBefore(r,u);})(window,document,'https://sc-static.net/scevent.min.js');
      window.snaptr('init',id(snap.pixel_id),{});
      window.snaptr('track','PAGE_VIEW');
    },
    send:function(ev){
      var map={view_landing:'VIEW_CONTENT',lead:'CUSTOM_EVENT_1',sign_up:'SIGN_UP',checkout_started:'START_CHECKOUT',trial_started:'START_TRIAL',subscribe:'SUBSCRIBE',purchase:'PURCHASE'};
      var data={client_dedup_id:ev.event_id,currency:CURRENCY};if(ev.value)data.price=ev.value;
      window.snaptr('track',map[ev.name],data);
    }
  });

  /* X and Nextdoor: check this base code against the snippet your ads dashboard shows
     when you create the pixel; send any difference to engineering. */
  var x=config.x||{};
  if(id(x.pixel_id)) platforms.push({
    name:'x',
    load:function(){
      !function(e,t,n,s,u,a){e.twq||(s=e.twq=function(){s.exe?s.exe.apply(s,arguments):s.queue.push(arguments)},s.version='1.1',s.queue=[],u=t.createElement(n),u.async=!0,u.src='https://static.ads-twitter.com/uwt.js',a=t.getElementsByTagName(n)[0],a.parentNode.insertBefore(u,a))}(window,document,'script');
      window.twq('config',id(x.pixel_id));
    },
    send:function(ev){
      var eid=id((x.event_ids||{})[ev.name]);if(!eid)return;
      var data={conversion_id:ev.event_id,currency:CURRENCY};if(ev.value)data.value=ev.value;
      window.twq('event',eid,data);
    }
  });

  var nd=config.nextdoor||{};
  if(id(nd.pixel_id)) platforms.push({
    name:'nextdoor',
    load:function(){
      (function(win,doc,src){if(win.ndp)return;var tr=win.ndp=function(){tr.handleRequest?tr.handleRequest.apply(tr,arguments):tr.queue.push(arguments)};tr.queue=[];var s=doc.createElement('script');s.async=!0;s.src=src;var p=doc.getElementsByTagName('script')[0];p.parentNode.insertBefore(s,p);})(window,document,'https://ads.nextdoor.com/public/pixel/ndp.js');
      window.ndp('init',id(nd.pixel_id),{});
      window.ndp('track','PAGE_VIEW');
    },
    /* Nextdoor conversions are set up as URL rules in Nextdoor Ads Manager
       (for example /agents/trial/thanks and /account?checkout=success). */
    send:function(){}
  });

  if(!platforms.length) return;

  /* ---------------------------------------------------------------- events */
  var sent={};
  function onceKey(key){
    if(sent[key]) return false;
    sent[key]=true;
    try{
      var k='wd_ad_sent_'+key;
      if(sessionStorage.getItem(k)) return false;
      sessionStorage.setItem(k,'1');
    }catch(_){}
    return true;
  }
  function conversion(name,detail){
    if(!enabled||!consented()) return;
    detail=detail||{};
    /* The same moment can arrive twice (a GA4 event and its return URL). */
    if(detail.event_id&&!onceKey(name+'_'+String(detail.event_id).slice(0,80))) return;
    var plan=normalizePlan(detail.plan||detail.tier);
    var cadence=String(detail.cadence||detail.billing_period||'').toLowerCase();
    var value=Number(detail.value)||0;
    if(!value&&name==='purchase'&&plan) value=LIFETIME_VALUE[plan]||0;
    if(!value&&name==='subscribe'&&plan&&PLAN_VALUE[plan]) value=PLAN_VALUE[plan][cadence==='yearly'?'yearly':'monthly'];
    var ev={name:name,plan:plan,value:value,event_id:String(detail.event_id||uuid())};
    if(name==='trial_started'&&plan&&PLAN_VALUE[plan]) ev.predicted_ltv=PLAN_VALUE[plan][cadence==='yearly'?'yearly':'monthly'];
    platforms.forEach(function(p){ safe(function(){ p.send(ev); }); });
  }

  /* Observe the site's GA4 events without changing what GA4 receives. */
  var gtagOriginal=function(){ (window.dataLayer=window.dataLayer||[]).push(arguments); };
  function fromGtag(args){
    if(!args||args[0]!=='event') return;
    var mapped=GA_EVENTS[args[1]];if(!mapped) return;
    var params=args[2]||{};
    conversion(mapped,{plan:params.plan,cadence:params.cadence||params.billing_period,value:params.value,event_id:params.event_id||params.transaction_id});
  }
  function wrapGtag(){
    if(typeof window.gtag==='function') gtagOriginal=window.gtag;
    if(window.gtag&&window.gtag.__watchdogAds) return;
    var wrapped=function(){ var args=arguments; var out=gtagOriginal.apply(this,args); safe(function(){ fromGtag(args); }); return out; };
    wrapped.__watchdogAds=true;
    window.gtag=wrapped;
  }
  function replayDataLayer(){
    (window.dataLayer||[]).slice(0,500).forEach(function(entry){
      if(entry&&typeof entry==='object'&&entry.length>=2&&entry[0]==='event') fromGtag(entry);
    });
  }

  function path(){ return String(location.pathname||'/').toLowerCase().replace(/\/index\.html$/,'').replace(/\/+$/,'')||'/'; }
  function urlMoments(){
    var p=path().replace(/^\/property(?=\/)/,'');
    var q=new URLSearchParams(location.search||'');
    var session=q.get('session_id')||'';
    if(LANDING_PATHS.indexOf(p)>=0&&onceKey('landing_'+p)) conversion('view_landing',{});
    if(p==='/account'&&q.get('checkout')==='success'&&session) conversion(q.get('trial')==='1'?'trial_started':'subscribe',{event_id:session,plan:q.get('plan'),cadence:q.get('cadence')});
    if(p==='/agents/trial/thanks'&&session) conversion('trial_started',{event_id:session,plan:'agent',cadence:'monthly'});
  }
  function planClicks(){
    document.addEventListener('click',function(e){
      var el=e.target&&e.target.closest&&e.target.closest('[data-billing-plan]');if(!el) return;
      conversion('checkout_started',{plan:el.getAttribute('data-billing-plan'),cadence:el.getAttribute('data-billing-cadence')});
    },true);
  }
  function signUps(){
    var rt=window.NJPTRSupabaseRuntime;
    if(!rt||typeof rt.createClient!=='function') return;
    var client;try{client=rt.createClient();}catch(_){return;}
    if(!client||!client.auth) return;
    function check(session){
      var user=session&&session.user;if(!user||!user.created_at) return;
      var created=Date.parse(user.created_at);
      if(!Number.isFinite(created)||Date.now()-created>2*60*60*1000) return;
      var key='wd_ad_signup_'+String(user.id||'').slice(0,36);
      try{ if(localStorage.getItem(key)) return; localStorage.setItem(key,'1'); }catch(_){}
      conversion('sign_up',{event_id:'signup-'+String(user.id||uuid())});
    }
    safe(function(){ client.auth.getSession().then(function(r){ check(r&&r.data&&r.data.session); }).catch(function(){}); });
    safe(function(){ client.auth.onAuthStateChange(function(event,session){ if(event==='SIGNED_IN') check(session); }); });
  }

  platforms.forEach(function(p){ safe(p.load); });
  wrapGtag();
  replayDataLayer();
  function ready(){ urlMoments(); planClicks(); signUps(); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',ready,{once:true}); else ready();

  window.WatchdogAdPixels=Object.freeze({
    platforms:function(){ return platforms.map(function(p){ return p.name; }); },
    track:function(name,detail){ if(['view_landing','lead','sign_up','checkout_started','trial_started','subscribe','purchase'].indexOf(name)>=0) conversion(name,detail); },
    enable:function(){ enabled=true; },
    disable:function(){ enabled=false; platforms.forEach(function(p){ if(p.stop) safe(p.stop); }); }
  });
})();
