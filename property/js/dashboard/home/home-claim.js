/* Property Home "Claim this home" entry.
 *
 * Public property pages link to /home?pin=PIN&claim=1 (and ...#photo for the
 * photo link). Property Home (property/js/dashboard/home/index.js section of
 * property/js/home.js) calls into this module:
 *   - signed out: signIn() sends the visitor to the email-code sign-in with a
 *     return URL back to this same clean /home?pin=...&claim=1 address;
 *   - signed in: start(ctx) saves the property as the visitor's home when it
 *     is not saved yet and opens the existing postcard verification
 *     (window.dbVerify -> NJPTRVerification) for it;
 *   - already verified: shows the home with a small confirmation and, for
 *     #photo, opens the existing photo upload on the property hero.
 * Copy for the status line lives in property/home/index.html (#hm-claim-status).
 * Only public parcel fields are read; owner names and mailing fields never are.
 */
(function () {
  'use strict';

  var PIN_PATTERN = /^[0-9A-Za-z_.\-]{5,40}$/;
  var NJ_PARCEL = 'https://services2.arcgis.com/XVOqAjTOJ5P6ngMu/ArcGIS/rest/services/Parcels_Composite_NJ_WM/FeatureServer/0/query';
  // Property location fields only. Never request owner names or the owner
  // mailing fields (ST_ADDRESS, CITY_STATE, ZIP5, ZIP_CODE).
  var PARCEL_FIELDS = 'PAMS_PIN,PROP_LOC,MUN_NAME,COUNTY,PCLBLOCK,PCLLOT,NET_VALUE,LAST_YR_TX';

  function request() {
    var params;
    try { params = new URLSearchParams(location.search); } catch (_error) { return null; }
    var pin = String(params.get('pin') || '').trim();
    if (params.get('claim') !== '1' || !PIN_PATTERN.test(pin)) return null;
    return { pin: pin, photo: location.hash === '#photo' };
  }

  function signIn() {
    var runtime = window.NJPTRSupabaseRuntime;
    if (!request() || !runtime || typeof runtime.onboardingUrl !== 'function') return false;
    // Replace, not assign, so Back does not land on a page that redirects again.
    location.replace(runtime.onboardingUrl(location.pathname + location.search + location.hash));
    return true;
  }

  function showStatus(state) {
    var box = document.getElementById('hm-claim-status');
    if (!box) return;
    Array.prototype.forEach.call(box.querySelectorAll('[data-claim-state]'), function (node) {
      node.hidden = node.getAttribute('data-claim-state') !== state;
    });
    box.setAttribute('data-state', state);
    box.hidden = false;
  }

  function titleCase(value) {
    return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim()
      .replace(/(^|[\s\-\/])([a-z])/g, function (_all, space, letter) { return space + letter.toUpperCase(); });
  }

  function fetchParcel(pin) {
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = setTimeout(function () { if (controller) controller.abort(); }, 12000);
    var url = NJ_PARCEL + '?' + new URLSearchParams({
      where: "PAMS_PIN='" + pin + "'",
      outFields: PARCEL_FIELDS,
      returnGeometry: 'false',
      f: 'json'
    }).toString();
    return fetch(url, controller ? { signal: controller.signal } : undefined).then(function (response) {
      clearTimeout(timer);
      if (!response.ok) throw new Error('parcel lookup failed');
      return response.json();
    }).then(function (data) {
      var feature = data && data.features && data.features[0];
      var p = feature && feature.attributes;
      if (!p || !p.PROP_LOC) return null;
      var assessed = +p.NET_VALUE || 0, tax = +p.LAST_YR_TX || 0;
      return {
        pams_pin: pin,
        address: titleCase(p.PROP_LOC),
        town: String(p.MUN_NAME || '').trim(),
        county: String(p.COUNTY || '').trim(),
        block: String(p.PCLBLOCK || '').trim(),
        lot: String(p.PCLLOT || '').trim(),
        assessed: assessed || null,
        last_year_tax: tax || null,
        effective_rate: assessed > 0 && tax > 0 ? +(tax / assessed * 100).toFixed(3) : null
      };
    }, function (error) { clearTimeout(timer); throw error; });
  }

  function reducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  // The photo upload lives on the property hero (property-imagery-runtime.js
  // adds "Add your photo" to .hm-shot for a saved home). Scroll there and open
  // it once it appears; if it never does, the hero is still in view.
  function openPhoto() {
    var tries = 0;
    (function look() {
      var hero = document.querySelector('#hm-body .hm-shot');
      var button = hero && hero.querySelector('.wd-photo-add');
      if (button) {
        hero.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'center' });
        button.click();
        return;
      }
      if (++tries < 40) { setTimeout(look, 250); return; }
      if (hero) hero.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'center' });
    })();
  }

  function verifyLater(row) {
    showStatus('pending');
    var box = document.getElementById('hm-claim-status');
    var again = box && box.querySelector('[data-claim-verify]');
    if (again && !again.__wdClaimBound) {
      again.__wdClaimBound = true;
      again.addEventListener('click', function () { openVerification(row); });
    }
  }

  function openVerification(row) {
    if (typeof window.dbVerify !== 'function') return;
    window.dbVerify(row.pams_pin, row.address || '', row.town || '', row.zip || '');
  }

  function isVerified(row) { return !!row && row.verify_level === 'mail'; }

  function start(ctx) {
    var claim = request();
    if (!claim || !ctx || !ctx.client) return Promise.resolve(null);
    var saved = (ctx.rows || []).filter(function (r) { return r && r.pams_pin === claim.pin; });
    var verified = saved.filter(isVerified)[0];
    if (verified) {
      if (ctx.current !== verified && typeof ctx.show === 'function') ctx.show(verified);
      showStatus('verified');
      if (claim.photo) openPhoto();
      return Promise.resolve(verified);
    }

    var home = saved.filter(function (r) { return r.kind === 'home'; })[0];
    if (home) {
      if (ctx.current !== home && typeof ctx.show === 'function') ctx.show(home);
      verifyLater(home);
      openVerification(home);
      return Promise.resolve(home);
    }

    // Not saved as a home yet: use what is already saved (a watchlist row) or
    // the public parcel record, save it as this person's home, then verify.
    var known = saved[0];
    var source = known && known.address && known.town
      ? Promise.resolve({
          pams_pin: claim.pin, address: known.address, town: known.town, county: known.county || '',
          block: known.block || '', lot: known.lot || '', assessed: known.assessed || null,
          last_year_tax: known.last_year_tax || null, effective_rate: known.effective_rate || null
        })
      : fetchParcel(claim.pin);
    return source.then(function (parcel) {
      if (!parcel) { showStatus('unavailable'); return null; }
      var payload = Object.assign({ kind: 'home' }, parcel);
      // Only a ZIP already saved from the property's own address is reused.
      if (known && known.zip) payload.zip = known.zip;
      return ctx.client.rpc('save_property', { p: payload }).then(function (saveResult) {
        if (saveResult && saveResult.error) throw saveResult.error;
        return ctx.client.from('saved_properties').select('*')
          .eq('pams_pin', claim.pin).eq('kind', 'home').limit(1).maybeSingle();
      }).then(function (readBack) {
        var row = (readBack && readBack.data) || Object.assign({ id: 'claim-' + claim.pin, created_at: new Date().toISOString() }, payload);
        if (typeof ctx.show === 'function') ctx.show(row);
        verifyLater(row);
        openVerification(row);
        return row;
      });
    }).catch(function () {
      showStatus('unavailable');
      if (typeof ctx.toast === 'function') ctx.toast('We could not open that home just now');
      return null;
    });
  }

  window.WatchdogHomeClaim = Object.freeze({ request: request, signIn: signIn, start: start });
})();
