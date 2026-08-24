(function(){
  'use strict';
  if(window.__WATCHDOG_BRAND_CONSISTENCY__)return;
  window.__WATCHDOG_BRAND_CONSISTENCY__=true;

  var STYLE='/property/css/brand-consistency.css';
  var UNIVERSAL='/property/js/watchdog-universal-menu.js';
  var CITY_ADDRESS='/property/js/city-address-runtime.js?v=20260823a';
  var LANDING_RECENTS='/property/js/landing-recent-intelligence.js?v=20260824a';
  var FREE_GRID_IMAGERY='/property/js/free-imagery-grid-runtime.js';
  var PROPERTY_IMAGERY='/property/js/property-imagery-runtime.js';

  /* Property Home previously emitted Google Static Street View as an inline
     background-image. Image-element guards cannot stop CSS URL fetches, so
     neutralize that legacy path before the Home renderer inserts it. */
  function installStreetViewBackgroundGuard(){
    if(window.__WATCHDOG_STREETVIEW_BACKGROUND_GUARD__)return;
    window.__WATCHDOG_STREETVIEW_BACKGROUND_GUARD__=true;
    try{
      var desc=Object.getOwnPropertyDescriptor(Element.prototype,'innerHTML');
      if(!desc||!desc.get||!desc.set)return;
      Object.defineProperty(Element.prototype,'innerHTML',{
        configurable:desc.configurable,
        enumerable:desc.enumerable,
        get:desc.get,
        set:function(value){
          if(typeof value==='string'&&/maps\.googleapis\.com\/maps\/api\/streetview/i.test(value)){
            value=value.replace(/background-image\s*:\s*url\((['"]?)https:\/\/maps\.googleapis\.com\/maps\/api\/streetview[^)]*\)/gi,'background-image:none');
          }
          desc.set.call(this,value);
        }
      });
    }catch(_error){}
  }
  installStreetViewBackgroundGuard();

  function ensureStylesheet(href){
    if(document.querySelector('link[href="'+href+'"]'))return;
    var l=document.createElement('link');l.rel='stylesheet';l.href=href;document.head.appendChild(l);
  }
  function ensureScript(src,id){
    if(id&&document.getElementById(id))return;
    if(document.querySelector('script[src="'+src+'"]'))return;
    var s=document.createElement('script');if(id)s.id=id;s.src=src;s.defer=true;document.head.appendChild(s);
  }
  function ensureUniversal(){
    if(window.WatchdogUniversalMenu){window.WatchdogUniversalMenu.refresh();return;}
    ensureScript(UNIVERSAL,'watchdog-universal-menu-runtime');
  }
  function ensureCityAddress(){
    if(window.__WATCHDOG_CITY_ADDRESS_RUNTIME__)return;
    ensureScript(CITY_ADDRESS,'watchdog-city-address-runtime');
  }
  function ensureFreeGridImagery(){
    if(window.__WATCHDOG_FREE_IMAGERY_GRID__)return;
    ensureScript(FREE_GRID_IMAGERY,'watchdog-free-imagery-grid-runtime');
  }
  function ensurePropertyImagery(){
    if(window.__WATCHDOG_PROPERTY_IMAGERY__)return;
    ensureScript(PROPERTY_IMAGERY,'watchdog-property-imagery-runtime');
  }
  function ensureLandingRecents(){
    var path=(location.pathname||'').replace(/\/+$/,'');
    var host=String(location.hostname||'').toLowerCase();
    var root=(host==='watchdogindex.com'||host==='www.watchdogindex.com')&&path==='';
    if(path!=='/property'&&path!=='/property/index.html'&&!root)return;
    if(window.__WATCHDOG_LANDING_RECENT_INTELLIGENCE__)return;
    ensureScript(LANDING_RECENTS,'watchdog-landing-recent-intelligence');
  }
  function setText(selector,value){
    document.querySelectorAll(selector).forEach(function(n){if(n.textContent!==value)n.textContent=value;});
  }
  function syncBrand(){
    setText('.wd4-brand-copy strong','Watchdog');
    setText('.wd4-brand-copy small,.hm27-brand-copy small,.wdx-brand-copy small','PROPERTY INTELLIGENCE');
  }
  function run(){
    ensureStylesheet(STYLE);
    ensureUniversal();
    ensureCityAddress();
    ensureFreeGridImagery();
    ensurePropertyImagery();
    ensureLandingRecents();
    syncBrand();
    if(window.WatchdogUniversalMenu)window.WatchdogUniversalMenu.refresh();
  }

  var scheduled=false;
  function schedule(){
    if(scheduled)return;scheduled=true;
    requestAnimationFrame(function(){scheduled=false;run();});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});
  else run();

  if(typeof MutationObserver!=='undefined'&&document.documentElement){
    new MutationObserver(function(records){
      for(var i=0;i<records.length;i++){
        var nodes=records[i].addedNodes||[];
        for(var j=0;j<nodes.length;j++){
          var n=nodes[j];
          if(n&&n.nodeType===1&&((n.matches&&n.matches('.wd4-brand-copy,.hm27-brand-copy,.wdx-brand-copy,.wd4-nav-links,.hm27-nav-links'))||(n.querySelector&&n.querySelector('.wd4-brand-copy,.hm27-brand-copy,.wdx-brand-copy,.wd4-nav-links,.hm27-nav-links')))){schedule();return;}
        }
      }
    }).observe(document.documentElement,{childList:true,subtree:true});
  }

  window.WatchdogBrandConsistency={
    sync:run,
    items:function(){return window.WatchdogUniversalMenu?window.WatchdogUniversalMenu.items():[];}
  };
})();