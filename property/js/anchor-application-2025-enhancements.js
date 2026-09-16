(function(){
'use strict';
function load(src,attr){return new Promise(function(resolve,reject){if(document.querySelector('script['+attr+']'))return resolve();var s=document.createElement('script');s.src=src;s.async=false;s.setAttribute(attr,'1');s.onload=resolve;s.onerror=reject;(document.body||document.documentElement).appendChild(s);});}
load('/property/js/anchor-application-2025-enhancements-core.js?v=20260916a','data-anchor-2025-enhancements-core').then(function(){return load('/property/js/anchor-application-municipal-tax.js?v=20260916a','data-anchor-municipal-tax');}).catch(function(e){console.warn('2025 application enhancement layer unavailable',e);});
})();
