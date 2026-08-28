(function(){
  'use strict';
  if(window.__watchdogThirdPartyBooted)return;
  window.__watchdogThirdPartyBooted=true;

  var CONFIG_URL='/api/watchdog-third-party-config';
  var DEMO_ENDPOINT_FRAGMENT='/functions/v1/pro-demo-request';
  var config={};

  function cleanUrl(value){
    try{var u=new URL(String(value||''),location.origin);return u.origin+u.pathname;}catch(_e){return String(value||'').split(/[?#]/)[0];}
  }

  function scrubEvent(event){
    if(!event)return event;
    if(event.user)delete event.user;
    if(event.request){
      if(event.request.url)event.request.url=cleanUrl(event.request.url);
      delete event.request.data;delete event.request.cookies;delete event.request.headers;
    }
    if(event.contexts){delete event.contexts.user;delete event.contexts.profile;delete event.contexts.property;}
    if(event.extra)event.extra={watchdog_surface:'public'};
    if(Array.isArray(event.breadcrumbs))event.breadcrumbs=event.breadcrumbs.map(function(b){
      if(b&&b.data&&b.data.url)b.data.url=cleanUrl(b.data.url);
      if(b&&b.data){delete b.data.request_body;delete b.data.response_body;}
      return b;
    });
    return event;
  }

  function bootSentry(){
    if(!config.sentry_dsn)return;
    import('https://esm.sh/@sentry/browser@10.71.0').then(function(Sentry){
      Sentry.init({
        dsn:config.sentry_dsn,
        environment:config.sentry_environment||'production',
        release:config.sentry_release||undefined,
        sendDefaultPii:false,
        tracesSampleRate:0.05,
        replaysSessionSampleRate:0,
        replaysOnErrorSampleRate:0,
        beforeSend:scrubEvent,
        beforeBreadcrumb:function(breadcrumb){
          if(breadcrumb&&breadcrumb.data&&breadcrumb.data.url)breadcrumb.data.url=cleanUrl(breadcrumb.data.url);
          return breadcrumb;
        }
      });
      window.WatchdogSentry=Sentry;
    }).catch(function(error){if(console&&console.warn)console.warn('[watchdog] Sentry bootstrap unavailable',error);});
  }

  var turnstileReady=null;
  function loadTurnstile(){
    if(!config.turnstile_site_key)return Promise.resolve(false);
    if(window.turnstile)return Promise.resolve(true);
    if(turnstileReady)return turnstileReady;
    turnstileReady=new Promise(function(resolve){
      var existing=document.querySelector('script[data-watchdog-turnstile]');
      if(existing){existing.addEventListener('load',function(){resolve(!!window.turnstile);},{once:true});existing.addEventListener('error',function(){resolve(false);},{once:true});return;}
      var script=document.createElement('script');
      script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async=true;script.defer=true;script.dataset.watchdogTurnstile='1';
      script.onload=function(){resolve(!!window.turnstile);};script.onerror=function(){resolve(false);};
      (document.head||document.documentElement).appendChild(script);
    });
    return turnstileReady;
  }

  function actionFor(body){
    var action=String(body&&body.action||'').toLowerCase();
    if(action==='watchdog_contact_message')return 'contact_message';
    if(action==='watchdog_contact_voice_reserve')return 'contact_voice';
    if(action==='watchdog_contact_voice_finalize')return '';
    return 'pro_demo';
  }

  function challenge(action){
    if(!action||!config.turnstile_site_key)return Promise.resolve('');
    return loadTurnstile().then(function(ok){
      if(!ok)throw new Error('Security verification could not load.');
      return new Promise(function(resolve,reject){
        var host=document.createElement('div');
        host.setAttribute('aria-hidden','true');
        host.style.cssText='position:fixed;left:-9999px;bottom:0;width:320px;min-height:70px;z-index:2147483647';
        document.body.appendChild(host);
        var done=false,widgetId;
        function finish(error,token){
          if(done)return;done=true;
          try{if(widgetId!==undefined&&window.turnstile)window.turnstile.remove(widgetId);}catch(_e){}
          host.remove();
          error?reject(error):resolve(token||'');
        }
        widgetId=window.turnstile.render(host,{
          sitekey:config.turnstile_site_key,
          action:action,
          execution:'execute',
          appearance:'interaction-only',
          callback:function(token){finish(null,token);},
          'error-callback':function(){finish(new Error('Security verification failed.'));},
          'timeout-callback':function(){finish(new Error('Security verification timed out.'));},
          'expired-callback':function(){finish(new Error('Security verification expired.'));}
        });
        window.turnstile.execute(host);
      });
    });
  }

  function installTurnstileFetch(){
    if(!config.turnstile_site_key||window.__watchdogTurnstileFetch)return;
    window.__watchdogTurnstileFetch=true;
    var original=window.fetch.bind(window);
    window.fetch=function(input,init){
      var url=typeof input==='string'?input:(input&&input.url)||'';
      if(url.indexOf(DEMO_ENDPOINT_FRAGMENT)<0||!init||String(init.method||'GET').toUpperCase()!=='POST')return original(input,init);
      var body;try{body=JSON.parse(String(init.body||'{}'));}catch(_e){return original(input,init);}
      var action=actionFor(body);if(!action)return original(input,init);
      return challenge(action).then(function(token){
        var next=Object.assign({},init,{body:JSON.stringify(Object.assign({},body,{turnstile_token:token,turnstile_action:action}))});
        return original(input,next);
      });
    };
  }

  fetch(CONFIG_URL,{credentials:'same-origin',headers:{'Accept':'application/json'}})
    .then(function(r){if(!r.ok)throw new Error('config '+r.status);return r.json();})
    .then(function(value){config=value||{};bootSentry();installTurnstileFetch();})
    .catch(function(error){if(console&&console.warn)console.warn('[watchdog] Optional third-party integrations inactive',error);});
})();
