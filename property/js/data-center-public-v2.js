(function () {
  'use strict';

  var overview = null;
  var catalog = null;
  var coverage = new Map();
  var access = { signedIn: false, proPlus: false };
  var loadState = { overview: 'loading', catalog: 'loading' };
  var drawerReturnFocus = null;
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

  // The status every Data Center surface shows for a marker: the database-governed coverage row
  // when one exists, otherwise the published catalog status. KPIs, coverage bars and the builder's
  // Availability filter all count with this one rule, so their numbers agree.
  function effectiveStatus(marker) {
    var c = coverageFor(marker && marker.id);
    return String(c ? c.value_status : (marker && marker.provider_status) || 'planned');
  }

  function setText(id, value) {
    var node = $(id);
    if (node) node.textContent = value;
  }

  function renderKpis() {
    var summary = overview && overview.summary ? overview.summary : {};
    var markers = catalog && Array.isArray(catalog.markers) ? catalog.markers : null;
    var live = markers ? markers.filter(function (m) { return effectiveStatus(m) === 'live'; }) : null;
    var bulk = live ? live.filter(function (m) { var c = coverageFor(m.id); return !!(c && c.bulk_capable); }).length : null;
    setText('dc-kpi-live', live ? live.length.toLocaleString() : (summary.live_fields == null ? '-' : Number(summary.live_fields).toLocaleString()));
    setText('dc-kpi-bulk', overview && live ? bulk.toLocaleString() : (summary.bulk_ready_fields == null ? '-' : Number(summary.bulk_ready_fields).toLocaleString()));
    setText('dc-kpi-verified', overview ? formatDate(summary.newest_live_verified_at) : 'Unavailable');
    var selected = 0;
    try {
      var stored = JSON.parse(localStorage.getItem('watchdog:data-center:fields') || '[]');
      selected = Array.isArray(stored) ? stored.length : 0;
    } catch (_error) {}
    setText('dc-kpi-selected', String(selected));
  }

  function renderCoverage() {
    var host = $('dc-category-coverage');
    var failed = $('dc-category-coverage-error');
    if (failed) failed.hidden = loadState.catalog !== 'error';
    if (loadState.catalog === 'error') { var loading = $('dc-category-coverage-empty'); if (loading) loading.hidden = true; }
    if (!host || !catalog || !Array.isArray(catalog.markers)) return;
    var groups = {};
    catalog.markers.forEach(function (marker) {
      var key = String(marker.category || 'other');
      if (!groups[key]) groups[key] = { total: 0, live: 0, bulk: 0, unavailable: 0, recent: 0 };
      var item = groups[key];
      item.total += 1;
      var c = coverageFor(marker.id);
      var status = effectiveStatus(marker);
      if (status === 'live') {
        item.live += 1;
        if (c && c.bulk_capable) item.bulk += 1;
        if (c && c.last_verified_at && daysSince(c.last_verified_at) <= 7) item.recent += 1;
      } else if (status === 'unavailable') {
        item.unavailable += 1;
      }
    });

    var connected = catalog.markers.map(function (marker) { return { value_status: effectiveStatus(marker), row: coverageFor(marker.id) || {} }; });
    var live = connected.filter(function (item) { return item.value_status === 'live'; }).map(function (item) { return item.row; });
    var bulk = live.filter(function (item) { return item.bulk_capable; }).length;
    var recent = live.filter(function (item) { return item.last_verified_at && daysSince(item.last_verified_at) <= 7; }).length;
    var livePct = percentage(live.length, connected.length);
    var bulkPct = percentage(bulk, live.length);
    var recentPct = percentage(recent, live.length);
    setText('dc-coverage-live-pct', livePct);
    setText('dc-coverage-bulk-pct', loadState.overview === 'ready' ? bulkPct : '-');
    setText('dc-coverage-recent-pct', loadState.overview === 'ready' ? recentPct : '-');
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
    // Live catalog fields without a governed coverage row count as "without a verification date".
    // Without the live status check there are no verification dates to count, so show dashes.
    if (loadState.overview !== 'ready') {
      ['dc-recency-recent-pct', 'dc-recency-recent', 'dc-recency-review', 'dc-recency-older', 'dc-recency-unverified'].forEach(function (id) { setText(id, '-'); });
    }
    var live = loadState.overview !== 'ready' ? [] : catalog && Array.isArray(catalog.markers)
      ? catalog.markers.filter(function (m) { return effectiveStatus(m) === 'live'; }).map(function (m) { return coverageFor(m.id) || {}; })
      : Array.from(coverage.values()).filter(function (item) { return item && item.value_status === 'live'; });
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
    if (loadState.overview === 'ready') {
      setText('dc-recency-recent-pct', percentage(recent, live.length));
      setText('dc-recency-recent', recent.toLocaleString());
      setText('dc-recency-review', review.toLocaleString());
      setText('dc-recency-older', older.toLocaleString());
      setText('dc-recency-unverified', unverified.toLocaleString());
    }
    setWidth('dc-recency-bar-recent', percentage(recent, live.length));
    setWidth('dc-recency-bar-review', percentage(review, live.length));
    setWidth('dc-recency-bar-older', percentage(older + unverified, live.length));
    var recencyBar = $('dc-recency-bar');
    if (recencyBar) recencyBar.setAttribute('aria-label', recent + ' verified within 7 days; ' + review + ' verified 8 to 30 days ago; ' + older + ' older than 30 days; ' + unverified + ' without a verification timestamp');

    var rows = overview && Array.isArray(overview.source_freshness) ? overview.source_freshness : [];
    var empty = $('dc-source-freshness-empty');
    var failed = $('dc-source-freshness-error');
    Array.from(host.children).forEach(function (child) { if (child !== empty && child !== failed) child.remove(); });
    if (failed) failed.hidden = loadState.overview !== 'error';
    if (empty) {
      empty.hidden = rows.length > 0 || loadState.overview === 'error';
      if (!rows.length && loadState.overview === 'ready') empty.textContent = 'No source freshness checks have been published yet.';
    }
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
        if (text) text.textContent = 'Professional dashboard active. Build against your own saved properties, export checked results and save recurring views.';
        if (action) { action.textContent = 'Dashboard active'; action.setAttribute('href', '#dc-selected-workspace'); action.classList.add('secondary'); }
      } else if (access.signedIn) {
        if (text) text.textContent = 'Catalog browsing is public. Building private datasets, exports, saved views and schedules require the Professional plan.';
        if (action) { action.textContent = 'See Professional access'; action.setAttribute('href', '/pro'); }
      } else {
        if (text) text.textContent = 'Browse every checked field publicly. Sign in with Professional to run these fields against your saved-property dashboard.';
        if (action) { action.textContent = 'Sign in / view Professional'; action.setAttribute('href', '/pro'); }
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
    setText('dc-drawer-description', marker.description || 'Checked Watchdog data field.');
    setText('dc-drawer-why', marker.professional_reason || 'Use this field as one input in a checked property-data process; verify the underlying source before making a consequential decision.');
    setText('dc-drawer-status', title(c.value_status || marker.provider_status || 'planned'));
    setText('dc-drawer-verified', formatDate(c.last_verified_at));
    setText('dc-drawer-bulk', c.value_status === 'live' ? (c.bulk_capable ? 'Bulk ready' : 'Single-record / bounded use') : 'Not bulk available');
    setText('dc-drawer-scope', title(marker.scope || 'property'));
    setText('dc-drawer-origin', marker.origin === 'watchdog-derived' ? 'Watchdog calculated' : 'Public source');
    setText('dc-drawer-tier', marker.tier === 'pro_plus' ? 'Professional' : title(marker.tier || 'standard'));
    var pageLink = $('dc-drawer-link');
    if (pageLink) pageLink.href = '/marker?id=' + encodeURIComponent(id);
    drawerReturnFocus = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    var close = drawer.querySelector('.dc-drawer-close');
    (close || drawer).focus({ preventScroll: true });
    analytics('marker_viewed', { marker_id: id, surface: 'data_center' });
  }

  function closeDrawer() {
    var drawer = $('dc-marker-drawer');
    if (!drawer || !drawer.classList.contains('open')) return;
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    if (drawerReturnFocus && document.contains(drawerReturnFocus)) drawerReturnFocus.focus({ preventScroll: true });
    drawerReturnFocus = null;
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
      if (event.target.closest('[data-dc-drawer-close]')) { closeDrawer(); return; }
      if (event.target.closest('[data-dc-retry]')) retry();
    });
    document.addEventListener('keydown', function (event) { if (event.key === 'Escape') closeDrawer(); });
    document.addEventListener('watchdog:data-center-selection', function (event) {
      setText('dc-kpi-selected', String((event.detail && event.detail.count) || 0));
    });
  }

  function registry() {
    var shared = window.WatchdogMarkerRuntime;
    if (shared && typeof shared.registry === 'function') return shared.registry();
    return fetch('/property/data/marker-registry.json', { cache: 'no-cache' })
      .then(function (response) { if (!response.ok) throw new Error('Marker registry HTTP ' + response.status); return response.json(); });
  }

  function showLoadState() {
    var notice = $('dc-overview-error');
    if (notice) notice.hidden = loadState.overview !== 'error';
    document.documentElement.dataset.dcOverview = loadState.overview;
    document.documentElement.dataset.dcCatalog = loadState.catalog;
  }

  function load() {
    var c = client();
    loadState.overview = 'loading';
    if (!catalog) loadState.catalog = 'loading';
    var overviewPromise = c ? c.rpc('get_public_data_center_overview_v1').then(function (response) {
      if (response.error) throw response.error;
      overview = response.data || null;
      coverage.clear();
      ((overview && overview.marker_coverage) || []).forEach(function (row) { coverage.set(String(row.marker_id || ''), row); });
      loadState.overview = 'ready';
      return overview;
    }) : Promise.reject(new Error('Data service unavailable'));
    overviewPromise = overviewPromise.catch(function (error) {
      loadState.overview = 'error';
      console.warn('[Watchdog Data Center] live coverage status unavailable', error && error.message ? error.message : error);
      throw error;
    });

    var catalogPromise = catalog ? Promise.resolve(catalog) : registry()
      .then(function (data) { catalog = data; loadState.catalog = 'ready'; return data; })
      .catch(function (error) { loadState.catalog = 'error'; throw error; });

    return Promise.allSettled([overviewPromise, catalogPromise]).then(function () {
      showLoadState();
      renderKpis();
      renderCoverage();
      renderFreshness();
      document.dispatchEvent(new CustomEvent('watchdog:data-center-overview', { detail: overview || {} }));
      resolveReady({ overview: overview, catalog: catalog });
    });
  }

  function retry() {
    document.dispatchEvent(new CustomEvent('watchdog:data-center-retry'));
    return load();
  }

  window.WatchdogDataCenterPublic = {
    ready: ready,
    coverageFor: coverageFor,
    access: function () { return Object.assign({}, access); },
    hasProPlus: function () { return !!access.proPlus; },
    requireAccessRefresh: resolveAccess,
    openMarker: openDrawer,
    activateTab: activateTab,
    effectiveStatus: effectiveStatus,
    overview: function () { return overview; },
    retry: retry
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