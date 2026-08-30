(function () {
  'use strict';

  var overview = null;
  var catalog = null;
  var coverage = new Map();
  var access = { signedIn: false, proPlus: false };
  var resolveReady;
  var ready = new Promise(function (resolve) { resolveReady = resolve; });

  function $(id) { return document.getElementById(id); }
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>\"]/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;' }[char];
    });
  }
  function title(value) {
    return String(value || '').replace(/[_-]+/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }
  function formatDate(value) {
    if (!value) return 'Not yet verified';
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Not yet verified';
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }
  function daysSince(value) {
    var time = value ? new Date(value).getTime() : NaN;
    if (!Number.isFinite(time)) return Infinity;
    return Math.max(0, Math.floor((Date.now() - time) / 86400000));
  }
  function freshnessLabel(value) {
    var days = daysSince(value);
    if (days <= 1) return 'Verified today';
    if (days <= 7) return 'Verified recently';
    if (days <= 30) return 'Review window';
    return 'Older verification';
  }
  function percentage(value, total) {
    var denominator = Number(total || 0);
    return denominator > 0 ? Math.round((Number(value || 0) / denominator) * 100) : 0;
  }
  function setWidth(id, value) {
    var node = $(id);
    if (node) node.style.width = Math.max(0, Math.min(100, Number(value || 0))) + '%';
  }
  function analytics(name, properties) {
    try {
      if (window.WatchdogAnalytics && typeof window.WatchdogAnalytics.track === 'function') {
        window.WatchdogAnalytics.track(name, properties || {});
      }
    } catch (_error) {}
  }
  function client() {
    if (window.WatchdogDataCenterClient) {
      try { return window.WatchdogDataCenterClient(); } catch (_error) {}
    }
    if (window.NJPTRSupabaseRuntime && typeof window.NJPTRSupabaseRuntime.createClient === 'function') {
      try { return window.NJPTRSupabaseRuntime.createClient(); } catch (_error2) {}
    }
    return null;
  }

  function coverageFor(id) {
    return coverage.get(String(id || '')) || null;
  }

  function setText(id, value) {
    var node = $(id);
    if (node) node.textContent = value;
  }

  function renderKpis() {
    var summary = overview && overview.summary ? overview.summary : {};
    setText('dc-kpi-live', summary.live_fields == null ? '—' : Number(summary.live_fields).toLocaleString());
    setText('dc-kpi-bulk', summary.bulk_ready_fields == null ? '—' : Number(summary.bulk_ready_fields).toLocaleString());
    setText('dc-kpi-verified', formatDate(summary.newest_live_verified_at));
    var selected = 0;
    try {
      var stored = JSON.parse(localStorage.getItem('watchdog:data-center:fields') || '[]');
      selected = Array.isArray(stored) ? stored.length : 0;
    } catch (_error) {}
    setText('dc-kpi-selected', String(selected));
  }

  function renderCoverage() {
    var host = $('dc-category-coverage');
    if (!host || !catalog || !Array.isArray(catalog.markers)) return;
    var groups = {};
    catalog.markers.forEach(function (marker) {
      var key = String(marker.category || 'other');
      if (!groups[key]) groups[key] = { total: 0, live: 0, bulk: 0, unavailable: 0, recent: 0 };
      var item = groups[key];
      item.total += 1;
      var c = coverageFor(marker.id);
      var status = c ? c.value_status : String(marker.provider_status || 'planned');
      if (status === 'live') {
        item.live += 1;
        if (c && c.bulk_capable) item.bulk += 1;
        if (c && c.last_verified_at && daysSince(c.last_verified_at) <= 7) item.recent += 1;
      } else if (status === 'unavailable') {
        item.unavailable += 1;
      }
    });

    var connected = Array.from(coverage.values());
    var live = connected.filter(function (item) { return item && item.value_status === 'live'; });
    var bulk = live.filter(function (item) { return item.bulk_capable; }).length;
    var recent = live.filter(function (item) { return item.last_verified_at && daysSince(item.last_verified_at) <= 7; }).length;
    var livePct = percentage(live.length, connected.length);
    var bulkPct = percentage(bulk, live.length);
    var recentPct = percentage(recent, live.length);
    setText('dc-coverage-live-pct', livePct);
    setText('dc-coverage-bulk-pct', bulkPct);
    setText('dc-coverage-recent-pct', recentPct);
    setWidth('dc-coverage-bar-bulk', percentage(bulk, connected.length));
    setWidth('dc-coverage-bar-live', percentage(Math.max(0, live.length - bulk), connected.length));
    setWidth('dc-coverage-bar-not-live', percentage(Math.max(0, connected.length - live.length), connected.length));
    var healthBar = $('dc-coverage-health-bar');
    if (healthBar) healthBar.setAttribute('aria-label', live.length + ' of ' + connected.length + ' connected fields live; ' + bulk + ' bulk ready');

    var rows = Object.keys(groups).map(function (key) { return { key: key, data: groups[key] }; })
      .sort(function (a, b) { return b.data.live - a.data.live || a.key.localeCompare(b.key); });
    var empty = $('dc-category-coverage-empty');
    Array.from(host.children).forEach(function (child) { if (child !== empty) child.remove(); });
    if (empty) empty.hidden = rows.length > 0;
    var template = $('dc-category-coverage-template');
    if (!rows.length || !template || !template.content) return;

    rows.forEach(function (row) {
      var d = row.data;
      var total = Math.max(1, d.total);
      var fragment = template.content.cloneNode(true);
      var button = fragment.querySelector('[data-dc-category-label]');
      var bar = fragment.querySelector('[data-dc-category-bar]');
      var bulkBar = fragment.querySelector('[data-dc-category-bulk]');
      var liveBar = fragment.querySelector('[data-dc-category-live]');
      var unavailableBar = fragment.querySelector('[data-dc-category-unavailable]');
      var count = fragment.querySelector('[data-dc-category-count]');
      if (button) { button.dataset.dcCategory = row.key; button.textContent = title(row.key); }
      if (bulkBar) bulkBar.style.width = ((d.bulk / total) * 100).toFixed(2) + '%';
      if (liveBar) liveBar.style.width = ((Math.max(0, d.live - d.bulk) / total) * 100).toFixed(2) + '%';
      if (unavailableBar) unavailableBar.style.width = ((d.unavailable / total) * 100).toFixed(2) + '%';
      if (bar) bar.setAttribute('aria-label', d.live + ' of ' + d.total + ' live; ' + d.bulk + ' bulk ready; ' + d.recent + ' verified within 7 days');
      if (count) count.textContent = d.live + '/' + d.total + ' · ' + percentage(d.bulk, d.live) + '% bulk';
      host.appendChild(fragment);
    });
  }

  function renderFreshness() {
    var host = $('dc-source-freshness-rows');
    if (!host) return;
    var live = Array.from(coverage.values()).filter(function (item) { return item && item.value_status === 'live'; });
    var recent = 0;
    var review = 0;
    var older = 0;
    var unverified = 0;
    live.forEach(function (item) {
      if (!item.last_verified_at) { unverified += 1; return; }
      var age = daysSince(item.last_verified_at);
      if (age <= 7) recent += 1;
      else if (age <= 30) review += 1;
      else older += 1;
    });
    setText('dc-recency-recent-pct', percentage(recent, live.length));
    setText('dc-recency-recent', recent.toLocaleString());
    setText('dc-recency-review', review.toLocaleString());
    setText('dc-recency-older', older.toLocaleString());
    setText('dc-recency-unverified', unverified.toLocaleString());
    setWidth('dc-recency-bar-recent', percentage(recent, live.length));
    setWidth('dc-recency-bar-review', percentage(review, live.length));
    setWidth('dc-recency-bar-older', percentage(older + unverified, live.length));
    var recencyBar = $('dc-recency-bar');
    if (recencyBar) recencyBar.setAttribute('aria-label', recent + ' verified within 7 days; ' + review + ' verified 8 to 30 days ago; ' + older + ' older than 30 days; ' + unverified + ' without a verification timestamp');

    var rows = overview && Array.isArray(overview.source_freshness) ? overview.source_freshness : [];
    var empty = $('dc-source-freshness-empty');
    Array.from(host.children).forEach(function (child) { if (child !== empty) child.remove(); });
    if (empty) empty.hidden = rows.length > 0;
    var template = $('dc-source-freshness-template');
    if (!rows.length || !template || !template.content) return;
    rows.forEach(function (row) {
      var fragment = template.content.cloneNode(true);
      var name = fragment.querySelector('[data-dc-source-name]');
      var badge = fragment.querySelector('[data-dc-source-badge]');
      var date = fragment.querySelector('[data-dc-source-date]');
      var compliant = fragment.querySelector('[data-dc-source-compliant]');
      var total = fragment.querySelector('[data-dc-source-total]');
      if (name) name.textContent = title(row.group_key);
      if (badge) badge.textContent = freshnessLabel(row.newest_verified_at);
      if (date) date.textContent = formatDate(row.newest_verified_at);
      if (compliant) compliant.textContent = Number(row.compliant_count || 0).toLocaleString();
      if (total) total.textContent = Number(row.total_count || 0).toLocaleString();
      host.appendChild(fragment);
    });
  }

  function updateAccessUi() {
    document.documentElement.dataset.dcBuildAccess = access.proPlus ? 'pro_plus' : (access.signedIn ? 'locked' : 'signed_out');
    var gate = $('dc-private-gate');
    if (gate) {
      var text = gate.querySelector('[data-dc-gate-copy]');
      var action = gate.querySelector('[data-dc-gate-action]');
      if (access.proPlus) {
        if (text) text.textContent = 'Pro+ workspace active. Build against your own saved properties, export governed results and save recurring views.';
        if (action) { action.textContent = 'Workspace active'; action.setAttribute('href', '#dc-selected-workspace'); action.classList.add('secondary'); }
      } else if (access.signedIn) {
        if (text) text.textContent = 'Catalog browsing is public. Building private datasets, exports, saved views and schedules require Pro+.';
        if (action) { action.textContent = 'See Pro+ access'; action.setAttribute('href', '/property/pro'); }
      } else {
        if (text) text.textContent = 'Browse every governed field publicly. Sign in with Pro+ to run these fields against your saved-property workspace.';
        if (action) { action.textContent = 'Sign in / view Pro+'; action.setAttribute('href', '/property/pro'); }
      }
    }
    document.dispatchEvent(new CustomEvent('watchdog:data-center-access', { detail: Object.assign({}, access) }));
  }

  function resolveAccess() {
    var c = client();
    if (!c || !c.auth) { updateAccessUi(); return Promise.resolve(access); }
    return c.auth.getSession().then(function (response) {
      var session = response && response.data ? response.data.session : null;
      access.signedIn = !!session;
      if (!session) { updateAccessUi(); return access; }
      return c.rpc('has_watchdog_plan', { required_plan: 'pro_plus' }).then(function (planResponse) {
        access.proPlus = !planResponse.error && planResponse.data === true;
        updateAccessUi();
        return access;
      }).catch(function () { updateAccessUi(); return access; });
    }).catch(function () { updateAccessUi(); return access; });
  }

  function activateTab(name, track) {
    var tabs = document.querySelectorAll('[data-dc-tab]');
    var panels = document.querySelectorAll('[data-dc-panel]');
    tabs.forEach(function (tab) { tab.setAttribute('aria-selected', String(tab.dataset.dcTab === name)); });
    panels.forEach(function (panel) { panel.hidden = panel.dataset.dcPanel !== name; });
    if (track) analytics('data_center_tab_viewed', { interaction: name });
  }

  function markerById(id) {
    if (!catalog || !Array.isArray(catalog.markers)) return null;
    return catalog.markers.find(function (marker) { return String(marker.id) === String(id); }) || null;
  }

  function openDrawer(id) {
    var marker = markerById(id);
    var drawer = $('dc-marker-drawer');
    if (!marker || !drawer) return;
    var c = coverageFor(id) || {};
    setText('dc-drawer-eyebrow', title(marker.category || 'Data field'));
    setText('dc-drawer-title', marker.label || id);
    setText('dc-drawer-description', marker.description || 'Governed Watchdog data field.');
    setText('dc-drawer-why', marker.professional_reason || 'Use this field as one input in a governed property-data workflow; verify the underlying source before making a consequential decision.');
    setText('dc-drawer-status', title(c.value_status || marker.provider_status || 'planned'));
    setText('dc-drawer-verified', formatDate(c.last_verified_at));
    setText('dc-drawer-bulk', c.value_status === 'live' ? (c.bulk_capable ? 'Bulk ready' : 'Single-record / bounded use') : 'Not bulk available');
    setText('dc-drawer-scope', title(marker.scope || 'property'));
    setText('dc-drawer-origin', marker.origin === 'watchdog-derived' ? 'Watchdog derived' : 'Public source');
    setText('dc-drawer-tier', marker.tier === 'pro_plus' ? 'Pro+' : title(marker.tier || 'standard'));
    var pageLink = $('dc-drawer-link');
    if (pageLink) pageLink.href = '/property/marker?id=' + encodeURIComponent(id);
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    analytics('marker_viewed', { marker_id: id, surface: 'data_center' });
  }

  function closeDrawer() {
    var drawer = $('dc-marker-drawer');
    if (!drawer) return;
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
  }

  function wireUi() {
    document.addEventListener('click', function (event) {
      var tab = event.target.closest('[data-dc-tab]');
      if (tab) { activateTab(tab.dataset.dcTab, true); return; }
      var category = event.target.closest('[data-dc-category]');
      if (category) {
        activateTab('build', true);
        var select = $('dc-category');
        if (select) { select.value = category.dataset.dcCategory; select.dispatchEvent(new Event('change', { bubbles: true })); }
        return;
      }
      var detail = event.target.closest('[data-marker-detail]');
      if (detail) { event.preventDefault(); openDrawer(detail.dataset.markerDetail); return; }
      if (event.target.closest('[data-dc-drawer-close]')) closeDrawer();
    });
    document.addEventListener('keydown', function (event) { if (event.key === 'Escape') closeDrawer(); });
    document.addEventListener('watchdog:data-center-selection', function (event) {
      setText('dc-kpi-selected', String((event.detail && event.detail.count) || 0));
    });
  }

  function load() {
    var c = client();
    var overviewPromise = c ? c.rpc('get_public_data_center_overview_v1').then(function (response) {
      if (response.error) throw response.error;
      overview = response.data || null;
      coverage.clear();
      ((overview && overview.marker_coverage) || []).forEach(function (row) { coverage.set(String(row.marker_id || ''), row); });
      return overview;
    }) : Promise.reject(new Error('Data service unavailable'));

    var catalogPromise = fetch('/property/data/marker-registry.json?v=20260830-public-v3', { cache: 'no-store' })
      .then(function (response) { if (!response.ok) throw new Error('Marker registry HTTP ' + response.status); return response.json(); })
      .then(function (data) { catalog = data; return data; });

    return Promise.allSettled([overviewPromise, catalogPromise]).then(function () {
      renderKpis();
      renderCoverage();
      renderFreshness();
      document.dispatchEvent(new CustomEvent('watchdog:data-center-overview', { detail: overview || {} }));
      resolveReady({ overview: overview, catalog: catalog });
    });
  }

  window.WatchdogDataCenterPublic = {
    ready: ready,
    coverageFor: coverageFor,
    access: function () { return Object.assign({}, access); },
    hasProPlus: function () { return !!access.proPlus; },
    requireAccessRefresh: resolveAccess,
    openMarker: openDrawer,
    activateTab: activateTab
  };

  function start() {
    wireUi();
    activateTab('overview', false);
    resolveAccess();
    load();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();