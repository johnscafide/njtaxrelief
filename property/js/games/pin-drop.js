/* Pin Drop: find a real sold New Jersey home on the map. One guess.
   Markup and copy live in /property/games/pin-drop/index.html. The map is
   Leaflet with Esri street and imagery tiles; at street level the
   property lines come straight from the New Jersey parcel map (NJOGIS), so
   the player can tap the exact parcel. Three clues are free; each extra clue
   costs 5 points. Scoring matches api/_watchdog-games-engine.js. */
(function () {
  'use strict';
  var G = window.WatchdogGames;
  if (!G || !window.L) return;

  var GAME = 'pin-drop';
  var CLUE_COST = 5;
  var PARCEL_ZOOM = 17;
  var PARCELS = 'https://services2.arcgis.com/XVOqAjTOJ5P6ngMu/ArcGIS/rest/services/Parcels_Composite_NJ_WM/FeatureServer/0/query';
  var NJ = L.latLngBounds([38.88, -75.6], [41.37, -73.88]);
  var TILES = {
    map: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', opts: { maxZoom: 20, maxNativeZoom: 19, attribution: 'Powered by Esri. Sources: Esri, HERE, Garmin, USGS, Intermap, INCREMENT P, NRCan, Esri Japan, METI, Esri China (Hong Kong), Esri Korea, Esri (Thailand), NGCC, &copy; OpenStreetMap contributors, and the GIS User Community' } },
    satellite: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', opts: { maxZoom: 20, maxNativeZoom: 19, attribution: 'Powered by Esri. Source: Esri, Vantor, Earthstar Geographics, and the GIS User Community' } }
  };
  var PRAISE = [[100, 'Front door'], [90, 'Right on the block'], [75, 'Same neighborhood'], [50, 'Right part of the state'], [25, 'In the area'], [0, 'Wide of the mark']];
  var money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  var count = new Intl.NumberFormat('en-US');
  var $ = function (id) { return document.getElementById(id); };
  var puzzle, answer, paid, state, map, tiles, layerName = 'map';
  var parcels = {}, parcelGroup, parcelCount = 0, fetchCtl = null, fetchTimer = null;
  var pick = null, pinMarker = null, selectedLayer = null;

  function fill(field, value) {
    document.querySelectorAll('[data-f="' + field + '"]').forEach(function (node) { node.textContent = value; });
  }
  function miles(a, b) {
    var r = Math.PI / 180;
    var h = Math.pow(Math.sin((b.lat - a.lat) * r / 2), 2) + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.pow(Math.sin((b.lon - a.lon) * r / 2), 2);
    return 3958.8 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  function points(d, exact, clues) {
    var base = exact ? 100 : Math.round(95 * Math.exp(-Math.max(0, d) / 10));
    return Math.max(0, base - CLUE_COST * clues);
  }
  function distanceText(d) {
    if (d < 0.1) return Math.round(d * 5280) + ' feet';
    return (d < 10 ? d.toFixed(1) : String(Math.round(d))) + ' miles';
  }

  // ---------- map ----------
  function pinIcon(cls) {
    return L.divIcon({
      className: 'pd-pin ' + (cls || ''),
      html: '<svg viewBox="0 0 32 44" aria-hidden="true"><path d="M16 1C7.7 1 1 7.6 1 15.8 1 27 16 43 16 43s15-16 15-27.2C31 7.6 24.3 1 16 1z"/><circle cx="16" cy="16" r="5.5"/></svg>',
      iconSize: [32, 44],
      iconAnchor: [16, 43]
    });
  }
  function parcelStyle(on) {
    var sat = layerName === 'satellite';
    return on
      ? { color: sat ? '#ffd166' : '#0e2248', weight: 3, fillColor: '#1456a0', fillOpacity: 0.35 }
      : { color: sat ? '#ffffff' : '#1456a0', weight: sat ? 1.2 : 1, opacity: sat ? 0.85 : 0.7, fillColor: '#1456a0', fillOpacity: 0.02 };
  }
  function setLayer(name) {
    layerName = name;
    if (tiles) map.removeLayer(tiles);
    tiles = L.tileLayer(TILES[name].url, TILES[name].opts).addTo(map);
    tiles.bringToBack();
    document.querySelectorAll('[data-layer]').forEach(function (b) {
      var on = b.getAttribute('data-layer') === name;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    Object.keys(parcels).forEach(function (pin) { parcels[pin].setStyle(parcelStyle(parcels[pin] === selectedLayer)); });
  }

  function hint() {
    var node = $('pd-hint');
    if (state && state.done) { node.hidden = true; return; }
    node.hidden = false;
    node.textContent = map.getZoom() >= PARCEL_ZOOM
      ? (pick && pick.pin ? 'Property picked. Lock it in or tap another.' : 'Tap a property to pick it')
      : 'Zoom in to street level to see property lines';
  }

  function loadParcels() {
    if (!map || map.getZoom() < PARCEL_ZOOM) return;
    if (fetchCtl) fetchCtl.abort();
    fetchCtl = window.AbortController ? new AbortController() : null;
    var b = map.getBounds().pad(0.15);
    var params = new URLSearchParams({
      geometry: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].map(function (n) { return n.toFixed(6); }).join(','),
      geometryType: 'esriGeometryEnvelope',
      inSR: '4326',
      spatialRel: 'esriSpatialRelIntersects',
      outFields: 'PAMS_PIN',
      returnGeometry: 'true',
      outSR: '4326',
      geometryPrecision: '6',
      resultRecordCount: '2000',
      f: 'geojson'
    });
    fetch(PARCELS + '?' + params.toString(), { signal: fetchCtl ? fetchCtl.signal : undefined })
      .then(function (r) { return r.json(); })
      .then(addParcels)
      .catch(function () { /* map still works with a plain pin */ });
  }
  function addParcels(geo) {
    if (!geo || !geo.features) return;
    if (parcelCount > 6000) { parcelGroup.clearLayers(); parcels = {}; parcelCount = 0; if (selectedLayer) { parcels[selectedLayer.pin] = selectedLayer; parcelGroup.addLayer(selectedLayer); } }
    geo.features.forEach(function (f) {
      var pin = f.properties && f.properties.PAMS_PIN;
      if (!pin || parcels[pin]) return;
      var layer = L.geoJSON(f, { style: parcelStyle(false), interactive: !state.done });
      layer.pin = pin;
      layer.on('click', function (e) {
        L.DomEvent.stopPropagation(e);
        if (state.done) return;
        choose(e.latlng, layer);
      });
      parcels[pin] = layer;
      parcelCount++;
      parcelGroup.addLayer(layer);
    });
  }

  function choose(latlng, layer) {
    if (selectedLayer && selectedLayer !== layer) selectedLayer.setStyle(parcelStyle(false));
    selectedLayer = layer || null;
    var spot = latlng;
    if (layer) {
      layer.setStyle(parcelStyle(true));
      spot = layer.getBounds().getCenter();
    }
    pick = { lat: spot.lat, lon: spot.lng, pin: layer ? layer.pin : null };
    if (!pinMarker) pinMarker = L.marker(spot, { icon: pinIcon(), keyboard: false, interactive: false }).addTo(map);
    else pinMarker.setLatLng(spot);
    G.replay(pinMarker.getElement(), 'is-drop');
    var btn = $('pd-guess');
    btn.disabled = false;
    btn.textContent = layer ? 'Lock in this property' : 'Lock in my pin';
    hint();
  }

  // ---------- clues ----------
  function maxPoints() { return 100 - CLUE_COST * state.clues; }
  function renderClues(newest) {
    var list = $('pd-clue-list');
    list.querySelectorAll('[data-paid]').forEach(function (n) { n.remove(); });
    paid.forEach(function (clue, i) {
      var li = $('pd-clue-tpl').content.firstElementChild.cloneNode(true);
      li.setAttribute('data-paid', String(i));
      li.querySelector('.pd-clue-n').textContent = String(i + 4);
      li.querySelector('.pd-clue-label').textContent = clue.label;
      var open = i < state.clues || state.done;
      var value = li.querySelector('.pd-clue-value');
      var buy = li.querySelector('.pd-buy');
      li.classList.toggle('is-open', open);
      if (open) {
        buy.remove();
        if (clue.path) {
          value.textContent = '';
          var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          svg.setAttribute('viewBox', clue.view_box);
          svg.setAttribute('class', 'pd-shape');
          svg.setAttribute('role', 'img');
          svg.setAttribute('aria-label', clue.value);
          var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          path.setAttribute('d', clue.path);
          svg.appendChild(path);
          value.appendChild(svg);
        } else {
          value.textContent = clue.value;
        }
        if (i === newest) G.replay(li, 'is-new');
      } else {
        value.textContent = 'Locked';
        if (i !== state.clues) { buy.disabled = true; buy.textContent = 'Open the one above first'; }
        buy.addEventListener('click', function () { buyClue(i, buy); });
      }
      list.appendChild(li);
    });
    $('pd-clue-count').textContent = (3 + (state.done ? paid.length : state.clues)) + ' of ' + (3 + paid.length);
    $('pd-max').textContent = state.done ? 'Round over' : 'Worth up to ' + maxPoints() + ' points';
  }
  var armed = null;
  function buyClue(i, button) {
    if (state.done || i !== state.clues) return;
    if (armed !== i) {
      armed = i;
      button.textContent = 'Tap again to open (-5)';
      button.classList.add('is-armed');
      setTimeout(function () { if (armed === i && button.isConnected) { armed = null; button.textContent = 'Open for 5 points'; button.classList.remove('is-armed'); } }, 3500);
      return;
    }
    armed = null;
    state.clues = i + 1;
    G.saveDay(GAME, puzzle.date, state);
    renderClues(i);
    G.toast('Clue opened. Worth up to ' + maxPoints() + ' now.');
  }

  // ---------- guess and reveal ----------
  function lockIn() {
    if (!pick || state.done) return;
    var d = miles(pick, answer);
    var exact = pick.pin === answer.pin;
    state.done = true;
    state.won = exact;
    state.points = points(d, exact, state.clues);
    state.bucket = Math.min(4, Math.floor(state.points / 20));
    state.miles = Math.round(d * 100) / 100;
    state.exact = exact;
    state.play = { lat: Math.round(pick.lat * 1e6) / 1e6, lon: Math.round(pick.lon * 1e6) / 1e6, pin: pick.pin, clues: state.clues };
    G.saveDay(GAME, puzzle.date, state);
    reveal(true);
  }

  function reveal(animate) {
    $('gm-dock').hidden = true;
    renderClues(-1);
    hint();
    var guessAt = L.latLng(state.play.lat, state.play.lon);
    var home = L.latLng(answer.lat, answer.lon);
    if (!pinMarker) pinMarker = L.marker(guessAt, { icon: pinIcon(), interactive: false }).addTo(map);
    L.marker(home, { icon: pinIcon('is-answer'), interactive: false }).addTo(map);
    if (!state.exact) L.polyline([guessAt, home], { color: '#0e2248', weight: 2.5, dashArray: '6 8' }).addTo(map);
    // Outline the real parcel.
    var params = new URLSearchParams({ where: "PAMS_PIN='" + answer.pin.replace(/'/g, '') + "'", outFields: 'PAMS_PIN', returnGeometry: 'true', outSR: '4326', f: 'geojson' });
    fetch(PARCELS + '?' + params.toString()).then(function (r) { return r.json(); }).then(function (geo) {
      if (geo && geo.features && geo.features.length) L.geoJSON(geo, { style: { color: '#1e8a4a', weight: 3, fillColor: '#1e8a4a', fillOpacity: 0.35 }, interactive: false }).addTo(map);
    }).catch(function () {});
    var both = L.latLngBounds([guessAt, home]);
    if (state.exact || both.getNorthEast().distanceTo(both.getSouthWest()) < 200) map.setView(home, 18, { animate: animate });
    else map.fitBounds(both, { padding: [48, 48], maxZoom: 17, animate: animate });

    $('gm-done').hidden = false;
    $('gm-done-answer').textContent = state.points + ' points';
    $('gm-done-sub').textContent = state.exact ? 'Exact property' : distanceText(state.miles) + ' away';
    var praise = PRAISE.filter(function (p) { return state.points >= p[0]; })[0][1];
    $('gm-results-title').textContent = state.exact ? 'Found it.' : praise + '.';
    $('gm-r-answer').textContent = state.points + ' points';
    $('gm-r-sub').textContent = (state.exact ? 'You picked the exact property. ' : 'Your pin was ' + distanceText(state.miles) + ' away. ')
      + 'It was on ' + answer.street + ' in ' + answer.town + ', ' + answer.county + ' County. '
      + (state.clues ? 'You used ' + state.clues + ' extra clue' + (state.clues > 1 ? 's' : '') + '.' : 'No extra clues.');
    $('gm-next-wrap').hidden = puzzle.date !== G.today();
    if (animate) {
      G.toast(state.exact ? 'Exact property!' : distanceText(state.miles) + ' away', 2200);
      G.wait(1600).then(showResults);
    }
  }

  function shareText() {
    return ['Watchdog Pin Drop No. ' + puzzle.number + ': ' + state.points + '/100',
      (state.exact ? 'Exact property' : distanceText(state.miles) + ' away') + ', ' + (state.clues ? state.clues + ' extra clue' + (state.clues > 1 ? 's' : '') : 'no extra clues'),
      'https://www.watchdogindex.com/games/pin-drop'].join('\n');
  }
  function showResults() {
    G.renderStats(GAME, puzzle.date === G.today() ? state.bucket + 1 : null);
    G.openSheet('gm-results');
  }

  // ---------- start ----------
  function startMap() {
    map = L.map('gm-map', { maxBounds: NJ.pad(0.35), maxBoundsViscosity: 0.8, minZoom: 7, maxZoom: 20, zoomSnap: 0.5, worldCopyJump: false, tap: true });
    map.fitBounds(NJ, { padding: [8, 8] });
    map.attributionControl.setPrefix(false);
    // Map credits sit on one line; tap to read them in full (as Esri's own maps do).
    var credits = map.attributionControl.getContainer();
    credits.setAttribute('tabindex', '0');
    credits.setAttribute('role', 'button');
    credits.setAttribute('aria-label', 'Map credits');
    var toggleCredits = function () { credits.classList.toggle('is-open'); };
    credits.addEventListener('click', toggleCredits);
    credits.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleCredits(); } });
    parcelGroup = L.layerGroup().addTo(map);
    setLayer('map');
    map.on('click', function (e) { if (!state.done) choose(e.latlng, null); });
    map.on('moveend zoomend', function () {
      hint();
      clearTimeout(fetchTimer);
      if (map.getZoom() >= PARCEL_ZOOM) { fetchTimer = setTimeout(loadParcels, 250); if (!map.hasLayer(parcelGroup)) parcelGroup.addTo(map); }
      else if (map.hasLayer(parcelGroup)) map.removeLayer(parcelGroup);
    });
    document.querySelectorAll('[data-layer]').forEach(function (b) {
      b.addEventListener('click', function () { setLayer(b.getAttribute('data-layer')); });
    });
    // Keyboard: arrows pan, +/- zoom (Leaflet), Enter drops the pin at the center.
    $('gm-map').addEventListener('keydown', function (e) {
      if ((e.key === 'Enter' || e.key === ' ') && !state.done) { e.preventDefault(); choose(map.getCenter(), null); }
    });
    hint();
  }

  $('pd-guess').addEventListener('click', lockIn);
  $('pd-clues-btn').addEventListener('click', function () { G.openSheet('pd-clues'); });
  $('gm-share').addEventListener('click', function () { G.share(shareText()); });
  $('gm-done-btn').addEventListener('click', showResults);
  G.wireBar(GAME);

  G.loadPuzzle(GAME).then(function (p) {
    puzzle = p;
    answer = G.decodeData(p.k);
    paid = G.decodeData(p.paid) || [];
    if (!answer || !answer.pin) throw new Error('bad answer');
    var h = p.home, f = p.free;
    $('pd-price').textContent = money.format(f.price);
    fill('sold', 'sold ' + h.sold);
    fill('built', String(h.year_built));
    fill('sqft', count.format(h.sqft) + ' sq ft');
    fill('tax', 'about ' + money.format(f.tax));
    fill('sale-line', money.format(f.price) + ', ' + h.sold);
    fill('house-line', h.kind + ', built ' + h.year_built + ', ' + count.format(h.sqft) + ' sq ft');
    fill('tax-line', 'About ' + money.format(f.tax) + ' a year at a ' + f.rate.toFixed(3) + ' general tax rate (' + f.rate_year + ')');
    var past = p.date !== G.today();
    $('gm-meta').textContent = (past ? 'Archive No. ' : 'No. ') + p.number + ' · ' + G.prettyDate(p.date).replace(/^(\w{3})\w*/, '$1');
    state = G.getDay(GAME, p.date) || { done: false, won: false, clues: 0 };
    state.clues = state.clues || 0;
    G.wireArchive(p.date);
    G.countdown($('gm-next'));
    startMap();
    renderClues(-1);
    if (state.done) reveal(false);
    var start = past || state.done ? Promise.resolve() : G.splash(p, state.clues > 0);
    return start.then(function () {
      map.invalidateSize();
      if (state.done && !past && !seenThisVisit()) showResults();
    });
  }).catch(function () {
    $('gm-meta').textContent = 'Today\'s home did not load. Refresh to try again.';
  });

  function seenThisVisit() {
    try {
      var key = 'wd-games:seen:' + GAME + ':' + puzzle.date;
      if (window.sessionStorage.getItem(key)) return true;
      window.sessionStorage.setItem(key, '1');
    } catch (e) { /* fine */ }
    return false;
  }
})();
