/* Watchdog City address-locality runtime.
   City is the familiar address locality from the NJ Office of GIS geocoder.
   Municipality/town remains the separate taxing and assessment jurisdiction. */
(function () {
  'use strict';
  if (window.__WATCHDOG_CITY_ADDRESS_RUNTIME__) return;
  window.__WATCHDOG_CITY_ADDRESS_RUNTIME__ = true;

  var GEOCODER = 'https://geo.nj.gov/arcgis/rest/services/Tasks/NJ_Geocode/GeocodeServer/findAddressCandidates';
  var CITY_MARKER_ID = 'property.city';
  var memory = Object.create(null);
  var client = null;
  var syncPromise = null;
  var observer = null;
  var searchObserver = null;

  function clean(value) { return String(value == null ? '' : value).trim(); }
  function norm(value) {
    return clean(value).toUpperCase().replace(/\bNEW JERSEY\b/g, 'NJ').replace(/[^A-Z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function locality(row) { return clean(row && (row.city || row.town || row.municipality)); }
  function municipality(row) { return clean(row && (row.town || row.municipality)); }
  function zip(row) { return clean(row && (row.zip || row.postal)); }
  function full(row) {
    return [clean(row && (row.address || row.street_address)), locality(row), 'NJ', zip(row)].filter(Boolean).join(', ');
  }
  function cityLine(row) {
    return [locality(row), zip(row)].filter(Boolean).join(' ');
  }
  function municipalityNote(row) {
    var city = clean(row && row.city), town = municipality(row);
    return city && town && norm(city) !== norm(town) ? 'Municipality: ' + town : '';
  }

  function getClient() {
    if (client) return client;
    try {
      if (window.NJPTRAccess && typeof window.NJPTRAccess.client === 'function') client = window.NJPTRAccess.client();
      if (!client && window.NJPTRSupabaseRuntime && typeof window.NJPTRSupabaseRuntime.createClient === 'function') client = window.NJPTRSupabaseRuntime.createClient();
      if (!client && window.__njwSB) client = window.__njwSB;
    } catch (_error) {}
    return client;
  }

  function queryAddress(row) {
    return [clean(row && (row.address || row.street_address)), municipality(row), 'NJ', zip(row)].filter(Boolean).join(', ');
  }

  function geocodeCity(row) {
    if (clean(row && row.city)) return Promise.resolve(clean(row.city));
    var address = queryAddress(row);
    if (!address) return Promise.resolve('');
    var key = norm(address);
    if (memory[key]) return memory[key];

    var params = new URLSearchParams({
      SingleLine: address,
      outFields: 'City,Postal,Addr_type',
      outSR: '4326',
      maxLocations: '1',
      f: 'json'
    });
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = controller ? window.setTimeout(function () { controller.abort(); }, 8000) : null;
    memory[key] = fetch(GEOCODER + '?' + params.toString(), controller ? { signal: controller.signal } : undefined)
      .then(function (response) {
        if (timer) window.clearTimeout(timer);
        if (!response.ok) return null;
        return response.json();
      })
      .then(function (payload) {
        var candidate = payload && payload.candidates && payload.candidates[0];
        if (!candidate || Number(candidate.score || 0) < 70) return '';
        var attrs = candidate.attributes || {};
        return clean(attrs.City || attrs.city);
      })
      .catch(function () { if (timer) window.clearTimeout(timer); return ''; });
    return memory[key];
  }

  function runPool(items, limit, worker) {
    var next = 0;
    var runners = [];
    function run() {
      var index = next++;
      if (index >= items.length) return Promise.resolve();
      return Promise.resolve(worker(items[index], index)).catch(function () {}).then(run);
    }
    for (var i = 0; i < Math.min(limit, items.length); i += 1) runners.push(run());
    return Promise.all(runners);
  }

  function rewriteElement(node, row) {
    if (!node || node.dataset && node.dataset.watchdogCityDecorated === '1') return;
    var text = clean(node.textContent);
    if (!text || !clean(row.city) || !municipality(row)) return;

    var street = clean(row.address || row.street_address);
    var town = municipality(row);
    var postal = zip(row);
    var oldFull = [street, town, 'NJ', postal].filter(Boolean).join(', ');
    var oldFullNoState = [street, town, postal].filter(Boolean).join(', ');
    var oldLine = [town, postal].filter(Boolean).join(' ');
    var newFull = full(row);
    var newLine = cityLine(row);
    var normalized = norm(text);
    var replacement = '';

    if (normalized === norm(oldFull) || normalized === norm(oldFullNoState)) replacement = newFull;
    else if (postal && normalized === norm(oldLine)) replacement = newLine;
    else return;

    if (!replacement || replacement === text) return;
    node.textContent = replacement;
    if (node.dataset) node.dataset.watchdogCityDecorated = '1';
    var note = municipalityNote(row);
    if (note) node.title = note;
  }

  function decorateRow(row, root) {
    if (!row || !clean(row.city) || !clean(row.address)) return;
    root = root || document;
    var selectors = 'h1,h2,h3,h4,p,span,a,div';
    var nodes = root.querySelectorAll ? root.querySelectorAll(selectors) : [];
    for (var i = 0; i < nodes.length; i += 1) {
      var node = nodes[i];
      if (node.children && node.children.length > 1) continue;
      rewriteElement(node, row);
    }
  }

  function decorateSaved(rows) {
    (rows || []).forEach(function (row) { decorateRow(row, document); });
  }

  function persistCity(row, city) {
    if (!row || !row.id || !city) return Promise.resolve();
    var sb = getClient();
    if (!sb) return Promise.resolve();
    return sb.from('saved_properties').update({ city: city }).eq('id', row.id).then(function () {
      row.city = city;
      decorateRow(row, document);
    }).catch(function () {});
  }

  function resolveSavedRow(row) {
    if (!row || !clean(row.address)) return Promise.resolve();
    if (clean(row.city)) { decorateRow(row, document); return Promise.resolve(); }
    return geocodeCity(row).then(function (city) {
      if (!city) return;
      row.city = city;
      return persistCity(row, city);
    });
  }

  function syncSaved() {
    if (syncPromise) return syncPromise;
    var sb = getClient();
    if (!sb) return Promise.resolve([]);
    syncPromise = sb.auth.getSession().then(function (sessionResult) {
      if (!sessionResult || !sessionResult.data || !sessionResult.data.session) return [];
      return sb.from('saved_properties')
        .select('id,pams_pin,address,city,town,county,zip,kind,updated_at')
        .order('updated_at', { ascending: false })
        .limit(80)
        .then(function (result) {
          var rows = result && Array.isArray(result.data) ? result.data : [];
          decorateSaved(rows);
          var missing = rows.filter(function (row) { return row.address && !row.city; }).slice(0, 32);
          return runPool(missing, 4, resolveSavedRow).then(function () { return rows; });
        });
    }).catch(function () { return []; }).finally(function () { syncPromise = null; });
    return syncPromise;
  }

  function syncSavedPin(pin) {
    pin = clean(pin);
    var sb = getClient();
    if (!sb || !pin) return Promise.resolve();
    return sb.auth.getSession().then(function (sessionResult) {
      if (!sessionResult || !sessionResult.data || !sessionResult.data.session) return;
      return sb.from('saved_properties')
        .select('id,pams_pin,address,city,town,county,zip,kind')
        .eq('pams_pin', pin)
        .limit(4)
        .then(function (result) { return runPool((result && result.data) || [], 2, resolveSavedRow); });
    }).catch(function () {});
  }

  function rowForPin(pin) {
    var rows = Array.isArray(window.__njwRows) ? window.__njwRows : [];
    for (var i = 0; i < rows.length; i += 1) if (clean(rows[i].pin) === clean(pin)) return rows[i];
    return null;
  }

  function decorateSearchCard(card) {
    if (!card || card.dataset.watchdogCityPending === '1' || card.dataset.watchdogCityDone === '1') return;
    var save = card.querySelector('[data-save-pin]');
    var row = save ? rowForPin(save.getAttribute('data-save-pin')) : null;
    if (!row || !row.addr) return;
    card.dataset.watchdogCityPending = '1';
    geocodeCity({ address: row.addr, city: row.city, town: row.town, zip: row.zip }).then(function (city) {
      delete card.dataset.watchdogCityPending;
      card.dataset.watchdogCityDone = '1';
      if (!city) return;
      row.city = city;
      var display = { address: row.addr, city: city, town: row.town, zip: row.zip };
      card.dataset.address = full(display);
      var sub = card.querySelector('.hd-sub');
      if (sub) {
        sub.textContent = cityLine(display);
        var note = municipalityNote(display);
        if (note) sub.title = note;
      }
    });
  }

  function watchSearchCards() {
    if (searchObserver || typeof IntersectionObserver === 'undefined') return;
    searchObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) decorateSearchCard(entry.target);
      });
    }, { rootMargin: '300px 0px' });

    function scan() {
      document.querySelectorAll('#hd-list .hd-card').forEach(function (card) {
        if (card.dataset.watchdogCityObserved === '1') return;
        card.dataset.watchdogCityObserved = '1';
        searchObserver.observe(card);
      });
    }
    scan();
    observer = new MutationObserver(scan);
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function installSaveHook() {
    document.addEventListener('click', function (event) {
      var button = event.target && event.target.closest ? event.target.closest('[data-save-pin]') : null;
      if (!button) return;
      var pin = button.getAttribute('data-save-pin');
      window.setTimeout(function () { syncSavedPin(pin); }, 900);
    }, true);
  }

  function cityMarker() {
    return {
      id: CITY_MARKER_ID,
      label: 'City',
      description: 'Familiar property address locality returned by the New Jersey Office of GIS statewide geocoder. Distinct from the taxing municipality.',
      category: 'parcel',
      scope: 'property',
      tier: 'standard',
      origin: 'public',
      proprietary: false,
      professions: ['consumer','attorney','title','agent','lender','appraiser','contractor','investor'],
      source_id: 'nj-ogis-geocoder',
      status: 'live',
      field: 'city'
    };
  }

  function augmentCatalog(doc) {
    if (!doc || !Array.isArray(doc.markers)) return doc;
    var exists = doc.markers.some(function (marker) { return marker && marker.id === CITY_MARKER_ID; });
    if (exists) return doc;
    doc.markers.splice(1, 0, cityMarker());
    doc.summary = doc.summary || {};
    doc.summary.total = Number(doc.summary.total || (doc.markers.length - 1)) + 1;
    doc.summary.public_source = Number(doc.summary.public_source || 0) + 1;
    doc.summary.by_tier = doc.summary.by_tier || {};
    doc.summary.by_tier.standard = Number(doc.summary.by_tier.standard || 0) + 1;
    if (doc.target_markers) doc.summary.percent_of_goal = Math.round((doc.summary.total / Number(doc.target_markers)) * 1000) / 10;
    return doc;
  }

  function installCatalogOverlay() {
    if (window.__WATCHDOG_CITY_CATALOG_OVERLAY__ || typeof window.fetch !== 'function') return;
    window.__WATCHDOG_CITY_CATALOG_OVERLAY__ = true;
    var nativeFetch = window.fetch.bind(window);
    window.fetch = function (input, init) {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      return nativeFetch(input, init).then(function (response) {
        if (!/\/property\/data\/marker-registry\.json(?:[?#]|$)/.test(url) || !response.ok) return response;
        return response.clone().json().then(function (doc) {
          augmentCatalog(doc);
          var headers = new Headers(response.headers);
          headers.set('Content-Type', 'application/json; charset=utf-8');
          return new Response(JSON.stringify(doc), { status: response.status, statusText: response.statusText, headers: headers });
        }).catch(function () { return response; });
      });
    };
  }

  window.WatchdogAddress = {
    source: 'NJ Office of GIS statewide geocoder',
    cityMarkerId: CITY_MARKER_ID,
    city: locality,
    municipality: municipality,
    full: full,
    municipalityNote: municipalityNote,
    resolveCity: geocodeCity,
    syncSaved: syncSaved,
    augmentMarkerCatalog: augmentCatalog
  };

  installCatalogOverlay();
  installSaveHook();
  watchSearchCards();

  function boot() {
    watchSearchCards();
    syncSaved();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
  window.addEventListener('load', function () { window.setTimeout(syncSaved, 300); });
})();
