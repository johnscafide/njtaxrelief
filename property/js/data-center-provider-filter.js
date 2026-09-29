(function () {
  'use strict';

  /* Provider status lookup for the Data Center builder. It reuses the governed coverage and the
     catalog that data-center-public-v2.js already loaded (one get_public_data_center_overview_v1
     call and one registry download per page). The standalone RPC path below is only a fallback
     for a page that does not load the public runtime. */
  var statusByMarker = new Map();

  function client() {
    if (window.WatchdogDataCenterClient) {
      try { return window.WatchdogDataCenterClient(); } catch (_error) {}
    }
    return null;
  }

  function registry() {
    var shared = window.WatchdogMarkerRuntime;
    if (shared && typeof shared.registry === 'function') return shared.registry();
    return fetch('/property/data/marker-registry.json', { cache: 'no-cache' }).then(function (response) {
      if (!response.ok) throw new Error('Marker registry HTTP ' + response.status);
      return response.json();
    });
  }

  function applyCatalog(catalog) {
    ((catalog && catalog.markers) || []).forEach(function (marker) {
      var id = String(marker.id || '');
      if (id && !statusByMarker.has(id)) statusByMarker.set(id, String(marker.provider_status || 'planned'));
    });
  }

  function applyCoverage(rows) {
    (rows || []).forEach(function (row) {
      statusByMarker.set(String(row.marker_id || ''), String(row.value_status || 'planned'));
    });
  }

  function loadStandalone() {
    var c = client();
    var governed = c ? c.rpc('get_public_data_center_overview_v1').then(function (response) {
      if (response.error) throw response.error;
      applyCoverage(response.data && response.data.marker_coverage);
    }) : Promise.reject(new Error('Data Center client unavailable'));
    return governed
      .catch(function (error) { console.warn('[Watchdog Data Center] public coverage contract unavailable; using catalog fallback', error); })
      .then(registry)
      .then(applyCatalog);
  }

  function loadShared(publicRuntime) {
    return publicRuntime.ready.then(function (state) {
      var overview = state && state.overview;
      applyCoverage(overview && overview.marker_coverage);
      applyCatalog(state && state.catalog);
    });
  }

  function loadRegistry() {
    statusByMarker.clear();
    var publicRuntime = window.WatchdogDataCenterPublic;
    return (publicRuntime && publicRuntime.ready ? loadShared(publicRuntime) : loadStandalone())
      .then(function () {
        document.dispatchEvent(new CustomEvent('watchdog:data-center-provider-status', { detail: { count: statusByMarker.size } }));
      })
      .catch(function (error) { console.error('[Watchdog Data Center] provider coverage failed', error); });
  }

  window.WatchdogDataCenterProviderStatus = {
    get: function (id) { return statusByMarker.get(String(id || '')) || 'planned'; },
    reload: loadRegistry
  };

  // A retry after a failed overview refreshes the status map with whatever the public runtime reloads.
  document.addEventListener('watchdog:data-center-overview', function (event) {
    applyCoverage(event.detail && event.detail.marker_coverage);
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadRegistry, { once: true });
  else loadRegistry();
})();
