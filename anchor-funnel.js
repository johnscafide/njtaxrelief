(function () {
  'use strict';

  var STORAGE_FIRST = 'njptr_anchor_first_touch_v1';
  var STORAGE_LAST = 'njptr_anchor_last_touch_v1';
  var SESSION_KEY = 'njptr_anchor_session_v1';
  var CAMPAIGN_KEYS = ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','gclid','fbclid','msclkid'];

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
  var attribution = initAttribution();
  var sid = sessionId();

  function cleanParams(params) {
    var out = {};
    Object.keys(params || {}).forEach(function (key) {
      var value = params[key];
      if (value === undefined || value === null || value === '') return;
      out[key] = typeof value === 'string' ? value.slice(0, 250) : value;
    });
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
    return {
      sessionId: sid,
      firstTouch: attribution.first,
      lastTouch: attribution.last,
      firstTouchSummary: touchSummary(attribution.first),
      lastTouchSummary: touchSummary(attribution.last)
    };
  }

  document.addEventListener('watchdog:address-selected', function (event) {
    track('anchor_address_selected', {
      field_id: event.target && event.target.id,
      google_selected: true
    });
  });
  track('anchor_estimator_view', {
    utm_source: attribution.last.utm_source || 'direct',
    utm_medium: attribution.last.utm_medium || '(none)',
    utm_campaign: attribution.last.utm_campaign || '(none)'
  });

  window.AnchorFunnel = {
    track: track,
    score: score,
    leadContext: leadContext,
    sessionId: sid
  };
})();
