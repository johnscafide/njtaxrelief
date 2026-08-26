(function () {
  'use strict';

  var statusByMarker = new Map();
  var select = null;
  var tbody = null;

  function currentStatus() {
    return select ? String(select.value || '') : 'live';
  }

  function applyFilter() {
    if (!tbody || !statusByMarker.size) return;
    var wanted = currentStatus();

    Array.prototype.forEach.call(tbody.querySelectorAll('tr'), function (row) {
      var markerLink = row.querySelector('[data-marker-id]');
      if (!markerLink) {
        row.hidden = false;
        return;
      }

      var markerId = markerLink.getAttribute('data-marker-id') || '';
      var markerStatus = statusByMarker.get(markerId) || 'planned';
      row.hidden = !!wanted && markerStatus !== wanted;
    });
  }

  function loadStaticFallback() {
    return fetch('/property/data/marker-registry.json?v=20260826-provider-fallback', { cache: 'no-store' })
      .then(function (response) {
        if (!response.ok) throw new Error('Marker registry HTTP ' + response.status);
        return response.json();
      })
      .then(function (catalog) {
        (catalog.markers || []).forEach(function (marker) {
          if (!statusByMarker.has(String(marker.id || ''))) {
            statusByMarker.set(String(marker.id || ''), String(marker.provider_status || 'planned'));
          }
        });
      });
  }

  function loadGovernedCoverage() {
    var client = window.WatchdogDataCenterClient && window.WatchdogDataCenterClient();
    if (!client) return Promise.reject(new Error('Data Center client unavailable'));

    return client
      .from('data_center_provider_coverage')
      .select('marker_id,value_status')
      .then(function (response) {
        if (response.error) throw response.error;
        (response.data || []).forEach(function (row) {
          statusByMarker.set(String(row.marker_id || ''), String(row.value_status || 'planned'));
        });
      });
  }

  function loadRegistry() {
    statusByMarker.clear();
    return loadGovernedCoverage()
      .catch(function (error) {
        console.warn('[Watchdog Data Center] live provider coverage unavailable; using catalog fallback', error);
      })
      .then(loadStaticFallback)
      .then(applyFilter)
      .catch(function (error) {
        console.error('[Watchdog Data Center] provider-status filter failed', error);
      });
  }

  function start() {
    select = document.getElementById('dc-provider-status');
    tbody = document.getElementById('dc-rows');
    if (!select || !tbody) return;

    select.value = select.value || 'live';
    select.addEventListener('change', applyFilter);

    new MutationObserver(function () {
      applyFilter();
    }).observe(tbody, { childList: true, subtree: true });

    loadRegistry();
    document.addEventListener('watchdog:data-center-ready', loadRegistry, { once: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
