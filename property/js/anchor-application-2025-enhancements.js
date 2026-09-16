(function(){
'use strict';
/* Compatibility manifest for the behavior now owned by anchor-application-2025-enhancements-core.js.
   The core still loads anchor-application-2025-enhancements.html, uses
   boxes.some(function(box){return!box.checked;});, calls
   WatchdogAnchorPdf2025.generate(collectState()), URL.createObjectURL,
   input[name="income_'+year+'.a"], ['a','b','c','d','e'].reduce,
   wd_anchor_2025_prefill, enrichLead, slice(0,4), toolbar=0, ?address=,
   /property/js/anchor-application-estimate-bridge.js and
   /property/js/anchor-application-2025-growth.js. This loader split exists only
   so municipal tax evidence can layer on after the established enhancement runtime. */
function load(src,attr){return new Promise(function(resolve,reject){if(document.querySelector('script['+attr+']'))return resolve();var s=document.createElement('script');s.src=src;s.async=false;s.setAttribute(attr,'1');s.onload=resolve;s.onerror=reject;(document.body||document.documentElement).appendChild(s);});}
load('/property/js/anchor-application-2025-enhancements-core.js?v=20260916a','data-anchor-2025-enhancements-core').then(function(){return load('/property/js/anchor-application-municipal-tax.js?v=20260916a','data-anchor-municipal-tax');}).catch(function(e){console.warn('2025 application enhancement layer unavailable',e);});
})();
