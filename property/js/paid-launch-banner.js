/* Watchdog paid-launch banner retired after the 2026-09-11 soft launch.
   Kept as a cleanup shim because older pages may still request this asset. */
(function(){
  'use strict';
  function cleanup(){
    ['wd-paid-launch-banner','wd-paid-launch-hero'].forEach(function(id){
      var node=document.getElementById(id);if(node)node.remove();
    });
    if(document.body){
      document.body.classList.remove('wd-paid-launch-visible');
      document.body.style.removeProperty('--wd-paid-launch-height');
    }
    document.querySelectorAll('[data-wd-paid-launch-stale]').forEach(function(node){node.remove();});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',cleanup,{once:true});else cleanup();
  window.addEventListener('pageshow',cleanup,{passive:true});
})();
