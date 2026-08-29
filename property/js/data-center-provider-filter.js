(function () {
  'use strict';

  var statusByMarker = new Map();

  function client() {
    if (window.WatchdogDataCenterClient) {
      try { return window.WatchdogDataCenterClient(); } catch (_error) {}
    }
    return null;
  }

  function loadStaticFallback() {
    return fetch('/property/data/marker-registry.json?v=20260829-provider-fallback', { cache: 'no-store' })
      .then(function (response) {
        if (!response.ok) throw new Error('Marker registry HTTP ' + response.status);
        return response.json();
      })
      .then(function (catalog) {
        (catalog.markers || []).forEach(function (marker) {
          var id = String(marker.id || '');
          if (id && !statusByMarker.has(id)) statusByMarker.set(id, String(marker.provider_status || 'planned'));
        });
      });
  }

  function loadGovernedCoverage() {
    var c = client();
    if (!c) return Promise.reject(new Error('Data Center client unavailable'));
    return c.rpc('get_public_data_center_overview_v1').then(function (response) {
      if (response.error) throw response.error;
      ((response.data && response.data.marker_coverage) || []).forEach(function (row) {
        statusByMarker.set(String(row.marker_id || ''), String(row.value_status || 'planned'));
      });
    });
  }

  function loadRegistry() {
    statusByMarker.clear();
    return loadGovernedCoverage()
      .catch(function (error) {
        console.warn('[Watchdog Data Center] public coverage contract unavailable; using catalog fallback', error);
      })
      .then(loadStaticFallback)
      .then(function () {
        document.dispatchEvent(new CustomEvent('watchdog:data-center-provider-status', { detail: { count: statusByMarker.size } }));
        if (window.WatchdogDataCenterRuntime && typeof window.WatchdogDataCenterRuntime.render === 'function') window.WatchdogDataCenterRuntime.render();
      })
      .catch(function (error) { console.error('[Watchdog Data Center] provider coverage failed', error); });
  }

  window.WatchdogDataCenterProviderStatus = {
    get: function (id) { return statusByMarker.get(String(id || '')) || 'planned'; },
    reload: loadRegistry
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadRegistry, { once: true });
  else loadRegistry();
})();