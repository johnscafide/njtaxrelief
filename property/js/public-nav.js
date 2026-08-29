/* Watchdog public navigation bridge.
   The universal menu owns all menu/profile markup and auth state. This file only
   opens/closes the public sheets, stores recent-property context, and boots the
   small set of public-page enhancements that are actually needed. */
(function(){
  'use strict';

  if(!window.NJPTRSupabaseRuntime&&document.readyState==='loading'){
    document.write('<script src="/property/js/supabase-runtime.js"><\/script>');
  }
  if(!window.WatchdogUniversalMenu&&document.readyState==='loading'){
    document.write('<script src="/property/js/watchdog-universal-menu.js"><\/script>');
  }

  /* Keep third-party/resource failures from escalating into the lookup page's
     customer-facing fatal banner. This is an error-boundary contract only; it
     does not own or mutate any navigation/profile markup. */
  window.addEventListener('error',function(e){
    var resourceFailure=e&&e.target&&e.target!==window;
    var opaqueCrossOrigin=e&&e.message==='Script error.'&&(!e.filename||Number(e.lineno||0)===0);
    if(!resourceFailure&&!opaqueCrossOrigin)return;
    if(window.console&&console.warn)console.warn('[watchdog] Non-fatal external/resource error suppressed from the customer fatal banner.',e&&e.message||e&&e.target&&e.target.src||e&&e.target&&e.target.href||'resource error');
    if(e&&typeof e.stopImmediatePropagation==='function')e.stopImmediatePropagation();
  },true);

  var lastFocus=null;

  function q(id){return document.getElementById(id);}
  function clean(v){return String(v==null?'':v).trim();}
  function isPropertyIndex(){
    var path=(location.pathname||'').replace(/\/+$/,'');
    var host=String(location.hostname||'').toLowerCase();
    var root=(host==='watchdogindex.com'||host==='www.watchdogindex.com')&&path==='';
    return path==='/property'||path==='/property/index.html'||root;
  }

  /* /scripts.js may still be present on legacy mirrors. Suppress the historical
     NJPropertyTaxRelief rebate UI there; the canonical Watchdog root removes the
     legacy script entirely in the server-side asset diet. */
  function suppressLegacyIndexUi(){
    if(!isPropertyIndex())return;
    document.documentElement.classList.add('wd-index-lean-runtime');
    try{sessionStorage.setItem('rebateModalSeen','true');}catch(_error){}
    ['rebate-modal','sticky-rebate-link'].forEach(function(id){var node=q(id);if(node)node.remove();});
  }
  suppressLegacyIndexUi();

  function ensureUniversalMenu(){
    if(window.WatchdogUniversalMenu||document.querySelector('script[src="/property/js/watchdog-universal-menu.js"]'))return;
    var s=document.createElement('script');
    s.src='/property/js/watchdog-universal-menu.js';
    s.defer=true;
    (document.head||document.documentElement).appendChild(s);
  }

  function ensureStylesheet(id,href){
    if(q(id)||document.querySelector('link[href="'+href+'"]'))return;
    var l=document.createElement('link');l.id=id;l.rel='stylesheet';l.href=href;document.head.appendChild(l);
  }

  function ensureMenuInteractionContract(){
    if(q('wd-public-menu-interaction-contract'))return;
    var s=document.createElement('style');
    s.id='wd-public-menu-interaction-contract';
    s.textContent='#wd-public-backdrop{z-index:9400!important}#wd-main-sheet,#wd-profile-sheet{z-index:9500!important;pointer-events:none!important}#wd-main-sheet.open,#wd-profile-sheet.open{pointer-events:auto!important;-webkit-overflow-scrolling:touch!important;overscroll-behavior:contain!important}#wd-profile-sheet.open{z-index:2147483646!important;pointer-events:auto!important;isolation:isolate!important}body.wd-profile-menu-open #wd-public-backdrop{z-index:2147483645!important;pointer-events:auto!important}#wd-main-sheet.open a,#wd-main-sheet.open button,#wd-profile-sheet.open #wd-profile-content,#wd-profile-sheet.open .wd-universal-profile,#wd-profile-sheet.open .wd-universal-profile>nav,#wd-profile-sheet.open a,#wd-profile-sheet.open button,#wd-profile-sheet.open *{pointer-events:auto!important;touch-action:manipulation!important}body.wd-profile-menu-open #rebate-modal,body.wd-profile-menu-open #sticky-rebate-link,body.wd-profile-menu-open .plm-backdrop:not(.open){pointer-events:none!important}';
    (document.head||document.documentElement).appendChild(s);
  }

  /* The index CSS is intentionally long-lived in browser cache. Keep the
     score-corner placement in this revalidated bridge so a normal reload picks
     up this small layout correction even when an older CSS response is cached. */
  function ensureIndexScorePlacementContract(){
    if(!isPropertyIndex()||q('wd-index-score-placement-contract'))return;
    var s=document.createElement('style');
    s.id='wd-index-score-placement-contract';
    s.textContent='html.wd-index-lean-runtime #wd-consumer-recents .wd-property-photo.wd-score-visual .wd-recent-score{top:18px!important;right:18px!important}@media(max-width:640px){html.wd-index-lean-runtime #wd-consumer-recents .wd-property-photo.wd-score-visual .wd-recent-score{top:14px!important;right:13px!important}}';
    (document.head||document.documentElement).appendChild(s);
  }

  function bindMenuInteractionContract(){
    ['wd-main-sheet','wd-profile-sheet'].forEach(function(id){
      var sheet=q(id);if(!sheet||sheet.dataset.wdTapGuard==='1')return;
      sheet.dataset.wdTapGuard='1';
      sheet.addEventListener('click',function(e){
        var closer=e.target&&e.target.closest&&e.target.closest('.wd-public-close,[data-wd-universal="close"]');
        if(closer){e.preventDefault();close();return;}
        /* Never hide/translate the sheet during an anchor's activation event.
           Chromium tolerates that pattern, but WebKit/iOS can cancel or lose the
           navigation when the tapped target disappears before activation ends. */
      });
    });
    var back=q('wd-public-backdrop');
    if(back&&back.dataset.wdTapGuard!=='1'){
      back.dataset.wdTapGuard='1';
      back.addEventListener('click',close);
    }
  }

  function open(which){
    var profile=which==='profile';
    var sheet=q(profile?'wd-profile-sheet':'wd-main-sheet');
    var back=q('wd-public-backdrop');
    if(!sheet||!back)return;
    close(false);
    lastFocus=document.activeElement;
    if(window.WatchdogUniversalMenu&&typeof window.WatchdogUniversalMenu.refresh==='function')window.WatchdogUniversalMenu.refresh();
    sheet.classList.add('open');
    sheet.setAttribute('aria-hidden','false');
    back.classList.add('open');
    document.body.classList.add('wd-public-menu-open');
    document.body.classList.toggle('wd-profile-menu-open',profile);
    var c=sheet.querySelector('.wd-public-close,[data-wd-universal="close"]');
    if(c&&c.focus)requestAnimationFrame(function(){c.focus();});
    document.dispatchEvent(new CustomEvent('watchdog:public-menu-open',{detail:{menu:profile?'profile':'main'}}));
  }

  function close(restoreFocus){
    ['wd-main-sheet','wd-profile-sheet'].forEach(function(id){
      var e=q(id);if(!e)return;e.classList.remove('open');e.setAttribute('aria-hidden','true');
    });
    var b=q('wd-public-backdrop');if(b)b.classList.remove('open');
    if(document.body){document.body.classList.remove('wd-public-menu-open','wd-profile-menu-open');}
    if(restoreFocus!==false&&lastFocus&&lastFocus.focus)lastFocus.focus();
    lastFocus=null;
  }

  function setUser(user){
    if(window.WatchdogUniversalMenu&&typeof window.WatchdogUniversalMenu.setUser==='function'){
      window.WatchdogUniversalMenu.setUser(user||null);
      if(typeof window.WatchdogUniversalMenu.refresh==='function')window.WatchdogUniversalMenu.refresh();
    }
  }

  function remember(row){
    if(!row||!clean(row.address))return;
    var next={
      address:clean(row.address),town:clean(row.town),city:clean(row.city),zip:clean(row.zip),
      pin:clean(row.pin||row.pams_pin),assessed:row.assessed||'',tax:row.tax||row.last_year_tax||'',
      yearBuilt:row.yearBuilt||row.year_built||'',lat:row.lat,lon:row.lon,at:new Date().toISOString()
    };
    try{
      var rows=JSON.parse(localStorage.getItem('watchdogRecentProperties')||'[]');
      if(!Array.isArray(rows))rows=[];
      rows=rows.filter(function(x){return clean(x&&x.pin)!==next.pin&&clean(x&&x.address).toUpperCase()!==next.address.toUpperCase();});
      rows.unshift(next);
      localStorage.setItem('watchdogRecentProperties',JSON.stringify(rows.slice(0,8)));
    }catch(_error){}
    document.dispatchEvent(new CustomEvent('watchdog:recent-property',{detail:next}));
  }

  function signIn(){
    close();
    var control=document.querySelector('[data-wd-universal="signin"]');
    if(control){control.click();return;}
    if(typeof window.plSignInPrompt==='function')window.plSignInPrompt();
  }

  function signOut(){
    close();
    var control=document.querySelector('[data-wd-universal="signout"]');
    if(control){control.click();return;}
    if(typeof window.plSignOut==='function')window.plSignOut();
  }

  function loadScript(id,src){
    if(q(id)||document.querySelector('script[src="'+src+'"]'))return;
    var s=document.createElement('script');s.id=id;s.src=src;s.defer=true;document.head.appendChild(s);
  }

  /* Keep the index surface lean: each runtime here owns one visible concern. */
  function loadIndexEnhancements(){
    if(!isPropertyIndex())return;
    ensureStylesheet('wd-index-runtime-polish','/property/css/index-runtime-polish.css');
    ensureIndexScorePlacementContract();
    loadScript('wd-showcase-script','/property/js/landing-showcase.js');
    loadScript('wd-farm-showcase-placement-script','/property/js/farm-showcase-placement.js');
    loadScript('wd-public-score-on-demand-script','/property/js/public-score-on-demand.js');
    loadScript('wd-robust-brand-script','/property/js/robust-public-brand.js');
    loadScript('wd-nj-address-autocomplete-script','/property/js/nj-address-autocomplete.js');
    loadScript('wd-landing-county-intel-script','/property/js/landing-county-intel.js');
  }

  function runAddressFromQuery(){
    if(!isPropertyIndex())return;
    var params;try{params=new URLSearchParams(window.location.search||'');}catch(_error){return;}
    var address=clean(params.get('address'));if(!address)return;
    var attempts=0;
    function handoff(){
      attempts+=1;
      var input=q('pl-addr');
      if(input&&typeof window.plLookup==='function'){
        input.value=address;window.plLookup();
        try{var u=new URL(window.location.href);u.searchParams.delete('address');window.history.replaceState({},document.title,u.pathname+u.search+u.hash);}catch(_error){}
        return;
      }
      if(attempts<80)setTimeout(handoff,100);
    }
    handoff();
  }

  /* Keep the sales request scoping optimization, but leave it separate from
     navigation state. This has no DOM or pointer-event behavior. */
  function scopeVerifiedSales(){
    if(window.__watchdogSalesFetchScoped)return;
    window.__watchdogSalesFetchScoped=true;
    var original=window.fetch.bind(window),district='';
    function rememberDistrict(response){
      try{response.clone().json().then(function(data){
        var f=data&&data.features&&data.features[0],a=f&&f.attributes||{},pin=String(a.PAMS_PIN||'');
        var d=pin.replace(/\D/g,'').slice(0,4);
        if(d.length===4){district=d;try{sessionStorage.setItem('watchdogCurrentDistrict',d);}catch(_error){}}
      }).catch(function(){});}catch(_error){}
    }
    try{district=sessionStorage.getItem('watchdogCurrentDistrict')||'';}catch(_error){}
    window.fetch=function(input,init){
      var url=typeof input==='string'?input:(input&&input.url)||'';
      if(/Parcels_Composite_NJ_WM|Framework\/Cadastral/i.test(url))return original(input,init).then(function(r){rememberDistrict(r);return r;});
      var m=url.match(/\/property\/sales-([a-z-]+)\.json(?:\?|$)/i);
      if(m&&district&&/^\d{4}$/.test(district)){
        var scoped='/api/sales-by-district?county='+encodeURIComponent(m[1].toLowerCase())+'&district='+encodeURIComponent(district);
        return original(scoped,init);
      }
      return original(input,init);
    };
  }

  function init(){
    suppressLegacyIndexUi();
    ensureUniversalMenu();
    ensureMenuInteractionContract();
    bindMenuInteractionContract();
    scopeVerifiedSales();
    loadIndexEnhancements();
    loadScript('wd-paid-launch-script','/property/js/paid-launch-banner.js');
    runAddressFromQuery();
    document.addEventListener('watchdog:universal-menu-ready',bindMenuInteractionContract);
    document.addEventListener('keydown',function(e){if(e.key==='Escape')close();});
  }

  window.WatchdogPublicNav={open:open,close:close,setUser:setUser,remember:remember,signIn:signIn,signOut:signOut};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
