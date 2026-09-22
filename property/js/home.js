/* Watchdog Property Home single application bundle. Consolidated 2026-09-22. */

/* ===== property/js/plan-context.js ===== */
(function () {
  'use strict';

  var order = { standard: 0, agent: 1, pro: 2, pro_plus: 3, teams: 4, developer: 5 };
  var state = { user: null, profile: null, actual: 'standard', effective: 'standard', developer: false };

  function normalized(value) {
    value = String(value || '').toLowerCase().replace(/\+/g, '_plus').replace(/[^a-z_]/g, '');
    return order[value] == null ? 'standard' : value;
  }
  function devFor(_user, profile) { return normalized(profile && profile.account_role) === 'developer'; }
  function actualFor(user, profile) {
    if (devFor(user, profile)) return 'developer';
    return normalized((profile && (profile.plan_tier || profile.plan)) || 'standard');
  }
  function apply() {
    document.documentElement.dataset.accountPlan = state.actual;
    document.documentElement.dataset.viewPlan = state.effective;
    if (document.body) document.body.dataset.viewPlan = state.effective;
    var legacyBar = document.getElementById('dev-view-bar');
    if (legacyBar) legacyBar.remove();
    try { localStorage.removeItem('watchdog:developer:view-as'); } catch (_error) {}
    document.querySelectorAll('[data-min-plan]').forEach(function (node) {
      var required = normalized(node.dataset.minPlan);
      var allowed = can(required);
      node.classList.toggle('plan-locked', !allowed);
      node.setAttribute('aria-disabled', allowed ? 'false' : 'true');
    });
    var preview = document.getElementById('dc-tier');
    if (preview) {
      var previewPlan = state.effective === 'developer' ? 'pro_plus' : state.effective;
      if (preview.value !== previewPlan && Array.from(preview.options || []).some(function(o){return o.value===previewPlan;})) {
        preview.value = previewPlan;
        preview.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
    document.dispatchEvent(new CustomEvent('njptr:plan-change', { detail: Object.assign({}, state) }));
  }
  function setView() {
    state.effective = state.actual;
    apply();
  }
  function init(user, profile) {
    state.user = user || null;
    state.profile = profile || {};
    state.developer = devFor(state.user, state.profile);
    state.actual = actualFor(state.user, state.profile);
    state.effective = state.actual;
    apply();
    return Object.assign({}, state);
  }
  function can(required) {
    var need = normalized(required);
    return state.effective === 'developer' || order[state.effective] >= order[need];
  }

  function autoInit() {
    if (!document.body || document.body.getAttribute('data-plan-auto') !== 'true' || !window.supabase || state.user) return;
    var client = window.NJPTRSupabaseRuntime
      ? window.NJPTRSupabaseRuntime.createClient()
      : window.supabase.createClient('https://uvkvaxljhhngydvlrzom.supabase.co', 'sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa',
        { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce', storageKey: 'sb-uvkvaxljhhngydvlrzom-auth-token' } });
    client.auth.getUser().then(function (result) {
      var user = result && result.data && result.data.user;
      if (!user) return;
      client.rpc('get_my_entitlement').then(function (entitlementResult) {
        var rows = entitlementResult && entitlementResult.data || [], ent = Array.isArray(rows) ? rows[0] : rows;
        if (ent) { init(user, { account_role: ent.account_role, plan_tier: ent.plan_tier, subscription_status: ent.subscription_status, current_period_end: ent.current_period_end }); return; }
        init(user, {});
      });
    }).catch(function () {});
  }

  window.NJPTRPlan = { init: init, setView: setView, can: can, state: function () { return Object.assign({}, state); } };
  if (document.readyState !== 'loading') { apply(); autoInit(); }
  else document.addEventListener('DOMContentLoaded', function () { apply(); autoInit(); }, { once: true });
})();


/* ===== property/js/ownership-verification.js ===== */
/* NJW-10: emergency Google Static Street View cost guard.
 * Keep passive property surfaces from creating billable Street View Static requests.
 * This runs before lookup/search/home renderers. Google imagery can be restored later
 * only behind an explicit single-property user action.
 */
(function () {
  'use strict';
  if (window.__watchdogStreetViewCostGuard) return;

  var STREET_VIEW = /^https:\/\/maps\.googleapis\.com\/maps\/api\/streetview(?:\?|$)/i;
  var PLACEHOLDER = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="760" height="460" viewBox="0 0 760 460">' +
      '<rect width="760" height="460" fill="#eef3f8"/>' +
      '<path d="M279 245l101-82 101 82v112H413v-72h-66v72h-68z" fill="#9aabc0"/>' +
      '<path d="M255 247l125-101 125 101" fill="none" stroke="#7f93aa" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<text x="380" y="397" text-anchor="middle" font-family="Arial,sans-serif" font-size="22" font-weight="700" fill="#51647b">Property image</text>' +
    '</svg>'
  );

  var state = window.__watchdogStreetViewCostGuard = {
    active: true,
    blocked: 0,
    installedAt: new Date().toISOString(),
    reason: 'NJW-10 emergency Static Street View spend control'
  };

  function isStreetView(value) {
    return STREET_VIEW.test(String(value || '').replace(/&amp;/g, '&'));
  }

  function recordBlock() {
    state.blocked += 1;
  }

  function safeImageUrl(img, value) {
    if (!isStreetView(value)) return value;
    recordBlock();
    var fallback = img && img.getAttribute ? img.getAttribute('data-fallback') : '';
    return fallback && !isStreetView(fallback) ? fallback : PLACEHOLDER;
  }

  function rewriteImageTag(tag) {
    if (!/maps\.googleapis\.com\/maps\/api\/streetview/i.test(tag)) return tag;
    var fallbackMatch = tag.match(/\bdata-fallback\s*=\s*(["'])(.*?)\1/i);
    var fallback = fallbackMatch && fallbackMatch[2] && !isStreetView(fallbackMatch[2]) ? fallbackMatch[2] : PLACEHOLDER;
    var rewritten = tag.replace(/(\bsrc\s*=\s*)(["'])(https:\/\/maps\.googleapis\.com\/maps\/api\/streetview\?[^"']*)\2/i, function (_all, prefix, quote) {
      recordBlock();
      return prefix + quote + fallback + quote;
    });
    return rewritten;
  }

  try {
    var srcDescriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
    if (srcDescriptor && srcDescriptor.get && srcDescriptor.set) {
      Object.defineProperty(HTMLImageElement.prototype, 'src', {
        configurable: srcDescriptor.configurable,
        enumerable: srcDescriptor.enumerable,
        get: srcDescriptor.get,
        set: function (value) { srcDescriptor.set.call(this, safeImageUrl(this, value)); }
      });
    }
  } catch (_srcGuardError) {}

  try {
    var originalSetAttribute = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function (name, value) {
      if (this instanceof HTMLImageElement && String(name).toLowerCase() === 'src') {
        value = safeImageUrl(this, value);
      }
      return originalSetAttribute.call(this, name, value);
    };
  } catch (_attributeGuardError) {}

  try {
    var htmlDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
    if (htmlDescriptor && htmlDescriptor.get && htmlDescriptor.set) {
      Object.defineProperty(Element.prototype, 'innerHTML', {
        configurable: htmlDescriptor.configurable,
        enumerable: htmlDescriptor.enumerable,
        get: htmlDescriptor.get,
        set: function (value) {
          if (typeof value === 'string' && /maps\.googleapis\.com\/maps\/api\/streetview/i.test(value)) {
            value = value.replace(/<img\b[^>]*>/gi, rewriteImageTag);
          }
          htmlDescriptor.set.call(this, value);
        }
      });
    }
  } catch (_htmlGuardError) {}

  function scrub(root) {
    if (!root || !root.querySelectorAll) return;
    var images = root.querySelectorAll('img[src*="maps.googleapis.com/maps/api/streetview"]');
    Array.prototype.forEach.call(images, function (img) {
      var current = img.getAttribute('src') || '';
      if (isStreetView(current)) img.setAttribute('src', safeImageUrl(img, current));
    });
  }

  try {
    var observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
        Array.prototype.forEach.call(mutation.addedNodes || [], function (node) {
          if (!node || node.nodeType !== 1) return;
          if (node instanceof HTMLImageElement) {
            var current = node.getAttribute('src') || '';
            if (isStreetView(current)) node.setAttribute('src', safeImageUrl(node, current));
          }
          scrub(node);
        });
      });
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    scrub(document);
  } catch (_observerGuardError) {}
})();

(function () {
  'use strict';

  function text(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function open(options) {
    options = options || {};
    var client = options.client;
    if (!client || !options.pin || typeof options.modal !== 'function') {
      if (typeof options.toast === 'function') options.toast('Verification is temporarily unavailable');
      return;
    }
    var address = options.address || 'this property';
    var town = options.town || '';
    var zip = options.zip || '';
    options.modal('Verify you own this home',
      '<p>Owner names are not available reliably enough in the public property data to verify this automatically.</p>' +
      '<p><b>Request a six character postcard code for ' + text(address) + '.</b> The request goes to our mailing desk, and the postcard is mailed manually to the property address.</p>' +
      '<div class="pl-form" style="grid-template-columns:1fr;"><button id="njptr-verify-request" type="button">Request postcard code</button></div>' +
      '<div class="auth-or"><span>already have a code</span></div>' +
      '<div class="pl-form" style="grid-template-columns:1fr;"><input id="njptr-verify-code" type="text" placeholder="Six character code" maxlength="8" autocomplete="one-time-code" style="text-transform:uppercase;letter-spacing:.15em;"><button id="njptr-verify-redeem" type="button">Verify ownership</button></div>' +
      '<button id="njptr-verify-later" class="plm-rbtn" type="button" style="margin-top:12px;">Not now</button>' +
      '<div class="auth-fine">Choosing Not now keeps the property saved as your home, but it remains marked unverified until you enter the postcard code.</div>', true);

    var requestButton = document.getElementById('njptr-verify-request');
    var redeemButton = document.getElementById('njptr-verify-redeem');
    var laterButton = document.getElementById('njptr-verify-later');
    var codeInput = document.getElementById('njptr-verify-code');
    if (laterButton) laterButton.addEventListener('click', function () { if (typeof options.close === 'function') options.close(); });
    if (requestButton) requestButton.addEventListener('click', function () {
      requestButton.disabled = true; requestButton.textContent = 'Creating secure code...';
      client.functions.invoke('request-verify-code', { body: { pams_pin: options.pin, address_line1: address, city: town, postal_code: zip } }).then(function (result) {
        var data = (result && result.data) || {};
        if (result.error || !data.ok) {
          var reason = data.reason || (result.error && result.error.message) || 'Could not request a code';
          requestButton.disabled = false; requestButton.textContent = 'Request postcard code';
          console.error('Verification request failed:', data.stage || 'request', result.error || data);
          if (typeof options.toast === 'function') options.toast(reason); return;
        }
        options.modal('Postcard request received','<p>Your secure code was sent to our mailing desk. We will mail it to <b>' + text(address) + '</b>.</p><p>Allow a few days for it to arrive, then return to this property and choose Verify ownership to enter the code.</p><button id="njptr-verify-done" class="plm-rbtn" type="button">Got it</button>',true);
        var done = document.getElementById('njptr-verify-done'); if (done) done.addEventListener('click', function () { if (typeof options.close === 'function') options.close(); });
      }).catch(function (error) {
        console.error('Verification service unavailable:', error); requestButton.disabled = false; requestButton.textContent = 'Request postcard code';
        if (typeof options.toast === 'function') options.toast('Verification service is temporarily unavailable');
      });
    });
    function redeem() {
      var code = codeInput ? codeInput.value.trim().toUpperCase() : '';
      if (!code) { if (typeof options.toast === 'function') options.toast('Enter the code'); return; }
      if (redeemButton) { redeemButton.disabled = true; redeemButton.textContent = 'Checking...'; }
      client.rpc('redeem_verify_code', { p_pin: options.pin, p_code: code }).then(function (result) {
        var data = result.data || {};
        if (result.error || !data.ok) {
          if (redeemButton) { redeemButton.disabled = false; redeemButton.textContent = 'Verify ownership'; }
          if (typeof options.toast === 'function') options.toast(data.reason === 'wrong code' ? 'That code did not match' : (data.reason || 'Could not verify')); return;
        }
        options.modal('Verified','<p>This home is now marked as verified. Thanks for confirming.</p><button id="njptr-verify-close" class="plm-rbtn" type="button">Close</button>',true);
        var closeButton = document.getElementById('njptr-verify-close'); if (closeButton) closeButton.addEventListener('click', function () { if (typeof options.close === 'function') options.close(); });
        if (typeof options.onVerified === 'function') options.onVerified();
      }).catch(function (error) {
        console.error('Verification code check failed:', error); if (redeemButton) { redeemButton.disabled = false; redeemButton.textContent = 'Verify ownership'; }
        if (typeof options.toast === 'function') options.toast('Could not verify right now');
      });
    }
    if (redeemButton) redeemButton.addEventListener('click', redeem);
    if (codeInput) codeInput.addEventListener('keydown', function (event) { if (event.key === 'Enter') redeem(); });
  }
  window.NJPTRVerification = { open: open };
})();

(function () {
  'use strict';
  if (window.L && L.Map && !window.__njw96MapHookInstalled) {
    window.__njw96MapHookInstalled = true;
    L.Map.addInitHook(function () {
      var container = this.getContainer && this.getContainer();
      if (container && container.id === 'hd-map') {
        window.__njw96HoodMap = this;
        window.dispatchEvent(new CustomEvent('njw96:hood-map', { detail: { map: this } }));
      }
    });
  }
  function loadScript(id, src, next) {
    if (document.getElementById(id)) { if (next) next(); return; }
    var s = document.createElement('script'); s.id = id; s.src = src; s.onload = function () { if (next) next(); }; document.body.appendChild(s);
  }
  function loadCss(id, href) {
    if (document.getElementById(id)) return;
    var l=document.createElement('link');l.id=id;l.rel='stylesheet';l.href=href;document.head.appendChild(l);
  }
  function loadRuntime() {
    loadCss('njw96-search-v3-css','/property/css/lookup/09-search-corrections-v3.css');
    loadCss('watchdog-search-uniformity-css','/property/css/search-uniformity.css');
    loadScript('njw96-search-runtime', '/property/js/search-refresh-runtime.js', function () {
      loadScript('njw96-search-finalize', '/property/js/search-refresh-finalize.js', function () {
        loadScript('njw96-search-polish', '/property/js/search-polish-runtime.js', function () {
          loadScript('njw96-search-corrections', '/property/js/search-corrections.js', function () {
            loadScript('njw96-search-corrections-v2', '/property/js/search-corrections-v2.js', function () {
              loadScript('njw96-search-corrections-v3', '/property/js/search-corrections-v3.js', function () {
                loadScript('watchdog-search-uniformity', '/property/js/search-uniformity-runtime.js');
              });
            });
          });
        });
      });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadRuntime, { once: true }); else loadRuntime();
})();

/* NJW-212 / NJW-239: public landing enhancements boot from this already-loaded stable runtime. */
(function () {
  'use strict';
  var path = (window.location.pathname || '').replace(/\/+$/, '');
  var host = String(window.location.hostname || '').toLowerCase();
  var cleanWatchdogRoot = (host === 'www.watchdogindex.com' || host === 'watchdogindex.com') && path === '';
  if (path !== '/property' && path !== '/property/index.html' && !cleanWatchdogRoot) return;

  function bootIntelligence() {
    if (!document.getElementById('wd-landing-intelligence-css')) {
      var css = document.createElement('link');
      css.id = 'wd-landing-intelligence-css';
      css.rel = 'stylesheet';
      css.href = '/property/css/landing-intelligence.css';
      document.head.appendChild(css);
    }
    if (document.getElementById('wd-landing-intelligence-loader')) return;
    var intelligence = document.createElement('script');
    intelligence.id = 'wd-landing-intelligence-loader';
    intelligence.src = '/property/js/landing-intelligence.js';
    intelligence.async = false;
    document.body.appendChild(intelligence);
  }

  function bootLanding() {
    var existing = document.getElementById('wd-landing-showcase-loader');
    if (existing) {
      if (existing.dataset.loaded === '1') bootIntelligence();
      else existing.addEventListener('load', bootIntelligence, { once:true });
      return;
    }
    var script = document.createElement('script');
    script.id = 'wd-landing-showcase-loader';
    script.src = '/property/js/landing-showcase.js';
    script.async = false;
    script.onload = function () { script.dataset.loaded = '1'; bootIntelligence(); };
    document.body.appendChild(script);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootLanding, { once: true });
  } else {
    bootLanding();
  }
})();


/* ===== property/js/pwa.js ===== */
(function(){
'use strict';
var deferredPrompt;
function isiOS(){return /iphone|ipad|ipod/i.test(navigator.userAgent);}
function standalone(){return window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;}
function note(text){var n=document.createElement('div');n.className='wd-install-note';n.innerHTML='<span><i class="fas fa-mobile-screen-button"></i><b>Add Watchdog to your Home Screen</b><small>'+text+'</small></span><button type="button" aria-label="Close">×</button>';n.querySelector('button').onclick=function(){n.remove();};document.body.appendChild(n);return n;}
function show(){if(!isiOS()||standalone()||sessionStorage.getItem('wdInstallDismissed'))return;var n=note('In Safari, tap Share, then “Add to Home Screen.”');n.querySelector('button').onclick=function(){sessionStorage.setItem('wdInstallDismissed','1');n.remove();};}
function loadWhyWatchdog(){var page=String(document.body&&document.body.getAttribute('data-sidebar-page')||'');if(page!=='dashboard'&&page!=='agent-desk')return;if(window.WatchdogWhy||document.getElementById('watchdog-why-script'))return;var s=document.createElement('script');s.id='watchdog-why-script';s.src='/property/js/watchdog-why.js';s.defer=true;document.head.appendChild(s);}
function loadScript(src,key){if(document.querySelector('script['+key+']'))return;var s=document.createElement('script');s.src=src;s.defer=true;s.setAttribute(key,'true');document.body.appendChild(s);}
function loadPropertyHomeFirstImpression(){var page=String(document.body&&document.body.getAttribute('data-sidebar-page')||'');if(page!=='home')return;/* Prevent the legacy Google Street View hero before the premium loader can request it. */window.__WATCHDOG_HOME_HERO_INTELLIGENCE__=true;loadScript('/property/js/dashboard/home/home-property-first-impression.js?v=20260827d','data-watchdog-home-first-impression');loadScript('/property/js/dashboard/home/home-property-first-impression-compact.js?v=20260827e','data-watchdog-home-first-impression-compact');}
function loadPageEnhancements(){var page=String(document.body&&document.body.getAttribute('data-sidebar-page')||'');if(page!=='integrations')return;loadScript('/property/js/integrations-command-center.js','data-watchdog-integrations-command-center');loadScript('/property/js/integrations-recipes.js','data-watchdog-integration-recipes');loadScript('/property/js/integrations-policy-feedback.js','data-watchdog-integration-policy-feedback');loadScript('/property/js/integrations-policy-comparison.js','data-watchdog-integration-policy-comparison');}
window.addEventListener('beforeinstallprompt',function(event){event.preventDefault();deferredPrompt=event;});
loadPropertyHomeFirstImpression();
loadPageEnhancements();
window.addEventListener('load',function(){if('serviceWorker' in navigator)navigator.serviceWorker.register('/property/sw.js',{scope:'/property/'}).catch(function(){});if(isiOS())window.setTimeout(show,1300);loadPropertyHomeFirstImpression();loadWhyWatchdog();loadPageEnhancements();});
})();


/* ===== property/js/brand-consistency-runtime.js ===== */
(function(){
  'use strict';
  if(window.__WATCHDOG_BRAND_CONSISTENCY__)return;
  window.__WATCHDOG_BRAND_CONSISTENCY__=true;

  var STYLE='/property/css/brand-consistency.css';
  var UNIVERSAL='/property/js/watchdog-universal-menu.js';
  var ANCHOR_APPS_MENU='/property/js/anchor-applications-menu-runtime.js?v=20260912a';
  var CITY_ADDRESS='/property/js/city-address-runtime.js?v=20260823a';
  var LANDING_RECENTS='/property/js/landing-recent-intelligence.js?v=20260824a';
  var FREE_GRID_IMAGERY='/property/js/free-imagery-grid-runtime.js';
  var PROPERTY_IMAGERY='/property/js/property-imagery-runtime.js';
  var MAP_PERSISTENCE='/property/js/map-persistence-runtime.js';

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
  function ensureAnchorApplicationsMenu(){
    if(window.__WATCHDOG_ANCHOR_APPLICATIONS_MENU__)return;
    ensureScript(ANCHOR_APPS_MENU,'watchdog-anchor-applications-menu-runtime');
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
  function ensureMapPersistence(){
    if(window.__WATCHDOG_MAP_PERSISTENCE__){
      if(window.WatchdogMapPersistence&&window.WatchdogMapPersistence.refresh)window.WatchdogMapPersistence.refresh();
      return;
    }
    ensureScript(MAP_PERSISTENCE,'watchdog-map-persistence-runtime');
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
    ensureAnchorApplicationsMenu();
    ensureCityAddress();
    ensureFreeGridImagery();
    ensurePropertyImagery();
    ensureMapPersistence();
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

/* ===== property/js/tax-year-intelligence.js ===== */
/* Shared Watchdog tax-year intelligence.
   Keeps observed, published and scenario values distinct so a revaluation
   assessment is never silently multiplied by a tax rate from another year. */
(function(){
  'use strict';
  function num(v){var n=Number(v);return Number.isFinite(n)?n:null}
  function money(v){var n=num(v);return n==null?'—':n.toLocaleString('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0})}
  function year(v){var n=parseInt(v,10);return Number.isFinite(n)?n:null}
  function rateForYear(town,county,target,rates){
    if(!rates||!target)return null;var t=String(town||'').toUpperCase().trim(),tc=t+' ('+String(county||'').toUpperCase().trim()+')',hit=null;
    Object.keys(rates).some(function(k){if(k.toUpperCase().trim()===tc){hit=rates[k];return true}return false});
    if(!hit)Object.keys(rates).some(function(k){if(k.toUpperCase().trim()===t){hit=rates[k];return true}return false});
    var r=hit&&num(hit[String(target)]);return r>0?r:null;
  }
  function observedTaxYear(r){return year(r.tax_year||r.last_year_tax_year||r.annual_tax_year||r.source_tax_year)}
  function assessmentYear(r){return year(r.assessment_year||r.assessed_year||r.tax_list_year||r.source_assessment_year)}
  function mismatch(r){var ay=assessmentYear(r),ty=observedTaxYear(r);return !!(ay&&ty&&ay!==ty)}
  function project(assessment,rate){assessment=num(assessment);rate=num(rate);return assessment>0&&rate>0?assessment*(rate/100):null}
  function model(r,rates){
    r=r||{};var ay=assessmentYear(r),ty=observedTaxYear(r),assessed=num(r.assessed!=null?r.assessed:r.assessed_value),tax=num(r.last_year_tax),rate=rateForYear(r.town||r.municipality,r.county,ay,rates);
    return {assessment:assessed,assessment_year:ay,observed_tax:tax,observed_tax_year:ty,published_rate:rate,published_rate_year:rate?ay:null,revaluation_guard:mismatch(r),projected_tax:(!mismatch(r)&&rate&&ay)?project(assessed,rate):null};
  }
  function timeline(r,rates){
    var m=model(r,rates),out=[];
    if(m.observed_tax!=null)out.push({year:m.observed_tax_year,label:'Billed tax',value:money(m.observed_tax),status:'Observed',tone:'official'});
    if(m.assessment!=null)out.push({year:m.assessment_year,label:'Assessment',value:money(m.assessment),status:'Official record',tone:'official'});
    if(m.published_rate)out.push({year:m.published_rate_year,label:'General tax rate',value:m.published_rate.toFixed(3)+'%',status:'State published',tone:'published'});
    if(m.revaluation_guard)out.push({year:m.assessment_year,label:'Tax estimate',value:'Awaiting same-year rate',status:'Protected',tone:'waiting'});
    else if(m.projected_tax!=null)out.push({year:m.assessment_year,label:'Calculated tax',value:money(m.projected_tax),status:'Calculated from same-year published rate',tone:'estimate'});
    return out;
  }
  window.WatchdogTaxYears={model:model,timeline:timeline,project:project,rateForYear:rateForYear,mismatch:mismatch};
})();


/* ===== property/js/marker-intelligence.js ===== */
(function(){'use strict';var registry=null,content={},bubble=null,active=null;
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function byId(id){return registry&&registry.markers.find(function(m){return m.id===id;});}
function sourceName(m){var s=String(m&&m.source_id||'');if(s==='nj-parcels-modiv')return'NJ parcel / MOD-IV public record';if(s==='nj-sr1a')return'NJ Division of Taxation verified sales';if(s==='nj-cod')return'NJ assessment-uniformity data';if(s==='nj-dca-budget')return'NJ DCA municipal budget and levy data';if(s==='nj-tax-court-appeals')return'NJ property-tax appeal outcome data';if(s.indexOf('njdep-')===0)return'NJDEP public GIS record';return m&&m.origin==='watchdog-derived'?'Watchdog derived methodology':'authoritative public record';}
function fallback(m){var label=m.label||m.id,scope=m.scope||'property',src=sourceName(m),derived=m.origin==='watchdog-derived';return{plain:(m.description&&m.description!==label?m.description:label)+' — a '+scope+'-level field in the Watchdog catalog.',why:derived?'This turns supported upstream facts into an explainable screening signal so a professional can decide what deserves manual review.':'This adds a sourced fact to the property record so users can compare it with assessment, tax, sale, permit or risk context.',method:derived?'Calculated only from declared Watchdog dependencies/methodology; open the marker detail to see the specific formula.':'Read from '+src+' and retained with source context when available.',caution:derived?'A derived marker is a screening aid, not an appraisal, legal conclusion, credit decision or prediction of a person’s intent.':'Public records can be delayed, incomplete or updated after Watchdog reads them. Verify the authoritative source before reliance.',sources:[],related:[]};}
function rich(id){var m=byId(id);if(!m)return{};return content[id]||fallback(m);}
function ensure(){if(bubble)return bubble;bubble=document.createElement('aside');bubble.className='dm-pop';bubble.setAttribute('role','tooltip');document.body.appendChild(bubble);return bubble;}
function place(target){var b=ensure(),r=target.getBoundingClientRect(),w=Math.min(390,window.innerWidth-28),left=Math.max(14,Math.min(window.innerWidth-w-14,r.left+r.width/2-w/2)),top=r.bottom+10;if(top+b.offsetHeight>window.innerHeight-12)top=Math.max(12,r.top-b.offsetHeight-10);b.style.left=left+'px';b.style.top=top+'px';}
function show(target){if(!window.matchMedia('(hover:hover) and (pointer:fine)').matches)return;var id=target.dataset.markerId,m=byId(id);if(!m)return;var r=rich(id),value=target.dataset.markerValue||'',note=target.dataset.markerNote||'';var b=ensure();b.innerHTML='<div class="dm-pop-top"><span class="dm-pop-icon"><i class="fas fa-chart-simple"></i></span><div><h3>'+esc(m.label)+'</h3>'+(value?'<span class="dm-pop-value">'+esc(value)+'</span>':'')+'</div></div><p>'+esc(r.plain)+(note?' '+esc(note):'')+'</p><p><strong>Why it matters:</strong> '+esc(r.why)+'</p><div class="dm-pop-meta"><span>'+esc(m.scope||'property')+'</span><span>'+esc(m.origin==='public'?'Public source':'Watchdog derived')+'</span><b>Click for full detail →</b></div>';b.classList.add('on');active=target;requestAnimationFrame(function(){place(target);});}
function hide(t){if(active!==t)return;active=null;if(bubble)bubble.classList.remove('on');}
function load(){return Promise.all([fetch('/property/data/marker-registry.json').then(r=>r.json()),fetch('/property/data/marker-content.json').then(r=>r.json()).catch(()=>({markers:{}}))]).then(x=>{registry=x[0];content=x[1].markers||{};window.WatchdogMarkerContent={get:rich,registry:function(){return registry;},curated:content};});}
document.addEventListener('mouseover',e=>{var t=e.target.closest('[data-marker-id]');if(t&&active!==t)show(t)});document.addEventListener('mouseout',e=>{var t=e.target.closest('[data-marker-id]');if(t&&!t.contains(e.relatedTarget))hide(t)});document.addEventListener('focusin',e=>{var t=e.target.closest('[data-marker-id]');if(t)show(t)});document.addEventListener('focusout',e=>{var t=e.target.closest('[data-marker-id]');if(t)hide(t)});window.addEventListener('scroll',()=>{if(bubble)bubble.classList.remove('on')},{passive:true});load().catch(e=>console.warn('Marker intelligence unavailable',e));})();

/* ===== property/js/platform-observability.js ===== */
(function(){'use strict';var U='https://uvkvaxljhhngydvlrzom.supabase.co',K='sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa',R='0.49.0',seen=new Map(),MAX_SEEN=250,TTL=300000;function client(){return window.NJPTRAccess?window.NJPTRAccess.client():(window.supabase&&window.supabase.createClient(U,K,{auth:{persistSession:true,storageKey:'sb-uvkvaxljhhngydvlrzom-auth-token'}}));}function cleanSource(v){try{return String(v||'').split('/').pop().split('?')[0].slice(0,80);}catch(_){return'';}}function prune(){var now=Date.now();seen.forEach(function(t,k){if(now-t>TTL)seen.delete(k)});while(seen.size>MAX_SEEN)seen.delete(seen.keys().next().value)}function send(type,data){prune();data=data||{};var key=type+'|'+(data.message||'')+'|'+(data.source||'');if(seen.has(key))return;seen.set(key,Date.now());var c=client();if(!c)return;c.auth.getSession().then(function(r){var s=r.data&&r.data.session;if(!s)return;return fetch(U+'/functions/v1/report-platform-event',{method:'POST',headers:{Authorization:'Bearer '+s.access_token,apikey:K,'Content-Type':'application/json'},body:JSON.stringify(Object.assign({type:type,route:location.pathname,release:R,viewport:innerWidth<760?'mobile':'desktop'},data))});}).catch(function(){});}window.WatchdogObservability={report:send};document.addEventListener('watchdog:client-error',function(e){var d=e.detail||{};send('client_error',{message:String(d.message||'Client error').slice(0,240),source:cleanSource(d.scope),code:String(d.code||'').slice(0,80),reference:String(d.reference||'').slice(0,40)});});window.addEventListener('error',function(e){if(e.target&&e.target!==window){send('resource_error',{message:'Resource failed to load',source:cleanSource(e.target.src||e.target.href)});return;}send('client_error',{message:String(e.message||'Client error').slice(0,240),source:cleanSource(e.filename),line:e.lineno,column:e.colno});},true);window.addEventListener('unhandledrejection',function(e){var reason=e.reason;send('unhandled_rejection',{message:String(reason&&reason.message||reason||'Unhandled promise rejection').slice(0,240)});});window.addEventListener('load',function(){setTimeout(function(){var n=performance.getEntriesByType&&performance.getEntriesByType('navigation')[0];if(n&&n.duration>8000)send('slow_page',{message:'Page load exceeded 8 seconds',duration_ms:Math.round(n.duration)});},0);});})();

/* External browser analytics are optional. The universal privacy runtime owns
   Google Analytics + Microsoft Clarity consent and loading. Keep first-party
   product analytics and authenticated reliability telemetry independent. */
(function(){
  'use strict';
  var raw=location.pathname.replace(/\/+$/,'')||'/';
  var path=raw.indexOf('/property/')===0?raw.slice('/property'.length):raw;
  var enabled=path==='/dashboard'||path==='/account'||path==='/home';
  if(!enabled)return;
  if(window.WatchdogConsent){window.WatchdogConsent.syncAnalytics();return;}
  if(document.querySelector('script[src="/property/js/watchdog-consent.js"]'))return;
  var script=document.createElement('script');
  script.src='/property/js/watchdog-consent.js';
  script.async=false;
  script.setAttribute('data-watchdog-consent-runtime','1');
  document.head.appendChild(script);
})();

(function(){if(window.__wdProductAnalyticsLoader||window.WatchdogAnalytics||document.querySelector('script[src$="/property/js/product-analytics.js"]'))return;window.__wdProductAnalyticsLoader=true;var s=document.createElement('script');s.src='/property/js/product-analytics.js';s.async=true;s.setAttribute('data-watchdog-analytics','1');document.head.appendChild(s);})();
(function(){
  var raw=location.pathname.replace(/\/+$/,'')||'/';
  var path=raw.indexOf('/property/')===0?raw.slice('/property'.length):raw;
  var enabled=path==='/dashboard'||path==='/home'||path==='/agent-desk'||path==='/data-workbench';
  if(!enabled)return;
  function load(src,flag,attr){
    if(window[flag])return;window[flag]=true;
    var s=document.createElement('script');s.src=src;s.async=false;s.setAttribute(attr,'1');document.head.appendChild(s);
  }
  load('/property/js/watchdog-semantic-context.js','__wdSemanticContextLoader','data-watchdog-semantic-context');
  load('/property/js/watchdog-intelligence-context.js','__wdContextIntelligenceLoader','data-watchdog-context-intelligence');
  load('/property/js/watchdog-context-feedback.js','__wdContextFeedbackLoader','data-watchdog-context-feedback');
  load('/property/js/watchdog-scenario.js','__wdScenarioLoader','data-watchdog-scenario');
  load('/property/js/watchdog-semantic-alerts.js','__wdSemanticAlertsLoader','data-watchdog-semantic-alerts');
  load('/property/js/watchdog-assessment-scenario.js','__wdAssessmentScenarioLoader','data-watchdog-assessment-scenario');
  load('/property/js/watchdog-page-context.js','__wdPageContextLoader','data-watchdog-page-context');
  if(path==='/dashboard')load('/property/js/watchdog-dashboard-context-bridge.js','__wdDashboardContextBridgeLoader','data-watchdog-dashboard-context');
  if(path==='/home')load('/property/js/watchdog-home-semantic-bridge.js','__wdHomeSemanticBridgeLoader','data-watchdog-home-semantic');
  if(path==='/agent-desk')load('/property/js/watchdog-agent-context-bridge.js','__wdAgentContextBridgeLoader','data-watchdog-agent-context');
  if(path==='/data-workbench')load('/property/js/watchdog-analyst-scenario-bridge.js','__wdAnalystScenarioLoader','data-watchdog-analyst-scenario');
})();


/* ===== property/js/dashboard/home/index.js ===== */
/* ============================================================
   PROPERTY REPORT
   njpropertytaxrelief.com/property
   ============================================================ */
(function () {
  'use strict';

  var HOME_MODULE_VERSION = '20260808a';
  var homeModulePromises = Object.create(null);
  var homeModuleDependencies = {
    'revaluation-radar': ['uniformity'],
    'buyer-closing-costs': ['uniformity', 'revaluation-radar', 'town-intelligence'],
    'tax-pressure-simulator': ['town-intelligence', 'municipal-budget-pressure'],
    'appeal-packet': ['uniformity'],
    'relocation': ['uniformity'],
    'investor-screen': ['uniformity'],
    'investor-carry-volatility': ['uniformity', 'revaluation-radar', 'municipal-budget-pressure', 'tax-trajectory', 'exempt-pilot-exposure'],
    'appeal-evidence-strength': ['uniformity'],
    'appeal-opportunity': ['uniformity', 'appeal-evidence-strength'],
    'permit-lifecycle-intelligence': ['professional-due-diligence'],
    'real-estate-intelligence': ['uniformity', 'revaluation-radar', 'municipal-budget-pressure', 'tax-trajectory'],
    'broker-listing-brief': ['real-estate-intelligence'],
    'collateral-escrow-stress': ['buyer-closing-costs', 'municipal-budget-pressure'],
    'development-constraint-stack': ['professional-due-diligence'],
    'title-evidence-graph': ['professional-due-diligence'],
    'score-history': ['watchdog-score'],
    'watchdog-score': ['uniformity', 'revaluation-radar'],
    'professional-decision-signals': ['uniformity', 'revaluation-radar', 'municipal-budget-pressure', 'tax-trajectory'],
    'improvement-ratio': ['town-profile'],
    'property-class-mix': ['town-profile']
  };

  function loadHomeTool(name) {
    if (!homeModulePromises[name]) {
      homeModulePromises[name] = Promise.all((homeModuleDependencies[name] || []).map(loadHomeTool))
        .then(function () { return import('../tools/' + name + '.js'); })
        .then(function (module) {
          if (name === 'uniformity') return Promise.all([loadUniformity(), loadAppeals()]).then(function () { return module; });
          if (name === 'abatement-exposure') return loadAbatements().then(function () { return module; });
          if (name === 'exempt-pilot-exposure') return loadExemptPilot().then(function () { return module; });
          return module;
        }).catch(function (error) { delete homeModulePromises[name]; throw error; });
    }
    return homeModulePromises[name];
  }
  function loadHomeTools(names) { return Promise.all(names.map(loadHomeTool)); }
  window.NJPropertyModules = { version: HOME_MODULE_VERSION, loadTool: loadHomeTool, loadTools: loadHomeTools };

  var LEDGER_URL = 'https://uvkvaxljhhngydvlrzom.supabase.co';
  var LEDGER_KEY = 'sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa';

  var EJS_PUBLIC  = 'u262kw5AoJcBI342V';
  var EJS_SERVICE = 'service_gptqbyx';
  var EJS_TMPL    = 'template_contact';

  var sb = null, plUser = null, rows = [], profile = null;

  function el(id) { return document.getElementById(id); }
  function money(n) { return '$' + Math.round(n).toLocaleString(); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  }
  function toast(m) {
    var t = el('pl-toast'); if (!t) return;
    t.textContent = m; t.style.display = 'block';
    clearTimeout(window._t); window._t = setTimeout(function () { t.style.display = 'none'; }, 2600);
  }
  window.plModalNote = function (title, html) {
    var n = el('plm-note-overlay');
    n.innerHTML = '<div class="plm-note-box"><button class="plm-note-x" onclick="plCloseNote()"><i class="fas fa-xmark"></i></button>' +
      '<h3>' + esc(title) + '</h3>' + html + '</div>';
    n.classList.add('open');
  };
  window.plCloseNote = function () { el('plm-note-overlay').classList.remove('open'); };

  function sendLead(payload) {
    if (typeof emailjs === 'undefined') return Promise.reject(new Error('Email service unavailable'));
    emailjs.init({ publicKey: EJS_PUBLIC });
    return emailjs.send(EJS_SERVICE, EJS_TMPL, payload);
  }
  window.dbLeadGen = function (kind, address) {
    var seller = kind === 'seller';
    var topic = seller ? 'Seller strategy request' : 'Buyer strategy request';
    sendLead({ name:name(), email:plUser&&plUser.email, phone:(profile&&profile.phone)||'Not provided', topic:'⭐ WATCHDOG '+topic,
      tenure:seller?'Homeowner':'Buyer', lead_type:seller?'Seller lead':'Buyer lead', finance:'Not provided', town:(current&&current.town)||'Not provided', address:address||'Not provided',
      message:[topic+' from Watchdog.', 'Property: '+(address||'Not provided'), 'Source: /property/home'].join('\n') }).catch(function(e){ console.warn(e); });
    plModalNote(seller?'Let’s talk through the sale':'Let’s talk through the purchase','<p>'+(seller?'An agent will pair the Watchdog property story with current comparable sales and a practical listing plan.':'An agent will pair the Watchdog diligence with current listings, comps and an offer strategy.')+'</p><p><b>No obligation and no pressure.</b></p>');
  };
  window.dbAskAbout = function (address) { window.dbLeadGen(current&&current.kind==='home'?'seller':'buyer', address); };

  function getClient() {
    if (sb) return true;
    if (typeof window.supabase === 'undefined' || LEDGER_KEY.indexOf('PASTE') === 0) return false;
    sb = window.supabase.createClient(LEDGER_URL, LEDGER_KEY,
      { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce', storageKey: 'sb-uvkvaxljhhngydvlrzom-auth-token' } });
    return true;
  }
  window.watchdogScoreHistory = function (r, markerId) {
    if (!sb || !plUser || !r || !r.pams_pin) return Promise.resolve([]);
    markerId=markerId||'watchdog.score';
    return sb.from('score_observations').select('score,observed_at,observed_on').eq('user_id',plUser.id).eq('pams_pin',r.pams_pin).eq('marker_id',markerId).order('observed_at',{ascending:true}).limit(240).then(function(x){return x.data||[];});
  };
  window.watchdogAppealCaseLoad = function (r) { if(!sb||!plUser)return Promise.resolve(null);return sb.from('appeal_case_workspaces').select('*').eq('user_id',plUser.id).eq('pams_pin',r.pams_pin).maybeSingle().then(function(x){if(x.error)throw x.error;return x.data;}); };
  window.watchdogAppealCaseSave = function (r, values) { var opp=typeof appealOpportunityIndex==='function'?appealOpportunityIndex(r):null,evid=typeof appealEvidenceStrength==='function'?appealEvidenceStrength(r):null;return sb.from('appeal_case_workspaces').upsert(Object.assign({user_id:plUser.id,pams_pin:r.pams_pin,property_address:r.address||'',municipality:r.town||r.municipality||'',opportunity_score:opp&&opp.score,evidence_score:evid&&evid.score,updated_at:new Date().toISOString()},values),{onConflict:'user_id,pams_pin'}).select().single().then(function(x){if(x.error)throw x.error;return x.data;}); };

  window.plSignInPrompt = function () {
    if (!getClient()) { plModalNote('Sign in unavailable', '<p>Accounts are not switched on yet.</p>'); return; }
    plModalNote('Sign in',
      '<div class="auth-magic"><label for="auth-email">Email me a sign in link</label>' +
        '<div class="auth-magic-row"><input id="auth-email" type="email" placeholder="you@email.com" ' +
        'onkeydown="if(event.key===\'Enter\')plMagicLink()"><button onclick="plMagicLink()">Send link</button></div>' +
        '<div class="auth-magic-note">No password to create or remember.</div></div>' +
      '<div class="auth-or"><span>or</span></div>' +
      '<div class="auth-btns"><button class="auth-btn google" onclick="plOAuth(\'google\')">Continue with Google</button></div>');
  };
  window.plOAuth = function (p) {
    if (!getClient()) return;
    sb.auth.signInWithOAuth({ provider: p, options: { redirectTo: location.origin + location.pathname } });
  };
  window.plMagicLink = function () {
    var e = el('auth-email'), v = e ? e.value.trim() : '';
    if (!v || v.indexOf('@') < 1) { toast('Enter a valid email'); return; }
    sb.auth.signInWithOtp({ email: v, options: { emailRedirectTo: location.origin + location.pathname } })
      .then(function (r) {
        if (r.error) { toast('Could not send, try again shortly'); return; }
        plModalNote('Check your email', '<p>Sign in link sent to <b>' + esc(v) + '</b>.</p>');
      });
  };
  window.plSignOut = function () { if (sb) sb.auth.signOut().then(function () { location.reload(); }); };

  // Authentication starts once the initial shared modules are ready.

  function meta() { return (plUser && plUser.user_metadata) || {}; }
  function name() { return meta().full_name || meta().name || (plUser.email || '').split('@')[0]; }

  var NJ_PARCEL = 'https://services2.arcgis.com/XVOqAjTOJ5P6ngMu/ArcGIS/rest/services/Parcels_Composite_NJ_WM/FeatureServer/0/query';
  var GREENTREE_URL = 'https://johnvarano.com/';
  var ratios = null, rates = null;
  var GMAPS_KEY = 'AIzaSyCZBo_mj5WXyR-Bsb5yHdekxAxauTYNmlU';

  function xfetch(url, ms) {
    ms = ms || 14000;
    var ctl = new AbortController();
    var t = setTimeout(function () { ctl.abort(); }, ms);
    return fetch(url, { signal: ctl.signal }).then(function (r) { clearTimeout(t); return r; },
      function (e) { clearTimeout(t); throw new Error(e && e.name === 'AbortError' ? 'timeout' : 'network'); });
  }
  function median(a) {
    if (!a || !a.length) return null;
    a = a.slice().sort(function (x, y) { return x - y; });
    var m = a.length >> 1;
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }
  function loadRefData() {
    if (ratios && rates) return Promise.resolve();
    return Promise.all([
      xfetch('/equalization-ratios.json', 8000).then(function (r) { return r.json(); })
        .then(function (j) { ratios = (j && j.ratios) || {}; }).catch(function () { ratios = {}; }),
      xfetch('/tax-rates.json', 8000).then(function (r) { return r.json(); })
        .then(function (j) { rates = (j && j.rates) || {}; }).catch(function () { rates = {}; })
    ]);
  }
  function ratioFor(town, county) {
    if (!ratios) return null;
    var t = (town || '').toUpperCase().trim();
    var tc = t + ' (' + (county || '').toUpperCase().trim() + ')';
    var keys = Object.keys(ratios), hit = null;
    for (var i = 0; i < keys.length; i++) if (keys[i].toUpperCase().trim() === tc) { hit = ratios[keys[i]]; break; }
    if (!hit) for (var j = 0; j < keys.length; j++) if (keys[j].toUpperCase().trim() === t) { hit = ratios[keys[j]]; break; }
    if (!hit) return null;
    var yrs = Object.keys(hit).map(Number).filter(function (y) { return y > 1990; }).sort();
    if (!yrs.length) return null;
    var row = hit[String(yrs[yrs.length - 1])];
    var pct = (row && typeof row === 'object') ? +row.ratio : +row;
    if (!pct || pct <= 0) return null;
    return { ratio: pct / 100, year: yrs[yrs.length - 1],
             upper: row && row.upper ? +row.upper / 100 : null };
  }

  // Full multi-year general tax rate history for a town, sorted oldest to
  // newest. Same name-matching rule as ratioFor: try "TOWN (COUNTY)" first,
  // fall back to town alone, since a few small towns are unique statewide.
  function rateHistory(town, county) {
    if (!rates) return null;
    var t = (town || '').toUpperCase().trim();
    var tc = t + ' (' + (county || '').toUpperCase().trim() + ')';
    var keys = Object.keys(rates), hit = null;
    for (var i = 0; i < keys.length; i++) if (keys[i].toUpperCase().trim() === tc) { hit = rates[keys[i]]; break; }
    if (!hit) for (var j = 0; j < keys.length; j++) if (keys[j].toUpperCase().trim() === t) { hit = rates[keys[j]]; break; }
    if (!hit) return null;
    var years = Object.keys(hit).map(Number).filter(function (y) { return y > 1990; }).sort();
    if (years.length < 3) return null;
    return years.map(function (y) { return { year: y, rate: +hit[String(y)] }; });
  }

  // ══════════════════════════════════════════════
  // SR1A  ·  verified sales ratios
  // ══════════════════════════════════════════════
  var sr1a = null;
  function loadSR1A() {
    if (sr1a) return Promise.resolve();
    return xfetch('/property/sr1a-ratios.json', 9000).then(function (r) { return r.json(); })
      .then(function (j) { sr1a = (j && j.districts) || {}; }).catch(function () { sr1a = {}; });
  }
  function sr1aFor(r) {
    if (!sr1a) return null;
    var d = String(r.pams_pin || '').slice(0, 4);
    var row = d && sr1a[d];
    return (row && row.ratio && row.n >= 10) ? row : null;
  }

  // Market value from the state's verified sales, falling back to the
  // published ratio. This is the number every other figure hangs off.
  function marketValue(r) {
    var s = sr1aFor(r);
    if (s && r.assessed) return { v: r.assessed / s.ratio, ratio: s.ratio, n: s.n, src: 'verified' };
    var R = ratioFor(r.town, r.county);
    if (R && r.assessed) return { v: r.assessed / R.ratio, ratio: R.ratio, n: null, src: 'published' };
    if (r.watchdog_value) return { v: r.watchdog_value, ratio: null, n: null, src: 'stored' };
    return null;
  }

  // An appeal test needs a market value that did NOT come from the assessment.
  // Dividing the assessment by the town ratio and then multiplying it back is
  // circular: the supported assessment always equals the assessment and no
  // case can ever fire. So we only test when there is an independent anchor.
  //
  //   A. watchdog_value  the comps based estimate saved from the lookup page
  //   B. median price per square foot in town, applied to this home's size
  //
  // With neither, we say so rather than showing a number that means nothing.
  var chapterCoverageSeen = Object.create(null);
  function trackChapterCoverage(r, testable, basis) {
    var key = [r && (r.pams_pin || r.id || r.address), testable ? '1' : '0', basis].join('|');
    if (chapterCoverageSeen[key]) return;
    chapterCoverageSeen[key] = 1;
    if (typeof gtag === 'function') gtag('event', 'chapter123_coverage', {
      testable: testable ? 'true' : 'false', evidence_basis: basis,
      living_sqft_present: r && r.living_sqft ? 'true' : 'false',
      municipality: r && r.town || 'unknown', property_class: r && (r.property_class || r.cls) || 'unknown'
    });
  }
  function chapter123(r) {
    var m = marketValue(r);
    if (!m || !r.assessed) { trackChapterCoverage(r, false, 'neither'); return null; }

    var indep = null, basis = null;
    if (r.watchdog_value && Math.abs(r.watchdog_value - m.v) / m.v > 0.001) {
      indep = +r.watchdog_value; basis = 'comparable sales from the full record';
    } else {
      var s = sr1aFor(r);
      if (s && s.ppsf && r.living_sqft) {
        indep = s.ppsf * r.living_sqft;
        basis = 'median price per square foot in this town';
      }
    }

    var eff = (r.last_year_tax && r.assessed) ? r.last_year_tax / r.assessed : null;
    var out = {
      market: m.v, ratio: m.ratio, src: m.src, n: m.n,
      testable: false, hasCase: false, indep: indep, basis: basis
    };
    if (indep == null) { trackChapterCoverage(r, false, 'neither'); return out; }

    var fair = indep * m.ratio;
    var limit = fair * 1.15;
    out.testable = true;
    out.fair = fair;
    out.limit = limit;
    out.over = r.assessed - limit;
    out.hasCase = out.over > 0;
    out.saving = (out.hasCase && eff) ? (r.assessed - fair) * eff : null;
    trackChapterCoverage(r, true, basis === 'comparable sales from the full record' ? 'A-watchdog-value' : 'B-town-ppsf');
    return out;
  }

  // ══════════════════════════════════════════════
  // PROPERTY DETAIL FROM SR1A
  //
  // MOD-IV publishes no square footage and New Jersey publishes no bedroom or
  // bathroom counts anywhere in the public record. Those live in the MLS.
  // What the SR1A file does carry, on any parcel that has sold, is living
  // space and year built, so we look the property up by block and lot and use
  // what genuinely exists rather than inventing the rest.
  // ══════════════════════════════════════════════
  var salesCache = {};

  function countySales(county) {
    var k = String(county || '').toLowerCase().replace(/\s+/g, '-');
    if (!k) return Promise.resolve([]);
    if (salesCache[k]) return Promise.resolve(salesCache[k]);
    return xfetch('/property/sales-' + k + '.json', 20000)
      .then(function (r) { return r.json(); })
      .then(function (j) { salesCache[k] = (j && j.sales) || []; return salesCache[k]; })
      .catch(function () { salesCache[k] = []; return []; });
  }

  function hydrateDetails() {
    var counties = {};
    rows.forEach(function (r) { if (r.county) counties[r.county] = 1; });
    return Promise.all(Object.keys(counties).map(countySales)).then(function () {
      rows.forEach(function (r) {
        var all = salesCache[String(r.county || '').toLowerCase().replace(/\s+/g, '-')];
        if (!all) return;
        var d = String(r.pams_pin || '').slice(0, 4);
        var blk = String(r.block || '').replace(/^0+/, '');
        var lot = String(r.lot || '').replace(/^0+/, '');
        if (!d || !blk) return;
        var hit = null;
        for (var i = 0; i < all.length; i++) {
          var s = all[i];
          if (s.d !== d) continue;
          if (String(s.b || '').replace(/^0+/, '') !== blk) continue;
          if (String(s.l || '').replace(/^0+/, '') !== lot) continue;
          if (!hit || s.y > hit.y) hit = s;
        }
        if (hit) {
          r._sqft = hit.sf || null;
          r._built = hit.yb || null;
          r._lastSale = hit.p || null;
          r._lastSaleYear = hit.y || null;
        }
      });
    });
  }

  // A short factual line. Only what the public record actually holds.
  function detailLine(r) {
    var bits = [];
    if (r._sqft) bits.push('<b>' + r._sqft.toLocaleString() + '</b> sq ft');
    if (r._built) bits.push('built <b>' + r._built + '</b>');
    if (r._lastSale && r._lastSaleYear)
      bits.push('last sold <b>' + money(r._lastSale) + '</b> in ' + r._lastSaleYear);
    return bits.length ? '<div class="pr-facts">' + bits.join('<span class="dot">&middot;</span>') + '</div>' : '';
  }

  function addedOn(r) {
    if (!r.created_at) return '';
    var d = new Date(r.created_at);
    if (isNaN(d)) return '';
    return (r.kind === 'home' ? 'Claimed ' : 'Added ') +
      d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  // ══════════════════════════════════════════════
  // SORTING
  // ══════════════════════════════════════════════
  var sortBy = 'added';
  var SORTS = {
    added:     { label: 'Recently added',   fn: function (a, b) { return new Date(b.created_at || 0) - new Date(a.created_at || 0); } },
    valHigh:   { label: 'Highest value',    fn: function (a, b) { return mv(b) - mv(a); } },
    valLow:    { label: 'Lowest value',     fn: function (a, b) { return mv(a) - mv(b); } },
    taxHigh:   { label: 'Highest taxes',    fn: function (a, b) { return (+b.last_year_tax || 0) - (+a.last_year_tax || 0); } },
    taxLow:    { label: 'Lowest taxes',     fn: function (a, b) { return (+a.last_year_tax || 0) - (+b.last_year_tax || 0); } }
  };
  function mv(r) { var m = marketValue(r); return m ? m.v : 0; }

  window.dbSort = function (k) {
    sortBy = k;
    render();
  };

  function sortControl() {
    return '<div class="sortbar">' +
      '<label>Sort</label>' +
      '<select onchange="dbSort(this.value)">' +
        Object.keys(SORTS).map(function (k) {
          return '<option value="' + k + '"' + (k === sortBy ? ' selected' : '') + '>' +
            SORTS[k].label + '</option>';
        }).join('') +
      '</select>' +
      (picked.length
        ? '<span class="cmp-count">' + picked.length + ' selected' +
          '<button onclick="dbCompareSel()"' + (picked.length < 2 ? ' disabled' : '') + '>Compare</button>' +
          '<button class="clr" onclick="dbClearPick()">Clear</button></span>'
        : '<span class="cmp-hint">Tick up to three properties to compare them</span>') +
    '</div>';
  }

  // ══════════════════════════════════════════════
  // COMPARE
  // ══════════════════════════════════════════════
  var picked = [];

  window.dbPick = function (id, box) {
    var i = picked.indexOf(id);
    if (i > -1) picked.splice(i, 1);
    else {
      if (picked.length >= 3) {
        if (box) box.checked = false;
        toast('Three at a time is the limit');
        return;
      }
      picked.push(id);
    }
    render();
  };
  window.dbClearPick = function () { picked = []; render(); };

  window.dbCompareSel = function () {
    var sel = picked.map(function (id) {
      return rows.filter(function (r) { return r.id === id; })[0];
    }).filter(Boolean);
    if (sel.length < 2) return;

    function row(label, fn, note) {
      var vals = sel.map(fn);
      var nums = vals.map(function (v) { return typeof v === 'number' ? v : null; });
      var real = nums.filter(function (v) { return v != null; });
      var best = null;
      if (real.length === sel.length && note) {
        best = note === 'low' ? Math.min.apply(null, real) : Math.max.apply(null, real);
      }
      return '<tr><th>' + label + '</th>' +
        vals.map(function (v, i) {
          var txt = (v == null || v === '') ? '<span class="na">not on file</span>'
                  : (typeof v === 'number' ? money(v) : v);
          var mark = (best != null && nums[i] === best) ? ' class="win"' : '';
          return '<td' + mark + '>' + txt + '</td>';
        }).join('') + '</tr>';
    }

    plModalNote('Comparing ' + sel.length + ' properties',
      '<div class="cw"><table class="cmp3"><thead><tr><th></th>' +
        sel.map(function (r) {
          return '<td class="ch"><img src="' + streetImg(r, 260, 150) + '" alt="" ' +
            'onerror="this.style.display=\'none\'"><b>' + esc(r.address) + '</b>' +
            '<span>' + esc(r.town || '') + '</span></td>';
        }).join('') +
      '</tr></thead><tbody>' +
        row('Assessed', function (r) { return +r.assessed || null; }) +
        row('Annual tax', function (r) { return +r.last_year_tax || null; }, 'low') +
        row('Market value', function (r) { var m = marketValue(r); return m ? Math.round(m.v) : null; }, 'high') +
        row('Effective rate', function (r) { return r.effective_rate ? (+r.effective_rate).toFixed(2) + '%' : null; }) +
        row('Town ratio', function (r) { var s = sr1aFor(r); return s ? (s.ratio * 100).toFixed(1) + '%' : null; }) +
        row('Square feet', function (r) { return r._sqft ? r._sqft.toLocaleString() : null; }) +
        row('Year built', function (r) { return r._built || null; }) +
        row('Median sale in town', function (r) { var s = sr1aFor(r); return s && s.medPrice ? s.medPrice : null; }) +
        row('Price per sq ft here', function (r) { var s = sr1aFor(r); return s && s.ppsf ? '$' + s.ppsf : null; }) +
        row('Tax per $1,000 of value', function (r) {
          var m = marketValue(r);
          return (m && r.last_year_tax) ? Math.round(r.last_year_tax / m.v * 1000) : null;
        }, 'low') +
        row('Appeal case', function (r) {
          var c = chapter123(r);
          if (!c || !c.testable) return 'needs full record';
          return c.hasCase ? 'yes, over by ' + money(c.over) : 'no';
        }) +
      '</tbody></table></div>' +
      '<p class="cw-note">Highlighted cells are the better number in that row. Bedroom and bathroom counts are ' +
      'not published anywhere in New Jersey\u2019s public property records, so they are not shown. Square footage ' +
      'comes from the state sales file and only exists for properties that have sold.</p>');
  };

  // ══════════════════════════════════════════════
  // PER PROPERTY MENU
  // ══════════════════════════════════════════════
  window.dbMenu = function (id, ev) {
    ev.stopPropagation();
    var open = document.querySelector('.pm.open');
    if (open) open.classList.remove('open');
    var m = document.getElementById('pm-' + id);
    if (m && (!open || open !== m)) m.classList.add('open');
  };
  document.addEventListener('click', function () {
    var o = document.querySelector('.pm.open');
    if (o) o.classList.remove('open');
  });

  function propMenu(r) {
    var q = encodeURIComponent(r.address + ', ' + (r.town || '') + ', NJ ' + (r.zip || ''));
    return '<div class="pm-wrap">' +
      '<button class="pm-btn" onclick="dbMenu(\'' + r.id + '\', event)" aria-label="More"><i class="fas fa-ellipsis"></i></button>' +
      '<div class="pm" id="pm-' + r.id + '">' +
        '<a href="/property/?address=' + q + '"><i class="fas fa-file-lines"></i> Open full record</a>' +
        '<button onclick="dbShare(\'' + r.id + '\')"><i class="fas fa-share-nodes"></i> Share</button>' +
        '<button onclick="dbCopy(\'' + r.id + '\')"><i class="fas fa-link"></i> Copy link</button>' +
        '<button onclick="dbAskAbout(\'' + esc(r.address).replace(/'/g, '') + '\')"><i class="fas fa-envelope"></i> Email an agent</button>' +
        '<button onclick="dbDirections(\'' + r.id + '\')"><i class="fas fa-diamond-turn-right"></i> Directions</button>' +
        '<hr>' +
        (r.kind === 'home' && r.verify_level !== 'mail'
          ? '<button onclick="dbVerify(\'' + r.pams_pin + '\',\'' + esc(r.address).replace(/'/g, '') + '\',\'' + esc(r.town || '').replace(/'/g, '') + '\',\'' + esc(r.zip || '').replace(/'/g, '') + '\')"><i class="fas fa-badge-check"></i> Verify ownership</button>'
          : '') +
        '<button class="rm" onclick="dbRemove(\'' + r.id + '\')"><i class="fas fa-trash"></i> Remove</button>' +
      '</div></div>';
  }

  function byId(id) { return rows.filter(function (r) { return r.id === id; })[0]; }
  function propUrl(r) {
    return 'https://njpropertytaxrelief.com/property/?address=' +
      encodeURIComponent(r.address + ', ' + (r.town || '') + ', NJ ' + (r.zip || ''));
  }
  window.dbShare = function (id) {
    var r = byId(id); if (!r) return;
    if (navigator.share) navigator.share({ title: r.address, url: propUrl(r) }).catch(function () {});
    else window.dbCopy(id);
  };
  window.dbCopy = function (id) {
    var r = byId(id); if (!r) return;
    var u = propUrl(r);
    if (navigator.clipboard) navigator.clipboard.writeText(u).then(function () { toast('Link copied'); })
      .catch(function () { window.prompt('Copy this link:', u); });
    else window.prompt('Copy this link:', u);
  };
  window.dbDirections = function (id) {
    var r = byId(id); if (!r) return;
    window.open('https://www.google.com/maps/dir/?api=1&destination=' +
      encodeURIComponent(r.address + ', ' + (r.town || '') + ', NJ'), '_blank', 'noopener');
  };

  window.dbVerify = function (pin, address, town, zip) {
    if (!getClient() || !window.NJPTRVerification) { toast('Verification is temporarily unavailable'); return; }
    window.NJPTRVerification.open({
      client: sb, pin: pin, address: address, town: town, zip: zip,
      modal: window.plModalNote, close: window.plCloseNote, toast: toast,
      onVerified: function () { setTimeout(function () { location.reload(); }, 350); }
    });
  };

  function isPro() {
    if (window.NJPTRPlan) return window.NJPTRPlan.can('pro');
    var plan = String((profile && (profile.plan_tier || profile.plan)) || '').toLowerCase().replace(/[\s_-]/g, '');
    return plan === 'pro' || plan === 'pro+' || plan === 'proplus' || plan === 'teams';
  }

  function locked(label, why, html) {
    if (isPro()) return html;
    return '<div class="lk">' +
      '<div class="lk-in" aria-hidden="true"><div class="locked-skeleton"><i></i><i></i><i></i></div></div>' +
      '<div class="lk-over">' +
        '<div class="lk-t"><i class="fas fa-lock"></i> ' + esc(label) + '</div>' +
        '<div class="lk-w">' + why + '</div>' +
        '<button class="lk-b" onclick="dbUpgrade()">See what Pro includes</button>' +
      '</div></div>';
  }

  // ══════════════════════════════════════════════
  // UNIFORMITY AND APPEAL ODDS
  //
  // Two datasets New Jersey publishes and nobody reads, joined to the property
  // in front of you.
  //
  //   uniformity.json  how consistently a town assesses, 558 districts
  //   appeals.json     what actually happens to appeals, 21 counties, 10 years
  //
  // Separately they are trivia. Together with the property's own gap they
  // answer the only question that matters: is filing worth it.
  // ══════════════════════════════════════════════
  var uniData = null, appealData = null;

  


  
  

  
  

  var BAND_TEXT = {
    'excellent': 'assesses very consistently',
    'good':      'assesses reasonably consistently',
    'fair':      'assessments here vary more than they should',
    'poor':      'assessments here are noticeably uneven',
    'very poor': 'the assessment roll here is a mess'
  };
  var BAND_CLS = {
    'excellent': 'good', 'good': 'good', 'fair': 'mid', 'poor': 'bad', 'very poor': 'bad'
  };

  // ── 1 · ASSESSMENT UNIFORMITY ──
  function uniBody(r, u) {

    var W = 320, H = 62;
    var yrs = Object.keys(u.series).sort();
    var vals = yrs.map(function (y) { return u.series[y]; });
    var lo = Math.min.apply(null, vals.concat([8])), hi = Math.max.apply(null, vals.concat([22]));
    var path = vals.map(function (v, i) {
      var x = 6 + (i / Math.max(1, vals.length - 1)) * (W - 12);
      var y = H - 8 - ((v - lo) / ((hi - lo) || 1)) * (H - 20);
      return (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
    }).join(' ');
    // the IAAO line, which is the only benchmark that means anything
    var iaao = H - 8 - ((15 - lo) / ((hi - lo) || 1)) * (H - 20);

    return toolCard('Assessment uniformity', 'fa-ruler-combined',
      '<p class="tl-p">Your town\u2019s equalization ratio says whether it assesses <em>high or low</em>. ' +
      'This says whether it assesses <em>fairly</em>. It is the average percentage by which individual ' +
      'assessments in ' + esc(u.name) + ' stray from the town\u2019s own standard, and New Jersey publishes ' +
      'it every year in a ninety page PDF nobody opens.</p>' +

      '<div class="un-head">' +
        '<div class="un-score ' + (BAND_CLS[u.band] || 'mid') + '">' +
          '<b>' + u.score + '</b><span>uniformity score</span></div>' +
        '<div class="un-say">' +
          '<b>' + esc(u.name) + ' ' + (BAND_TEXT[u.band] || '') + '.</b> ' +
          'Its residential coefficient of deviation is <b>' + u.coefficient + '</b>. ' +
          'The professional standard is 15 or below. ' +
          'That puts it in the <b>' + ordinal(u.percentile) + ' percentile</b> statewide, so ' +
          (u.percentile >= 50
            ? 'it is more consistent than most of New Jersey.'
            : 'most of New Jersey assesses more consistently than this.') +
        '</div>' +
      '</div>' +

      '<div class="un-chart">' +
        '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Coefficient of deviation over time">' +
          '<line x1="6" y1="' + iaao.toFixed(1) + '" x2="' + (W - 6) + '" y2="' + iaao.toFixed(1) +
            '" stroke="#c3cbdb" stroke-width="1" stroke-dasharray="4 4"/>' +
          '<text x="' + (W - 8) + '" y="' + (iaao - 5).toFixed(1) + '" text-anchor="end" ' +
            'font-size="9" fill="#8a93a6">standard, 15</text>' +
          '<path d="' + path + '" fill="none" stroke="' +
            (u.band === 'poor' || u.band === 'very poor' ? '#c0342b' : '#14346e') +
            '" stroke-width="2.4" stroke-linecap="round"/>' +
        '</svg>' +
        '<div class="un-yrs">' + yrs.map(function (y, i) {
          return '<span>' + y + '<em>' + vals[i] + '</em></span>';
        }).join('') + '</div>' +
      '</div>' +

      (u.commercial && u.commercial > u.coefficient * 1.5
        ? '<div class="tl-note">Commercial property here deviates at <b>' + u.commercial + '</b>, far worse ' +
          'than residential. Uneven commercial assessment shifts burden onto homeowners over time.</div>'
        : '') +

      '<div class="tl-fine">Coefficient of deviation, class 2 residential, from the NJ Division of Taxation ' +
      'Measures of Property Assessment Uniformity. Weighted toward recent years, adjusted for volatility and ' +
      'sample size. A high coefficient does not by itself win an appeal, but it is the condition that makes ' +
      'one arguable.</div>');
  }

  // ── 2 · APPEAL ODDS ──
  function appealBody(r, a) {
    var L = a.latest, u = uniFor(r);
    var hist = Object.keys(a.history).sort();

    var W = 330, H = 58;
    var rates = hist.map(function (y) { return a.history[y].win_rate_filed; });
    var lo = Math.min.apply(null, rates), hi = Math.max.apply(null, rates);
    var path = rates.map(function (v, i) {
      var x = 6 + (i / Math.max(1, rates.length - 1)) * (W - 12);
      var y = H - 8 - ((v - lo) / ((hi - lo) || 1)) * (H - 18);
      return (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
    }).join(' ');

    // Expected value. This is the number nobody else can produce, because it
    // needs the county outcome record, the town's uniformity, and this
    // property's own gap, and no one publishes the three together.
    var c = chapter123(r);
    var ev = null;
    if (c && c.testable && c.hasCase && c.saving && L.win_rate_filed != null) {
      // Expected value uses the outcome of every filed appeal. The merits-only
      // decided rate excludes dismissals and withdrawals and is context, not odds.
      var p = L.win_rate_filed / 100;
      ev = { p: p, gross: c.saving * 5, net: (c.saving * 5 * p) - 25 };
    }

    return toolCard('Appeal odds in ' + esc(a.county.toLowerCase().replace(/\b\w/g, function (m) { return m.toUpperCase(); })) + ' County',
      'fa-gavel',
      '<p class="tl-p">Appeals are decided by the <b>county</b> board of taxation, not your town, so this is the ' +
      'body that would actually hear your case. New Jersey publishes what happens to every appeal filed, ' +
      'and has done for ten years.</p>' +

      '<div class="ap-grid">' +
        '<div><b>' + L.win_rate_filed + '%</b><span>of all appeals filed won a reduction</span></div>' +
        '<div><b>' + (L.win_rate_decided != null ? L.win_rate_decided + '%' : '-') +
          '</b><span>of those actually decided</span></div>' +
        '<div><b>' + L.total.toLocaleString() + '</b><span>filed in ' + a.latest_year + '</span></div>' +
        '<div><b>' + L.residential.toLocaleString() + '</b><span>were residential like yours</span></div>' +
      '</div>' +

      '<div class="ap-chart">' +
        '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Win rate over ten years">' +
          '<path d="' + path + '" fill="none" stroke="#1c7a4a" stroke-width="2.4" stroke-linecap="round"/>' +
        '</svg>' +
        '<div class="ap-yrs"><span>' + hist[0] + '  ' + rates[0] + '%</span>' +
          '<span class="' + (a.trend > 0 ? 'up' : a.trend < 0 ? 'down' : '') + '">' +
          (a.trend > 0 ? 'up ' + a.trend + ' points' : a.trend < 0 ? 'down ' + Math.abs(a.trend) + ' points' : 'flat') +
          ' over ten years</span>' +
          '<span>' + hist[hist.length - 1] + '  ' + rates[rates.length - 1] + '%</span></div>' +
      '</div>' +

      (ev
        ? '<div class="ap-ev">' +
            '<div class="ap-ev-n">' + money(Math.round(ev.net)) + '</div>' +
            '<div class="ap-ev-l">Expected value of filing on <b>' + esc(r.address) + '</b>, over five years, ' +
              'after the filing fee. That is a <b>' + Math.round(ev.p * 100) + '%</b> chance of winning ' +
              money(Math.round(ev.gross)) + '.</div>' +
            '<button class="tl-btn" onclick="dbAsk(\'appeal\')">Have an agent screen this</button>' +
          '</div>'
        : '<div class="tl-note">Your saved properties do not currently show an assessment above the Chapter 123 ' +
          'limit, so there is nothing to weigh these odds against. Open a property\u2019s full record and the ' +
          'analysis saves back here.</div>') +

      '<div class="tl-fine">A win means the assessment came down, either revised by the board or stipulated by ' +
      'agreement before hearing. Most successful appeals settle, so counting only board revisions would ' +
      'understate this badly. The filed rate is the headline probability used in expected value. The decided-on-the-merits rate is shown separately because it excludes withdrawals and dismissals. ' +
      'The average successful appeal in ' + a.county.toLowerCase() + ' cut ' +
      (L.avg_reduction_per_win ? money(L.avg_reduction_per_win) : 'an unrecorded amount') +
      ' off the assessed value, though that figure is dominated by commercial cases and a house will be far less. ' +
      'This data is published by county, not by town. Anyone offering you a town level win rate for New Jersey ' +
      'is guessing.</div>');
  }

  // ══════════════════════════════════════════════
  // CONDENSED METRICS
  //
  // Every saved property gets its own numbers. The previous build computed
  // these once from rows[0] and printed them under a list of five properties,
  // which read as though they applied to all of them. They did not.
  //
  // Full depth lives on the per property report at home.html. What sits here
  // is the short version: four figures, each explained on hover, plus a link
  // through to the whole thing.
  // ══════════════════════════════════════════════

  

  

  // The four numbers worth showing on a card, each one specific to this row.
  

  

  

  

  // Tooltips: one shared bubble, positioned on hover or focus. Cheaper than a
  // node per tip and it survives the list being rebuilt on every sort.
  

  // ══════════════════════════════════════════════
  // CONDENSED METRICS
  //
  // Every saved property gets its own numbers. The previous build computed
  // these once from rows[0] and printed them under a list of five properties,
  // which read as though they applied to all of them. They did not.
  //
  // Full depth lives on the per property report at home.html. What sits here
  // is the short version: four figures, each explained on hover, plus a link
  // through to the whole thing.
  // ══════════════════════════════════════════════

  var TIPS = {
    uniformity:
      'How consistently this town assesses its homes. The equalization ratio tells you whether a town ' +
      'assesses high or low; this tells you whether it assesses fairly. Scored 0 to 100 from the state\u2019s ' +
      'Coefficient of Deviation, where the professional standard is a coefficient of 15 or below.',
    ratio:
      'What share of true market value assessments run at in this town, measured from sales New Jersey ' +
      'itself verified as genuine arm\u2019s length transactions. Your assessment divided by this is roughly ' +
      'what the town thinks your home is worth.',
    odds:
      'The share of property tax appeals in this county that ended with the assessment reduced, counting ' +
      'both board decisions and settlements. Appeals are heard by the county board, not the town, so the ' +
      'county is the body whose behaviour this predicts.',
    gap:
      'How far the assessment sits above the Chapter 123 limit, which is the supported assessment plus the ' +
      '15 percent cushion New Jersey allows. Above zero means there is an argument to make. This needs an ' +
      'independent market value, so it only appears once the full record has been opened.',
    eff:
      'Annual tax divided by estimated market value. This is the only fair way to compare two properties in ' +
      'different towns, because assessment levels differ everywhere.',
    drift:
      'How much this assessment has moved since you started tracking it. New Jersey does not publish ' +
      'per parcel assessment history anywhere, so this accumulates from your own visits.'
  };

  function tip(key, label) {
    return '<span class="tip" tabindex="0" data-tip="' + esc(TIPS[key] || '') + '">' +
      label + '<i class="fas fa-circle-info"></i></span>';
  }

  // The four numbers worth showing on a card, each one specific to this row.
  function metricStrip(r) {
    var u = uniFor(r), a = appealFor(r), s = sr1aFor(r), c = chapter123(r);
    if (!u && !a && !s && !c) return '';

    var cells = [];
    if (u) cells.push(cell(tip('uniformity', 'Uniformity'), u.score,
      u.band, BAND_CLS[u.band] || 'mid'));
    if (s) cells.push(cell(tip('ratio', 'Town ratio'), (s.ratio * 100).toFixed(1) + '%',
      s.n + ' verified sales', ''));
    if (a) cells.push(cell(tip('odds', 'Appeal odds'), a.latest.win_rate_filed + '%',
      esc(titleCase(a.county)) + ' County', ''));
    if (c && c.testable) {
      cells.push(cell(tip('gap', 'Over the limit'),
        c.hasCase ? money(c.over) : 'No',
        c.hasCase ? 'worth ' + money(c.saving) + '/yr' : 'within Chapter 123',
        c.hasCase ? 'bad' : 'good'));
    } else if (r.effective_rate) {
      cells.push(cell(tip('eff', 'Effective rate'), (+r.effective_rate).toFixed(2) + '%',
        'of market value', ''));
    }

    return '<div class="ms">' + cells.join('') + '</div>';
  }

  function cell(label, val, sub, cls) {
    return '<div class="ms-c"><span class="ms-l">' + label + '</span>' +
      '<b class="ms-v ' + (cls || '') + '">' + val + '</b>' +
      '<span class="ms-s">' + sub + '</span></div>';
  }

  function titleCase(s) {
    return String(s || '').toLowerCase().replace(/\b\w/g, function (m) { return m.toUpperCase(); });
  }

  function reportLink(r) {
    return '/property/home?pin=' + encodeURIComponent(r.pams_pin || '');
  }

  // Tooltips: one shared bubble, positioned on hover or focus. Cheaper than a
  // node per tip and it survives the list being rebuilt on every sort.
  function initTips() {
    if (document.getElementById('tipbox')) return;
    var box = document.createElement('div');
    box.id = 'tipbox';
    box.className = 'tipbox';
    document.body.appendChild(box);

    function show(e) {
      var t = e.target.closest ? e.target.closest('.tip') : null;
      if (!t) return;
      box.textContent = t.getAttribute('data-tip') || '';
      box.classList.add('on');
      var r = t.getBoundingClientRect();
      var top = r.bottom + window.scrollY + 8;
      var left = Math.min(
        Math.max(12, r.left + window.scrollX + r.width / 2 - 150),
        window.innerWidth - 312
      );
      box.style.top = top + 'px';
      box.style.left = left + 'px';
    }
    function hide(e) {
      if (e.target.closest && e.target.closest('.tip')) box.classList.remove('on');
    }
    document.addEventListener('mouseover', show);
    document.addEventListener('mouseout', hide);
    document.addEventListener('focusin', show);
    document.addEventListener('focusout', hide);
  }

  // A section, not a card. A hairline and a small label, then the content.
  function toolCard(title, icon, body) {
    return '<section class="sec"><h4><i class="fas ' + icon + '"></i>' + title + '</h4>' + body + '</section>';
  }

  // Home is a signal browser, not the final technical report. Tool modules
  // still build their complete analysis so calculations and interactive forms
  // remain available, but the report initially presents one compact row per
  // signal. The row opens the sourced marker page; "Use full tool" reveals the
  // original analysis only when somebody deliberately asks for it.
  var HOME_SIGNAL_MARKERS = [
    [/chapter 123/i, 'watchdog.chapter123_position'],
    [/land and building/i, 'watchdog.improvement_ratio'],
    [/reassessment|assessment lag/i, 'watchdog.reassessment_risk'],
    [/added.*omitted/i, 'watchdog.added_omitted_risk'],
    [/revaluation/i, 'watchdog.revaluation_risk'],
    [/uniformity|how.*assess/i, 'uniformity.score'],
    [/budget pressure/i, 'watchdog.tax_pressure'],
    [/appeal/i, 'appeals.latest_win_rate_filed'],
    [/market value|estimated value/i, 'watchdog.market_value_estimate'],
    [/tax trajectory|bill headed/i, 'watchdog.tax_trajectory'],
    [/effective tax/i, 'watchdog.effective_tax_rate'],
    [/class mix|residential share/i, 'property.property_class'],
    [/abatement|pilot/i, 'watchdog.exempt_pilot_exposure'],
    [/escrow/i, 'watchdog.escrow_monthly_delta'],
    [/permit/i, 'preflight.open_permit_count'],
    [/carry-cost/i, 'watchdog.investor_carry_cost_volatility'],
    [/evidence strength/i, 'watchdog.appeal_evidence_strength'],
    [/real estate professional/i, 'watchdog.listing_friction_index'],
    [/cross-professional decision/i, 'watchdog.transaction_tax_shock_index'],
    [/flood|wetland|environment/i, 'watchdog.constraint_stack_count'],
    [/farmland/i, 'property.property_class'],
    [/closing cost|buyer cost/i, 'watchdog.closing_cost_estimate'],
    [/benefit|anchor|stay nj|senior freeze/i, 'property.annual_tax'],
    [/history|time machine/i, 'property.assessed_value'],
    [/statewide|mod-iv|municipal baseline/i, 'modiv_intel.median_assessed_value']
  ];

  function signalMarker(title, fallback) {
    for (var i = 0; i < HOME_SIGNAL_MARKERS.length; i++) {
      if (HOME_SIGNAL_MARKERS[i][0].test(title)) return HOME_SIGNAL_MARKERS[i][1];
    }
    return fallback || 'property.assessed_value';
  }

  function signalSummary(node) {
    var preferred = node.querySelector('.ir-say,.rr-flag,.rv-own,.bc-warn,.bc-ok,.ap-ev,.tl-p,.tm-reading,p');
    var text = preferred ? preferred.textContent.replace(/\s+/g, ' ').trim() : '';
    if (!text) text = 'Open for the current reading, methodology and source trail.';
    return text.length > 145 ? text.slice(0, 142).replace(/\s+\S*$/, '') + '…' : text;
  }

  function compactHomeSection(host, sectionKey) {
    var fallback = {
      fair: 'watchdog.chapter123_position', kept: 'watchdog.reassessment_risk', farmland: 'property.property_class',
      reval: 'watchdog.revaluation_risk', town: 'uniformity.score', file: 'appeals.latest_win_rate_filed',
      owed: 'property.annual_tax', buy: 'watchdog.closing_cost_estimate', diligence: 'watchdog.constraint_stack_count',
      compare: 'watchdog.effective_tax_rate', trend: 'watchdog.tax_trajectory', history: 'property.assessed_value'
    }[sectionKey];
    var looseBlocks = [
      ['.ti-report', 'Town intelligence', 'fa-chart-column'],
      ['.bp-report', 'Municipal budget pressure', 'fa-building-columns'],
      ['.tm-detail', 'Historical Property Time Machine', 'fa-clock-rotate-left'],
      ['.dd-tool', 'Closing and collateral preflight', 'fa-shield-halved'],
      ['.pw-stack', 'Professional closing workflows', 'fa-briefcase']
    ];
    looseBlocks.forEach(function (config) {
      host.querySelectorAll(':scope > ' + config[0]).forEach(function (block) {
        var wrapper = document.createElement('section');
        wrapper.className = 'sec';
        wrapper.innerHTML = '<h4><i class="fas ' + config[2] + '"></i>' + config[1] + '</h4>';
        block.parentNode.insertBefore(wrapper, block);
        wrapper.appendChild(block);
      });
    });
    host.querySelectorAll('.sec').forEach(function (node) {
      if (node.classList.contains('hs-ready')) return;
      var heading = node.querySelector(':scope > h4');
      if (!heading) return;
      var title = heading.textContent.replace(/\s+/g, ' ').trim();
      var icon = heading.querySelector('i');
      var marker = signalMarker(title, fallback);
      var summary = signalSummary(node);
      var valueNode = node.querySelector('.fig dd strong,.fig b,.ir-row b,.tm-kpis b');
      var value = valueNode ? valueNode.textContent.replace(/\s+/g, ' ').trim() : '';
      var detail = document.createElement('div');
      detail.className = 'hs-full';
      detail.hidden = true;
      Array.from(node.children).forEach(function (child) {
        if (child !== heading) detail.appendChild(child);
      });
      var href = markerHref(marker, value, summary);
      node.classList.add('hs-ready');
      heading.hidden = true;
      node.insertAdjacentHTML('afterbegin',
        '<div class="hs-signal" data-marker-id="' + esc(marker) + '" data-marker-value="' + esc(value) + '" data-marker-note="' + esc(summary) + '">' +
          '<a class="hs-open dm" data-marker-id="' + esc(marker) + '" data-marker-value="' + esc(value) + '" data-marker-note="' + esc(summary) + '" href="' + href + '">' +
            '<span class="hs-icon"><i class="' + (icon ? icon.className : 'fas fa-chart-simple') + '"></i></span>' +
            '<span class="hs-copy"><b>' + esc(title) + '</b><small>' + esc(summary) + '</small></span>' +
            (value ? '<strong>' + esc(value) + '</strong>' : '') +
            '<i class="fas fa-chevron-right hs-chevron"></i>' +
          '</a>' +
          '<button class="hs-tool" type="button" aria-expanded="false"><i class="fas fa-sliders"></i> Use full tool</button>' +
        '</div>');
      node.appendChild(detail);
      var button = node.querySelector('.hs-tool');
      button.addEventListener('click', function () {
        var open = detail.hidden;
        detail.hidden = !open;
        button.setAttribute('aria-expanded', open ? 'true' : 'false');
        button.innerHTML = open ? '<i class="fas fa-minus"></i> Hide full tool' : '<i class="fas fa-sliders"></i> Use full tool';
      });
    });
  }


  // ══════════════════════════════════════════════
  // REASSESSMENT RISK
  //
  // When a home sells, the price becomes public evidence of what it is worth.
  // The assessment does not automatically follow. In most New Jersey towns it
  // sits untouched until the assessor gets to it, which can be years, or until
  // the town revalues, at which point it catches up all at once.
  //
  // That gap is visible in the state's own files, and it cuts two ways:
  //
  //   A buyer  needs to know the bill is about to jump, because the listing
  //            shows the seller's tax, not theirs.
  //   An owner needs to know they are currently under-assessed, which is good
  //            news worth not drawing attention to, and terrible news if they
  //            were about to file an appeal.
  //
  // THE TRAP, AND WHY THIS IS NOT A NAIVE RATIO SCREEN
  //
  //   A naive version flags every sale where assessed/price runs below the
  //   town norm, and it is wrong roughly a tenth of the time. New construction
  //   sells for the price of a finished house while still assessed on the bare
  //   land, which produces ratios near 10% that look spectacular and mean
  //   nothing. Same for teardowns and land sales.
  //
  //   Testing on Winslow: 98 sales looked like lags. 6 were land with no
  //   building on record, 3 were new construction awaiting an added
  //   assessment. Calling those "stale" would have been wrong and obvious to
  //   anyone who knows the market. They are classified separately here.
  // ══════════════════════════════════════════════

  var LAG_CLS = {
    stale: {
      label: 'Assessment has not kept up',
      why: 'An existing home that sold well above what its assessment implies. The assessor has not ' +
           'revisited it yet.'
    },
    'new': {
      label: 'New construction, added assessment coming',
      why: 'Built within a few years of the sale and still assessed close to bare land. New Jersey adds ' +
           'the improvement through an added assessment, and the bill rises sharply when it lands.'
    },
    land: {
      label: 'Land or teardown at time of sale',
      why: 'No building on record when it changed hands, so the assessment covers the lot only.'
    }
  };

  

  // Classify every recent verified sale in a town against that town's own ratio.
  

  // Where does THIS property sit? Needs its own verified sale to say anything.
  

  // the sales loader is named countySales in this file
  

  

  // ══════════════════════════════════════════════
  // REVALUATION RADAR
  //
  // A revaluation is the single largest thing that can happen to a New Jersey
  // property tax bill, and almost nobody sees it coming. Assessments across a
  // whole town are reset to current market value at once. In a town that has
  // not revalued in twenty years, assessments can double or triple overnight.
  //
  // The bill does not double, because the tax RATE falls to compensate. That is
  // the part that gets lost in the panic, and the part that matters: a
  // revaluation redistributes the burden rather than raising it. Whoever has
  // been under-assessed relative to their neighbours pays more afterwards, and
  // whoever has been over-assessed pays less. Which side you land on is
  // knowable in advance, and that is what this works out.
  //
  // WHAT ACTUALLY TRIGGERS ONE
  //
  //   A county board of taxation may order a revaluation, and the Director may
  //   compel one. The two figures that drive it are both published:
  //
  //     Director's ratio    drifting well below 100% means assessments no
  //                         longer track market value
  //     Coefficient of      above 15 means the town assesses unevenly, which is
  //     deviation           the fairness argument for forcing a reset
  //
  // WHAT THIS DOES NOT HAVE, AND WILL NOT PRETEND TO
  //
  //   The list of towns currently under a revaluation order, and the date each
  //   town last revalued. Both exist; neither is published in a machine
  //   readable form. So this reads pressure, not schedule. A town can sit at
  //   maximum pressure for years, and a town under low pressure can still
  //   revalue because its governing body decided to. This is a weather
  //   forecast, not a calendar.
  // ══════════════════════════════════════════════

  

  var REVAL_TEXT = {
    recent: ['Recently revalued', 'Assessments here currently sit at or above market value, which is what a ' +
             'town looks like just after a reset. Pressure for another one is effectively nil, and this is ' +
             'the point in the cycle when appeals are most winnable.'],
    high:   ['Under real pressure', 'Both figures the state watches are well outside where they should be. ' +
             'A revaluation here would not be a surprise.'],
    building: ['Pressure building', 'Drifting in the direction that eventually forces a reset, though not yet ' +
             'at the point where a county board typically acts.'],
    low:    ['Little pressure', 'The published figures are close enough to where the state expects them that ' +
             'nothing is being forced.'],
    minimal:['Settled', 'Assessments here track market value closely and the roll is applied evenly. ' +
             'Nothing suggests a reset is coming.']
  };

  

  // ══════════════════════════════════════════════
  // NEW JERSEY BENEFIT RULES
  //
  // Kept in one place because they change with every state budget, and because
  // the whole point of these tools is being right about the thresholds. Each
  // figure below is dated so it is obvious when it went stale.
  //
  // Verified against the Division of Taxation, August 2026.
  // ══════════════════════════════════════════════
  var NJ = {
    asOf: 'August 2026',
    stayNJ: {
      // The FY2027 Appropriations Act, signed 30 June 2026, cut the income
      // limit from $500,000 to $200,000. A great many sites still quote the
      // old figure, which would tell a household earning $300,000 it qualifies
      // when it no longer does.
      incomeLimit: 200000,
      minAge: 65,
      share: 0.50,            // 50% of the property tax bill
      taxCap: 13000,          // applied to the first $13,000 of tax
      benefitCap: 6500,
      homeownersOnly: true
    },
    anchor: {
      // Homeowners, by age and NJ-1040 line 29 income.
      senior:  [[150000, 1750], [250000, 1250]],
      under65: [[150000, 1500], [250000, 1000]],
      renter:  [[150000, 700]],
      hardLimit: 250000
    },
    freeze: {
      incomeLimit: 172475,    // 2025 filing year
      minAge: 65,
      minYearsOwned: 10,
      minYearsResident: 10
    },
    deduction: {
      senior: 250,            // annual, age 65+ or permanently disabled
      seniorIncomeLimit: 10000,
      veteran: 250
    },
    deadline: 'November 2, 2026',
    form: 'PAS-1'
  };

  

  // ══════════════════════════════════════════════
  // 14 · SENIOR BENEFIT MAXIMIZER
  //
  // The stacking is genuinely counterintuitive and it costs people money.
  //
  // Stay NJ is a TOP OFF, not an addition. The state works out ANCHOR and the
  // Senior Freeze first. If those two together already reach 50% of the tax
  // bill, Stay NJ pays nothing. If they fall short, Stay NJ pays the
  // difference up to the cap.
  //
  // The practical consequence, which nobody explains: claiming ANCHOR does not
  // increase a senior's total relief once Stay NJ is in play. It changes which
  // pot the money comes from. What DOES increase the total is the Senior
  // Freeze, because the freeze amount grows every year the base year holds,
  // and a large freeze plus Stay NJ can exceed 50% of the bill.
  //
  // Which makes the base year the single most valuable thing on this page.
  // ══════════════════════════════════════════════
  

  

  // ══════════════════════════════════════════════
  // 13 · FIRST TIME BUYER TRUE COST
  //
  // A listing shows the seller's tax bill. That is not what the buyer will pay,
  // for two reasons nobody mentions at the open house: the assessment may not
  // have caught up with what the house is now worth, and the rate moves every
  // year regardless.
  // ══════════════════════════════════════════════
  

  

  

  // ══════════════════════════════════════════════
  // ABATEMENT EXPOSURE
  //
  // Column 3 of the NJ Abstract of Ratables: "Total Taxable Value of Partial
  // Exemptions and Abatements". The slice of a town's assessment base that has
  // been granted partial relief and therefore does not pay the full rate.
  //
  // WHY IT MATTERS TO EVERYONE ELSE
  //
  //   A municipal levy is a fixed dollar amount divided across whatever base
  //   remains. Take a slice out and the rest covers the same budget. Nobody
  //   tells the people carrying it.
  //
  // WHAT THIS MEASURES, AND WHAT IT DOES NOT
  //
  //   Included: five year improvement abatements, fire suppression system
  //   exemptions, historic site exemptions, Urban Enterprise Zone abatements.
  //   All are PARTIAL relief on property that is otherwise on the tax roll.
  //
  //   NOT included, and this is the honest limit of the tool: PILOT agreements
  //   and long term tax exemptions, which are FULL exemptions rather than
  //   partial ones and sit in a different table entirely. Nor fully exempt
  //   property, meaning churches, schools, government and non-profits.
  //
  //   That matters most in exactly the places people assume it matters. A city
  //   financing redevelopment through PILOTs will look low here, because its
  //   largest giveaways are not in this column. The tool says so rather than
  //   letting the number be read as the whole story.
  // ══════════════════════════════════════════════
  var abateData = null;

  

  

  

  // ══════════════════════════════════════════════
  // TOWN PROFILE  ·  one query, two tools
  //
  // Both of the tools below need the same thing: every class 2 parcel in the
  // municipality with its land and improvement values, plus the class mix of
  // the whole town. Pulling that once and sharing it keeps a single request on
  // a free public server rather than two.
  // ══════════════════════════════════════════════
  var townProfileCache = {};

  

  // ══════════════════════════════════════════════
  // 3 · IMPROVEMENT RATIO ANOMALY
  //
  // Every assessment is two numbers: the land and the building on it. Land
  // value is set by location and lot size and is very hard to argue with,
  // because the lot next door is worth what your lot is worth. The improvement
  // figure is the assessor's judgment about a structure, and judgment is what
  // an appeal actually contests.
  //
  // So a property whose IMPROVEMENT share runs well above comparable homes in
  // the same town is carrying its excess in the one component that can be
  // argued, which makes it the most winnable kind of case. A property whose
  // excess is all in the land is a much harder fight.
  //
  // This is not a market value estimate. Both sides of the comparison are
  // assessments from the same roll, so no valuation model is involved and none
  // of its error comes with it.
  // ══════════════════════════════════════════════
  

  // ══════════════════════════════════════════════
  // 11 · CLASS MIX
  //
  // Who actually pays for a town. A municipality with a thin commercial base
  // funds its budget almost entirely from houses, and that is a structural
  // condition rather than a bad year. It also predicts the future: a town at
  // 95% residential has nowhere to turn when costs rise except the homeowners.
  // ══════════════════════════════════════════════
  var CLASS_NAMES = {
    '1':  ['Vacant land', 'vac'],
    '2':  ['Residential', 'res'],
    '3A': ['Farm, regular', 'farm'],
    '3B': ['Farm, qualified', 'farm'],
    '4A': ['Commercial', 'com'],
    '4B': ['Industrial', 'ind'],
    '4C': ['Apartments', 'apt'],
    '15A':['Public property', 'exempt'],
    '15B':['Exempt', 'exempt'],
    '15C':['Cemetery', 'exempt'],
    '15D':['Exempt', 'exempt'],
    '15E':['Exempt', 'exempt'],
    '15F':['Exempt', 'exempt'],
    '5A': ['Railroad', 'other'],
    '5B': ['Railroad', 'other'],
    '6A': ['Telephone', 'other']
  };

  

  // ══════════════════════════════════════════════
  // APPEAL PACKET
  //
  // Everything the site knows about one property, assembled in the order a
  // county board hears it and printed as a document someone can attach to a
  // filing.
  //
  // WHAT THIS IS NOT
  //
  //   It is not a completed Form A-1, and it does not file anything. New
  //   Jersey requires the form itself, the filing fee, and service on the
  //   assessor and clerk. What it removes is the two hours somebody otherwise
  //   spends transcribing block and lot numbers, looking up the ratio, finding
  //   comparable sales and doing the Chapter 123 arithmetic by hand.
  //
  //   Every figure carries its source, because a number an attorney cannot
  //   attribute is a number they cannot use.
  //
  // THE ORDER MATTERS
  //
  //   Subject property, then the evidence, then the statutory test, then the
  //   argument. That is the order a board follows, and a packet that arrives
  //   in a different order makes the reader do work.
  // ══════════════════════════════════════════════

  

  

  

  

  

  // ══════════════════════════════════════════════
  // 18 · RELOCATION COMPARISON
  //
  // The same money buys a very different tax bill depending on which side of a
  // town line it lands. Nobody compares this before they move, because the
  // figure a listing shows is the seller's bill on that specific house, not
  // what the town charges for a given amount of value.
  //
  // Everything here runs on data already loaded. No queries.
  // ══════════════════════════════════════════════
  

  

  

  

  

  // ══════════════════════════════════════════════
  // 15 · INVESTOR SCREENER
  //
  // Ranks saved properties on the only measure that compares fairly across
  // town lines: tax per thousand dollars of market value. Two properties at
  // the same price in different municipalities can differ by thousands a year,
  // and assessed value cannot show that because assessment levels differ
  // everywhere.
  // ══════════════════════════════════════════════
  

  // ══════════════════════════════════════════════
  // PROPERTY REPORT
  //
  // Everything the site knows about one property, in one place. The dashboard
  // shows four numbers per property and links here for the rest, which is the
  // right split: a list should stay scannable and a report should go deep.
  // ══════════════════════════════════════════════
  var current = null;
  var municipalTaxEvidence = null;
  var municipalTaxEvidencePin = '';

  function isCommercialProperty(r) {
    var classification = String(r.property_class || r.prop_class || r.class_code || r.classification || '').toLowerCase();
    if (/^4(?:a|b|c)?(?:\b|\s|-)/.test(classification) || /commercial|retail|office|industrial|apartment|mixed.use/.test(classification)) return true;
    if (/^(?:1|2|3|15)(?:\b|\s|-)/.test(classification)) return false;
    var qualified=/_c\d+$/i.test(String(r.pams_pin||'')),range=/^\s*\d+\s*[-–]\s*\d+/.test(String(r.address||''));
    return qualified&&(range||(+r.assessed||0)>=1000000||(+r.last_year_tax||0)>=50000||(+r.lot_sq_ft||0)>=100000);
  }

  function qsPin() {
    var m = window.location.search.match(/[?&]pin=([^&]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  }

  function municipalityCodeFor(r) {
    var pin = String(r && r.pams_pin || '').replace(/[^0-9_]/g, '');
    var code = pin.split('_')[0] || '';
    return /^\d{4}$/.test(code) ? code : '';
  }

  function loadMunicipalTaxEvidence(r) {
    if (!sb || !plUser || !r || !r.pams_pin) return Promise.resolve(null);
    var code = municipalityCodeFor(r);
    if (!code || !r.address) return Promise.resolve(null);
    municipalTaxEvidencePin = r.pams_pin;
    return sb.functions.invoke('municipal-property-tax-evidence', { body: {
      municipality_code: code, address: r.address, block: r.block || '', lot: r.lot || ''
    }}).then(function (result) {
      if (!current || current.pams_pin !== municipalTaxEvidencePin) return null;
      if (result && result.error) throw result.error;
      municipalTaxEvidence = result && result.data && result.data.status === 'exact_match' ? result.data : null;
      return municipalTaxEvidence;
    }).catch(function (error) {
      console.warn('Municipal tax evidence unavailable:', error);
      municipalTaxEvidence = null;
      return null;
    });
  }

  function taxDisplay(r) {
    var e = municipalTaxEvidence && current && municipalTaxEvidencePin === current.pams_pin ? municipalTaxEvidence : null;
    var cur = e && e.current || null;
    var property = e && e.property || null;
    return {
      tax: cur && cur.annual_tax != null ? +cur.annual_tax : (+r.last_year_tax || null),
      taxYear: cur && cur.tax_year || r.last_year_tax_year || null,
      assessed: property && property.total_assessed_value != null ? +property.total_assessed_value : (+r.assessed || null),
      assessmentYear: cur && cur.assessment_year || r.assessment_year || null,
      rate: cur && cur.tax_rate != null ? +cur.tax_rate : null,
      provider: e && e.provider_label || null,
      source: e && e.source && e.source.url || null,
      live: !!e,
      mismatch: !!(cur && cur.revaluation_mismatch)
    };
  }

  function taxTimeline(r) {
    var t = taxDisplay(r), items = [];
    if (t.assessed != null) items.push('<div><small>' + esc(t.assessmentYear ? t.assessmentYear + ' assessment' : 'Current assessment') + '</small><b>' + money(t.assessed) + '</b><em>Official record</em></div>');
    if (t.tax != null) items.push('<div><small>' + esc(t.taxYear ? t.taxYear + ' annual tax' : 'Saved annual tax') + '</small><b>' + money(t.tax) + '</b><em>' + esc(t.live ? 'Municipal bill evidence' : 'Saved state record') + '</em></div>');
    if (t.rate != null) items.push('<div><small>' + esc(t.taxYear ? t.taxYear + ' tax rate' : 'Tax rate') + '</small><b>' + t.rate.toFixed(3) + '%</b><em>Municipal evidence</em></div>');
    if (t.mismatch) items.push('<div><small>Tax-year alignment</small><b>Protected</b><em>Assessment year not inferred from current snapshot</em></div>');
    return '<section class="hm-tax-timeline" style="margin:18px 0;padding:18px;border:1px solid #dfe6ef;border-radius:18px;background:#fff"><div style="display:flex;justify-content:space-between;gap:12px;align-items:start"><div><small style="font-weight:800;letter-spacing:.08em;color:#667085">TAX TIMELINE</small><h2 style="margin:4px 0 2px">Current municipal tax evidence</h2><p style="margin:0;color:#667085">Observed bill, assessment and rate are kept by tax year. Watchdog does not mix a revaluation assessment with an older rate.</p></div>' + (t.source ? '<a href="' + esc(t.source) + '" target="_blank" rel="noopener" style="white-space:nowrap">Official source ↗</a>' : '') + '</div><div class="hm-figs" style="margin-top:14px">' + items.join('') + '</div>' + (t.provider ? '<p style="margin:10px 0 0;color:#667085;font-size:12px">Source: ' + esc(t.provider) + '</p>' : '') + '</section>';
  }

  window.hmSwitch = function (pin) {
    history.replaceState({}, '', '/property/home?pin=' + encodeURIComponent(pin));
    current = rows.filter(function (r) { return r.pams_pin === pin; })[0] || rows[0];
    municipalTaxEvidence = null;
    municipalTaxEvidencePin = current && current.pams_pin || '';
    OPEN = {};
    paintReport();
    paintHomeChrome();
    loadMunicipalTaxEvidence(current).then(function () { paintReport(); paintHomeChrome(); });
  };

  window.hmGlossary = function () {
    plModalNote('Glossary',
      '<div class="gl">' + Object.keys(GLOSSARY).map(function (k) {
        return '<div><b>' + esc(k) + '</b><span>' + GLOSSARY[k] + '</span></div>';
      }).join('') + '</div>');
  };

  var GLOSSARY = {
    'Assessed value':
      'What your municipality says your property is worth for tax purposes. In almost no New Jersey town ' +
      'does this equal market value, which is the source of most confusion about property taxes.',
    'Equalization ratio':
      'The share of true market value that assessments in a town run at. Certified each October by the ' +
      'Director of the Division of Taxation for the following tax year, which means it is priced roughly ' +
      'eighteen months behind the market.',
    'Verified sales ratio':
      'The same measurement, but taken from the state\u2019s SR1A file of sales an assessor confirmed were ' +
      'genuine arm\u2019s length transactions, and from the most recent ones. It usually runs lower than the ' +
      'published ratio in a rising market, and lands closer to what homes actually sell for.',
    'Coefficient of deviation':
      'The average percentage by which individual assessments in a town stray from that town\u2019s own ' +
      'average. Under 15 is the professional standard for residential property. A high coefficient means ' +
      'the town assesses unevenly, which is the condition an appeal argues from.',
    'Chapter 123':
      'The New Jersey statute that governs assessment appeals. It gives every town a 15 percent cushion: ' +
      'your assessment has to exceed the supported figure by more than 15 percent before a county board is ' +
      'required to reduce it.',
    'Supported assessment':
      'Market value multiplied by the town ratio. What your assessment should be if the town applied its own ' +
      'standard to your property.',
    'Effective tax rate':
      'Annual tax divided by market value, rather than by assessed value. The only fair way to compare two ' +
      'properties in different towns.',
    'Stipulated appeal':
      'An appeal settled by agreement with the town before a hearing. It counts as a win, and most successful ' +
      'appeals end this way.',
    'PAMS PIN':
      'The statewide parcel identifier. The first two digits are the county, the next two the municipality, ' +
      'which is how every dataset on this site joins together.'
  };

  function paintReport() {
    var r = current;
    paintHomeChrome();
    if (!r) {
      el('hm-body').innerHTML = '<div class="wrap"><div class="blank"><h3>Nothing saved yet</h3>' +
        '<p>Look up an address and claim it, and its report appears here.</p>' +
        '<a class="db-btn" href="/property/">Look up an address</a></div></div>';
      return;
    }

    var sw = el('hm-switch');
    if (sw) {
      sw.innerHTML = rows.map(function (x) {
        return '<option value="' + esc(x.pams_pin) + '"' + (x.pams_pin === r.pams_pin ? ' selected' : '') +
          '>' + esc(x.address) + (x.kind === 'home' ? '  \u00b7  your home' : '  \u00b7  watchlist') + '</option>';
      }).join('');
    }

    var commercial = isCommercialProperty(r), c = commercial ? null : chapter123(r), u = uniFor(r), a = appealFor(r), s = commercial ? null : sr1aFor(r), taxNow = taxDisplay(r);
    var loc = [r.address, r.town, 'NJ', r.zip].filter(Boolean).join(', ');

    el('hm-body').innerHTML =
      '<header class="hm-hero">' +
        '<div class="hm-hero-in">' +
          '<div class="hm-shot" style="background-image:url(\'https://maps.googleapis.com/maps/api/streetview' +
            '?size=760x460&location=' + encodeURIComponent(loc) + '&fov=76&pitch=6&source=outdoor&key=' +
            GMAPS_KEY + '\')"></div>' +
          '<div class="hm-id">' +
            '<span class="hm-kind' + (commercial ? ' hm-commercial-kind' : '') + '">' + (commercial ? 'Commercial property' : (r.kind === 'home' ? 'Your home' : 'Watchlist')) + '</span>' +
            '<h1>' + esc(r.address) + '</h1>' +
            '<p>' + esc(r.town || '') + (r.county ? ', ' + esc(titleCase(r.county)) + ' County' : '') +
              (r.block ? '  \u00b7  Block ' + esc(r.block) + ' Lot ' + esc(r.lot || '') : '') +
              (r.pams_pin ? '  \u00b7  ' + esc(r.pams_pin) : '') + '</p>' +
            (c ? '<div class="hm-val"><b>' + money(Math.round(c.market / 1000) * 1000) + '</b>' +
              '<span>estimated market value, from ' +
              (c.src === 'verified' ? c.n + ' verified sales in this town' : 'the published town ratio') +
              '</span></div>' : '') +
          '</div>' +
        '</div>' +
      '</header>' +

      '<div class="wrap hm-wrap">' +
        (commercial ? '<section class="hm-commercial-note"><i class="fas fa-building"></i><div><b>Commercial property workspace</b><p>This record is kept separate from homeowner benefit and residential comparable logic. Use the assessment, tax, parcel and diligence data here; confirm valuation and appeal strategy with commercial-specific evidence.</p></div></section>' : '') +
        '<section class="ai">' +
          '<div class="ai-h">' +
            '<img src="/johnprofile.jpg" alt="" onerror="this.style.display=\'none\'">' +
            '<div><b>Watchdog Analyst Intel</b><span>Generated from this property\u2019s records</span></div>' +
          '</div>' +
          summarySentence(r, c, u, a) +
          intelPoints(r, c, u, a) +
        '</section>' +
        '<div class="hm-figs">' +
          hf('property.assessed_value', 'Assessed', money(taxNow.assessed || 0), taxNow.assessmentYear ? taxNow.assessmentYear + ' official assessment' : 'current official assessment') +
          hf('property.annual_tax', 'Annual tax', money(taxNow.tax || 0), taxNow.taxYear ? taxNow.taxYear + ' municipal bill' : 'last saved full year') +
          hf('watchdog.effective_tax_rate', 'Tax rate', taxNow.rate != null ? taxNow.rate.toFixed(3) + '%' : (r.effective_rate ? (+r.effective_rate).toFixed(2) + '%' : '-'), taxNow.rate != null ? 'municipal evidence' : 'saved effective rate') +
          (s ? hf('sales.ratio', 'Town ratio', (s.ratio * 100).toFixed(1) + '%', s.n + ' verified sales') : '') +
          (s && s.ppsf ? hf('sales.ppsf', 'Price per sq ft', '$' + s.ppsf, 'median here', 'hm-detail-metric') : '') +
          (s && s.medPrice ? hf('sales.median_price', 'Median sale', money(s.medPrice), 'in this town', 'hm-detail-metric') : '') +
          (u && Number.isFinite(+u.score) ? hf('watchdog.assessment_uniformity_score', 'Fairness score', (+u.score).toFixed(1) + '/100', '#' + u.stateRank + ' statewide', 'hm-detail-metric') : '') +
        '</div>' +
        taxTimeline(r) +

        (commercial ? '' : scorecard(r)) +
        (typeof toolScoreHistory === 'function' ? toolScoreHistory(r) : '') +
        (typeof toolRealEstateConcierge === 'function' ? toolRealEstateConcierge(r) : '') +

        '<div class="hm-secbar"><div><h2>Explore your property</h2><p>Start with a signal. Open only what matters to you.</p></div>' +
          '<button id="hm-all" onclick="hmExpandAll()"><i class="fas fa-expand"></i> Expand all</button></div>' +

        SECTIONS.map(function (sec) { return sectionShell(sec, r); }).join('') +

        '<div class="hm-acts">' +
          '<a class="db-btn" href="/property/?address=' + encodeURIComponent(loc) + '">Open the full property record</a>' +
          '<button class="tl-btn" onclick="dbAskAbout(\'' + esc(r.address).replace(/'/g, '') + '\')">Contact an agent</button>' +
        '</div>' +
      '</div>';

    initTips();
  }


  // ══════════════════════════════════════════════
  // PAGE STRUCTURE
  //
  // The previous version stacked fourteen tools down one column. Everything was
  // correct and almost nobody would have read past the third. A tax report has
  // two readers who want opposite things: a homeowner wants one sentence and a
  // number, a professional wants every figure at once.
  //
  // So the page opens with a scorecard, then collapses everything. Each closed
  // header carries a one line summary, so the whole page can be scanned without
  // opening anything. Each opened section leads with the plain reading and
  // carries a separate note on why a professional would care. Content is built
  // on open rather than on load, which keeps the first paint fast.
  // ══════════════════════════════════════════════
  var OPEN = {};

  var SECTIONS = [
    {
      k: 'fair', tier: 'standard', cat: 'Assessment', icon: 'fa-scale-balanced', title: 'Is this assessment fair?',
      pro: 'The Chapter 123 test verbatim, then where the excess sits. Land value is close to unarguable; ' +
           'the improvement figure is a judgment about a structure, and judgment is what an appeal contests.',
      build: function (r) {
        var c = chapter123(r);
        return (c && c.testable ? ch123Block(r, c) : untestableBlock(r)) + toolImprovementRatio(r);
      },
      sum: function (r) {
        var c = chapter123(r);
        if (!c || !c.testable) return 'Needs comparable sales to test';
        return c.hasCase ? money(c.over) + ' above the limit' : 'Within the cushion the state allows';
      },
      tone: function (r) {
        var c = chapter123(r);
        return (c && c.testable && c.hasCase) ? 'bad' : (c && c.testable) ? 'good' : '';
      }
    },
    {
      k: 'kept', tier: 'standard', cat: 'Assessment', short: 'Sale, permit and assessment timing', icon: 'fa-arrow-trend-up', title: 'Has the assessment kept up?',
      pro: 'For a buyer this is undisclosed exposure, because the listing shows the seller\u2019s bill. ' +
           'For a seller it is worth knowing before an offer arrives.',
      build: function (r) { return toolReassessRisk(r) + toolAddedOmitted(r); }
    },
    {
      k: 'farmland', tier: 'pro', cat: 'Land use', short: 'Acreage, use, income and rollback screen', icon: 'fa-seedling', title: 'Could farmland assessment apply?',
      pro: 'For rural property, a small change in qualifying acreage, gross sales or continued use can change the assessment basis entirely. This checklist makes the filing requirements and rollback exposure explicit before a client relies on the benefit.',
      build: function (r) { return toolFarmland(r); },
      sum: function (r) {
        var s = typeof farmlandSavedFor === 'function' ? farmlandSavedFor(r) : null;
        return s && s.acres ? s.acres + ' acres entered' : '5-acre, use and gross-sales screen';
      }
    },
    {
      k: 'reval', tier: 'pro', cat: 'Town change', icon: 'fa-tower-broadcast', title: 'Is a revaluation coming?',
      pro: 'A reset redistributes burden across a whole town at once. Knowing which side a client lands on ' +
           'beforehand is the difference between a call they thank you for and one they do not.',
      build: function (r) { return toolRevalRadar(r); },
      sum: function (r) {
        var v = revalRadar(r);
        return v ? 'Pressure ' + v.score + ' of 100' : '';
      }
    },
    {
      k: 'town', tier: 'pro', cat: 'Town health', icon: 'fa-ruler-combined', title: 'How this town assesses',
      pro: 'A high coefficient of deviation means the roll itself is uneven, which strengthens every appeal ' +
           'in the municipality regardless of the individual property.',
      build: function (r) {
        var u = uniFor(r);
        return townIntelligenceCard(r) + budgetPressureCard(r) + (u ? uniBody(r, u) : '') + toolClassMix(r) + toolAbatement(r) + toolExemptPilot(r);
      },
      sum: function (r) {
        var t = townIntelFor(r), u = uniFor(r), b = budgetPressureFor(r);
        return t ? 'Fairness ' + t.score + ', statewide rank #' + t.stateRank + (b ? ', budget pressure ' + b.score + '/100' : '') :
          (u ? 'Uniformity ' + u.score + ' of 100, ' + u.band : '');
      }
    },
    {
      k: 'file', tier: 'pro', cat: 'Appeals', icon: 'fa-gavel', title: 'What happens if you file',
      pro: 'Ten years of county board outcomes, then a printable packet with the comparables and the ' +
           'statutory calculation already assembled.',
      build: function (r) {
        var a = appealFor(r);
        return toolAppealOpportunity(r) + (a ? appealBody(r, a) : '') + toolAppealEvidenceStrength(r) + toolAppealCaseWorkspace(r) + toolAppealPacket(r);
      },
      sum: function (r) {
        var a = appealFor(r);
        return a ? a.latest.win_rate_filed + '% of appeals here won a reduction' : '';
      }
    },
    {
      k: 'owed', tier: 'standard', cat: 'Benefits', short: 'ANCHOR, Stay NJ and Senior Freeze', icon: 'fa-hand-holding-dollar', title: 'Money you may be owed',
      pro: 'ANCHOR, Stay NJ and the Senior Freeze interact in a way most people get wrong. Stay NJ is a ' +
           'top-off rather than an addition, and the Freeze base year is the item that actually compounds.',
      build: function (r) { return toolSeniorBenefits(r); }
    },
    {
      k: 'buy', tier: 'pro', cat: 'Buyer costs', short: 'Closing costs and future tax exposure', icon: 'fa-key', title: 'What a buyer would pay',
      pro: 'Running the buyer\u2019s number before an offer is written avoids the conversation nobody wants ' +
           'after closing.',
      build: function (r) { return toolBuyerCost(r) + toolCollateralEscrowStress(r); }
    },
    {
      k: 'diligence', tier: 'pro_plus', cat: 'Professional diligence', icon: 'fa-shield-halved', title: 'Closing & collateral due diligence',
      pro: 'This is the professional preflight: Watchdog first connects parcel identity, tax, permit, environmental and land evidence into a sourced graph, then exposes the underlying live checks. It is designed to tell counsel, lenders and brokers what deserves source-document review before a closing or credit decision.',
      build: function (r) { return toolTitleEvidenceGraph(r) + toolProfessionalDueDiligence(r) + toolDevelopmentConstraintStack(r) + toolPermitLifecycle(r) + toolProfessionalWorkflows(r); },
      sum: function () { return 'Evidence graph + closing evidence + escrow + lien + NJDEP constraints'; }
    },
    {
      k: 'broker', tier: 'pro', cat: 'Professional intelligence', icon: 'fa-house-circle-check', title: 'Real Estate Professional Intelligence',
      pro: 'A broker-ready layer that condenses assessment, tax, market-confidence and municipal signals into ten attributable client-conversation markers instead of another wall of raw numbers.',
      build: function (r) { return toolRealEstateIntelligence(r) + toolBrokerListingBrief(r); },
      sum: function () { return '10 agent-specific Watchdog markers'; }
    },
    {
      k: 'decision', tier: 'pro_plus', cat: 'Professional intelligence', icon: 'fa-compass-drafting', title: 'Cross-Professional Decision Signals',
      pro: 'These scores compress several independently sourced facts into a consistent triage layer for attorneys, lenders, appraisers, agents and investors while keeping the underlying formula visible.',
      build: function (r) { return toolProfessionalDecisionSignals(r); },
      sum: function () { return '5 new formula-backed professional signals'; }
    },
    {
      k: 'statewide', tier: 'pro', cat: 'Statewide baseline', icon: 'fa-table-cells-large', title: 'How does this town compare statewide?',
      pro: 'The full 2026 MOD-IV roll is condensed into municipal distributions so a professional can see the local baseline without downloading or querying millions of parcel rows.',
      build: function (r) { return toolStatewideModivIntelligence(r); },
      sum: function (r) { return typeof statewideModivSummary === 'function' ? statewideModivSummary(r) : '2026 statewide MOD-IV baseline'; }
    },
    {
      k: 'compare', tier: 'pro', cat: 'Market context', short: 'Tax burden across municipalities', icon: 'fa-route', title: 'Compare against other towns',
      pro: 'Tax per dollar of value is the only measure that travels across municipal lines. Useful for a ' +
           'relocation conversation and for ranking a portfolio.',
      build: function (r) { return toolRelocation(r) + toolInvestorScreen() + toolCarryCostVolatility(r); }
    },
    {
      k: 'trend', tier: 'pro', cat: 'Tax outlook', icon: 'fa-chart-line', title: 'Where is this bill headed?',
      pro: 'Isolates the town\u2019s tax RATE trend from any reassessment or revaluation, so a buyer or ' +
           'seller can see the budget-driven trajectory on its own.',
      build: function (r) { return toolTaxTrajectory(r) + toolTaxPressure(r); },
      sum: function (r) {
        var t = trajectory(r);
        return t ? (t.cagr >= 0 ? '+' : '') + (t.cagr * 100).toFixed(1) + '%/yr' : '';
      }
    },
    {
      k: 'history', tier: 'pro', cat: 'Property history', icon: 'fa-clock-rotate-left', title: 'How has this property changed?',
      pro: 'Watchdog preserves observed assessment and tax snapshots that are not available as a clean parcel history from the state. The timeline separates a changed assessment from a changed bill.',
      build: function (r) { return toolTimeMachine(r); },
      sum: function (r) {
        var pts = typeof propertySnapshotPoints === 'function' ? propertySnapshotPoints(r) : [];
        return pts.length > 1 ? pts.length + ' recorded observations' : 'Baseline is being built';
      }
    }
  ];

  function sectionShell(sec, r) {
    var sum = '', tone = '';
    try { sum = sec.sum ? (sec.sum(r) || '') : ''; } catch (e) {}
    if (!sum) sum = sec.short || '';
    try { tone = sec.tone ? (sec.tone(r) || '') : ''; } catch (e) {}
    var catClass = String(sec.cat || 'Analysis').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    return '<section class="sec2 sec2-cat-' + catClass + ' ' + tone + '" data-min-plan="' + (sec.tier || 'standard') + '" id="sec-' + sec.k + '">' +
      '<button class="sec2-h" onclick="hmToggle(\'' + sec.k + '\')">' +
        '<span class="sec2-icon-tile"><i class="fas ' + sec.icon + ' sec2-i"></i></span>' +
        '<span class="sec2-copy"><small class="sec2-kicker">' + esc(sec.cat || 'Analysis') + '</small><span class="sec2-t">' + sec.title + '</span>' +
        (sum ? '<span class="sec2-s">' + sum + '</span>' : '') + '</span>' +
        '<i class="fas fa-chevron-down sec2-c"></i>' +
      '</button>' +
      '<div class="sec2-b">' +
        '<div class="sec2-pro"><b>Why a professional cares</b><span>' + sec.pro + '</span></div>' +
        '<div id="secb-' + sec.k + '"></div>' +
      '</div></section>';
  }


  var HOME_SECTION_MODULES = {
    fair: ['improvement-ratio'],
    kept: ['reassessment-risk', 'assessment-drift', 'added-omitted-monitor'],
    farmland: ['farmland-qualification'],
    reval: ['revaluation-radar'],
    town: ['town-intelligence', 'municipal-budget-pressure', 'property-class-mix', 'abatement-exposure', 'exempt-pilot-exposure'],
    file: ['appeal-opportunity', 'appeal-packet', 'appeal-evidence-strength', 'appeal-case-workspace'],
    owed: ['senior-benefits'],
    buy: ['buyer-closing-costs', 'collateral-escrow-stress'],
    diligence: ['professional-due-diligence', 'title-evidence-graph', 'development-constraint-stack', 'permit-lifecycle-intelligence', 'professional-workflows'],
    broker: ['real-estate-intelligence', 'broker-listing-brief'],
    decision: ['professional-decision-signals'],
    statewide: ['statewide-modiv-intelligence'],
    compare: ['relocation', 'investor-screen', 'investor-carry-volatility'],
    trend: ['tax-trajectory', 'tax-pressure-simulator'],
    history: ['assessment-drift']
  };

  window.hmToggle = function (k) {
    var accessSection = SECTIONS.filter(function (x) { return x.k === k; })[0];
    if (accessSection && window.NJPTRPlan && !window.NJPTRPlan.can(accessSection.tier || 'standard')) {
      toast((accessSection.tier === 'pro_plus' ? 'Pro+' : 'Pro') + ' access is required in this View As mode');
      return;
    }
    OPEN[k] = !OPEN[k];
    var e = el('sec-' + k);
    if (!e) return;
    e.classList.toggle('open', OPEN[k]);
    if (OPEN[k] && !e.getAttribute('data-built')) {
      var sec = SECTIONS.filter(function (x) { return x.k === k; })[0];
      var host = el('secb-' + k);
      if (sec && host && current) {
        host.innerHTML = '<div class="tl-note"><div class="pl-spin"></div> Loading this analysis...</div>';
        loadHomeTools(HOME_SECTION_MODULES[k] || []).then(function () {
          var html = '';
          try { html = sec.build(current) || ''; }
          catch (err) { console.error('Section build failed:', k, err); html = '<div class="tl-note">This section could not be built for this property.</div>'; }
          host.innerHTML = html || '<div class="tl-note">Nothing to show here for this property.</div>';
          compactHomeSection(host, k);
          e.setAttribute('data-built', '1');
          initTips();
          if (el('tc-total')) window.dbCost();
        }).catch(function (error) {
          console.error('Section module failed:', k, error);
          host.innerHTML = '<div class="tl-note">This analysis could not load. Close and reopen the section to try again.</div>';
        });
      }
    }
  };

  window.hmOpen = function (k) {
    if (!OPEN[k]) window.hmToggle(k);
    var e = el('sec-' + k);
    if (e && e.scrollIntoView) e.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  window.hmExpandAll = function () {
    SECTIONS.forEach(function (x) { if (!OPEN[x.k]) window.hmToggle(x.k); });
    var b = el('hm-all');
    if (b) { b.innerHTML = '<i class="fas fa-compress"></i> Collapse all';
             b.setAttribute('onclick', 'hmCollapseAll()'); }
  };
  window.hmCollapseAll = function () {
    SECTIONS.forEach(function (x) { if (OPEN[x.k]) window.hmToggle(x.k); });
    var b = el('hm-all');
    if (b) { b.innerHTML = '<i class="fas fa-expand"></i> Expand all';
             b.setAttribute('onclick', 'hmExpandAll()'); }
  };

  // ── the scorecard: four numbers, each with a verdict you can act on ──
  function scorecard(r) {
    var c = chapter123(r), u = uniFor(r), a = appealFor(r), s = sr1aFor(r);
    var cards = [];

    if (c) {
      var over = c.testable && c.hasCase;
      cards.push({ k: 'fair', marker: 'watchdog.chapter123_position',
        n: c.testable ? (over ? money(c.over) : 'None') : '\u2014',
        l: 'Over the Chapter 123 limit',
        v: !c.testable ? 'Needs comparable sales to test'
           : over ? (c.saving ? 'Worth about ' + money(c.saving) + ' a year' : 'There is a case here')
           : 'No appeal to make on these numbers',
        tone: over ? 'bad' : c.testable ? 'good' : '' });
    }
    if (u) {
      cards.push({ k: 'town', marker: 'uniformity.score', n: u.score, l: 'Assessment uniformity, of 100',
        v: u.percentile >= 50 ? 'Fairer than ' + u.percentile + '% of New Jersey'
                              : 'Less consistent than ' + (100 - u.percentile) + '% of New Jersey',
        tone: u.score >= 60 ? 'good' : u.score < 35 ? 'bad' : 'mid' });
    }
    if (a) {
      cards.push({ k: 'file', marker: 'appeals.latest_win_rate_filed', n: a.latest.win_rate_filed + '%', l: 'Appeals here that won',
        v: titleCase(a.county) + ' County, ' + a.latest_year,
        tone: a.latest.win_rate_filed >= 50 ? 'good' : a.latest.win_rate_filed < 35 ? 'bad' : 'mid' });
    }
    if (c) {
      cards.push({ k: 'kept', marker: 'watchdog.market_value_estimate', n: money(Math.round(c.market / 1000) * 1000), l: 'Estimated market value',
        v: c.src === 'verified' ? 'From ' + c.n + ' verified sales in this town'
                                : 'From the published town ratio', tone: '' });
    }
    if (!cards.length) return '';

    return '<div class="sc-cards">' + cards.map(function (x) {
      var href = markerHref(x.marker, x.n, x.v);
      return '<article class="sc-c dm-card ' + (x.tone || '') + '" data-marker-id="' + esc(x.marker) + '" data-marker-value="' + esc(x.n) + '" data-marker-note="' + esc(x.v) + '">' +
        '<button class="sc-main" onclick="hmOpen(\'' + x.k + '\')"><b>' + x.n + '</b><span class="sc-l">' + x.l + '</span>' +
        '<span class="sc-v">' + x.v + '</span><span class="sc-go">Open analysis <i class="fas fa-arrow-down"></i></span></button>' +
        '<a class="sc-data" href="' + href + '"><i class="fas fa-circle-info"></i> Data details</a></article>';
    }).join('') + '</div>';
  }

  function markerHref(markerId, value, note) {
    var pin = current && current.pams_pin ? current.pams_pin : '';
    return '/property/marker?id=' + encodeURIComponent(markerId) + '&pin=' + encodeURIComponent(pin) +
      '&value=' + encodeURIComponent(String(value || '')) + '&note=' + encodeURIComponent(String(note || ''));
  }

  function f(k, v, note, cls) {
    return '<div><dt>' + k + '</dt><dd' + (cls ? ' class="' + cls + '"' : '') + '>' + v +
      (note ? '<em>' + note + '</em>' : '') + '</dd></div>';
  }


  // The paragraph gives the shape. These are the things an agent would actually
  // say out loud, and only the ones this property earns.
  function intelPoints(r, c, u, a) {
    var p = [];
    if (c && c.testable && c.hasCase) {
      p.push(['fa-scale-unbalanced-flip', 'bad',
        'There is an argument here. The assessment is above the Chapter 123 limit' +
        (c.saving ? ' and a reduction is worth about ' + money(Math.round(c.saving)) + ' a year' : '') + '.']);
    }
    if (u && u.coefficient > 20) {
      p.push(['fa-ruler-combined', 'bad',
        'The town assesses unevenly, at a coefficient of ' + u.coefficient +
        ' against a standard of 15. That inconsistency is what an appeal argues from.']);
    } else if (u && u.coefficient < 10) {
      p.push(['fa-ruler-combined', 'good',
        'The town assesses tightly, at a coefficient of ' + u.coefficient +
        '. A board here will be harder to persuade, because the roll is defensible.']);
    }
    if (a && a.latest && a.latest.win_rate_filed >= 50) {
      p.push(['fa-gavel', 'good',
        titleCase(a.county) + ' County reduced ' + a.latest.win_rate_filed +
        '% of the appeals filed last year. That is a receptive board.']);
    } else if (a && a.latest && a.latest.win_rate_filed < 35) {
      p.push(['fa-gavel', 'bad',
        titleCase(a.county) + ' County reduced only ' + a.latest.win_rate_filed +
        '% of appeals filed last year. Bring real evidence or do not file.']);
    }
    if (a && a.trend && Math.abs(a.trend) >= 8) {
      p.push(['fa-arrow-trend-' + (a.trend > 0 ? 'up' : 'down'), a.trend > 0 ? 'good' : 'bad',
        'Appeal success in this county has moved ' + (a.trend > 0 ? 'up ' : 'down ') +
        Math.abs(a.trend) + ' points over ten years.']);
    }
    var s = sr1aFor(r), own = s ? ownLag(r, s.ratio) : null;
    if (own && own.behind && own.cls === 'stale') {
      p.push(['fa-arrow-trend-up', 'bad',
        'The assessment has not caught up with the ' + own.year + ' sale. Roughly ' +
        money(Math.round(own.gap)) + ' of assessed value is unbooked, and it will land eventually.']);
    }
    if (own && own.ahead) {
      p.push(['fa-file-signature', 'good',
        'It sold below its own assessed level in ' + own.year +
        '. Your own arm\u2019s length sale is stronger evidence than any comparable.']);
    }
    var bp = typeof budgetPressureAgentPoint === 'function' ? budgetPressureAgentPoint(r) : null;
    if (bp && (bp.band === 'high' || bp.band === 'elevated')) {
      p.push(['fa-building-columns', 'bad',
        'Municipal budget pressure is ' + bp.band + ' at ' + bp.score + '/100. ' + bp.text]);
    } else if (bp && bp.band === 'low') {
      p.push(['fa-building-columns', 'good',
        'Municipal budget pressure is currently low at ' + bp.score + '/100. ' + bp.text]);
    }
    if (r.verify_level !== 'mail' && r.kind === 'home') {
      p.push(['fa-badge-check', '',
        'Ownership is not verified on this one yet, which is worth doing before anything is filed. <a class="ai-verify-action" href="/property/dashboard#profile">Verify ownership</a>']);
    }
    if (!p.length) return '';
    return '<ul class="ai-pts">' + p.map(function (x) {
      return '<li class="' + x[1] + '"><i class="fas ' + x[0] + '"></i><span>' + x[2] + '</span></li>';
    }).join('') + '</ul>';
  }

  function hf(markerId, k, v, sub, extraClass) {
    var href = markerHref(markerId, v, sub);
    return '<a class="dm ' + (extraClass || '') + '" href="' + href + '" data-marker-id="' + esc(markerId) + '" data-marker-value="' + esc(v) + '" data-marker-note="' + esc(sub) + '"><dt>' + k + '<i class="fas fa-circle-info dm-info"></i></dt><dd>' + v + '<em>' + sub + '</em></dd></a>';
  }

  function summarySentence(r, c, u, a) {
    var p = [];
    p.push('<b>' + esc(r.address) + '</b> is assessed at <b>' + money(r.assessed || 0) + '</b>');
    if (r.last_year_tax) p.push(' and taxed <b>' + money(r.last_year_tax) + '</b> a year');
    p.push('. ');
    if (c) {
      p.push(c.src === 'verified'
        ? 'Sales in ' + esc(r.town) + ' that New Jersey verified as genuine put assessments there at <b>' +
          (c.ratio * 100).toFixed(1) + '%</b> of market, implying a value around <b>' +
          money(Math.round(c.market / 1000) * 1000) + '</b>. '
        : 'At the published ratio that implies about <b>' + money(Math.round(c.market / 1000) * 1000) + '</b>. ');
    }
    if (u) {
      p.push('The town scores <b>' + u.score + '</b> for assessment uniformity, ' +
        (u.percentile >= 50 ? 'better than ' + u.percentile + '% of New Jersey'
                            : 'behind ' + (100 - u.percentile) + '% of New Jersey') + '. ');
    }
    if (c && c.testable && c.hasCase) {
      p.push('<span class="hm-flag">The assessment sits ' + money(c.over) +
        ' above the Chapter 123 limit' + (c.saving ? ', worth about ' + money(c.saving) + ' a year' : '') + '.</span>');
    } else if (c && c.testable) {
      p.push('Against ' + c.basis + ' it sits inside the cushion the state allows.');
    }
    return '<p class="hm-lede">' + p.join('') + '</p>';
  }

  function ch123Block(r, c) {
    return toolCard('Chapter 123 analysis', 'fa-scale-balanced',
      '<p class="tl-p">This is the test a county board applies. Your assessment has to exceed the supported ' +
      'figure by more than 15 percent before a reduction is required.</p>' +
      '<dl class="fig">' +
        f('Market value', money(Math.round(c.indep)), 'from ' + c.basis) +
        f('Supported assessment', money(Math.round(c.fair))) +
        f('Chapter 123 limit', money(Math.round(c.limit))) +
        f(c.hasCase ? 'Over by' : 'Under by', money(Math.abs(Math.round(c.over))), null,
          c.hasCase ? 'neg' : 'pos') +
        (c.saving ? f('If reduced', money(Math.round(c.saving)) + '/yr') : '') +
      '</dl>');
  }

  function untestableBlock(r) {
    return toolCard('Chapter 123 analysis', 'fa-scale-balanced',
      '<p class="tl-p">An appeal is argued against comparable sales, not against the town ratio. Deriving a ' +
      'market value from the assessment and then testing the assessment against it would be circular, so this ' +
      'stays blank until there is independent evidence.</p>' +
      '<a class="tl-btn" href="/property/?address=' +
      encodeURIComponent([r.address, r.town, 'NJ', r.zip].filter(Boolean).join(', ')) +
      '">Open the full record to run it</a>');
  }

  function paintHomeChrome() {
    if (!plUser) return;
    var m = meta();
    var displayName = name() || '';
    var avatar = el('hm-avatar');
    if (avatar) {
      var photo = m.avatar_url || m.picture;
      avatar.innerHTML = photo
        ? '<img src="' + esc(photo) + '" alt="">'
        : '<div class="db-noav">' + esc((displayName || '?').charAt(0).toUpperCase()) + '</div>';
    }
    var heading = el('hm-hi');
    if (heading) heading.textContent = current && current.address ? current.address : 'Your property report';
    var email = el('hm-email');
    if (email) email.textContent = plUser.email || '';
    var stat = el('hm-stat');
    if (stat) {
      stat.innerHTML = current
        ? '<span>' + esc(current.town || 'New Jersey') + '</span>' +
          (current.last_year_tax ? '<span>' + money(current.last_year_tax) + ' yearly tax</span>' : '') +
          '<span>' + (current.kind === 'home' ? 'Your home' : 'Watchlist') + '</span>'
        : '<span>' + rows.length + ' saved ' + (rows.length === 1 ? 'property' : 'properties') + '</span>';
    }
  }

  window.hmToggleSidebar = function () {
    if (window.matchMedia && window.matchMedia('(max-width: 760px)').matches) return;
    document.body.classList.toggle('db-sidebar-expanded');
    var expanded = document.body.classList.contains('db-sidebar-expanded');
    try { localStorage.setItem('watchdogSidebarExpanded', expanded ? '1' : '0'); } catch (e) {}
    paintHomeSidebarToggle();
  };

  function paintHomeSidebarToggle() {
    var button = el('db-sidebar-toggle');
    if (!button) return;
    var expanded = document.body.classList.contains('db-sidebar-expanded');
    button.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    button.setAttribute('aria-label', expanded ? 'Collapse navigation' : 'Expand navigation');
    var icon = button.querySelector('i');
    var label = button.querySelector('span');
    if (icon) icon.className = 'fas fa-angles-' + (expanded ? 'left' : 'right');
    if (label) label.textContent = expanded ? 'Collapse navigation' : 'Expand navigation';
  }

  window.hmAgentIntel = function () {
    var panel = document.querySelector('#hm-body .ai');
    var mobile = window.matchMedia && window.matchMedia('(max-width: 760px)').matches;
    if (mobile && panel) {
      var overlay = el('hm-mobile-intel-overlay'), content = el('hm-mobile-intel-content');
      if (!overlay || !content) return;
      content.innerHTML = panel.outerHTML.replace('class="ai"', 'class="ai ai-mobile"')
        .replace('<b>Watchdog Analyst Intel</b>', '<b id="hm-mobile-intel-title">Watchdog Analyst Intel</b>');
      overlay.classList.add('open'); overlay.setAttribute('aria-hidden', 'false');
      document.body.classList.add('mobile-intel-open');
      document.querySelectorAll('.db-side-mobile .pn').forEach(function (n) { n.classList.remove('on'); });
      document.querySelectorAll('.db-side-mobile .intel-nav').forEach(function (n) { n.classList.add('on'); });
      var close = overlay.querySelector('.mobile-intel-close'); if (close) close.focus();
      return;
    }
    if (panel && panel.scrollIntoView) panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  window.hmIntelClose = function () {
    var overlay = el('hm-mobile-intel-overlay'); if (!overlay) return;
    overlay.classList.remove('open'); overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('mobile-intel-open');
    document.querySelectorAll('.db-side-mobile .intel-nav').forEach(function (n) { n.classList.remove('on'); });
    document.querySelectorAll('.db-side-mobile [data-nav-page="home"]').forEach(function (n) { n.classList.add('on'); });
  };

  window.hmScrollTop = function () {
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
  };

  function initHomeChrome() {
    try {
      if (localStorage.getItem('watchdogSidebarExpanded') === '1' &&
          !(window.matchMedia && window.matchMedia('(max-width: 760px)').matches)) {
        document.body.classList.add('db-sidebar-expanded');
      }
    } catch (e) {}
    paintHomeSidebarToggle();
    var queued = false;
    window.addEventListener('scroll', function () {
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () {
        queued = false;
        var button = el('db-to-top');
        if (button) button.classList.toggle('show', window.scrollY > 850);
      });
    }, { passive: true });
  }

  // Per property versions of the two tools that used to run once for rows[0].
  function toolUniformityFor(r) { var s = uniFor(r); return s ? uniBody(r, s) : ''; }
  function toolAppealOddsFor(r) { var a = appealFor(r); return a ? appealBody(r, a) : ''; }

  // ── boot ──
  function bootHome() {
    if (!getClient()) { setTimeout(bootHome, 120); return; }
    sb.auth.getSession().then(function (res) {
      plUser = (res && res.data && res.data.session) ? res.data.session.user : null;
      if (!plUser) {
        el('hm-loading').style.display = 'none';
        el('hm-gate').style.display = '';
        return;
      }
      el('hm-loading').style.display = 'none';
      el('hm-gate').style.display = 'none';
      el('hm-main').style.display = '';
      // Home's first paint must depend only on account/property data.
      // Analysis tools remain lazy and isolated so a missing optional module
      // can never blank the saved-property report.
      Promise.all([
        sb.from('saved_properties').select('*').order('created_at', { ascending: false }),
        sb.from('profiles').select('*').eq('id', plUser.id).maybeSingle(),
        sb.rpc('get_my_entitlement'),
        loadRefData().catch(function(){ return null; }),
        loadSR1A().catch(function(){ return null; })
      ]).then(function (out) {
        rows = (out[0] && out[0].data) || [];
        profile = (out[1] && out[1].data) || {};
        var entRows = (out[2] && out[2].data) || [], ent = Array.isArray(entRows) ? entRows[0] : entRows;
        if (ent) profile = Object.assign({}, profile, { account_role: ent.account_role || profile.account_role, plan_tier: ent.plan_tier || profile.plan_tier, subscription_status: ent.subscription_status, current_period_end: ent.current_period_end });
        if (window.NJPTRPlan) window.NJPTRPlan.init(plUser, profile);
        var pin = qsPin();
        current = (pin && rows.filter(function (x) { return x.pams_pin === pin; })[0]) ||
                  rows.filter(function (x) { return x.kind === 'home'; })[0] || rows[0];
        paintHomeChrome();
        paintReport();
        loadMunicipalTaxEvidence(current).then(function () { paintReport(); paintHomeChrome(); });
        if (location.hash.indexOf('#sec-') === 0) {
          var sectionKey = location.hash.slice(5);
          if (SECTIONS.some(function (section) { return section.k === sectionKey; })) window.hmToggle(sectionKey);
        }
        // square footage, year built and the last verified sale come from the
        // SR1A county file, which is too large to block the first paint on.
        hydrateDetails().then(function () { paintReport(); paintHomeChrome(); });
      }).catch(function (error) {
        console.error('Property report workspace failed:', error);
        el('hm-body').innerHTML = '<div class="wrap"><div class="db-error-panel"><i class="fas fa-triangle-exclamation"></i>' +
          '<div><h3>We could not finish loading this property report.</h3><p>Your saved information has not been changed.</p>' +
          '<button class="db-btn" onclick="location.reload()">Try again</button></div></div></div>';
      });
    }).catch(function (error) {
      console.error('Property report session failed:', error);
      el('hm-loading').style.display = 'none';
      el('hm-gate').style.display = '';
    });
  }
  function startHome() {
    Promise.resolve(window.njptrSideMenuReady).then(function () {
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootHome, { once: true });
      else bootHome();
    });
  }
  initHomeChrome();
  document.addEventListener('njptr:plan-change', function () {
    if (current) paintReport();
  });
  startHome();
  Object.assign(window, { el, money, esc, toast, getClient, meta, name, xfetch, median, loadRefData, ratioFor, rateHistory, loadSR1A, sr1aFor, marketValue, chapter123, countySales, hydrateDetails, detailLine, addedOn, mv, sortControl, propMenu, byId, propUrl, isPro, locked, uniBody, appealBody, tip, metricStrip, cell, titleCase, reportLink, initTips, toolCard, qsPin, paintReport, sectionShell, scorecard, f, intelPoints, hf, summarySentence, ch123Block, untestableBlock, paintHomeChrome, paintHomeSidebarToggle, initHomeChrome, toolUniformityFor, toolAppealOddsFor, bootHome, startHome });
  [
    ['plUser', function () { return plUser; }],
    ['rows', function () { return rows; }],
    ['profile', function () { return profile; }],
    ['ratios', function () { return ratios; }],
    ['rates', function () { return rates; }],
    ['sr1a', function () { return sr1a; }],
    ['NJ_PARCEL', function () { return NJ_PARCEL; }],
    ['GREENTREE_URL', function () { return GREENTREE_URL; }]
  ].forEach(function (entry) {
    Object.defineProperty(window, entry[0], { configurable: true, get: entry[1] });
  });

})();


/* ===== property/js/dashboard/home/home-2027.js ===== */
/* Watchdog Property Home 2027 chrome.
   Dashboard-matched navigation, notifications, profile controls and live property weather.
   The property intelligence engine remains in /property/js/dashboard/home/index.js. */
(function(){
'use strict';
if(window.__WATCHDOG_HOME_2027__) return;
window.__WATCHDOG_HOME_2027__=true;

function ensureAccessibleHeading(){
  if(document.getElementById('hm-accessible-title'))return;
  var main=document.getElementById('hm-main');
  if(!main)return;
  var h=document.createElement('h1');
  h.id='hm-accessible-title';
  h.textContent='Property Home';
  h.style.position='absolute';
  h.style.width='1px';
  h.style.height='1px';
  h.style.padding='0';
  h.style.margin='-1px';
  h.style.overflow='hidden';
  h.style.clip='rect(0,0,0,0)';
  h.style.whiteSpace='nowrap';
  h.style.border='0';
  main.insertBefore(h,main.firstChild);
}
function mountSharedFooter(){
  var current=document.getElementById('wd-property-footer');
  if(!current||current.dataset.sharedFooter==='1')return;
  fetch('/property/partials/footer.html',{credentials:'same-origin'}).then(function(r){if(!r.ok)throw new Error(String(r.status));return r.text();}).then(function(html){
    var shell=document.createElement('div');shell.innerHTML=html;
    var next=shell.querySelector('#wd-property-footer');
    if(!next)throw new Error('shared footer missing');
    next.dataset.sharedFooter='1';
    current.replaceWith(next);
    var year=next.querySelector('#wdf-current-year');if(year)year.textContent=new Date().getFullYear();
  }).catch(function(){var year=current.querySelector('#wdf-current-year');if(year)year.textContent=new Date().getFullYear();});
}
function hydrateStaticChrome(){ensureAccessibleHeading();mountSharedFooter();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',hydrateStaticChrome,{once:true});else hydrateStaticChrome();

var URL='https://uvkvaxljhhngydvlrzom.supabase.co';
var KEY='sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa';
if(!window.supabase) return;
var db=window.supabase.createClient(URL,KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce',storageKey:'sb-uvkvaxljhhngydvlrzom-auth-token'}});
var user=null,profile={},property=null,events=[],weatherToken=0,weatherTimer=null;
var READ_KEY='watchdogHomeNotificationsReadAtV2';

function esc(v){return String(v==null?'':v).replace(/[&<>\"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]});}
function valid(v){if(v==null||v==='')return null;v=Number(v);return Number.isFinite(v)?v:null;}
function isNj(lat,lon){return lat>=38.8&&lat<=41.4&&lon>=-75.8&&lon<=-73.7;}
function pretty(v){return String(v||'Property update').replace(/[._-]/g,' ').replace(/\b\w/g,function(c){return c.toUpperCase();});}
function when(v){var d=new Date(v);if(!Number.isFinite(d.getTime()))return'';return d.toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});}
function getReadAt(){try{return localStorage.getItem(READ_KEY)||'';}catch(_){return'';}}
function setReadAt(){try{localStorage.setItem(READ_KEY,new Date().toISOString());}catch(_){}paintNotifications();}

function paintDate(){var d=new Date(),date=document.getElementById('hm27-date-label'),day=document.getElementById('hm27-day-label');if(date)date.textContent=d.toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'});if(day)day.textContent=d.toLocaleDateString('en-US',{weekday:'long'});}
function firstName(){var m=user&&user.user_metadata||{};var n=profile.display_name||profile.full_name||m.full_name||m.name||(user&&user.email||'').split('@')[0]||'there';return String(n).split(/\s+/)[0];}
function avatarUrl(){var m=user&&user.user_metadata||{};return profile.avatar_url||m.avatar_url||m.picture||'';}
function paintAvatar(){var host=document.getElementById('hm27-avatar');if(!host)return;var url=avatarUrl();host.innerHTML=url?'<img src="'+esc(url)+'" alt="">':'<span class="hm27-avatar-fallback">'+esc(firstName().charAt(0).toUpperCase())+'</span>';}
function planLabel(){var p=String(profile.plan_tier||profile.plan||'standard').toLowerCase().replace('_plus','+');if(profile.account_role==='developer')return'Developer';return p==='standard'?'Standard':p.replace(/\b\w/g,function(c){return c.toUpperCase();});}

function nav(){return document.getElementById('hm27-nav');}
function navOpen(open){var n=nav();if(!n)return;n.classList.toggle('open',!!open);n.setAttribute('aria-hidden',open?'false':'true');document.body.classList.toggle('hm-nav-open',!!open);}
window.hmToggleSidebar=function(){var n=nav();navOpen(!(n&&n.classList.contains('open')));};

function ensurePopovers(){
  if(!document.getElementById('hm27-profile-pop')){var p=document.createElement('aside');p.id='hm27-profile-pop';p.className='hm27-pop';document.body.appendChild(p);}
  if(!document.getElementById('hm27-notice-pop')){var n=document.createElement('aside');n.id='hm27-notice-pop';n.className='hm27-pop hm27-notice-pop';document.body.appendChild(n);}
}
function paintProfile(){ensurePopovers();var p=document.getElementById('hm27-profile-pop');if(!p||!user)return;p.innerHTML='<header><span><b>'+esc(profile.display_name||profile.full_name||firstName())+'</b><small>'+esc(user.email||'')+'</small></span><small>'+esc(planLabel())+'</small></header><nav>'+
'<a href="/property/account"><i class="fas fa-user-pen"></i><span><b>Edit profile & role</b><small>Profile, profession and preferences</small></span></a>'+
'<button class="hm27-menu-row" type="button" data-hm27="invite"><i class="fas fa-user-plus"></i><span><b>Invite others</b><small>Share Watchdog with someone</small></span></button>'+
'<a href="/property/account"><i class="fas fa-credit-card"></i><span><b>Account & billing</b><small>Plan, subscription and billing</small></span></a>'+
'<a href="/property/home"><i class="fas fa-house"></i><span><b>Property Home</b><small>Single-property intelligence</small></span></a>'+
'</nav><button class="hm27-pop-signout" type="button" data-hm27="signout"><i class="fas fa-arrow-right-from-bracket"></i> Sign out</button>';}
function unreadCount(){var read=getReadAt()?new Date(getReadAt()).getTime():0;return events.filter(function(x){return(new Date(x.occurred_at).getTime()||0)>read;}).length;}
function iconFor(e){var t=String(e.event_type||e.marker_id||'').toLowerCase(),s=String(e.severity||'').toLowerCase();if(/high|critical/.test(s))return'fa-triangle-exclamation';if(/tax|assessment/.test(t))return'fa-receipt';if(/market|value/.test(t))return'fa-chart-line';if(/permit/.test(t))return'fa-hammer';return'fa-house';}
function paintNotifications(){
  ensurePopovers();var p=document.getElementById('hm27-notice-pop');if(!p)return;
  var read=getReadAt()?new Date(getReadAt()).getTime():0,u=unreadCount();
  p.innerHTML='<header><span><b>Notifications</b><small>'+(u?u+' unread':'You’re caught up')+'</small></span><button class="hm27-read" type="button" data-hm27="read-all">Read all</button></header>'+
  '<div class="hm27-notice-list">'+(events.length?events.slice(0,24).map(function(e){var unread=(new Date(e.occurred_at).getTime()||0)>read;return'<a class="hm27-notice '+(unread?'unread':'')+'" href="/property/pulse"><i class="fas '+iconFor(e)+'"></i><span><b>'+esc(e.title||pretty(e.event_type||e.marker_id))+'</b><small>'+esc(property&&property.address||'Current property')+'</small><em>'+esc(when(e.occurred_at))+'</em></span>'+(unread?'<u></u>':'')+'</a>';}).join(''):'<div class="hm27-notice-empty"><i class="far fa-bell-slash"></i><b>No notifications yet</b><small>Watchdog property changes will appear here.</small></div>')+'</div>'+
  '<a class="hm27-notice-foot" href="/property/pulse">Open Change Intelligence <i class="fas fa-arrow-right"></i></a>';
  var badge=document.getElementById('hm27-notify-badge');if(badge){badge.textContent=Math.min(99,u);badge.hidden=!u;}
}
function togglePop(id){ensurePopovers();['hm27-profile-pop','hm27-notice-pop'].forEach(function(x){var p=document.getElementById(x);if(p)p.classList.toggle('open',x===id?!p.classList.contains('open'):false);});}
function closePops(){document.querySelectorAll('.hm27-pop.open').forEach(function(p){p.classList.remove('open');});}

function resolvePin(){var u=new URL(location.href),p=u.searchParams.get('pin');if(p)return p;var s=document.getElementById('hm-switch');return s&&s.value?s.value:'';}
function querySavedProperty(pin){
  var q=db.from('saved_properties').select('id,user_id,pams_pin,kind,address,town,county,zip,lat,lon').order('created_at',{ascending:false});
  if(user&&user.id)q=q.eq('user_id',user.id);if(pin)q=q.eq('pams_pin',pin);return q.limit(1).maybeSingle();
}
function loadCurrentProperty(){
  var pin=resolvePin();return querySavedProperty(pin).then(function(r){
    if(r&&r.error&&user&&user.id){var q=db.from('saved_properties').select('id,pams_pin,kind,address,town,county,zip,lat,lon').order('created_at',{ascending:false});if(pin)q=q.eq('pams_pin',pin);return q.limit(1).maybeSingle();}
    return r;
  }).then(function(r){property=r&&r.data||null;if(!property)return;var lat=valid(property.lat),lon=valid(property.lon);if(lat!=null&&lon!=null&&isNj(lat,lon))return;return db.from('property_lookups').select('lat,lon').eq('pams_pin',property.pams_pin).maybeSingle().then(function(x){var row=x&&x.data||{},a=valid(row.lat),b=valid(row.lon);if(a!=null&&b!=null&&isNj(a,b)){property.lat=a;property.lon=b;}});});
}
function loadEvents(){
  if(!property||!property.pams_pin){events=[];paintNotifications();return Promise.resolve();}
  return db.from('property_update_events').select('pams_pin,event_type,severity,title,occurred_at,marker_id').eq('pams_pin',property.pams_pin).order('occurred_at',{ascending:false}).limit(80).then(function(r){events=r&&Array.isArray(r.data)?r.data:[];paintNotifications();}).catch(function(){events=[];paintNotifications();});
}

function weatherCode(code){
  code=Number(code);if(code===0)return{label:'Clear',icon:'fa-sun'};if(code===1)return{label:'Mostly clear',icon:'fa-sun'};if(code===2)return{label:'Partly cloudy',icon:'fa-cloud-sun'};if(code===3)return{label:'Cloudy',icon:'fa-cloud'};if(code===45||code===48)return{label:'Fog',icon:'fa-smog'};if(code>=51&&code<=67)return{label:'Rain',icon:'fa-cloud-rain'};if(code>=71&&code<=77)return{label:'Snow',icon:'fa-snowflake'};if(code>=80&&code<=82)return{label:'Showers',icon:'fa-cloud-showers-heavy'};if(code>=95)return{label:'Thunderstorms',icon:'fa-cloud-bolt'};return{label:'Local conditions',icon:'fa-cloud-sun'};
}
function setWeather(temp,label,icon){var t=document.getElementById('hm27-weather-temp'),l=document.getElementById('hm27-weather-label'),i=document.getElementById('hm27-weather-icon');if(t)t.textContent=temp!=null?Math.round(temp)+'°F':'Weather';if(l)l.textContent=label||'Local conditions';if(i)i.className='fas '+(icon||'fa-cloud-sun');}
function fetchWithTimeout(url,ms){var ctl=typeof AbortController!=='undefined'?new AbortController():null,t=ctl?setTimeout(function(){ctl.abort();},ms||8000):null;return fetch(url,{signal:ctl?ctl.signal:undefined}).then(function(r){if(t)clearTimeout(t);if(!r.ok)throw new Error(String(r.status));return r.json();},function(e){if(t)clearTimeout(t);throw e;});}
function loadWeather(){
  if(!property)return Promise.resolve();var lat=valid(property.lat),lon=valid(property.lon);if(lat==null||lon==null||!isNj(lat,lon)){setWeather(null,'Local conditions','fa-cloud-sun');return Promise.resolve();}
  var token=++weatherToken;setWeather(null,'Loading conditions','fa-cloud-sun');
  var openMeteo='https://api.open-meteo.com/v1/forecast?latitude='+lat.toFixed(4)+'&longitude='+lon.toFixed(4)+'&current=temperature_2m,weather_code&temperature_unit=fahrenheit&timezone=auto';
  return fetchWithTimeout(openMeteo,8000).then(function(j){if(token!==weatherToken)return;var c=j&&j.current||{},temp=valid(c.temperature_2m);if(temp==null)throw new Error('no current temperature');var w=weatherCode(c.weather_code);setWeather(temp,w.label,w.icon);}).catch(function(){
    return fetchWithTimeout('https://api.weather.gov/points/'+lat.toFixed(4)+','+lon.toFixed(4),8000).then(function(point){if(token!==weatherToken)return;var u=point&&point.properties&&point.properties.forecastHourly;if(!u)throw new Error('no forecast');return fetchWithTimeout(u,8000);}).then(function(j){if(token!==weatherToken)return;var p=j&&j.properties&&j.properties.periods&&j.properties.periods[0];if(!p)throw new Error('no period');var text=String(p.shortForecast||'Local conditions').toLowerCase(),icon=/thunder/.test(text)?'fa-cloud-bolt':/snow/.test(text)?'fa-snowflake':/rain|shower/.test(text)?'fa-cloud-rain':/cloud/.test(text)?'fa-cloud-sun':'fa-sun';setWeather(valid(p.temperature),p.shortForecast||'Local conditions',icon);}).catch(function(){setWeather(null,'Local conditions','fa-cloud-sun');});
  });
}

function shareInvite(){var code=user?'WD-'+String(user.id).replace(/-/g,'').slice(0,10).toUpperCase():'WATCHDOG',link=location.origin+'/property/?ref='+encodeURIComponent(code);if(navigator.share){navigator.share({title:'Watchdog Property Intelligence',text:'Take a look at Watchdog Property Intelligence.',url:link}).catch(function(){});}else if(navigator.clipboard){navigator.clipboard.writeText(link).then(function(){alert('Invite link copied.');});}}
function refreshContext(){return loadCurrentProperty().then(function(){return Promise.all([loadEvents(),loadWeather()]);});}

function bind(){
  var menu=document.getElementById('hm27-menu');if(menu)menu.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();closePops();navOpen(true);});
  var profileBtn=document.getElementById('hm27-profile');if(profileBtn)profileBtn.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();togglePop('hm27-profile-pop');});
  var notify=document.getElementById('hm27-notify');if(notify)notify.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();paintNotifications();togglePop('hm27-notice-pop');});
  document.addEventListener('click',function(ev){
    var action=ev.target.closest&&ev.target.closest('[data-hm27]');if(action){var a=action.dataset.hm27;if(a==='nav-close')navOpen(false);else if(a==='read-all')setReadAt();else if(a==='invite')shareInvite();else if(a==='signout')db.auth.signOut().then(function(){location.href='/property/';});ev.preventDefault();return;}
    if(!ev.target.closest('.hm27-pop')&&!ev.target.closest('#hm27-profile')&&!ev.target.closest('#hm27-notify'))closePops();
  });
  document.addEventListener('keydown',function(ev){if(ev.key==='Escape'){closePops();navOpen(false);}});
  document.addEventListener('change',function(ev){if(ev.target&&ev.target.id==='hm-switch'){setTimeout(refreshContext,120);}});
}

function boot(){
  hydrateStaticChrome();paintDate();ensurePopovers();bind();
  db.auth.getSession().then(function(r){var s=r&&r.data&&r.data.session;if(!s||!s.user)return;user=s.user;return db.from('profiles').select('display_name,full_name,avatar_url,plan,plan_tier,account_role').eq('id',user.id).maybeSingle();}).then(function(r){if(r&&r.data)profile=r.data;paintAvatar();paintProfile();return refreshContext();}).catch(function(){paintNotifications();});
  weatherTimer=setInterval(function(){if(!document.hidden)loadWeather();},10*60*1000);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();


/* ===== property/js/dashboard/home/home-menu-sync.js ===== */
/* Property Home intelligence bootstrap.
   Navigation is owned exclusively by /property/js/watchdog-universal-menu.js.
   This compatibility loader remains only for Home intelligence assets. */
(function(){
  'use strict';
  if(window.__WATCHDOG_HOME_MENU_SYNC__) return;
  window.__WATCHDOG_HOME_MENU_SYNC__=true;
  function loadScript(src){
    if(document.querySelector('script[src="'+src+'"]')) return Promise.resolve();
    return new Promise(function(resolve,reject){var s=document.createElement('script');s.src=src;s.async=false;s.onload=resolve;s.onerror=function(){reject(new Error('Could not load '+src));};document.head.appendChild(s);});
  }
  function loadPropertyVisual(){
    return loadScript('/property/js/dashboard/home/home-property-visual.js?v=20260827b')
      .then(function(){return loadScript('/property/js/dashboard/home/home-property-visual-guarantee.js?v=20260827b');})
      .catch(function(error){console.warn('Watchdog Home property visual unavailable:',error&&error.message||error);});
  }
  function loadLiveFix(){return loadScript('/property/js/dashboard/home/home-live-fix-20260824.js?v=20260824d').catch(function(error){console.warn('Watchdog Home live fix unavailable:',error&&error.message||error);});}
  function loadUntestableSupport(){return loadScript('/property/js/dashboard/home/untestable-support.js?v=20260828a').catch(function(error){console.warn('Watchdog Home support guidance unavailable:',error&&error.message||error);});}
  function loadIntelligenceRuntime(){var assets=['/property/js/watchdog-intelligence-context.js','/property/js/watchdog-semantic-context.js','/property/js/watchdog-page-context.js','/property/js/watchdog-home-semantic-bridge.js','/property/js/watchdog-context-feedback.js','/property/js/dashboard/home/watchdog-analyst-intel-loader.js','/property/js/watchdog-intelligence-density.js','/property/js/dashboard/home/watchdog-data-graph.js','/property/js/watchdog-today-nav.js'];return assets.reduce(function(chain,src){return chain.then(function(){return loadScript(src);});},Promise.resolve()).catch(function(error){console.warn('Watchdog Home Intelligence runtime unavailable:',error&&error.message||error);});}
  function refreshUniversalMenu(){if(window.WatchdogUniversalMenu&&typeof window.WatchdogUniversalMenu.refresh==='function')window.WatchdogUniversalMenu.refresh();}
  function boot(){loadPropertyVisual();loadLiveFix();loadUntestableSupport();refreshUniversalMenu();document.addEventListener('watchdog:universal-menu-ready',refreshUniversalMenu,{once:true});var startIntelligence=function(){loadIntelligenceRuntime();};if('requestIdleCallback'in window)requestIdleCallback(startIntelligence,{timeout:500});else setTimeout(startIntelligence,80);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();

/* ===== property/js/dashboard/home/home-mobile-modal-audit.js ===== */
/* NJW-246 Run 018: mobile-only modal behavior for /property/home. */
(function () {
  'use strict';

  var MOBILE = '(max-width: 820px)';
  var lastFocus = null;

  function isMobile() {
    return !!(window.matchMedia && window.matchMedia(MOBILE).matches);
  }

  function overlay() {
    return document.getElementById('plm-note-overlay');
  }

  function dialog() {
    var root = overlay();
    return root ? root.querySelector('.plm-note-box') : null;
  }

  function focusables(root) {
    if (!root) return [];
    return Array.prototype.slice.call(root.querySelectorAll(
      'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
    )).filter(function (node) {
      return node.offsetParent !== null;
    });
  }

  function applyMobileDialogSemantics(title) {
    if (!isMobile()) return;
    var root = overlay();
    var box = dialog();
    if (!root || !box) return;

    root.setAttribute('aria-hidden', 'false');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('tabindex', '-1');

    var heading = box.querySelector('h3');
    if (heading) {
      heading.id = 'plm-note-title';
      box.setAttribute('aria-labelledby', heading.id);
    } else if (title) {
      box.setAttribute('aria-label', title);
    }

    document.body.classList.add('note-modal-open');

    window.requestAnimationFrame(function () {
      var close = box.querySelector('.plm-note-x');
      (close || box).focus({ preventScroll: true });
    });
  }

  function clearMobileDialogSemantics() {
    var root = overlay();
    document.body.classList.remove('note-modal-open');
    if (root) root.setAttribute('aria-hidden', 'true');
    if (lastFocus && typeof lastFocus.focus === 'function' && document.contains(lastFocus)) {
      try { lastFocus.focus({ preventScroll: true }); } catch (e) { lastFocus.focus(); }
    }
    lastFocus = null;
  }

  function enhance() {
    if (!isMobile()) return;
    if (typeof window.plModalNote !== 'function' || typeof window.plCloseNote !== 'function') return;
    if (window.plModalNote.__watchdogMobileAudit) return;

    var baseOpen = window.plModalNote;
    var baseClose = window.plCloseNote;

    function mobileOpen(title, html) {
      if (isMobile()) lastFocus = document.activeElement;
      var result = baseOpen.apply(this, arguments);
      applyMobileDialogSemantics(title);
      return result;
    }

    function mobileClose() {
      var result = baseClose.apply(this, arguments);
      if (isMobile()) clearMobileDialogSemantics();
      return result;
    }

    mobileOpen.__watchdogMobileAudit = true;
    window.plModalNote = mobileOpen;
    window.plCloseNote = mobileClose;

    document.addEventListener('keydown', function (event) {
      if (!isMobile()) return;
      var root = overlay();
      var box = dialog();
      if (!root || !box || !root.classList.contains('open')) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        window.plCloseNote();
        return;
      }

      if (event.key !== 'Tab') return;
      var items = focusables(box);
      if (!items.length) {
        event.preventDefault();
        box.focus();
        return;
      }

      var first = items[0];
      var last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
  }

  if (document.readyState === 'complete') {
    enhance();
  } else {
    window.addEventListener('load', enhance, { once: true });
  }
})();

/* ===== property/js/dashboard/home/home-hero-intelligence.js ===== */
/* Property Home hero intelligence.
   Keeps the premium property identity Watchdog-first, preserves municipality as
   tax-jurisdiction context, and renders Street View with the Maps JavaScript API
   so Property Home does not depend on unsigned Street View Static API images. */
(function(){
'use strict';
if(window.__WATCHDOG_HOME_HERO_INTELLIGENCE__)return;
window.__WATCHDOG_HOME_HERO_INTELLIGENCE__=true;

var GMAPS_KEY='AIzaSyCZBo_mj5WXyR-Bsb5yHdekxAxauTYNmlU';
var observer=null,scorePromise=null,mapsPromise=null,retryTimer=0,taxEvidenceByPin=Object.create(null),taxEvidencePending=Object.create(null);

function esc(v){return String(v==null?'':v).replace(/[&<>\"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]});}
function title(v){return String(v||'').toLowerCase().replace(/\b\w/g,function(c){return c.toUpperCase();});}
function num(v){v=Number(v);return Number.isFinite(v)?v:null;}
function money(v){v=num(v);return v==null?'—':v.toLocaleString('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0});}
function resolvePin(){try{return new URL(location.href).searchParams.get('pin')||((document.getElementById('hm-switch')||{}).value||'');}catch(_){return((document.getElementById('hm-switch')||{}).value||'');}}
function currentRow(){
  var rows=window.rows,pin=resolvePin();
  if(!Array.isArray(rows)||!rows.length)return null;
  if(pin){for(var i=0;i<rows.length;i++)if(String(rows[i].pams_pin||'')===String(pin))return rows[i];}
  var sw=document.getElementById('hm-switch');
  if(sw&&sw.value){for(var j=0;j<rows.length;j++)if(String(rows[j].pams_pin||'')===String(sw.value))return rows[j];}
  return rows[0]||null;
}

function ensureStyles(){
  if(document.getElementById('wd-home-hero-intelligence-style'))return;
  var style=document.createElement('style');
  style.id='wd-home-hero-intelligence-style';
  style.textContent=[
    '.hm-id>.hm-locality{margin:8px 0 0!important;color:#5f7291!important;font-size:clamp(15px,1.15vw,19px)!important;font-weight:700!important;letter-spacing:-.01em!important}',
    '.hm-id>.hm-jurisdiction{margin:5px 0 0!important;color:#8796aa!important;font-size:clamp(11px,.78vw,13px)!important;font-weight:650!important;line-height:1.45!important}',
    '.hm-id>.hm-score-hero{margin-top:clamp(22px,2.2vw,34px)!important;padding-top:clamp(20px,1.8vw,28px)!important;border-top:1px solid #e5ebf3!important}',
    '.hm-score-top{display:grid;grid-template-columns:auto minmax(0,1fr);gap:clamp(15px,1.5vw,22px);align-items:center}',
    '.hm-score-badge{width:clamp(104px,8.3vw,132px);height:clamp(104px,8.3vw,132px);border-radius:30px;display:grid;grid-template-columns:1fr auto;grid-template-rows:auto 1fr auto;align-items:center;padding:14px 16px;background:linear-gradient(145deg,#10294b 0%,#1f5cc7 100%);box-shadow:0 16px 34px rgba(21,64,130,.2);color:#fff;position:relative;overflow:hidden}',
    '.hm-score-badge:after{content:"";position:absolute;width:74px;height:74px;border-radius:50%;right:-28px;top:-26px;background:rgba(255,255,255,.09)}',
    '.hm-score-badge>i{grid-column:1/-1;justify-self:start;width:30px;height:30px;border-radius:10px;display:grid;place-items:center;background:rgba(255,255,255,.14);font-size:14px}',
    '.hm-score-badge>b{font:800 clamp(43px,3.7vw,58px)/.92 "Plus Jakarta Sans",sans-serif;letter-spacing:-.065em;align-self:end}',
    '.hm-score-badge>small{font:800 11px/1 "Plus Jakarta Sans",sans-serif;opacity:.75;align-self:end;padding-bottom:7px;margin-left:5px}',
    '.hm-score-copy{min-width:0}',
    '.hm-score-kicker{display:block;color:#2d6df6;font:850 10px/1.2 "Plus Jakarta Sans",sans-serif;letter-spacing:.115em;text-transform:uppercase}',
    '.hm-score-copy>strong{display:block;margin-top:7px;color:#10213f;font:800 clamp(19px,1.55vw,25px)/1.18 "Plus Jakarta Sans",sans-serif;letter-spacing:-.035em}',
    '.hm-score-copy>small{display:block;margin-top:8px;color:#73849c;font-size:12px;font-weight:650;line-height:1.5}',
    '.hm-score-copy>small b{color:#425774;font-weight:800}',
    '.hm-robust-mini{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:7px;margin-top:16px}',
    '.hm-robust-cell{min-width:0;padding:9px 7px 8px;border:1px solid #e5ebf3;border-radius:12px;background:#f8fafd;text-align:center}',
    '.hm-robust-cell>b{display:block;color:#2d6df6;font:900 11px/1 "Plus Jakarta Sans",sans-serif}',
    '.hm-robust-cell>em{display:block;margin-top:5px;color:#10213f;font:800 14px/1 "Plus Jakarta Sans",sans-serif;font-style:normal}',
    '.hm-robust-cell>small{display:block;margin-top:5px;overflow:hidden;text-overflow:ellipsis;color:#8a98aa;font-size:8px;font-weight:800;letter-spacing:.02em;white-space:nowrap}',
    '.hm-score-link{display:inline-flex;align-items:center;gap:7px;margin-top:13px;color:#2d6df6!important;font:800 11px/1.2 "Plus Jakarta Sans",sans-serif;text-decoration:none!important}',
    '.hm-score-link:hover{text-decoration:underline!important}',
    '.hm-score-empty{display:flex;gap:13px;align-items:center;padding:17px 0 1px}',
    '.hm-score-empty>i{width:46px;height:46px;border-radius:15px;display:grid;place-items:center;background:#edf3ff;color:#2d6df6;font-size:18px}',
    '.hm-score-empty b{display:block;color:#10213f;font:800 17px/1.2 "Plus Jakarta Sans",sans-serif}',
    '.hm-score-empty span{display:block;margin-top:4px;color:#78889d;font-size:12px;line-height:1.45}',
    '.hm-current-tax{margin-top:16px;padding:14px 15px;border:1px solid #d8e5f5;border-radius:16px;background:#f8fbff}',
    '.hm-current-tax-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.hm-current-tax-head b{color:#10213f;font:850 12px/1.2 "Plus Jakarta Sans",sans-serif}.hm-current-tax-head span{padding:5px 8px;border-radius:999px;background:#e6f7f3;color:#008d82;font:850 9px/1 "Plus Jakarta Sans",sans-serif;letter-spacing:.06em;text-transform:uppercase}',
    '.hm-current-tax-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:11px}.hm-current-tax-grid div{padding:9px 10px;border-radius:12px;background:#fff;border:1px solid #e7edf5}.hm-current-tax-grid small{display:block;color:#8290a3;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.04em}.hm-current-tax-grid strong{display:block;margin-top:4px;color:#10213f;font:850 16px/1.1 "Plus Jakarta Sans",sans-serif}.hm-current-tax-foot{display:flex;justify-content:space-between;gap:10px;margin-top:9px;color:#708198;font-size:10px;font-weight:650}.hm-current-tax-foot a{color:#008d82!important;font-weight:850;text-decoration:none!important}',
    '.hm-shot.wd-streetview-host{position:relative!important;overflow:hidden!important;background-image:none!important;background-color:#e9eef5!important}',
    '.hm-shot.wd-streetview-host .wd-streetview-state{position:absolute;inset:0;display:grid;place-items:center;padding:26px;text-align:center;background:linear-gradient(145deg,#eef3f8,#dde7f0);color:#53677f}',
    '.wd-streetview-state>div{max-width:340px}',
    '.wd-streetview-state i{display:grid;place-items:center;margin:0 auto 12px;width:52px;height:52px;border-radius:16px;background:#fff;color:#2d6df6;box-shadow:0 8px 24px rgba(36,62,91,.08);font-size:20px}',
    '.wd-streetview-state b{display:block;color:#17304f;font:800 15px/1.25 "Plus Jakarta Sans",sans-serif}',
    '.wd-streetview-state span{display:block;margin-top:6px;font-size:12px;line-height:1.45}',
    '.wd-streetview-state a{display:inline-flex;margin-top:12px;color:#2d6df6;font-weight:800;text-decoration:none}',
    '.hm-shot.wd-streetview-live .gm-style{border-radius:inherit}',
    '@media(max-width:760px){.hm-id>.hm-score-hero{margin-top:20px!important;padding-top:18px!important}.hm-score-badge{width:100px;height:100px;border-radius:25px}.hm-robust-mini{grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}.hm-robust-cell{padding:8px 6px}.hm-score-copy>small{font-size:11px}}',
    '@media(max-width:430px){.hm-score-top{grid-template-columns:88px minmax(0,1fr);gap:13px}.hm-score-badge{width:88px;height:88px;padding:11px 12px;border-radius:22px}.hm-score-badge>i{width:25px;height:25px;border-radius:8px;font-size:12px}.hm-score-badge>b{font-size:39px}.hm-score-copy>strong{font-size:18px}}'
  ].join('');
  document.head.appendChild(style);
}

function localityMarkup(row){
  var city=String(row.city||'').trim(),zip=String(row.zip||'').trim();
  var locality=[city||row.town||'', 'NJ', zip].filter(Boolean).join(' ').replace('NJ '+zip,'NJ '+zip);
  var jurisdiction=[];
  if(row.town)jurisdiction.push(title(row.town));
  if(row.county)jurisdiction.push(title(row.county)+' County');
  if(row.block)jurisdiction.push('Block '+row.block+(row.lot?' · Lot '+row.lot:''));
  if(row.pams_pin)jurisdiction.push(row.pams_pin);
  return{locality:locality,jurisdiction:jurisdiction.join(' · ')};
}

function enhanceLocality(hero,row){
  var id=hero.querySelector('.hm-id');if(!id)return;
  var p=id.querySelector(':scope > p:not(.hm-jurisdiction)');
  if(!p){p=document.createElement('p');var h=id.querySelector('h1');if(h)h.insertAdjacentElement('afterend',p);else id.insertBefore(p,id.firstChild);}
  var copy=localityMarkup(row);
  p.className='hm-locality';
  p.textContent=copy.locality;
  var jurisdiction=id.querySelector(':scope > .hm-jurisdiction');
  if(!jurisdiction){jurisdiction=document.createElement('p');jurisdiction.className='hm-jurisdiction';p.insertAdjacentElement('afterend',jurisdiction);}
  jurisdiction.textContent=copy.jurisdiction;
}

function ensureScoreEngine(){
  if(typeof window.watchdogScore==='function')return Promise.resolve();
  if(scorePromise)return scorePromise;
  if(window.NJPropertyModules&&typeof window.NJPropertyModules.loadTool==='function'){
    scorePromise=window.NJPropertyModules.loadTool('watchdog-score').then(function(){return undefined;}).catch(function(){scorePromise=null;});
    return scorePromise;
  }
  scorePromise=new Promise(function(resolve){
    var tries=0,t=setInterval(function(){tries++;if(typeof window.watchdogScore==='function'||tries>80){clearInterval(t);resolve();}},100);
  });
  return scorePromise;
}

function robustCells(w){
  var order=(window.WatchdogScoreCore&&window.WatchdogScoreCore.ORDER)||['recourse','fairness','burden','uniformity','stability','trajectory'];
  return order.map(function(key){
    var d=w&&w.detail&&w.detail[key]||{},letter=d.letter||({recourse:'R',fairness:'O',burden:'B',uniformity:'U',stability:'S',trajectory:'T'}[key]||'?');
    var name=d.name||({recourse:'Recourse',fairness:'Overassessment',burden:'Burden',uniformity:'Uniformity',stability:'Stability',trajectory:'Trajectory'}[key]||key);
    var value=d.score==null?'—':Math.round(Number(d.score));
    return '<span class="hm-robust-cell" title="'+esc(letter+' · '+name)+'"><b>'+esc(letter)+'</b><em>'+esc(value)+'</em><small>'+esc(name)+'</small></span>';
  }).join('');
}

function muniCode(row){
  var pin=String(row&&row.pams_pin||'').match(/^(\d{4})_/);
  return pin?pin[1]:'';
}
function taxEvidence(row){
  var pin=String(row&&row.pams_pin||'');if(!pin)return Promise.resolve(null);
  if(Object.prototype.hasOwnProperty.call(taxEvidenceByPin,pin))return Promise.resolve(taxEvidenceByPin[pin]);
  if(taxEvidencePending[pin])return taxEvidencePending[pin];
  var code=muniCode(row),rt=window.NJPTRSupabaseRuntime;
  if(!code||!row.address||!rt||typeof rt.createClient!=='function')return Promise.resolve(null);
  var client;try{client=rt.createClient();}catch(_){return Promise.resolve(null);}
  taxEvidencePending[pin]=client.functions.invoke('municipal-property-tax-evidence',{body:{municipality_code:code,address:row.address,block:row.block||'',lot:row.lot||''}})
    .then(function(res){var d=res&&!res.error&&res.data&&res.data.status==='exact_match'?res.data:null;taxEvidenceByPin[pin]=d;delete taxEvidencePending[pin];return d;})
    .catch(function(){taxEvidenceByPin[pin]=null;delete taxEvidencePending[pin];return null;});
  return taxEvidencePending[pin];
}
function currentTaxMarkup(e){
  var cur=e&&e.current||{},prop=e&&e.property||{},year=cur.tax_year||'',assessment=num(prop.total_assessed_value),tax=num(cur.annual_tax),rate=num(cur.tax_rate);
  if(!year&&!assessment&&!tax)return'';
  return '<div class="hm-current-tax"><div class="hm-current-tax-head"><b>Current municipal tax record</b><span>'+esc(year?year+' official':'Live municipal')+'</span></div>'+
    '<div class="hm-current-tax-grid"><div><small>Assessment</small><strong>'+esc(money(assessment))+'</strong></div><div><small>Annual tax</small><strong>'+esc(money(tax))+'</strong></div><div><small>Tax rate</small><strong>'+(rate==null?'—':esc(rate.toFixed(3)+'%'))+'</strong></div></div>'+
    '<div class="hm-current-tax-foot"><span>'+esc(e.provider_label||'Official municipal tax source')+'</span>'+(e.source&&e.source.url?'<a href="'+esc(e.source.url)+'" target="_blank" rel="noopener">Official source ↗</a>':'')+'</div></div>';
}

function paintScore(hero,row){
  var id=hero.querySelector('.hm-id');if(!id)return;
  var old=id.querySelector(':scope > .hm-val');
  var box=id.querySelector(':scope > .hm-score-hero');
  if(!box){box=document.createElement('div');box.className='hm-score-hero';if(old)old.replaceWith(box);else id.appendChild(box);}else if(old)old.remove();
  var w=null;
  try{if(typeof window.watchdogScore==='function')w=window.watchdogScore(row);}catch(e){console.warn('Watchdog hero score unavailable',e);}
  if(!w||w.score==null){
    box.innerHTML='<div class="hm-score-empty"><i class="fas fa-dog"></i><div><b>Watchdog Score is building</b><span>ROBUST will publish a score here when this property has enough governed evidence. No fallback score is substituted.</span></div></div><a class="hm-score-link" href="/property/robust/">How ROBUST works <i class="fas fa-arrow-right"></i></a>';
    box.dataset.scoreModel='none';
    return;
  }
  var coverage=Math.max(0,Math.min(100,Math.round(Number(w.covered||0)*100)));
  var confidence=String(w.confidence||'low').toLowerCase();
  box.dataset.scoreModel=w.modelVersion||w.frameworkVersion||'ROBUST-v1';
  box.innerHTML='<div class="hm-score-top">'+
    '<div class="hm-score-badge" title="Watchdog Score '+esc(w.score)+' of 100"><i class="fas fa-dog"></i><b>'+esc(w.score)+'</b><small>/100</small></div>'+
    '<div class="hm-score-copy"><span class="hm-score-kicker">Watchdog Score</span><strong>'+esc(w.verdict||'Current property position')+'</strong><small>Powered by <b>'+esc(w.frameworkVersion||'ROBUST-v1')+'</b> · '+esc(confidence)+' confidence · '+coverage+'% evidence coverage</small></div>'+
    '</div><div class="hm-robust-mini" aria-label="ROBUST component scores">'+robustCells(w)+'</div>'+
    '<a class="hm-score-link" href="/property/robust/">See the ROBUST framework <i class="fas fa-arrow-right"></i></a>'+(taxEvidenceByPin[String(row.pams_pin||'')]?currentTaxMarkup(taxEvidenceByPin[String(row.pams_pin||'')]):'');
}

function mapsReady(){return !!(window.google&&window.google.maps&&window.google.maps.StreetViewPanorama&&window.google.maps.StreetViewService);}
function ensureGoogleMaps(){
  if(mapsReady())return Promise.resolve(window.google.maps);
  if(mapsPromise)return mapsPromise;
  mapsPromise=new Promise(function(resolve,reject){
    var done=false,tries=0;
    function finish(ok){if(done)return;done=true;clearInterval(poll);clearTimeout(timeout);ok?resolve(window.google.maps):reject(new Error('Google Maps JavaScript API unavailable'));}
    var poll=setInterval(function(){tries++;if(mapsReady())finish(true);else if(tries>120)finish(false);},100);
    var timeout=setTimeout(function(){finish(mapsReady());},12500);
    var existing=document.querySelector('script[src*="maps.googleapis.com/maps/api/js"]');
    if(existing)return;
    window.WatchdogHomeGoogleMapsReady=function(){finish(mapsReady());};
    var script=document.createElement('script');
    script.id='wd-home-google-maps-script';
    script.async=true;script.defer=true;
    script.src='https://maps.googleapis.com/maps/api/js?key='+encodeURIComponent(GMAPS_KEY)+'&loading=async&region=US&v=weekly&callback=WatchdogHomeGoogleMapsReady';
    script.onerror=function(){finish(false);};
    document.head.appendChild(script);
  }).catch(function(err){mapsPromise=null;throw err;});
  return mapsPromise;
}

function bearing(from,to){
  if(!from||!to)return 0;
  var a=from.lat()*Math.PI/180,b=to.lat()*Math.PI/180,d=(to.lng()-from.lng())*Math.PI/180;
  var y=Math.sin(d)*Math.cos(b),x=Math.cos(a)*Math.sin(b)-Math.sin(a)*Math.cos(b)*Math.cos(d);
  return(Math.atan2(y,x)*180/Math.PI+360)%360;
}
function streetQuery(row){return[row.address,row.city||row.town,'NJ',row.zip].filter(Boolean).join(', ');}
function fallbackStreet(host,row,message){
  if(!host)return;host.classList.remove('wd-streetview-live');host.classList.add('wd-streetview-host');
  var q=streetQuery(row);
  host.innerHTML='<div class="wd-streetview-state"><div><i class="fas fa-street-view"></i><b>Street View is unavailable here</b><span>'+esc(message||'Google does not have a usable panorama for this address right now.')+'</span><a href="https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(q)+'" target="_blank" rel="noopener">Open in Google Maps</a></div></div>';
}
function loadingStreet(host){host.classList.add('wd-streetview-host');host.style.backgroundImage='none';host.innerHTML='<div class="wd-streetview-state"><div><i class="fas fa-street-view"></i><b>Opening Street View</b><span>Finding the closest current panorama for this property.</span></div></div>';}
function geocodeTarget(maps,row){
  var lat=num(row.lat),lon=num(row.lon);
  if(lat!=null&&lon!=null)return Promise.resolve(new maps.LatLng(lat,lon));
  return new Promise(function(resolve,reject){new maps.Geocoder().geocode({address:streetQuery(row)},function(results,status){if(status==='OK'&&results&&results[0])resolve(results[0].geometry.location);else reject(new Error('Address could not be geocoded'));});});
}
function findPanorama(maps,target,source){
  return new Promise(function(resolve,reject){
    var service=new maps.StreetViewService();
    service.getPanorama({location:target,radius:100,preference:maps.StreetViewPreference.NEAREST,source:source},function(data,status){if(status===maps.StreetViewStatus.OK&&data&&data.location)resolve(data);else reject(new Error(String(status||'ZERO_RESULTS')));});
  });
}
function mountStreetView(hero,row){
  var host=hero.querySelector('.hm-shot');if(!host)return;
  var pin=String(row.pams_pin||streetQuery(row));
  if(host.dataset.wdStreetviewPin===pin)return;
  host.dataset.wdStreetviewPin=pin;host.style.backgroundImage='none';loadingStreet(host);
  ensureGoogleMaps().then(function(maps){return geocodeTarget(maps,row).then(function(target){
    return findPanorama(maps,target,maps.StreetViewSource.OUTDOOR).catch(function(){return findPanorama(maps,target,maps.StreetViewSource.DEFAULT);}).then(function(data){return{maps:maps,target:target,data:data};});
  });}).then(function(result){
    if(!document.body.contains(host)||host.dataset.wdStreetviewPin!==pin)return;
    var maps=result.maps,data=result.data,target=result.target,heading=bearing(data.location.latLng,target);
    host.innerHTML='';host.classList.add('wd-streetview-host','wd-streetview-live');
    new maps.StreetViewPanorama(host,{pano:data.location.pano,position:data.location.latLng,pov:{heading:heading,pitch:4},zoom:1,visible:true,addressControl:false,fullscreenControl:true,linksControl:true,panControl:false,zoomControl:false,clickToGo:true,scrollwheel:false,motionTracking:false,motionTrackingControl:false,enableCloseButton:false});
  }).catch(function(err){
    if(!document.body.contains(host)||host.dataset.wdStreetviewPin!==pin)return;
    fallbackStreet(host,row,err&&err.message==='Google Maps JavaScript API unavailable'?'Google Maps could not load for this site. The property report remains available below.':'No outdoor Street View panorama was found close enough to this property.');
  });
}

function enhanceHero(){
  clearTimeout(retryTimer);
  ensureStyles();
  var hero=document.querySelector('#hm-body .hm-hero'),row=currentRow();
  if(!hero||!row){retryTimer=setTimeout(enhanceHero,180);return;}
  var pin=String(row.pams_pin||resolvePin()||'current');
  if(hero.dataset.wdIdentityPin!==pin){enhanceLocality(hero,row);hero.dataset.wdIdentityPin=pin;}
  mountStreetView(hero,row);
  ensureScoreEngine().then(function(){
    var active=currentRow();if(!active||String(active.pams_pin||'')!==String(row.pams_pin||''))return;
    if(!document.body.contains(hero))return;
    paintScore(hero,row);
    taxEvidence(row).then(function(){var active=currentRow();if(active&&String(active.pams_pin||'')===String(row.pams_pin||'')&&document.body.contains(hero))paintScore(hero,row);});
  });
}
function schedule(){clearTimeout(retryTimer);retryTimer=setTimeout(enhanceHero,40);}
function boot(){
  ensureStyles();
  var body=document.getElementById('hm-body');
  if(body){observer=new MutationObserver(function(mutations){
    for(var i=0;i<mutations.length;i++){
      if(mutations[i].target&&mutations[i].target.closest&&mutations[i].target.closest('.hm-shot.wd-streetview-live'))continue;
      schedule();break;
    }
  });observer.observe(body,{childList:true,subtree:true});}
  document.addEventListener('change',function(e){if(e.target&&e.target.id==='hm-switch')setTimeout(enhanceHero,90);});
  window.addEventListener('watchdog:context-refresh',schedule);
  enhanceHero();
}

window.WatchdogHomeHeroIntelligence={refresh:enhanceHero};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();


/* ===== property/js/dashboard/home/watchdog-analyst-intel.js ===== */
/* Watchdog Analyst Intel for Property Home.
   Profession-aware, evidence-led property intelligence. */
(function () {
  'use strict';
  if (window.__WATCHDOG_HOME_ANALYST_INTEL__) return;
  window.__WATCHDOG_HOME_ANALYST_INTEL__ = true;

  var PROD_URL = 'https://uvkvaxljhhngydvlrzom.supabase.co';
  var PROD_KEY = 'sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa';
  var state = {
    client: null, user: null, entitlement: null, preference: null, property: null,
    suggestions: [], suggestionsPin: '', suggestionsResolved: false,
    timer: null, evidenceTimer: null, token: 0, loading: false, queued: false, lastPin: ''
  };
  var rank = { standard: 0, agent: 1, pro: 2, pro_plus: 3, teams: 4, developer: 5 };

  var PROFESSIONS = {
    real_estate: { label: 'Real Estate Agent', icon: 'fa-house-circle-check' },
    investor: { label: 'Real Estate Investor', icon: 'fa-chart-line' },
    attorney: { label: 'Attorney', icon: 'fa-scale-balanced' },
    mortgage_lending: { label: 'Mortgage / Lending Professional', icon: 'fa-building-columns' },
    appraiser: { label: 'Appraiser', icon: 'fa-ruler-combined' },
    contractor: { label: 'Contractor', icon: 'fa-hammer' },
    property_tax_professional: { label: 'Property Tax Professional', icon: 'fa-receipt' },
    title_closing: { label: 'Title / Closing Professional', icon: 'fa-file-signature' },
    homeowner: { label: 'Homeowner', icon: 'fa-house-user' },
    other: { label: 'Property Professional', icon: 'fa-briefcase' },
    general: { label: 'General Property User', icon: 'fa-compass' }
  };

  var PROFESSION_OPTIONS = [
    ['real_estate', 'Real estate agent / professional'],
    ['investor', 'Real estate investor'],
    ['attorney', 'Attorney'],
    ['mortgage_lending', 'Mortgage / lending'],
    ['appraiser', 'Appraiser'],
    ['contractor', 'Contractor'],
    ['property_tax_professional', 'Property tax professional'],
    ['title_closing', 'Title / closing'],
    ['homeowner', 'Homeowner'],
    ['other', 'Other professional']
  ];

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function num(value) { var n = Number(value); return Number.isFinite(n) ? n : null; }
  function money(value) {
    var n = num(value);
    return n == null ? 'Not available' : new Intl.NumberFormat('en-US', {
      style: 'currency', currency: 'USD', maximumFractionDigits: 0
    }).format(n);
  }
  function pct(value, digits) {
    var n = num(value);
    return n == null ? 'Not available' : n.toFixed(digits == null ? 1 : digits) + '%';
  }
  function clamp(value, min, max) { return Math.max(min, Math.min(max, Number(value || 0))); }
  function client() {
    if (state.client) return state.client;
    if (window.NJPTRSupabaseRuntime && window.NJPTRSupabaseRuntime.createClient) {
      state.client = window.NJPTRSupabaseRuntime.createClient();
      return state.client;
    }
    if (!window.supabase || !window.supabase.createClient) return null;
    state.client = window.supabase.createClient(PROD_URL, PROD_KEY, { auth: {
      persistSession: true, autoRefreshToken: true, detectSessionInUrl: true,
      flowType: 'pkce', storageKey: 'sb-uvkvaxljhhngydvlrzom-auth-token'
    }});
    return state.client;
  }
  function currentPin() {
    var query = new URLSearchParams(location.search).get('pin');
    if (query) return query;
    var select = document.getElementById('hm-switch');
    return select && select.value ? select.value : '';
  }
  function normalizedPlan() {
    if (state.entitlement && state.entitlement.account_role === 'developer') return 'developer';
    var value = String(state.entitlement && state.entitlement.plan_tier || 'standard').toLowerCase();
    return rank[value] == null ? 'standard' : value;
  }
  function can(required) { return (rank[normalizedPlan()] || 0) >= (rank[required] || 0); }
  function explicitProfession() {
    var pref = state.preference;
    if (!pref || pref.onboarding_complete !== true) return '';
    var value = String(pref.profession || '').trim();
    return PROFESSIONS[value] && value !== 'general' ? value : '';
  }
  function profession() { return explicitProfession() || 'general'; }
  function professionDef() { return PROFESSIONS[profession()] || PROFESSIONS.general; }
  function propertyValue() {
    var property = state.property || {};
    return num(property.watchdog_value) || num(property.assessed);
  }
  function metrics() {
    var property = state.property || {};
    var value = propertyValue(), assessed = num(property.assessed), tax = num(property.last_year_tax);
    return {
      value: value,
      assessed: assessed,
      tax: tax,
      monthlyTax: tax != null ? tax / 12 : null,
      taxLoad: value && tax != null ? tax / value * 100 : null,
      assessedToValue: value && assessed != null ? assessed / value * 100 : null,
      onePercentValue: value ? value * 0.01 : null,
      appeal: property.has_appeal_case === true
    };
  }
  function topSuggestion() {
    return (state.suggestions || []).slice().sort(function (a, b) {
      if (!!a.limited_evidence !== !!b.limited_evidence) return a.limited_evidence ? 1 : -1;
      return Number(b.score || 0) - Number(a.score || 0);
    })[0] || null;
  }
  function urgencyCopy(m, suggestion) {
    if (suggestion) {
      var band = suggestion.attention_band === 'act_now' ? 'Act now' : suggestion.attention_band === 'this_week' ? 'This week' : 'Watch';
      return band + ' signal. Watchdog scored this review finding ' + Math.round(clamp(suggestion.score, 0, 100)) + '/100 with ' + Math.round(clamp(suggestion.evidence_coverage, 0, 100)) + '% evidence coverage. Review the evidence before acting.';
    }
    if (m.appeal) return 'This record already carries an appeal-case indicator. That is a reason to review the supporting assessment evidence, not a guarantee of a reduction.';
    if (m.taxLoad != null && m.taxLoad >= 2.5) return 'Property taxes equal about ' + pct(m.taxLoad) + ' of the current Watchdog value context each year. That carrying-cost load deserves attention in affordability, yield, or client strategy.';
    return 'No high-urgency governed finding is present for this property right now. Watchdog will keep monitoring rather than manufacture urgency.';
  }
  function financialCopy(role, m) {
    if (role === 'investor') return 'Annual property tax is ' + money(m.tax) + (m.monthlyTax != null ? ' (' + money(m.monthlyTax) + '/month)' : '') + (m.taxLoad != null ? ', about ' + pct(m.taxLoad) + ' of Watchdog value context. ' : '. ') + (m.onePercentValue != null ? 'A 1% change in property value is roughly ' + money(m.onePercentValue) + '. Use these as real carrying-cost and sensitivity inputs when you model purchase price, rehab, financing, rent, and exit ROI.' : 'Add a verified value before relying on return sensitivity.');
    if (role === 'real_estate') return 'The property carries ' + money(m.tax) + ' in annual tax' + (m.monthlyTax != null ? ', about ' + money(m.monthlyTax) + ' per month' : '') + '. ' + (m.onePercentValue != null ? 'A 1% pricing movement is roughly ' + money(m.onePercentValue) + ', giving you a concrete scale for pricing and negotiation conversations.' : 'Watchdog will add pricing sensitivity when a usable value context is available.');
    if (role === 'mortgage_lending') return 'Current annual property tax is ' + money(m.tax) + (m.monthlyTax != null ? ', about ' + money(m.monthlyTax) + ' per month before insurance and other escrow items.' : '.') + (m.taxLoad != null ? ' Tax load is about ' + pct(m.taxLoad) + ' of Watchdog value context.' : '') + ' Use the verified tax figure in affordability and escrow review rather than relying on a generic estimate.';
    if (role === 'attorney' || role === 'property_tax_professional') return 'Assessment is ' + money(m.assessed) + ' against a Watchdog value context of ' + money(m.value) + (m.assessedToValue != null ? ', an assessment-to-value relationship of about ' + pct(m.assessedToValue) + '.' : '.') + ' Annual tax is ' + money(m.tax) + '. Treat these as review inputs and inspect source lineage before forming a legal or appeal conclusion.';
    if (role === 'appraiser') return 'Assessment is ' + money(m.assessed) + ' and Watchdog value context is ' + money(m.value) + (m.assessedToValue != null ? ', placing assessment at about ' + pct(m.assessedToValue) + ' of that context.' : '.') + ' This is a screening relationship, not an appraisal or replacement for a supported opinion of value.';
    if (role === 'title_closing') return 'Annual tax is ' + money(m.tax) + (m.monthlyTax != null ? ', roughly ' + money(m.monthlyTax) + ' per month.' : '.') + ' Keep tax, assessment, and current change signals in the diligence file so settlement assumptions use the current property record.';
    if (role === 'contractor') return 'Watchdog value context is ' + money(m.value) + (m.onePercentValue != null ? '; 1% of that value is about ' + money(m.onePercentValue) + '.' : '.') + ' Use this only as project-scale context. Renovation ROI still depends on scope, cost, market response, permits, and verified post-work value.';
    if (role === 'homeowner') return 'Current property tax is ' + money(m.tax) + (m.monthlyTax != null ? ', about ' + money(m.monthlyTax) + ' per month.' : '.') + (m.taxLoad != null ? ' That equals about ' + pct(m.taxLoad) + ' of Watchdog value context per year.' : '') + ' Watchdog will flag meaningful assessment and property-record changes as the evidence changes.';
    return 'Current assessment is ' + money(m.assessed) + ', annual property tax is ' + money(m.tax) + ', and Watchdog value context is ' + money(m.value) + '. Set your profession to turn these same facts into a workflow-specific financial lens.';
  }
  function innovationCopy(role) {
    var map = {
      real_estate: 'Turn the property into a client conversation brief: tax carrying cost, assessment context, the current Watchdog finding, and one evidence-backed next question. Use the facts to create a reason to call, not a generic sales script.',
      investor: 'Use Watchdog as a pre-underwriting layer. Carry verified annual tax into purchase, rehab, rent, financing, and exit scenarios, then stress-test the deal before spending time on deeper diligence.',
      attorney: 'Build an evidence-first review packet from source facts, missing evidence, model lineage, and change history. Reduce fact collection time while keeping the professional conclusion human-controlled.',
      mortgage_lending: 'Use property-tax intelligence before final underwriting. Current tax, monthly escrow equivalent, change signals, and property-record inconsistencies can be reviewed before they become closing surprises.',
      appraiser: 'Use Watchdog as a research accelerator. Surface assessment/value divergence, change history, and source-backed anomalies before selecting the records that deserve deeper appraisal analysis.',
      contractor: 'Pair property context with permit and change intelligence to identify where project assumptions need verification. Watchdog should tell you what to investigate before you price the opportunity.',
      property_tax_professional: 'Create a repeatable triage queue from assessment relationships, evidence coverage, missing records, and current tax burden. Spend professional time on properties with the strongest review signal.',
      title_closing: 'Use Watchdog as a pre-closing exception screen. Bring tax, assessment, ownership context, permit/change signals, and missing evidence into one review trail before the file reaches the last mile.',
      homeowner: 'Use Watchdog as a property memory. Keep the current tax and assessment baseline, then let monitored changes tell you when there is something worth reviewing instead of repeatedly searching records.',
      other: 'Use the property as a governed decision file: financial context, current evidence-backed signals, missing evidence, and a documented next action.',
      general: 'Set your profession and Watchdog will rebuild this panel around the financial questions, risks, opportunities, and next actions that matter in your work.'
    };
    return map[role] || map.general;
  }
  function nextActionCopy(role, suggestion) {
    if (suggestion) return 'Inspect why Watchdog flagged this property, then decide whether the finding belongs in a case, report, watchlist action, client conversation, or no action at all.';
    var map = {
      real_estate: 'Review the tax and value story, then decide whether this creates a useful buyer, seller, sphere, or prospect conversation.',
      investor: 'Carry the verified tax into your deal assumptions and test whether the property still clears your required return before deeper underwriting.',
      attorney: 'Open the evidence trail and identify what is proven, what is derived, and what is still missing before creating a case position.',
      mortgage_lending: 'Carry current tax into escrow and affordability review, then monitor for assessment or municipal changes that can alter the payment story.',
      appraiser: 'Use the divergence screen to choose which records need source verification and comparable research.',
      contractor: 'Review property and permit context before estimating scope, timeline, or value impact.',
      property_tax_professional: 'Review assessment evidence and missing inputs before deciding whether this belongs in an appeal or advisory workflow.',
      title_closing: 'Check the current property record and change timeline before relying on tax or diligence assumptions.',
      homeowner: 'Keep monitoring. If Watchdog produces a stronger assessment or change signal, open the evidence before taking action.',
      other: 'Open Data Workbench to inspect the property record and evidence in detail.',
      general: 'Choose your profession first. Watchdog will then recommend the workflow-specific next action.'
    };
    return map[role] || map.general;
  }
  function evidenceCopy(suggestion) {
    if (!suggestion) return can('pro')
      ? 'No current governed model finding rose into the property queue. This is a valid result. Watchdog continues to monitor the evidence and will surface a finding when the facts justify one.'
      : 'Your account can use the profession-aware property brief. Governed model scoring and deeper evidence-backed findings begin with Pro.';
    return suggestion.why_now + ' Confidence ' + Math.round(clamp(suggestion.confidence, 0, 100)) + '%. Evidence coverage ' + Math.round(clamp(suggestion.evidence_coverage, 0, 100)) + '%.' + (suggestion.limited_evidence ? ' Evidence is limited, so Watchdog is intentionally reducing certainty.' : ' Required evidence coverage is adequate for this review finding.');
  }
  function card(icon, label, title, copy, className) {
    return '<article class="wdai-card ' + (className || '') + '"><div class="wdai-card-icon"><i class="fas ' + icon + '"></i></div><div><span>' + esc(label) + '</span><h3>' + esc(title) + '</h3><p>' + esc(copy) + '</p></div></article>';
  }
  function rolePrompt() {
    return '<section class="wdai-role-prompt"><div><span>PERSONALIZATION REQUIRED FOR EXACT INTEL</span><h3>What is your primary profession?</h3><p>Without a stated profession, Watchdog keeps this property brief generalized. Choose one and the same governed facts will be rebuilt around your financial, risk, opportunity, and workflow priorities.</p></div><div class="wdai-role-controls"><select id="wdai-profession" aria-label="Primary profession"><option value="">Choose profession</option>' + PROFESSION_OPTIONS.map(function (option) { return '<option value="' + esc(option[0]) + '">' + esc(option[1]) + '</option>'; }).join('') + '</select><button type="button" id="wdai-save-profession">Personalize my Intel</button></div><small id="wdai-role-note" aria-live="polite">Your profession personalizes recommendations. It does not change billing or authorization.</small></section>';
  }
  function render() {
    var panel = document.querySelector('#hm-body .ai');
    if (!panel || !state.user || !state.property) return;
    var role = profession(), def = professionDef(), m = metrics(), suggestion = topSuggestion(), exact = !!explicitProfession();
    var address = state.property.address || 'Current property';
    panel.classList.add('wdai');
    panel.setAttribute('data-watchdog-analyst-intel', role);
    panel.innerHTML =
      '<header class="wdai-head"><div class="wdai-mark"><i class="fas fa-dog"></i><i class="fas fa-wand-magic-sparkles"></i></div><div class="wdai-title"><span>WATCHDOG ANALYST INTEL</span><h2>' + esc(address) + '</h2><p>' + (exact ? 'Built for a ' + esc(def.label) + ' using this property’s governed records.' : 'Generalized property intelligence until you tell Watchdog how you work.') + '</p></div><div class="wdai-persona"><i class="fas ' + esc(def.icon) + '"></i><span><small>Perspective</small><b>' + esc(exact ? def.label : 'Generalized') + '</b></span></div></header>' +
      (exact ? '<div class="wdai-role-set"><i class="fas fa-circle-check"></i><span>Profession-aware Intel is active for <b>' + esc(def.label) + '</b>.</span><a href="/property/account">Change profession</a></div>' : rolePrompt()) +
      '<div class="wdai-grid">' +
        card('fa-coins', 'FINANCIAL LENS', 'What the numbers mean for you', financialCopy(role, m), 'money') +
        card('fa-bolt', 'MOTIVATION', 'Why this property deserves attention', urgencyCopy(m, suggestion), 'motivation') +
        card('fa-lightbulb', 'INNOVATION', 'A smarter way to use this property', innovationCopy(role), 'innovation') +
        card('fa-shield-halved', 'EVIDENCE', suggestion ? 'What Watchdog is seeing' : 'What Watchdog can prove now', evidenceCopy(suggestion), 'evidence') +
      '</div>' +
      '<section class="wdai-next"><div><span>NEXT BEST ACTION</span><h3>' + esc(nextActionCopy(role, suggestion)) + '</h3><p>Watchdog is decision support. Source facts, missing evidence, and professional judgment stay visible.</p></div><div class="wdai-actions">' +
        (suggestion ? '<button type="button" id="wdai-open-evidence"><i class="fas fa-magnifying-glass-chart"></i> Why Watchdog?</button>' : '') +
        '<a href="/property/data-workbench"><i class="fas fa-table-list"></i> Open Data Workbench</a>' +
        (can('pro') ? '<a class="primary" href="/property/intelligence"><i class="fas fa-wand-magic-sparkles"></i> Intelligence Hub</a>' : '<a class="primary" href="/property/pro#plans"><i class="fas fa-lock"></i> Unlock Pro Intelligence</a>') +
      '</div></section>';

    var save = document.getElementById('wdai-save-profession');
    if (save) save.addEventListener('click', saveProfession);
    var evidence = document.getElementById('wdai-open-evidence');
    if (evidence && suggestion) evidence.addEventListener('click', function () {
      if (window.WatchdogContextIntelligence && window.WatchdogContextIntelligence.open) window.WatchdogContextIntelligence.open(suggestion);
    });
  }
  async function saveProfession() {
    var select = document.getElementById('wdai-profession'), note = document.getElementById('wdai-role-note');
    var value = select && String(select.value || '').trim();
    if (!value || !PROFESSIONS[value] || value === 'general') {
      if (note) note.textContent = 'Choose the profession that best matches how you use Watchdog.';
      return;
    }
    var sb = client();
    if (!sb || !state.user) return;
    if (note) note.textContent = 'Personalizing this property…';
    if (select) select.disabled = true;
    var button = document.getElementById('wdai-save-profession');
    if (button) button.disabled = true;
    var result = await sb.from('professional_preferences').upsert({
      user_id: state.user.id, profession: value, onboarding_complete: true, updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' }).select('profession,onboarding_complete,updated_at').single();
    if (result.error) {
      if (note) note.textContent = 'Watchdog could not save your profession. Use Account to update it.';
      if (select) select.disabled = false;
      if (button) button.disabled = false;
      return;
    }
    state.preference = result.data;
    render();
    window.dispatchEvent(new CustomEvent('watchdog:profession-updated', { detail: { profession: value } }));
  }
  async function fallbackSuggestions(pinValue) {
    if (!can('pro') || state.suggestionsResolved || state.suggestionsPin !== pinValue || !state.user) return;
    var sb = client();
    if (!sb) return;
    try {
      var result = await sb.functions.invoke('intelligence-context-suggestions', { body: {
        surface: 'home', scope_type: 'property', pams_pins: [pinValue], context_key: 'home-analyst-intel:' + pinValue, limit: 6
      }});
      if (state.lastPin !== pinValue) return;
      state.suggestionsResolved = true;
      state.suggestions = !result.error && result.data && Array.isArray(result.data.suggestions) ? result.data.suggestions : [];
      render();
    } catch (_error) {
      state.suggestionsResolved = true;
    }
  }
  function scheduleEvidenceFallback(pinValue) {
    clearTimeout(state.evidenceTimer);
    if (!can('pro')) return;
    state.evidenceTimer = setTimeout(function () { fallbackSuggestions(pinValue); }, 1800);
  }
  async function refresh(force) {
    var pinValue = currentPin(), panel = document.querySelector('#hm-body .ai');
    if (!pinValue) return;
    if (!force && state.lastPin === pinValue && state.property && panel && panel.hasAttribute('data-watchdog-analyst-intel')) return;
    if (state.loading) { state.queued = true; return; }
    var sb = client();
    if (!sb) return;
    state.loading = true;
    var token = ++state.token;
    try {
      var auth = await sb.auth.getUser();
      if (token !== state.token) return;
      state.user = auth && auth.data && auth.data.user;
      if (!state.user) return;
      var parts = await Promise.all([
        sb.rpc('get_my_entitlement'),
        sb.from('professional_preferences').select('profession,onboarding_complete,updated_at').eq('user_id', state.user.id).maybeSingle(),
        sb.from('saved_properties').select('pams_pin,kind,address,town,county,zip,assessed,last_year_tax,effective_rate,watchdog_value,has_appeal_case,verify_level,verified,updated_at').eq('user_id', state.user.id).eq('pams_pin', pinValue).limit(1).maybeSingle()
      ]);
      if (token !== state.token) return;
      var ent = parts[0] && parts[0].data || [];
      state.entitlement = Array.isArray(ent) ? ent[0] : ent;
      state.preference = parts[1] && !parts[1].error ? parts[1].data : null;
      state.property = parts[2] && !parts[2].error ? parts[2].data : null;
      if (!state.property) return;
      if (state.lastPin !== pinValue) {
        state.suggestions = [];
        state.suggestionsPin = pinValue;
        state.suggestionsResolved = false;
      }
      state.lastPin = pinValue;
      render();
      scheduleEvidenceFallback(pinValue);
    } catch (error) {
      console.warn('Watchdog Analyst Intel unavailable:', error && error.message || error);
    } finally {
      state.loading = false;
      if (state.queued) { state.queued = false; schedule(120, true); }
    }
  }
  function schedule(delay, force) {
    clearTimeout(state.timer);
    state.timer = setTimeout(function () { refresh(!!force); }, delay == null ? 180 : delay);
  }
  function installMobileIntel() {
    var attempts = 0;
    var timer = setInterval(function () {
      attempts++;
      if (typeof window.hmIntelClose === 'function') {
        clearInterval(timer);
        window.hmAgentIntel = function () {
          var panel = document.querySelector('#hm-body .ai'), mobile = window.matchMedia && window.matchMedia('(max-width: 760px)').matches;
          if (mobile && panel) {
            var overlay = document.getElementById('hm-mobile-intel-overlay'), content = document.getElementById('hm-mobile-intel-content');
            if (!overlay || !content) return;
            content.innerHTML = panel.outerHTML;
            var cloned = content.querySelector('.ai'); if (cloned) cloned.classList.add('ai-mobile');
            var heading = content.querySelector('.wdai-title span'); if (heading) heading.id = 'hm-mobile-intel-title';
            overlay.classList.add('open'); overlay.setAttribute('aria-hidden', 'false');
            document.body.classList.add('mobile-intel-open');
            var close = overlay.querySelector('.mobile-intel-close'); if (close) close.focus();
            return;
          }
          if (panel && panel.scrollIntoView) panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
        };
      }
      if (attempts > 80) clearInterval(timer);
    }, 100);
  }
  function boot() {
    var body = document.getElementById('hm-body');
    if (body) new MutationObserver(function (records) {
      var external = records.some(function (record) {
        var target = record.target && record.target.nodeType === 1 ? record.target : record.target && record.target.parentElement;
        return !target || !target.closest || !target.closest('[data-watchdog-analyst-intel]');
      });
      if (external) schedule(260, false);
    }).observe(body, { childList: true, subtree: true });
    document.addEventListener('change', function (event) {
      if (event.target && event.target.id === 'hm-switch') {
        state.lastPin = '';
        state.suggestionsResolved = false;
        schedule(100, true);
      }
    });
    window.addEventListener('watchdog:context-suggestions', function (event) {
      var detail = event && event.detail || {}, ctx = detail.context || {}, data = detail.data || {}, pins = ctx.pams_pins || [];
      if (ctx.surface !== 'home' || pins.indexOf(currentPin()) < 0 || !Array.isArray(data.suggestions)) return;
      state.suggestionsPin = currentPin();
      state.suggestionsResolved = true;
      state.suggestions = data.suggestions;
      clearTimeout(state.evidenceTimer);
      render();
    });
    installMobileIntel();
    schedule(400, true);
  }
  window.WatchdogHomeAnalystIntel = {
    refresh: function () { return refresh(true); },
    profession: profession,
    state: function () { return state; }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();


/* ===== property/js/dashboard/home/home-watchdog-intelligence-brand.js ===== */
/* Property Home Watchdog Intelligence branding bridge.
   Customer-facing Intelligence copy uses the canonical product name, the Intelligence
   spectrum on the word "Intelligence", and the rotating border only on dedicated
   Intelligence surfaces. */
(function(){
'use strict';
if(window.__WATCHDOG_HOME_INTELLIGENCE_BRAND_V2__)return;
window.__WATCHDOG_HOME_INTELLIGENCE_BRAND_V2__=true;

var replacements=[
  [/WATCHDOG ANALYST INTEL/g,'WATCHDOG INTELLIGENCE'],
  [/Watchdog Analyst Intel/g,'Watchdog Intelligence'],
  [/Profession-aware Intel/g,'Watchdog Intelligence'],
  [/profession-aware Intel/g,'Watchdog Intelligence'],
  [/generalized Intel/g,'generalized Watchdog Intelligence'],
  [/Generalized Intel/g,'Generalized Watchdog Intelligence'],
  [/PERSONALIZATION REQUIRED FOR EXACT INTEL/g,'PERSONALIZE WATCHDOG INTELLIGENCE'],
  [/EXACT INTEL/g,'WATCHDOG INTELLIGENCE'],
  [/exact Intel/g,'Watchdog Intelligence'],
  [/Personalize my Intel/g,'Personalize Watchdog Intelligence'],
  [/Use generalized Intelligence for now/g,'Use generalized Watchdog Intelligence for now']
];
var intelligenceWord=/\bIntelligence\b/i;
var intelligenceSurfaceCopy=/Watchdog Intelligence|WATCHDOG INTELLIGENCE|PERSONALIZE WATCHDOG INTELLIGENCE/i;
var explicitSurfaceSelector='.wdai-role-prompt,.wd-intelligence-gate-card,[data-watchdog-intelligence-modal]';
var primaryFrameSelector='.wd-home-voice-entry,.wdai-main,.wd-intelligence-gate-card,.wdai-role-prompt,[data-watchdog-intelligence-modal]';

function ensureBrandStyle(){
  if(document.querySelector('link[data-watchdog-intelligence-brand-signature]'))return;
  var link=document.createElement('link');
  link.rel='stylesheet';
  link.href='/property/css/home/home-watchdog-intelligence-brand.css';
  link.setAttribute('data-watchdog-intelligence-brand-signature','1');
  document.head.appendChild(link);
}
function relevant(node){
  var el=node && (node.nodeType===1?node:node.parentElement);
  if(!el)return false;
  return !!el.closest('[data-watchdog-analyst-intel],.wdai,[class*="wdai"],[id*="wdai"],.wd-home-voice-entry,.wd-intelligence-gate,[data-watchdog-intelligence-modal]');
}
function replaceText(node){
  if(!node || node.nodeType!==3 || !relevant(node))return;
  var value=node.nodeValue||'';
  var next=value;
  replacements.forEach(function(pair){next=next.replace(pair[0],pair[1])});
  if(next!==value)node.nodeValue=next;
}
function replaceAttrs(root){
  var elements=[];
  if(root && root.nodeType===1)elements.push(root);
  if(root && root.querySelectorAll)elements=elements.concat(Array.prototype.slice.call(root.querySelectorAll('[aria-label],[title]')));
  elements.forEach(function(el){
    if(!relevant(el))return;
    ['aria-label','title'].forEach(function(attr){
      if(!el.hasAttribute(attr))return;
      var value=el.getAttribute(attr)||'',next=value;
      replacements.forEach(function(pair){next=next.replace(pair[0],pair[1])});
      if(next!==value)el.setAttribute(attr,next);
    });
  });
}
function skipBrandNode(node){
  var parent=node && node.parentElement;
  if(!parent)return true;
  if(parent.closest('.wd-intelligence-brand-word,[data-no-intelligence-brand]'))return true;
  return !!parent.closest('script,style,noscript,textarea,select,option');
}
function brandWord(node){
  if(!node || node.nodeType!==3 || skipBrandNode(node) || !relevant(node))return;
  var value=node.nodeValue||'';
  if(!intelligenceWord.test(value))return;
  var parts=value.split(/(Intelligence)/gi);
  if(parts.length<2)return;
  var frag=document.createDocumentFragment();
  parts.forEach(function(part){
    if(!part)return;
    if(part.toLowerCase()==='intelligence'){
      var span=document.createElement('span');
      span.className='wd-intelligence-brand-word';
      span.textContent=part;
      frag.appendChild(span);
    }else frag.appendChild(document.createTextNode(part));
  });
  node.parentNode.replaceChild(frag,node);
}
function isGenericDialog(el){
  return !!(el && el.matches && el.matches('[role="dialog"],.modal,[class*="modal"]'));
}
function approvedSurface(el){
  if(!el || !el.matches)return false;
  if(el.matches(explicitSurfaceSelector))return true;
  return isGenericDialog(el) && intelligenceSurfaceCopy.test(el.textContent||'');
}
function collectSurfaces(root){
  var surfaces=[];
  if(root && root.nodeType===1 && approvedSurface(root))surfaces.push(root);
  if(root && root.querySelectorAll){
    surfaces=surfaces.concat(Array.prototype.slice.call(root.querySelectorAll(explicitSurfaceSelector)));
    Array.prototype.forEach.call(root.querySelectorAll('[role="dialog"],.modal,[class*="modal"]'),function(el){
      if(approvedSurface(el))surfaces.push(el);
    });
  }
  return surfaces.filter(function(el,index,list){return list.indexOf(el)===index;});
}
function decorateSurfaces(root){
  collectSurfaces(root).forEach(function(surface){
    surface.classList.add('wd-intelligence-frame','wd-intelligence-modal-frame');
  });
}
function cleanupLegacyOverreach(){
  var body=document.body;
  if(!body)return;
  body.classList.remove('wd-intelligence-frame','wd-intelligence-modal-frame');
  Array.prototype.forEach.call(document.querySelectorAll('.wd-intelligence-modal-frame'),function(el){
    if(approvedSurface(el))return;
    el.classList.remove('wd-intelligence-modal-frame');
    if(!el.matches(primaryFrameSelector))el.classList.remove('wd-intelligence-frame');
  });
  Array.prototype.forEach.call(document.querySelectorAll('.wd-intelligence-brand-text'),function(el){
    el.classList.remove('wd-intelligence-brand-text');
  });
}
function brandVisibleWords(root){
  root=root||document.body;
  if(!root)return;
  if(root.nodeType===3){brandWord(root);return;}
  var walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
  var nodes=[],node;
  while((node=walker.nextNode()))nodes.push(node);
  nodes.forEach(brandWord);
}
function sweep(root){
  root=root||document.body;
  if(!root)return;
  if(root.nodeType===3){
    replaceText(root);
    brandWord(root);
    return;
  }
  var walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
  var nodes=[],node;
  while((node=walker.nextNode()))nodes.push(node);
  nodes.forEach(replaceText);
  replaceAttrs(root);
  decorateSurfaces(root);
  brandVisibleWords(root);
}
function boot(){
  ensureBrandStyle();
  cleanupLegacyOverreach();
  sweep(document.body);
  new MutationObserver(function(mutations){
    mutations.forEach(function(mutation){
      Array.prototype.forEach.call(mutation.addedNodes||[],function(node){sweep(node)});
    });
  }).observe(document.body,{childList:true,subtree:true});
}

ensureBrandStyle();
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();


/* ===== property/js/dashboard/home/home-watchdog-intelligence.js ===== */
/* Property Home · Watchdog Intelligence
   Visible Voice entry for every signed-in plan, server-authoritative entitlement
   gating on click, Intelligence branding, and Explore workspace polish. */
(function(){
'use strict';
if(window.__WATCHDOG_HOME_INTELLIGENCE__)return;
window.__WATCHDOG_HOME_INTELLIGENCE__=true;

var mountTimer=0;
var client=null;
var depsPromise=null;

function addStyle(href,key){
  if(document.querySelector('link[data-wd-intelligence="'+key+'"]'))return;
  var link=document.createElement('link');
  link.rel='stylesheet';
  link.href=href;
  link.setAttribute('data-wd-intelligence',key);
  document.head.appendChild(link);
}
function loadScript(src,key){
  return new Promise(function(resolve,reject){
    var found=document.querySelector('script[data-wd-intelligence="'+key+'"]');
    if(found){
      if(found.getAttribute('data-ready')==='1')return resolve();
      found.addEventListener('load',resolve,{once:true});
      found.addEventListener('error',reject,{once:true});
      return;
    }
    var script=document.createElement('script');
    script.src=src;
    script.async=false;
    script.setAttribute('data-wd-intelligence',key);
    script.addEventListener('load',function(){script.setAttribute('data-ready','1');resolve()},{once:true});
    script.addEventListener('error',reject,{once:true});
    document.body.appendChild(script);
  });
}
function ensureStyles(){
  addStyle('/property/css/home/home-watchdog-intelligence.css','home');
  addStyle('/property/css/data-workbench-analyst.css','analyst');
  addStyle('/property/css/watchdog-contextual-voice.css','voice-entry');
  addStyle('/property/css/watchdog-intelligence-voice.css','voice');
}
function ensureVoiceDeps(){
  if(window.WatchdogContextualAnalyst && window.WatchdogIntelligenceVoice)return Promise.resolve();
  if(depsPromise)return depsPromise;
  depsPromise=loadScript('/property/js/watchdog-contextual-analyst.js','analyst-js')
    .then(function(){return loadScript('/property/js/watchdog-intelligence-voice.js','voice-js')});
  return depsPromise;
}
function getClient(){
  if(client)return client;
  try{
    if(window.NJPTRSupabaseRuntime && typeof window.NJPTRSupabaseRuntime.createClient==='function'){
      client=window.NJPTRSupabaseRuntime.createClient();
    }
  }catch(_error){}
  return client;
}
async function accessToken(){
  var sb=getClient();
  if(!sb || !sb.auth || typeof sb.auth.getSession!=='function')return '';
  try{
    var result=await sb.auth.getSession();
    return String(result && result.data && result.data.session && result.data.session.access_token || '');
  }catch(_error){return ''}
}
async function voiceStatus(){
  var token=await accessToken();
  if(!token)return {ok:false,http_status:401,error:'Sign in required.'};
  try{
    var response=await fetch('/api/watchdog-intelligence-voice',{
      method:'POST',
      credentials:'same-origin',
      headers:{'Authorization':'Bearer '+token,'Content-Type':'application/json'},
      body:JSON.stringify({action:'status'})
    });
    var data={};
    try{data=await response.json()}catch(_error){}
    data.http_status=response.status;
    return data;
  }catch(_error){
    return {ok:false,http_status:0,error:'Watchdog Intelligence Voice could not be reached.'};
  }
}
function propertyContext(){
  var select=document.getElementById('hm-switch');
  var chosen=select && select.selectedOptions && select.selectedOptions[0];
  var pin=select ? String(select.value || '') : '';
  if(!pin){
    try{pin=new URLSearchParams(location.search).get('pin') || ''}catch(_error){}
  }
  var addressNode=document.querySelector('#hm-body .hm-id h1, #hm-body [data-property-address], #hm-body .hm-property-address');
  var address=addressNode ? String(addressNode.textContent || '').trim() : '';
  if(!address && chosen)address=String(chosen.textContent || '').split('·')[0].trim();
  var townNode=document.querySelector('#hm-body .hm-id .hm-place, #hm-body .hm-id p');
  var town=townNode ? String(townNode.textContent || '').trim() : '';
  return {pams_pin:pin,address:address,town:town};
}
function gateMarkup(){
  return '<div class="wd-intelligence-gate" id="wd-intelligence-gate" aria-hidden="true">'+
    '<section class="wd-intelligence-gate-card" role="dialog" aria-modal="true" aria-labelledby="wd-intelligence-gate-title">'+
      '<button class="wd-intelligence-gate-close" type="button" data-wd-intelligence-close aria-label="Close"><i class="fas fa-xmark"></i></button>'+
      '<div class="wd-intelligence-gate-mark"><i class="fas fa-microphone-lines"></i></div>'+
      '<span class="wd-intelligence-gate-kicker">Watchdog Intelligence · Voice</span>'+
      '<h2 id="wd-intelligence-gate-title">Watchdog Intelligence Voice</h2>'+
      '<p id="wd-intelligence-gate-copy"></p>'+
      '<div class="wd-intelligence-gate-actions" id="wd-intelligence-gate-actions"></div>'+
    '</section>'+
  '</div>';
}
function ensureGate(){
  var gate=document.getElementById('wd-intelligence-gate');
  if(gate)return gate;
  var box=document.createElement('div');
  box.innerHTML=gateMarkup();
  gate=box.firstElementChild;
  document.body.appendChild(gate);
  gate.addEventListener('click',function(event){
    if(event.target===gate || event.target.closest('[data-wd-intelligence-close]'))closeGate();
  });
  document.addEventListener('keydown',function(event){if(event.key==='Escape')closeGate()});
  return gate;
}
function closeGate(){
  var gate=document.getElementById('wd-intelligence-gate');
  if(!gate)return;
  gate.classList.remove('open');
  gate.setAttribute('aria-hidden','true');
}
function showGate(status){
  var gate=ensureGate();
  var title=gate.querySelector('#wd-intelligence-gate-title');
  var copy=gate.querySelector('#wd-intelligence-gate-copy');
  var actions=gate.querySelector('#wd-intelligence-gate-actions');
  var plan=String(status && status.plan || 'standard').toLowerCase();
  var unavailable=status && status.ok && status.eligible && !status.enabled;
  if(status && status.http_status===401){
    title.textContent='Sign in to use Watchdog Intelligence Voice';
    copy.textContent='Voice uses your saved-property context and is available only inside an authenticated Watchdog workspace.';
    actions.innerHTML='<a class="wd-intelligence-gate-primary" href="/property/account">Open account</a><button class="wd-intelligence-gate-secondary" type="button" data-wd-intelligence-close>Not now</button>';
  }else if(unavailable){
    title.textContent='Voice is temporarily unavailable';
    copy.textContent='Your account is eligible for Watchdog Intelligence Voice, but the Voice service is not available right now. Your property data and other Watchdog Intelligence tools are unaffected.';
    actions.innerHTML='<button class="wd-intelligence-gate-primary" type="button" data-wd-intelligence-close>Got it</button>';
  }else{
    title.textContent='Watchdog Intelligence Voice is a premium capability';
    if(plan==='agent' || plan==='pro'){
      copy.textContent='Your '+(plan==='agent'?'Agent':'Pro')+' plan can use Voice when the Watchdog Intelligence add-on is active. Voice is included with Pro+ and Teams.';
    }else{
      copy.textContent='Watchdog Intelligence Voice is included with Pro+ and Teams. Agent and Pro accounts can use it with the Watchdog Intelligence add-on.';
    }
    actions.innerHTML='<a class="wd-intelligence-gate-primary" href="/property/pro#plans">See Intelligence access</a><button class="wd-intelligence-gate-secondary" type="button" data-wd-intelligence-close>Not now</button>';
  }
  gate.classList.add('open');
  gate.setAttribute('aria-hidden','false');
  var close=gate.querySelector('.wd-intelligence-gate-close');
  if(close)close.focus();
}
function voiceMarkup(){
  return '<section class="wd-home-voice-entry wd-intelligence-frame" id="wd-home-voice-entry" aria-label="Watchdog Intelligence Voice">'+
    '<div class="wd-home-voice-copy">'+
      '<span class="wd-home-voice-kicker">Watchdog Intelligence · Voice</span>'+
      '<h2 class="wd-home-voice-title">Ask about what needs attention now.</h2>'+
      '<p class="wd-home-voice-sub">Uses this saved property’s governed context so you can ask a focused question without starting over.</p>'+
    '</div>'+
    '<button class="wd-home-voice-button" id="wd-home-voice-button" type="button"><i class="fas fa-microphone"></i><span>Ask Watchdog</span></button>'+
  '</section>';
}
async function openVoice(){
  var button=document.getElementById('wd-home-voice-button');
  if(!button || button.getAttribute('aria-busy')==='true')return;
  button.setAttribute('aria-busy','true');
  var original=button.innerHTML;
  button.innerHTML='<i class="fas fa-circle-notch fa-spin"></i><span>Checking access</span>';
  try{
    var status=await voiceStatus();
    if(!status || !status.ok || !status.eligible || !status.enabled){
      showGate(status || {});
      return;
    }
    await ensureVoiceDeps();
    if(!window.WatchdogContextualAnalyst || typeof window.WatchdogContextualAnalyst.open!=='function')throw new Error('Analyst unavailable');
    var property=propertyContext();
    window.WatchdogContextualAnalyst.open({
      surface:'property_home',
      title:'Ask Watchdog Intelligence',
      kicker:'WATCHDOG INTELLIGENCE',
      subtitle:'Ask a focused question about this saved property. Watchdog keeps the governed property context attached.',
      pams_pins:property.pams_pin ? [property.pams_pin] : [],
      contextLabel:property.address || 'This saved property',
      context:property,
      chips:['What needs attention now?','What changed?','Explain the tax and value story','What should I verify next?']
    });
  }catch(_error){
    showGate({ok:true,eligible:true,enabled:false});
  }finally{
    button.innerHTML=original;
    button.removeAttribute('aria-busy');
  }
}
function mountVoice(panel){
  if(document.getElementById('wd-home-voice-entry'))return;
  var box=document.createElement('div');
  box.innerHTML=voiceMarkup();
  var entry=box.firstElementChild;
  panel.parentNode.insertBefore(entry,panel);
  var button=entry.querySelector('#wd-home-voice-button');
  if(button)button.addEventListener('click',openVoice);
}
function rebrandIntelligence(panel){
  var main=panel.querySelector(':scope > .wdai-main');
  if(main)main.classList.add('wd-intelligence-frame');
  var brand=panel.querySelector('.wdai-title > span');
  if(brand && String(brand.textContent || '').trim()!=='WATCHDOG INTELLIGENCE')brand.textContent='WATCHDOG INTELLIGENCE';
  var roleLine=panel.querySelector('.wdai-role-set span');
  if(roleLine){
    Array.prototype.slice.call(roleLine.childNodes).forEach(function(node){
      if(node.nodeType===3 && /Profession-aware Intel/.test(node.nodeValue || ''))node.nodeValue=(node.nodeValue || '').replace('Profession-aware Intel','Profession-aware Intelligence');
    });
  }
  var mobile=document.getElementById('hm-mobile-intel-overlay');
  if(mobile){
    var sheet=mobile.querySelector('[aria-labelledby]');
    var close=mobile.querySelector('.mobile-intel-close');
    if(sheet)sheet.setAttribute('aria-label','Watchdog Intelligence');
    if(close)close.setAttribute('aria-label','Close Watchdog Intelligence');
  }
}
function mountExplore(){
  var header=document.querySelector('#hm-body .hm-secbar');
  if(!header || header.closest('.hm-explore-card'))return;
  var rows=[];
  var node=header.nextElementSibling;
  while(node && node.classList && node.classList.contains('sec2')){
    rows.push(node);
    node=node.nextElementSibling;
  }
  if(!rows.length)return;
  var parent=header.parentNode;
  var wrap=document.createElement('section');
  wrap.className='hm-explore-card';
  wrap.setAttribute('aria-label','Explore your property');
  parent.insertBefore(wrap,header);
  wrap.appendChild(header);
  rows.forEach(function(row){wrap.appendChild(row)});
}
function mount(){
  ensureStyles();
  var panel=document.querySelector('#hm-body .ai.wdai[data-watchdog-analyst-intel]');
  if(panel){
    rebrandIntelligence(panel);
    mountVoice(panel);
  }
  mountExplore();
}
function schedule(){clearTimeout(mountTimer);mountTimer=setTimeout(mount,90)}
function boot(){
  ensureStyles();
  ensureGate();
  mount();
  var body=document.getElementById('hm-body');
  if(body)new MutationObserver(schedule).observe(body,{childList:true,subtree:true});
  ['watchdog:intent-ready','watchdog:intent-updated','watchdog:context-refresh','watchdog:profession-updated'].forEach(function(name){window.addEventListener(name,schedule)});
}

window.WatchdogHomeIntelligence={mount:mount,openVoice:openVoice};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();


/* ===== property/js/dashboard/home/home-footer-ad-rotator.js ===== */
/* Property Home rotating ad banner.
   Mirrors the public Property Lookup rotation treatment while keeping its own slot analytics. */
(function(){
'use strict';
if(window.__WATCHDOG_HOME_FOOTER_ADS__)return;
window.__WATCHDOG_HOME_FOOTER_ADS__=true;

var SLOT='property_home_footer';
var GREENTREE='Advertisement. Greentree Mortgage, an HMA Company, is a separate company and is not affiliated with Opus Elite Real Estate. You are never required to use any particular lender, and you are free to shop for a mortgage. Nothing here is a loan commitment, an offer of credit, or a guarantee of terms.';
var JOHN='Advertisement. John Scafide is a licensed New Jersey real estate agent, NJ License #2079591, with The McKenty Team at Opus Elite Real Estate. If a property shown on Watchdog is listed by another brokerage, this is not a solicitation of that listing.';
var HEATHER='Advertisement. Heather Scafide is a licensed New Jersey real estate agent, NJ License #2192318, with The McKenty Team at Opus Elite Real Estate. If a property shown on Watchdog is listed by another brokerage, this is not a solicitation of that listing.';
var RELIEF='Advertisement for NJPropertyTaxRelief.com. This website is not affiliated with the State of New Jersey or any government agency. Estimates are informational and final eligibility depends on the official program rules and application.';
var ADS=[
 {id:'greentree-payment-before-house',advertiser:'Greentree Mortgage',campaign:'financing_context',eyebrow:'Greentree Mortgage, an HMA Company · John Varano, Branch Manager',headline:'Know the payment before you fall in love with the house.',sub:'Taxes are only part of the monthly number. Review principal, interest, taxes, insurance and escrow before you make a move.',cta:'Talk Financing',href:'https://johnvarano.com/?utm_source=watchdog&utm_medium=internal_ad&utm_campaign=greentree_financing&utm_content=property_home_payment',photo:'/johnvarano.jpg',alt:'John Varano, Branch Manager, Greentree Mortgage an HMA Company',disclosure:GREENTREE,theme:'greentree'},
 {id:'greentree-full-monthly-number',advertiser:'Greentree Mortgage',campaign:'financing_context',eyebrow:'Greentree Mortgage, an HMA Company · John Varano, Branch Manager',headline:'Know the full monthly number before you start making offers.',sub:'A payment conversation can put taxes, insurance and escrow into context before the home search gets serious.',cta:'Run the Numbers',href:'https://johnvarano.com/?utm_source=watchdog&utm_medium=internal_ad&utm_campaign=greentree_financing&utm_content=property_home_full_payment',photo:'/johnvarano.jpg',alt:'John Varano, Branch Manager, Greentree Mortgage an HMA Company',disclosure:GREENTREE,theme:'greentree'},
 {id:'john-buyer-mls',advertiser:'John Scafide Realtor',campaign:'realtor_buyer',eyebrow:'John Scafide · Licensed NJ Real Estate Agent · Opus Elite Real Estate',headline:'Found a property worth watching? See what is actually for sale.',sub:'Public records explain the property. MLS access shows what you can buy right now across New Jersey.',cta:'Search Homes',href:'/search-homes.html?utm_source=watchdog&utm_medium=internal_ad&utm_campaign=john_buyer&utm_content=property_home_mls',photo:'/johnprofile.jpg',alt:'John Scafide, licensed New Jersey real estate agent',disclosure:JOHN,theme:'john'},
 {id:'john-seller-value',advertiser:'John Scafide Realtor',campaign:'realtor_seller',eyebrow:'John Scafide · Licensed NJ Real Estate Agent · Opus Elite Real Estate',headline:'Your tax record is one piece of your home’s story. Market value is another.',sub:'If selling is on your radar, start with a current value estimate and a practical conversation about the market.',cta:'Check Home Value',href:'/home-value.html?utm_source=watchdog&utm_medium=internal_ad&utm_campaign=john_seller&utm_content=property_home_value',photo:'/johnprofile.jpg',alt:'John Scafide, licensed New Jersey real estate agent',disclosure:JOHN,theme:'john'},
 {id:'heather-buyer-guidance',advertiser:'Heather Scafide Realtor',campaign:'realtor_buyer',eyebrow:'Heather Scafide · Licensed NJ Real Estate Agent · Opus Elite Real Estate',headline:'Buying a home should feel informed, not rushed.',sub:'Move from property research to a focused South Jersey home search with a licensed professional on your side.',cta:'Ask Heather',href:'mailto:heather@heatherscafide.com?subject=Watchdog%20Buyer%20Inquiry',photo:'/heatherheadshot.png',alt:'Heather Scafide, licensed New Jersey real estate agent',disclosure:HEATHER,theme:'heather'},
 {id:'heather-seller-strategy',advertiser:'Heather Scafide Realtor',campaign:'realtor_seller',eyebrow:'Heather Scafide · Licensed NJ Real Estate Agent · Opus Elite Real Estate',headline:'Thinking about selling? Start with the facts, then build the plan.',sub:'Turn property data, timing and your goals into a practical selling strategy.',cta:'Talk About Selling',href:'mailto:heather@heatherscafide.com?subject=Watchdog%20Seller%20Inquiry',photo:'/heatherheadshot.png',alt:'Heather Scafide, licensed New Jersey real estate agent',disclosure:HEATHER,theme:'heather'},
 {id:'relief-check-benefit',advertiser:'NJ Property Tax Relief',campaign:'relief_estimator',eyebrow:'NJ Property Tax Relief · Free estimator',headline:'Your property tax relief may be worth a few minutes to check.',sub:'See how ANCHOR, Stay NJ and Senior Freeze may fit your household before you assume you do or do not qualify.',cta:'Estimate My Relief',href:'/anchor-estimator.html?utm_source=watchdog&utm_medium=internal_ad&utm_campaign=relief_estimator&utm_content=property_home_check',photo:'/favicon.svg',alt:'NJ Property Tax Relief',disclosure:RELIEF,theme:'relief',logo:true},
 {id:'relief-dont-leave-money',advertiser:'NJ Property Tax Relief',campaign:'relief_estimator',eyebrow:'NJ Property Tax Relief · Free estimator',headline:'Before you leave property tax relief on the table, run the estimate.',sub:'New Jersey relief programs can overlap. Answer a few questions for a plain-language starting point.',cta:'Start the Estimator',href:'/anchor-estimator.html?utm_source=watchdog&utm_medium=internal_ad&utm_campaign=relief_estimator&utm_content=property_home_start',photo:'/favicon.svg',alt:'NJ Property Tax Relief',disclosure:RELIEF,theme:'relief',logo:true}
];
var state={current:-1,queue:[],timer:0,visible:false,tracked:false};
function q(s,r){return (r||document).querySelector(s)}
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function theme(name){
 if(name==='john')return{bg:'linear-gradient(120deg,#0b1732,#15345f 58%,#24547e)',shadow:'rgba(8,27,56,.28)',accent:'#e6c355',sub:'#d7e3f2',button:'linear-gradient(135deg,#e0bb52,#b8972a)',buttonText:'#17203a'};
 if(name==='heather')return{bg:'linear-gradient(120deg,#17243b,#294866 58%,#3b647e)',shadow:'rgba(17,44,68,.28)',accent:'#f0cf74',sub:'#d9e7ef',button:'linear-gradient(135deg,#efd07c,#c6a347)',buttonText:'#17203a'};
 if(name==='relief')return{bg:'linear-gradient(120deg,#0b3640,#0d6870 58%,#168d96)',shadow:'rgba(8,77,83,.28)',accent:'#f0d16c',sub:'#d3eef0',button:'linear-gradient(135deg,#f0d16c,#c5a23d)',buttonText:'#102d35'};
 return{bg:'linear-gradient(120deg,#14361f,#1e6b3a 58%,#2b8a4d)',shadow:'rgba(16,60,32,.28)',accent:'#e6c355',sub:'#bfe0cb',button:'linear-gradient(135deg,#e0bb52,#b8972a)',buttonText:'#17203a'};
}
function promotion(ad){return{creative_name:ad.id,creative_slot:SLOT,promotion_id:ad.id,promotion_name:ad.campaign,items:[{item_id:ad.id,item_name:ad.headline,item_brand:ad.advertiser,item_category:'watchdog_internal_ad'}]}}
function track(name,ad){if(!ad||typeof window.gtag!=='function')return;try{window.gtag('event',name,{ad_id:ad.id,advertiser:ad.advertiser,campaign:ad.campaign,creative_slot:SLOT,destination:ad.href});if(name==='watchdog_ad_impression')window.gtag('event','view_promotion',promotion(ad));if(name==='watchdog_ad_click')window.gtag('event','select_promotion',promotion(ad))}catch(_e){}}
function trackVisible(){if(!state.visible||state.tracked||state.current<0)return;state.tracked=true;track('watchdog_ad_impression',ADS[state.current])}
function render(index){
 var banner=q('.hm-footer-ad .gt-banner');if(!banner||!ADS[index])return;
 var ad=ADS[index],t=theme(ad.theme),inner=q('.gt-banner-inner',banner),image=q('.gt-photo img',banner),photo=q('.gt-photo',banner),eyebrow=q('.gt-eyebrow',banner),headline=q('.gt-headline',banner),sub=q('.gt-sub',banner),cta=q('.gt-cta',banner),disc=q('.gt-disc',banner);
 state.current=index;state.tracked=false;banner.dataset.adId=ad.id;banner.href=ad.href;banner.setAttribute('aria-label',ad.advertiser+': '+ad.headline);
 if(/^https?:\/\//i.test(ad.href)){banner.target='_blank';banner.rel='noopener sponsored'}else{banner.removeAttribute('target');banner.removeAttribute('rel')}
 if(photo)photo.style.display='';
 if(image){image.src=ad.photo;image.alt=ad.alt;image.style.display='block';image.style.objectFit=ad.logo?'contain':'cover';image.style.background=ad.logo?'#fff':'transparent';image.style.padding=ad.logo?'10px':'0';image.style.borderColor=t.accent}
 if(eyebrow){eyebrow.textContent=ad.eyebrow;eyebrow.style.color=t.accent}
 if(headline)headline.textContent=ad.headline;
 if(sub){sub.textContent=ad.sub;sub.style.color=t.sub}
 if(cta){cta.innerHTML=esc(ad.cta)+' <i class="fas fa-arrow-right"></i>';cta.style.background=t.button;cta.style.color=t.buttonText}
 if(disc)disc.textContent=ad.disclosure;
 if(inner){inner.style.background=t.bg;inner.style.boxShadow='0 20px 50px '+t.shadow;inner.style.borderColor=t.accent+'59'}
 trackVisible();
}
function shuffle(){var order=ADS.map(function(_a,i){return i});for(var i=order.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1)),tmp=order[i];order[i]=order[j];order[j]=tmp}if(state.current>=0&&order.length>1&&order[0]===state.current){var s=order[0];order[0]=order[1];order[1]=s}state.queue=order}
function next(){if(!state.queue.length)shuffle();render(state.queue.shift())}
function schedule(){clearTimeout(state.timer);state.timer=setTimeout(function(){if(document.visibilityState!=='hidden')next();schedule()},20000+Math.floor(Math.random()*10001))}
function boot(){var banner=q('.hm-footer-ad .gt-banner');if(!banner||banner.dataset.wdAdRotator==='1')return;banner.dataset.wdAdRotator='1';banner.addEventListener('click',function(){if(state.current>=0)track('watchdog_ad_click',ADS[state.current])});if('IntersectionObserver'in window){new IntersectionObserver(function(entries){entries.forEach(function(entry){if(entry.target!==banner)return;state.visible=entry.isIntersecting&&entry.intersectionRatio>=.25;trackVisible()})},{threshold:[0,.25,.5,1]}).observe(banner)}else state.visible=true;shuffle();next();schedule()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();


/* ===== property/js/dashboard/home/home-premium-partner.js ===== */
/* Property Home premium Intelligence + partner composition.
   Watchdog Intelligence remains primary; the inline Greentree unit is a compact quarter-width rail.
   A separate rotating sponsor banner is mounted immediately before the official footer. */
(function(){
'use strict';
if(window.__WATCHDOG_HOME_PREMIUM_PARTNER__)return;
window.__WATCHDOG_HOME_PREMIUM_PARTNER__=true;
var timer=0;

function ensureAssets(){ ensureMobileRefreshStyle(); }

function ensureMobileRefreshStyle(){
  if(document.getElementById('wd-home-mobile-refresh-20260824'))return;
  var style=document.createElement('style');
  style.id='wd-home-mobile-refresh-20260824';
  style.textContent=[
    '@media(max-width:820px){',
    'body.hm-dashboard-page .hm-top-in{padding:18px 18px 20px!important;display:grid!important;grid-template-columns:52px minmax(0,1fr)!important;grid-template-areas:"back switch" "actions actions"!important;gap:14px!important;align-items:center!important}',
    'body.hm-dashboard-page .hm-back{grid-area:back!important;width:52px!important;height:52px!important;min-height:52px!important;padding:0!important;justify-content:center!important;font-size:0!important;border-radius:15px!important}',
    'body.hm-dashboard-page .hm-back i{font-size:17px!important;margin:0!important}',
    'body.hm-dashboard-page .hm-switch-label,body.hm-dashboard-page .hm-saved{display:none!important}',
    'body.hm-dashboard-page #hm-switch{grid-area:switch!important;grid-column:auto!important;width:100%!important;height:54px!important;min-height:54px!important;padding:0 16px!important;font-size:16px!important;border-radius:15px!important}',
    'body.hm-dashboard-page .hm27-page-actions{grid-area:actions!important;grid-column:auto!important;display:grid!important;width:100%!important;grid-template-columns:1fr!important;gap:0!important}',
    'body.hm-dashboard-page .hm27-page-actions .hm27-action{display:none!important}',
    'body.hm-dashboard-page .hm27-page-actions .hm27-action.primary{display:flex!important;width:100%!important;min-height:52px!important;font-size:16px!important;border-radius:15px!important}',
    'body.hm-dashboard-page .hm-hero{padding-top:4px!important}',
    'body.hm-dashboard-page .hm-wrap>.ai:not(.wdai) .ai-h img{display:none!important}',
    'body.hm-dashboard-page .hm-wrap>.ai:not(.wdai) .ai-h:before{content:"\\f6d3"!important;font-family:"Font Awesome 6 Free"!important;font-weight:900!important;width:50px!important;height:50px!important;min-width:50px!important;border-radius:15px!important;display:grid!important;place-items:center!important;background:rgba(255,255,255,.14)!important;color:#fff!important;font-size:22px!important}',
    'body.hm-dashboard-page .hm-wrap>.ai:not(.wdai) .ai-h{align-items:center!important}',
    'body.hm-dashboard-page .hm-figs{grid-template-columns:1fr!important;gap:14px!important;text-align:center!important}',
    'body.hm-dashboard-page .hm-figs>div{min-height:150px!important;padding:24px 22px!important;display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important}',
    'body.hm-dashboard-page .hm-figs dt,body.hm-dashboard-page .hm-figs dd{text-align:center!important;width:100%!important}',
    'body.hm-dashboard-page .hm-figs dd{font-size:30px!important}',
    'body.hm-dashboard-page .hm-figs dd em{font-size:14px!important}',
    'body.hm-dashboard-page .hm-secbar{margin-top:24px!important;padding:24px 22px 18px!important;background:#fff!important;border:1px solid #dfe6ef!important;border-bottom:0!important;border-radius:22px 22px 0 0!important;gap:14px!important}',
    'body.hm-dashboard-page .hm-secbar h2{font-size:22px!important}',
    'body.hm-dashboard-page .hm-secbar p{font-size:15px!important;line-height:1.5!important}',
    'body.hm-dashboard-page .hm-secbar~.sec2{background:#fff!important;border-left:1px solid #dfe6ef!important;border-right:1px solid #dfe6ef!important;padding-left:20px!important;padding-right:20px!important}',
    'body.hm-dashboard-page .hm-secbar~.sec2:last-of-type{border-radius:0 0 22px 22px!important;border-bottom:1px solid #dfe6ef!important;padding-bottom:12px!important}',
    'body.hm-dashboard-page .wd-home-agent-ad{margin-left:auto!important;margin-right:auto!important;text-align:center!important}',
    'body.hm-dashboard-page .wd-home-agent-ad>*{margin-left:auto!important;margin-right:auto!important}',
    '}',
    '@media(max-width:430px){body.hm-dashboard-page .hm-top-in{padding-left:16px!important;padding-right:16px!important}}'
  ].join('');
  document.head.appendChild(style);
}

function partner(){
  return '<aside class="wdai-partner" aria-label="Sponsored mortgage partner"><a class="wdai-partner-link" href="https://johnvarano.com/?utm_source=watchdog&utm_medium=internal_ad&utm_campaign=greentree_financing&utm_content=property_home_rail" target="_blank" rel="noopener sponsored"><div class="wdai-partner-photo"><img src="/johnvarano.jpg" alt="John Varano, Branch Manager at Greentree Mortgage, an HMA Company" loading="lazy"></div><div class="wdai-partner-copy"><span class="wdai-partner-label"><i></i> Advertisement · Mortgage partner</span><div class="wdai-partner-brand">Greentree Mortgage <small>an HMA Company</small></div><h3>Know the payment before you fall in love with the house.</h3><p>Taxes are only part of the monthly number. John Varano can help you review the payment, including escrow, before you make a move.</p><div class="wdai-partner-person"><b>John Varano</b><span>Branch Manager | Senior Loan Officer · NMLS #142739</span></div><span class="wdai-partner-cta">Talk Financing <i class="fas fa-arrow-right"></i></span><small class="wdai-partner-disc">Greentree Mortgage, an HMA Company, is a separate company and is not affiliated with Opus Elite Real Estate. You are never required to use a particular lender and are free to shop for a mortgage. Nothing here is a loan commitment, offer of credit, or guarantee of terms.</small></div></a></aside>';
}

function footerAdMarkup(){
  return '<section class="hm-footer-ad" id="hm-footer-ad" aria-label="Watchdog advertising"><div class="hm-footer-ad-in"><a href="https://johnvarano.com/" target="_blank" rel="noopener sponsored" class="gt-banner" aria-label="Sponsored Watchdog partner"><div class="gt-banner-inner"><div class="gt-photo"><img src="/johnvarano.jpg" alt="John Varano, Branch Manager, Greentree Mortgage an HMA Company" loading="lazy" onerror="this.parentNode.style.display=\'none\'"></div><div class="gt-text"><div class="gt-eyebrow">Greentree Mortgage, an HMA Company · John Varano, Branch Manager</div><div class="gt-headline">Know the payment before you fall in love with the house.</div><div class="gt-sub">Taxes are only part of the monthly number. Review principal, interest, taxes, insurance and escrow before you make a move.</div></div><div class="gt-cta">Talk Financing <i class="fas fa-arrow-right"></i></div></div><div class="gt-disc">Advertisement. Greentree Mortgage, an HMA Company, is a separate company and is not affiliated with Opus Elite Real Estate. You are never required to use any particular lender, and you are free to shop for a mortgage. Nothing here is a loan commitment, an offer of credit, or a guarantee of terms.</div></a></div></section>';
}

function mountFooterAd(){
  if(document.getElementById('hm-footer-ad'))return;var footer=document.getElementById('wd-property-footer');if(!footer)return;var box=document.createElement('div');box.innerHTML=footerAdMarkup();footer.parentNode.insertBefore(box.firstElementChild,footer);
  
}

function refreshLegacyIntelBrand(){
  var legacy=document.querySelector('#hm-body .ai:not(.wdai) .ai-h');
  if(legacy){var img=legacy.querySelector('img');if(img){img.alt='';img.setAttribute('aria-hidden','true');}}
}

function refreshAgentAd(){
  Array.prototype.forEach.call(document.querySelectorAll('#hm-body section,#hm-body article,#hm-body div'),function(el){
    var text=(el.textContent||'').replace(/\s+/g,' ').trim();
    if(text.indexOf('SELLER STRATEGY')===-1&&text.indexOf('Seller strategy')===-1)return;
    if(el.parentElement&&((el.parentElement.textContent||'').indexOf('SELLER STRATEGY')!==-1))return;
    el.classList.add('wd-home-agent-ad');
    var walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT),node;
    while((node=walker.nextNode()))if((node.nodeValue||'').indexOf('John and Heather')!==-1)node.nodeValue=node.nodeValue.replace(/John and Heather/g,'John Scafide and Heather');
  });
}

function mount(){
  ensureMobileRefreshStyle();refreshLegacyIntelBrand();refreshAgentAd();
  var panel=document.querySelector('#hm-body .ai.wdai[data-watchdog-analyst-intel]');if(!panel)return;
  var main=panel.querySelector(':scope > .wdai-main');
  if(!main){main=document.createElement('div');main.className='wdai-main';Array.prototype.slice.call(panel.children).forEach(function(child){if(!child.classList.contains('wdai-partner'))main.appendChild(child);});panel.insertBefore(main,panel.firstChild);}else{Array.prototype.slice.call(panel.children).forEach(function(child){if(child!==main&&!child.classList.contains('wdai-partner'))main.appendChild(child);});}
  if(!panel.querySelector(':scope > .wdai-partner')){var box=document.createElement('div');box.innerHTML=partner();panel.appendChild(box.firstElementChild);}
  panel.classList.add('wdai-split');
}

function schedule(){clearTimeout(timer);timer=setTimeout(mount,80)}
function boot(){ensureAssets();mountFooterAd();mount();var body=document.getElementById('hm-body');if(body)new MutationObserver(schedule).observe(body,{childList:true,subtree:true});['watchdog:intent-ready','watchdog:intent-updated','watchdog:context-refresh','watchdog:profession-updated'].forEach(function(name){window.addEventListener(name,schedule)});}

ensureAssets();
window.WatchdogHomePremiumPartner={mount:mount,mountFooterAd:mountFooterAd};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();

