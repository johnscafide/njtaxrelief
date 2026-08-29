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
      if (!groups[key]) groups[key] = { total: 0, live: 0, bulk: 0, unavailable: 0 };
      var item = groups[key];
      item.total += 1;
      var c = coverageFor(marker.id);
      var status = c ? c.value_status : String(marker.provider_status || 'planned');
      if (status === 'live') {
        item.live += 1;
        if (c && c.bulk_capable) item.bulk += 1;
      } else if (status === 'unavailable') {
        item.unavailable += 1;
      }
    });

    var rows = Object.keys(groups).map(function (key) { return { key: key, data: groups[key] }; })
      .sort(function (a, b) { return b.data.live - a.data.live || a.key.localeCompare(b.key); })
      .slice(0, 14);

    host.innerHTML = rows.map(function (row) {
      var d = row.data;
      var total = Math.max(1, d.total);
      var bulkPct = (d.bulk / total) * 100;
      var liveOnlyPct = (Math.max(0, d.live - d.bulk) / total) * 100;
      var unavailablePct = (d.unavailable / total) * 100;
      return '<div class="dcv2-coverage-row">' +
        '<button type="button" data-dc-category="' + esc(row.key) + '">' + esc(title(row.key)) + '</button>' +
        '<div class="dcv2-bar" aria-label="' + esc(d.live + ' of ' + d.total + ' live') + '">' +
          '<span class="dcv2-bar-bulk" style="width:' + bulkPct.toFixed(2) + '%"></span>' +
          '<span class="dcv2-bar-live" style="width:' + liveOnlyPct.toFixed(2) + '%"></span>' +
          '<span class="dcv2-bar-unavailable" style="width:' + unavailablePct.toFixed(2) + '%"></span>' +
        '</div><div class="dcv2-coverage-count">' + d.live + '/' + d.total + ' live</div></div>';
    }).join('') || '<div class="dc-monitor-empty">Coverage is loading.</div>';
  }

  function renderFreshness() {
    var host = $('dc-source-freshness');
    if (!host) return;
    var rows = overview && Array.isArray(overview.source_freshness) ? overview.source_freshness : [];
    host.innerHTML = rows.map(function (row) {
      var compliant = Number(row.compliant_count || 0);
      var total = Number(row.total_count || 0);
      return '<div class="dcv2-fresh-row"><div class="dcv2-fresh-top"><b>' + esc(title(row.group_key)) + '</b>' +
        '<span class="dcv2-fresh-badge">' + esc(freshnessLabel(row.newest_verified_at)) + '</span></div>' +
        '<p>Most recent governed verification: ' + esc(formatDate(row.newest_verified_at)) +
        '. Freshness-policy compliant fields: ' + compliant + ' of ' + total + '.</p></div>';
    }).join('') || '<div class="dc-monitor-empty">Source freshness is loading.</div>';
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

    var catalogPromise = fetch('/property/data/marker-registry.json?v=20260829-public-v2', { cache: 'no-store' })
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