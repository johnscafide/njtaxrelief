(function () {
  'use strict';

  var STORAGE_FIRST = 'njptr_anchor_first_touch_v1';
  var STORAGE_LAST = 'njptr_anchor_last_touch_v1';
  var STORAGE_REFERRAL = 'njptr_anchor_referral_source_v1';
  var STORAGE_REFERRAL_DETAIL = 'njptr_anchor_referral_detail_v1';
  var SESSION_KEY = 'njptr_anchor_session_v1';
  var CAMPAIGN_KEYS = ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','gclid','fbclid','msclkid'];
  var REFERRAL_LABELS = {
    google: 'Google',
    yahoo: 'Yahoo',
    bing: 'Bing / Microsoft',
    friend_family: 'Friend or Family',
    ai_assistant: 'AI Assistant / Chatbot',
    social_media: 'Social Media',
    youtube: 'YouTube',
    email_newsletter: 'Email / Newsletter',
    professional_referral: 'Realtor / Professional',
    direct: 'Direct / Already knew us',
    other: 'Other'
  };

  var verifiedAddressValue = '';
  var verifiedGooglePlaceId = '';
  var submitWrapped = false;

  function ensureWatchdogHandoff() {
    if (!/\/anchor-estimator\.html\/?$/i.test(location.pathname)) return;
    if (window.__wdAnchorHandoff || document.querySelector('script[src*="anchor-watchdog-handoff.js"]')) return;
    var script = document.createElement('script');
    script.src = '/anchor-watchdog-handoff.js';
    script.async = false;
    script.dataset.anchorHandoffBootstrap = '1';
    (document.head || document.documentElement).appendChild(script);
  }

  ensureWatchdogHandoff();

  function safeParse(raw) {
    try { return raw ? JSON.parse(raw) : null; } catch (_) { return null; }
  }
  function safeGet(storage, key) {
    try { return storage.getItem(key); } catch (_) { return null; }
  }
  function safeSet(storage, key, value) {
    try { storage.setItem(key, value); } catch (_) {}
  }
  function makeId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'a-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }
  function campaignFromUrl() {
    var q = new URLSearchParams(location.search);
    var out = {};
    var found = false;
    CAMPAIGN_KEYS.forEach(function (key) {
      var value = q.get(key);
      if (value) { out[key] = value.slice(0, 250); found = true; }
    });
    out.landing_path = location.pathname + location.search;
    out.referrer = document.referrer || '';
    out.captured_at = new Date().toISOString();
    return { data: out, hasCampaign: found };
  }
  function initAttribution() {
    var current = campaignFromUrl();
    var first = safeParse(safeGet(localStorage, STORAGE_FIRST));
    var last = safeParse(safeGet(localStorage, STORAGE_LAST));
    if (!first) {
      first = current.data;
      safeSet(localStorage, STORAGE_FIRST, JSON.stringify(first));
    }
    if (current.hasCampaign || !last) {
      last = current.data;
      safeSet(localStorage, STORAGE_LAST, JSON.stringify(last));
    }
    return { first: first, last: last || current.data };
  }
  function sessionId() {
    var id = safeGet(sessionStorage, SESSION_KEY);
    if (!id) { id = makeId(); safeSet(sessionStorage, SESSION_KEY, id); }
    return id;
  }
  function referralSelection() {
    var sourceEl = document.getElementById('est-referral-source');
    var detailEl = document.getElementById('est-referral-detail');
    var source = sourceEl ? String(sourceEl.value || '').trim() : (safeGet(sessionStorage, STORAGE_REFERRAL) || '');
    var detail = detailEl ? String(detailEl.value || '').trim() : (safeGet(sessionStorage, STORAGE_REFERRAL_DETAIL) || '');
    return {
      source: source,
      label: REFERRAL_LABELS[source] || source,
      detail: detail
    };
  }
  function saveReferral(source, detail) {
    safeSet(sessionStorage, STORAGE_REFERRAL, source || '');
    safeSet(sessionStorage, STORAGE_REFERRAL_DETAIL, detail || '');
  }
  function addressState() {
    var input = document.getElementById('est-address');
    var current = input ? String(input.value || '').trim() : '';
    var selected = !!input &&
      input.dataset.googleAddress === '1' &&
      !!verifiedAddressValue &&
      current === verifiedAddressValue;

    return {
      selected: selected,
      value: selected ? verifiedAddressValue : current,
      placeId: selected ? (verifiedGooglePlaceId || input.dataset.googlePlaceId || '') : ''
    };
  }

  var attribution = initAttribution();
  var sid = sessionId();

  function cleanParams(params) {
    var out = {};
    Object.keys(params || {}).forEach(function (key) {
      var value = params[key];
      if (value === undefined || value === null || value === '') return;
      out[key] = typeof value === 'string' ? value.slice(0, 250) : value;
    });
    var referral = referralSelection();
    if (referral.source) out.self_reported_source = referral.source.slice(0, 80);
    if (referral.detail) out.self_reported_source_detail = referral.detail.slice(0, 120);
    out.anchor_session_id = sid;
    return out;
  }
  function track(name, params) {
    var data = cleanParams(params || {});
    if (typeof window.gtag === 'function') window.gtag('event', name, data);
    try {
      window.dispatchEvent(new CustomEvent('anchor:funnel-event', { detail: { name: name, params: data } }));
    } catch (_) {}
  }
  function score(input) {
    input = input || {};
    var points = 0;
    if (input.qualified) points += 15;
    if (input.emailVerified) points += 10;
    if (input.address) points += 8;
    if (input.googleAddress) points += 5;
    if (input.tenure === 'own') points += 7;
    if (input.sellInterest) points += 25;
    if (input.buyInterest) points += 18;
    if (input.sellWhen === '0-3 months') points += 20;
    else if (input.sellWhen === '3-6 months') points += 12;
    else if (input.sellWhen === '6-12 months') points += 6;
    if (input.buyWhen === '0-3 months') points += 14;
    else if (input.buyWhen === '3-6 months') points += 9;
    else if (input.buyWhen === '6-12 months') points += 5;
    points = Math.min(100, points);
    return { score: points, band: points >= 70 ? 'hot' : points >= 45 ? 'warm' : points >= 25 ? 'engaged' : 'nurture' };
  }
  function touchSummary(touch) {
    touch = touch || {};
    return CAMPAIGN_KEYS.map(function (key) { return touch[key] ? key + '=' + touch[key] : ''; }).filter(Boolean).join(' | ') || 'direct / no campaign parameters';
  }
  function leadContext() {
    var referral = referralSelection();
    var address = addressState();
    return {
      sessionId: sid,
      firstTouch: attribution.first,
      lastTouch: attribution.last,
      firstTouchSummary: touchSummary(attribution.first),
      lastTouchSummary: touchSummary(attribution.last),
      selfReportedSource: referral.source,
      selfReportedSourceLabel: referral.label,
      selfReportedSourceDetail: referral.detail,
      googleAddressSelected: address.selected,
      googlePlaceId: address.placeId,
      verifiedAddress: address.selected ? address.value : ''
    };
  }

  function ensureStyles() {
    if (document.getElementById('anchor-lead-enhancement-styles')) return;
    var style = document.createElement('style');
    style.id = 'anchor-lead-enhancement-styles';
    style.textContent = [
      '.anchor-google-status{margin-top:7px;font-size:12px;line-height:1.35;color:#5a6070;display:flex;align-items:flex-start;gap:6px;}',
      '.anchor-google-status.is-valid{color:#17663a;font-weight:650;}',
      '.anchor-google-status.is-error{color:#a12222;font-weight:650;}',
      '.anchor-google-status i{margin-top:2px;}',
      '.anchor-referral-row{margin-top:2px;}',
      '.anchor-referral-help{font-size:12px;line-height:1.35;color:#5a6070;margin-top:7px;}',
      '.anchor-referral-detail-wrap[hidden]{display:none!important;}',
      '.est-input.anchor-field-error{border-color:#b42318!important;box-shadow:0 0 0 3px rgba(180,35,24,.10)!important;}'
    ].join('');
    document.head.appendChild(style);
  }

  function setAddressStatus(state, message) {
    var status = document.getElementById('est-address-google-status');
    var input = document.getElementById('est-address');
    if (!status) return;

    status.className = 'anchor-google-status' + (state === 'valid' ? ' is-valid' : state === 'error' ? ' is-error' : '');
    if (input) input.classList.toggle('anchor-field-error', state === 'error');
    var icon = state === 'valid' ? 'fa-circle-check' : state === 'error' ? 'fa-circle-exclamation' : 'fa-location-dot';
    status.innerHTML = '<i class="fas ' + icon + '"></i><span>' + message + '</span>';
  }

  function invalidateAddress(showError) {
    var input = document.getElementById('est-address');
    verifiedAddressValue = '';
    verifiedGooglePlaceId = '';
    if (input) {
      input.dataset.googleAddress = '0';
      delete input.dataset.googlePlaceId;
    }
    setAddressStatus(
      showError ? 'error' : 'idle',
      showError
        ? 'Select your property from the Google address suggestions before continuing.'
        : 'Start typing, then choose your property from the Google suggestions to verify it.'
    );
  }

  function getStateCode(place) {
    var components = (place && place.address_components) || [];
    for (var i = 0; i < components.length; i += 1) {
      var types = components[i].types || [];
      if (types.indexOf('administrative_area_level_1') !== -1) {
        return String(components[i].short_name || '').toUpperCase();
      }
    }
    return '';
  }

  function markGoogleAddress(place) {
    var input = document.getElementById('est-address');
    if (!input) return;

    var formatted = String((place && place.formatted_address) || input.value || '').trim();
    var placeId = String((place && place.place_id) || '').trim();
    var state = getStateCode(place);

    if (!formatted || !placeId) {
      invalidateAddress(true);
      track('anchor_address_selection_invalid', { reason: 'missing_google_place' });
      return;
    }
    if (state && state !== 'NJ') {
      invalidateAddress(true);
      input.value = formatted;
      setAddressStatus('error', 'Please choose a New Jersey property address.');
      track('anchor_address_selection_invalid', { reason: 'outside_new_jersey', state: state });
      return;
    }

    input.value = formatted;
    input.dataset.googleAddress = '1';
    input.dataset.googlePlaceId = placeId;
    verifiedAddressValue = formatted;
    verifiedGooglePlaceId = placeId;
    setAddressStatus('valid', 'Verified Google address selected.');

    try {
      input.dispatchEvent(new CustomEvent('watchdog:address-selected', {
        bubbles: true,
        detail: {
          formattedAddress: formatted,
          placeId: placeId,
          state: state || 'NJ'
        }
      }));
    } catch (_) {
      track('anchor_address_selected', {
        field_id: 'est-address',
        google_selected: true,
        google_place_id: placeId
      });
    }
  }

  function bindAddressInput() {
    var input = document.getElementById('est-address');
    if (!input || input.dataset.anchorValidationBound === '1') return;
    input.dataset.anchorValidationBound = '1';
    input.dataset.googleAddress = '0';
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('aria-describedby', 'est-address-google-status');

    if (!document.getElementById('est-address-google-status')) {
      var status = document.createElement('div');
      status.id = 'est-address-google-status';
      status.className = 'anchor-google-status';
      input.insertAdjacentElement('afterend', status);
    }
    invalidateAddress(false);

    input.addEventListener('input', function () {
      if (String(input.value || '').trim() !== verifiedAddressValue) invalidateAddress(false);
    });
  }

  function initializePlacesAutocomplete() {
    bindAddressInput();
    var input = document.getElementById('est-address');
    if (!input || input.dataset.anchorPlacesBound === '1') return true;
    if (!window.google || !google.maps || !google.maps.places || !google.maps.places.Autocomplete) return false;

    input.dataset.anchorPlacesBound = '1';
    var autocomplete = new google.maps.places.Autocomplete(input, {
      componentRestrictions: { country: 'us' },
      types: ['address'],
      fields: ['formatted_address', 'place_id', 'address_components']
    });

    autocomplete.addListener('place_changed', function () {
      markGoogleAddress(autocomplete.getPlace());
    });
    input.__anchorGoogleAutocomplete = autocomplete;
    return true;
  }

  // Google Maps JS invokes this callback from the script tag already on anchor-estimator.html.
  window.initAddressAutocomplete = function () {
    ensureLeadEnhancements();
    if (!initializePlacesAutocomplete()) {
      setAddressStatus('error', 'Google address verification could not load. Please refresh before submitting.');
    }
  };

  function toggleReferralDetail() {
    var sourceEl = document.getElementById('est-referral-source');
    var wrap = document.getElementById('est-referral-detail-wrap');
    var label = document.getElementById('est-referral-detail-label');
    var detail = document.getElementById('est-referral-detail');
    if (!sourceEl || !wrap || !detail) return;

    var source = sourceEl.value;
    var needsDetail = source === 'other' || source === 'ai_assistant';
    wrap.hidden = !needsDetail;
    if (label) label.textContent = source === 'ai_assistant' ? 'Which AI assistant? (optional)' : 'Where did you find us? *';
    detail.placeholder = source === 'ai_assistant'
      ? 'e.g. ChatGPT, Gemini, Perplexity'
      : 'Tell us where you found us';
    if (!needsDetail) {
      detail.value = '';
      detail.classList.remove('anchor-field-error');
    }
    saveReferral(source, needsDetail ? detail.value.trim() : '');
  }

  function injectReferralQuestion() {
    if (document.getElementById('est-referral-source')) return;
    var address = document.getElementById('est-address');
    if (!address) return;
    var addressRow = address.closest('.est-field-row');
    if (!addressRow) return;

    var row = document.createElement('div');
    row.className = 'est-field-row anchor-referral-row';
    row.innerHTML = [
      '<div class="est-field">',
      '  <label class="est-label" for="est-referral-source">Where did you find us? <span class="est-required">*</span></label>',
      '  <select class="est-input" id="est-referral-source" aria-required="true">',
      '    <option value="">Select one</option>',
      '    <option value="google">Google</option>',
      '    <option value="yahoo">Yahoo</option>',
      '    <option value="bing">Bing / Microsoft</option>',
      '    <option value="friend_family">Friend or Family</option>',
      '    <option value="ai_assistant">AI Assistant / Chatbot</option>',
      '    <option value="social_media">Social Media</option>',
      '    <option value="youtube">YouTube</option>',
      '    <option value="email_newsletter">Email / Newsletter</option>',
      '    <option value="professional_referral">Realtor / Professional</option>',
      '    <option value="direct">Direct / Already knew us</option>',
      '    <option value="other">Other</option>',
      '  </select>',
      '  <div class="anchor-referral-help">This helps us measure which channels actually bring people to the estimator.</div>',
      '</div>',
      '<div class="est-field anchor-referral-detail-wrap" id="est-referral-detail-wrap" hidden>',
      '  <label class="est-label" id="est-referral-detail-label" for="est-referral-detail">Where did you find us? *</label>',
      '  <input class="est-input" id="est-referral-detail" type="text" maxlength="120" placeholder="Tell us where you found us">',
      '</div>'
    ].join('');
    addressRow.insertAdjacentElement('afterend', row);

    var sourceEl = document.getElementById('est-referral-source');
    var detailEl = document.getElementById('est-referral-detail');
    var storedSource = safeGet(sessionStorage, STORAGE_REFERRAL) || '';
    var storedDetail = safeGet(sessionStorage, STORAGE_REFERRAL_DETAIL) || '';

    if (sourceEl && REFERRAL_LABELS[storedSource]) sourceEl.value = storedSource;
    if (detailEl) detailEl.value = storedDetail;
    toggleReferralDetail();

    if (sourceEl) {
      sourceEl.addEventListener('change', function () {
        sourceEl.classList.remove('anchor-field-error');
        toggleReferralDetail();
        var referral = referralSelection();
        track('anchor_referral_source_selected', {
          referral_source: referral.source,
          referral_source_label: referral.label
        });
      });
    }
    if (detailEl) {
      detailEl.addEventListener('input', function () {
        detailEl.classList.remove('anchor-field-error');
        var referral = referralSelection();
        saveReferral(referral.source, referral.detail);
      });
    }
  }

  function validateReferral() {
    var sourceEl = document.getElementById('est-referral-source');
    var detailEl = document.getElementById('est-referral-detail');
    var referral = referralSelection();

    if (!referral.source || !REFERRAL_LABELS[referral.source]) {
      if (sourceEl) {
        sourceEl.classList.add('anchor-field-error');
        sourceEl.focus();
      }
      track('anchor_referral_source_blocked', { reason: 'missing_source' });
      alert('Please tell us where you found us before continuing.');
      return false;
    }
    if (referral.source === 'other' && !referral.detail) {
      if (detailEl) {
        detailEl.classList.add('anchor-field-error');
        detailEl.focus();
      }
      track('anchor_referral_source_blocked', { reason: 'missing_other_detail' });
      alert('Please tell us where you found us.');
      return false;
    }
    saveReferral(referral.source, referral.detail);
    return true;
  }

  function validateGoogleAddress() {
    var input = document.getElementById('est-address');
    var state = addressState();
    if (state.selected) return true;

    if (input) input.focus();
    invalidateAddress(true);
    track('anchor_address_validation_blocked', {
      reason: input && input.value ? 'typed_without_google_selection' : 'missing_address'
    });
    alert('Please select your property address from the Google suggestions so it can be verified before continuing.');
    return false;
  }

  function wrapEstimatorSubmit() {
    if (submitWrapped || typeof window.estSubmit !== 'function') return false;
    var originalSubmit = window.estSubmit;

    window.estSubmit = function () {
      ensureLeadEnhancements();
      if (!validateGoogleAddress()) return;
      if (!validateReferral()) return;

      var context = leadContext();
      track('anchor_lead_form_validated', {
        google_address: true,
        google_place_id: context.googlePlaceId,
        referral_source: context.selfReportedSource
      });
      return originalSubmit.apply(this, arguments);
    };
    window.estSubmit.__anchorStrictAddressWrapped = true;
    submitWrapped = true;
    return true;
  }

  function ensureLeadEnhancements() {
    ensureStyles();
    bindAddressInput();
    injectReferralQuestion();
    initializePlacesAutocomplete();
    wrapEstimatorSubmit();
  }

  document.addEventListener('watchdog:address-selected', function (event) {
    var detail = event.detail || {};
    var input = document.getElementById('est-address');
    if (input && input.dataset.googleAddress === '1') {
      verifiedAddressValue = String(detail.formattedAddress || input.value || '').trim();
      verifiedGooglePlaceId = String(detail.placeId || input.dataset.googlePlaceId || '').trim();
      if (verifiedGooglePlaceId) input.dataset.googlePlaceId = verifiedGooglePlaceId;
    }
    track('anchor_address_selected', {
      field_id: event.target && event.target.id,
      google_selected: true,
      google_place_id: verifiedGooglePlaceId || ''
    });
  });

  function installWhenReady() {
    ensureLeadEnhancements();
    var tries = 0;
    var timer = setInterval(function () {
      tries += 1;
      ensureLeadEnhancements();
      if (submitWrapped && initializePlacesAutocomplete()) clearInterval(timer);
      else if (tries >= 60) clearInterval(timer);
    }, 250);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installWhenReady);
  } else {
    installWhenReady();
  }

  track('anchor_estimator_view', {
    utm_source: attribution.last.utm_source || 'direct',
    utm_medium: attribution.last.utm_medium || '(none)',
    utm_campaign: attribution.last.utm_campaign || '(none)'
  });

  window.AnchorFunnel = {
    track: track,
    score: score,
    leadContext: leadContext,
    sessionId: sid,
    referralSelection: referralSelection,
    addressState: addressState
  };
})();
