/* Watchdog Property Home: data-dense individual property dashboard.
   Uses governed marker metadata for every tier and server-governed workbench hydration
   for paid marker values. Locked tiers never receive hidden real values in this module. */
(function () {
  'use strict';
  if (window.__WATCHDOG_PROPERTY_DASHBOARD__) return;
  window.__WATCHDOG_PROPERTY_DASHBOARD__ = true;

  var SUPABASE_URL = 'https://uvkvaxljhhngydvlrzom.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa';
  var PLAN_RANK = { standard: 0, agent: 1, pro: 2, pro_plus: 3, teams: 4, developer: 5 };
  var INITIAL_LIMIT = 60;
  var PAGE_SIZE = 60;
  var HYDRATE_BATCH = 80;
  var registry = null;
  var registryPromise = null;
  var client = null;
  var user = null;
  var entitlement = null;
  var preference = null;
  var currentPin = '';
  var currentSaved = null;
  var currentRecord = null;
  var markerValues = Object.create(null);
  var markerMeta = Object.create(null);
  var events = [];
  var scoreHistory = [];
  var displayLimit = INITIAL_LIMIT;
  var renderTimer = null;
  var loadToken = 0;
  var loadingMarkers = Object.create(null);
  var initialHydratedPin = '';
  var observer = null;

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>\"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function slug(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  function number(value) {
    if (value == null || value === '') return null;
    var n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function money(value) {
    var n = number(value);
    if (n == null) return '—';
    return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  }

  function compactMoney(value) {
    var n = number(value);
    if (n == null) return '—';
    if (Math.abs(n) >= 1000000) return '$' + (n / 1000000).toFixed(Math.abs(n) >= 10000000 ? 1 : 2).replace(/\.0+$/, '') + 'M';
    if (Math.abs(n) >= 1000) return '$' + (n / 1000).toFixed(Math.abs(n) >= 100000 ? 0 : 1).replace(/\.0$/, '') + 'K';
    return money(n);
  }

  function percent(value) {
    var n = number(value);
    if (n == null) return '—';
    if (Math.abs(n) > 0 && Math.abs(n) < 1) n *= 100;
    return n.toLocaleString('en-US', { maximumFractionDigits: 2 }) + '%';
  }

  function pretty(value) {
    return String(value || '').replace(/[_.-]+/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  function shortDate(value) {
    if (!value) return '';
    var d = new Date(value);
    if (!Number.isFinite(d.getTime())) return '';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function normalizePlan(value) {
    value = String(value || 'standard').toLowerCase().replace(/\+/g, '_plus').replace(/[^a-z_]/g, '');
    return PLAN_RANK[value] == null ? 'standard' : value;
  }

  function activePlan() {
    if (entitlement) {
      if (normalizePlan(entitlement.account_role) === 'developer') return 'developer';
      return normalizePlan(entitlement.plan_tier || entitlement.plan || 'standard');
    }
    if (window.NJPTRPlan) {
      var state = window.NJPTRPlan.state();
      if (state && state.effective) return normalizePlan(state.effective);
    }
    return 'standard';
  }

  function planLabel(plan) {
    plan = normalizePlan(plan);
    return ({ standard: 'Standard', agent: 'Agent', pro: 'Pro', pro_plus: 'Pro+', teams: 'Teams', developer: 'Developer' })[plan] || 'Standard';
  }

  function markerAllowed(marker, plan) {
    plan = normalizePlan(plan || activePlan());
    var tier = normalizePlan(marker && marker.tier || 'standard');
    var professions = Array.isArray(marker && marker.professions) ? marker.professions : [];
    if (plan === 'developer' || plan === 'teams' || plan === 'pro_plus') return true;
    if (plan === 'pro') return tier === 'standard' || tier === 'pro';
    if (plan === 'agent') return tier === 'standard' || (tier === 'pro' && professions.some(function (p) { return p === 'agent' || p === 'real_estate_agent'; }));
    return tier === 'standard';
  }

  function requiredPlan(marker) {
    var tier = normalizePlan(marker && marker.tier || 'standard');
    return tier === 'pro_plus' ? 'Pro+' : 'Pro';
  }

  function getPin() {
    try {
      var u = new URL(window.location.href);
      var pin = u.searchParams.get('pin');
      if (pin) return pin;
    } catch (_error) {}
    var select = document.getElementById('hm-switch');
    return select && select.value ? String(select.value) : '';
  }

  function rowForPin(pin) {
    var list = Array.isArray(window.rows) ? window.rows : [];
    for (var i = 0; i < list.length; i++) if (String(list[i].pams_pin || '') === String(pin || '')) return list[i];
    return null;
  }

  function directValue(marker, row) {
    if (!marker || !row) return null;
    var field = String(marker.field || '').toLowerCase();
    var id = String(marker.id || '').toLowerCase();
    var map = {
      address: row.address,
      street_address: row.address,
      municipality: row.town,
      town: row.town,
      county: row.county,
      zip: row.zip,
      postal: row.zip,
      block: row.block,
      lot: row.lot,
      pams_pin: row.pams_pin,
      assessed_value: row.assessed != null ? row.assessed : row.assessed_value,
      total_assessment: row.assessed != null ? row.assessed : row.assessed_value,
      annual_tax: row.last_year_tax,
      property_tax: row.last_year_tax,
      effective_tax_rate: row.effective_rate,
      watchdog_value: row.watchdog_value
    };
    if (Object.prototype.hasOwnProperty.call(row, field) && row[field] != null && row[field] !== '') return row[field];
    if (Object.prototype.hasOwnProperty.call(map, field) && map[field] != null && map[field] !== '') return map[field];
    if (/watchdog.*value|value.*watchdog/.test(id) && row.watchdog_value != null) return row.watchdog_value;
    return null;
  }

  function loadRegistry() {
    if (registry) return Promise.resolve(registry);
    if (registryPromise) return registryPromise;
    registryPromise = fetch('/property/data/marker-registry.json', { credentials: 'same-origin', headers: { accept: 'application/json' } })
      .then(function (r) { if (!r.ok) throw new Error('Marker registry ' + r.status); return r.json(); })
      .then(function (json) { registry = json || { markers: [], summary: {} }; return registry; })
      .catch(function () { registry = { markers: [], summary: {} }; return registry; });
    return registryPromise;
  }

  function ensureClient() {
    if (client || !window.supabase) return client;
    client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
        storageKey: 'sb-uvkvaxljhhngydvlrzom-auth-token'
      }
    });
    return client;
  }

  function settle(promise, fallback) {
    return Promise.resolve(promise).then(function (r) { return r; }).catch(function () { return fallback; });
  }

  function loadIdentity() {
    var db = ensureClient();
    if (!db) return Promise.resolve();
    return db.auth.getSession().then(function (result) {
      var session = result && result.data && result.data.session;
      user = session && session.user || null;
      if (!user) return;
      return Promise.all([
        settle(db.rpc('get_my_entitlement'), { data: null }),
        settle(db.from('professional_preferences').select('profession').eq('user_id', user.id).maybeSingle(), { data: null })
      ]).then(function (results) {
        var entRows = results[0] && results[0].data;
        entitlement = Array.isArray(entRows) ? (entRows[0] || null) : (entRows || null);
        preference = results[1] && results[1].data || null;
      });
    }).catch(function () {});
  }

  function resetPropertyState(pin) {
    currentPin = pin || '';
    currentSaved = rowForPin(currentPin);
    currentRecord = null;
    markerValues = Object.create(null);
    markerMeta = Object.create(null);
    events = [];
    scoreHistory = [];
    displayLimit = INITIAL_LIMIT;
    loadingMarkers = Object.create(null);
    initialHydratedPin = '';
  }

  function loadEvents(pin) {
    var db = ensureClient();
    if (!db || !user || !pin) return Promise.resolve([]);
    return db.from('property_update_events')
      .select('pams_pin,event_type,severity,title,occurred_at,marker_id')
      .eq('user_id', user.id)
      .eq('pams_pin', pin)
      .order('occurred_at', { ascending: false })
      .limit(24)
      .then(function (r) { events = r && Array.isArray(r.data) ? r.data : []; return events; })
      .catch(function () { events = []; return events; });
  }

  function scoreMarker() {
    var markers = registry && Array.isArray(registry.markers) ? registry.markers : [];
    var plan = activePlan();
    var preferred = ['watchdog.watchdog_score', 'watchdog.score', 'uniformity.score'];
    for (var i = 0; i < preferred.length; i++) {
      var exact = markers.find(function (m) { return m.id === preferred[i] && markerAllowed(m, plan); });
      if (exact) return exact;
    }
    return markers.find(function (m) {
      return markerAllowed(m, plan) && /watchdog score/i.test(String(m.label || ''));
    }) || null;
  }

  function loadScoreHistory(pin) {
    var db = ensureClient();
    var marker = scoreMarker();
    if (!db || !user || !pin || !marker) return Promise.resolve([]);
    return db.from('score_observations')
      .select('marker_id,score,observed_at,model_version')
      .eq('user_id', user.id)
      .eq('pams_pin', pin)
      .eq('marker_id', marker.id)
      .order('observed_at', { ascending: true })
      .limit(80)
      .then(function (r) { scoreHistory = r && Array.isArray(r.data) ? r.data : []; return scoreHistory; })
      .catch(function () { scoreHistory = []; return scoreHistory; });
  }

  function paidPlan() {
    return (PLAN_RANK[activePlan()] || 0) >= 1;
  }

  function initialMarkerPack() {
    if (!registry || !Array.isArray(registry.markers)) return [];
    var plan = activePlan();
    var categoryRank = {
      parcel: 0, assessment: 1, tax: 2, sale: 3, market: 4, uniformity: 5,
      appeal: 6, permits: 7, environment: 8, risk: 9, municipality: 10, change: 11
    };
    return registry.markers
      .filter(function (m) {
        return markerAllowed(m, plan) && (m.provider_status === 'live' || m.provider_status === 'partial');
      })
      .sort(function (a, b) {
        var ac = categoryRank[String(a.category || '').toLowerCase()];
        var bc = categoryRank[String(b.category || '').toLowerCase()];
        if (ac == null) ac = 99;
        if (bc == null) bc = 99;
        if (ac !== bc) return ac - bc;
        if (normalizePlan(a.tier) !== normalizePlan(b.tier)) return (PLAN_RANK[normalizePlan(a.tier)] || 0) - (PLAN_RANK[normalizePlan(b.tier)] || 0);
        return String(a.label || a.id).localeCompare(String(b.label || b.id));
      })
      .slice(0, HYDRATE_BATCH)
      .map(function (m) { return m.id; });
  }

  function mergeHydration(payload, pin) {
    if (!payload || !pin) return;
    var values = payload.markers && payload.markers[pin] || {};
    var meta = payload.meta && payload.meta[pin] || {};
    Object.keys(values).forEach(function (id) { markerValues[id] = values[id]; });
    Object.keys(meta).forEach(function (id) { markerMeta[id] = meta[id]; });
    var records = Array.isArray(payload.records) ? payload.records : [];
    var record = records.find(function (r) { return String(r.pams_pin || '') === String(pin); });
    if (record) currentRecord = Object.assign({}, currentRecord || {}, record);
  }

  function hydrate(markerIds, options) {
    options = options || {};
    var db = ensureClient();
    var pin = currentPin || getPin();
    if (!db || !user || !pin || !paidPlan()) return Promise.resolve(null);
    var allowed = (markerIds || []).filter(function (id, index, arr) {
      if (!id || arr.indexOf(id) !== index) return false;
      var marker = registry && registry.markers && registry.markers.find(function (m) { return m.id === id; });
      return marker && markerAllowed(marker, activePlan());
    }).slice(0, 500);
    if (!allowed.length) return Promise.resolve(null);
    allowed.forEach(function (id) { loadingMarkers[id] = true; });
    if (!options.silent) scheduleRender();
    return db.functions.invoke('workbench-hydrate', { body: { pams_pins: [pin], marker_ids: allowed } })
      .then(function (result) {
        if (pin !== currentPin) return null;
        if (result && result.error) throw result.error;
        mergeHydration(result && result.data, pin);
        return result && result.data;
      })
      .catch(function () { return null; })
      .finally(function () {
        allowed.forEach(function (id) { delete loadingMarkers[id]; });
        scheduleRender();
      });
  }

  function loadProperty(pin) {
    var token = ++loadToken;
    if (!pin) return Promise.resolve();
    if (pin !== currentPin) resetPropertyState(pin);
    currentSaved = rowForPin(pin) || currentSaved;
    return Promise.all([loadEvents(pin), loadScoreHistory(pin)]).then(function () {
      if (token !== loadToken || pin !== currentPin) return;
      scheduleRender();
      if (paidPlan() && initialHydratedPin !== pin) {
        initialHydratedPin = pin;
        return hydrate(initialMarkerPack(), { silent: true });
      }
    });
  }

  function markerValue(marker) {
    if (!marker || !markerAllowed(marker, activePlan())) return null;
    if (Object.prototype.hasOwnProperty.call(markerValues, marker.id)) return markerValues[marker.id];
    return directValue(marker, currentSaved);
  }

  function hasValue(value) {
    return value !== null && value !== undefined && value !== '';
  }

  function formatMarkerValue(marker, value) {
    if (!hasValue(value)) return '—';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (Array.isArray(value)) return value.length ? value.slice(0, 3).map(function (x) { return String(x); }).join(', ') + (value.length > 3 ? ' +' + (value.length - 3) : '') : 'None';
    if (typeof value === 'object') {
      if (Object.prototype.hasOwnProperty.call(value, 'display')) return String(value.display);
      if (Object.prototype.hasOwnProperty.call(value, 'value')) {
        var inner = value.value;
        return String(formatMarkerValue(marker, inner)) + (value.unit ? ' ' + String(value.unit) : '');
      }
      var keys = Object.keys(value).slice(0, 4);
      if (!keys.length) return '—';
      return keys.map(function (k) { return pretty(k) + ': ' + String(value[k]); }).join(' · ');
    }
    var n = number(value);
    var hay = [marker && marker.id, marker && marker.field, marker && marker.label].join(' ').toLowerCase();
    if (n != null) {
      if (/price|value|tax|assessment|amount|cost|rent|equity|income|balance|levy|dollar/.test(hay)) return money(n);
      if (/percent|percentage|rate|ratio|pct/.test(hay)) return percent(n);
      if (/acre/.test(hay)) return n.toLocaleString('en-US', { maximumFractionDigits: 3 }) + ' ac';
      if (/sq.?ft|square.?feet|area/.test(hay)) return n.toLocaleString('en-US', { maximumFractionDigits: 0 }) + ' sq ft';
      if (/year/.test(hay) && n > 1800 && n < 2200) return String(Math.round(n));
      return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
    }
    return String(value);
  }

  function safeFact(label, value, icon, sub) {
    return '<div class="wdpd-fact"><i class="fas ' + esc(icon || 'fa-circle-info') + '"></i><span><small>' + esc(label) + '</small><b>' + esc(value || '—') + '</b>' + (sub ? '<em>' + esc(sub) + '</em>' : '') + '</span></div>';
  }

  function factLock(title, plan, detail) {
    return '<div class="wdpd-gated-card"><span class="wdpd-lock-icon"><i class="fas fa-lock"></i></span><div><small>' + esc(plan) + ' intelligence</small><b>' + esc(title) + '</b><p>' + esc(detail) + '</p></div><a href="/property/account">Unlock ' + esc(plan) + '</a></div>';
  }

  function planAccessSummary() {
    var markers = registry && Array.isArray(registry.markers) ? registry.markers : [];
    var plan = activePlan();
    var allowed = markers.filter(function (m) { return markerAllowed(m, plan); });
    var live = allowed.filter(function (m) { return m.provider_status === 'live' || m.provider_status === 'partial'; });
    return { total: markers.length, allowed: allowed.length, live: live.length };
  }

  function topMetrics(row, record) {
    row = row || {};
    record = record || {};
    var assessed = row.assessed != null ? row.assessed : row.assessed_value;
    var tax = row.last_year_tax;
    var value = row.watchdog_value;
    var effective = row.effective_rate;
    var lastSale = paidPlan() ? record.last_sale_price : null;
    var lastSaleYear = paidPlan() ? record.last_sale_year : null;
    var access = planAccessSummary();
    return [
      { k: 'Assessed value', v: money(assessed), s: 'Current saved assessment', i: 'fa-scale-balanced' },
      { k: 'Annual tax', v: money(tax), s: 'Latest saved tax figure', i: 'fa-receipt' },
      { k: 'Watchdog value', v: money(value), s: 'Current Watchdog estimate', i: 'fa-house-circle-check' },
      { k: 'Effective rate', v: percent(effective), s: 'Tax ÷ assessment', i: 'fa-percent' },
      { k: 'Last sale', v: lastSale != null ? compactMoney(lastSale) : (paidPlan() ? '—' : 'Pro'), s: lastSaleYear ? String(lastSaleYear) : (paidPlan() ? 'No governed sale returned' : 'Unlock sale intelligence'), i: 'fa-key', locked: !paidPlan() },
      { k: 'Data access', v: access.allowed.toLocaleString('en-US'), s: access.live.toLocaleString('en-US') + ' live/partial markers in plan', i: 'fa-database' }
    ];
  }

  function metricCards() {
    return '<div class="wdpd-metrics">' + topMetrics(currentSaved, currentRecord).map(function (m) {
      return '<article class="wdpd-metric ' + (m.locked ? 'is-locked' : '') + '"><span class="wdpd-metric-icon"><i class="fas ' + esc(m.i) + '"></i></span><div><small>' + esc(m.k) + '</small><b>' + esc(m.v) + '</b><em>' + esc(m.s) + '</em></div>' + (m.locked ? '<a href="/property/account" aria-label="Upgrade for sale intelligence"><i class="fas fa-lock"></i></a>' : '') + '</article>';
    }).join('') + '</div>';
  }

  function checkpointData() {
    var row = currentSaved || {};
    var record = currentRecord || {};
    var points = [];
    if (paidPlan() && number(record.last_sale_price) != null) points.push({ label: record.last_sale_year ? 'Sale ' + record.last_sale_year : 'Last sale', value: number(record.last_sale_price) });
    var assessed = number(row.assessed != null ? row.assessed : row.assessed_value);
    if (assessed != null) points.push({ label: 'Assessment', value: assessed });
    var wd = number(row.watchdog_value);
    if (wd != null) points.push({ label: 'Watchdog', value: wd });
    return points;
  }

  function checkpointChart() {
    var points = checkpointData();
    if (!points.length) return '<div class="wdpd-empty-chart"><i class="fas fa-chart-line"></i><b>Value chart is waiting on property figures.</b><span>Watchdog will plot governed value checkpoints here as they become available.</span></div>';
    var width = 620, height = 210, padX = 44, padY = 28;
    var values = points.map(function (p) { return p.value; });
    var min = Math.min.apply(Math, values), max = Math.max.apply(Math, values);
    if (min === max) { min = Math.max(0, min * 0.85); max = max * 1.15 || 1; }
    var range = max - min || 1;
    function x(i) { return points.length === 1 ? width / 2 : padX + i * ((width - padX * 2) / (points.length - 1)); }
    function y(v) { return height - padY - ((v - min) / range) * (height - padY * 2); }
    var path = points.map(function (p, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p.value).toFixed(1); }).join(' ');
    var circles = points.map(function (p, i) {
      return '<g><circle cx="' + x(i).toFixed(1) + '" cy="' + y(p.value).toFixed(1) + '" r="5"></circle><text x="' + x(i).toFixed(1) + '" y="' + (y(p.value) - 13).toFixed(1) + '" text-anchor="middle">' + esc(compactMoney(p.value)) + '</text><text class="axis" x="' + x(i).toFixed(1) + '" y="' + (height - 5) + '" text-anchor="middle">' + esc(p.label) + '</text></g>';
    }).join('');
    return '<div class="wdpd-chart-wrap"><svg class="wdpd-chart" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="Property value checkpoints"><defs><linearGradient id="wdpd-line-fill" x1="0" x2="1"><stop offset="0%" stop-color="currentColor" stop-opacity=".08"/><stop offset="100%" stop-color="currentColor" stop-opacity=".22"/></linearGradient></defs><line class="grid" x1="' + padX + '" y1="' + (height - padY) + '" x2="' + (width - padX) + '" y2="' + (height - padY) + '"></line><path class="trend" d="' + path + '"></path>' + circles + '</svg></div>';
  }

  function scoreChart() {
    if (!scoreHistory.length) return '<div class="wdpd-score-empty"><span class="wdpd-score-orb"><i class="fas fa-wave-square"></i></span><div><b>Score history will build over time.</b><small>Each governed Watchdog observation creates another point in this trend.</small></div></div>';
    var width = 620, height = 130, px = 26, py = 18;
    var vals = scoreHistory.map(function (x) { return number(x.score); }).filter(function (x) { return x != null; });
    if (!vals.length) return '';
    var min = Math.min.apply(Math, vals), max = Math.max.apply(Math, vals);
    if (min === max) { min -= 5; max += 5; }
    var range = max - min || 1;
    function x(i) { return scoreHistory.length === 1 ? width / 2 : px + i * ((width - px * 2) / (scoreHistory.length - 1)); }
    function y(v) { return height - py - ((v - min) / range) * (height - py * 2); }
    var path = scoreHistory.map(function (p, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(number(p.score) || 0).toFixed(1); }).join(' ');
    var first = vals[0], last = vals[vals.length - 1], delta = last - first;
    return '<div class="wdpd-score-chart"><div class="wdpd-score-head"><span><small>Latest governed score</small><b>' + esc(last.toLocaleString('en-US', { maximumFractionDigits: 1 })) + '</b></span><em class="' + (delta > 0 ? 'up' : delta < 0 ? 'down' : '') + '">' + (delta > 0 ? '+' : '') + esc(delta.toFixed(1)) + ' since first observation</em></div><svg viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="Watchdog score history"><path d="' + path + '"></path></svg></div>';
  }

  function opportunityCards() {
    var row = currentSaved || {};
    var assessed = number(row.assessed != null ? row.assessed : row.assessed_value);
    var wd = number(row.watchdog_value);
    var cards = [];
    if (assessed != null && wd != null && wd > 0) {
      var gap = wd - assessed;
      var pct = assessed ? (gap / assessed * 100) : null;
      cards.push({
        icon: 'fa-arrows-left-right-to-line',
        label: 'Value spread',
        value: (gap >= 0 ? '+' : '') + money(gap),
        note: pct == null ? 'Watchdog value vs assessment' : (Math.abs(pct).toFixed(1) + '% ' + (gap >= 0 ? 'above' : 'below') + ' assessment'),
        href: '/property/fairness',
        action: 'Review fairness'
      });
    }
    var tax = number(row.last_year_tax), rate = number(row.effective_rate);
    if (tax != null) cards.push({ icon: 'fa-receipt', label: 'Tax burden', value: money(tax), note: rate != null ? percent(rate) + ' effective rate' : 'Latest saved annual tax', href: '/property/town-compare', action: 'Compare town' });
    if (events.length) cards.push({ icon: 'fa-bolt', label: 'Recent activity', value: String(events.length), note: 'Plan-authorized property changes returned', href: '/property/pulse', action: 'Open changes' });
    if (paidPlan() && currentRecord && currentRecord.last_sale_price != null) cards.push({ icon: 'fa-key', label: 'Last verified sale', value: money(currentRecord.last_sale_price), note: currentRecord.last_sale_year ? 'Recorded ' + currentRecord.last_sale_year : 'Governed sale record', href: '#wdpd-explorer', action: 'Open sale data' });
    if (!cards.length) cards.push({ icon: 'fa-shield-dog', label: 'Monitoring', value: 'Active', note: 'No new opportunity signal has been returned yet', href: '/property/pulse', action: 'View monitoring' });
    return '<div class="wdpd-opportunities">' + cards.slice(0, 4).map(function (c) {
      return '<a class="wdpd-opportunity" href="' + esc(c.href) + '"><i class="fas ' + esc(c.icon) + '"></i><span><small>' + esc(c.label) + '</small><b>' + esc(c.value) + '</b><em>' + esc(c.note) + '</em></span><u>' + esc(c.action) + ' <i class="fas fa-arrow-right"></i></u></a>';
    }).join('') + '</div>';
  }

  function identityFacts() {
    var r = currentSaved || {};
    var parts = [];
    parts.push(safeFact('Municipality', r.town || '—', 'fa-city'));
    parts.push(safeFact('County', r.county || '—', 'fa-map-location-dot'));
    parts.push(safeFact('Block / lot', [r.block, r.lot].filter(Boolean).join(' / ') || '—', 'fa-vector-square'));
    parts.push(safeFact('ZIP', r.zip || '—', 'fa-location-dot'));
    if (paidPlan() && currentRecord) {
      if (currentRecord.prop_class) parts.push(safeFact('Property class', currentRecord.prop_class, 'fa-house-chimney'));
      if (currentRecord.year_built) parts.push(safeFact('Year built', String(currentRecord.year_built), 'fa-calendar'));
      if (currentRecord.acres != null) parts.push(safeFact('Lot size', Number(currentRecord.acres).toLocaleString('en-US', { maximumFractionDigits: 3 }) + ' ac', 'fa-ruler-combined'));
      if (currentRecord.dwelling_units != null) parts.push(safeFact('Dwelling units', String(currentRecord.dwelling_units), 'fa-building'));
    }
    return '<div class="wdpd-facts">' + parts.join('') + '</div>';
  }

  function paidFactModules() {
    var plan = activePlan();
    var rank = PLAN_RANK[plan] || 0;
    var html = '';
    if (rank >= 2) {
      var r = currentRecord || {};
      html += '<article class="wdpd-paid-module"><header><span><small>Pro intelligence</small><b>Ownership & parcel record</b></span><i class="fas fa-user-shield"></i></header><div class="wdpd-mini-grid">' +
        safeFact('Owner of record', r.owner_name || 'No owner returned', 'fa-user') +
        safeFact('Building', r.building_desc || 'No building description', 'fa-house') +
        safeFact('Land assessment', money(r.land_value), 'fa-mountain-sun') +
        safeFact('Improvement assessment', money(r.improvement_value), 'fa-hammer') +
        '</div></article>';
    } else {
      html += factLock('Ownership & parcel record', 'Pro', 'Owner-of-record and extended parcel fields are requested only after entitlement is confirmed.');
    }
    if (rank >= 3) {
      var x = currentRecord || {};
      html += '<article class="wdpd-paid-module"><header><span><small>Pro+ intelligence</small><b>Deed & closing details</b></span><i class="fas fa-file-signature"></i></header><div class="wdpd-mini-grid">' +
        safeFact('Mailing address', x.mailing_address || 'No mailing address returned', 'fa-envelope') +
        safeFact('Mailing city/state', x.mailing_city_state || '—', 'fa-location-dot') +
        safeFact('Deed book / page', [x.deed_book, x.deed_page].filter(Boolean).join(' / ') || '—', 'fa-book') +
        safeFact('Parcel updated', x.parcel_last_update ? String(x.parcel_last_update) : '—', 'fa-rotate') +
        '</div></article>';
    } else {
      html += factLock('Deed & closing details', 'Pro+', 'Deep closing, mailing and deed fields are never sent to lower-tier clients by this dashboard.');
    }
    return '<div class="wdpd-paid-grid">' + html + '</div>';
  }

  function eventFeed() {
    if (!events.length) return '<div class="wdpd-event-empty"><i class="far fa-bell"></i><span><b>No plan-authorized changes returned.</b><small>Watchdog will place new assessment, tax, market and permit changes here.</small></span></div>';
    return '<div class="wdpd-event-list">' + events.slice(0, 6).map(function (e) {
      var severity = String(e.severity || 'info').toLowerCase();
      return '<a href="/property/pulse" class="wdpd-event"><span class="wdpd-event-dot ' + esc(slug(severity)) + '"></span><div><b>' + esc(e.title || pretty(e.event_type || e.marker_id || 'Property update')) + '</b><small>' + esc(shortDate(e.occurred_at)) + (e.marker_id ? ' · ' + esc(e.marker_id) : '') + '</small></div><i class="fas fa-chevron-right"></i></a>';
    }).join('') + '</div>';
  }

  function tierCounts() {
    var by = registry && registry.summary && registry.summary.by_tier || {};
    return '<div class="wdpd-tier-counts"><span><i></i><b>' + esc(String(by.standard || 0)) + '</b><small>Standard</small></span><span><i></i><b>' + esc(String(by.pro || 0)) + '</b><small>Pro</small></span><span><i></i><b>' + esc(String(by.pro_plus || 0)) + '</b><small>Pro+</small></span></div>';
  }

  function explorerState() {
    var root = document.getElementById('wdpd-explorer');
    return {
      q: root && root.querySelector('[data-wdpd-search]') ? root.querySelector('[data-wdpd-search]').value.trim().toLowerCase() : '',
      category: root && root.querySelector('[data-wdpd-category]') ? root.querySelector('[data-wdpd-category]').value : 'all',
      tier: root && root.querySelector('[data-wdpd-tier]') ? root.querySelector('[data-wdpd-tier]').value : 'all',
      provider: root && root.querySelector('[data-wdpd-provider]') ? root.querySelector('[data-wdpd-provider]').value : 'all'
    };
  }

  function filteredMarkers(state) {
    var markers = registry && Array.isArray(registry.markers) ? registry.markers : [];
    state = state || { q: '', category: 'all', tier: 'all', provider: 'all' };
    return markers.filter(function (m) {
      if (state.category !== 'all' && String(m.category || '') !== state.category) return false;
      if (state.tier !== 'all' && normalizePlan(m.tier) !== state.tier) return false;
      if (state.provider !== 'all' && String(m.provider_status || '') !== state.provider) return false;
      if (state.q) {
        var hay = [m.id, m.label, m.description, m.category, m.source_id, m.provider_note].join(' ').toLowerCase();
        if (hay.indexOf(state.q) === -1) return false;
      }
      return true;
    });
  }

  function markerStatus(marker) {
    var status = String(marker.provider_status || 'planned');
    var labels = { live: 'Live source', partial: 'Partial source', planned: 'Planned', unavailable: 'Unavailable' };
    return '<span class="wdpd-provider ' + esc(slug(status)) + '"><i></i>' + esc(labels[status] || pretty(status)) + '</span>';
  }

  function markerRow(marker) {
    var plan = activePlan();
    var allowed = markerAllowed(marker, plan);
    var provider = String(marker.provider_status || 'planned');
    var value = allowed ? markerValue(marker) : null;
    var meta = markerMeta[marker.id] || null;
    var loading = !!loadingMarkers[marker.id];
    var valueHtml = '';

    if (provider === 'planned' || provider === 'unavailable') {
      valueHtml = '<div class="wdpd-marker-state source-state"><b>' + (provider === 'planned' ? 'Source planned' : 'Source unavailable') + '</b><small>' + esc(marker.provider_note || 'This marker does not have a live provider value yet.') + '</small></div>';
    } else if (!allowed) {
      valueHtml = '<div class="wdpd-marker-state locked"><span><i class="fas fa-lock"></i><b>' + esc(requiredPlan(marker)) + ' data</b><small>Value is not requested for your current plan.</small></span><a href="/property/account">Upgrade</a></div>';
    } else if (hasValue(value)) {
      valueHtml = '<div class="wdpd-marker-value"><b>' + esc(formatMarkerValue(marker, value)) + '</b><small>' + esc(meta && meta.source || marker.provider_note || marker.source_id || 'Watchdog governed source') + '</small></div>';
    } else if (loading) {
      valueHtml = '<div class="wdpd-marker-state loading"><span class="wdpd-mini-spin"></span><b>Loading governed value…</b></div>';
    } else if (meta && meta.status) {
      var copy = {
        source_checked_no_value: 'Source checked; no value for this property',
        not_computed: 'Not computed yet',
        provider_missing: 'No live provider family connected',
        not_entitled: 'Not entitled'
      }[meta.status] || pretty(meta.status);
      valueHtml = '<div class="wdpd-marker-state"><b>' + esc(copy) + '</b><small>' + esc(meta.source || '') + '</small></div>';
    } else if (paidPlan()) {
      valueHtml = '<button class="wdpd-load-marker" type="button" data-marker-load="' + esc(marker.id) + '"><i class="fas fa-bolt"></i> Load value</button>';
    } else {
      valueHtml = '<div class="wdpd-marker-state"><b>No saved value yet</b><small>Standard facts populate when present in the current property record.</small></div>';
    }

    return '<article class="wdpd-marker-row" data-marker-id="' + esc(marker.id) + '">' +
      '<div class="wdpd-marker-main"><span class="wdpd-marker-icon"><i class="fas ' + esc(categoryIcon(marker.category)) + '"></i></span><div><div class="wdpd-marker-title"><b>' + esc(marker.label || marker.id) + '</b><span class="wdpd-tier ' + esc(normalizePlan(marker.tier)) + '">' + esc(planLabel(marker.tier)) + '</span></div><p>' + esc(marker.description || marker.id) + '</p><div class="wdpd-marker-tags"><span>' + esc(pretty(marker.category || 'data')) + '</span>' + markerStatus(marker) + (marker.proprietary ? '<span class="proprietary"><i class="fas fa-sparkles"></i> Watchdog derived</span>' : '<span>Public source</span>') + '</div></div></div>' +
      '<div class="wdpd-marker-result">' + valueHtml + '</div>' +
      '</article>';
  }

  function categoryIcon(category) {
    var c = String(category || '').toLowerCase();
    if (/tax|assessment|uniformity|appeal/.test(c)) return 'fa-scale-balanced';
    if (/sale|market|value|finance|mortgage/.test(c)) return 'fa-chart-line';
    if (/permit|building|construction/.test(c)) return 'fa-hammer';
    if (/environment|risk|flood/.test(c)) return 'fa-leaf';
    if (/municip|town|county/.test(c)) return 'fa-city';
    if (/owner|deed|title/.test(c)) return 'fa-file-signature';
    return 'fa-house';
  }

  function explorerRowsHtml(state) {
    var list = filteredMarkers(state);
    var shown = list.slice(0, displayLimit);
    return '<div class="wdpd-explorer-summary"><span><b>' + esc(list.length.toLocaleString('en-US')) + '</b> markers match</span><span><b>' + esc(shown.length.toLocaleString('en-US')) + '</b> shown</span></div><div class="wdpd-marker-list">' + shown.map(markerRow).join('') + '</div>' + (shown.length < list.length ? '<button class="wdpd-show-more" type="button" data-wdpd-more><i class="fas fa-plus"></i> Show ' + Math.min(PAGE_SIZE, list.length - shown.length) + ' more markers</button>' : '');
  }

  function explorerHtml() {
    var markers = registry && Array.isArray(registry.markers) ? registry.markers : [];
    var categories = Array.from(new Set(markers.map(function (m) { return String(m.category || 'other'); }))).sort();
    var plan = activePlan();
    return '<section class="wdpd-explorer" id="wdpd-explorer"><header class="wdpd-section-head"><div><span class="wdpd-kicker">ALL PROPERTY DATA</span><h3>Property Data Explorer</h3><p>Search the full governed marker catalog. Watchdog requests paid values only after entitlement is confirmed and only when a section needs them.</p></div><div class="wdpd-explorer-actions">' + (paidPlan() ? '<button type="button" data-wdpd-load-visible><i class="fas fa-bolt"></i> Load visible data</button>' : '<a href="/property/account"><i class="fas fa-lock-open"></i> Unlock governed data</a>') + '</div></header>' +
      tierCounts() +
      '<div class="wdpd-filters"><label class="wdpd-search"><i class="fas fa-magnifying-glass"></i><input type="search" data-wdpd-search placeholder="Search markers, fields, sources…" autocomplete="off"></label><label><span>Category</span><select data-wdpd-category><option value="all">All categories</option>' + categories.map(function (c) { return '<option value="' + esc(c) + '">' + esc(pretty(c)) + '</option>'; }).join('') + '</select></label><label><span>Tier</span><select data-wdpd-tier><option value="all">All tiers</option><option value="standard">Standard</option><option value="pro">Pro</option><option value="pro_plus">Pro+</option></select></label><label><span>Provider</span><select data-wdpd-provider><option value="all">All provider states</option><option value="live">Live</option><option value="partial">Partial</option><option value="planned">Planned</option><option value="unavailable">Unavailable</option></select></label></div>' +
      '<div class="wdpd-access-note"><i class="fas fa-shield-halved"></i><span><b>' + esc(planLabel(plan)) + ' access is active.</b><small>Locked rows show catalog metadata only. Real paid values are never embedded in those rows.</small></span></div>' +
      '<div data-wdpd-results>' + explorerRowsHtml({ q: '', category: 'all', tier: 'all', provider: 'all' }) + '</div></section>';
  }

  function headerHtml() {
    var r = currentSaved || {};
    var access = planAccessSummary();
    var address = r.address || 'Saved property';
    var loc = [r.town, r.county, r.zip].filter(Boolean).join(' · ');
    return '<section class="wdpd-hero"><div class="wdpd-hero-glow"></div><div class="wdpd-hero-copy"><span class="wdpd-kicker"><i class="fas fa-shield-dog"></i> PROPERTY INTELLIGENCE</span><h2>' + esc(address) + '</h2><p>' + esc(loc || 'New Jersey property record') + '</p><div class="wdpd-hero-meta"><span><i class="fas fa-location-crosshairs"></i> PIN ' + esc(r.pams_pin || currentPin || '—') + '</span>' + (r.kind ? '<span><i class="fas fa-bookmark"></i> ' + esc(pretty(r.kind)) + '</span>' : '') + '</div></div><div class="wdpd-hero-side"><span class="wdpd-plan-badge ' + esc(activePlan()) + '"><i class="fas fa-crown"></i>' + esc(planLabel(activePlan())) + '</span><div class="wdpd-coverage"><small>Marker access</small><b>' + esc(access.allowed.toLocaleString('en-US')) + '<em>/ ' + esc(access.total.toLocaleString('en-US')) + '</em></b><span>' + esc(access.live.toLocaleString('en-US')) + ' live/partial in plan</span></div><button type="button" data-wdpd-refresh><i class="fas fa-rotate"></i> Refresh intelligence</button></div></section>';
  }

  function renderDashboard() {
    var body = document.getElementById('hm-body');
    if (!body || !registry) return;
    var pin = getPin();
    if (!pin) return;
    if (pin !== currentPin) {
      resetPropertyState(pin);
      loadProperty(pin);
    } else {
      currentSaved = rowForPin(pin) || currentSaved;
    }
    var old = document.getElementById('wd-property-dashboard');
    var root = old || document.createElement('section');
    root.id = 'wd-property-dashboard';
    root.className = 'wdpd';
    root.setAttribute('data-pin', pin);
    root.innerHTML = headerHtml() + metricCards() +
      '<div class="wdpd-primary-grid"><article class="wdpd-panel wdpd-value-panel"><header class="wdpd-panel-head"><div><span class="wdpd-kicker">VALUE & TAX</span><h3>Property checkpoints</h3><p>Only figures available to the current plan are plotted.</p></div><i class="fas fa-chart-line"></i></header>' + checkpointChart() + '<div class="wdpd-score-slot"><h4>Watchdog score history</h4>' + scoreChart() + '</div></article>' +
      '<article class="wdpd-panel"><header class="wdpd-panel-head"><div><span class="wdpd-kicker">OPPORTUNITY</span><h3>Signals worth opening</h3><p>Data-backed reasons to investigate this property, not seller profiling.</p></div><i class="fas fa-crosshairs"></i></header>' + opportunityCards() + '</article></div>' +
      '<section class="wdpd-section"><header class="wdpd-section-head"><div><span class="wdpd-kicker">PROPERTY RECORD</span><h3>At-a-glance facts</h3><p>Core saved-property facts stay visible while deeper ownership and closing fields follow plan controls.</p></div></header>' + identityFacts() + paidFactModules() + '</section>' +
      '<div class="wdpd-secondary-grid"><section class="wdpd-panel"><header class="wdpd-panel-head"><div><span class="wdpd-kicker">CHANGE INTELLIGENCE</span><h3>Recent property activity</h3><p>Events are already filtered by server-side plan policies.</p></div><a href="/property/pulse">View all <i class="fas fa-arrow-right"></i></a></header>' + eventFeed() + '</section><section class="wdpd-panel wdpd-catalog-panel"><header class="wdpd-panel-head"><div><span class="wdpd-kicker">DATA COVERAGE</span><h3>Governed marker catalog</h3><p>' + esc(String(registry.summary && registry.summary.total || (registry.markers || []).length)) + ' distinct fields and calculated statistics registered.</p></div><a href="#wdpd-explorer">Explore <i class="fas fa-arrow-down"></i></a></header>' + tierCounts() + '<div class="wdpd-catalog-copy"><i class="fas fa-database"></i><span><b>Every row carries tier, source and provider state.</b><small>Planned or unavailable data is labeled as such rather than presented as an upgrade unlock.</small></span></div></section></div>' +
      explorerHtml() +
      '<div class="wdpd-legacy-divider"><span>Detailed Watchdog tools continue below</span></div>';
    if (!old) body.insertBefore(root, body.firstChild);
    bindDashboard(root);
  }

  function refreshExplorerResults(root) {
    root = root || document.getElementById('wdpd-explorer');
    if (!root) return;
    var results = root.querySelector('[data-wdpd-results]');
    if (!results) return;
    results.innerHTML = explorerRowsHtml(explorerState());
  }

  function bindDashboard(root) {
    if (!root || root.dataset.bound === 'true') return;
    root.dataset.bound = 'true';
    root.addEventListener('input', function (event) {
      if (event.target && event.target.matches('[data-wdpd-search]')) {
        displayLimit = INITIAL_LIMIT;
        refreshExplorerResults();
      }
    });
    root.addEventListener('change', function (event) {
      if (event.target && event.target.matches('[data-wdpd-category],[data-wdpd-tier],[data-wdpd-provider]')) {
        displayLimit = INITIAL_LIMIT;
        refreshExplorerResults();
      }
    });
    root.addEventListener('click', function (event) {
      var load = event.target.closest && event.target.closest('[data-marker-load]');
      if (load) { event.preventDefault(); hydrate([load.getAttribute('data-marker-load')]); return; }
      var more = event.target.closest && event.target.closest('[data-wdpd-more]');
      if (more) { event.preventDefault(); displayLimit += PAGE_SIZE; refreshExplorerResults(); return; }
      var visible = event.target.closest && event.target.closest('[data-wdpd-load-visible]');
      if (visible) {
        event.preventDefault();
        var ids = filteredMarkers(explorerState()).filter(function (m) { return markerAllowed(m, activePlan()) && (m.provider_status === 'live' || m.provider_status === 'partial'); }).slice(0, HYDRATE_BATCH).map(function (m) { return m.id; });
        hydrate(ids);
        return;
      }
      var refresh = event.target.closest && event.target.closest('[data-wdpd-refresh]');
      if (refresh) {
        event.preventDefault();
        var pin = getPin();
        resetPropertyState(pin);
        loadProperty(pin);
        scheduleRender();
      }
    });
  }

  function scheduleRender() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(renderDashboard, 90);
  }

  function observeHome() {
    var body = document.getElementById('hm-body');
    if (!body || observer) return;
    observer = new MutationObserver(function (mutations) {
      var external = mutations.some(function (m) {
        return Array.prototype.some.call(m.addedNodes || [], function (n) {
          return !(n && n.nodeType === 1 && n.id === 'wd-property-dashboard');
        }) || Array.prototype.some.call(m.removedNodes || [], function (n) { return n && n.nodeType === 1 && n.id === 'wd-property-dashboard'; });
      });
      if (external || !document.getElementById('wd-property-dashboard')) scheduleRender();
    });
    observer.observe(body, { childList: true });
  }

  function boot() {
    ensureClient();
    observeHome();
    Promise.all([loadRegistry(), loadIdentity()]).then(function () {
      var pin = getPin();
      if (pin) resetPropertyState(pin);
      renderDashboard();
      if (pin) loadProperty(pin);
    });
    document.addEventListener('change', function (event) {
      if (event.target && event.target.id === 'hm-switch') {
        setTimeout(function () {
          var pin = getPin();
          resetPropertyState(pin);
          renderDashboard();
          loadProperty(pin);
        }, 120);
      }
    });
    document.addEventListener('njptr:plan-change', function () {
      initialHydratedPin = '';
      scheduleRender();
      if (currentPin) loadProperty(currentPin);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
