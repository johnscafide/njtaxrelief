/* Dashboard interaction polish: pagination, clean property routing, sponsor link,
   and map compatibility. Keeps the core dashboard renderer focused on state. */
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

  function ledgerPanel() {
    var body = d.querySelector('.wdd-table tbody');
    return body ? body.closest('.wdd-panel') : null;
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

  function renderLedgerPage() {
    if (!ledgerBody || !ledgerBody.isConnected) return;
    var total = ledgerRows.length;
    var totalPages = Math.max(1, Math.ceil(total / pageSize));
    page = Math.max(1, Math.min(page, totalPages));
    var start = (page - 1) * pageSize;
    var end = Math.min(total, start + pageSize);
    var fragment = d.createDocumentFragment();
    ledgerRows.slice(start, end).forEach(function (row) { fragment.appendChild(row); });
    ledgerBody.replaceChildren(fragment);

    var panel = ledgerPanel();
    if (!panel) return;
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
      if (resetPage !== false) page = 1;
    }
    renderLedgerPage();
  }

  function refreshAfterRenderer(resetPage) {
    w.setTimeout(function () {
      patchSponsorLink();
      captureLedger(resetPage);
    }, 0);
  }

  function goToProperty(pin) {
    if (!pin) return;
    location.assign(route('/home') + '?pin=' + encodeURIComponent(pin));
  }

  function handleCaptureClick(event) {
    var target = event.target && event.target.closest ? event.target : null;
    if (!target) return;
    var row = target.closest('tr[data-pin]');
    if (!row) return;
    var pin = row.getAttribute('data-pin');
    if (!pin) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    goToProperty(pin);
  }

  function handleClick(event) {
    var target = event.target && event.target.closest ? event.target : null;
    if (!target) return;

    var nav = target.closest('[data-ledger-nav]');
    if (nav) {
      event.preventDefault();
      var totalPages = Math.max(1, Math.ceil(ledgerRows.length / pageSize));
      var action = nav.getAttribute('data-ledger-nav');
      if (action === 'first') page = 1;
      if (action === 'prev') page -= 1;
      if (action === 'next') page += 1;
      if (action === 'last') page = totalPages;
      renderLedgerPage();
      return;
    }

    if (target.closest('[data-sort]') || target.closest('[data-tab]')) {
      page = 1;
      refreshAfterRenderer(true);
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
    patchLeafletTiles();
    refreshAfterRenderer(true);
    if (WD && typeof WD.onRepaint === 'function') {
      WD.onRepaint(function () { refreshAfterRenderer(true); });
    }
    d.addEventListener('click', handleClick);
    d.addEventListener('change', handleChange);
  }

  patchNumberHelper();
  patchLeafletTiles();
  d.addEventListener('click', handleCaptureClick, true);
  if (WD && WD.S && WD.S.user) afterReady();
  else d.addEventListener('wd:ready', function () { w.setTimeout(afterReady, 0); }, { once: true });
})(window, document);
