(function () {
  'use strict';

  var DATA_URL = '/api/compliance-log';
  var app = document.getElementById('cr-app');
  var claim = document.getElementById('cr-claim');
  var stats = document.getElementById('cr-stats');
  var frameworks = document.getElementById('cr-frameworks');
  var log = document.getElementById('cr-log');
  var empty = document.getElementById('cr-empty');
  var search = document.getElementById('cr-search');
  var status = document.getElementById('cr-status');
  var entries = [];

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function frameworkCounts(items) {
    var counts = {};
    items.forEach(function (entry) {
      (entry.frameworks || []).forEach(function (name) { counts[name] = (counts[name] || 0) + 1; });
    });
    return counts;
  }

  function renderStats(data) {
    var implemented = entries.filter(function (entry) { return entry.status === 'implemented'; }).length;
    var counts = frameworkCounts(entries);
    var evidence = new Set();
    entries.forEach(function (entry) { (entry.evidence || []).forEach(function (path) { evidence.add(path); }); });
    stats.innerHTML = [
      ['Log entries', entries.length, 'Material decisions and completed improvements'],
      ['Implemented', implemented, 'Entries with current internal evidence'],
      ['Frameworks', Object.keys(counts).length, 'Mapped assurance and compliance targets'],
      ['Evidence paths', evidence.size, 'Distinct repository evidence references']
    ].map(function (item) {
      return '<article class="cr-stat"><span>' + esc(item[0]) + '</span><strong>' + esc(item[1]) + '</strong><small>' + esc(item[2]) + '</small></article>';
    }).join('');
    if (claim) claim.textContent = data.certification_claim || 'No independent assurance claim is currently recorded.';
  }

  function renderFrameworks() {
    var counts = frameworkCounts(entries);
    frameworks.innerHTML = Object.keys(counts).sort().map(function (name) {
      var implemented = entries.filter(function (entry) { return entry.status === 'implemented' && (entry.frameworks || []).indexOf(name) >= 0; }).length;
      return '<article class="cr-framework"><strong>' + esc(name) + '</strong><span>' + counts[name] + ' mapped log entr' + (counts[name] === 1 ? 'y' : 'ies') + '</span><em>' + implemented + ' implemented</em></article>';
    }).join('');
  }

  function entryMarkup(entry) {
    var tags = (entry.frameworks || []).map(function (name) { return '<span class="cr-tag">' + esc(name) + '</span>'; }).join('');
    var evidence = (entry.evidence || []).map(function (path) { return '<li>' + esc(path) + '</li>'; }).join('');
    return '<article class="cr-entry" data-entry-status="' + esc(entry.status) + '">' +
      '<div class="cr-entry-top"><div><span class="cr-entry-date">' + esc(entry.date) + ' · ' + esc(entry.id) + '</span><h4>' + esc(entry.title) + '</h4></div><span class="cr-status" data-status="' + esc(entry.status) + '">' + esc(entry.status.replace(/-/g, ' ')) + '</span></div>' +
      '<div class="cr-tags">' + tags + '<span class="cr-tag">' + esc(entry.control_area) + '</span></div>' +
      '<p><b>Action:</b> ' + esc(entry.action) + '</p>' +
      '<div class="cr-evidence"><b>Evidence</b><ul>' + evidence + '</ul></div>' +
      '<div class="cr-details"><div class="cr-detail"><b>Rationale</b><span>' + esc(entry.rationale) + '</span></div><div class="cr-detail"><b>Residual risk</b><span>' + esc(entry.residual_risk) + '</span></div></div>' +
      '<div class="cr-detail cr-next"><b>Next step</b><span>' + esc(entry.next_step) + '</span></div>' +
      '</article>';
  }

  function renderLog() {
    var q = (search && search.value || '').trim().toLowerCase();
    var wantedStatus = status && status.value || '';
    var filtered = entries.filter(function (entry) {
      if (wantedStatus && entry.status !== wantedStatus) return false;
      if (!q) return true;
      return [entry.id, entry.title, entry.control_area, entry.action, entry.rationale, entry.residual_risk, entry.next_step]
        .concat(entry.frameworks || [], entry.evidence || [])
        .join(' ').toLowerCase().indexOf(q) >= 0;
    });
    log.innerHTML = filtered.map(entryMarkup).join('');
    empty.hidden = filtered.length !== 0;
  }

  function fail(message) {
    if (claim) claim.textContent = message;
    if (log) log.innerHTML = '<div class="cr-empty">Compliance evidence could not be loaded.</div>';
  }

  function load() {
    var authClient = window.NJPTRAccess && window.NJPTRAccess.client ? window.NJPTRAccess.client() : null;
    if (!authClient) return Promise.reject(new Error('Authentication client unavailable'));
    return authClient.auth.getSession().then(function (result) {
      var token = result && result.data && result.data.session && result.data.session.access_token;
      if (!token) throw new Error('Developer session unavailable');
      return fetch(DATA_URL, {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Authorization: 'Bearer ' + token }
      });
    }).then(function (response) {
      if (!response.ok) throw new Error('Compliance log request returned ' + response.status);
      return response.json();
    }).then(function (data) {
      entries = Array.isArray(data.entries) ? data.entries.slice().sort(function (a, b) { return String(b.id).localeCompare(String(a.id)); }) : [];
      renderStats(data); renderFrameworks(); renderLog();
    }).catch(function (error) { console.error(error); fail('The compliance evidence log is temporarily unavailable.'); });
  }

  if (search) search.addEventListener('input', renderLog);
  if (status) status.addEventListener('change', renderLog);

  Promise.resolve(window.njptrAccessReady).then(function (access) {
    if (!access || !access.developer) return;
    if (app) app.hidden = false;
    return load();
  }).catch(function () {});
})();
