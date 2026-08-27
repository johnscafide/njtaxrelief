/* Dashboard interaction polish: scalable ledger, quick portfolio filters, clean property routing,
   sponsor link, and map compatibility. Keeps the core dashboard renderer focused on state. */
(function (w, d) {
  'use strict';
  if (w.__WATCHDOG_DASHBOARD_POLISH__) return;
  w.__WATCHDOG_DASHBOARD_POLISH__ = true;

  var WD = w.WD;
  var PAGE_KEY = 'watchdogDashboardLedgerPageSizeV1';
  var pageSize = 20;
  var page = 1;
  var ledgerBody = null;
  var ledgerRows = [];
  var query = '';
  var quickFilter = 'all';

  try {
    var savedSize = Number(w.localStorage.getItem(PAGE_KEY));
    if ([10, 20, 50, 100].indexOf(savedSize) >= 0) pageSize = savedSize;
  } catch (_storageError) {}

  function route(path) {
    var prefix = w.NJPTRSupabaseRuntime && typeof w.NJPTRSupabaseRuntime.routePrefix === 'string'
      ? w.NJPTRSupabaseRuntime.routePrefix
      : ((location.hostname === 'watchdogindex.com' || location.hostname === 'www.watchdogindex.com') ? '' : '/property');
    path = String(path || '/');
    if (path.charAt(0) !== '/') path = '/' + path;
    return prefix + path;
  }

  function patchNumberHelper() {
    if (!WD || !WD.H) return;
    WD.H.valid = function (value) {
      if (value == null || value === '') return null;
      var number = Number(value);
      return Number.isFinite(number) ? number : null;
    };
  }

  function validNjCoordinates(property) {
    var lat = Number(property && property.lat);
    var lon = Number(property && property.lon);
    return Number.isFinite(lat) && Number.isFinite(lon) && lat >= 38.7 && lat <= 41.5 && lon >= -75.8 && lon <= -73.7;
  }

  function patchCoordinateData() {
    if (!WD || !WD.S || !Array.isArray(WD.S.properties)) return;
    WD.S.properties.forEach(function (property) {
      if (!validNjCoordinates(property)) {
        property.lat = null;
        property.lon = null;
      }
    });
  }

  function patchLeafletTiles() {
    if (!w.L || !w.L.tileLayer || w.L.__watchdogNoKeyTilePatch) return;
    var original = w.L.tileLayer;
    w.L.tileLayer = function (url, options) {
      if (/basemaps\.cartocdn\.com/i.test(String(url || ''))) {
        var next = Object.assign({}, options || {}, {
          attribution: '&copy; OpenStreetMap contributors',
          maxZoom: 19
        });
        return original.call(w.L, 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', next);
      }
      return original.apply(w.L, arguments);
    };
    w.L.__watchdogNoKeyTilePatch = true;
  }

  function patchSponsorLink() {
    d.querySelectorAll('a.wdd-sponsor').forEach(function (anchor) {
      anchor.href = 'https://johnvarano.com/';
      anchor.target = '_blank';
      anchor.rel = 'noopener sponsored';
      anchor.setAttribute('aria-label', 'Visit John Varano mortgage website');
    });
  }

  function propertyByPin(pin) {
    if (!WD || !WD.S || !Array.isArray(WD.S.properties)) return null;
    return WD.S.properties.find(function (property) { return String(property.pams_pin || '') === String(pin || ''); }) || null;
  }

  function filteredProperties() {
    return WD && typeof WD.filtered === 'function' ? WD.filtered() : ((WD && WD.S && WD.S.properties) || []);
  }

  function snapshotCounts() {
    var properties = filteredProperties();
    var review = 0, gaps = 0, mapped = 0, unmapped = 0;
    properties.forEach(function (property) {
      if (WD && typeof WD.categoryFor === 'function' && WD.categoryFor(property) !== 'ok') review += 1;
      var gap = WD && typeof WD.gapFor === 'function' ? WD.gapFor(property) : null;
      if (gap && Number(gap.pct) > 0) gaps += 1;
      if (validNjCoordinates(property)) mapped += 1;
      else unmapped += 1;
    });
    return { total: properties.length, review: review, gaps: gaps, mapped: mapped, unmapped: unmapped };
  }

  function snapshotButton(filter, label, value, icon) {
    return '<button type="button" class="wdd-snapshot-metric' + (quickFilter === filter ? ' is-active' : '') + '" data-ledger-filter="' + filter + '">' +
      '<span><i class="fas ' + icon + '" aria-hidden="true"></i>' + label + '</span><b>' + value.toLocaleString() + '</b></button>';
  }

  function renderSnapshot() {
    var rail = d.getElementById('wdd-rail');
    if (!rail || !WD) return;
    var counts = snapshotCounts();
    var current = rail.querySelector('#wdd-snapshot');
    var html = '<div class="wdd-snapshot-head"><div><span>PORTFOLIO SNAPSHOT</span><h3>Find what needs attention</h3></div><button type="button" data-ledger-filter="all"' + (quickFilter === 'all' ? ' disabled' : '') + '>Clear</button></div>' +
      '<div class="wdd-snapshot-grid">' +
        snapshotButton('review', 'Needs review', counts.review, 'fa-triangle-exclamation') +
        snapshotButton('gap', 'Assessment gap', counts.gaps, 'fa-scale-balanced') +
        snapshotButton('mapped', 'Map ready', counts.mapped, 'fa-location-dot') +
        snapshotButton('unmapped', 'Missing location', counts.unmapped, 'fa-location-crosshairs') +
      '</div><p>Click a metric to filter the ledger. Search and quick filters work together.</p>';
    if (!current) {
      current = d.createElement('section');
      current.id = 'wdd-snapshot';
      current.className = 'wdd-panel wdd-snapshot';
      rail.appendChild(current);
    }
    current.innerHTML = html;
  }

  function ledgerPanel() {
    var body = d.querySelector('.wdd-table tbody');
    return body ? body.closest('.wdd-panel') : null;
  }

  function rowMatchesFilter(row) {
    var pin = row.getAttribute('data-pin') || '';
    var property = propertyByPin(pin);
    if (quickFilter === 'review') return !!(property && WD && typeof WD.categoryFor === 'function' && WD.categoryFor(property) !== 'ok');
    if (quickFilter === 'gap') {
      var gap = property && WD && typeof WD.gapFor === 'function' ? WD.gapFor(property) : null;
      return !!(gap && Number(gap.pct) > 0);
    }
    if (quickFilter === 'mapped') return !!(property && validNjCoordinates(property));
    if (quickFilter === 'unmapped') return !!(property && !validNjCoordinates(property));
    return true;
  }

  function rowMatchesSearch(row) {
    if (!query) return true;
    var haystack = ((row.textContent || '') + ' ' + (row.getAttribute('data-pin') || '')).toLowerCase();
    return haystack.indexOf(query) >= 0;
  }

  function visibleLedgerRows() {
    return ledgerRows.filter(function (row) { return rowMatchesFilter(row) && rowMatchesSearch(row); });
  }

  function ledgerToolsHtml(totalMatches) {
    var filtered = quickFilter !== 'all' || query;
    return '<div class="wdd-ledger-tools">' +
      '<label class="wdd-ledger-search"><i class="fas fa-magnifying-glass" aria-hidden="true"></i><input type="search" data-ledger-search value="' + escapeAttribute(query) + '" placeholder="Search address, town, county or PIN" aria-label="Search ledger"><button type="button" data-ledger-search-clear aria-label="Clear ledger search"' + (query ? '' : ' hidden') + '><i class="fas fa-xmark"></i></button></label>' +
      '<span class="wdd-ledger-match">' + (filtered ? totalMatches.toLocaleString() + ' matching' : 'Search your portfolio') + '</span>' +
    '</div>';
  }

  function escapeAttribute(value) {
    return String(value || '').replace(/[&<>"']/g, function (char) {
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char];
    });
  }

  function controlsHtml(total, totalPages, start, end) {
    var options = [10, 20, 50, 100].map(function (size) {
      return '<option value="' + size + '"' + (size === pageSize ? ' selected' : '') + '>' + size + '</option>';
    }).join('');
    return '<div class="wdd-ledger-pagination" aria-label="Ledger pagination">' +
      '<div class="wdd-ledger-size"><label for="wdd-ledger-size">Show</label><select id="wdd-ledger-size" data-ledger-size>' + options + '</select><span>at a time</span></div>' +
      '<div class="wdd-ledger-count">' + (total ? (start + 1) + '–' + end + ' of ' + total : '0 properties') + '</div>' +
      '<div class="wdd-ledger-pages">' +
        '<button type="button" data-ledger-nav="first" aria-label="First page"' + (page <= 1 ? ' disabled' : '') + '><i class="fas fa-angles-left"></i></button>' +
        '<button type="button" data-ledger-nav="prev" aria-label="Previous page"' + (page <= 1 ? ' disabled' : '') + '><i class="fas fa-chevron-left"></i></button>' +
        '<span>Page <b>' + page + '</b> of ' + Math.max(1, totalPages) + '</span>' +
        '<button type="button" data-ledger-nav="next" aria-label="Next page"' + (page >= totalPages ? ' disabled' : '') + '><i class="fas fa-chevron-right"></i></button>' +
        '<button type="button" data-ledger-nav="last" aria-label="Last page"' + (page >= totalPages ? ' disabled' : '') + '><i class="fas fa-angles-right"></i></button>' +
      '</div>' +
    '</div>';
  }

  function decorateLedgerRows() {
    ledgerRows.forEach(function (row) {
      row.classList.add('wdd-ledger-row');
      row.setAttribute('tabindex', '0');
      row.setAttribute('role', 'link');
      row.setAttribute('aria-label', 'Open ' + ((row.querySelector('.wdd-addr') || {}).textContent || 'property').trim());
      var address = row.querySelector('.wdd-addr');
      if (address && !address.querySelector('.wdd-row-open')) {
        var open = d.createElement('span');
        open.className = 'wdd-row-open';
        open.innerHTML = 'Open <i class="fas fa-arrow-right" aria-hidden="true"></i>';
        address.appendChild(open);
      }
    });
  }

  function renderLedgerPage() {
    if (!ledgerBody || !ledgerBody.isConnected) return;
    var matches = visibleLedgerRows();
    var total = matches.length;
    var totalPages = Math.max(1, Math.ceil(total / pageSize));
    page = Math.max(1, Math.min(page, totalPages));
    var start = (page - 1) * pageSize;
    var end = Math.min(total, start + pageSize);
    var fragment = d.createDocumentFragment();
    matches.slice(start, end).forEach(function (row) { fragment.appendChild(row); });
    ledgerBody.replaceChildren(fragment);

    var panel = ledgerPanel();
    if (!panel) return;
    var oldTools = panel.querySelector('.wdd-ledger-tools');
    var scroll = panel.querySelector('.wdd-scrollx');
    var toolsShell = d.createElement('div');
    toolsShell.innerHTML = ledgerToolsHtml(total);
    if (oldTools) oldTools.replaceWith(toolsShell.firstElementChild);
    else if (scroll) scroll.insertAdjacentElement('beforebegin', toolsShell.firstElementChild);

    var controls = panel.querySelector('.wdd-ledger-pagination');
    if (!controls) {
      controls = d.createElement('div');
      controls.className = 'wdd-ledger-pagination';
      panel.appendChild(controls);
    }
    var shell = d.createElement('div');
    shell.innerHTML = controlsHtml(total, totalPages, start, end);
    controls.replaceWith(shell.firstElementChild);
  }

  function captureLedger(resetPage) {
    var nextBody = d.querySelector('.wdd-table tbody');
    if (!nextBody) {
      ledgerBody = null;
      ledgerRows = [];
      return;
    }
    if (nextBody !== ledgerBody) {
      ledgerBody = nextBody;
      ledgerRows = Array.from(nextBody.children);
      decorateLedgerRows();
      if (resetPage !== false) page = 1;
    }
    renderLedgerPage();
  }

  function refreshAfterRenderer(resetPage) {
    w.setTimeout(function () {
      patchSponsorLink();
      patchCoordinateData();
      renderSnapshot();
      captureLedger(resetPage);
    }, 0);
  }

  function goToProperty(pin) {
    if (!pin) return;
    location.assign(route('/home') + '?pin=' + encodeURIComponent(pin));
  }

  function openRow(row, event) {
    if (!row) return;
    var pin = row.getAttribute('data-pin');
    if (!pin) return;
    if (event) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
    goToProperty(pin);
  }

  function handleCaptureClick(event) {
    var target = event.target && event.target.closest ? event.target : null;
    if (!target) return;
    var row = target.closest('tr[data-pin]');
    if (!row) return;
    openRow(row, event);
  }

  function handleKeydown(event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    var row = event.target && event.target.closest ? event.target.closest('tr[data-pin]') : null;
    if (!row) return;
    openRow(row, event);
  }

  function handleClick(event) {
    var target = event.target && event.target.closest ? event.target : null;
    if (!target) return;

    var nav = target.closest('[data-ledger-nav]');
    if (nav) {
      event.preventDefault();
      var totalPages = Math.max(1, Math.ceil(visibleLedgerRows().length / pageSize));
      var action = nav.getAttribute('data-ledger-nav');
      if (action === 'first') page = 1;
      if (action === 'prev') page -= 1;
      if (action === 'next') page += 1;
      if (action === 'last') page = totalPages;
      renderLedgerPage();
      return;
    }

    var filterButton = target.closest('[data-ledger-filter]');
    if (filterButton) {
      event.preventDefault();
      quickFilter = filterButton.getAttribute('data-ledger-filter') || 'all';
      page = 1;
      var ledgerTab = d.querySelector('[data-tab="ledger"]');
      if (ledgerTab && ledgerTab.getAttribute('aria-selected') !== 'true') ledgerTab.click();
      else {
        renderLedgerPage();
        renderSnapshot();
      }
      return;
    }

    var clear = target.closest('[data-ledger-search-clear]');
    if (clear) {
      event.preventDefault();
      query = '';
      page = 1;
      renderLedgerPage();
      var input = d.querySelector('[data-ledger-search]');
      if (input) input.focus();
      return;
    }

    if (target.closest('[data-sort]') || target.closest('[data-tab]')) {
      page = 1;
      refreshAfterRenderer(true);
    }
  }

  function handleInput(event) {
    var input = event.target && event.target.closest ? event.target.closest('[data-ledger-search]') : null;
    if (!input) return;
    query = String(input.value || '').trim().toLowerCase();
    page = 1;
    renderLedgerPage();
    var next = d.querySelector('[data-ledger-search]');
    if (next) {
      next.focus();
      try { next.setSelectionRange(next.value.length, next.value.length); } catch (_selectionError) {}
    }
  }

  function handleChange(event) {
    var select = event.target && event.target.closest ? event.target.closest('[data-ledger-size]') : null;
    if (!select) return;
    var next = Number(select.value);
    if ([10, 20, 50, 100].indexOf(next) < 0) return;
    pageSize = next;
    page = 1;
    try { w.localStorage.setItem(PAGE_KEY, String(next)); } catch (_storageError) {}
    renderLedgerPage();
  }

  function afterReady() {
    WD = w.WD || WD;
    patchNumberHelper();
    patchCoordinateData();
    patchLeafletTiles();
    refreshAfterRenderer(true);
    if (WD && typeof WD.onRepaint === 'function') {
      WD.onRepaint(function () { refreshAfterRenderer(true); });
    }
    d.addEventListener('click', handleClick);
    d.addEventListener('input', handleInput);
    d.addEventListener('change', handleChange);
    d.addEventListener('keydown', handleKeydown);
  }

  patchNumberHelper();
  patchCoordinateData();
  patchLeafletTiles();
  d.addEventListener('click', handleCaptureClick, true);
  if (WD && WD.S && WD.S.user) afterReady();
  else d.addEventListener('wd:ready', function () { w.setTimeout(afterReady, 0); }, { once: true });
})(window, document);
