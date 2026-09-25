/* Shared presentation and interaction entrypoint for the Dashboard/Home preview. */
(function (window, document) {
  'use strict';

  var DATA = window.WatchdogPreviewData;
  var STATE_LABELS = {
    available: 'Available',
    source_checked_no_value: 'Source checked · no value',
    not_computed: 'Not computed',
    provider_missing: 'Provider missing',
    not_entitled: 'Not included in plan',
    dependency_missing: 'Dependency missing',
    stale: 'Stale',
    invalid: 'Invalid',
    planned: 'Planned'
  };

  function text(value) { return String(value == null ? '' : value); }
  function escape(value) {
    return text(value).replace(/[&<>"']/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
    });
  }
  function byId(id) { return document.getElementById(id); }
  function shortName(user) {
    var metadata = user && user.user_metadata || {};
    var name = metadata.full_name || metadata.name || user && user.email || 'there';
    return text(name).split(/\s+/)[0];
  }
  function date(value) {
    var parsed = value ? new Date(value) : null;
    return parsed && Number.isFinite(parsed.getTime())
      ? new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(parsed)
      : 'Not reported';
  }
  function paintDate() {
    var now = new Date();
    if (byId('hm27-date-label')) byId('hm27-date-label').textContent = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    if (byId('hm27-day-label')) byId('hm27-day-label').textContent = now.toLocaleDateString('en-US', { weekday: 'long' });
  }
  function paintChromeUser(user) {
    var metadata = user && user.user_metadata || {};
    var name = metadata.full_name || metadata.name || user && user.email || 'Watchdog';
    var avatar = byId('hm27-avatar');
    if (avatar) avatar.textContent = text(name).trim().charAt(0).toUpperCase() || 'W';
  }
  function navMarkup(page) {
    var current = page === 'home' ? '/preview/home/' : '/preview/';
    var links = [
      ['/preview/', 'fa-table-columns', 'Dashboard'],
      ['/preview/home/', 'fa-house', 'Property Home'],
      ['/town-compare', 'fa-code-compare', 'Town Compare'],
      ['/robust/', 'fa-gauge-high', 'ROBUST Framework'],
      ['/pulse', 'fa-wave-square', 'Change Intelligence'],
      ['/agent-desk', 'fa-bullseye', 'Agent Control'],
      ['/scan', 'fa-magnifying-glass-chart', 'Appeal Scanner'],
      ['/data-workbench', 'fa-table-list', 'Data Workbench'],
      ['/data-center', 'fa-database', 'Data Center'],
      ['/pro', 'fa-briefcase', 'Professional Hub'],
      ['/account', 'fa-user-gear', 'Account']
    ];
    return '<header class="hm27-topbar"><div class="hm27-top-in"><div class="hm27-brand-side">' +
      '<button id="hm27-menu" class="hm27-menu" type="button" aria-label="Open navigation" aria-controls="hm27-nav" aria-expanded="false"><i class="fas fa-bars" aria-hidden="true"></i></button>' +
      '<a class="hm27-brand" href="/dashboard"><span class="hm27-brand-mark"><i class="fas fa-dog" aria-hidden="true"></i></span><span class="hm27-brand-copy"><b>Watchdog</b><small>PROPERTY INTELLIGENCE</small></span></a></div>' +
      '<div class="hm27-top-right"><div class="hm27-date"><i class="far fa-calendar-days" aria-hidden="true"></i><span><b id="hm27-date-label">Today</b><small id="hm27-day-label"></small></span></div>' +
      '<a class="hm27-notify" href="/pulse" aria-label="Property notifications"><i class="far fa-bell" aria-hidden="true"></i></a>' +
      '<a class="hm27-profile" href="/account" aria-label="Open profile and account"><span id="hm27-avatar" class="hm27-avatar-fallback">W</span><i class="fas fa-chevron-down" aria-hidden="true"></i></a></div></div></header>' +
      '<aside class="hm27-nav" id="hm27-nav" aria-hidden="true"><button class="hm27-nav-backdrop" type="button" data-hm27="nav-close" aria-label="Close menu"></button>' +
      '<div class="hm27-nav-panel"><div class="hm27-nav-head"><a class="hm27-brand" href="/dashboard"><span class="hm27-brand-mark"><i class="fas fa-dog" aria-hidden="true"></i></span><span class="hm27-brand-copy"><b>Watchdog</b><small>PROPERTY INTELLIGENCE</small></span></a>' +
      '<button class="hm27-nav-close" type="button" data-hm27="nav-close" aria-label="Close navigation"><i class="fas fa-xmark" aria-hidden="true"></i></button></div>' +
      '<nav class="hm27-nav-links" aria-label="Watchdog navigation">' + links.map(function (item) {
        return '<a href="' + item[0] + '"' + (item[0] === current ? ' class="active" aria-current="page"' : '') + '><i class="fas ' + item[1] + '" aria-hidden="true"></i><span>' + escape(item[2]) + '</span></a>';
      }).join('') + '</nav><div class="hm27-nav-foot"><button type="button" data-hm27="signout"><i class="fas fa-arrow-right-from-bracket" aria-hidden="true"></i> Sign out</button></div></div></aside>';
  }
  function navOpen(open) {
    var nav = byId('hm27-nav');
    var trigger = byId('hm27-menu');
    if (!nav) return;
    nav.classList.toggle('open', !!open);
    nav.setAttribute('aria-hidden', open ? 'false' : 'true');
    document.body.classList.toggle('hm-nav-open', !!open);
    if (trigger) trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      var close = nav.querySelector('.hm27-nav-close');
      if (close) close.focus();
    } else if (trigger) trigger.focus();
  }
  function bindChrome() {
    if (document.body.dataset.wdpChromeBound === '1') return;
    document.body.dataset.wdpChromeBound = '1';
    var trigger = byId('hm27-menu');
    if (trigger) trigger.addEventListener('click', function () { navOpen(true); });
    document.addEventListener('click', async function (event) {
      var action = event.target.closest && event.target.closest('[data-hm27]');
      if (!action) return;
      var name = action.getAttribute('data-hm27');
      if (name === 'nav-close') {
        navOpen(false);
        return;
      }
      if (name === 'signout') {
        event.preventDefault();
        try {
          var runtime = window.NJPTRSupabaseRuntime;
          if (runtime && runtime.createClient) await runtime.createClient().auth.signOut();
        } finally {
          location.assign('/');
        }
      }
    });
    document.addEventListener('keydown', function (event) { if (event.key === 'Escape') navOpen(false); });
  }
  function numeric(value) {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
  }
  function currency(value) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
  }
  function displayValue(value) {
    if (value && typeof value === 'object') return escape(JSON.stringify(value));
    return escape(value);
  }
  function markerValue(marker, forcedFormat) {
    if (!marker || marker.state !== 'available' || marker.value == null) return '<span class="wdp-muted">No available value</span>';
    var format = forcedFormat || marker.format || '';
    if (format === 'currency' || /currency|dollar|usd/i.test(format) || /\$/.test(text(marker.unit))) {
      var amount = typeof marker.value === 'number' ? currency(marker.value) : displayValue(marker.value);
      return amount;
    }
    var value = typeof marker.value === 'number' ? numeric(marker.value) : displayValue(marker.value);
    return value + (marker.unit ? ' <span class="wdp-unit">' + escape(marker.unit) + '</span>' : '');
  }
  function stateClass(marker) {
    var state = marker && marker.state || 'provider_missing';
    return state === 'available' ? 'is-available' : state === 'stale' ? 'is-stale' : 'is-missing';
  }
  function stateLabel(marker) {
    if (marker && marker.conflict_state === 'conflict') return 'Conflicting observations';
    return STATE_LABELS[marker && marker.state] || 'No current value';
  }
  function metricMarker(entry, id) { return DATA.getMarker(entry && entry.snapshot, id); }
  function sourceLabel(marker) {
    return marker && (marker.source || marker.resolved_source || marker.provider_note) || 'Source not reported';
  }
  function markerRow(marker, snapshotCheckedAt) {
    var status = stateLabel(marker);
    var value = markerValue(marker);
    var source = sourceLabel(marker);
    var observed = marker && marker.observed_at ? date(marker.observed_at) : 'Not reported';
    var checked = date(marker && marker.checked_at || snapshotCheckedAt);
    var conflict = marker && marker.conflict_state === 'conflict';
    var evidence = '';
    if (conflict && Array.isArray(marker.observations)) {
      evidence = '<details class="wdp-observations"><summary>See ' + marker.observations.length + ' observations</summary><ul>' + marker.observations.map(function (observation) {
        return '<li><b>' + escape(observation.provider_kind || 'Observation') + (observation.truth_class ? ' · ' + escape(observation.truth_class) : '') + '</b><span>' + displayValue(observation.value) + '</span><small>' + escape(observation.source || 'Source not reported') + ' · ' + escape(observation.observation_kind || 'Observation') + ' · Authority ' + escape(observation.authority_rank == null ? 'not ranked' : observation.authority_rank) + ' · ' + escape(date(observation.observed_at || observation.checked_at)) + (observation.provider_contract ? ' · ' + escape(observation.provider_contract) : '') + '</small></li>';
      }).join('') + '</ul></details>';
    }
    var definition = marker && (marker.description || marker.unit || marker.field || marker.provider_contract)
      ? '<small class="wdp-marker-definition">' + escape(marker.description || 'Registry definition not provided.') + (marker.unit ? ' · Unit: ' + escape(marker.unit) : '') + (marker.field ? ' · Field: ' + escape(marker.field) : '') + '</small>'
      : '<small class="wdp-marker-definition">Registry definition not provided.</small>';
    return '<tr class="' + (conflict ? 'has-conflict' : '') + '"><th scope="row"><span class="wdp-marker-name">' + escape(marker.label || marker.id) + '</span><code>' + escape(marker.id) + '</code>' + definition + '</th>' +
      '<td class="wdp-value-cell">' + value + (evidence ? evidence : '') + '</td>' +
      '<td><span class="wdp-state ' + stateClass(marker) + '">' + escape(status) + '</span>' + (marker && marker.provider_note ? '<small class="wdp-cell-note">' + escape(marker.provider_note) + '</small>' : '') + '</td>' +
      '<td><span>' + escape(source) + '</span><small class="wdp-cell-note">' + escape(marker && marker.provider_kind || 'Provider not reported') + ' · ' + escape(marker && marker.truth_class || 'Truth class not reported') + ' · Authority ' + escape(marker && marker.authority_rank != null ? marker.authority_rank : 'not ranked') + (marker && marker.authority_policy_version ? ' · Policy ' + escape(marker.authority_policy_version) : '') + '</small></td>' +
      '<td><span>' + escape(observed) + '</span><small class="wdp-cell-note">Checked ' + escape(checked) + '</small></td></tr>';
  }
  function evidenceTable(entry) {
    var snapshot = entry && entry.snapshot;
    var markers = snapshot && Array.isArray(snapshot.markers) ? snapshot.markers : [];
    if (!markers.length) return '<div class="wdp-empty-inline">No governed markers were returned for this property.</div>';
    var conflictCount = Number(snapshot.conflict_count || 0);
    return '<div class="wdp-table-wrap"><table class="wdp-evidence-table"><thead><tr><th>Marker and registry definition</th><th>Canonical value</th><th>Data state</th><th>Source and authority</th><th>Timing</th></tr></thead><tbody>' +
      markers.map(function (marker) { return markerRow(marker, snapshot.snapshot_checked_at); }).join('') +
      '</tbody></table></div><p class="wdp-evidence-foot">' + markers.length + ' governed markers · ' + conflictCount + ' conflicts retained · Contract ' + escape(snapshot.contract_version || DATA.contract) + '</p>';
  }
  function badge(label, className) { return '<span class="wdp-badge ' + (className || '') + '">' + escape(label) + '</span>'; }
  function propertyTitle(entry) {
    var canonical = metricMarker(entry, 'property.address');
    return canonical && canonical.state === 'available' && canonical.value
      ? text(canonical.value)
      : 'Saved record · ' + (entry.property.address || 'Property address unavailable');
  }
  function propertyPlace(entry) {
    var town = metricMarker(entry, 'property.municipality');
    var county = metricMarker(entry, 'property.county');
    var canonicalTown = town && town.state === 'available' && town.value;
    var canonicalCounty = county && county.state === 'available' && county.value;
    var place = [canonicalTown || entry.property.town, canonicalCounty || entry.property.county].filter(Boolean).join(', ');
    if (place && !(canonicalTown || canonicalCounty)) return 'Saved location · ' + place;
    return place || 'Location not reported';
  }
  function renderKpi(metric) {
    var coverage = metric.available_count + ' of ' + metric.property_count + ' properties';
    return '<article class="wdp-kpi"><span>' + escape(metric.label) + '</span><strong>' + (metric.value == null ? '—' : currency(metric.value)) + '</strong><small>' + escape(metric.method) + ' ' + escape(coverage) + ' have an available value' + (metric.complete ? '' : '; incomplete values are excluded') + '</small></article>';
  }
  function renderDashboard(data) {
    var heading = byId('wdp-heading');
    if (heading) heading.innerHTML = '<span class="wdp-eyebrow">YOUR WATCHDOG WORKSPACE</span><h1>Good to see you, ' + escape(shortName(data.user)) + '.</h1><p>Property facts come from the governed Watchdog data contract. Each result keeps its source and freshness attached.</p>';
    byId('wdp-kpis').innerHTML = '<article class="wdp-kpi"><span>Saved properties</span><strong>' + data.properties.length + '</strong><small>Distinct property identifiers</small></article>' + data.summaries.map(renderKpi).join('');
    var rows = data.entries.map(function (entry, index) {
      var assessed = metricMarker(entry, 'property.assessed_value');
      var tax = metricMarker(entry, 'property.annual_tax');
      var snapshot = entry.snapshot;
      return '<article class="wdp-property-card"><div class="wdp-property-heading"><div><span class="wdp-property-index">PROPERTY ' + String(index + 1).padStart(2, '0') + '</span><h2>' + escape(propertyTitle(entry)) + '</h2><p>' + escape(propertyPlace(entry)) + '</p></div><a class="wdp-link" href="/preview/home/?pin=' + encodeURIComponent(entry.property.pams_pin) + '">Open property Home <span aria-hidden="true">→</span></a></div>' +
        '<div class="wdp-property-metrics">' + renderFact('Assessed value', assessed) + renderFact('Annual property tax', tax) + '</div>' +
        '<div class="wdp-property-meta">' + (snapshot ? badge(snapshot.available_count + ' available', 'is-available') + badge(snapshot.missing_count + ' missing or gated', 'is-muted') + (snapshot.conflict_count ? badge(snapshot.conflict_count + ' conflict' + (snapshot.conflict_count === 1 ? '' : 's'), 'is-conflict') : '') : badge('Snapshot unavailable', 'is-missing')) +
        '<span>Checked ' + escape(date(snapshot && snapshot.snapshot_checked_at)) + '</span></div>' +
        '<details class="wdp-evidence"><summary>Inspect all returned markers and source evidence</summary>' + evidenceTable(entry) + '</details></article>';
    });
    byId('wdp-properties').innerHTML = rows.join('') || '<div class="wdp-empty"><h2>No saved properties yet</h2><p>Add a property to your Watchdog workspace to see its governed data here.</p><a class="wdp-button" href="/property/">Find a property</a></div>';
    byId('wdp-governance').innerHTML = governanceFootnote(data);
  }
  function renderFact(label, marker) {
    if (!marker) return '<div class="wdp-fact"><span>' + escape(label) + '</span><strong>—</strong><small>Marker not returned</small></div>';
    var currencyFact = /assessment|property tax|market value/i.test(label);
    return '<div class="wdp-fact"><span>' + escape(label) + '</span><strong>' + markerValue(marker, currencyFact ? 'currency' : '') + '</strong><small>' + escape(stateLabel(marker)) + ' · ' + escape(sourceLabel(marker)) + '</small></div>';
  }
  function governanceFootnote(data) {
    var packs = Array.isArray(data.packs) ? data.packs.map(function (pack) { return pack.label + ' (' + pack.added + ')'; }).join(' · ') : 'No pack manifest returned';
    return '<div class="wdp-governance-copy"><span class="wdp-governance-mark">DATA CONTRACT</span><div><b>One governed result per marker</b><p>Authority policy selects the canonical observation by source authority and recency. Conflicting observations remain visible. Missing values are never converted to zero.</p><small>Contract ' + escape(data.contract) + ' · Registry ' + escape(data.registry_version || 'not reported') + ' · Packs ' + escape(packs) + '</small></div></div>';
  }
  function renderHome(data, preferredPin) {
    var picker = byId('wdp-property-picker');
    var options = data.properties.map(function (property) {
      var label = escape(property.address || property.pams_pin) + (property.town ? ' · ' + escape(property.town) : '');
      return '<option value="' + escape(property.pams_pin) + '"' + (property.pams_pin === data.selected_pin ? ' selected' : '') + '>' + label + '</option>';
    }).join('');
    picker.innerHTML = options;
    picker.disabled = data.properties.length < 2;
    var entry = data.entries[0];
    if (!entry) {
      byId('wdp-home-title').innerHTML = '<div class="wdp-empty"><h2>No selected property</h2><p>This property is not in your saved Watchdog workspace.</p><a class="wdp-button" href="/preview/">Return to Dashboard preview</a></div>';
      byId('wdp-home-facts').innerHTML = '';
      byId('wdp-home-evidence').innerHTML = '';
      return;
    }
    var snapshot = entry.snapshot;
    byId('wdp-home-title').innerHTML = '<span class="wdp-eyebrow">PROPERTY HOME · DATA PREVIEW</span><h1>' + escape(propertyTitle(entry)) + '</h1><p>' + escape(propertyPlace(entry)) + '</p><div class="wdp-property-meta">' + (snapshot ? badge(snapshot.available_count + ' available', 'is-available') + badge(snapshot.missing_count + ' missing or gated', 'is-muted') + (snapshot.conflict_count ? badge(snapshot.conflict_count + ' conflicts preserved', 'is-conflict') : '') : badge('Snapshot unavailable', 'is-missing')) + '<span>Checked ' + escape(date(snapshot && snapshot.snapshot_checked_at)) + '</span></div>';
    var assessed = metricMarker(entry, 'property.assessed_value');
    var annualTax = metricMarker(entry, 'property.annual_tax');
    var marketValue = metricMarker(entry, 'property.market_value');
    byId('wdp-home-facts').innerHTML = renderFact('Assessed value', assessed) + renderFact('Annual property tax', annualTax) + renderFact('Estimated market value', marketValue);
    byId('wdp-home-evidence').innerHTML = evidenceTable(entry);
    byId('wdp-governance').innerHTML = governanceFootnote(data);
    if (preferredPin && entry.property.pams_pin !== preferredPin) {
      byId('wdp-home-alert').innerHTML = '<div class="wdp-alert">The requested property is not among your saved properties. Showing your first saved property instead.</div>';
    }
  }
  function showLoading() {
    byId('wdp-loading').hidden = false;
    byId('wdp-content').hidden = true;
    byId('wdp-gate').hidden = true;
    byId('wdp-error').hidden = true;
  }
  function showGate() {
    byId('wdp-loading').hidden = true;
    byId('wdp-content').hidden = true;
    byId('wdp-gate').hidden = false;
    byId('wdp-error').hidden = true;
  }
  function showError(error) {
    byId('wdp-loading').hidden = true;
    byId('wdp-content').hidden = true;
    byId('wdp-gate').hidden = true;
    byId('wdp-error').hidden = false;
    var message = error && error.code === 'semantic_contract_mismatch'
      ? 'The data service returned a different contract version. No values were shown.'
      : 'We could not load the governed property data. Try again in a moment.';
    byId('wdp-error-message').textContent = message;
  }
  function signIn() {
    var runtime = window.NJPTRSupabaseRuntime;
    var returnTo = location.pathname + location.search + location.hash;
    if (runtime && typeof runtime.openOnboarding === 'function') runtime.openOnboarding(returnTo);
    else location.href = '/property/dashboard/';
  }
  async function start() {
    var page = document.body.getAttribute('data-preview-page');
    var requestedPin = new URLSearchParams(location.search).get('pin') || '';
    if (!byId('hm27-menu')) byId('wdp-chrome').innerHTML = navMarkup(page);
    paintDate();
    bindChrome();
    showLoading();
    if (!DATA) return showError(new Error('Preview data runtime is unavailable.'));
    try {
      var data = await DATA.load(page, requestedPin);
      if (!data.signed_in) return showGate();
      paintChromeUser(data.user);
      byId('wdp-loading').hidden = true;
      byId('wdp-content').hidden = false;
      if (page === 'home') renderHome(data, requestedPin);
      else renderDashboard(data);
    } catch (error) {
      console.error('[Watchdog preview] governed data request failed', error);
      showError(error);
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('[data-wdp-signin]').forEach(function (button) { button.addEventListener('click', signIn); });
    var picker = byId('wdp-property-picker');
    if (picker) picker.addEventListener('change', function () {
      var next = new URL(location.href);
      next.searchParams.set('pin', picker.value);
      location.assign(next.toString());
    });
    var retry = byId('wdp-retry');
    if (retry) retry.addEventListener('click', start);
    start();
  }, { once: true });
})(window, document);
