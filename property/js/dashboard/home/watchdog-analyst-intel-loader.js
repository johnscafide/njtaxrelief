/* Loads profession onboarding and Watchdog Analyst Intel without versioned asset URLs. */
(function(){
'use strict';
if(window.__WATCHDOG_HOME_ANALYST_INTEL_LOADER__)return;
window.__WATCHDOG_HOME_ANALYST_INTEL_LOADER__=true;
var css='/property/css/home/watchdog-analyst-intel.css';
if(!document.querySelector('link[href="'+css+'"]')){var l=document.createElement('link');l.rel='stylesheet';l.href=css;document.head.appendChild(l);}
var close=document.querySelector('#hm-mobile-intel-overlay .mobile-intel-close');if(close)close.setAttribute('aria-label','Close Watchdog Analyst Intel');
document.querySelectorAll('[aria-label="Close Agent Intel"]').forEach(function(el){el.setAttribute('aria-label','Close Watchdog Analyst Intel');});
function load(src){return new Promise(function(resolve){if(document.querySelector('script[src="'+src+'"]')){resolve();return;}var s=document.createElement('script');s.src=src;s.defer=true;s.onload=resolve;s.onerror=resolve;document.head.appendChild(s);});}
load('/property/js/dashboard/home/profession-onboarding.js').then(function(){return load('/property/js/dashboard/home/watchdog-analyst-intel.js');});
})();
