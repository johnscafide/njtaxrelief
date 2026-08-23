(function(){'use strict';var U='https://uvkvaxljhhngydvlrzom.supabase.co',K='sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa',R='0.49.0',seen=new Map(),MAX_SEEN=250,TTL=300000;function client(){return window.NJPTRAccess?window.NJPTRAccess.client():(window.supabase&&window.supabase.createClient(U,K,{auth:{persistSession:true,storageKey:'sb-uvkvaxljhhngydvlrzom-auth-token'}}));}function cleanSource(v){try{return String(v||'').split('/').pop().split('?')[0].slice(0,80);}catch(_){return'';}}function prune(){var now=Date.now();seen.forEach(function(t,k){if(now-t>TTL)seen.delete(k)});while(seen.size>MAX_SEEN)seen.delete(seen.keys().next().value)}function send(type,data){prune();data=data||{};var key=type+'|'+(data.message||'')+'|'+(data.source||'');if(seen.has(key))return;seen.set(key,Date.now());var c=client();if(!c)return;c.auth.getSession().then(function(r){var s=r.data&&r.data.session;if(!s)return;return fetch(U+'/functions/v1/report-platform-event',{method:'POST',headers:{Authorization:'Bearer '+s.access_token,apikey:K,'Content-Type':'application/json'},body:JSON.stringify(Object.assign({type:type,route:location.pathname,release:R,viewport:innerWidth<760?'mobile':'desktop'},data))});}).catch(function(){});}window.WatchdogObservability={report:send};document.addEventListener('watchdog:client-error',function(e){var d=e.detail||{};send('client_error',{message:String(d.message||'Client error').slice(0,240),source:cleanSource(d.scope),code:String(d.code||'').slice(0,80),reference:String(d.reference||'').slice(0,40)});});window.addEventListener('error',function(e){if(e.target&&e.target!==window){send('resource_error',{message:'Resource failed to load',source:cleanSource(e.target.src||e.target.href)});return;}send('client_error',{message:String(e.message||'Client error').slice(0,240),source:cleanSource(e.filename),line:e.lineno,column:e.colno});},true);window.addEventListener('unhandledrejection',function(e){var reason=e.reason;send('unhandled_rejection',{message:String(reason&&reason.message||reason||'Unhandled promise rejection').slice(0,240)});});window.addEventListener('load',function(){setTimeout(function(){var n=performance.getEntriesByType&&performance.getEntriesByType('navigation')[0];if(n&&n.duration>8000)send('slow_page',{message:'Page load exceeded 8 seconds',duration_ms:Math.round(n.duration)});},0);});})();

/* External browser analytics are optional. The universal privacy runtime owns
   Google Analytics + Microsoft Clarity consent and loading. Keep first-party
   product analytics and authenticated reliability telemetry independent. */
(function(){
  'use strict';
  var raw=location.pathname.replace(/\/+$/,'')||'/';
  var path=raw.indexOf('/property/')===0?raw.slice('/property'.length):raw;
  var enabled=path==='/dashboard'||path==='/account'||path==='/home';
  if(!enabled)return;
  if(window.WatchdogConsent){window.WatchdogConsent.syncAnalytics();return;}
  if(document.querySelector('script[src="/property/js/watchdog-consent.js"]'))return;
  var script=document.createElement('script');
  script.src='/property/js/watchdog-consent.js';
  script.async=false;
  script.setAttribute('data-watchdog-consent-runtime','1');
  document.head.appendChild(script);
})();

(function(){if(window.__wdProductAnalyticsLoader||window.WatchdogAnalytics||document.querySelector('script[src$="/property/js/product-analytics.js"]'))return;window.__wdProductAnalyticsLoader=true;var s=document.createElement('script');s.src='/property/js/product-analytics.js';s.async=true;s.setAttribute('data-watchdog-analytics','1');document.head.appendChild(s);})();
(function(){
  var raw=location.pathname.replace(/\/+$/,'')||'/';
  var path=raw.indexOf('/property/')===0?raw.slice('/property'.length):raw;
  var enabled=path==='/dashboard'||path==='/home'||path==='/agent-desk'||path==='/data-workbench';
  if(!enabled)return;
  function load(src,flag,attr){
    if(window[flag])return;window[flag]=true;
    var s=document.createElement('script');s.src=src;s.async=false;s.setAttribute(attr,'1');document.head.appendChild(s);
  }
  load('/property/js/watchdog-semantic-context.js','__wdSemanticContextLoader','data-watchdog-semantic-context');
  load('/property/js/watchdog-intelligence-context.js','__wdContextIntelligenceLoader','data-watchdog-context-intelligence');
  load('/property/js/watchdog-context-feedback.js','__wdContextFeedbackLoader','data-watchdog-context-feedback');
  load('/property/js/watchdog-scenario.js','__wdScenarioLoader','data-watchdog-scenario');
  load('/property/js/watchdog-semantic-alerts.js','__wdSemanticAlertsLoader','data-watchdog-semantic-alerts');
  load('/property/js/watchdog-assessment-scenario.js','__wdAssessmentScenarioLoader','data-watchdog-assessment-scenario');
  load('/property/js/watchdog-page-context.js','__wdPageContextLoader','data-watchdog-page-context');
  if(path==='/dashboard')load('/property/js/watchdog-dashboard-context-bridge.js','__wdDashboardContextBridgeLoader','data-watchdog-dashboard-context');
  if(path==='/home')load('/property/js/watchdog-home-semantic-bridge.js','__wdHomeSemanticBridgeLoader','data-watchdog-home-semantic');
  if(path==='/agent-desk')load('/property/js/watchdog-agent-context-bridge.js','__wdAgentContextBridgeLoader','data-watchdog-agent-context');
  if(path==='/data-workbench')load('/property/js/watchdog-analyst-scenario-bridge.js','__wdAnalystScenarioLoader','data-watchdog-analyst-scenario');
})();
