/* Watchdog farming showcase placement for the public property index.
   The town directory and Professional Library are created asynchronously by
   landing-showcase.js, so wait for that directory and insert the farming block
   at the exact boundary between them. */
(function(){
  'use strict';

  var path=(window.location.pathname||'').replace(/\/+$/,'');
  var host=String(window.location.hostname||'').toLowerCase();
  var root=(host==='watchdogindex.com'||host==='www.watchdogindex.com')&&path==='';
  if(path!=='/property'&&path!=='/property/index.html'&&!root)return;

  function place(){
    if(document.getElementById('wd-farm-showcase'))return true;
    var directory=document.getElementById('wd-seo-directory');
    if(!directory)return false;
    var guide=directory.querySelector('.wd-guide-band');
    if(!guide)return false;

    var block=document.createElement('div');
    block.id='wd-farm-showcase';
    block.className='wd-farm-showcase';
    block.setAttribute('aria-labelledby','wd-farm-showcase-title');
    block.innerHTML='<div class="wd-farm-showcase-copy"><span class="wd-section-kicker">Professional farming</span><h2 id="wd-farm-showcase-title">Farm the areas that matter.</h2><p>Professional plans let you draw exact neighborhoods, layer Watchdog intelligence over the parcels, and save smarter target areas for follow-up.</p></div><div class="wd-farm-showcase-visual" role="img" aria-label="Illustrative Watchdog farming map centered on Deptford, New Jersey"></div>';
    guide.insertAdjacentElement('beforebegin',block);
    return true;
  }

  if(place())return;

  var observer=new MutationObserver(function(){
    if(place())observer.disconnect();
  });
  observer.observe(document.documentElement,{childList:true,subtree:true});
  window.setTimeout(function(){if(place())observer.disconnect();},5000);
})();
