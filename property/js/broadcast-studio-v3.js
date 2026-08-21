(function(){
'use strict';
if(window.__WATCHDOG_BROADCAST_LOADER_V5__)return;
window.__WATCHDOG_BROADCAST_LOADER_V5__=true;
function css(href,key){if(document.querySelector('link[data-'+key+']'))return;var l=document.createElement('link');l.rel='stylesheet';l.href=href;l.setAttribute('data-'+key,'1');document.head.appendChild(l);}
function script(src,key,done){if(window[key]){done&&done();return;}var existing=document.querySelector('script[data-'+key+']');if(existing){existing.addEventListener('load',function(){done&&done();},{once:true});return;}var s=document.createElement('script');s.src=src;s.defer=true;s.setAttribute('data-'+key,'1');s.onload=function(){done&&done();};document.head.appendChild(s);}
function boot(){css('/property/css/broadcast-studio-v4.css','broadcast-v4');css('/property/css/broadcast-studio-v5.css','broadcast-v5');script('/property/js/broadcast-core-v5.js','__WATCHDOG_BROADCAST_CORE_V5__',function(){script('/property/js/broadcast-productivity-v5.js','__WATCHDOG_BROADCAST_PRODUCTIVITY_V5__');});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
