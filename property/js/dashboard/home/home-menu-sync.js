/* Property Home intelligence bootstrap.
   Navigation is owned exclusively by /property/js/watchdog-universal-menu.js.
   This compatibility loader remains only for Home intelligence assets. */
(function(){
  'use strict';
  if(window.__WATCHDOG_HOME_MENU_SYNC__) return;
  window.__WATCHDOG_HOME_MENU_SYNC__=true;
  function loadScript(src){
    if(document.querySelector('script[src="'+src+'"]')) return Promise.resolve();
    return new Promise(function(resolve,reject){var s=document.createElement('script');s.src=src;s.async=false;s.onload=resolve;s.onerror=function(){reject(new Error('Could not load '+src));};document.head.appendChild(s);});
  }
  function loadPropertyVisual(){
    return loadScript('/property/js/dashboard/home/home-property-visual.js?v=20260827b')
      .then(function(){return loadScript('/property/js/dashboard/home/home-property-visual-guarantee.js?v=20260827b');})
      .catch(function(error){console.warn('Watchdog Home property visual unavailable:',error&&error.message||error);});
  }
  function loadLiveFix(){return loadScript('/property/js/dashboard/home/home-live-fix-20260824.js?v=20260824d').catch(function(error){console.warn('Watchdog Home live fix unavailable:',error&&error.message||error);});}
  function loadUntestableSupport(){return loadScript('/property/js/dashboard/home/untestable-support.js?v=20260828a').catch(function(error){console.warn('Watchdog Home support guidance unavailable:',error&&error.message||error);});}
  function loadIntelligenceRuntime(){var assets=['/property/js/watchdog-intelligence-context.js','/property/js/watchdog-semantic-context.js','/property/js/watchdog-page-context.js','/property/js/watchdog-home-semantic-bridge.js','/property/js/watchdog-context-feedback.js','/property/js/dashboard/home/watchdog-analyst-intel-loader.js','/property/js/watchdog-intelligence-density.js','/property/js/dashboard/home/watchdog-data-graph.js','/property/js/watchdog-today-nav.js'];return assets.reduce(function(chain,src){return chain.then(function(){return loadScript(src);});},Promise.resolve()).catch(function(error){console.warn('Watchdog Home Intelligence runtime unavailable:',error&&error.message||error);});}
  function refreshUniversalMenu(){if(window.WatchdogUniversalMenu&&typeof window.WatchdogUniversalMenu.refresh==='function')window.WatchdogUniversalMenu.refresh();}
  function boot(){loadPropertyVisual();loadLiveFix();loadUntestableSupport();refreshUniversalMenu();document.addEventListener('watchdog:universal-menu-ready',refreshUniversalMenu,{once:true});var startIntelligence=function(){loadIntelligenceRuntime();};if('requestIdleCallback'in window)requestIdleCallback(startIntelligence,{timeout:500});else setTimeout(startIntelligence,80);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();