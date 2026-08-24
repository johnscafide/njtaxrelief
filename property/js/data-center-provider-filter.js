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

  function loadRegistry() {
    return fetch('/property/data/marker-registry.json?v=20260824a', { cache: 'no-store' })
      .then(function (response) {
        if (!response.ok) throw new Error('Marker registry HTTP ' + response.status);
        return response.json();
      })
      .then(function (catalog) {
        (catalog.markers || []).forEach(function (marker) {
          statusByMarker.set(String(marker.id || ''), String(marker.provider_status || 'planned'));
        });
        applyFilter();
      })
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
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
