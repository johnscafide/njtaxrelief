/* Watchdog Dashboard: keep application page links in navigation, not the data grid. */
(function () {
  'use strict';
  var key = 'watchdogDashboardInteractionsV1';
  var menuOnly = [
    'property-home-link',
    'town-compare-link',
    'fairness-link',
    'change-link',
    'agent-link',
    'appeal-link',
    'workbench-link'
  ];
  try {
    var saved = JSON.parse(localStorage.getItem(key) || 'null') || {};
    var hidden = Array.isArray(saved.hidden) ? saved.hidden.slice() : [];
    menuOnly.forEach(function (id) {
      if (hidden.indexOf(id) < 0) hidden.push(id);
    });
    saved.hidden = hidden;
    localStorage.setItem(key, JSON.stringify(saved));
  } catch (_) {}
})();
