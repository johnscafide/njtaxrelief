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
  function loadRuntime() {
    loadScript('njw96-search-runtime', '/property/js/search-refresh-runtime.js?v=20260812a', function () {
      loadScript('njw96-search-finalize', '/property/js/search-refresh-finalize.js?v=20260812a', function () {
        loadScript('njw96-search-polish', '/property/js/search-polish-runtime.js?v=20260812a', function () {
          loadScript('njw96-search-corrections', '/property/js/search-corrections.js?v=20260812b', function () {
            loadScript('njw96-search-corrections-v2', '/property/js/search-corrections-v2.js?v=20260812c');
          });
        });
      });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadRuntime, { once: true }); else loadRuntime();
})();
