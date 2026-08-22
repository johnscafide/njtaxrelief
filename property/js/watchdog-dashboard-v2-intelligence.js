(function(){
'use strict';
if(window.__wdDashboardV2Intelligence)return;window.__wdDashboardV2Intelligence=true;
var loading=false,loaded=false,observer=null;
var RUNTIME_STYLE_VERSION='20260822b';
function loadScript(src){if(document.querySelector('script[src="'+src+'"]'))return Promise.resolve();return new Promise(function(resolve,reject){var s=document.createElement('script');s.src=src;s.async=false;s.onload=resolve;s.onerror=function(){reject(new Error('Could not load '+src));};document.head.appendChild(s);});}
function loadCss(href){
  if(document.querySelector('link[data-wd-runtime-css="'+href+'"]'))return;
  var l=document.createElement('link');
  l.rel='stylesheet';
  l.dataset.wdRuntimeCss=href;
  l.href=href+(href.indexOf('?')>=0?'&':'?')+'v='+encodeURIComponent(RUNTIME_STYLE_VERSION);
  document.head.appendChild(l);
}
function ensureHost(){var existing=document.getElementById('db-panel-main');if(existing)return existing;var canvas=document.querySelector('.wd4-canvas'),grid=document.getElementById('wd4-grid');if(!canvas||!grid)return null;var host=document.createElement('section');host.id='db-panel-main';host.className='wd4-intelligence-context-host';host.setAttribute('aria-label','Watchdog Intelligence');canvas.insertBefore(host,grid);return host}
function loadRuntime(){if(loaded||loading||!ensureHost())return;loading=true;loadCss('/property/css/dashboard/watchdog-watchlist-intent.css');loadCss('/property/css/data-workbench-analyst.css');loadCss('/property/css/watchdog-intelligence-voice.css');loadCss('/property/css/watchdog-contextual-voice.css');var assets=['/property/js/watchdog-intelligence-context.js','/property/js/watchdog-semantic-context.js','/property/js/watchdog-page-context.js','/property/js/watchdog-dashboard-context-bridge.js','/property/js/watchdog-watchlist-intent.js','/property/js/watchdog-context-feedback.js','/property/js/watchdog-intelligence-density.js','/property/js/access-guard.js','/property/js/watchdog-contextual-analyst.js','/property/js/watchdog-intelligence-voice.js','/property/js/watchdog-intelligence-voice-browser.js','/property/js/watchdog-dashboard-voice.js'];assets.reduce(function(p,src){return p.then(function(){return loadScript(src)})},Promise.resolve()).then(function(){loaded=true;loading=false;window.dispatchEvent(new CustomEvent('watchdog:context-refresh',{detail:{surface:'dashboard',reason:'dashboard_v2_ready'}}))}).catch(function(error){loading=false;console.warn('Watchdog Dashboard Intelligence runtime unavailable:',error&&error.message||error)})}
function watch(){var root=document.getElementById('wd4-root');if(!root)return;loadRuntime();if('MutationObserver'in window){observer=new MutationObserver(function(){if(!loaded)loadRuntime();else if(!document.getElementById('db-panel-main')){ensureHost();window.dispatchEvent(new CustomEvent('watchdog:context-refresh',{detail:{surface:'dashboard',reason:'dashboard_v2_rerender'}}))}});observer.observe(root,{childList:true,subtree:true})}setTimeout(loadRuntime,500);setTimeout(loadRuntime,1600)}
window.WatchdogDashboardV2Intelligence={refresh:function(){ensureHost();window.dispatchEvent(new CustomEvent('watchdog:context-refresh',{detail:{surface:'dashboard',reason:'manual'}}))},contract:'dashboard-v2-page-native-intelligence-v3-contextual-voice'};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',watch,{once:true});else watch();
})();