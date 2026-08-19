/* Loads profession onboarding, governed Intent Context, and Watchdog Analyst Intel without versioned asset URLs. */
(function(){
'use strict';
if(window.__WATCHDOG_HOME_ANALYST_INTEL_LOADER__)return;
window.__WATCHDOG_HOME_ANALYST_INTEL_LOADER__=true;
var css=['/property/css/home/watchdog-analyst-intel.css','/property/css/home/watchdog-intent-context.css','/property/css/home/watchdog-intent-analysis.css'];
css.forEach(function(href){if(!document.querySelector('link[href="'+href+'"]')){var l=document.createElement('link');l.rel='stylesheet';l.href=href;document.head.appendChild(l);}});
var close=document.querySelector('#hm-mobile-intel-overlay .mobile-intel-close');if(close)close.setAttribute('aria-label','Close Watchdog Analyst Intel');
document.querySelectorAll('[aria-label="Close Agent Intel"]').forEach(function(el){el.setAttribute('aria-label','Close Watchdog Analyst Intel');});
function load(src){return new Promise(function(resolve){if(document.querySelector('script[src="'+src+'"]')){resolve();return;}var s=document.createElement('script');s.src=src;s.defer=true;s.onload=resolve;s.onerror=resolve;document.head.appendChild(s);});}
load('/property/js/dashboard/home/profession-onboarding.js')
.then(function(){return load('/property/js/dashboard/home/watchdog-analyst-intel.js');})
.then(function(){return load('/property/js/dashboard/home/watchdog-intent-analysis-adapter.js');})
.then(function(){return load('/property/js/dashboard/home/watchdog-intent-context.js');})
.then(function(){return load('/property/js/dashboard/home/watchdog-intent-ready-bridge.js');})
.then(function(){return load('/property/js/dashboard/home/watchdog-intent-clear-bridge.js');});
})();
