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
