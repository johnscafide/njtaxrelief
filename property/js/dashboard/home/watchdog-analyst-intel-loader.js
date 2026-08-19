/* Loads the profession-aware Watchdog Analyst Intel without versioned asset URLs. */
(function(){
'use strict';
if(window.__WATCHDOG_HOME_ANALYST_INTEL_LOADER__)return;
window.__WATCHDOG_HOME_ANALYST_INTEL_LOADER__=true;
var css='/property/css/home/watchdog-analyst-intel.css';
if(!document.querySelector('link[href="'+css+'"]')){var l=document.createElement('link');l.rel='stylesheet';l.href=css;document.head.appendChild(l);}
var close=document.querySelector('#hm-mobile-intel-overlay .mobile-intel-close');if(close)close.setAttribute('aria-label','Close Watchdog Analyst Intel');
document.querySelectorAll('[aria-label="Close Agent Intel"]').forEach(function(el){el.setAttribute('aria-label','Close Watchdog Analyst Intel');});
var src='/property/js/dashboard/home/watchdog-analyst-intel.js';
if(!document.querySelector('script[src="'+src+'"]')){var s=document.createElement('script');s.src=src;s.defer=true;document.head.appendChild(s);}
})();
