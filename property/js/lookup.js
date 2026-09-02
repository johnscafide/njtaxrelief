/* ============================================================
   PROPERTY LOOKUP
   watchdogindex.com
   ============================================================ */
(function () {
  'use strict';

  // ── Public endpoints. Free, no key required. ──────────────
  var NJ_GEOCODE  = 'https://geo.nj.gov/arcgis/rest/services/Tasks/NJ_Geocode/GeocodeServer/findAddressCandidates';
  var NJ_REVERSE  = 'https://geo.nj.gov/arcgis/rest/services/Tasks/NJ_Geocode/GeocodeServer/reverseGeocode';
  var CENSUS      = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress';
  var NJ_PARCEL   = 'https://services2.arcgis.com/XVOqAjTOJ5P6ngMu/ArcGIS/rest/services/Parcels_Composite_NJ_WM/FeatureServer/0/query';
  var ESRI_TILES  = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
  var ESRI_EXPORT = 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export';

  // Google Maps key, Street View Static enabled.
  var GMAPS_KEY = 'AIzaSyCZBo_mj5WXyR-Bsb5yHdekxAxauTYNmlU';

  var AGENTS = {
    john: {
      name: 'John Scafide',
      title: 'Licensed NJ Agent and Tax Professional',
      lic: 'NJ License #2079591',
      team: 'The McKenty Team / Opus Elite Real Estate',
      phone: '856-404-1098',
      email: 'john@johnscafide.com',
      photo: '/johnprofile.jpg',
      logo: '/opuslogo.jpg',
      stars: '5.0', reviews: '2', sales: '4', salesNear: '4',
      reviewUrl: 'https://www.realtor.com/realestateagents/5fa33046326083001120e3ba',
      bio: 'Most agents can tell you what your home is worth. Very few can also tell you what your assessment is doing to your bottom line. I have spent <strong>15 plus years preparing New Jersey tax returns</strong> and I sell real estate in <strong>{COUNTY}</strong>, which means I read a settlement statement and a tax assessment the same way.'
    },
    heather: {
      name: 'Heather Scafide',
      title: 'Licensed NJ Real Estate Agent',
      lic: 'NJ License #2192318',
      team: 'The McKenty Team / Opus Elite Real Estate',
      phone: '856-310-6746',
      email: 'heather@heatherscafide.com',
      photo: '/heatherheadshot.png',
      logo: '/opuslogo.jpg',
      stars: '5.0', reviews: 'New', sales: '0', salesNear: '0',
      reviewUrl: '',
      bio: 'A corporate background managing complex packaging and label supply chains as a procurement buyer means <strong>negotiation and contracts are second nature</strong>. Now full time in the South Jersey market, Heather brings that same edge to every client, buying or selling.'
    }
  };

  var GREENTREE_URL = 'https://johnvarano.com/';
  var IDX_URL = 'https://johnscafide.opuselitesj.com/index.php?advanced=1';

  var activeAgentKey = 'john';
  var EJS_PUBLIC  = 'u262kw5AoJcBI342V';
  var EJS_SERVICE = 'service_gptqbyx';
  var EJS_TMPL    = 'template_contact';

  var FIELDS = ['PAMS_PIN','COUNTY','MUN_NAME','PROP_LOC','PCLBLOCK','PCLLOT','PCLQCODE',
    'PROP_CLASS','BLDG_DESC','LAND_DESC','CALC_ACRE','YR_CONSTR','DWELL','COMM_DWELL',
    'LAND_VAL','IMPRVT_VAL','NET_VALUE','LAST_YR_TX','SALE_PRICE','DEED_DATE','DEED_BOOK','DEED_PAGE',
    'ZIP5','ST_ADDRESS','CITY_STATE','ADD_LOTS1'].join(',');

  var CLASSES = {
    '1':'Vacant Land','2':'Single Family / 1 to 4 Units','3A':'Farm, Regular','3B':'Farm, Qualified',
    '4A':'Commercial','4B':'Industrial','4C':'Apartment, 5+ Units','5A':'Railroad','5B':'Railroad',
    '6A':'Telephone','15A':'Public Property','15B':'Exempt','15C':'Cemetery','15D':'Exempt',
    '15E':'Exempt','15F':'Exempt'
  };

  var current = null, map = null, rateTable = null;
  var lookupSeq = 0, activeLookupKey = '', activeLookupPending = false;
  var referenceWarmPromise = null;

  function lookupKey(value) {
    return String(value || '').toUpperCase().replace(/\s+/g, ' ').trim();
  }

  function warmReferenceData() {
    if (referenceWarmPromise) return referenceWarmPromise;
    referenceWarmPromise = Promise.all([
      loadRates().catch(function () {}),
      loadListings().catch(function () {}),
      loadRatios().catch(function () {}),
      loadCalibration().catch(function () {}),
      loadSR1A().catch(function () {}),
      loadRevaluations().catch(function () {})
    ]).catch(function () {});
    return referenceWarmPromise;
  }

  function scheduleReferenceWarmup() {
    var run = function () { warmReferenceData(); };
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(run, { timeout: 1000 });
    } else {
      setTimeout(run, 0);
    }
  }

  function sectionLoading(title, detail) {
    return '<div class="pl-state" role="status" aria-live="polite">' +
      '<div class="pl-spin"></div>' +
      '<div class="pl-state-title">' + esc(title) + '</div>' +
      '<div class="pl-state-sub">' + esc(detail) + '</div></div>';
  }


  // ══════════════════════════════════════════════
  // FETCH WITH A TIMEOUT
  //
  // The state endpoints occasionally accept a connection and then never
  // answer. Plain fetch() has no timeout, so that hangs forever and the
  // spinner spins forever with no error to catch. Every network call on this
  // page goes through here so a dead server becomes a failure we can handle
  // instead of a page that just sits there.
  // ══════════════════════════════════════════════

  // ══════════════════════════════════════════════
  // REQUEST CACHE
  // These are free public servers. Anything we already asked for this session
  // gets reused instead of asked again. Coordinates are rounded so two lookups
  // on the same street share one result.
  // ══════════════════════════════════════════════
  var reqCache = {};
  function cached(key, ms, fn) {
    var hit = reqCache[key];
    if (hit && (Date.now() - hit.t) < (ms || 6e5)) return Promise.resolve(hit.v);
    return fn().then(function (v) { reqCache[key] = { t: Date.now(), v: v }; return v; });
  }
  function geoKey(lat, lon, extra) {
    return (extra || '') + '|' + lat.toFixed(3) + ',' + lon.toFixed(3);
  }

  function xfetch(url, ms, opts) {
    ms = ms || 12000;
    if (typeof AbortController === 'undefined') {
      // very old browser: race a timer instead
      return Promise.race([
        fetch(url, opts || {}),
        new Promise(function (_, rej) {
          setTimeout(function () { rej(new Error('timeout')); }, ms);
        })
      ]);
    }
    var ctl = new AbortController();
    var t = setTimeout(function () { ctl.abort(); }, ms);
    var o = opts ? JSON.parse(JSON.stringify(opts)) : {};
    o.signal = ctl.signal;
    return fetch(url, o).then(function (r) {
      clearTimeout(t); return r;
    }, function (e) {
      clearTimeout(t);
      throw new Error((e && e.name === 'AbortError') ? 'timeout' : (e && e.message) || 'network');
    });
  }


  // ══════════════════════════════════════════════
  // GLOBAL ERROR SURFACE
  // Anything that escapes a try/catch, including errors thrown inside event
  // handlers and third party scripts, gets shown instead of dying silently in
  // a console nobody has open.
  // ══════════════════════════════════════════════
  function showFatal(what, detail, where) {
    var b = document.getElementById('pl-fatal');
    if (!b) {
      b = document.createElement('div');
      b.id = 'pl-fatal';
      b.className = 'pl-fatal';
      document.body.appendChild(b);
    }
    b.innerHTML =
      '<div class="pl-fatal-in">' +
        '<b><i class="fas fa-triangle-exclamation"></i> ' + what + '</b>' +
        '<span>' + String(detail || '').slice(0, 300) + (where ? '  \u00b7  ' + where : '') + '</span>' +
        '<button onclick="this.parentNode.parentNode.remove()">Dismiss</button>' +
      '</div>';
    b.style.display = 'block';
  }
  window.addEventListener('error', function (e) {
    showFatal('A script error stopped the page', e.message,
      (e.filename || '').split('/').pop() + ':' + e.lineno);
  });
  window.addEventListener('unhandledrejection', function (e) {
    var r = e.reason;
    showFatal('A request failed and was not handled', (r && r.message) || String(r), '');
  });

  // A missing element must never take the page down. Anyone editing this
  // template will comment a section out sooner or later, and that should
  // degrade quietly rather than throw. Missing IDs are logged once each so
  // they are still findable.
  var _warned = {};
  var _stub = null;
  function stubEl() {
    if (_stub) return _stub;
    _stub = {
      innerHTML: '', textContent: '', value: '', disabled: false, checked: false,
      style: { setProperty: function () {}, removeProperty: function () {} },
      classList: { add: function () {}, remove: function () {}, toggle: function () {}, contains: function () { return false; } },
      appendChild: function () {}, removeChild: function () {}, remove: function () {},
      focus: function () {}, scrollIntoView: function () {}, click: function () {},
      addEventListener: function () {}, removeEventListener: function () {},
      setAttribute: function () {}, getAttribute: function () { return null; },
      querySelector: function () { return null; }, querySelectorAll: function () { return []; },
      getBoundingClientRect: function () { return { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 }; },
      parentNode: null, offsetParent: null, scrollTop: 0
    };
    return _stub;
  }
  function el(id) {
    var e = document.getElementById(id);
    if (e) return e;
    if (!_warned[id]) {
      _warned[id] = 1;
      console.warn('[watchdog] element #' + id + ' is not in the page. ' +
                   'Skipping whatever writes to it. If a section was commented out, that is why.');
    }
    return stubEl();
  }
  // Use this when you genuinely need to know whether the node is real.
  function elReal(id) { return document.getElementById(id); }
  function money(n) { return '$' + Math.round(n).toLocaleString(); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  }
  function toast(msg) {
    var t = el('pl-toast');
    t.textContent = msg; t.style.display = 'block';
    clearTimeout(window._plT);
    window._plT = setTimeout(function () { t.style.display = 'none'; }, 2600);
  }

  window.plFormatNum = function (e2) {
    var v = e2.value.replace(/\D/g, ''); if (v === '') v = '0';
    e2.value = parseInt(v, 10).toLocaleString();
  };
  window.plSyncSlider = function (id, val) {
    var e2 = el(id); if (e2) e2.value = parseInt(val, 10).toLocaleString();
  };
  window.plUpdateSliderStyle = function (s) {
    var mn = parseFloat(s.min) || 0, mx = parseFloat(s.max) || 100, v = parseFloat(s.value) || 0;
    s.style.setProperty('--value', (((v - mn) / (mx - mn)) * 100) + '%');
  };

  var PHRASES = [
    'any NJ home', 'your home', "your parents' home", "your client's home",
    'the house down the street', 'that listing you are eyeing', 'the one that got away'
  ];
  (function typewriter() {
    var node = el('pl-type');
    if (!node) return;
    var i = 0, ch = 0, deleting = false;
    function tick() {
      var word = PHRASES[i];
      node.classList.remove('done');
      if (!deleting) {
        ch++;
        node.textContent = word.slice(0, ch);
        if (ch === word.length) {
          deleting = true;
          node.classList.add('done');
          return setTimeout(tick, 2100);
        }
        return setTimeout(tick, 62);
      }
      ch--;
      node.textContent = word.slice(0, ch);
      if (ch === 0) { deleting = false; i = (i + 1) % PHRASES.length; return setTimeout(tick, 340); }
      return setTimeout(tick, 28);
    }
    node.textContent = '';
    setTimeout(tick, 550);
  })();

  function deedYear(d) {
    var t = deedDecimal(d);
    return t === null ? null : Math.floor(t);
  }

  // The US Census geocoder does not send CORS headers, so a browser can never
  // read its response. It is left defined for a future server side proxy but
  // is deliberately NOT in the fallback path: calling it only burns seconds on
  // a request that cannot succeed. NJOGIS answers in about 130ms.
  function geocode(address) {
    var p = new URLSearchParams({ SingleLine: address, outSR: '4326', maxLocations: '1', f: 'json' });
    return xfetch(NJ_GEOCODE + '?' + p, 8000)
      .then(function (r) { if (!r.ok) throw new Error('geo http ' + r.status); return r.json(); })
      .then(function (d) {
        if (d && d.error) throw new Error('geo service: ' + (d.error.message || 'error'));
        var c = d.candidates && d.candidates[0];
        if (!c) return null;                      // genuinely no match, not a failure
        return { lat: c.location.y, lon: c.location.x, matched: c.address, score: Number(c.score) || 0 };
      });
  }
  function geocodeCensus(address) {
    var p = new URLSearchParams({ address: address, benchmark: 'Public_AR_Current', format: 'json' });
    return xfetch(CENSUS + '?' + p, 9000).then(function (r) { return r.json(); })
      .then(function (d) {
        var m = d.result && d.result.addressMatches && d.result.addressMatches[0];
        return m ? { lat: m.coordinates.y, lon: m.coordinates.x, matched: m.matchedAddress } : null;
      })
      .catch(function () { return null; });
  }

  function parcelStreetKey(value) {
    var first = String(value || '').split(',')[0].trim();
    return first ? normAddr(first) : '';
  }

  function parcelZip(value) {
    var m = String(value || '').match(/\b(\d{5})(?:-\d{4})?\b/);
    return m ? m[1] : '';
  }

  var PARCEL_ADDR_NOISE = {
    N:1, S:1, E:1, W:1, NE:1, NW:1, SE:1, SW:1,
    AVE:1, ST:1, RD:1, DR:1, CT:1, LN:1, PL:1, BLVD:1, CIR:1, TER:1,
    PKWY:1, HWY:1, TRL:1, SQ:1, WAY:1, LOOP:1, RUN:1, PATH:1, ROW:1,
    XING:1, PT:1, HTS:1, EXT:1, TPKE:1, PIKE:1, BRG:1, MNR:1, CMNS:1,
    ROUTE:1, RT:1, US:1, NJ:1, STATE:1
  };

  function parcelAddressParts(value) {
    var key = parcelStreetKey(value);
    if (!key) return null;
    var tokens = key.split(/\s+/).filter(Boolean);
    if (!tokens.length) return null;
    var house = tokens.shift().replace(/^0+/, '') || '0';
    var streetTokens = tokens.slice();
    var coreTokens = streetTokens.filter(function (token) { return !PARCEL_ADDR_NOISE[token]; });
    // A real street can be mostly directional/suffix words (for example North
    // Avenue). If stripping the noise leaves nothing, keep the normalized
    // street instead of inventing an empty equivalence class.
    if (!coreTokens.length) coreTokens = streetTokens;
    return {
      key: key,
      house: house,
      core: coreTokens.join(' '),
      zip: parcelZip(value)
    };
  }

  function parcelTargets(typed, matched) {
    var raw = [matched, typed], out = [];
    raw.forEach(function (value) {
      var p = parcelAddressParts(value);
      if (!p) return;
      if (!out.some(function (x) { return x.key === p.key && x.zip === p.zip; })) out.push(p);
    });
    return out;
  }

  function parcelCandidateMatches(feature, targets) {
    var a = feature && feature.attributes;
    if (!a) return false;
    var candidate = parcelAddressParts(a.PROP_LOC);
    if (!candidate) return false;
    var candidateZip = String(a.ZIP5 || '').trim();
    return targets.some(function (target) {
      if (target.house !== candidate.house) return false;
      if (target.zip && candidateZip && target.zip !== candidateZip) return false;
      if (target.key === candidate.key) return true;
      return !!(target.core && candidate.core && target.core === candidate.core);
    });
  }

  function parcelAliasCandidateMatches(feature, targets) {
    var a = feature && feature.attributes;
    if (!a || String(a.PCLQCODE || '').trim()) return false;
    var candidate = parcelAddressParts(a.PROP_LOC);
    var candidateZip = String(a.ZIP5 || '').trim();
    if (!candidate || !candidate.house || !candidateZip) return false;
    return targets.some(function (target) {
      return !!(target.house && target.house === candidate.house && target.zip && target.zip === candidateZip);
    });
  }

  function sameParcel(a, b) {
    var ap = a && a.attributes && String(a.attributes.PAMS_PIN || '').trim();
    var bp = b && b.attributes && String(b.attributes.PAMS_PIN || '').trim();
    return !!(ap && bp && ap === bp);
  }

  function lookupPointDistanceMeters(a, b) {
    if (!a || !b || !Number.isFinite(a.lat) || !Number.isFinite(a.lon) ||
        !Number.isFinite(b.lat) || !Number.isFinite(b.lon)) return Infinity;
    var lat = (a.lat + b.lat) / 2;
    var dx = (a.lon - b.lon) * 111320 * Math.cos(lat * Math.PI / 180);
    var dy = (a.lat - b.lat) * 111320;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function confirmParcelAlias(exact, targets, geoMeta, selectedGeo) {
    if (!exact || !parcelAliasCandidateMatches(exact, targets)) return Promise.resolve(null);
    var a = exact.attributes || {};

    // A selected Google address gives us a second, independent coordinate.
    // Only accept a street-name alias when both geocoders land on the SAME tax
    // parcel. This safely resolves market-facing aliases while still rejecting
    // neighboring-house misses such as 185 -> 189.
    if (selectedGeo && lookupPointDistanceMeters(geoMeta, selectedGeo) <= 120) {
      return parcelAtRaw(selectedGeo.lat, selectedGeo.lon).then(function (second) {
        if (!sameParcel(exact, second)) return null;
        console.info('[watchdog] parcel street alias confirmed', {
          searched: targets[0] && targets[0].key,
          parcel: a.PROP_LOC || '', pin: a.PAMS_PIN || ''
        });
        return exact;
      });
    }

    // Manual searches do not have a second Google coordinate. In that case the
    // NJ geocoder must be essentially exact, and the parcel must share both the
    // house number and ZIP. Qualified/condo parcels are excluded above.
    if (geoMeta && Number(geoMeta.score) >= 99) {
      console.info('[watchdog] parcel street alias accepted from high-confidence NJ geocode', {
        searched: targets[0] && targets[0].key,
        parcel: a.PROP_LOC || '', pin: a.PAMS_PIN || ''
      });
      return Promise.resolve(exact);
    }
    return Promise.resolve(null);
  }

  function parcelCacheKey(lat, lon, typed, matched, selectedGeo) {
    var googlePart = selectedGeo && Number.isFinite(selectedGeo.lat) && Number.isFinite(selectedGeo.lon)
      ? '|g' + selectedGeo.lat.toFixed(6) + ',' + selectedGeo.lon.toFixed(6)
      : '|g-';
    return 'parcel|' + lat.toFixed(6) + ',' + lon.toFixed(6) + '|' +
      parcelStreetKey(matched || typed) + googlePart;
  }

  function parcelAt(lat, lon, typed, matched, geoMeta, selectedGeo) {
    return cached(parcelCacheKey(lat, lon, typed, matched, selectedGeo), 6e5, function () {
      var targets = parcelTargets(typed, matched);
      return parcelAtRaw(lat, lon).then(function (exact) {
        if (exact && (!targets.length || parcelCandidateMatches(exact, targets))) return exact;
        if (!targets.length) return null;

        // Exhaust the normal street-address paths before treating a different
        // assessor street name as an alias.
        return parcelNearbyByAddress(lat, lon, typed, matched).then(function (nearby) {
          if (nearby) return nearby;
          return parcelByAddressRecord(lat, lon, typed, matched);
        }).then(function (byAddress) {
          if (byAddress) return byAddress;
          return confirmParcelAlias(exact, targets, geoMeta || { lat: lat, lon: lon }, selectedGeo);
        });
      }).then(function (feature) {
        if (feature) return feature;
        var target = targets[0];
        console.warn('[watchdog] parcel resolution miss', {
          street: target ? target.key : parcelStreetKey(matched || typed),
          zip: target ? target.zip : '',
          lat: +lat.toFixed(5), lon: +lon.toFixed(5)
        });
        return null;
      });
    });
  }

  function parcelAtRaw(lat, lon) {
    var p = new URLSearchParams({
      geometry: JSON.stringify({ x: lon, y: lat, spatialReference: { wkid: 4326 } }),
      geometryType: 'esriGeometryPoint', inSR: '4326', outSR: '4326',
      spatialRel: 'esriSpatialRelIntersects',
      outFields: FIELDS, returnGeometry: 'true', resultRecordCount: '1', f: 'json'
    });
    return xfetch(NJ_PARCEL + '?' + p, 15000).then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.error) throw new Error(d.error.message || 'parcel');
        return (d.features && d.features[0]) ? d.features[0] : null;
      });
  }

  function parcelNearbyByAddress(lat, lon, typed, matched) {
    var targets = parcelTargets(typed, matched);
    if (!targets.length) return Promise.resolve(null);

    // 180m is still a neighborhood-scale bound, but it covers the common NJ
    // cases where the official address point is on a road centerline or a long
    // driveway rather than inside the tax polygon.
    var meters = 180;
    var dLat = meters / 111320;
    var dLon = meters / (111320 * Math.cos(lat * Math.PI / 180));
    var env = {
      xmin: lon - dLon, ymin: lat - dLat, xmax: lon + dLon, ymax: lat + dLat,
      spatialReference: { wkid: 4326 }
    };
    var p = new URLSearchParams({
      geometry: JSON.stringify(env), geometryType: 'esriGeometryEnvelope',
      inSR: '4326', outSR: '4326', spatialRel: 'esriSpatialRelIntersects',
      outFields: FIELDS, returnGeometry: 'true', resultRecordCount: '100', f: 'json'
    });

    return xfetch(NJ_PARCEL + '?' + p, 15000).then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.error) throw new Error(d.error.message || 'parcel nearby');
        var matches = (d.features || []).filter(function (feature) {
          return parcelCandidateMatches(feature, targets);
        });
        // Never guess among multiple tax parcels sharing one street address
        // (common with condos/qualifiers). A safe miss is better than opening
        // the wrong property.
        if (matches.length !== 1) return null;
        return matches[0];
      });
  }

  function parcelFeaturePoint(feature) {
    if (!feature) return null;
    if (feature.centroid && feature.centroid.x != null && feature.centroid.y != null) {
      return { lon: +feature.centroid.x, lat: +feature.centroid.y };
    }
    var rings = feature.geometry && feature.geometry.rings;
    if (!rings || !rings.length || !rings[0].length) return null;
    var sx = 0, sy = 0, n = 0;
    rings[0].forEach(function (pt) {
      if (!pt || pt[0] == null || pt[1] == null) return;
      sx += +pt[0]; sy += +pt[1]; n++;
    });
    return n ? { lon: sx / n, lat: sy / n } : null;
  }

  function parcelDistanceMeters(feature, lat, lon) {
    var pt = parcelFeaturePoint(feature);
    if (!pt) return null;
    var dx = (pt.lon - lon) * 111320 * Math.cos(lat * Math.PI / 180);
    var dy = (pt.lat - lat) * 111320;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function parcelByAddressRecord(lat, lon, typed, matched) {
    var targets = parcelTargets(typed, matched);
    if (!targets.length) return Promise.resolve(null);
    var target = targets.find(function (x) { return x.zip; }) || targets[0];
    if (!target.house) return Promise.resolve(null);

    // This query asks the parcel layer by its own address attributes rather than
    // relying on the geocoder point. House number + ZIP keeps the candidate set
    // bounded; the normalized street-core matcher and distance check below do
    // the actual identity verification.
    var safeHouse = target.house.replace(/'/g, "''");
    var where = "PROP_LOC LIKE '" + safeHouse + " %'";
    if (target.zip) where += " AND ZIP5 = '" + target.zip.replace(/'/g, "''") + "'";
    var p = new URLSearchParams({
      where: where,
      outFields: FIELDS,
      returnGeometry: 'true', returnCentroid: 'true', outSR: '4326',
      resultRecordCount: '100', f: 'json'
    });

    return xfetch(NJ_PARCEL + '?' + p, 15000).then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.error) throw new Error(d.error.message || 'parcel address');
        var matches = (d.features || []).filter(function (feature) {
          if (!parcelCandidateMatches(feature, targets)) return false;
          var dist = parcelDistanceMeters(feature, lat, lon);
          return dist == null || dist <= 600;
        });
        if (matches.length !== 1) return null;
        return matches[0];
      });
  }

  function ringsBBox(rings, pad) {
    var a = 180, b = 90, c = -180, e2 = -90;
    rings.forEach(function (r) { r.forEach(function (pt) {
      if (pt[0] < a) a = pt[0]; if (pt[0] > c) c = pt[0];
      if (pt[1] < b) b = pt[1]; if (pt[1] > e2) e2 = pt[1];
    }); });
    var pw = (c - a) * pad, ph = (e2 - b) * pad;
    return [a - pw, b - ph, c + pw, e2 + ph];
  }
  function bboxFor() {
    return (current && current.rings) ? ringsBBox(current.rings, 0.55)
      : [current.lon - 0.0009, current.lat - 0.0007, current.lon + 0.0009, current.lat + 0.0007];
  }
  function aerialUrl(bbox, w, h) {
    return ESRI_EXPORT + '?' + new URLSearchParams({
      bbox: bbox.join(','), bboxSR: '4326', imageSR: '3857',
      size: w + ',' + h, format: 'jpg', transparent: 'false', f: 'image'
    });
  }
  function streetUrl(lat, lon) {
    if (!GMAPS_KEY) return null;
    return 'https://maps.googleapis.com/maps/api/streetview?size=640x400&location=' +
           lat + ',' + lon + '&fov=75&pitch=8&source=outdoor&key=' + GMAPS_KEY;
  }

  // ══════════════════════════════════════════════
  // LOCATE ME
  // ══════════════════════════════════════════════

  // Look up whatever parcel sits under a coordinate. Used by the locate button
  // when reverse geocoding is unavailable, and safe to call directly.
  function lookupAtPoint(lat, lon, label) {
    var btn = el('pl-btn');
    var lookupId = ++lookupSeq;
    activeLookupKey = '@' + lat.toFixed(5) + ',' + lon.toFixed(5);
    activeLookupPending = true;
    if (btn) btn.disabled = true;
    el('pl-inline').innerHTML =
      '<div class="pl-state"><div class="pl-spin"></div>' +
      '<div class="pl-state-title">Locating your property</div>' +
      '<div class="pl-state-sub">Opening the parcel first. Property intelligence will fill in behind it.</div></div>';

    warmReferenceData();
    parcelAt(lat, lon)
      .then(function (f) {
        if (lookupId !== lookupSeq) throw new Error('stale');
        if (!f) throw new Error('noparcel');
        el('pl-inline').innerHTML = readyState();
        render(f, { lat: lat, lon: lon, matched: label }, label, lookupId);
      })
      .catch(function (e) {
        if ((e && e.message) === 'stale') return;
        console.error('[watchdog] point lookup failed:', e);
        el('pl-inline').innerHTML =
          '<div class="pl-state"><i class="fas fa-circle-question"></i>' +
          '<div class="pl-state-title">No parcel found there</div>' +
          '<div class="pl-state-sub">There is no New Jersey parcel record at that spot. ' +
          'If you are outside NJ that is expected. Type an address instead.</div></div>';
      })
      .then(function () {
        if (lookupId !== lookupSeq) return;
        activeLookupPending = false;
        activeLookupKey = '';
        if (btn) btn.disabled = false;
      });
  }

  window.plLocate = function () {
    if (!navigator.geolocation) { toast('Your browser does not support location'); return; }
    var btn = el('pl-geo');
    btn.classList.add('busy');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    navigator.geolocation.getCurrentPosition(function (pos) {
      var lat = pos.coords.latitude, lon = pos.coords.longitude;
      // NJOGIS returns "Unable to complete operation" for reverseGeocode, so
      // there is no address to fetch. We never needed one: the parcel lookup
      // works directly from coordinates.
      resetGeoBtn();
      lookupAtPoint(lat, lon, 'Your current location');
    }, function (err) {
      resetGeoBtn();
      toast(err.code === 1 ? 'Location permission denied' : 'Could not get your location');
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
  };
  function resetGeoBtn() {
    var b = el('pl-geo');
    b.classList.remove('busy');
    b.innerHTML = '<i class="fas fa-paper-plane"></i>';
  }

  function selectedGoogleGeo(input, address) {
    if (!input || input.dataset.googleAddress !== '1') return null;
    if (lookupKey(input.value) !== lookupKey(address)) return null;
    var lat = Number(input.dataset.googleLat), lon = Number(input.dataset.googleLon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return { lat: lat, lon: lon };
  }

  // ══════════════════════════════════════════════
  // MAIN LOOKUP
  // ══════════════════════════════════════════════
  window.plLookup = function () {
    var addr = (el('pl-addr').value || '').trim();
    if (!addr) { el('pl-addr').focus(); return; }
    var googleGeo = selectedGoogleGeo(elReal('pl-addr'), addr);

    var key = lookupKey(addr);
    if (activeLookupPending && activeLookupKey === key) return;

    var lookupId = ++lookupSeq;
    activeLookupKey = key;
    activeLookupPending = true;

    var btn = el('pl-btn');
    btn.disabled = true;
    if (map) { try { map.remove(); } catch (e) {} map = null; }
    var hasInline = !!elReal('pl-inline');
    if (!hasInline) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

    el('pl-inline').innerHTML =
      '<div class="pl-state"><div class="pl-spin"></div>' +
      '<div class="pl-state-title">Locating property</div>' +
      '<div class="pl-state-sub">Matching ' + esc(addr) + ' to the New Jersey parcel map.</div></div>';
    if (typeof gtag === 'function') gtag('event', 'property_lookup');

    // Supporting datasets warm in parallel. They never block property identity.
    warmReferenceData();

    geocode(addr)
      .then(function (g) {
        if (lookupId !== lookupSeq) throw new Error('stale');
        if (!g) throw new Error('nogeo');
        el('pl-inline').innerHTML =
          '<div class="pl-state"><div class="pl-spin"></div>' +
          '<div class="pl-state-title">Address matched</div>' +
          '<div class="pl-state-sub">Opening the parcel record now. Intelligence sections will keep updating after it opens.</div></div>';
        return parcelAt(g.lat, g.lon, addr, g.matched, g, googleGeo).then(function (f) { return { g: g, f: f }; });
      })
      .then(function (res) {
        if (lookupId !== lookupSeq) throw new Error('stale');
        if (!res.f) throw new Error('noparcel');
        el('pl-inline').innerHTML = readyState();
        try {
          render(res.f, res.g, addr, lookupId);
        } catch (err) {
          console.error('[watchdog] render failed:', err);
          throw new Error('render:' + (err && err.message ? err.message : err));
        }
      })
      .catch(function (e) {
        var m = (e && e.message) || '';
        if (m === 'stale') return;
        console.error('[watchdog] lookup failed:', e);

        var title, msg, extra = '';
        if (m === 'nogeo') {
          title = 'We could not place that address';
          msg = 'Try adding the town and zip code, or drop the unit number. New construction and some condo units are not in the state file yet.';
        } else if (m === 'noparcel') {
          title = 'No parcel record matched';
          msg = 'We found the address, but could not verify one matching New Jersey tax parcel nearby. Rather than open the wrong property, Watchdog stopped here. Try the address without a unit number or verify the street spelling.';
        } else if (m.indexOf('render:') === 0) {
          title = 'Something broke on our end';
          msg = 'We found the property but could not draw the report. That is our fault, not your address.';
          extra = '<div class="pl-src" style="margin-top:14px;font-size:12px;">Technical detail: ' + esc(m.slice(7)) + '</div>';
        } else if (m === 'timeout') {
          title = 'The state records service timed out';
          msg = 'New Jersey’s property server accepted the request and never answered. That happens now and then and usually clears within a few minutes. Try again shortly.';
        } else {
          title = 'That lookup did not go through';
          msg = 'The state property service did not answer. It goes down occasionally. Give it a minute and try again.';
          extra = '<div class="pl-src" style="margin-top:14px;font-size:12px;">Technical detail: ' + esc(m || 'unknown') + '</div>';
        }

        el('pl-inline').innerHTML =
          '<div class="pl-state"><i class="fas fa-circle-question"></i>' +
          '<div class="pl-state-title">' + title + '</div>' +
          '<div class="pl-state-sub">' + msg + '</div></div>' +
          '<div class="pl-src" style="margin-top:20px;">If you know your block and lot, your municipal tax assessor can pull the exact record. <a href="/index.html#contact">Send me the address</a> and I will look it up by hand.</div>' + extra;
      })
      .then(function () {
        if (lookupId !== lookupSeq) return;
        activeLookupPending = false;
        activeLookupKey = '';
        btn.disabled = false;
        if (!hasInline) btn.innerHTML = '<i class="fas fa-magnifying-glass"></i>';
      });
  };

  function readyState() {
    return '<div class="pl-state"><i class="fas fa-house-chimney"></i>' +
      '<div class="pl-state-title">Search another address</div>' +
      '<div class="pl-state-sub">Assessment, tax bill, block and lot, aerial view with real lot lines, tax history, and a net proceeds estimate.</div></div>';
  }

  function loadRates() {
    if (rateTable !== null) return Promise.resolve();
    return xfetch('/tax-rates.json', 6000).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { rateTable = (j && j.rates) ? j.rates : {}; })
      .catch(function () { rateTable = {}; });
  }

  // ══════════════════════════════════════════════
  // ADDRESS NORMALIZER
  // The MLS writes "11 Dalton Pl". The assessor writes "11 DALTON PLACE".
  // Neither matches the other as raw text, so both sides collapse to the same
  // canonical form before comparing. This must stay in step with the generator
  // that builds listings.json.
  // ══════════════════════════════════════════════
  var ADDR_SUF = {
    AVENUE:'AVE', AVE:'AVE', AV:'AVE',
    STREET:'ST', ST:'ST', STR:'ST',
    ROAD:'RD', RD:'RD',
    DRIVE:'DR', DR:'DR', DRV:'DR',
    COURT:'CT', CT:'CT',
    LANE:'LN', LN:'LN',
    PLACE:'PL', PL:'PL', PLC:'PL',
    BOULEVARD:'BLVD', BLVD:'BLVD', BLV:'BLVD',
    CIRCLE:'CIR', CIR:'CIR',
    TERRACE:'TER', TER:'TER', TERR:'TER',
    PARKWAY:'PKWY', PKWY:'PKWY', PKY:'PKWY',
    HIGHWAY:'HWY', HWY:'HWY',
    TRAIL:'TRL', TRL:'TRL',
    SQUARE:'SQ', SQ:'SQ',
    WAY:'WAY', LOOP:'LOOP', RUN:'RUN', PATH:'PATH', ROW:'ROW',
    CROSSING:'XING', XING:'XING', POINT:'PT', PT:'PT',
    HEIGHTS:'HTS', HTS:'HTS', EXTENSION:'EXT', EXT:'EXT',
    TURNPIKE:'TPKE', TPKE:'TPKE', PIKE:'PIKE',
    BRIDGE:'BRG', MANOR:'MNR', MNR:'MNR', COMMONS:'CMNS'
  };
  var ADDR_DIR = { NORTH:'N', SOUTH:'S', EAST:'E', WEST:'W',
                   NORTHEAST:'NE', NORTHWEST:'NW', SOUTHEAST:'SE', SOUTHWEST:'SW' };

  function normAddr(a) {
    if (!a) return '';
    var s = String(a).toUpperCase().trim();
    s = s.replace(/\s+(APT|UNIT|STE|SUITE|#)\s*[\w-]+$/, '');
    s = s.replace(/[^A-Z0-9 ]/g, ' ');
    var parts = s.split(/\s+/).filter(Boolean), out = [];
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (ADDR_DIR[p] && i > 0) out.push(ADDR_DIR[p]);
      else if (ADDR_SUF[p]) out.push(ADDR_SUF[p]);
      else out.push(p);
    }
    return out.join(' ');
  }

  // ══════════════════════════════════════════════
  // LISTING STATUS
  // No free public API reports whether a NJ home is for sale. MLS status
  // lives behind Bright MLS / IDX. So status resolves in this order:
  //   1. listings.json override you maintain by hand
  //   2. recorded deed inside the last 12 months -> Recently sold
  //   3. otherwise -> Off market, which is what public record supports
  // When you get an IDX feed, replace this one function.
  // ══════════════════════════════════════════════
  var listingTable = null;

  // Optional. If /listings.json is absent this simply does nothing, which is
  // the normal state. Only add entries for listings you will actually keep
  // current, because a wrong status is worse than no status.
  function loadListings() {
    if (listingTable !== null) return Promise.resolve();
    return xfetch('/listings.json', 6000)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { listingTable = (j && j.listings) ? j.listings : {}; })
      .catch(function () { listingTable = {}; });
  }

  var STATUS_CLASS = {
    'For sale': 'live', 'For sale by owner': 'live', 'For rent': 'live',
    'Coming soon': 'soon', 'Under contract': 'pending', 'Pending': 'pending',
    'Just sold': 'sold', 'Recently sold': 'sold'
  };

  function resolveStatus(p, dy) {
    // Listing status is NOT read from any MLS feed. The only automatic signal
    // is the recorded deed date in the state assessment file, which is public,
    // self updating, and cannot go stale in a way that misleads anyone.
    // listings.json is optional and only holds listings you enter by hand.
    var county = (p.COUNTY || '').toUpperCase().trim();
    var keys = [ p.PAMS_PIN, normAddr(p.PROP_LOC) + '|' + county ];
    for (var i = 0; i < keys.length; i++) {
      if (keys[i] && listingTable && listingTable[keys[i]]) {
        var o = listingTable[keys[i]];
        return {
          label: o.status || 'For sale', cls: STATUS_CLASS[o.status] || 'live',
          source: 'listed', detail: o
        };
      }
    }
    if (dy && (new Date().getFullYear() - dy) <= 1) {
      return { label: 'Recently sold', cls: 'sold', source: 'deed',
               detail: { note: 'Deed recorded ' + dy + ' per the state assessment file' } };
    }
    // No default tag. Assessment data cannot tell us whether a home is
    // listed, and guessing "off market" was wrong often enough to be worse
    // than saying nothing. Tag returns only when we actually know.
    return null;
  }

  // ══════════════════════════════════════════════
  // PROPERTY LEDGER  (optional Supabase write)
  // Fill these in after running supabase-property-ledger.sql.
  // Blank = the page skips it entirely and nothing breaks.
  // Records the PROPERTY only. Never the visitor.
  // ══════════════════════════════════════════════
  var LEDGER_URL = 'https://uvkvaxljhhngydvlrzom.supabase.co';
  // PASTE THE PUBLISHABLE KEY FOR uvkvaxljhhngydvlrzom HERE.
  // Project Settings -> API Keys -> publishable (starts sb_publishable_).
  // The old key below belongs to a DIFFERENT project and will be rejected.
  var LEDGER_KEY = 'sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa';

  function recordLookup(p, geo, rate, dy) {
    try {
      var payload = {
        pams_pin: p.PAMS_PIN || '', address: p.PROP_LOC || '', town: p.MUN_NAME || '',
        county: p.COUNTY || '', zip: p.ZIP5 || '', block: p.PCLBLOCK || '',
        lot: p.PCLLOT || '', qualifier: p.PCLQCODE || '',
        prop_class: (p.PROP_CLASS || '').trim(), year_built: +p.YR_CONSTR || null,
        acres: +p.CALC_ACRE || null, dwelling_units: +p.DWELL || null,
        building_desc: p.BLDG_DESC || '', land_value: +p.LAND_VAL || null,
        improvement_value: +p.IMPRVT_VAL || null, assessed_value: +p.NET_VALUE || null,
        last_year_tax: +p.LAST_YR_TX || null, effective_rate: rate ? +rate.toFixed(3) : null,
        last_sale_price: +p.SALE_PRICE || null, last_sale_year: dy || null,
        lat: geo.lat, lon: geo.lon
      };

      // always keep a local copy so the feature works with or without Supabase
      var local = JSON.parse(localStorage.getItem('pl_seen') || '{}');
      var k = payload.pams_pin || payload.address;
      local[k] = { a: payload.address, t: payload.town, v: payload.assessed_value,
                   x: payload.last_year_tax, n: ((local[k] && local[k].n) || 0) + 1, d: Date.now() };
      localStorage.setItem('pl_seen', JSON.stringify(local));

      // Production record_lookup is authenticated-only by design. Anonymous
      // property searches keep the local ledger and do not generate a doomed 401.
      if (!plUser || !sb || typeof sb.rpc !== 'function') return;
      sb.rpc('record_lookup', { p: payload }).then(function () {}, function () {});
    } catch (e) { /* never let logging break a lookup */ }
  }

  function timesSeen(pin) {
    try {
      var local = JSON.parse(localStorage.getItem('pl_seen') || '{}');
      return (local[pin] && local[pin].n) || 0;
    } catch (e) { return 0; }
  }

  // ══════════════════════════════════════════════
  // WATCHDOG ESTIMATE
  //
  // How this works, and why it is not made up.
  //
  // New Jersey equalizes assessments using a "director's ratio": the median
  // of assessed value divided by sale price across recent arm's length sales
  // in a municipality. Divide an assessment by that ratio and you get the
  // market value the town's own numbers imply.
  //
  // The statewide parcel layer carries both NET_VALUE and SALE_PRICE on every
  // parcel. So instead of hardcoding a ratio table, we compute the town's
  // ratio live from its own recorded sales, then trim outliers with an
  // interquartile filter so family transfers, $1 deeds, and foreclosures do
  // not drag it. Simulated against 40 percent junk sales it still lands
  // within 2 percent of the true ratio.
  //
  // It is an estimate. It is disclosed as an estimate everywhere it appears.
  // ══════════════════════════════════════════════

  var RATIO_CACHE_DAYS = 7;
  var ratioCache = {};

  function median(a) {
    if (!a.length) return null;
    a = a.slice().sort(function (x, y) { return x - y; });
    var m = a.length >> 1;
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }
  function quantile(a, p) {
    a = a.slice().sort(function (x, y) { return x - y; });
    var i = (a.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
    return lo === hi ? a[lo] : a[lo] + (a[hi] - a[lo]) * (i - lo);
  }

  function cachedRatio(key) {
    if (ratioCache[key]) return ratioCache[key];
    try {
      var raw = JSON.parse(localStorage.getItem('pl_ratio_' + key) || 'null');
      if (raw && (Date.now() - raw.t) < RATIO_CACHE_DAYS * 864e5) { ratioCache[key] = raw.v; return raw.v; }
    } catch (e) {}
    return null;
  }
  function storeRatio(key, v) {
    ratioCache[key] = v;
    try { localStorage.setItem('pl_ratio_' + key, JSON.stringify({ t: Date.now(), v: v })); } catch (e) {}
  }

  // Pull this town's residential sales and derive the ratio.
  function townRatio(town, county) {
    var key = (town + '|' + county).toUpperCase().replace(/[^A-Z0-9|]/g, '');
    var hit = cachedRatio(key);
    if (hit) return Promise.resolve(hit);

    var where = "MUN_NAME = '" + String(town).replace(/'/g, "''") + "'" +
                " AND COUNTY = '" + String(county).replace(/'/g, "''") + "'" +
                " AND PROP_CLASS = '2' AND SALE_PRICE > 50000 AND NET_VALUE > 10000";
    var p = new URLSearchParams({
      where: where,
      outFields: 'NET_VALUE,SALE_PRICE,DEED_DATE',
      returnGeometry: 'false', resultRecordCount: '2000', f: 'json'
    });

    return xfetch(NJ_PARCEL + '?' + p, 15000)
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d.features || !d.features.length) return null;
        var thisYear = new Date().getFullYear();

        // Assessments stay flat while prices move, so the ratio drifts down
        // over time. A wide window averages in stale ratios and lowballs the
        // estimate. Start tight, widen only if the sample is too thin.
        function gather(years) {
          var out = [], newest = 0;
          d.features.forEach(function (f) {
            var a = f.attributes, yr = deedYear(a.DEED_DATE);
            if (!yr || yr < thisYear - years) return;
            var v = (+a.NET_VALUE) / (+a.SALE_PRICE);
            if (!isFinite(v) || v < 0.15 || v > 2.5) return;    // obvious junk
            out.push(v);
            if (yr > newest) newest = yr;
          });
          return { r: out, newest: newest, span: years };
        }

        var g = gather(3);
        if (g.r.length < 25) g = gather(5);
        if (g.r.length < 25) g = gather(8);
        var ratios = g.r, newest = g.newest;

        if (ratios.length < 12) return null;                    // not enough to trust

        var q1 = quantile(ratios, 0.25), q3 = quantile(ratios, 0.75), iqr = q3 - q1;
        var trimmed = ratios.filter(function (v) { return v >= q1 - 1.5 * iqr && v <= q3 + 1.5 * iqr; });
        if (trimmed.length < 10) return null;

        // town-wide drift, used when a neighborhood is too thin to measure
        // its own. median multiplier per year across the whole municipality.
        var mByYear = {};
        d.features.forEach(function (f) {
          var a = f.attributes, yr = deedYear(a.DEED_DATE);
          if (!yr || yr < thisYear - 8) return;
          var m = (+a.SALE_PRICE) / (+a.NET_VALUE);
          if (isFinite(m) && m > 0) (mByYear[yr] = mByYear[yr] || []).push(m);
        });
        var yy = Object.keys(mByYear).map(Number).sort(function (a, b) { return a - b; });
        var dr = 0, np = 0;
        for (var q = 1; q < yy.length; q++) {
          var A = median(mByYear[yy[q - 1]]), B = median(mByYear[yy[q]]), gp = yy[q] - yy[q - 1];
          if (A > 0 && B > 0 && gp > 0 && mByYear[yy[q]].length >= 4 && mByYear[yy[q - 1]].length >= 4) {
            dr += (Math.pow(B / A, 1 / gp) - 1); np++;
          }
        }

        var out = {
          ratio: median(trimmed),
          lo: quantile(trimmed, 0.30),
          hi: quantile(trimmed, 0.70),
          n: trimmed.length,
          through: newest,
          span: g.span,
          drift: np ? Math.max(-0.15, Math.min(0.20, dr / np)) : null
        };
        storeRatio(key, out);
        return out;
      })
      .catch(function () { return null; });
  }

  // assessed / ratio = implied market value. Wider ratio spread = wider range.
  function watchdogEstimate(assessed, r) {
    if (!assessed || !r || !r.ratio) return null;
    var mid = assessed / r.ratio;
    var hi = assessed / Math.max(r.lo, 0.05);   // low ratio  -> high value
    var lo = assessed / Math.max(r.hi, 0.05);   // high ratio -> low value
    return {
      mid: mid, lo: Math.min(lo, mid), hi: Math.max(hi, mid),
      ratio: r.ratio, n: r.n, through: r.through, span: r.span
    };
  }

  // ══════════════════════════════════════════════
  // LIVE RATIO
  //
  // Measure the assessed-to-market relationship from the SAME file we read the
  // assessment out of. That is the only way to cancel two separate lags:
  //
  //   Timing.    The published tax year 2026 ratio is built from sales sampled
  //              around mid 2024 to mid 2025. It is priced to early 2025.
  //   Vintage.   NJGIN ships the parcel layer with 2024 tax year MOD-IV, while
  //              the published ratio applies to the 2025 assessments. Dividing
  //              our 2024 assessment by a 2026 ratio mixes denominators.
  //
  // Small boroughs do not have enough sales to measure alone, so this widens to
  // the county rather than giving up. A county ratio is less precise than a town
  // ratio but it is measured against the right assessment vintage, which beats a
  // published ratio that is not.
  // ══════════════════════════════════════════════

  // No assumed appreciation rate. If verified sales cannot measure a trend,
  // Watchdog applies no time-growth adjustment and labels the evidence gap.
  var liveRatioCache = {};

  // DEED_DATE is not one format. Across counties it arrives as MMDDYY,
  // YYYYMMDD, and sometimes an epoch millisecond number. My first parser only
  // accepted 6 digit MMDDYY and threw away 87% of the rows in Woodbury Heights,
  // which is what starved the sample and let stale sales dominate.
  var THIS_YEAR = new Date().getFullYear();

  function deedDecimal(d) {
    if (d === null || d === undefined || d === '') return null;

    // epoch milliseconds, which some services return for date fields
    if (typeof d === 'number' && d > 1e11) {
      var dt = new Date(d);
      var y0 = dt.getUTCFullYear();
      if (y0 < 1900 || y0 > THIS_YEAR) return null;
      return y0 + (dt.getUTCMonth() + 0.5) / 12;
    }

    var s = String(d).trim();

    // ISO-ish: 2024-03-15 or 2024/03/15
    var iso = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
    if (iso) {
      var yi = +iso[1], mi = +iso[2];
      if (mi >= 1 && mi <= 12 && yi >= 1900 && yi <= THIS_YEAR) return yi + (mi - 0.5) / 12;
    }
    // US-ish: 3/15/2024
    var us = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
    if (us) {
      var mu = +us[1], yu = +us[3];
      if (mu >= 1 && mu <= 12 && yu >= 1900 && yu <= THIS_YEAR) return yu + (mu - 0.5) / 12;
    }

    var n = s.replace(/\D/g, '');

    if (n.length === 8) {                       // YYYYMMDD
      var y8 = +n.slice(0, 4), m8 = +n.slice(4, 6);
      if (m8 >= 1 && m8 <= 12 && y8 >= 1900 && y8 <= THIS_YEAR) return y8 + (m8 - 0.5) / 12;
      var m8b = +n.slice(0, 2), y8b = +n.slice(4, 8);   // MMDDYYYY
      if (m8b >= 1 && m8b <= 12 && y8b >= 1900 && y8b <= THIS_YEAR) return y8b + (m8b - 0.5) / 12;
      return null;
    }
    // Six digit dates from MOD-IV are YYMMDD, confirmed against a live value of
    // "231201" which is only valid read that way (month 23 does not exist).
    // This matters: most dates parse under BOTH readings, so getting the order
    // wrong silently returns a date years off. "060115" is January 2006 here,
    // not June 2015.
    if (n.length === 6) {
      var yy = +n.slice(0, 2), mm = +n.slice(2, 4);
      if (mm >= 1 && mm <= 12) {
        var yr = yy > 40 ? 1900 + yy : 2000 + yy;
        if (yr >= 1900 && yr <= THIS_YEAR) return yr + (mm - 0.5) / 12;
      }
      // Fall back to MMDDYY only when YYMMDD cannot be true, so mixed county
      // formats still resolve instead of being discarded.
      var m2 = +n.slice(0, 2), y2 = +n.slice(4, 6);
      if (m2 >= 1 && m2 <= 12) {
        var yr2 = y2 > 40 ? 1900 + y2 : 2000 + y2;
        if (yr2 >= 1900 && yr2 <= THIS_YEAR) return yr2 + (m2 - 0.5) / 12;
      }
      return null;
    }
    if (n.length === 4) {                       // bare year
      var y4 = +n;
      if (y4 >= 1900 && y4 <= THIS_YEAR) return y4 + 0.5;
    }
    return null;
  }

  function fetchRatioRows(where) {
    var p = new URLSearchParams({
      where: where, outFields: 'NET_VALUE,SALE_PRICE,DEED_DATE',
      returnGeometry: 'false', resultRecordCount: '2000', f: 'json'
    });
    return xfetch(NJ_PARCEL + '?' + p, 15000)
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d.features) return { rows: [], raw: 0, dated: 0 };
        var rows = [], dated = 0;
        d.features.forEach(function (f) {
          var a = f.attributes, t = deedDecimal(a.DEED_DATE);
          var v = (+a.NET_VALUE) / (+a.SALE_PRICE);
          if (!isFinite(v) || v < 0.10 || v > 2.0) return;
          if (t === null) return;
          dated++;
          rows.push({ r: v, t: t });
        });
        return { rows: rows, raw: d.features.length, dated: dated };
      })
      .catch(function () { return { rows: [], raw: 0, dated: 0 }; });
  }

  // Given dated rows, measure appreciation then carry every sale forward to
  // today before taking the median. Without that step the median is measured
  // against stale prices and reads high, which makes values read low.
  function ratioFromRows(rows, nowDec, minN) {
    function windowed(months) {
      var cut = nowDec - months / 12;
      return rows.filter(function (x) { return x.t >= cut; });
    }
    var span = 24, win = windowed(24);
    if (win.length < minN) { span = 36; win = windowed(36); }
    if (win.length < minN) { span = 60; win = windowed(60); }
    if (win.length < minN) { span = 96; win = windowed(96); }
    if (win.length < minN) return null;

    // Appreciation, measured only where there is enough evidence to bother.
    // A negative rate run backwards through the correction inflates the ratio
    // and deflates the value, so a noisy negative is worse than no measurement
    // at all. Require real year buckets, and refuse to believe a decline
    // unless the sample is large enough to mean it.
    var byYr = {};
    win.forEach(function (x) {
      var y = Math.floor(x.t);
      (byYr[y] = byYr[y] || []).push(1 / x.r);          // price per dollar assessed
    });
    var yrs = Object.keys(byYr).map(Number).sort(function (a, b) { return a - b; });
    var d = 0, np = 0;
    for (var i = 1; i < yrs.length; i++) {
      var A = median(byYr[yrs[i - 1]]), B = median(byYr[yrs[i]]), gap = yrs[i] - yrs[i - 1];
      if (A > 0 && B > 0 && gap > 0 && byYr[yrs[i]].length >= 6 && byYr[yrs[i - 1]].length >= 6) {
        d += Math.pow(B / A, 1 / gap) - 1; np++;
      }
    }
    var appr, apprMeasured = false;
    if (np >= 2) { appr = d / np; apprMeasured = true; }
    else { appr = 0; }
    if (apprMeasured && appr < 0 && win.length < 120) {
      // a falling market is possible, but not on a thin sample. Do not let
      // noise reverse the correction.
      appr = 0; apprMeasured = false;
    }
    appr = Math.max(-0.06, Math.min(0.20, appr));

    var vals = win.map(function (x) {
      return x.r / Math.pow(1 + appr, Math.max(0, nowDec - x.t));
    });
    var q1 = quantile(vals, 0.25), q3 = quantile(vals, 0.75), iqr = q3 - q1;
    var trim = vals.filter(function (v) { return v >= q1 - 1.5 * iqr && v <= q3 + 1.5 * iqr; });
    if (trim.length < Math.max(10, minN - 5)) return null;

    var m = median(trim);
    if (!m || m < 0.12 || m > 1.60) return null;

    return {
      ratio: m, n: trim.length, months: span,
      appreciation: appr, apprMeasured: apprMeasured,
      medSaleAge: median(win.map(function (x) { return Math.max(0, nowDec - x.t); })),
      lo: quantile(trim, 0.35), hi: quantile(trim, 0.65)
    };
  }

  function liveRatio(town, county, official) {
    var key = (town + '|' + county).toUpperCase().replace(/[^A-Z0-9|]/g, '');
    if (liveRatioCache[key]) return Promise.resolve(liveRatioCache[key]);
    try {
      var c = JSON.parse(localStorage.getItem('pl_live4_' + key) || 'null');
      if (c && (Date.now() - c.t) < 7 * 864e5) { liveRatioCache[key] = c.v; return Promise.resolve(c.v); }
    } catch (e) {}

    var now = new Date();
    var nowDec = now.getFullYear() + now.getMonth() / 12;
    var base = " AND PROP_CLASS = '2' AND SALE_PRICE > 50000 AND NET_VALUE > 10000";
    var townWhere = "MUN_NAME = '" + String(town).replace(/'/g, "''") + "'" +
                    (county ? " AND COUNTY = '" + String(county).replace(/'/g, "''") + "'" : '') + base;
    var countyWhere = county ? "COUNTY = '" + String(county).replace(/'/g, "''") + "'" + base : null;

    function finish(out, scope, stats) {
      if (!out) return null;
      out.source = 'live';
      out.scope = scope;
      out.stats = stats;
      // Direction check. Our assessments are 2024 vintage and our sale prices
      // are recent, so a correctly measured live ratio lands BELOW the
      // published one in a rising market. If it comes out above, old deeds are
      // still dominating the sample and the measurement is not trustworthy.
      // Woodbury Heights returned 83.48% against an official 62.28% for exactly
      // that reason, and it produced a value roughly 25% too low.
      if (official) {
        if (out.ratio > official * 1.05) { out.rejected = 'above official, stale sales'; return null; }
        if (out.ratio < official * 0.35) { out.rejected = 'far below official'; return null; }
      }
      liveRatioCache[key] = out;
      try { localStorage.setItem('pl_live4_' + key, JSON.stringify({ t: Date.now(), v: out })); } catch (e) {}
      return out;
    }

    return fetchRatioRows(townWhere).then(function (t) {
      var out = ratioFromRows(t.rows, nowDec, 15);
      if (out) return finish(out, 'town', { raw: t.raw, dated: t.dated });
      if (!countyWhere) return null;
      // town too thin, widen to the county. Still the right assessment vintage.
      return fetchRatioRows(countyWhere).then(function (c2) {
        var o2 = ratioFromRows(c2.rows, nowDec, 30);
        return finish(o2, 'county', { raw: c2.raw, dated: c2.dated, townRaw: t.raw, townDated: t.dated });
      });
    }).catch(function () { return null; });
  }

  // ══════════════════════════════════════════════
  // SR1A  ·  the state's own verified sales
  //
  // This replaces the live ratio machinery entirely. That code existed to work
  // out, from raw parcel rows, which recorded deeds were real arm's length
  // sales. The Division of Taxation already makes that judgment on every deed
  // and publishes it in the SR1A file. We were reconstructing badly what the
  // state hands over cleanly.
  //
  // What went away with it: the town wide ratio query, the county fallback
  // query, the appreciation back-correction, the direction check against the
  // published ratio, and the per town calibration fudge. All of it was
  // compensating for reading unverified deeds.
  //
  // Lookup is by the 4 digit district code, which is the first four characters
  // of PAMS_PIN. No town name matching, so no ambiguity between the two
  // Washington Twps or the two Greenwich Twps.
  // ══════════════════════════════════════════════
  var sr1aTable = null;
  var sr1aSales = {};          // county file cache, loaded only when needed

  function loadSR1A() {
    if (sr1aTable !== null) return Promise.resolve();
    return xfetch('/property/sr1a-ratios.json', 9000)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { sr1aTable = (j && j.districts) ? j.districts : {}; })
      .catch(function () { sr1aTable = {}; });
  }

  function districtCode(p) {
    var pin = String(p.PAMS_PIN || '');
    var m = pin.match(/^(\d{4})/);
    return m ? m[1] : null;
  }

  function sr1aRatio(p) {
    if (!sr1aTable) return null;
    var d = districtCode(p);
    if (!d) return null;
    var row = sr1aTable[d];
    if (!row || !row.ratio || row.n < 10) return null;
    return {
      ratio: row.ratio, n: row.n, source: 'sr1a', district: d,
      lo: row.p25 || null, hi: row.p75 || null,
      drift: row.drift, ppsf: row.ppsf, medPrice: row.medPrice,
      years: row.years, county: row.county
    };
  }

  // ── verified comparable sales, with square footage ──
  function loadCountySales(county) {
    var key = String(county || '').toLowerCase().replace(/\s+/g, '-');
    if (!key) return Promise.resolve(null);
    if (sr1aSales[key]) return Promise.resolve(sr1aSales[key]);
    return xfetch('/property/sales-' + key + '.json', 20000)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        sr1aSales[key] = (j && j.sales) ? j.sales : [];
        return sr1aSales[key];
      })
      .catch(function () { sr1aSales[key] = []; return []; });
  }

  // Rank verified sales in the same town by how comparable they actually are.
  // With living space in hand this can finally weight on size, which is what
  // an appraiser leads with and what we never had before.
  function verifiedComps(p, subject) {
    var d = districtCode(p);
    if (!d) return Promise.resolve([]);
    return loadCountySales(p.COUNTY).then(function (all) {
      if (!all || !all.length) return [];
      var thisYear = new Date().getFullYear();
      var scored = all.filter(function (s) {
        return s.d === d && String(s.c).trim() === '2' && s.p > 40000 && s.y >= thisYear - 3;
      }).map(function (s) {
        var w = Math.pow(0.72, (thisYear - s.y) + (12 - (s.m || 6)) / 12);
        if (subject.sqft && s.sf) {
          var dz = Math.abs(s.sf - subject.sqft) / Math.max(subject.sqft, 400);
          w *= 1 / (1 + dz * dz * 5);
        }
        if (subject.built && s.yb) w *= 1 / (1 + Math.pow(Math.abs(s.yb - subject.built) / 22, 2));
        if (subject.assessed && s.av) {
          var da = Math.abs(s.av - subject.assessed) / Math.max(subject.assessed, 1);
          w *= 1 / (1 + da * da * 3);
        }
        return {
          addr: s.a, price: s.p, year: s.y, month: s.m, sqft: s.sf,
          built: s.yb, assessed: s.av, ppsf: s.ppsf, ratio: s.r,
          block: s.b, lot: s.l, w: w
        };
      });
      scored.sort(function (a, b) { return b.w - a.w; });
      return scored;
    });
  }


  // Find THIS property inside the verified sales file. MOD-IV does not publish
  // living space, so the only way to know the subject's square footage is if it
  // has sold recently and the state recorded it on the SR1A.
  function subjectFromSR1A(p) {
    var d = districtCode(p);
    if (!d) return Promise.resolve(null);
    var blk = String(p.PCLBLOCK || '').replace(/^0+/, '');
    var lot = String(p.PCLLOT || '').replace(/^0+/, '');
    if (!blk || !lot) return Promise.resolve(null);
    return loadCountySales(p.COUNTY).then(function (all) {
      if (!all) return null;
      var hit = null;
      for (var i = 0; i < all.length; i++) {
        var s = all[i];
        if (s.d !== d) continue;
        if (String(s.b || '').replace(/^0+/, '') !== blk) continue;
        if (String(s.l || '').replace(/^0+/, '') !== lot) continue;
        if (!hit || s.y > hit.y || (s.y === hit.y && s.m > hit.m)) hit = s;
      }
      return hit;
    });
  }

  function paintVerified(list, subject) {
    var host = el('plm-verified-sec');
    if (!host) return;
    if (!list || list.length < 3) { host.innerHTML = ''; return; }

    var top = list.slice(0, 8);
    var withSf = list.filter(function (c) { return c.ppsf; });
    var medPpsf = withSf.length >= 5 ? median(withSf.slice(0, 40).map(function (c) { return c.ppsf; })) : null;
    var impliedBySize = (medPpsf && subject.sqft) ? medPpsf * subject.sqft : null;

    host.innerHTML = gate('verified',
      'See the verified sales behind this',
      'Actual arm\u2019s length closings in this town, confirmed by the state, with square footage and price per square foot.',
      '<h3 class="plm-sec-h">Verified sales in this town</h3>' +
      '<p class="plm-sec-s">These are not raw deeds. New Jersey\u2019s own assessors reviewed each one and confirmed it was ' +
      'a genuine arm\u2019s length sale, so family transfers, estates, and sheriff sales are already excluded. ' +
      'Ranked by how closely each compares to this property.</p>' +
      (impliedBySize
        ? '<div class="vs-hero">' +
            '<div><div class="vs-n">' + money(Math.round(impliedBySize / 1000) * 1000) + '</div>' +
            '<div class="vs-l">What ' + subject.sqft.toLocaleString() + ' sq ft is worth here</div></div>' +
            '<div><div class="vs-n">$' + medPpsf + '</div><div class="vs-l">Median per sq ft, verified</div></div>' +
            '<div><div class="vs-n">' + list.length + '</div><div class="vs-l">Verified sales nearby</div></div>' +
          '</div>'
        : '') +
      '<div class="comps-wrap"><table class="comps"><thead><tr>' +
        '<th>Address</th><th>Sold</th><th>Price</th><th>Sq ft</th><th>$/sq ft</th><th>Built</th>' +
      '</tr></thead><tbody>' +
      top.map(function (c) {
        return '<tr><td><b>' + esc(c.addr) + '</b></td>' +
          '<td>' + (c.month ? String(c.month).padStart(2, '0') + '/' : '') + c.year + '</td>' +
          '<td class="num">' + money(c.price) + '</td>' +
          '<td class="num">' + (c.sqft ? c.sqft.toLocaleString() : '-') + '</td>' +
          '<td class="num"><b>' + (c.ppsf ? '$' + c.ppsf : '-') + '</b></td>' +
          '<td>' + (c.built || '-') + '</td></tr>';
      }).join('') +
      '</tbody></table></div>' +
      '<div class="comps-cta">' +
        '<div><b>' + list.length + ' verified sales in ' + esc(current.town) + '.</b> ' +
        'What this cannot see is condition, upgrades, and what the inside actually looks like. ' +
        'That is the part that moves a price.</div>' +
        '<button class="plm-rbtn" style="width:auto;padding:12px 20px;" onclick="plOpenForm(\'comps\')">Get the full comps</button>' +
      '</div>');
  }

  // ══════════════════════════════════════════════
  // CALIBRATION
  // A per-town correction factor you set from real closings. Whenever you
  // know a true sale price and what this page estimated, the ratio of the
  // two is the correction. See valuation-calibration.json.
  // ══════════════════════════════════════════════
  var calibration = null;

  function loadCalibration() {
    if (calibration !== null) return Promise.resolve();
    return xfetch('/valuation-calibration.json', 6000)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { calibration = (j && j.factors) ? j.factors : {}; })
      .catch(function () { calibration = {}; });
  }

  function calibrationFor(town, county) {
    if (!calibration) return null;
    var t = (town || '').toUpperCase().trim();
    var tc = t + ' (' + (county || '').toUpperCase().trim() + ')';
    var keys = Object.keys(calibration);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i].toUpperCase().trim();
      if (k === tc || k === t) {
        var f = +calibration[keys[i]];
        if (f > 0.5 && f < 2.0) return f;
      }
    }
    if (calibration._default) {
      var d = +calibration._default;
      if (d > 0.5 && d < 2.0) return d;
    }
    return null;
  }

  // ══════════════════════════════════════════════
  // WATCHDOG VALUATION  ·  what it would SELL for
  //
  // This is a market value estimate, not a tax number. The two are related by
  // one figure: the municipal equalization ratio.
  //
  //     market value = assessed value / ratio
  //
  // A $171,000 assessment in a town assessing at 44% is a $385,000 house.
  // The same assessment in a town at 100% is a $171,000 house. Getting the
  // ratio right is the entire job.
  //
  // Ratio sources, in order of trust:
  //   1. equalization-ratios.json, the official Director's Ratio published
  //      by NJ Treasury. Computed from verified arm's length sales only.
  //   2. derived from recorded sales in the town, used only when it looks
  //      sane, and flagged as lower confidence.
  //
  // Nearby sales are then used for what they are genuinely good at: measuring
  // which way local prices have moved since the ratio year, and sizing the
  // range. They are NOT used to set the level, because the raw SALE_PRICE
  // field carries too many nominal and estate transfers to trust as a median.
  // ══════════════════════════════════════════════

  var officialRatios = null;
  var chapter123DistrictCache = Object.create(null);
  var revaluationTable = null;

  function loadRevaluations() {
    if (revaluationTable !== null) return Promise.resolve();
    return xfetch('/property/revaluation-reassessment-2026.json', 6000)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { revaluationTable = (j && j.districts) ? j : { tax_year: 2026, districts: {} }; })
      .catch(function () { revaluationTable = { tax_year: 2026, districts: {} }; });
  }

  function revaluationStatus(record) {
    var pin = record && (record.pin || record.PAMS_PIN) || (current && current.pin) || '';
    var m = String(pin).match(/^(\d{4})/);
    var code = m ? m[1] : '';
    var year = new Date().getFullYear();
    return {
      code: code,
      taxYear: revaluationTable && revaluationTable.tax_year,
      isCurrentYear: !!(code && revaluationTable && revaluationTable.tax_year === year && revaluationTable.districts && revaluationTable.districts[code])
    };
  }

  function loadRatios() {
    if (officialRatios !== null) return Promise.resolve();
    return xfetch('/equalization-ratios.json', 8000)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { officialRatios = (j && j.ratios) ? j.ratios : {}; })
      .catch(function () { officialRatios = {}; });
  }

  // Primary statutory ratio source: the deployed statewide Chapter 123 provider.
  // It parses and validates the official 2026 NJ Treasury certification for all
  // 564 taxing districts, keyed by the first four digits of PAMS_PIN.
  function certifiedChapter123Ratio(record) {
    var code = districtCode(record);
    if (!code) return Promise.resolve(null);
    if (chapter123DistrictCache[code]) return Promise.resolve(chapter123DistrictCache[code]);
    var url = LEDGER_URL.replace(/\/+$/, '') + '/functions/v1/chapter123-provider?district=' + encodeURIComponent(code);
    return xfetch(url, 9000)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        var row = j && j.data;
        var pct = row && +row.ratio;
        if (!pct || pct <= 0 || pct > 200) return null;
        var out = {
          ratio: pct / 100,
          lower: row.lower != null ? +row.lower / 100 : null,
          upper: row.upper != null ? Math.min(+row.upper / 100, 1) : null,
          year: +(j.tax_year || 2026), source: 'official',
          district: code, municipality: row.municipality || '', county: row.county || '',
          providerVersion: j.provider_version || 'chapter123-provider',
          sourceId: j.source_id || 'nj-division-taxation-ch123-2026',
          sourceUrl: j.source_url || ''
        };
        chapter123DistrictCache[code] = out;
        return out;
      })
      .catch(function () { return null; });
  }

  // Look up the published ratio for this town, newest year available.
  function officialRatio(town, county) {
    if (!officialRatios) return null;
    var t = (town || '').toUpperCase().trim();
    var tc = t + ' (' + (county || '').toUpperCase().trim() + ')';
    var keys = Object.keys(officialRatios), hit = null;
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i].toUpperCase().trim();
      if (k === tc) { hit = officialRatios[keys[i]]; break; }
    }
    if (!hit) {
      for (var j = 0; j < keys.length; j++) {
        if (keys[j].toUpperCase().trim() === t) { hit = officialRatios[keys[j]]; break; }
      }
    }
    if (!hit) return null;
    var years = Object.keys(hit).map(Number).filter(function (y) { return y > 1990; }).sort();
    if (!years.length) return null;
    var yr = years[years.length - 1], row = hit[String(yr)];

    // the file supports a bare percentage or the full published row with the
    // Chapter 123 common level range
    var pct, lower = null, upper = null;
    if (row && typeof row === 'object') {
      pct = +row.ratio;
      if (row.lower) lower = +row.lower / 100;
      if (row.upper) upper = Math.min(+row.upper / 100, 1);
    } else { pct = +row; }

    if (!pct || pct <= 0 || pct > 200) return null;
    return { ratio: pct / 100, lower: lower, upper: upper, year: yr, source: 'official' };
  }

  // Fallback: derive from recorded sales. Only trusted when the sample is
  // large and the spread is not absurd, because the SALE_PRICE field is dirty.
  function derivedRatio(comps, thisYear) {
    if (!comps || comps.length < 20) return null;
    var rs = [];
    comps.forEach(function (c) {
      if (!c.price || !c.assessed || !c.year) return;
      if (c.year < thisYear - 4) return;
      if (c.price < 60000) return;                 // nominal transfers
      var v = c.assessed / c.price;
      if (isFinite(v) && v > 0.10 && v < 1.60) rs.push(v);
    });
    if (rs.length < 15) return null;
    var q1 = quantile(rs, 0.25), q3 = quantile(rs, 0.75), iqr = q3 - q1;
    var t = rs.filter(function (v) { return v >= q1 - 1.5 * iqr && v <= q3 + 1.5 * iqr; });
    if (t.length < 12) return null;
    var m = median(t);
    if (!m || m <= 0.12 || m > 1.35) return null;
    return { ratio: m, year: thisYear - 1, source: 'derived', n: t.length,
             lo: quantile(t, 0.30), hi: quantile(t, 0.70) };
  }

  // How fast have local prices moved? Measured off nearby sales year over year.
  function localDrift(comps, thisYear, anchorRatio) {
    if (!comps || comps.length < 10) return null;
    // Only measure drift from sales that behave like real arm's length sales
    // for this town. If the official ratio says homes trade at 2.25x their
    // assessment, a row sitting at 1.0x is a nominal transfer, and letting it
    // into the year over year medians drags the drift the wrong way.
    var expected = anchorRatio ? (1 / anchorRatio) : null;
    var byYear = {};
    comps.forEach(function (c) {
      if (!c.price || !c.assessed || !c.year) return;
      if (c.price < 60000) return;
      var m = c.price / c.assessed;
      if (!isFinite(m) || m <= 0) return;
      if (expected && (m < expected * 0.60 || m > expected * 1.65)) return;
      (byYear[c.year] = byYear[c.year] || []).push(m);
    });
    var yy = Object.keys(byYear).map(Number).sort(function (a, b) { return a - b; });
    var d = 0, n = 0;
    for (var i = 1; i < yy.length; i++) {
      var A = median(byYear[yy[i - 1]]), B = median(byYear[yy[i]]), gap = yy[i] - yy[i - 1];
      if (A > 0 && B > 0 && gap > 0 && byYear[yy[i]].length >= 3 && byYear[yy[i - 1]].length >= 3) {
        d += Math.pow(B / A, 1 / gap) - 1; n++;
      }
    }
    if (!n) return null;
    return Math.max(-0.12, Math.min(0.18, d / n));
  }

  // Adjust for how this home compares to its neighbors on the things the
  // public record does tell us: vintage and lot size. Assessment already
  // captures most of it, so this is a light touch, capped at +/- 8%.
  function propertyAdjust(subject, comps) {
    if (!comps || comps.length < 8) return { factor: 1, notes: [] };
    var builts = comps.map(function (c) { return c.built; }).filter(function (b) { return b > 1700; });
    var acres = comps.map(function (c) { return c.acres; }).filter(function (a) { return a > 0; });
    var f = 1, notes = [];

    if (builts.length >= 8 && subject.built > 1700) {
      var mb = median(builts), dy = subject.built - mb;
      if (Math.abs(dy) >= 6) {
        var a = Math.max(-0.05, Math.min(0.05, (dy / 40) * 0.05));
        f *= (1 + a);
        notes.push((dy > 0 ? 'newer' : 'older') + ' than the typical nearby home by ' + Math.abs(Math.round(dy)) + ' years');
      }
    }
    if (acres.length >= 8 && subject.acres > 0) {
      var ma = median(acres);
      if (ma > 0 && Math.abs(subject.acres - ma) / ma > 0.25) {
        var b = Math.max(-0.04, Math.min(0.04, ((subject.acres - ma) / ma) * 0.05));
        f *= (1 + b);
        notes.push('lot is ' + (subject.acres > ma ? 'larger' : 'smaller') + ' than typical nearby');
      }
    }
    return { factor: Math.max(0.92, Math.min(1.08, f)), notes: notes };
  }

  function watchdogValuation(subject, comps, thisYear, town, county, ratioObj, apprHint) {
    if (!subject || !subject.assessed || subject.assessed < 5000) return null;

    // ratio precedence: live measurement, then published, then derived.
    // The live one wins because it is measured against the same assessment
    // vintage we are converting, at today's prices.
    var R = ratioObj || officialRatio(town, county) || derivedRatio(comps, thisYear);
    if (!R || !R.ratio) return null;

    // level: the state's own conversion
    var base = subject.assessed / R.ratio;

    // time: a live ratio is already current, so it needs no adjustment. A
    // published ratio does. Its effective valuation date is roughly January of
    // the year BEFORE its label, because the sales sample runs mid year to mid
    // year, so tax year 2026 is priced around January 2025.
    // A live ratio is already current and needs no time adjustment. A published
    // ratio does: its effective valuation date is about January of the year
    // BEFORE its label, because the sales sample runs mid year to mid year.
    //
    // Prefer the appreciation measured across the whole town or county sample.
    // Drift computed off a few dozen nearby comps is noisy and skews toward
    // zero when nominal transfers are mixed in, which quietly kills the
    // adjustment exactly when it is needed most.
    var localD = localDrift(comps, thisYear, R.ratio);
    var localTrendMeasured = localD != null && Math.abs(localD) > 0.015;
    var drift = (apprHint != null) ? apprHint
              : localTrendMeasured ? localD
              : 0;
    var appreciationSource = (apprHint != null) ? 'verified-sr1a-trend'
                           : localTrendMeasured ? 'nearby-recorded-sales'
                           : 'none';
    var timeFactor = 1, yearsStale = 0;
    if (R.source !== 'live' && R.source !== 'sr1a') {
      var now2 = new Date();
      var nowDec2 = now2.getFullYear() + now2.getMonth() / 12;
      var ratioAsOf = (R.year || thisYear) - 1;          // Jan of the prior year
      yearsStale = Math.max(0, Math.min(3.5, nowDec2 - ratioAsOf));
      if (yearsStale > 0.25) timeFactor = Math.pow(1 + drift, yearsStale);
      timeFactor = Math.max(0.94, Math.min(1.45, timeFactor));
    }

    // property: light adjustment for vintage and lot versus neighbors
    var adj = propertyAdjust(subject, comps);

    var cal = calibrationFor(town, county) || 1;
    var mid = base * timeFactor * adj.factor * cal;

    // range: driven by how much we trust the ratio and how much data backs it
    var compCount = (comps || []).filter(function (c) { return c.price > 60000 && c.year >= thisYear - 5; }).length;
    var band;
    if (R.source === 'sr1a' && R.n >= 150) band = 0.07;
    else if (R.source === 'sr1a' && R.n >= 40) band = 0.09;
    else if (R.source === 'sr1a') band = 0.12;
    else if (R.source === 'live' && R.n >= 40) band = 0.09;
    else if (R.source === 'live') band = 0.12;
    else if (R.source === 'official') band = 0.15;
    else band = 0.20;

    var conf = (R.source === 'sr1a' && R.n >= 40) ? 'High'
             : (R.source === 'sr1a') ? 'Medium'
             : (R.source === 'live' && R.n >= 40) ? 'High'
             : (R.source === 'live' && R.n >= 20) ? 'Medium'
             : (R.source === 'official' && compCount >= 20 && drift != null) ? 'Medium'
             : (R.source === 'official') ? 'Medium' : 'Low';

    return {
      method: R.source,
      mid: mid, lo: mid * (1 - band), hi: mid * (1 + band),
      ratio: R.ratio, ratioLower: R.lower, ratioUpper: R.upper,
      ratioYear: R.year, ratioSource: R.source, ratioDistrict: R.district || null,
      ratioProviderVersion: R.providerVersion || null, ratioSourceId: R.sourceId || null,
      drift: drift, timeFactor: timeFactor, yearsStale: yearsStale, calibration: cal,
      ratioN: R.n || null, ratioMonths: R.months || null,
      appreciation: (R.appreciation != null && R.apprMeasured ? R.appreciation : drift),
      appreciationSource: (R.appreciation != null && R.apprMeasured) ? 'live-ratio-sales' : appreciationSource,
      apprMeasured: !!R.apprMeasured || appreciationSource !== 'none', medSaleAge: R.medSaleAge || null,
      ratioScope: R.scope || null, ratioStats: R.stats || null,
      adjFactor: adj.factor, adjNotes: adj.notes,
      n: compCount, confidence: conf,
      base: base,
      newest: comps && comps.length ? Math.max.apply(null, comps.map(function (c) { return c.year || 0; })) : null,
      drivers: pickDrivers(subject, comps, thisYear, R.ratio)
    };
  }

  // The nearby sales worth showing. Sorted by similarity, not by price.
  function pickDrivers(subject, comps, thisYear, ratio) {
    if (!comps || !comps.length) return [];
    return comps
      .filter(function (c) { return c.price > 60000 && c.year >= thisYear - 5; })
      .map(function (c) {
        var w = Math.pow(0.75, thisYear - c.year);
        if (c.built && subject.built) w *= 1 / (1 + Math.pow(Math.abs(c.built - subject.built) / 20, 2));
        if (c.acres && subject.acres) w *= 1 / (1 + Math.pow(Math.abs(c.acres - subject.acres) / Math.max(subject.acres, 0.15), 2));
        if (c.assessed && subject.assessed) w *= 1 / (1 + Math.pow(Math.abs(c.assessed - subject.assessed) / Math.max(subject.assessed * 0.4, 1), 2));
        return { addr: c.addr, price: c.price, year: c.year, built: c.built,
                 acres: c.acres, assessed: c.assessed, w: w,
                 implied: c.assessed ? (subject.assessed / c.assessed) * c.price : null };
      })
      .sort(function (a, b) { return b.w - a.w; })
      .slice(0, 6);
  }

  function gatherComps(lat, lon, muni) {
    var radii = [800, 1600, 3000];
    function attempt(i) {
      if (i >= radii.length) return Promise.resolve([]);
      return nearbySales(lat, lon, radii[i], muni).then(function (list) {
        if (list.length >= 20 || i === radii.length - 1) return list;
        return attempt(i + 1);
      });
    }
    return attempt(0);
  }

  // ══════════════════════════════════════════════
  // NEARBY RECORDED SALES
  // Real comps, from the same free layer. Not MLS, so no photos or
  // list prices, but these are actual recorded transfers next door.
  // ══════════════════════════════════════════════
  function nearbySales(lat, lon, meters, muni) {
    return cached(geoKey(lat, lon, 'sales' + meters + (muni || '')), 6e5,
      function () { return nearbySalesRaw(lat, lon, meters, muni); });
  }
  function nearbySalesRaw(lat, lon, meters, muni) {
    var dLat = meters / 111320, dLon = meters / (111320 * Math.cos(lat * Math.PI / 180));
    var env = { xmin: lon - dLon, ymin: lat - dLat, xmax: lon + dLon, ymax: lat + dLat,
                spatialReference: { wkid: 4326 } };
    var p = new URLSearchParams({
      geometry: JSON.stringify(env), geometryType: 'esriGeometryEnvelope',
      inSR: '4326', outSR: '4326', spatialRel: 'esriSpatialRelIntersects',
      where: "SALE_PRICE > 50000 AND PROP_CLASS = '2'" + (muni ? " AND MUN_NAME = '" + String(muni).replace(/'/g, "''") + "'" : ''),
      outFields: 'PROP_LOC,SALE_PRICE,DEED_DATE,NET_VALUE,YR_CONSTR,CALC_ACRE,MUN_NAME',
      returnGeometry: 'false', returnCentroid: 'true', resultRecordCount: '400', f: 'json'
    });
    return xfetch(NJ_PARCEL + '?' + p, 15000)
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d.features) return [];
        var thisYear = new Date().getFullYear();
        return d.features.map(function (f) {
          var a = f.attributes, yr = deedYear(a.DEED_DATE);
          var dist = null;
          if (f.centroid && f.centroid.x != null) {
            var dx = (f.centroid.x - lon) * 111320 * Math.cos(lat * Math.PI / 180);
            var dy = (f.centroid.y - lat) * 111320;
            dist = Math.sqrt(dx * dx + dy * dy);
          }
          return { addr: a.PROP_LOC || '', price: +a.SALE_PRICE || 0, year: yr,
                   assessed: +a.NET_VALUE || 0, built: +a.YR_CONSTR || 0,
                   acres: +a.CALC_ACRE || 0, town: a.MUN_NAME || '', dist: dist };
        })
        .filter(function (x) {
          if (!x.year || x.year < thisYear - 6 || x.price <= 50000) return false;
          // belt and braces: anything past 5 miles is a projection error, not a neighbor
          if (x.dist != null && x.dist > 8000) return false;
          return true;
        })
        .sort(function (a, b) { return b.year - a.year || b.price - a.price; });
      })
      .catch(function () { return []; });
  }

  // ══════════════════════════════════════════════
  // NEIGHBOURHOOD CONTEXT
  // ══════════════════════════════════════════════
  function neighborhoodStats(lat, lon, meters) {
    return cached(geoKey(lat, lon, 'hood' + meters), 6e5,
      function () { return neighborhoodStatsRaw(lat, lon, meters); });
  }
  function neighborhoodStatsRaw(lat, lon, meters) {
    var dLat = meters / 111320, dLon = meters / (111320 * Math.cos(lat * Math.PI / 180));
    var env = { xmin: lon - dLon, ymin: lat - dLat, xmax: lon + dLon, ymax: lat + dLat,
                spatialReference: { wkid: 4326 } };
    var p = new URLSearchParams({
      geometry: JSON.stringify(env), geometryType: 'esriGeometryEnvelope',
      inSR: '4326', spatialRel: 'esriSpatialRelIntersects',
      where: "PROP_CLASS = '2' AND NET_VALUE > 10000",
      outFields: 'NET_VALUE,LAST_YR_TX,YR_CONSTR,CALC_ACRE',
      returnGeometry: 'false', resultRecordCount: '400', f: 'json'
    });
    return xfetch(NJ_PARCEL + '?' + p, 15000)
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d.features || d.features.length < 8) return null;
        var vals = [], taxes = [], years = [], acres = [];
        d.features.forEach(function (f) {
          var a = f.attributes;
          if (+a.NET_VALUE > 10000) vals.push(+a.NET_VALUE);
          if (+a.LAST_YR_TX > 100) taxes.push(+a.LAST_YR_TX);
          if (+a.YR_CONSTR > 1700) years.push(+a.YR_CONSTR);
          if (+a.CALC_ACRE > 0) acres.push(+a.CALC_ACRE);
        });
        return {
          n: d.features.length,
          medAssessed: median(vals), medTax: median(taxes),
          medYear: years.length ? Math.round(median(years)) : null,
          medAcres: acres.length ? median(acres) : null
        };
      })
      .catch(function () { return null; });
  }

  // ══════════════════════════════════════════════
  // SELLING OPTIONS
  // ══════════════════════════════════════════════
  var SELL_OPTIONS = [
    { key: 'premier', icon: 'fa-trophy',
      title: 'Work with a premier local agent',
      body: 'John and Heather live and work in this market. Full service listing, professional photography, pricing built from real comps, and a tax review of your assessment before you list.',
      cta: 'Get started' },
    { key: 'ownagent', icon: 'fa-sign-hanging',
      title: 'List with your own agent',
      body: 'Already have an agent? Good, keep them. We will still feature your listing on this site free of charge so it reaches the homeowners researching property values in your town.',
      cta: 'Feature my listing' },
    { key: 'fsbo', icon: 'fa-handshake',
      title: 'Sell it yourself',
      body: 'Going for sale by owner? We will showcase your FSBO here at no cost. You keep full control, you keep the commission, and you get in front of local buyers already searching this area.',
      cta: 'List my home free' }
  ];

  function buildSellingOptions() {
    return '<h3 class="plm-sec-h">Explore your selling options</h3>' +
      '<p class="plm-sec-s">Three ways to sell ' + esc(current.address) + '. Two of them are free either way.</p>' +
      '<div class="sell-opts">' +
        SELL_OPTIONS.map(function (o) {
          return '<div class="sell-opt">' +
            '<div class="sell-opt-icon"><i class="fas ' + o.icon + '"></i></div>' +
            '<div class="sell-opt-body">' +
              '<h4>' + o.title + '</h4>' +
              '<p>' + o.body + '</p>' +
              '<button class="sell-opt-cta" onclick="plOpenForm(\'' + o.key + '\')">' + o.cta + ' <i class="fas fa-arrow-right"></i></button>' +
            '</div>' +
          '</div>';
        }).join('') +
      '</div>';
  }

  // ══════════════════════════════════════════════
  // ASYNC PAINTERS
  // ══════════════════════════════════════════════
  // ══════════════════════════════════════════════
  // VALUATION PAINTER
  // ══════════════════════════════════════════════
  var CONF_META = {
    High:   { cls: 'hi',  txt: 'High confidence',   note: 'Plenty of recent nearby sales with a tight spread.' },
    Medium: { cls: 'md',  txt: 'Medium confidence', note: 'Enough nearby sales to work with, but the spread is wide.' },
    Low:    { cls: 'lo',  txt: 'Low confidence',    note: 'Thin sales data nearby. Treat this as a very rough bracket.' }
  };

  function paintValuation(v, assessed, tax, ratio) {
    var box = el('plm-estimate');
    if (!box) return;
    box.classList.remove('loading');

    if (!v) {
      box.innerHTML =
        '<div class="plm-est-lbl"><i class="fas fa-dog"></i> Watchdog Tax Value</div>' +
        '<div class="plm-est-val small">Not enough to go on yet</div>' +
        '<div class="plm-est-sub">Working out a defensible value for this property needs recorded sales nearby, and there are not enough on file for ' +
        esc(current.town || 'this town') + ' yet. Rather than invent a number, I would rather tell you. ' +
        '<a href="#" onclick="plOpenForm(\'appeal\');return false;">Ask me to look at it by hand</a>.</div>';
      var eqx = el('plm-equity');
      if (eqx) eqx.innerHTML = '<div class="plm-kpi-n">-</div><div class="plm-kpi-l">Assessment gap</div>';
      return;
    }

    var r = function (n) { return Math.round(n / 1000) * 1000; };
    var cm = CONF_META[v.confidence] || CONF_META.Low;

    // ── the appeal frame ──
    // Headline is deliberately the conservative end. For a tax appeal you are
    // arguing what the property is defensibly worth, not what a listing agent
    // would hope for, and a number you can stand behind in front of a county
    // board is worth more than an optimistic one.
    var lowEnd  = v.lo;
    var midEnd  = v.mid;
    var argued  = (lowEnd + midEnd) / 2;          // what we would argue

    // what the town's own assessment implies the property is worth
    var implied = (v.ratio && v.ratio > 0) ? assessed / v.ratio : null;
    var gap     = implied ? implied - argued : null;
    var gapPct  = (implied && argued) ? (implied - argued) / argued : null;

    current.appeal = { argued: argued, low: lowEnd, mid: midEnd, implied: implied };

    var basis =
      (v.ratioSource === 'sr1a'
        ? 'Measured from <b>' + v.ratioN + '</b> sales in <b>' + esc(current.town) + '</b> that New Jersey\u2019s own ' +
          'assessors verified as genuine arm\u2019s length transactions. On that evidence, assessments here run at <b>' +
          (v.ratio * 100).toFixed(1) + '%</b> of what homes actually sell for. ' +
          'Family transfers, estates and sheriff sales are excluded by the state before we ever see them.'
        : v.ratioSource === 'live'
        ? 'Built from <b>' + v.ratioN + '</b> homes in <b>' +
          esc(v.ratioScope === 'county' ? (current.county + ' County') : current.town) +
          '</b> that actually sold recently, each carried forward to today\u2019s prices. On that evidence assessments here run at <b>' +
          (v.ratio * 100).toFixed(1) + '%</b> of what homes really trade for.'
        : v.ratioSource === 'official'
        ? 'Based on the official state equalization ratio of <b>' + (v.ratio * 100).toFixed(2) + '%</b> for <b>' +
          esc(current.town) + '</b>, tax year ' + v.ratioYear + '. That is the same figure a county tax board applies.'
        : 'Derived from recorded sales, since no published state ratio is on file for <b>' + esc(current.town) + '</b> yet.');

    box.innerHTML =
      '<div class="plm-est-lbl"><i class="fas fa-dog"></i> Watchdog Tax Value' +
        '<span class="plm-conf ' + cm.cls + '" title="' + cm.note + '">' + cm.txt + '</span></div>' +
      '<div class="plm-est-hero">' + money(r(argued)) + '</div>' +
      '<div class="plm-est-range">Defensible range ' + money(r(lowEnd)) + ' to ' + money(r(midEnd)) + '</div>' +
      '<div class="plm-est-purpose"><i class="fas fa-gavel"></i>' +
        '<span>This is a <b>tax appeal value</b>, not a listing price. It is deliberately set at the ' +
        'conservative end, because the number that wins in front of a county board is the one you can defend.</span>' +
      '</div>' +
      '<div class="plm-est-sub">' + basis +
        ' <button class="plm-inline-why" onclick="plWhy()">How this is calculated</button></div>' +
      (implied
        ? '<div class="plm-est-rate">Your assessment of <b>' + money(assessed) + '</b> implies the town values this property at <b>' +
          money(r(implied)) + '</b>' +
          (gapPct && gapPct > 0.05
            ? ', which is <b style="color:#f0a0a0">' + Math.round(gapPct * 100) + '% above</b> what the evidence supports.'
            : gapPct && gapPct < -0.05
            ? ', which is <b style="color:#7ee0a8">below</b> what the evidence supports. Good news for your bill.'
            : ', close to what the evidence supports.') + '</div>'
        : '') +
      '<div class="plm-est-fine">An estimate for screening a property tax appeal. It is built from public assessment and sale records and has not seen inside the house. ' +
        'It is not an appraisal and not a listing price. ' +
        '<a href="#" onclick="plOpenForm(\'appeal\');return false;">Have me check it properly</a>.</div>';

    var eq = el('plm-equity');
    if (eq && implied) {
      var d2 = implied - argued;
      eq.innerHTML = '<div class="plm-kpi-n" style="color:' + (d2 > 0 ? 'var(--red)' : 'var(--green)') + '">' +
        (d2 > 0 ? '+' : '') + money(d2) + '</div><div class="plm-kpi-l">Town vs evidence</div>';
    }

    paintAppealCase(assessed, tax, v, current.comps);
    if (v.drivers && v.drivers.length) paintDrivers(v);
  }

  // ══════════════════════════════════════════════
  // THE APPEAL CASE
  // ══════════════════════════════════════════════
  function paintAppealCase(assessed, tax, v, comps) {
    var host = el('plm-score-sec');
    if (!host) return;

    // A statutory appeal screen needs independent market-value evidence.
    // Peer assessments are useful context, but they are not true market value
    // and must never be put through the Chapter 123 corridor.
    var appr = (v && v.appreciation != null) ? v.appreciation : 0;
    var thisYear = new Date().getFullYear();
    var evidence = [], anchors = [];
    var verifiedSale = +current.verifiedSale || 0;
    var verifiedSaleYear = +current.verifiedSaleYear || 0;

    if (verifiedSale > 1000 && verifiedSaleYear && (thisYear - verifiedSaleYear) <= 12) {
      var yrs = thisYear - verifiedSaleYear;
      var carried = verifiedSale * Math.pow(1 + appr, yrs);
      evidence.push({ kind: 'verified-sale', value: carried,
        label: 'State-verified sale of ' + money(verifiedSale) + ' in ' + verifiedSaleYear +
          (Math.abs(appr) > 0.0001
            ? ', carried forward ' + yrs + ' years at the measured ' + (appr * 100).toFixed(1) + '% annual trend'
            : ', with no appreciation adjustment because no defensible market trend was available') });
      anchors.push(carried);
    }

    var peerMed = null, peerN = 0;
    if (comps && comps.length >= 8) {
      var subjBuilt = +current.yearBuilt || 0, subjAcres = +current.acres || 0;
      var peers = comps.filter(function (c) {
        if (!c.assessed || c.assessed < 10000) return false;
        if (subjBuilt && c.built && Math.abs(c.built - subjBuilt) > 18) return false;
        if (subjAcres && c.acres && (c.acres < subjAcres * 0.5 || c.acres > subjAcres * 2)) return false;
        return true;
      });
      if (peers.length < 8) peers = comps.filter(function (c) { return c.assessed > 10000; });
      if (peers.length >= 8) {
        peerMed = median(peers.map(function (c) { return c.assessed; }));
        peerN = peers.length;
      }
    }

    var official = current.certifiedRatio || officialRatio(current.town, current.county);
    var reval = revaluationStatus(current);
    var hasMarketAnchor = anchors.length > 0;

    // Revaluation/reassessment year: Chapter 123's common-level range does not
    // apply. Assessment is compared directly with supported true market value.
    if (reval.isCurrentYear && hasMarketAnchor) {
      var revalMarket = median(anchors);
      var revalOver = assessed - revalMarket;
      var revalCase = revalOver > 0;
      var revalRate = (tax && assessed) ? tax / assessed : null;
      var revalSaving = (revalCase && revalRate) ? revalOver * revalRate : null;

      current.appeal = Object.assign(current.appeal || {}, {
        target: revalMarket, limit: revalMarket, overBy: revalOver, hasCase: revalCase,
        saving: revalSaving, peerMed: peerMed, peerN: peerN,
        basis: 'verified market-value evidence in a revaluation/reassessment year',
        statutory: true, chapter123Applicable: false, revaluationYear: true
      });
      trackChapter123Coverage(false, 'revaluation-year-not-applicable');

      host.innerHTML =
        buildDeadlineBanner() +
        '<h3 class="plm-sec-h">Revaluation-year market value check</h3>' +
        '<p class="plm-sec-s"><b>Chapter 123 does not apply to this ' + thisYear + ' assessment year.</b> ' +
        'New Jersey lists this taxing district for implementation of a revaluation or reassessment, so there is no 15 percent common-level cushion. ' +
        'The assessment is compared directly with supported true market value.</p>' +
        '<div class="pl-card"><div class="score-rows">' +
'<div class="score-row"><span>Your current assessment</span><b>' + money(assessed) + '</b></div>' +
evidence.map(function (e) { return '<div class="score-row"><span>' + esc(e.label) + '</span><b>' + money(e.value) + '</b></div>'; }).join('') +
'<div class="score-row"><span>Supported market value / assessment target</span><b>' + money(revalMarket) + '</b></div>' +
(revalCase ? '<div class="score-row over"><span>Assessment above supported market value by</span><b>' + money(revalOver) + '</b></div>' : '') +
        '</div>' +
        (revalSaving && revalSaving > 150
? '<div class="score-save"><div class="score-save-n">' + money(revalSaving) + '<span>/yr</span></div>' +
    '<div class="score-save-l">Estimated annual difference if the assessment were reduced to the supported market value.</div>' +
    '<button class="plm-rbtn" onclick="plOpenForm(\'appeal\')">Have John screen the evidence</button></div>'
: '') +
        '</div>' +
        '<div class="score-fine">Informational screening only. This is not legal, tax, appraisal, or certified comparative market analysis advice. ' +
        'Figures are estimates from public state data and may be incomplete or stale. Verify the revaluation status, filing deadline, and evidence with the municipal assessor or county board of taxation, or with a qualified professional, before filing.</div>';
      return;
    }

    // Chapter 123 path: requires both independent market evidence and the
    // municipality's certified ratio/common-level range.
    if (hasMarketAnchor && official && official.ratio > 0) {
      var marketValue = median(anchors);
      var target = marketValue * official.ratio;
      var upperRatio = official.upper != null ? Math.min(official.upper, 1) : Math.min(official.ratio * 1.15, 1);
      var limit = marketValue * upperRatio;
      var overBy = assessed - limit;
      var hasCase = overBy > 0;
      var effRate = (tax && assessed) ? tax / assessed : null;
      var saving = (hasCase && effRate) ? (assessed - target) * effRate : null;

      current.appeal = Object.assign(current.appeal || {}, {
        target: target, limit: limit, overBy: overBy, hasCase: hasCase,
        saving: saving, peerMed: peerMed, peerN: peerN,
        basis: 'state-verified sale plus certified Chapter 123 corridor',
        statutory: true, chapter123Applicable: true, revaluationYear: false,
        ratio: official.ratio, upperRatio: upperRatio, ratioYear: official.year
      });
      trackChapter123Coverage(true, 'A-own-sale-certified');

      var rows = '<div class="score-rows">' +
        '<div class="score-row"><span>Your current assessment</span><b>' + money(assessed) + '</b></div>' +
        evidence.map(function (e) { return '<div class="score-row"><span>' + esc(e.label) + '</span><b>' + money(e.value) + '</b></div>'; }).join('') +
        '<div class="score-row"><span>Certified average ratio, tax year ' + official.year + '</span><b>' + (official.ratio * 100).toFixed(2) + '%</b></div>' +
        '<div class="score-row"><span>Assessment supported at the certified ratio</span><b>' + money(target) + '</b></div>' +
        '<div class="score-row"><span>Certified legal upper ratio</span><b>' + (upperRatio * 100).toFixed(2) + '%</b></div>' +
        '<div class="score-row' + (hasCase ? ' over' : '') + '"><span>Chapter 123 upper limit</span><b>' + money(limit) + '</b></div>' +
        (hasCase ? '<div class="score-row over"><span>Assessed above that limit by</span><b>' + money(overBy) + '</b></div>' : '') +
        (peerMed !== null ? '<div class="score-row"><span>Peer median, supporting context only (' + peerN + ' homes)</span><b>' + money(peerMed) + '</b></div>' : '') +
        '</div>';

      host.innerHTML =
        buildDeadlineBanner() +
        '<h3 class="plm-sec-h">Do you have a tax appeal?</h3>' +
        '<p class="plm-sec-s">This Chapter 123 screen uses independent market-value evidence and the municipality\u2019s certified ' + official.year +
        ' ratio/common-level range. The state-certified upper ratio is used directly and is legally capped at 100 percent.</p>' +
        '<div class="pl-card">' +
buildOpinion(hasCase, overBy, saving, target) + rows +
(saving && saving > 150
  ? '<div class="score-save"><div class="score-save-n">' + money(saving) + '<span>/yr</span></div>' +
      '<div class="score-save-l">Estimated annual saving if the assessment came down to ' + money(target) +
        '. About <b>' + money(saving * 5) + '</b> over five years.</div>' +
      '<button class="plm-rbtn" onclick="plOpenForm(\'appeal\')">Have John screen this appeal</button></div>'
  : '<button class="plm-rbtn ghost" style="margin-top:14px;" onclick="plOpenForm(\'appeal\')">Have John double check this</button>') +
        '</div>' +
        '<div class="score-fine">Informational screening only. This is not legal, tax, appraisal, or certified comparative market analysis advice. ' +
        'Figures are estimates from public state data and may be incomplete or stale. A filed appeal needs current comparable sales and the certified ratio/range for the applicable tax year. ' +
        'Verify the filing deadline and evidence with the municipal assessor or county board of taxation, or with a qualified professional, before filing.</div>';
      return;
    }

    // Peer-only evidence path. Never call this Chapter 123, never apply a 15%
    // corridor, and never project appeal savings from another property's assessment.
    trackChapter123Coverage(false, peerMed !== null ? 'peer-only' : (hasMarketAnchor ? 'missing-certified-ratio' : 'neither'));
    if (peerMed === null) {
      host.innerHTML = '';
      return;
    }

    var peerGap = assessed - peerMed;
    var peerPct = peerMed ? (peerGap / peerMed) * 100 : 0;
    current.appeal = Object.assign(current.appeal || {}, {
      target: null, limit: null, overBy: null, hasCase: false, saving: null,
      peerMed: peerMed, peerN: peerN, basis: 'peer-assessment comparison',
      statutory: false, chapter123Applicable: null, revaluationYear: !!reval.isCurrentYear
    });

    host.innerHTML =
      '<h3 class="plm-sec-h">How this assessment compares to similar homes nearby</h3>' +
      '<p class="plm-sec-s">This is an assessment-comparison signal only. It is <b>not a Chapter 123 test</b>, because neighboring assessments are not independent evidence of true market value. ' +
      'It can tell you when a property looks unusual enough to investigate, but it cannot establish a statutory appeal limit or savings amount.</p>' +
      '<div class="pl-card"><div class="score-rows">' +
        '<div class="score-row"><span>Your current assessment</span><b>' + money(assessed) + '</b></div>' +
        '<div class="score-row"><span>Median assessment of ' + peerN + ' similar homes nearby</span><b>' + money(peerMed) + '</b></div>' +
        '<div class="score-row' + (peerGap > 0 ? ' over' : '') + '"><span>Difference from the peer median</span><b>' +
(peerGap > 0 ? '+' : '') + money(peerGap) + ' (' + (peerPct > 0 ? '+' : '') + peerPct.toFixed(1) + '%)</b></div>' +
      '</div></div>' +
      '<div class="score-fine">Informational comparison only. This is not legal, tax, appraisal, or certified comparative market analysis advice. ' +
      'Peer assessments can reflect different condition, exemptions, improvements, or assessment history. Verify current records and obtain independent market-value evidence before considering an appeal.</div>';
  }

  function trackChapter123Coverage(testable, basis) {
    if (!current) return;
    var key = [current.pin || current.address, testable ? '1' : '0', basis].join('|');
    if (current._chapter123CoverageKey === key) return;
    current._chapter123CoverageKey = key;
    if (typeof gtag === 'function') {
      gtag('event', 'chapter123_coverage', {
        testable: testable ? 'true' : 'false',
        evidence_basis: basis,
        living_sqft_present: current.livingSpace ? 'true' : 'false',
        municipality: current.town || 'unknown',
        property_class: current.cls || 'unknown'
      });
    }
  }


  // the handful of sales that actually moved the number
  function paintDrivers(v) {
    var host = el('plm-drivers');
    if (!host) return;
    host.innerHTML = gate('drivers',
      'See the sales behind this number',
      'The six nearby closings that carried the most weight, what each one sold for, and what it implies this property is worth.',
      '<h3 class="plm-sec-h">The sales this estimate leaned on</h3>' +
      '<p class="plm-sec-s">Nearby homes that actually changed hands, picked for being recent and similar in vintage, lot, and assessment. ' +
      '"Implies" is what this property would be worth if it traded on the same terms as that one.</p>' +
      '<div class="comps-wrap"><table class="comps"><thead><tr>' +
        '<th>Address</th><th>Sold</th><th>Sale price</th><th>Built</th><th>Lot</th><th>Implies</th>' +
      '</tr></thead><tbody>' +
      v.drivers.map(function (d) {
        return '<tr><td><b>' + esc(d.addr) + '</b></td>' +
          '<td>' + d.year + '</td>' +
          '<td class="num">' + money(d.price) + '</td>' +
          '<td>' + (d.built || '-') + '</td>' +
          '<td class="num">' + (d.acres ? d.acres.toFixed(2) + ' ac' : '-') + '</td>' +
          '<td class="num" style="color:var(--navy);font-weight:800;">' +
            (d.implied ? money(Math.round(d.implied / 1000) * 1000) : '-') + '</td></tr>';
      }).join('') +
      '</tbody></table></div>');
  }

  window.plWhy = function () {
    var v = current.valuation, a = current.appeal;
    var body =
      '<p><b>Assessed value</b> is the number your town uses to calculate your tax bill. It is not what your home would sell for. ' +
      'Most New Jersey towns assess at some fraction of real market value, and that fraction drifts every year until the town revalues.</p>' +

      '<p><b>The Watchdog Tax Value</b> is our estimate of what this property is defensibly worth for tax purposes. ' +
      'It is built from what comparable homes in your town actually sold for, measured against their assessments, ' +
      'so it speaks the same language a county tax board does.</p>' +

      '<p><b>Why it sits at the conservative end.</b> This is not a listing price and it is not trying to flatter you. ' +
      'In an appeal you have to defend the number, and the county attorney will push back on an optimistic one. ' +
      'A value you can stand behind is worth far more than a high one you cannot. If you are thinking about selling ' +
      'rather than appealing, the number you want is different, and I will run it for you.</p>' +

      '<p><b>How the appeal test works.</b> New Jersey\u2019s Chapter 123 rule says your assessment survives if it sits at or below ' +
      'true market value times your town\u2019s equalization ratio times 1.15. That 15 percent is the cushion municipalities get. ' +
      'Above it, the county board is directed to reduce the assessment.</p>' +

      '<p><b>Why the appeal test uses different evidence.</b> The headline value above is worked out from your assessment and your ' +
      'town\u2019s ratio, so testing your assessment against it would just be checking a number against itself. The appeal section ' +
      'instead uses evidence that came from somewhere else entirely: your own last recorded sale carried forward, and what ' +
      'comparable neighbors are assessed at. That is the argument that actually holds up.</p>' +

      (v && a
        ? '<p>For this property: the evidence supports an assessment of ' +
          (a.target ? money(a.target) : 'n/a') + ', with a Chapter 123 upper limit of ' +
          (a.limit ? money(a.limit) : 'n/a') + '. The current assessment is ' + money(current.assessed) + '.</p>'
        : '') +

      '<p><b>What it cannot see.</b> Condition, upgrades, a finished basement, a failing roof, or anything else behind the front door. ' +
      'Recorded sales also lag by roughly a year. This is a screening tool to tell you whether an appeal is worth a closer look, ' +
      'not an appraisal and not a substitute for one.</p>';
    plModalNote('How the Watchdog Tax Value works', body);
  };

  window.plModalNote = function (title, html, plain) {
    var n = el('plm-note-overlay');
    n.innerHTML =
      '<div class="plm-note-box">' +
        '<button class="plm-note-x" onclick="plCloseNote()" aria-label="Close"><i class="fas fa-xmark"></i></button>' +
        '<h3>' + esc(title) + '</h3>' + html +
        (plain ? '' : '<button class="plm-rbtn" style="margin-top:18px;" onclick="plCloseNote();plOpenForm(\'value\')">Get a real valuation from John</button>') +
      '</div>';
    n.classList.add('open');
  };
  window.plCloseNote = function () { el('plm-note-overlay').classList.remove('open'); };

  // ---- nearby recorded sales ----
  function paintComps(list) {
    var host = el('plm-comps-sec');
    if (!host) return;
    if (!list || !list.length) {
      host.innerHTML = '';
      return;
    }
    var top = list.slice(0, 12);
    host.innerHTML = gate('comps',
      'Unlock nearby recorded sales',
      'Every deed recorded near this address in the last six years, with sale price, assessed value, year built, and lot size.',
      '<h3 class="plm-sec-h">Recorded sales near this home</h3>' +
      '<p class="plm-sec-s">Actual deeds recorded nearby, newest first. These come from the state file, so they are real closed transfers, not listings. Sale prices lag by roughly a year.</p>' +
      '<div class="comps-wrap"><table class="comps"><thead><tr>' +
        '<th>Address</th><th>Sold</th><th>Price</th><th>Assessed</th><th>Built</th><th>Lot</th>' +
      '</tr></thead><tbody>' +
      top.map(function (c) {
        return '<tr><td><b>' + esc(c.addr) + '</b></td>' +
          '<td>' + c.year + '</td>' +
          '<td class="num">' + money(c.price) + '</td>' +
          '<td class="num">' + (c.assessed ? money(c.assessed) : '-') + '</td>' +
          '<td>' + (c.built || '-') + '</td>' +
          '<td class="num">' + (c.acres ? c.acres.toFixed(2) + ' ac' : '-') + '</td></tr>';
      }).join('') +
      '</tbody></table></div>' +
      '<div class="comps-cta">' +
        '<div><b>' + list.length + ' recorded sales nearby.</b> Want the ones that actually matter, with condition, upgrades, and days on market? That takes MLS access.</div>' +
        '<button class="plm-rbtn" style="width:auto;padding:12px 20px;" onclick="plOpenForm(\'comps\')">Send me the real comps</button>' +
      '</div>');
  }

  // ---- neighborhood context ----
  function paintHood(h, assessed, tax) {
    var host = el('plm-hood-sec');
    if (!host || !h) { if (host) host.innerHTML = ''; return; }
    function delta(mine, med) {
      if (!mine || !med) return '';
      var d = ((mine - med) / med) * 100;
      var c = Math.abs(d) < 5 ? '#5a6070' : (d > 0 ? 'var(--red)' : 'var(--green)');
      return '<span style="color:' + c + ';font-weight:700;">' + (d > 0 ? '+' : '') + d.toFixed(0) + '%</span>';
    }
    host.innerHTML = gate('hood',
      'Compare this home to its neighbors',
      'Median assessed value, tax bill, year built, and lot size across the residential parcels around it, with the gap on each one.',
      '<h3 class="plm-sec-h">How this home compares nearby</h3>' +
      '<p class="plm-sec-s">Median of ' + h.n + ' residential parcels within about a third of a mile.</p>' +
      '<div class="plm-kpis">' +
        '<div class="plm-kpi"><div class="plm-kpi-n">' + (h.medAssessed ? money(h.medAssessed) : '-') + '</div>' +
          '<div class="plm-kpi-l">Median assessed<br>' + delta(assessed, h.medAssessed) + ' vs this home</div></div>' +
        '<div class="plm-kpi"><div class="plm-kpi-n gold">' + (h.medTax ? money(h.medTax) : '-') + '</div>' +
          '<div class="plm-kpi-l">Median tax bill<br>' + delta(tax, h.medTax) + ' vs this home</div></div>' +
        '<div class="plm-kpi"><div class="plm-kpi-n">' + (h.medYear || '-') + '</div><div class="plm-kpi-l">Median year built</div></div>' +
        '<div class="plm-kpi"><div class="plm-kpi-n">' + (h.medAcres ? h.medAcres.toFixed(2) : '-') + '</div><div class="plm-kpi-l">Median lot, acres</div></div>' +
      '</div>' +
      (tax && h.medTax && tax > h.medTax * 1.15
        ? '<div class="plm-alert warn" style="margin-top:16px;"><i class="fas fa-scale-unbalanced"></i><div>' +
          '<b>This home pays about ' + Math.round((tax / h.medTax - 1) * 100) + '% more than its neighbors.</b> ' +
          'Sometimes that is a bigger or nicer house. Sometimes it is an assessment nobody ever challenged. ' +
          '<a href="#" onclick="plScrollTo(\'pl-appeal\');return false;">Worth a look</a>.</div></div>'
        : ''));
  }

  // ══════════════════════════════════════════════
  // WATCHDOG SCORE
  //
  // A 0 to 100 read on whether this property looks over-assessed relative to
  // what the Watchdog Valuation says it is worth, framed the way a NJ tax
  // appeal actually gets decided.
  //
  // Chapter 123: an assessment survives if it sits at or below true market
  // value times the town ratio times 1.15. Above that upper limit, the county
  // board is supposed to reduce it. So the score is really "how far past the
  // upper limit is this assessment".
  // ══════════════════════════════════════════════
  function watchdogScore(assessed, val, comps) {
    // Legacy peer-comparison helper retained only for compatibility. It is not
    // a Chapter 123 calculation and it never marks a property as appealable.
    if (!assessed || !comps || comps.length < 10 || !val) return null;
    var subjBuilt = (current && current.yearBuilt) ? +current.yearBuilt : 0;
    var subjAcres = (current && current.acres) ? +current.acres : 0;
    var peers = comps.filter(function (c) {
      if (!c.assessed || c.assessed < 10000) return false;
      if (subjBuilt && c.built && Math.abs(c.built - subjBuilt) > 18) return false;
      if (subjAcres && c.acres && (c.acres < subjAcres * 0.5 || c.acres > subjAcres * 2.0)) return false;
      return true;
    });
    if (peers.length < 8) peers = comps.filter(function (c) { return c.assessed && c.assessed > 10000; });
    if (peers.length < 8) return null;
    var medPeer = median(peers.map(function (c) { return c.assessed; }));
    if (!medPeer) return null;
    var gap = (assessed - medPeer) / medPeer;
    var score = Math.round(50 + Math.max(-45, Math.min(45, gap * 180)));
    var band = gap > 0.15 ? 'bad' : gap > 0.05 ? 'warn' : gap < -0.10 ? 'good' : 'ok';
    var label = gap > 0.15 ? 'Assessed well above peers' : gap > 0.05 ? 'Slightly above peers' : gap < -0.10 ? 'Assessed below peers' : 'In line with peers';
    var blurb = 'Peer-assessment comparison only. This can flag an unusual assessment, but it is not a Chapter 123 test and does not establish appeal eligibility or savings.';
    return {
      score: score, band: band, label: label, blurb: blurb,
      peerCount: peers.length, medPeer: medPeer, fair: medPeer, upper: null,
      over: assessed - medPeer, overPct: gap, market: val.mid, ratio: val.ratio,
      appealable: false, peerOnly: true
    };
  }

  // Annual dollars an appeal down to the fair assessment would save.
  function appealSavings(sc, tax, assessed) {
    if (!sc || !tax || !assessed || !sc.appealable) return null;
    var effRate = tax / assessed;                       // dollars of tax per dollar assessed
    var target = sc.fair;                               // what it should be
    var annual = (assessed - target) * effRate;
    if (annual < 150) return null;                      // not worth anyone's time
    return { annual: annual, target: target, fiveYear: annual * 5 };
  }

  function paintScore(sc, tax, assessed) {
    var host = el('plm-score-sec');
    if (!host) { return; }
    if (!sc) { host.innerHTML = ''; return; }

    var COL = { bad: '#c0392b', warn: '#b8972a', ok: '#2e7d52', good: '#1e6b3a' };
    var col = COL[sc.band] || '#5a6070';
    var save = appealSavings(sc, tax, assessed);

    // gauge geometry: 180 degree arc
    var pctOf = Math.max(0, Math.min(100, sc.score)) / 100;
    var ang = Math.PI * (1 - pctOf);
    var cx = 130, cy = 118, rad = 92;
    var nx = cx + rad * Math.cos(ang), ny = cy - rad * Math.sin(ang);

    host.innerHTML =
      '<h3 class="plm-sec-h">Watchdog Score</h3>' +
      '<p class="plm-sec-s">How this assessment compares to genuinely similar homes nearby, matched on vintage and lot size. This is a peer-assessment signal, not a Chapter 123 statutory test.</p>' +
      '<div class="score-wrap">' +
        '<div class="score-gauge">' +
          '<svg viewBox="0 0 260 150" role="img" aria-label="Watchdog Score ' + sc.score + '">' +
            '<defs><linearGradient id="scg" x1="0" y1="0" x2="1" y2="0">' +
              '<stop offset="0%" stop-color="#1e6b3a"/><stop offset="45%" stop-color="#2e7d52"/>' +
              '<stop offset="68%" stop-color="#b8972a"/><stop offset="100%" stop-color="#c0392b"/>' +
            '</linearGradient></defs>' +
            '<path d="M38 118 A92 92 0 0 1 222 118" fill="none" stroke="#eef0f5" stroke-width="17" stroke-linecap="round"/>' +
            '<path d="M38 118 A92 92 0 0 1 222 118" fill="none" stroke="url(#scg)" stroke-width="17" stroke-linecap="round" opacity="0.9"/>' +
            '<line x1="' + cx + '" y1="' + cy + '" x2="' + nx.toFixed(1) + '" y2="' + ny.toFixed(1) + '" stroke="#0e2248" stroke-width="4" stroke-linecap="round"/>' +
            '<circle cx="' + cx + '" cy="' + cy + '" r="8" fill="#0e2248"/>' +
            '<text x="38" y="142" font-size="10" fill="#8a93a6">Under</text>' +
            '<text x="222" y="142" font-size="10" fill="#8a93a6" text-anchor="end">Over</text>' +
          '</svg>' +
          '<div class="score-num" style="color:' + col + '">' + sc.score + '</div>' +
          '<div class="score-lbl" style="color:' + col + '">' + esc(sc.label) + '</div>' +
        '</div>' +
        '<div class="score-body">' +
          '<p>' + esc(sc.blurb) + '</p>' +
          '<div class="score-rows">' +
            '<div class="score-row"><span>This assessment</span><b>' + money(assessed) + '</b></div>' +
            '<div class="score-row"><span>Median of ' + sc.peerCount + ' comparable homes nearby</span><b>' + money(sc.medPeer) + '</b></div>' +
            '<div class="score-row"><span>Difference from peer median</span><b>' + (sc.over > 0 ? '+' : '') + money(sc.over) + '</b></div>' +
            (current.valuation && current.valuation.ratioSource === 'official'
              ? '<div class="score-row"><span>Official ratio, tax year ' + current.valuation.ratioYear + '</span><b>' +
                (current.valuation.ratio * 100).toFixed(2) + '%</b></div>' : '') +
          '</div>' +
          (save
            ? '<div class="score-save">' +
                '<div class="score-save-n">' + money(save.annual) + '<span>/yr</span></div>' +
                '<div class="score-save-l">Estimated tax savings if the assessment came down to fair value. ' +
                  'That is about <b>' + money(save.fiveYear) + '</b> over five years.</div>' +
                '<button class="plm-rbtn" onclick="plOpenForm(\'appeal\')">See if I can win this appeal</button>' +
              '</div>'
            : '<button class="plm-rbtn ghost" style="margin-top:14px;" onclick="plOpenForm(\'value\')">Have John double check this</button>') +
        '</div>' +
      '</div>' +
      '<div class="score-fine">Peer-comparison screening only. It does not establish a Chapter 123 limit or appeal eligibility. ' +
      'This is not legal, tax, appraisal, or certified comparative market analysis advice. Verify current records and independent market-value evidence before filing.</div>';
  }

  // ══════════════════════════════════════════════
  // OWNERSHIP TIMELINE
  // ══════════════════════════════════════════════
  function paintTimeline(v) {
    var host = el('plm-timeline-sec');
    if (!host) return;
    if (!v || !v.mid || !current.sale || current.sale < 1000 || !current.deedYear) { host.innerHTML = ''; return; }

    var y0 = current.deedYear, y1 = new Date().getFullYear();
    var span = y1 - y0;
    if (span < 1) { host.innerHTML = ''; return; }

    var p0 = current.sale, p1 = v.mid;
    var cagr = Math.pow(p1 / p0, 1 / span) - 1;
    var pts = [];
    for (var y = y0; y <= y1; y++) pts.push({ y: y, v: p0 * Math.pow(1 + cagr, y - y0) });

    var W = 620, H = 190, PL = 62, PR = 14, PT = 18, PB = 30;
    var iw = W - PL - PR, ih = H - PT - PB;
    var maxV = p1 * 1.06, minV = Math.min(p0, p1) * 0.9;
    var X = function (i) { return PL + (i / (pts.length - 1)) * iw; };
    var Y = function (val) { return PT + ih - ((val - minV) / (maxV - minV || 1)) * ih; };

    var line = pts.map(function (p, i) { return (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(p.v).toFixed(1); }).join(' ');
    var area = line + ' L' + X(pts.length - 1).toFixed(1) + ' ' + (PT + ih) + ' L' + X(0).toFixed(1) + ' ' + (PT + ih) + ' Z';

    var grid = '';
    for (var g = 0; g <= 2; g++) {
      var gv = minV + (maxV - minV) * (g / 2), gy = Y(gv);
      grid += '<line x1="' + PL + '" y1="' + gy.toFixed(1) + '" x2="' + (W - PR) + '" y2="' + gy.toFixed(1) + '" stroke="#eef0f5"/>' +
              '<text x="' + (PL - 8) + '" y="' + (gy + 4).toFixed(1) + '" text-anchor="end" font-size="10" fill="#8a93a6">$' + Math.round(gv / 1000) + 'k</text>';
    }

    var gain = p1 - p0, gainPct = (gain / p0) * 100;

    host.innerHTML =
      '<h3 class="plm-sec-h">What this home has done since ' + y0 + '</h3>' +
      '<p class="plm-sec-s">From the recorded ' + y0 + ' sale price to today\u2019s Watchdog Valuation. The path between them is smoothed, not measured year by year.</p>' +
      '<div class="pl-card">' +
        '<div class="tl-kpis">' +
          '<div><div class="tl-n">' + money(p0) + '</div><div class="tl-l">Paid in ' + y0 + '</div></div>' +
          '<div><div class="tl-n">' + money(p1) + '</div><div class="tl-l">Estimated today</div></div>' +
          '<div><div class="tl-n" style="color:' + (gain >= 0 ? 'var(--green)' : 'var(--red)') + '">' +
            (gain >= 0 ? '+' : '') + money(gain) + '</div><div class="tl-l">Change over ' + span + ' years</div></div>' +
          '<div><div class="tl-n">' + (cagr * 100).toFixed(1) + '%</div><div class="tl-l">Average per year</div></div>' +
        '</div>' +
        '<svg class="pl-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Value since purchase">' +
          '<defs><linearGradient id="tlg" x1="0" y1="0" x2="0" y2="1">' +
            '<stop offset="0%" stop-color="#b8972a" stop-opacity=".30"/><stop offset="100%" stop-color="#b8972a" stop-opacity="0"/>' +
          '</linearGradient></defs>' + grid +
          '<path d="' + area + '" fill="url(#tlg)"/>' +
          '<path d="' + line + '" fill="none" stroke="#b8972a" stroke-width="2.6" stroke-linecap="round"/>' +
          '<circle cx="' + X(0).toFixed(1) + '" cy="' + Y(p0).toFixed(1) + '" r="4.5" fill="#fff" stroke="#b8972a" stroke-width="2.5"/>' +
          '<circle cx="' + X(pts.length - 1).toFixed(1) + '" cy="' + Y(p1).toFixed(1) + '" r="5.5" fill="#0e2248" stroke="#fff" stroke-width="2.5"/>' +
          '<text x="' + X(0).toFixed(1) + '" y="' + (H - 10) + '" font-size="10.5" fill="#8a93a6" text-anchor="middle">' + y0 + '</text>' +
          '<text x="' + X(pts.length - 1).toFixed(1) + '" y="' + (H - 10) + '" font-size="10.5" fill="#8a93a6" text-anchor="middle">' + y1 + '</text>' +
        '</svg>' +
        '<div class="tl-cta">' +
          '<div><b>' + (gainPct >= 0 ? 'Up ' + gainPct.toFixed(0) + '%' : 'Down ' + Math.abs(gainPct).toFixed(0) + '%') +
          ' since you bought.</b> Whether that is worth acting on depends on what you would net after commission, the NJ transfer fee, and your payoff.</div>' +
          '<button class="plm-rbtn" style="width:auto;padding:12px 20px;" onclick="plScrollTo(\'pl-proceeds\')">Run my net proceeds</button>' +
        '</div>' +
      '</div>';
  }


  // ══════════════════════════════════════════════
  // DIAGNOSTICS  ·  add ?debug=1 to the URL
  // Shows exactly what the state service returned so a bad estimate can be
  // traced to the data instead of guessed at.
  // ══════════════════════════════════════════════
  function paintDiag(subject, comps, val, town) {
    if (new URLSearchParams(location.search).get('debug') !== '1') return;
    var host = el('plm-diag-sec');
    if (!host) return;
    var thisYear = new Date().getFullYear();
    var rows = (comps || []).slice(0, 40).map(function (c) {
      var m = (c.price && c.assessed) ? (c.price / c.assessed) : null;
      return '<tr><td>' + esc(c.addr) + '</td><td>' + (c.year || '-') + '</td>' +
        '<td class="num">' + (c.price ? money(c.price) : '-') + '</td>' +
        '<td class="num">' + (c.assessed ? money(c.assessed) : '-') + '</td>' +
        '<td class="num"><b>' + (m ? m.toFixed(2) + 'x' : '-') + '</b></td>' +
        '<td class="num">' + (c.dist != null ? Math.round(c.dist) : '-') + '</td></tr>';
    }).join('');
    var mults = (comps || []).filter(function (c) { return c.price > 60000 && c.assessed; })
                             .map(function (c) { return c.price / c.assessed; });
    host.innerHTML =
      '<h3 class="plm-sec-h">Diagnostics</h3>' +
      '<p class="plm-sec-s">Raw data from the state service. Only visible with ?debug=1 on the URL.</p>' +
      '<div class="pl-card" style="font-size:13px;">' +
        '<div><b>Subject</b>: assessed ' + money(subject.assessed) + ', built ' + (subject.built || '?') +
          ', ' + (subject.acres || '?') + ' ac</div>' +
        '<div><b>Comps returned</b>: ' + (comps || []).length + ', usable ' + mults.length + '</div>' +
        '<div><b>Median price/assessed multiplier</b>: ' + (mults.length ? median(mults).toFixed(3) + 'x' : 'n/a') + '</div>' +
        '<div><b>SR1A district</b>: ' + esc(districtCode(p) || 'none') +
          (sr1aTable && districtCode(p) && sr1aTable[districtCode(p)]
            ? '  ratio ' + (sr1aTable[districtCode(p)].ratio * 100).toFixed(2) + '%, n=' + sr1aTable[districtCode(p)].n +
              ', median $/sqft ' + (sr1aTable[districtCode(p)].ppsf || '-')
            : '  <b style="color:#c0392b">not in the SR1A table</b>') + '</div>' +
        '<div><b>Ratio used</b>: ' + (val ? (val.ratio * 100).toFixed(2) + '% (' + val.ratioSource +
            (val.ratioN ? ', n=' + val.ratioN + ' over ' + val.ratioMonths + ' months' : ', ' + val.ratioYear) + ')' : 'none') + '</div>' +
        '<div><b>Listing key tried</b>: ' + esc(normAddr(current.address) + '|' + (current.county || '').toUpperCase()) +
          '  <b>matched</b>: ' + (current.status && current.status !== 'Not known' ? current.status : 'no') + '</div>' +
        '<div><b>Deed date parse rate</b>: ' +
          (val && val.ratioStats
            ? val.ratioStats.dated + ' of ' + val.ratioStats.raw + ' rows (' +
              Math.round(val.ratioStats.dated / Math.max(val.ratioStats.raw, 1) * 100) + '%)' +
              (val.ratioStats.dated / Math.max(val.ratioStats.raw, 1) < 0.5 ? '  <b style="color:#c0392b">LOW, parser is missing a format</b>' : '')
            : 'n/a') + '</div>' +
        '<div><b>Ratio scope</b>: ' + (val && val.ratioScope ? val.ratioScope : 'n/a') +
          (val && val.ratioStats ? '  raw rows ' + val.ratioStats.raw + ', with parseable deed dates ' + val.ratioStats.dated +
            (val.ratioStats.townRaw != null ? '  (town first tried: ' + val.ratioStats.townRaw + ' raw, ' + val.ratioStats.townDated + ' dated)' : '')
            : '') + '</div>' +
        '<div><b>Sale price appreciation applied</b>: ' +
          (val && val.appreciation != null
            ? (val.appreciation * 100).toFixed(2) + '%/yr (' + esc(val.appreciationSource || 'none') + ')' +
              (val.appreciationSource === 'none' ? ' — no trend adjustment because evidence was insufficient' : '') +
              ', median sale age ' + (val.medSaleAge != null ? val.medSaleAge.toFixed(2) + ' yrs' : '?')
            : 'n/a') + '</div>' +
        '<div><b>Calibration factor</b>: ' + (val ? val.calibration.toFixed(3) : '-') +
          '  <b>Years stale</b>: ' + (val ? (val.yearsStale || 0).toFixed(2) : '-') + '</div>' +
        '<div><b>Drift</b>: ' + (val && val.drift != null ? (val.drift * 100).toFixed(2) + '%/yr' : 'not measured') +
          '  <b>Time factor</b>: ' + (val ? val.timeFactor.toFixed(3) : '-') +
          '  <b>Property adj</b>: ' + (val ? val.adjFactor.toFixed(3) : '-') + '</div>' +
        '<div><b>Base before adjustments</b>: ' + (val ? money(val.base) : '-') + '</div>' +
        (function () {
          var o = officialRatio(current.town, current.county);
          if (!o) return '<div><b>Official ratio</b>: none on file for this town</div>';
          var used = val ? val.ratio : null;
          var dir = (used && used > o.ratio)
            ? '  <b style="color:#c0392b">live above official, which means stale sales</b>' : '';
          return '<div><b>Official ratio</b>: ' + (o.ratio * 100).toFixed(2) + '% (tax year ' + o.year + ')' +
                 (used ? '   <b>ratio actually used</b>: ' + (used * 100).toFixed(2) + '%' + dir : '') + '</div>';
        })() +
        '<div style="margin-top:12px;" class="comps-wrap"><table class="comps"><thead><tr>' +
          '<th>Address</th><th>Yr</th><th>Sale</th><th>Assessed</th><th>Mult</th><th>Dist m</th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '</div>';
  }

  // ══════════════════════════════════════════════
  // NEIGHBORHOOD VIEW
  //
  // After a lookup, the page behind the panel becomes a map with the
  // surrounding properties listed beside it. Closing the panel drops you back
  // here rather than at an empty search box, so comparing four houses on a
  // street is four clicks instead of four searches.
  //
  // These are NOT listings. There is no free feed of what is for sale in New
  // Jersey. Every card here is a parcel from the state assessment file, which
  // is the right data for comps anyway: it covers every house, not only the
  // ones currently on the market.
  // ══════════════════════════════════════════════
  var hoodMap = null, hoodItems = [], hoodMarkers = {}, hoodSort = 'near';

  // ══════════════════════════════════════════════
  // BASEMAP STYLES
  // All free, no API key, no attribution beyond the credit line. Positron is
  // the default because a pale map lets the price markers carry the colour;
  // a busy basemap and coloured pins fight each other.
  // ══════════════════════════════════════════════
  var HOOD_STYLES = {
    light: { name: 'Light',
      url: 'https://{s}.basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}{r}.png',
      sub: 'abcd', attr: '&copy; OpenStreetMap, &copy; CARTO', max: 20 },
    streets: { name: 'Streets',
      url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
      sub: 'abcd', attr: '&copy; OpenStreetMap, &copy; CARTO', max: 20 },
    satellite: { name: 'Satellite',
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      sub: '', attr: 'Imagery &copy; Esri', max: 19 },
    dark: { name: 'Dark',
      url: 'https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png',
      sub: 'abcd', attr: '&copy; OpenStreetMap, &copy; CARTO', max: 20 }
  };
  var hoodStyle = 'light', hoodTiles = null;

  window.plHoodStyle = function (k) {
    if (!HOOD_STYLES[k] || !hoodMap) return;
    hoodStyle = k;
    try { localStorage.setItem('pl_mapstyle', k); } catch (e) {}
    if (hoodTiles) hoodMap.removeLayer(hoodTiles);
    var st = HOOD_STYLES[k];
    hoodTiles = L.tileLayer(st.url, { maxZoom: st.max, subdomains: st.sub, attribution: st.attr });
    hoodTiles.addTo(hoodMap);
    hoodTiles.bringToBack();
    document.querySelectorAll('.hd-style button').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-s') === k);
    });
    document.body.classList.toggle('map-dark', k === 'dark' || k === 'satellite');
  };

  function styleSwitch() {
    return '<div class="hd-style">' +
      Object.keys(HOOD_STYLES).map(function (k) {
        return '<button data-s="' + k + '"' + (k === hoodStyle ? ' class="on"' : '') +
          ' onclick="plHoodStyle(\'' + k + '\')">' + HOOD_STYLES[k].name + '</button>';
      }).join('') + '</div>';
  }

  // A price pill with the watchdog mark, rather than a dot. The number is the
  // annual tax, because that is what this site is actually about and it is the
  // figure people compare between houses.
  function hoodPin(x, me) {
    var v = x.tax ? '$' + (x.tax >= 10000 ? Math.round(x.tax / 1000) + 'k'
                                          : (Math.round(x.tax / 100) / 10) + 'k') : '-';
    return L.divIcon({
      className: 'hd-pin-wrap',
      html: '<div class="hd-pin' + (me ? ' me' : '') + '">' +
              '<svg viewBox="0 0 24 24" class="hd-dog"><path fill="currentColor" d="M4.5 3.5c0-.8.9-1.3 1.6-.9l2.2 1.4h6.4l2.2-1.4c.7-.4 1.6.1 1.6.9v3.9c1 .9 1.5 2.2 1.5 3.6v5.6c0 2.4-2 4.4-4.4 4.4H7.4C5 21 3 19 3 16.6V11c0-1.4.5-2.7 1.5-3.6V3.5Zm4 7.3c-.6 0-1 .5-1 1.1v.6c0 .6.4 1.1 1 1.1s1-.5 1-1.1v-.6c0-.6-.4-1.1-1-1.1Zm7 0c-.6 0-1 .5-1 1.1v.6c0 .6.4 1.1 1 1.1s1-.5 1-1.1v-.6c0-.6-.4-1.1-1-1.1Zm-4.7 5.1c.4.5 1 .8 1.7.8s1.3-.3 1.7-.8a.6.6 0 0 0-.9-.8c-.2.2-.5.4-.8.4s-.6-.2-.8-.4a.6.6 0 0 0-.9.8Z"/></svg>' +
              '<span>' + v + '</span>' +
            '</div>',
      iconSize: [64, 26], iconAnchor: [32, 26], popupAnchor: [0, -24]
    });
  }


  function hoodStreet(a, w, h) {
    var loc = (a.lat != null && a.lon != null) ? (a.lat + ',' + a.lon) : [a.addr, a.town, 'NJ', a.zip].filter(Boolean).join(', ');
    return 'https://maps.googleapis.com/maps/api/streetview?size=' + w + 'x' + h +
           '&location=' + encodeURIComponent(loc) + '&fov=78&pitch=6&source=outdoor&key=' + GMAPS_KEY;
  }

  // Every residential parcel around the subject, with its public figures.
  function hoodParcels(lat, lon, meters) {
    var dLat = meters / 111320, dLon = meters / (111320 * Math.cos(lat * Math.PI / 180));
    var p = new URLSearchParams({
      geometry: JSON.stringify({ xmin: lon - dLon, ymin: lat - dLat, xmax: lon + dLon, ymax: lat + dLat,
                                 spatialReference: { wkid: 4326 } }),
      geometryType: 'esriGeometryEnvelope', inSR: '4326', outSR: '4326',
      spatialRel: 'esriSpatialRelIntersects',
      where: "PROP_CLASS = '2' AND NET_VALUE > 10000",
      outFields: 'PAMS_PIN,PROP_LOC,MUN_NAME,COUNTY,ZIP5,PCLBLOCK,PCLLOT,NET_VALUE,LAST_YR_TX,' +
                 'YR_CONSTR,CALC_ACRE,SALE_PRICE,DEED_DATE',
      returnGeometry: 'false', returnCentroid: 'true', resultRecordCount: '80', f: 'json'
    });
    return xfetch(NJ_PARCEL + '?' + p, 15000).then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d.features) return [];
        return d.features.map(function (f) {
          var a = f.attributes, c = f.centroid || {};
          var dist = null;
          if (c.x != null) {
            var dx = (c.x - lon) * 111320 * Math.cos(lat * Math.PI / 180);
            var dy = (c.y - lat) * 111320;
            dist = Math.sqrt(dx * dx + dy * dy);
          }
          var av = +a.NET_VALUE || 0, tax = +a.LAST_YR_TX || 0;
          return {
            pin: a.PAMS_PIN, addr: a.PROP_LOC || '', town: a.MUN_NAME || '',
            county: a.COUNTY || '', zip: a.ZIP5 || '',
            block: a.PCLBLOCK, lot: a.PCLLOT,
            assessed: av, tax: tax, built: +a.YR_CONSTR || null,
            acres: +a.CALC_ACRE || null, sale: +a.SALE_PRICE || 0,
            saleYear: deedYear(a.DEED_DATE),
            lat: c.y, lon: c.x, dist: dist,
            rate: av ? (tax / av) * 100 : null
          };
        })
        // Keep it to the immediate blocks. A map with 150 dots is a heat map,
        // not a comparison, and nobody scrolls 150 cards.
        .filter(function (x) { return x.addr && x.dist != null && x.dist <= 500; })
        .sort(function (a, b) { return a.dist - b.dist; })
        .slice(0, 24);
      }).catch(function () { return []; });
  }

  // Market value from the SR1A verified ratio, so the cards show what these
  // homes are actually worth rather than only what they are assessed at.
  function hoodValue(x) {
    if (!sr1aTable) return null;
    var d = String(x.pin || '').slice(0, 4);
    var row = d && sr1aTable[d];
    if (!row || !row.ratio || !x.assessed) return null;
    return x.assessed / row.ratio;
  }

  // ── which parcels the user has already saved, so hearts render filled ──
  var hoodSaved = {};

  function loadHoodSaved() {
    if (!plUser || !sb) return Promise.resolve();
    return sb.from('saved_properties').select('pams_pin,kind').then(function (r) {
      hoodSaved = {};
      (r.data || []).forEach(function (x) { hoodSaved[x.pams_pin] = x.kind; });
    }).catch(function () {});
  }

  // Save straight from a card. No need to open the property first.
  window.plHoodSave = function (pin, ev) {
    if (ev) ev.stopPropagation();
    if (!plUser) { plSignInPrompt(); return; }
    var x = null;
    for (var i = 0; i < hoodItems.length; i++) if (hoodItems[i].pin === pin) x = hoodItems[i];
    if (!x) return;

    if (hoodSaved[pin]) {
      sb.from('saved_properties').delete().eq('pams_pin', pin).then(function () {
        delete hoodSaved[pin];
        paintHoodList();
        toast('Removed from your wishlist');
      });
      return;
    }
    sb.rpc('save_property', { p: {
      kind: 'watch', pams_pin: pin, address: x.addr, town: x.town, county: x.county,
      zip: x.zip, block: x.block, lot: x.lot,
      assessed: x.assessed || null, last_year_tax: x.tax || null,
      effective_rate: x.rate ? +x.rate.toFixed(3) : null,
      watchdog_value: hoodValue(x) ? Math.round(hoodValue(x)) : null,
      lat: x.lat != null ? +(+x.lat).toFixed(6) : null,
      lon: x.lon != null ? +(+x.lon).toFixed(6) : null
    } }).then(function (res) {
      if (res.error) { toast('Could not save'); return; }
      hoodSaved[pin] = 'watch';
      paintHoodList();
      toast('Added to your wishlist');
      if (typeof gtag === 'function') gtag('event', 'save_property', { kind: 'watch', from: 'map' });
    });
  };

  // ══════════════════════════════════════════════
  // FILTERS
  // The same fields the rest of the site curates on, so what you filter here
  // matches what you see everywhere else.
  // ══════════════════════════════════════════════
  var hoodF = { vMin: '', vMax: '', tMax: '', built: '', lot: '', appeal: false, sold: false };

  window.plHoodFilter = function (k, v) {
    hoodF[k] = (k === 'appeal' || k === 'sold') ? !hoodF[k] : v;
    paintHoodList();
  };
  window.plHoodReset = function () {
    hoodF = { vMin: '', vMax: '', tMax: '', built: '', lot: '', appeal: false, sold: false };
    buildHoodBar();
    paintHoodList();
  };

  function hoodPasses(x) {
    var v = hoodValue(x) || x.assessed;
    if (hoodF.vMin && v < +hoodF.vMin) return false;
    if (hoodF.vMax && v > +hoodF.vMax) return false;
    if (hoodF.tMax && x.tax > +hoodF.tMax) return false;
    if (hoodF.built && (!x.built || x.built < +hoodF.built)) return false;
    if (hoodF.lot && (!x.acres || x.acres * 43560 < +hoodF.lot)) return false;
    if (hoodF.sold && (!x.saleYear || (new Date().getFullYear() - x.saleYear) > 2)) return false;
    if (hoodF.appeal) {
      // over-assessed relative to its own neighbors, which is the signal that
      // matters and the one nobody else lets you filter on
      var med = hoodMedianRate();
      if (!med || !x.rate || x.rate <= med * 1.12) return false;
    }
    return true;
  }

  function hoodMedianRate() {
    var r = hoodItems.map(function (x) { return x.rate; }).filter(function (v) { return v > 0; });
    if (r.length < 5) return null;
    r.sort(function (a, b) { return a - b; });
    return r[r.length >> 1];
  }

  function sel(k, label, opts) {
    return '<select class="hf-s" onchange="plHoodFilter(\'' + k + '\', this.value)">' +
      '<option value="">' + label + '</option>' +
      opts.map(function (o) {
        return '<option value="' + o[0] + '"' + (String(hoodF[k]) === String(o[0]) ? ' selected' : '') +
          '>' + o[1] + '</option>';
      }).join('') + '</select>';
  }

  function buildHoodBar() {
    var bar = el('hd-bar');
    if (!bar) return;
    var n = hoodItems.filter(hoodPasses).length;
    var any = hoodF.vMin || hoodF.vMax || hoodF.tMax || hoodF.built || hoodF.lot || hoodF.appeal || hoodF.sold;

    bar.innerHTML =
      '<button class="hd-back" onclick="plHideHood()"><i class="fas fa-chevron-left"></i></button>' +
      sel('vMin', 'Value from', [[200000,'$200k'],[300000,'$300k'],[400000,'$400k'],[500000,'$500k'],[750000,'$750k']]) +
      sel('vMax', 'Value to', [[300000,'$300k'],[400000,'$400k'],[500000,'$500k'],[750000,'$750k'],[1000000,'$1M']]) +
      sel('tMax', 'Tax under', [[4000,'$4,000'],[6000,'$6,000'],[8000,'$8,000'],[10000,'$10,000'],[15000,'$15,000']]) +
      sel('built', 'Built after', [[1950,'1950'],[1970,'1970'],[1990,'1990'],[2000,'2000'],[2015,'2015']]) +
      sel('lot', 'Lot over', [[5000,'5,000 sq ft'],[10000,'10,000 sq ft'],[20000,'half acre'],[43560,'1 acre']]) +
      '<button class="hf-t' + (hoodF.appeal ? ' on' : '') + '" onclick="plHoodFilter(\'appeal\')">' +
        '<i class="fas fa-scale-unbalanced-flip"></i> Over-assessed</button>' +
      '<button class="hf-t' + (hoodF.sold ? ' on' : '') + '" onclick="plHoodFilter(\'sold\')">' +
        '<i class="fas fa-tag"></i> Sold recently</button>' +
      (any ? '<button class="hf-clr" onclick="plHoodReset()">Clear</button>' : '') +
      '<div class="hf-right">' +
        '<span class="hf-n">' + n + ' propert' + (n === 1 ? 'y' : 'ies') + '</span>' +
        '<select class="hf-s sort" onchange="plHoodSort(this.value)">' +
          '<option value="near">Closest</option>' +
          '<option value="valHigh">Highest value</option>' +
          '<option value="valLow">Lowest value</option>' +
          '<option value="taxHigh">Highest tax</option>' +
          '<option value="taxLow">Lowest tax</option>' +
          '<option value="rateHigh">Highest tax rate</option>' +
          '<option value="recent">Recently sold</option>' +
        '</select>' +
      '</div>';
  }

  // ── the Greentree unit. An ad, styled like one, not a property card. ──
  function hoodAd() {
    return '<a class="hd-ad" href="' + GREENTREE_URL + '" target="_blank" rel="noopener">' +
      '<span class="hd-ad-tag">Advertisement</span>' +
      '<img src="/johnvarano.jpg" alt="John Varano" onerror="this.style.display=\'none\'">' +
      '<div class="hd-ad-b">' +
        '<b>Know the payment before you fall in love with the house.</b>' +
        '<span>John Varano, Branch Manager at Greentree Mortgage, an HMA Company, will tell you what the ' +
        'real monthly number looks like, escrow included.</span>' +
        '<em>Get a rate <i class="fas fa-arrow-right"></i></em>' +
      '</div>' +
    '</a>';
  }

  window.plShowHood = function () {
    var w = elReal('pl-hood');
    // Never hide the page for a container that is missing or empty. A blank
    // screen with no way back is worse than not having the feature.
    if (!w || !w.innerHTML || w.innerHTML.length < 200) {
      document.body.classList.remove('hood-on');
      return;
    }
    w.classList.add('on');
    document.body.classList.add('hood-on');
    setTimeout(function () { if (hoodMap) hoodMap.invalidateSize(); }, 60);
  };
  window.plHideHood = function () {
    var w = el('pl-hood');
    if (w) w.classList.remove('on');
    document.body.classList.remove('hood-on');
  };

  function buildHood(centre, list) {
    hoodItems = list;
    window.__njwRows = list;
    var w = el('pl-hood');
    if (!w) return;

    w.innerHTML =
      '<div class="hd-bar" id="hd-bar"></div>' +
      '<div class="hd-split">' +
        '<div class="hd-map"><div id="hd-map"></div><div class="hd-stylebox" id="hd-stylebox"></div></div>' +
        '<div class="hd-right">' +
          '<div class="hd-head">' +
            '<h2>Homes near ' + esc(centre.town) + '</h2>' +
            '<p>Every property on these blocks, straight from New Jersey\u2019s assessment records. ' +
            'Not just what is for sale, which is what you want when you are comparing what a home is worth.</p>' +
          '</div>' +
          '<div class="hd-list" id="hd-list"></div>' +
        '</div>' +
      '</div>';

    buildHoodBar();
    drawHoodMap(centre, list);
    paintHoodList();
  }

  window.plHoodSort = function (k) { hoodSort = k; paintHoodList(); };

  function sortedHood() {
    var l = hoodItems.slice();
    var fns = {
      near:     function (a, b) { return a.dist - b.dist; },
      valHigh:  function (a, b) { return (hoodValue(b) || b.assessed) - (hoodValue(a) || a.assessed); },
      valLow:   function (a, b) { return (hoodValue(a) || a.assessed) - (hoodValue(b) || b.assessed); },
      taxHigh:  function (a, b) { return b.tax - a.tax; },
      taxLow:   function (a, b) { return a.tax - b.tax; },
      rateHigh: function (a, b) { return (b.rate || 0) - (a.rate || 0); },
      recent:   function (a, b) { return (b.saleYear || 0) - (a.saleYear || 0); }
    };
    return l.sort(fns[hoodSort] || fns.near);
  }

  function paintHoodList() {
    var host = el('hd-list');
    if (!host) return;
    var list = sortedHood();

    var shown = list.filter(hoodPasses);
    buildHoodBar();

    if (!shown.length) {
      host.innerHTML = '<div class="hd-none"><b>Nothing matches those filters</b>' +
        '<p>Try widening the value or tax range.</p>' +
        '<button class="hf-clr" onclick="plHoodReset()">Clear filters</button></div>';
      return;
    }

    var cards = shown.map(function (x) {
      var v = hoodValue(x);
      var isSubject = current && x.pin === current.pin;
      var saved = !!hoodSaved[x.pin];
      var idx = hoodItems.indexOf(x);
      return '<article class="hd-card' + (isSubject ? ' me' : '') + '" ' +
        'onmouseenter="plHoodHi(\'' + esc(x.pin) + '\',1)" onmouseleave="plHoodHi(\'' + esc(x.pin) + '\',0)" ' +
        'onclick="plHoodOpen(' + idx + ')">' +
        '<div class="hd-shot">' +
          '<img src="' + hoodStreet(x, 340, 200) + '" alt="" loading="lazy" ' +
            'onerror="this.parentNode.classList.add(\'noimg\')">' +
          '<button class="hd-heart' + (saved ? ' on' : '') + '" title="Save to wishlist" ' +
            'data-save-pin="' + esc(x.pin) + '" ' +
            'onclick="plHoodSave(\'' + esc(x.pin) + '\', event)">' +
            '<i class="' + (saved ? 'fas' : 'far') + ' fa-heart"></i></button>' +
          (isSubject ? '<span class="hd-badge me">Searched</span>' : '') +
          (!isSubject && x.saleYear && (new Date().getFullYear() - x.saleYear) <= 1
            ? '<span class="hd-badge sold">Sold ' + x.saleYear + '</span>' : '') +
        '</div>' +
        '<div class="hd-body">' +
          '<div class="hd-val">' + (v ? money(Math.round(v / 1000) * 1000) : money(x.assessed)) + '</div>' +
          '<div class="hd-meta">' +
            (x.built ? '<span>' + x.built + '</span>' : '') +
            (x.acres ? '<span>' + Math.round(x.acres * 43560 / 100) / 10 + 'k sq ft lot</span>' : '') +
            '<span>' + money(x.tax) + ' tax</span>' +
          '</div>' +
          '<div class="hd-addr">' + esc(x.addr) + '</div>' +
          '<div class="hd-sub">' + esc(x.town) + (x.zip ? ' ' + esc(x.zip) : '') + '</div>' +
        '</div>' +
      '</article>';
    });

    // drop the ad in after the first row, the way a real results page does
    if (cards.length > 3) cards.splice(3, 0, hoodAd());
    else cards.push(hoodAd());

    host.innerHTML = cards.join('') +
      '<p class="hd-note">These are parcels from New Jersey\u2019s public assessment file, not listings. ' +
      'There is no free feed of what is for sale in this state. For what is actually on the market, ' +
      '<a href="' + IDX_URL + '" target="_blank" rel="noopener">search the MLS</a>.</p>';
  }

  window.plHoodHi = function (pin, on) {
    var m = hoodMarkers[pin];
    if (!m || !m._icon) return;
    var pill = m._icon.querySelector('.hd-pin');
    if (pill) pill.classList.toggle('hi', !!on);
    if (on && m.setZIndexOffset) m.setZIndexOffset(1000);
    else if (m.setZIndexOffset) m.setZIndexOffset(0);
  };

  window.plHoodOpen = function (i) {
    var x = sortedHood()[i];
    if (!x) return;
    el('pl-addr').value = x.addr + ', ' + x.town + ', NJ ' + (x.zip || '');
    window.plLookup();
  };

  function drawHoodMap(centre, list) {
    if (typeof L === 'undefined' || !el('hd-map')) return;
    try {
      if (hoodMap) { hoodMap.remove(); hoodMap = null; }
      hoodMarkers = {}; hoodTiles = null;
      try { hoodStyle = localStorage.getItem('pl_mapstyle') || 'light'; } catch (e) {}
      if (!HOOD_STYLES[hoodStyle]) hoodStyle = 'light';

      hoodMap = L.map('hd-map', { zoomControl: true, scrollWheelZoom: true })
                 .setView([centre.lat, centre.lon], 16);
      var st = HOOD_STYLES[hoodStyle];
      hoodTiles = L.tileLayer(st.url, { maxZoom: st.max, subdomains: st.sub, attribution: st.attr });
      hoodTiles.addTo(hoodMap);
      document.body.classList.toggle('map-dark', hoodStyle === 'dark' || hoodStyle === 'satellite');

      var pts = [];
      list.forEach(function (x) {
        if (x.lat == null) return;
        var me = current && x.pin === current.pin;
        var mk = L.marker([x.lat, x.lon], { icon: hoodPin(x, me), riseOnHover: true }).addTo(hoodMap);
        var v = hoodValue(x);
        mk.bindTooltip('<b>' + esc(x.addr) + '</b><br>' +
          (v ? money(Math.round(v / 1000) * 1000) + ' est. value' : money(x.assessed) + ' assessed') +
          '<br>' + money(x.tax) + ' a year in tax', { direction: 'top', offset: [0, -22] });
        mk.on('click', function () {
          el('pl-addr').value = x.addr + ', ' + x.town + ', NJ ' + (x.zip || '');
          window.plLookup();
        });
        hoodMarkers[x.pin] = mk;
        pts.push([x.lat, x.lon]);
      });

      if (pts.length > 1) hoodMap.fitBounds(pts, { padding: [56, 56], maxZoom: 18 });
      if (hoodMap.getZoom() < 15) hoodMap.setZoom(16);

      var sw = el('hd-stylebox');
      if (sw) sw.innerHTML = styleSwitch();
      setTimeout(function () { if (hoodMap) hoodMap.invalidateSize(); }, 120);
    } catch (e) { console.warn('[watchdog] hood map:', e); }
  }

  // ══════════════════════════════════════════════
  // MODAL
  // ══════════════════════════════════════════════
  window.plCloseModal = function () {
    var sn = el('secnav'); if (sn) sn.classList.remove('on');
    // Closing returns to the homepage search. The neighborhood view only exists
    // if the user explicitly opened it, in which case keep its map sized correctly.
    setTimeout(function () { if (hoodMap) hoodMap.invalidateSize(); }, 260);
    el('plm-backdrop').classList.remove('open');
    el('plm').classList.remove('open');
    document.body.classList.remove('plm-locked');
    if (map) { try { map.remove(); } catch (e) {} map = null; }
  };
  function openModal() {
    el('plm-backdrop').classList.add('open');
    el('plm').classList.add('open');
    document.body.classList.add('plm-locked');
    el('plm-scroll').scrollTop = 0;
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && el('plm') && el('plm').classList.contains('open')) window.plCloseModal();
  });

  function fchip(icon, label) {
    return '<div class="plm-fchip"><i class="fas ' + icon + '"></i><b>' + label + '</b></div>';
  }
  function frow(k, v) {
    return v ? '<div class="plm-frow"><span class="plm-fk">' + k + '</span><span class="plm-fv">' + esc(v) + '</span></div>' : '';
  }
  // ══════════════════════════════════════════════
  // RENDER  ->  modal overlay
  // ══════════════════════════════════════════════
  function render(feat, geo, typed, lookupId) {
    var p = feat.attributes;
    var rings = (feat.geometry && feat.geometry.rings) ? feat.geometry.rings : null;

    var land = +p.LAND_VAL || 0, imprv = +p.IMPRVT_VAL || 0;
    var assessed = +p.NET_VALUE || 0;
    var tax = +p.LAST_YR_TX || 0;
    var rate = assessed > 0 ? (tax / assessed) * 100 : null;
    var dy = deedYear(p.DEED_DATE), sale = +p.SALE_PRICE || 0;
    var cls = (p.PROP_CLASS || '').trim().toUpperCase();
    var tenure = dy ? (new Date().getFullYear() - dy) : null;
    var acres = +p.CALC_ACRE || 0;
    var sqft = acres ? Math.round(acres * 43560) : 0;
    var mail = (p.ST_ADDRESS || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    var loc = (p.PROP_LOC || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    var absentee = !!(mail && loc && mail !== loc);
    var status = resolveStatus(p, dy);

    current = {
      address: p.PROP_LOC || typed, town: p.MUN_NAME || '', county: p.COUNTY || '', zip: p.ZIP5 || '',
      assessed: assessed, land: land, imprv: imprv, tax: tax, rate: rate,
      block: p.PCLBLOCK || '', lot: p.PCLLOT || '', qual: p.PCLQCODE || '', pin: p.PAMS_PIN || '',
      lat: geo.lat, lon: geo.lon, rings: rings, sale: sale, deedYear: dy, cls: cls,
      status: status ? status.label : 'Not known', acres: acres, sqft: sqft, yearBuilt: p.YR_CONSTR || '',
      lookupId: lookupId || lookupSeq
    };
    if (window.WatchdogPublicNav && typeof window.WatchdogPublicNav.remember === 'function') {
      window.WatchdogPublicNav.remember(current);
    }

    recordLookup(p, geo, rate, dy);
    var seen = timesSeen(p.PAMS_PIN || '');

    // ---------- photo strip ----------
    var bbox = bboxFor(), sv = streetUrl(geo.lat, geo.lon);
    el('plm-photos').innerHTML =
      '<div class="plm-photo">' +
        (status ? '<div class="plm-tag ' + status.cls + '" title="' + esc((status.detail && status.detail.note) || '') + '">' +
          '<span class="dot"></span>' + esc(status.label) +
          (status.detail && status.detail.price ? '  \u00b7  ' + money(status.detail.price) : '') +
        '</div>' : '') +
        '<img id="plm-photo-img" alt="View of ' + esc(current.address) + '" ' +
          'src="' + (sv || aerialUrl(bbox, 900, 600)) + '" onerror="plPhotoFail()">' +
        '<div class="plm-imgcredit" id="plm-credit">' + (sv ? 'Street level imagery, Google' : 'Aerial imagery, Esri World Imagery') + '</div>' +

      '</div>' +
      '<div class="plm-photo map-cell"><div id="plm-map"></div></div>' +
      '<div class="plm-quick">' +
        '<div class="plm-q"><i class="fas fa-building-columns"></i><div><b>' + (assessed ? money(assessed) : '-') + '</b><span>Assessed</span></div></div>' +
        '<div class="plm-q"><i class="fas fa-file-invoice-dollar"></i><div><b>' + (tax ? money(tax) : '-') + '</b><span>Annual tax</span></div></div>' +
        '<div class="plm-q"><i class="fas fa-percent"></i><div><b>' + (rate ? rate.toFixed(2) + '%' : '-') + '</b><span>Eff. rate</span></div></div>' +
        '<div class="plm-q"><i class="fas fa-hammer"></i><div><b>' + (p.YR_CONSTR || '-') + '</b><span>Built</span></div></div>' +
        '<div class="plm-q"><i class="fas fa-ruler-combined"></i><div><b>' + (sqft ? sqft.toLocaleString() : '-') + '</b><span>Lot sq ft</span></div></div>' +
        '<div class="plm-q" id="plm-q-living"><i class="fas fa-house"></i><div><b>-</b><span>Living sq ft</span></div></div>' +
        '<div class="plm-q"><i class="fas fa-map-pin"></i><div><b>' + esc((p.PCLBLOCK || '?') + ' / ' + (p.PCLLOT || '?')) + '</b><span>Block / Lot</span></div></div>' +
      '</div>';

    // ---------- headline ----------
    var chips = [];
    if (CLASSES[cls]) chips.push(fchip('fa-building-columns', CLASSES[cls]));
    if (p.YR_CONSTR) chips.push(fchip('fa-hammer', 'Built in ' + p.YR_CONSTR));
    if (sqft) chips.push(fchip('fa-ruler-combined', sqft.toLocaleString() + ' Sq Ft Lot'));
    if (p.DWELL > 0) chips.push(fchip('fa-door-open', p.DWELL + (p.DWELL == 1 ? ' Unit' : ' Units')));
    if (sale > 1000 && dy) chips.push(fchip('fa-clock-rotate-left', 'Sold ' + money(sale) + ' in ' + dy));

    var alert = '';
    if (cls === '4C') alert = '<div class="plm-alert warn"><i class="fas fa-triangle-exclamation"></i><div><b>Heads up.</b> This parcel is an apartment building with five or more units, so the figures cover the whole building rather than one unit. If you rent here, you may still qualify for the ANCHOR renter benefit of up to $700.</div></div>';
    else if (cls === '1') alert = '<div class="plm-alert warn"><i class="fas fa-seedling"></i><div><b>This is vacant land</b>, not a residence. The assessment reflects the lot only.</div></div>';
    else if (rate && rate > 3.2) alert = '<div class="plm-alert warn"><i class="fas fa-scale-unbalanced"></i><div><b>That effective rate is on the high side.</b> Anything over roughly 3 percent is worth a second look. Either the assessment is out of line with what the home would actually sell for, or a deduction is being missed.</div></div>';
    else if (tenure !== null && tenure >= 15) alert = '<div class="plm-alert info"><i class="fas fa-calendar-check"></i><div><b>Owned for ' + tenure + ' years.</b> If the assessment has not been revisited in that time, it is worth checking whether it still reflects reality.</div></div>';

    if (status && status.source === 'listed' && status.detail) {
      var d = status.detail;
      alert = '<div class="plm-alert info"><i class="fas fa-sign-hanging"></i><div><b>' + esc(status.label) + '</b>' +
        (d.price ? ' at ' + money(d.price) : '') + (d.mls ? '  \u00b7  MLS ' + esc(d.mls) : '') +
        (d.note ? '<br>' + esc(d.note) : '') +
        (d.office ? '<br><span style="font-size:12.5px;opacity:.8">Listed by ' + esc(d.office) + '</span>' : '') +
        (d.url ? '<br><a href="' + esc(d.url) + '">See the listing</a>' : '') +
        '<div class="mls-notice">' +
          'If this property is for sale and listed by a licensed real estate agent, this is not a direct solicitation of business. ' +
          'Listing information is provided for reference only and may not reflect current status. ' +
          'For full sales information on this and other properties, visit ' +
          '<a href="' + IDX_URL + '" target="_blank" rel="noopener">John Scafide, Realtor, serving New Jersey</a>.' +
        '</div>' +
        '</div></div>' + alert;
    }

    el('plm-head').innerHTML =
      '<div id="plm-estimate" class="plm-est loading">' +
        '<div class="plm-est-lbl"><i class="fas fa-dog"></i> Watchdog Tax Value</div>' +
        '<div class="plm-est-val">Checking your assessment<span class="plm-dots"></span></div>' +
        '<div class="plm-est-sub">Measuring what homes in your town actually sell for against what they are assessed at.</div>' +
      '</div>' +
      '<div class="plm-assessed">' +
        '<div class="plm-assessed-n">' + (assessed ? money(assessed) : 'None on file') + '</div>' +
        '<div class="plm-assessed-l">Assessed value' +
          '<button class="plm-why" onclick="plWhy()" aria-label="What is assessed value?">' +
            '<i class="fas fa-circle-question"></i> not the market value</button>' +
        '</div>' +
      '</div>' +
      '<div class="plm-addr">' + esc(current.address) + '<span>' + esc(current.town) +
        (current.county ? ', ' + esc(current.county) + ' County' : '') + (current.zip ? '  ' + esc(current.zip) : '') + '</span></div>' +
      '<div class="plm-chips">' + chips.join('') + '</div>' + alert;

    // ---------- body ----------
    el('plm-main').innerHTML =
      '<div class="plm-sec" style="margin-top:26px;">' +
        '<h3 class="plm-sec-h">Tax snapshot</h3>' +
        '<p class="plm-sec-s">The prior year billed amount from the state assessment file. Rates reset annually, so treat it as a ballpark.</p>' +
        '<div class="plm-kpis">' +
          '<div class="plm-kpi"><div class="plm-kpi-n gold">' + (tax ? money(tax) : '-') + '</div><div class="plm-kpi-l">Annual tax</div></div>' +
          '<div class="plm-kpi"><div class="plm-kpi-n">' + (tax ? money(tax / 12) : '-') + '</div><div class="plm-kpi-l">Per month</div></div>' +
          '<div class="plm-kpi"><div class="plm-kpi-n">' + (rate ? rate.toFixed(2) + '%' : '-') + '</div><div class="plm-kpi-l">Effective rate</div></div>' +
          '<div class="plm-kpi"><div class="plm-kpi-n">' + (rate && assessed ? '$' + (tax / assessed * 1000).toFixed(0) : '-') + '</div><div class="plm-kpi-l">Per $1k assessed</div></div>' +
          '<div class="plm-kpi" id="plm-equity"><div class="plm-kpi-n">-</div><div class="plm-kpi-l">Est. gain since sale</div></div>' +
        '</div>' +
      '</div>' +

      '<div class="plm-sec">' +
        '<h3 class="plm-sec-h">Charts</h3>' +
        '<div class="plm-chartgrid">' +
          '<div class="pl-card">' +
            '<h4 class="pl-card-h4">Where the assessment comes from</h4>' +
            '<div class="pl-card-s">Land versus everything built on it.</div>' +
            '<div id="pl-chart-split"></div>' +
          '</div>' +
          '<div class="pl-card">' +
            '<h4 class="pl-card-h4">Tax history</h4>' +
            '<div class="pl-card-s" id="pl-chart-tax-sub">Estimated annual bill by year.</div>' +
            '<div id="pl-chart-tax"></div>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div class="plm-sec">' +
        '<h3 class="plm-sec-h">Property details</h3>' +
        '<p class="plm-sec-s">Straight from the Division of Taxation MOD-IV record and the state parcel layer.</p>' +
        '<div class="plm-facts">' +
          '<div class="plm-fgroup"><h4>Assessment</h4>' +
            frow('Land value', land ? money(land) : '') +
            frow('Improvement value', imprv ? money(imprv) : '') +
            frow('Total assessed', assessed ? money(assessed) : '') +
            frow('Land share', (land && assessed) ? Math.round(land / assessed * 100) + '%' : '') +
            frow('Prior year tax', tax ? money(tax) : '') +
            frow('Effective rate', rate ? rate.toFixed(3) + '%' : '') +
          '</div>' +
          '<div class="plm-fgroup"><h4>Parcel</h4>' +
            frow('Block', p.PCLBLOCK) + frow('Lot', p.PCLLOT) + frow('Qualifier', p.PCLQCODE) +
            frow('Additional lots', p.ADD_LOTS1) +
            frow('Municipality', p.MUN_NAME) + frow('County', p.COUNTY) +
            frow('State parcel ID', p.PAMS_PIN) +
          '</div>' +
          '<div class="plm-fgroup"><h4>Structure and land</h4>' +
            frow('Property class', cls + (CLASSES[cls] ? '  ·  ' + CLASSES[cls] : '')) +
            frow('Building', p.BLDG_DESC) +
            frow('Land description', p.LAND_DESC) +
            frow('Acreage', acres ? acres.toFixed(3) + ' ac' : '') +
            frow('Lot size', sqft ? sqft.toLocaleString() + ' sq ft' : '') +
            frow('Year built', p.YR_CONSTR) +
            frow('Age', p.YR_CONSTR ? (new Date().getFullYear() - (+p.YR_CONSTR)) + ' years' : '') +
            frow('Dwelling units', p.DWELL > 0 ? p.DWELL : '') +
            frow('Commercial units', p.COMM_DWELL > 0 ? p.COMM_DWELL : '') +
          '</div>' +
          '<div class="plm-fgroup"><h4>Transfer history</h4>' +
            frow('Listing status', status ? status.label : '') +
            frow('Last sale price', sale > 1000 ? money(sale) : 'Not recorded') +
            frow('Sale year', dy || '') +
            frow('Years since transfer', tenure !== null ? tenure : '') +
            frow('Deed book / page', [p.DEED_BOOK, p.DEED_PAGE].filter(Boolean).join(' / ')) +
            frow('Assessed vs last sale', (sale > 1000 && assessed) ? (assessed >= sale ? '+' : '') + money(assessed - sale) : '') +
            frow('Owner mailing', absentee ? [p.ST_ADDRESS, p.CITY_STATE].filter(Boolean).join(', ') : 'Same as property') +
            frow('Times checked here', seen > 1 ? seen : '') +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div class="plm-sec">' +
        '<h3 class="plm-sec-h">What would you walk away with?</h3>' +
        '<p class="plm-sec-s">Net proceeds after commission, the NJ realty transfer fee, and everything else. Adjust anything and it moves live.</p>' +
        gate('proceeds',
          'Unlock the net proceeds calculator',
          'What you actually walk away with after commission, the NJ realty transfer fee, your payoff, and the 2025 seller fee change.',
          buildProceeds()) +
      '</div>' +

      '<div class="plm-sec" id="plm-score-sec">' + sectionLoading('Checking appeal evidence', 'Comparing this assessment with verified market evidence and current state rules.') + '</div>' +

      '<div class="plm-sec" id="plm-diag-sec"></div>' +

      '<div class="plm-sec" id="plm-rebate-sec">' + buildRebates(tax) + '</div>' +

      '<div class="plm-sec" id="plm-tradeup-sec">' + sectionLoading('Loading town tax comparisons', 'Preparing current municipal ratio data for the trade-up calculator.') + '</div>' +

      '<div class="plm-sec">' + buildMortgageCalc() + '</div>' +

      '<div class="plm-sec" id="plm-timeline-sec">' + sectionLoading('Building ownership timeline', 'Connecting the recorded transfer with the current Watchdog value.') + '</div>' +

      '<div class="plm-sec" id="plm-drivers">' + sectionLoading('Ranking the sales that matter', 'Scoring nearby recorded sales for similarity and recency.') + '</div>' +

      '<div class="plm-sec" id="plm-verified-sec">' + sectionLoading('Loading verified sales', 'Checking New Jersey SR1A arm’s-length sales for this municipality.') + '</div>' +

      '<div class="plm-sec" id="plm-comps-sec">' + sectionLoading('Loading nearby recorded sales', 'Finding recent transfers around this parcel.') + '</div>' +

      '<div class="plm-sec" id="plm-hood-sec">' + sectionLoading('Comparing nearby assessments', 'Measuring the surrounding residential parcels for context.') + '</div>' +

      '<div class="plm-sec">' + buildPreapproval() + '</div>' +

      '<div class="plm-sec">' + buildSellingOptions() + '</div>' +

      '<div class="plm-sec">' + buildZillowMatches() + '</div>' +

      '<div class="plm-sec">' + buildAppeal() + '</div>' +

      '<div class="plm-broker">' +
        '<img src="/opuslogo.jpg" alt="Opus Elite Real Estate" onerror="this.style.display=\'none\'">' +
        '<div>' +
          '<div class="plm-broker-lead">In partnership with <b>Opus Elite Real Estate</b></div>' +
          '<div class="plm-broker-sub">John Scafide, Licensed NJ Real Estate Agent #2079591, The McKenty Team at Opus Elite Real Estate. ' +
          'This site provides property tax information. If a property shown here is for sale and listed by a licensed real estate agent, ' +
          'nothing on this page is intended as a direct solicitation of business. ' +
          'For sales information on this and other properties, visit <a href="' + IDX_URL + '" target="_blank" rel="noopener">johnscafide.opuselitesj.com</a>.</div>' +
        '</div>' +
      '</div>' +

      '<div class="plm-note">' +
        '<strong>About this data.</strong> New Jersey Office of GIS statewide parcel layer joined to Division of Taxation MOD-IV assessment records, the same system municipal assessors use, refreshed about once a year. Owner names are redacted under Daniel\u2019s Law. The tax figure is the prior year billed amount, not a current year estimate. ' +
        'Listing status is not from the MLS. The only automatic signal is a recently recorded deed, which means the property changed hands. ' +
        'Aerial imagery from Esri World Imagery. Parcel boundaries are for reference and are not survey or legal descriptions. All calculators produce estimates only. Confirm closing figures with your attorney and title company.' +
      '</div>';

    // ---------- rail ----------
    el('plm-rail').innerHTML =
      '<div id="plm-account"></div>' +

      '<div class="plm-rcard gold" id="pl-track-card">' +
        '<h4><i class="fas fa-chart-line" style="color:var(--gold)"></i> Track this home</h4>' +
        '<p>One email a month: what it is worth now, what sold nearby, and any change to the assessment or tax rate.</p>' +
        '<button class="plm-rbtn" onclick="plOpenForm(\'track\')"><i class="fas fa-bell"></i>&nbsp; Start tracking</button>' +
        '<button class="plm-rbtn ghost" onclick="plOpenForm(\'value\')">What is it worth today?</button>' +
        '<button class="plm-rbtn ghost" onclick="plOpenForm(\'sell\')">I want to sell this home</button>' +
      '</div>' +
      '<div id="plm-agent-slot">' + buildAgentRail() + '</div>';

    el('secnav-mount').innerHTML = buildSectionNav();
    openModal();
    initSectionNav();
    drawMap(geo, rings, p);
    chartSplit(land, imprv);
    chartTaxHistory();
    initProceeds();
    if (el('mtg-price')) window.plMortgage();
    refreshSaveState();

    // Everything below runs after the panel is already on screen. Static
    // reference files may still be warming; each dependent section says so and
    // repaints itself as soon as its data is ready.
    var renderId = current.lookupId;
    var subject = { assessed: assessed, built: +p.YR_CONSTR || 0, acres: acres };

    warmReferenceData().then(function () {
      if (!current || current.lookupId !== renderId) return null;

      chartTaxHistory();
      var tradeHost = elReal('plm-tradeup-sec');
      if (tradeHost) {
        tradeHost.innerHTML = gate('tradeup',
          'Compare tax across 168 towns',
          'Pick where you are looking and see that town’s real effective rate, measured from its own parcels, against what you pay now.',
          buildTradeUp());
      }

      var staticOffR = officialRatio(current.town, current.county);
      var sr1a = sr1aRatio(p);
      return Promise.all([
        gatherComps(geo.lat, geo.lon, current.town),
        verifiedComps(p, subject),
        subjectFromSR1A(p),
        certifiedChapter123Ratio(p)
      ]).then(function (res) {
        if (!current || current.lookupId !== renderId) return;
        var comps = res[0] || [], verified = res[1] || [], own = res[2], certified = res[3] || null;
        current.certifiedRatio = certified;
        var offR = certified || staticOffR;
        if (own) {
          if (own.sf) {
            subject.sqft = own.sf; current.livingSpace = own.sf;
            var lq = el('plm-q-living');
            if (lq) lq.innerHTML = '<i class="fas fa-house"></i><div><b>' + own.sf.toLocaleString() + '</b><span>Living sq ft</span></div>';
          }
          if (own.p > 1000) { current.verifiedSale = own.p; current.verifiedSaleYear = own.y; }
        }
        var ratio = sr1a || offR;
        paintVerified(verified, subject);
        if (sr1a && sr1a.drift != null) subject.townDrift = sr1a.drift;

        current.comps = comps;
        paintComps(comps);
        var val = watchdogValuation(subject, comps, new Date().getFullYear(), current.town, current.county,
                                    sr1a || offR, sr1a && sr1a.drift != null ? sr1a.drift : null);
        current.valuation = val;
        paintValuation(current.valuation, assessed, tax, ratio);
        if (!val) el('plm-score-sec').innerHTML = '';
        if (!val || !val.drivers || !val.drivers.length) el('plm-drivers').innerHTML = '';
        paintTimeline(current.valuation);
        paintDiag(subject, comps, current.valuation, current.town);
      });
    }).catch(function (e) {
      if (!current || current.lookupId !== renderId) return;
      console.warn('[watchdog] enrichment failed after property open:', e);
      ['plm-score-sec','plm-timeline-sec','plm-drivers','plm-verified-sec','plm-comps-sec','plm-tradeup-sec'].forEach(function (id) {
        var node = elReal(id); if (node) node.innerHTML = '';
      });
    });

    neighborhoodStats(geo.lat, geo.lon, 500).then(function (h) {
      if (!current || current.lookupId !== renderId) return;
      paintHood(h, assessed, tax);
    });

    // Neighborhood view is opt-in. It costs an ArcGIS query, a Supabase call and
    // a second Leaflet map, none of which the user can see while the modal is up.
    // Stashed here and run only when plOpenHood() is called.
    window.plOpenHood = function () {
    hoodParcels(geo.lat, geo.lon, 420).then(function (list) {
      if (!list.length) return;
      // make sure the searched property is in the list even if the envelope missed it
      if (!list.some(function (x) { return x.pin === current.pin; })) {
        list.unshift({ pin: current.pin, addr: current.address, town: current.town,
          county: current.county, zip: current.zip, block: current.block, lot: current.lot,
          assessed: assessed, tax: tax, built: +p.YR_CONSTR || null, acres: acres,
          sale: sale, saleYear: dy, lat: geo.lat, lon: geo.lon, dist: 0, rate: rate });
      }
      loadHoodSaved().then(function () {
        try {
          buildHood({ lat: geo.lat, lon: geo.lon, town: current.town }, list);
          plShowHood();
        } catch (e) {
          console.warn('[watchdog] neighborhood view failed, leaving the page as it was:', e);
          document.body.classList.remove('hood-on');
          var w = elReal('pl-hood');
          if (w) w.classList.remove('on');
        }
      });
    });
    };

    if (typeof gtag === 'function') gtag('event', 'property_lookup_success', { town: current.town });
  }
  // ══════════════════════════════════════════════
  // MAP
  // ══════════════════════════════════════════════
  function drawMap(geo, rings, p) {
    if (typeof L === 'undefined' || !el('plm-map')) return;
    try {
      map = L.map('plm-map', { zoomControl: true, scrollWheelZoom: false }).setView([geo.lat, geo.lon], 18);
      L.tileLayer(ESRI_TILES, { maxZoom: 19, attribution: 'Imagery &copy; Esri' }).addTo(map);
      if (rings && rings.length) {
        var ll = rings.map(function (r) { return r.map(function (pt) { return [pt[1], pt[0]]; }); });
        var poly = L.polygon(ll, { color: '#f0d87a', weight: 3, opacity: 1, fillColor: '#b8972a', fillOpacity: 0.16 }).addTo(map);
        map.fitBounds(poly.getBounds(), { padding: [26, 26], maxZoom: 19 });
        poly.bindTooltip('Block ' + (p.PCLBLOCK || '?') + ', Lot ' + (p.PCLLOT || '?'));
      } else {
        L.circleMarker([geo.lat, geo.lon], { radius: 9, color: '#f0d87a', weight: 3, fillColor: '#b8972a', fillOpacity: .7 }).addTo(map);
      }
      setTimeout(function () { if (map) map.invalidateSize(); }, 300);
    } catch (err) { console.warn('map:', err); }
  }

  function chartSplit(land, imprv) {
    var host = el('pl-chart-split');
    if (!host) return;
    var total = land + imprv;
    if (!total) { host.innerHTML = '<div class="pl-nodata">No assessment breakdown on file for this parcel.</div>'; return; }

    var r = 62, c = 2 * Math.PI * r, lp = land / total, off = c * lp;
    host.innerHTML =
      '<svg class="pl-chart" viewBox="0 0 300 168" role="img" aria-label="Assessment split">' +
        '<g transform="translate(84,84)">' +
          '<circle r="' + r + '" fill="none" stroke="#1a3a6b" stroke-width="26"/>' +
          '<circle r="' + r + '" fill="none" stroke="#b8972a" stroke-width="26" ' +
            'stroke-dasharray="' + off.toFixed(2) + ' ' + (c - off).toFixed(2) + '" transform="rotate(-90)"/>' +
          '<text y="-4" text-anchor="middle" font-size="21" font-weight="700" fill="#0e2248">' + money(total) + '</text>' +
          '<text y="15" text-anchor="middle" font-size="10.5" fill="#5a6070" letter-spacing=".06em">TOTAL ASSESSED</text>' +
        '</g>' +
        '<g transform="translate(178,52)" font-size="12.5">' +
          '<rect x="0" y="-9" width="11" height="11" rx="3" fill="#b8972a"/>' +
          '<text x="19" y="0" fill="#1a1a2e" font-weight="600">Land</text>' +
          '<text x="19" y="17" fill="#5a6070">' + money(land) + '  ·  ' + Math.round(lp * 100) + '%</text>' +
          '<rect x="0" y="41" width="11" height="11" rx="3" fill="#1a3a6b"/>' +
          '<text x="19" y="50" fill="#1a1a2e" font-weight="600">Improvements</text>' +
          '<text x="19" y="67" fill="#5a6070">' + money(imprv) + '  ·  ' + Math.round((1 - lp) * 100) + '%</text>' +
        '</g>' +
      '</svg>';
  }

  function townRates() {
    if (!rateTable || !current) return null;
    var t = (current.town || '').toUpperCase().trim();
    var withCounty = t + ' (' + (current.county || '').toUpperCase().trim() + ')';
    var keys = Object.keys(rateTable);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i].toUpperCase().trim();
      if (k === withCounty) return rateTable[keys[i]];
    }
    for (var j = 0; j < keys.length; j++) {
      if (keys[j].toUpperCase().trim() === t) return rateTable[keys[j]];
    }
    return null;
  }

  // keep axis labels distinct when the range is tight
  function axisLbl(v, span) {
    if (span < 3000) return (v / 1000).toFixed(1) + 'k';
    return Math.round(v / 1000) + 'k';
  }

  function chartTaxHistory() {
    var host = el('pl-chart-tax'), sub = el('pl-chart-tax-sub');
    if (!host) return;
    var rates = townRates();

    if (rateTable === null) {
      sub.textContent = 'Loading published town tax-rate history…';
      host.innerHTML = sectionLoading('Loading tax history', 'Pulling the municipality’s published general tax rates.');
      return;
    }
    if (!rates || !current.assessed) {
      sub.textContent = 'Year by year bills are not available for this town.';
      host.innerHTML = '<div class="pl-nodata">' +
        'New Jersey does not publish a per property tax history in the free statewide feed, so this chart is built from your town\'s published general tax rate for each year.' +
        (current.tax ? '<br><br><strong style="color:#0e2248">Most recent billed amount: ' + money(current.tax) + '</strong>' : '') +
        '</div>';
      return;
    }

    var years = Object.keys(rates).map(Number).filter(function (y) { return y > 1990; }).sort();
    if (years.length < 2) { host.innerHTML = '<div class="pl-nodata">Only one year of rate data on file for this town.</div>'; return; }

    var vals = years.map(function (y) { return current.assessed * rates[y] / 100; });
    var max = Math.max.apply(null, vals), min = Math.min.apply(null, vals);
    var lo = Math.max(0, min - (max - min) * 0.5), hi = max + (max - min) * 0.2 || max * 1.1;
    var W = 300, H = 168, PL = 46, PR = 8, PT = 12, PB = 26;
    var iw = W - PL - PR, ih = H - PT - PB;
    var x = function (i) { return PL + (years.length === 1 ? iw / 2 : (i / (years.length - 1)) * iw); };
    var y = function (v) { return PT + ih - ((v - lo) / (hi - lo || 1)) * ih; };

    var line = vals.map(function (v, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1); }).join(' ');
    var area = line + ' L' + x(years.length - 1).toFixed(1) + ' ' + (PT + ih) + ' L' + x(0).toFixed(1) + ' ' + (PT + ih) + ' Z';

    var grid = '', ticks = 3;
    for (var g = 0; g <= ticks; g++) {
      var gv = lo + (hi - lo) * (g / ticks), gy = y(gv);
      grid += '<line x1="' + PL + '" y1="' + gy.toFixed(1) + '" x2="' + (W - PR) + '" y2="' + gy.toFixed(1) + '" stroke="#eef0f5"/>' +
              '<text x="' + (PL - 6) + '" y="' + (gy + 3.5).toFixed(1) + '" text-anchor="end" font-size="9.5" fill="#8a93a6">$' + axisLbl(gv, hi - lo) + '</text>';
    }

    var dots = vals.map(function (v, i) {
      return '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(v).toFixed(1) + '" r="3.4" fill="#fff" stroke="#1a3a6b" stroke-width="2.2"><title>' + years[i] + ': ' + money(v) + '</title></circle>';
    }).join('');

    var labels = years.map(function (yr, i) {
      if (years.length > 6 && i % 2 && i !== years.length - 1) return '';
      return '<text x="' + x(i).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="9.5" fill="#8a93a6">' + String(yr).slice(2) + '</text>';
    }).join('');

    var first = vals[0], last = vals[vals.length - 1];
    var pct = first ? ((last - first) / first) * 100 : 0;

    host.innerHTML =
      '<svg class="pl-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Estimated tax by year">' +
        '<defs><linearGradient id="plg" x1="0" y1="0" x2="0" y2="1">' +
          '<stop offset="0%" stop-color="#1a3a6b" stop-opacity=".22"/><stop offset="100%" stop-color="#1a3a6b" stop-opacity="0"/>' +
        '</linearGradient></defs>' + grid +
        '<path d="' + area + '" fill="url(#plg)"/>' +
        '<path d="' + line + '" fill="none" stroke="#1a3a6b" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>' +
        dots + labels +
      '</svg>' +
      '<div class="pl-legend">' +
        '<span><span class="pl-swatch" style="background:#1a3a6b"></span>Estimated annual bill</span>' +
        '<span style="color:' + (pct >= 0 ? 'var(--red)' : 'var(--green)') + ';font-weight:700">' +
          (pct >= 0 ? '\u2191 ' : '\u2193 ') + Math.abs(pct).toFixed(1) + '% since ' + years[0] + '</span>' +
      '</div>';

    sub.innerHTML = 'Your current assessment of ' + money(current.assessed) +
      ' run against ' + esc(current.town) + '\u2019s published general tax rate for each year. It shows what rate changes did to the bill, not reassessment history.';
  }

  // ══════════════════════════════════════════════
  // NET PROCEEDS
  // NJ Realty Transfer Fee, seller side. Two schedules: one at or under
  // $350,000 consideration, a higher one above it. Verified against the
  // published schedule ($350k -> $2,105.00, $400k -> $3,215.00).
  // ══════════════════════════════════════════════
  function njRTF(price) {
    if (!price || price <= 0) return 0;
    var f = 0, cap = Math.ceil(price / 500) * 500;
    function band(from, to, per500) {
      var amt = Math.min(cap, to) - from;
      if (amt > 0) f += (amt / 500) * per500;
    }
    if (cap <= 350000) {
      band(0, 150000, 2.00); band(150000, 200000, 3.35); band(200000, 350000, 3.90);
    } else {
      band(0, 150000, 2.90); band(150000, 200000, 4.25); band(200000, 550000, 4.80);
      band(550000, 850000, 5.30); band(850000, 1000000, 5.80); band(1000000, Infinity, 6.05);
    }
    return f;
  }

  // Graduated Percent Fee. Replaced the buyer paid mansion tax for contracts
  // executed on or after July 10, 2025. Seller pays. Applies to the ENTIRE price.
  function njGPF(price) {
    if (!price || price <= 1000000) return 0;
    var r = price <= 2000000 ? 0.01
          : price <= 2500000 ? 0.02
          : price <= 3000000 ? 0.025
          : price <= 3500000 ? 0.03
          : 0.035;
    return price * r;
  }

  function buildProceeds() {
    var guess = current.assessed ? Math.round(current.assessed / 1000) * 1000 : 350000;
    return '<div class="pl-card pl-zcalc" id="pl-proceeds">' +
      '<div class="pl-zcalc-header"><p>Estimated net proceeds</p><h3 id="pc-o-net">-</h3></div>' +

      '<div class="pl-zcalc-row">' +
        '<div class="pl-zcalc-label">Est. selling price</div>' +
        '<div class="pl-zcalc-input-wrap"><span>$</span><input type="text" class="pl-zcalc-input" id="pc-price" value="' + guess.toLocaleString() + '" oninput="plFormatNum(this); plCalc()"></div>' +
      '</div>' +
      '<input type="range" class="zillow-slider" id="pc-price-slider" min="10000" max="' + (guess * 2.5) + '" step="1000" value="' + guess + '" oninput="plSyncSlider(\'pc-price\', this.value); plCalc()">' +

      '<div class="pl-zcalc-row">' +
        '<div class="pl-zcalc-label">Est. remaining mortgage <i class="pl-icon-info" title="Your remaining loan balance">i</i></div>' +
        '<div class="pl-zcalc-input-wrap"><span>$</span><input type="text" class="pl-zcalc-input" id="pc-payoff" value="0" oninput="plFormatNum(this); plCalc()"></div>' +
      '</div>' +
      '<input type="range" class="zillow-slider" id="pc-payoff-slider" min="0" max="' + guess + '" step="1000" value="0" oninput="plSyncSlider(\'pc-payoff\', this.value); plCalc()">' +

      '<hr style="border:none;border-top:1px solid #eef0f5;margin:10px 0;">' +

      '<div class="pl-zcalc-dropdown" onclick="plToggle(\'pc-prep-wrap\')">' +
        '<div class="pl-zcalc-label">Est. prep and repair costs <i class="pl-icon-info" title="Paint, landscaping, anything you fix before listing">i</i></div>' +
        '<div class="pl-zcalc-val" id="pc-val-prep">$0 <i class="fas fa-chevron-down"></i></div>' +
      '</div>' +
      '<div id="pc-prep-wrap" style="display:none;padding:10px 0 20px;align-items:center;justify-content:space-between;">' +
        '<span style="font-size:14px;color:#5a6070;">Amount</span>' +
        '<div class="pl-zcalc-input-wrap"><span>$</span><input type="text" class="pl-zcalc-input" id="pc-prep" value="0" oninput="plFormatNum(this); plCalc()"></div>' +
      '</div>' +

      '<div class="pl-zcalc-dropdown" onclick="plToggle(\'pc-closing-wrap\')">' +
        '<div class="pl-zcalc-label">Est. closing costs <i class="pl-icon-info" title="Commission, concessions, NJ transfer fee, attorney and title, taxes owed">i</i></div>' +
        '<div class="pl-zcalc-val" id="pc-val-closing">$0 <i class="fas fa-chevron-down"></i></div>' +
      '</div>' +
      '<div id="pc-closing-wrap" style="display:none;padding:10px 0 20px;">' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:12px;">' +
          '<div><label style="font-size:12px;color:#5a6070;display:block;margin-bottom:4px;">Agent commission %</label><input type="number" class="pl-zcalc-input" id="pc-comm" value="5" step="0.25" oninput="plCalc()" style="padding-left:12px;text-align:left;width:100%;"></div>' +
          '<div><label style="font-size:12px;color:#5a6070;display:block;margin-bottom:4px;">Seller concessions %</label><input type="number" class="pl-zcalc-input" id="pc-conc" value="0" step="0.5" oninput="plCalc()" style="padding-left:12px;text-align:left;width:100%;"></div>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:12px;">' +
          '<div><label style="font-size:12px;color:#5a6070;display:block;margin-bottom:4px;">Attorney and title ($)</label><input type="number" class="pl-zcalc-input" id="pc-legal" value="2500" step="100" oninput="plCalc()" style="padding-left:12px;text-align:left;width:100%;"></div>' +
          '<div><label style="font-size:12px;color:#5a6070;display:block;margin-bottom:4px;">Tax owed at closing ($)</label><input type="number" class="pl-zcalc-input" id="pc-tax" value="' + Math.round((current.tax || 0) / 4) + '" step="100" oninput="plCalc()" style="padding-left:12px;text-align:left;width:100%;"></div>' +
        '</div>' +
        '<div id="pc-fee-detail" style="font-size:12.5px;color:#5a6070;line-height:1.7;padding-top:10px;border-top:1px solid #eef0f5;"></div>' +
      '</div>' +

      '<div class="pl-zcalc-total">' +
        '<div class="pl-zcalc-total-lbl">Est. total selling costs <span id="pc-cost-pct" style="font-weight:normal;color:#5a6070;font-size:16px;">(0%)</span></div>' +
        '<div class="pl-zcalc-total-val" id="pc-val-total-costs">$0</div>' +
      '</div>' +

      '<div class="pl-fine" id="pc-note" style="margin-top:18px;text-align:center;"></div>' +
    '</div>';
  }

  window.plToggle = function (id) {
    var e2 = el(id); if (!e2) return;
    var open = e2.style.display !== 'none';
    e2.style.display = open ? 'none' : (id === 'pc-prep-wrap' ? 'flex' : 'block');
  };

  function initProceeds() { window.plCalc(); }

  window.plCalc = function () {
    function v(id) {
      var e2 = el(id); if (!e2) return 0;
      if (e2.type === 'number') return parseFloat(e2.value) || 0;
      return parseFloat(String(e2.value).replace(/[^0-9.]/g, '')) || 0;
    }
    var price = v('pc-price'), payoff = v('pc-payoff');
    var comm = price * (v('pc-comm') / 100), conc = price * (v('pc-conc') / 100);
    var rtf = njRTF(price), gpf = njGPF(price);
    var legal = v('pc-legal'), prep = v('pc-prep'), taxdue = v('pc-tax');

    var closing = comm + conc + rtf + gpf + legal + taxdue;
    var totalCosts = closing + prep;
    var net = price - payoff - totalCosts;

    var n = el('pc-o-net');
    if (n) { n.textContent = money(net); n.style.color = net < 0 ? 'var(--red)' : '#0e2248'; }

    var pv = el('pc-val-prep');
    if (pv) pv.innerHTML = money(prep) + ' <i class="fas fa-chevron-down"></i>';
    var cv = el('pc-val-closing');
    if (cv) cv.innerHTML = money(closing) + ' <i class="fas fa-chevron-down"></i>';
    var pct = el('pc-cost-pct');
    if (pct && price > 0) pct.textContent = '(' + Math.round((totalCosts / price) * 100) + '%)';
    var tot = el('pc-val-total-costs');
    if (tot) tot.textContent = money(totalCosts);

    var det = el('pc-fee-detail');
    if (det) {
      det.innerHTML =
        '<div style="display:flex;justify-content:space-between;"><span>Agent commission</span><b>' + money(comm) + '</b></div>' +
        (conc ? '<div style="display:flex;justify-content:space-between;"><span>Seller concessions</span><b>' + money(conc) + '</b></div>' : '') +
        '<div style="display:flex;justify-content:space-between;"><span>NJ realty transfer fee</span><b>' + money(rtf) + '</b></div>' +
        (gpf ? '<div style="display:flex;justify-content:space-between;color:#c0392b;"><span>Graduated percent fee, seller paid</span><b>' + money(gpf) + '</b></div>' : '') +
        '<div style="display:flex;justify-content:space-between;"><span>Attorney and title</span><b>' + money(legal) + '</b></div>' +
        '<div style="display:flex;justify-content:space-between;"><span>Taxes owed at closing</span><b>' + money(taxdue) + '</b></div>';
    }

    var ps = el('pc-price-slider');
    if (ps) {
      ps.value = price; window.plUpdateSliderStyle(ps);
      var os = el('pc-payoff-slider');
      if (os) { os.max = price; os.value = payoff; window.plUpdateSliderStyle(os); }
    }

    var note = 'Transfer fee figures follow the NJ schedule in effect since July 10, 2025.';
    if (gpf > 0) note += ' Sales over $1,000,000 carry the graduated percent fee on the seller, applied to the full price.';
    note += ' Sellers 62 and over, or who are blind or disabled, may qualify for a partial exemption on Form RTF-1. Estimates only.';
    var ne = el('pc-note'); if (ne) ne.textContent = note;
  };

  // ══════════════════════════════════════════════
  // APPEAL DEADLINE
  // April 1 in most towns, May 1 where the town revalued this year.
  // ══════════════════════════════════════════════
  function appealDeadline() {
    var now = new Date();
    var yr = now.getFullYear();
    var reval = revaluationStatus(current).isCurrentYear;
    var currentDue = new Date(yr, reval ? 4 : 3, 1);   // May 1 in current-year reval/reassessment towns
    var due = currentDue;
    var dueUsesReval = reval;
    if (now > currentDue) {
      // The next year's approved list may not exist yet. Do not carry a 2026
      // revaluation flag into 2027; use the general April 1 date until the next
      // official list is loaded.
      due = new Date(yr + 1, 3, 1);
      dueUsesReval = false;
    }
    return {
      date: due,
      days: Math.ceil((due - now) / 864e5),
      year: due.getFullYear(),
      currentYearRevaluation: reval,
      currentYearDeadline: currentDue,
      dueUsesRevaluationRule: dueUsesReval
    };
  }

  function buildDeadlineBanner() {
    var d = appealDeadline();
    var urgent = d.days <= 75;
    var pretty = d.date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    var revalCopy = '';
    if (d.currentYearRevaluation) {
      var currentPretty = d.currentYearDeadline.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      revalCopy = '<span>This municipality is on New Jersey\u2019s ' + new Date().getFullYear() + ' approved revaluation/reassessment list. ' +
        'Chapter 123 does not apply to that assessment year, and the filing deadline for that year is <b>' + currentPretty + '</b>. ' +
        (d.year > new Date().getFullYear() ? 'The next general deadline shown below defaults to April 1 until the next tax-year list is published.' : '') + '</span>';
    }
    return '<a href="#" onclick="plOpenForm(\'appeal\');return false;" class="dl-banner' + (urgent ? ' urgent' : '') + '">' +
      '<div class="dl-count"><b>' + d.days + '</b><span>day' + (d.days === 1 ? '' : 's') + ' left</span></div>' +
      '<div class="dl-text"><b>' + (urgent ? 'The appeal window is closing.' : 'Next filing date shown: ' + pretty + '.') + '</b>' +
        (revalCopy || '<span>New Jersey assessment appeals are generally due <b>April 1</b>. A current-year approved revaluation or reassessment moves that year\u2019s deadline to <b>May 1</b>.</span>') +
      '</div><div class="dl-cta">Start my review <i class="fas fa-arrow-right"></i></div></a>';
  }

  // ══════════════════════════════════════════════
  // JOHN'S OPINION
  // A plain verdict in his own voice, next to his face.
  // ══════════════════════════════════════════════
  function buildOpinion(hasCase, overBy, saving, target) {
    var a = AGENTS.john;
    var body, cls, head;

    if (hasCase) {
      cls = 'act';
      head = 'Get this one checked out.';
      body = 'The public numbers say this assessment is sitting <b>' + money(overBy) + '</b> above where Chapter 123 says it should be. ' +
        (saving && saving > 150
          ? 'If that holds up, you are looking at roughly <b>' + money(saving) + ' a year</b> back in your pocket. '
          : '') +
        'I cannot see inside the house from here, and that matters, but a gap this size is worth an hour of my time to check properly. There is no charge for me to look.';
    } else {
      cls = 'clear';
      head = 'You are good. No appeal needed here.';
      body = 'I ran this one against comparable homes nearby and against what the property last sold for. ' +
        'The assessment lands inside the cushion New Jersey allows, so an appeal would almost certainly fail and cost you the filing fee. ' +
        '<b>Save your money.</b> If your roof is shot or the inside is rough, that can change the math, so tell me and I will take another look.';
    }

    return '<div class="op-box ' + cls + '">' +
      '<img class="op-photo" src="' + a.photo + '" alt="' + esc(a.name) + '" loading="lazy">' +
      '<div class="op-body">' +
        '<div class="op-label">John\u2019s opinion</div>' +
        '<div class="op-head">' + head + '</div>' +
        '<p>' + body + '</p>' +
        '<div class="op-sig">' + esc(a.name) + '  \u00b7  ' + esc(a.lic) + '  \u00b7  15+ years preparing NJ tax returns</div>' +
      '</div>' +
    '</div>';
  }

  // ══════════════════════════════════════════════
  // ANCHOR AND STAY NJ REBATES
  // ══════════════════════════════════════════════
  function buildRebates(tax) {
    if (!tax || tax < 500) return '';
    var anchor = 1500, stay = 6500;
    var afterAnchor = Math.max(0, tax - anchor);
    var afterStay = Math.max(0, tax - Math.min(stay, tax * 0.5));   // Stay NJ caps at half the bill

    function card(cls, badge, title, cut, after, note) {
      return '<div class="rb-card ' + cls + '">' +
        '<div class="rb-badge">' + badge + '</div>' +
        '<div class="rb-title">' + title + '</div>' +
        '<div class="rb-math">' +
          '<div class="rb-before"><s>' + money(tax) + '</s><span>your bill now</span></div>' +
          '<i class="fas fa-arrow-right"></i>' +
          '<div class="rb-after"><b>' + money(after) + '</b><span>after the rebate</span></div>' +
        '</div>' +
        '<div class="rb-cut">Up to <b>' + money(cut) + '</b> back</div>' +
        '<div class="rb-note">' + note + '</div>' +
      '</div>';
    }

    return '<div class="rb-wrap">' +
      '<h3 class="plm-sec-h">You may not have to pay all of that</h3>' +
      '<p class="plm-sec-s">New Jersey hands money back through ANCHOR and Stay NJ, and most people who qualify never claim it. ' +
      'Here is what this property\u2019s bill could look like after a rebate.</p>' +
      '<div class="rb-grid">' +
        card('anchor', 'Any age', 'ANCHOR, for homeowners', anchor, afterAnchor,
             'Homeowners can receive up to $1,500 depending on income. Renters can receive up to $700.') +
        card('stay', 'Age 65+', 'Stay NJ, for seniors', stay, afterStay,
             'Seniors 65 and over can have up to half their property tax bill covered, to a maximum of $6,500.') +
      '</div>' +
      '<a href="/anchor-estimator.html" class="rb-btn">' +
        'Find out what you qualify for <i class="fas fa-arrow-right"></i></a>' +
      '<div class="rb-fine">Illustration only. Actual benefits depend on income, age, filing status, and residency, and the programs change. ' +
      'The estimator asks about 90 seconds of questions and gives you a real figure.</div>' +
    '</div>';
  }

  // ══════════════════════════════════════════════
  // TRADE UP ESTIMATOR
  // The tax rate in the town you are moving TO is measured live from that
  // town's own parcels, so this is not a guess from a rate table.
  // ══════════════════════════════════════════════
  var townRateCache = {};

  function townEffectiveRate(town, county) {
    var key = (town + '|' + county).toUpperCase();
    if (townRateCache[key]) return Promise.resolve(townRateCache[key]);

    var offR = officialRatio(town, county);
    if (!offR) return Promise.resolve(null);

    var where = "MUN_NAME = '" + String(town).replace(/'/g, "''") + "'" +
                " AND COUNTY = '" + String(county).replace(/'/g, "''") + "'" +
                " AND PROP_CLASS = '2' AND NET_VALUE > 10000 AND LAST_YR_TX > 100";
    var p = new URLSearchParams({
      where: where, outFields: 'NET_VALUE,LAST_YR_TX',
      returnGeometry: 'false', resultRecordCount: '900', f: 'json'
    });
    return xfetch(NJ_PARCEL + '?' + p, 15000).then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d.features || d.features.length < 20) return null;
        var rates = [];
        d.features.forEach(function (f) {
          var a = f.attributes;
          var market = (+a.NET_VALUE) / offR.ratio;
          var r2 = (+a.LAST_YR_TX) / market;
          if (isFinite(r2) && r2 > 0.002 && r2 < 0.10) rates.push(r2);
        });
        if (rates.length < 15) return null;
        var out = { rate: median(rates), n: rates.length, ratio: offR.ratio };
        townRateCache[key] = out;
        return out;
      }).catch(function () { return null; });
  }

  function buildTradeUp() {
    var opts = Object.keys(officialRatios || {}).sort().map(function (k) {
      return '<option value="' + esc(k) + '">' + esc(k.replace(/ \(/, ', ').replace(/\)$/, '')) + '</option>';
    }).join('');

    var v = current.valuation;
    var eq = v && v.mid ? Math.round(v.mid / 1000) * 1000 : 300000;

    return '<div class="tu-wrap">' +
      '<h3 class="plm-sec-h">Thinking of trading up? Check the tax first.</h3>' +
      '<p class="plm-sec-s">Two houses at the same price can carry wildly different tax bills depending on which side of a town line they sit on. ' +
      'Pick where you are looking and this measures that town\u2019s real effective rate from its own parcels, then shows what your new bill would be.</p>' +
      '<div class="pl-card">' +
        '<div class="tu-grid">' +
          '<div>' +
            '<div class="mtg-row"><label>Sale price of this home</label>' +
              '<div class="pl-zcalc-input-wrap"><span>$</span><input type="text" class="pl-zcalc-input" id="tu-sale" value="' + eq.toLocaleString() + '" oninput="plFormatNum(this); plTradeUp()"></div></div>' +
            '<div class="mtg-row"><label>Mortgage payoff</label>' +
              '<div class="pl-zcalc-input-wrap"><span>$</span><input type="text" class="pl-zcalc-input" id="tu-payoff" value="0" oninput="plFormatNum(this); plTradeUp()"></div></div>' +
            '<div class="mtg-row"><label>Next home price</label>' +
              '<div class="pl-zcalc-input-wrap"><span>$</span><input type="text" class="pl-zcalc-input" id="tu-next" value="' + Math.round(eq * 1.25 / 1000) * 1000 + '" oninput="plFormatNum(this); plTradeUp()"></div></div>' +
            '<div class="mtg-row" style="display:block;">' +
              '<label style="display:block;margin-bottom:6px;">Moving to</label>' +
              '<select class="pl-zcalc-input" id="tu-town" onchange="plTradeUp()" style="width:100%;text-align:left;padding-left:12px;">' +
                '<option value="">Pick a town...</option>' + opts +
              '</select></div>' +
          '</div>' +
          '<div class="tu-out" id="tu-out">' +
            '<div class="tu-placeholder"><i class="fas fa-map-location-dot"></i><span>Pick a town to see what the tax bill would be there.</span></div>' +
          '</div>' +
        '</div>' +
        '<div class="mtg-disc">Estimates only. Effective rates are measured from recent public assessment records in each municipality and will not match any single home exactly. ' +
        'Your actual bill depends on the specific property, its assessment, and that year\u2019s rate.</div>' +
      '</div>' +
    '</div>';
  }

  window.plTradeUp = function () {
    function v(id) {
      var e = el(id); if (!e) return 0;
      return parseFloat(String(e.value).replace(/[^0-9.]/g, '')) || 0;
    }
    var sale = v('tu-sale'), payoff = v('tu-payoff'), next = v('tu-next');
    var sel = el('tu-town'), key = sel ? sel.value : '';
    var out = el('tu-out');
    if (!out) return;
    if (!key) {
      out.innerHTML = '<div class="tu-placeholder"><i class="fas fa-map-location-dot"></i><span>Pick a town to see what the tax bill would be there.</span></div>';
      return;
    }

    var parts = key.replace(/\)$/, '').split(' (');
    var town = parts[0], county = parts[1] || '';
    out.innerHTML = '<div class="tu-placeholder"><div class="pl-spin" style="margin:0 auto 12px;"></div><span>Measuring ' + esc(town) + '...</span></div>';

    townEffectiveRate(town, county).then(function (r) {
      var hereRate = (current.tax && current.valuation && current.valuation.mid)
        ? current.tax / current.valuation.mid : null;
      if (!r) {
        out.innerHTML = '<div class="tu-placeholder"><i class="fas fa-circle-question"></i><span>Not enough recorded data for ' +
          esc(town) + ' to measure a reliable rate. <a href="#" onclick="plOpenForm(\'buy\');return false;">Ask me and I will pull it.</a></span></div>';
        return;
      }
      var newTax = next * r.rate;
      var hereTax = current.tax || 0;
      var diff = newTax - hereTax;
      var equity = Math.max(0, sale - payoff);

      out.innerHTML =
        '<div class="tu-head">Moving to <b>' + esc(town) + '</b></div>' +
        '<div class="tu-big">' + money(newTax) + '<span>estimated annual tax</span></div>' +
        '<div class="tu-rows">' +
          '<div class="tu-row"><span>Effective rate there</span><b>' + (r.rate * 100).toFixed(2) + '%</b></div>' +
          (hereRate ? '<div class="tu-row"><span>Effective rate here</span><b>' + (hereRate * 100).toFixed(2) + '%</b></div>' : '') +
          '<div class="tu-row"><span>You pay here now</span><b>' + money(hereTax) + '</b></div>' +
          '<div class="tu-row ' + (diff > 0 ? 'up' : 'down') + '"><span>Change per year</span><b>' +
            (diff > 0 ? '+' : '') + money(diff) + '</b></div>' +
          '<div class="tu-row"><span>Equity you would carry over</span><b>' + money(equity) + '</b></div>' +
        '</div>' +
        '<div class="tu-verdict ' + (diff > 0 ? 'warn' : 'good') + '">' +
          (diff > 0
            ? 'That is <b>' + money(diff / 12) + ' a month</b> more in tax alone, before the bigger mortgage. Worth knowing before you fall in love with a listing.'
            : 'You would actually pay <b>' + money(Math.abs(diff)) + ' a year less</b> in tax, even on a more expensive house.') +
        '</div>' +
        '<div class="tu-src">Measured from ' + r.n + ' properties in ' + esc(town) + '.</div>' +
        '<button class="plm-rbtn" style="margin-top:14px;" onclick="plOpenForm(\'buy\')">Find me homes there</button>';
    });
  };


  // ══════════════════════════════════════════════
  // STICKY SECTION NAV
  // Appears once the panel scrolls past the headline, hides on the way back up.
  // Highlights whichever section you are currently looking at.
  // ══════════════════════════════════════════════
  var NAV_SECTIONS = [
    { id: 'plm-estimate',    label: 'Value',    icon: 'fa-dog' },
    { id: 'plm-score-sec',   label: 'Appeal',   icon: 'fa-scale-balanced' },
    { id: 'plm-rebate-sec',  label: 'Rebates',  icon: 'fa-piggy-bank' },
    { id: 'pl-proceeds',     label: 'Proceeds', icon: 'fa-sack-dollar' },
    { id: 'pl-appeal',       label: 'Contact',  icon: 'fa-envelope' }
  ];

  function buildSectionNav() {
    return '<div class="secnav" id="secnav">' +
      NAV_SECTIONS.map(function (x) {
        return '<button data-t="' + x.id + '" onclick="plJump(\'' + x.id + '\')">' +
          '<i class="fas ' + x.icon + '"></i><span>' + x.label + '</span></button>';
      }).join('') +
    '</div>';
  }

  window.plJump = function (id) {
    var t = el(id);
    if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  function initSectionNav() {
    var scroller = el('plm-scroll'), nav = el('secnav');
    if (!scroller || !nav) return;
    var ticking = false;

    function update() {
      ticking = false;
      var top = scroller.scrollTop;
      // show it only after the headline has gone by
      nav.classList.toggle('on', top > 260);

      // which section is in view
      var active = null, best = 1e9;
      NAV_SECTIONS.forEach(function (x) {
        var e = el(x.id);
        if (!e || !e.offsetParent) return;
        var d = e.getBoundingClientRect().top - 150;
        if (d <= 40 && Math.abs(d) < best) { best = Math.abs(d); active = x.id; }
      });
      nav.querySelectorAll('button').forEach(function (b) {
        b.classList.toggle('here', b.getAttribute('data-t') === active);
      });
    }

    scroller.removeEventListener('scroll', scroller._navFn || function () {});
    scroller._navFn = function () {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    };
    scroller.addEventListener('scroll', scroller._navFn, { passive: true });
    update();
  }


  // ══════════════════════════════════════════════
  // GATED CONTENT
  //
  // Anonymous visitors receive only a neutral placeholder. The analysis is
  // held outside the DOM until the account session has been established.
  //
  // What stays free, on purpose: the assessment, the tax bill, the parcel
  // record, and the headline value. Those are the things a homeowner has a
  // right to see about their own house, and putting a wall in front of them
  // would be the wrong trade for a few signups.
  //
  // What is gated: the analysis we built on top of it.
  // ══════════════════════════════════════════════
  var gateContent = Object.create(null);

  function gateShell(key, title, blurb) {
    return '<div class="gated" data-gate="' + key + '">' +
      '<div class="gated-inner" aria-hidden="true">' +
        '<div class="gate-skeleton"><i></i><i></i><i></i></div>' +
      '</div>' +
      '<div class="gate-cta">' +
        '<div class="gate-card">' +
          '<div class="gate-icon"><i class="fas fa-lock-open"></i></div>' +
          '<div class="gate-t">' + esc(title) + '</div>' +
          '<div class="gate-b">' + blurb + '</div>' +
          '<button class="gate-btn" onclick="plSignInPrompt()">Create a free account</button>' +
          '<div class="gate-f">Free forever. No card. Takes about twenty seconds and you keep everything you save.</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function gate(key, title, blurb, html) {
    gateContent[key] = { title: title, blurb: blurb, html: html };
    return plUser ? html : gateShell(key, title, blurb);
  }

  function applyGates() {
    document.body.classList.toggle('pl-signedin', !!plUser);
    document.querySelectorAll('[data-gate]').forEach(function (node) {
      var key = node.getAttribute('data-gate');
      var item = gateContent[key];
      if (!item) return;
      if (plUser) {
        node.outerHTML = item.html;
      } else {
        node.outerHTML = gateShell(key, item.title, item.blurb);
      }
    });
  }

  // ══════════════════════════════════════════════
  // ACCOUNTS · canonical Watchdog auth runtime
  //
  // The property lookup may observe a session and save member data, but it no
  // longer owns signup UI, magic links, provider buttons or Google One Tap.
  // Every sign-in entry goes through /property/onboarding/ and the shared
  // supabase-runtime.js provider configuration.
  // ══════════════════════════════════════════════
  var DASHBOARD_URL = '/property/dashboard';
  var sb = null, plUser = null;

  function authReady() {
    if (sb) return true;
    if (window.__njwSB) { sb = window.__njwSB; return true; }
    if (!window.NJPTRSupabaseRuntime || typeof window.NJPTRSupabaseRuntime.createClient !== 'function') return false;
    try {
      sb = window.NJPTRSupabaseRuntime.createClient();
      window.__njwSB = sb;
      return true;
    } catch (error) {
      console.warn('[watchdog] canonical auth runtime unavailable:', error && error.message || error);
      return false;
    }
  }

  function openCanonicalSignIn() {
    var next = location.pathname + location.search + location.hash;
    if (window.WatchdogAuth && typeof window.WatchdogAuth.openSignIn === 'function') {
      window.WatchdogAuth.openSignIn(next);
      return;
    }
    if (window.NJPTRSupabaseRuntime && typeof window.NJPTRSupabaseRuntime.openOnboarding === 'function') {
      window.NJPTRSupabaseRuntime.openOnboarding(next);
      return;
    }
    location.href = '/property/onboarding/?next=' + encodeURIComponent(next);
  }

  function plInitAuth() {
    if (!authReady()) { paintAuthBtn(); return; }
    sb.auth.getSession().then(function (res) {
      plUser = (res && res.data && res.data.session) ? res.data.session.user : null;
      paintAuthBtn();
      applyGates();
      if (location.hash.indexOf('access_token') > -1) history.replaceState(null, '', location.pathname + location.search);
    });
    sb.auth.onAuthStateChange(function (_event, session) {
      plUser = session ? session.user : null;
      paintAuthBtn();
      applyGates();
      if (current) refreshSaveState();
    });
  }

  function userName() {
    if (!plUser) return '';
    var meta = plUser.user_metadata || {};
    return meta.full_name || meta.name || (plUser.email || '').split('@')[0] || 'there';
  }

  function userAvatar() {
    var meta = (plUser && plUser.user_metadata) || {};
    return meta.avatar_url || meta.picture || '';
  }

  function paintHeroAuth() {
    var host = elReal('pl-heroauth');
    if (!host) return;
    if (plUser) {
      var avatar = userAvatar();
      host.innerHTML =
        '<a class="heroauth-btn" href="' + DASHBOARD_URL + '">' +
          (avatar ? '<img src="' + esc(avatar) + '" alt="">' : '<i class="fas fa-table-columns"></i>') +
          'My properties</a>' +
        '<a class="heroauth-link nav" href="' + DASHBOARD_URL + '#wishlist">Wishlist</a>' +
        '<a class="heroauth-link nav" href="' + DASHBOARD_URL + '#saved">Saved</a>' +
        '<a class="heroauth-link nav pro" href="/property/pro">Pro Hub</a>' +
        '<button class="heroauth-link" onclick="plSignOut()">Sign out</button>';
    } else {
      host.innerHTML = '<button class="heroauth-btn ghost" onclick="plSignInPrompt()"><i class="fas fa-right-to-bracket"></i>Sign in to save properties</button>';
    }
  }

  function paintNav() {
    if (window.WatchdogPublicNav && typeof window.WatchdogPublicNav.setUser === 'function') window.WatchdogPublicNav.setUser(plUser);
    var right = elReal('wd-right');
    if (!right) return;
    right.innerHTML = plUser
      ? '<a href="/property/pro#plans">Pricing</a><a href="/property/pro">Pro Hub</a><a href="/property/dashboard">My Properties</a><button onclick="plSignOut()">Sign out</button>'
      : '<a href="/property/pro#plans">Pricing</a><a href="/property/pro">Pro Hub</a><a href="/property/dashboard">My Properties</a><button onclick="plSignInPrompt()">Sign in</button>';
  }

  function paintAuthBtn() {
    paintNav();
    paintHeroAuth();
    var button = el('pl-authbtn');
    if (!button) return;
    if (plUser) {
      var avatar = userAvatar();
      button.innerHTML = (avatar ? '<img src="' + esc(avatar) + '" alt="" class="auth-av">' : '<i class="fas fa-user"></i>') + '<span>' + esc(userName().split(' ')[0]) + '</span>';
      button.onclick = plDashboard;
      button.title = 'Your saved properties';
    } else {
      button.innerHTML = '<i class="fas fa-right-to-bracket"></i><span>Sign in</span>';
      button.onclick = plSignInPrompt;
      button.title = 'Save properties to your account';
    }
  }

  window.plSignInPrompt = openCanonicalSignIn;

  window.plSignOut = function () {
    if (!authReady()) return;
    sb.auth.signOut().then(function () {
      plUser = null;
      paintAuthBtn();
      applyGates();
      plCloseNote();
    });
  };

  window.plDashboard = function () {
    if (!plUser) { openCanonicalSignIn(); return; }
    window.location.href = DASHBOARD_URL;
  };

  // ── save / claim from the property panel ──
  function propertyPayload(kind) {
    var v = current.valuation, a = current.appeal;
    return {
      kind: kind, pams_pin: current.pin, address: current.address,
      town: current.town, county: current.county, zip: current.zip,
      block: current.block, lot: current.lot,
      assessed: current.assessed || null,
      last_year_tax: current.tax || null,
      effective_rate: current.rate ? +current.rate.toFixed(3) : null,
      watchdog_value: v && v.mid ? Math.round(v.mid) : null,
      has_appeal_case: !!(a && a.hasCase),
      lat: current.lat != null ? +(+current.lat).toFixed(6) : null,
      lon: current.lon != null ? +(+current.lon).toFixed(6) : null
    };
  }

  window.plSaveTo = function (kind) {
    if (!plUser) { plSignInPrompt(); return; }
    if (!current || !current.pin) { toast('Nothing to save yet'); return; }
    sb.rpc('save_property', { p: propertyPayload(kind) }).then(function (res) {
      if (res.error) { toast('Could not save, try again'); return; }
      toast(kind === 'home' ? 'Saved as your home' : 'Added to your watchlist');
      refreshSaveState();
      if (kind === 'home' && window.NJPTRVerification) {
        window.NJPTRVerification.open({
          client: sb, pin: current.pin, address: current.address, town: current.town, zip: current.zip,
          modal: window.plModalNote, close: window.plCloseNote, toast: toast,
          onVerified: refreshSaveState
        });
      }
      if (typeof gtag === 'function') gtag('event', 'save_property', { kind: kind });
    });
  };

  window.plRemoveSaved = function (id) {
    if (!plUser) return;
    sb.from('saved_properties').delete().eq('id', id).then(function () { refreshSaveState(); });
  };

  function refreshSaveState() {
    var wrap = el('plm-account');
    if (!wrap) return;
    if (!plUser) {
      wrap.innerHTML =
        '<div class="acct-cta">' +
          '<div class="acct-cta-t"><i class="fas fa-bookmark"></i> Keep track of this property</div>' +
          '<p>Claim it as your home or add it to a watchlist, and see how the assessment moves each year.</p>' +
          '<button class="plm-rbtn" onclick="plSignInPrompt()">Create a free account</button>' +
        '</div>';
      return;
    }
    sb.from('saved_properties').select('id,kind').eq('pams_pin', current.pin).then(function (res) {
      var rows = (res && res.data) || [];
      var isHome = rows.some(function (r) { return r.kind === 'home'; });
      var isWatch = rows.some(function (r) { return r.kind === 'watch'; });
      wrap.innerHTML =
        '<div class="acct-cta signed">' +
          '<div class="acct-cta-t"><i class="fas fa-bookmark"></i> Keep track of this property</div>' +
          '<div class="acct-row">' +
            '<button class="acct-btn' + (isHome ? ' on' : '') + '" onclick="plSaveTo(\'home\')">' +
              '<i class="fas fa-house-chimney"></i> ' + (isHome ? 'This is my home' : 'Claim as my home') + '</button>' +
            '<button class="acct-btn' + (isWatch ? ' on' : '') + '" onclick="plSaveTo(\'watch\')">' +
              '<i class="fas fa-eye"></i> ' + (isWatch ? 'On your watchlist' : 'Add to watchlist') + '</button>' +
          '</div>' +
          '<a class="acct-link" href="' + DASHBOARD_URL + '">Open my dashboard <i class="fas fa-arrow-right"></i></a>' +
        '</div>';
    });
  }

  // ══════════════════════════════════════════════
  // DASHBOARD
  // ══════════════════════════════════════════════
  // The dashboard is a real page, not an overlay. Signed out visitors get the
  // sign in prompt first, otherwise they would land on a locked page.
  window.plDashboard = function () {
    if (!plUser) { plSignInPrompt(); return; }
    window.location.href = DASHBOARD_URL;
  };



  // ══════════════════════════════════════════════
  // MORTGAGE CALCULATOR  ·  Greentree Mortgage
  // Seeds itself with this property's real tax figure, which is the whole
  // reason it belongs on a tax page: the escrow line is already known.
  // ══════════════════════════════════════════════
  function buildMortgageCalc() {
    var v = current.valuation;
    var guess = v && v.mid ? Math.round(v.mid / 1000) * 1000 : (current.assessed || 300000);
    var monthlyTax = current.tax ? Math.round(current.tax / 12) : 0;

    return '<div class="mtg-wrap">' +
      '<div class="mtg-head">' +
        '<div>' +
          '<div class="mtg-eyebrow">Sponsored by Greentree Mortgage, an HMA Company</div>' +
          '<h3 class="plm-sec-h" style="margin:0;">What would the monthly payment be?</h3>' +
          '<p class="plm-sec-s" style="margin:6px 0 0;">Most calculators guess at your taxes. This one already knows them, because it just read them off the assessment for ' +
          esc(current.address) + '.</p>' +
        '</div>' +
      '</div>' +
      '<div class="pl-card mtg-card">' +
        '<div class="mtg-grid">' +
          '<div class="mtg-inputs">' +
            '<div class="mtg-row">' +
              '<label>Purchase price</label>' +
              '<div class="pl-zcalc-input-wrap"><span>$</span>' +
              '<input type="text" class="pl-zcalc-input" id="mtg-price" value="' + guess.toLocaleString() + '" oninput="plFormatNum(this); plMortgage()"></div>' +
            '</div>' +
            '<div class="mtg-row">' +
              '<label>Down payment</label>' +
              '<div class="pl-zcalc-input-wrap"><span>%</span>' +
              '<input type="number" class="pl-zcalc-input" id="mtg-down" value="10" step="0.5" min="0" max="100" oninput="plMortgage()"></div>' +
            '</div>' +
            '<div class="mtg-row">' +
              '<label>Interest rate</label>' +
              '<div class="pl-zcalc-input-wrap"><span>%</span>' +
              '<input type="number" class="pl-zcalc-input" id="mtg-rate" value="6.5" step="0.125" oninput="plMortgage()"></div>' +
            '</div>' +
            '<div class="mtg-row">' +
              '<label>Term</label>' +
              '<select class="pl-zcalc-input" id="mtg-term" onchange="plMortgage()" style="text-align:left;padding-left:12px;">' +
                '<option value="30">30 years</option><option value="20">20 years</option>' +
                '<option value="15">15 years</option><option value="10">10 years</option>' +
              '</select>' +
            '</div>' +
            '<div class="mtg-row">' +
              '<label>Property tax, monthly</label>' +
              '<div class="pl-zcalc-input-wrap"><span>$</span>' +
              '<input type="text" class="pl-zcalc-input" id="mtg-tax" value="' + monthlyTax.toLocaleString() + '" oninput="plFormatNum(this); plMortgage()"></div>' +
            '</div>' +
            '<div class="mtg-row">' +
              '<label>Insurance, monthly</label>' +
              '<div class="pl-zcalc-input-wrap"><span>$</span>' +
              '<input type="text" class="pl-zcalc-input" id="mtg-ins" value="125" oninput="plFormatNum(this); plMortgage()"></div>' +
            '</div>' +
          '</div>' +
          '<div class="mtg-out">' +
            '<div class="mtg-total" id="mtg-total">-</div>' +
            '<div class="mtg-total-lbl">Estimated monthly payment</div>' +
            '<div class="mtg-breakdown" id="mtg-breakdown"></div>' +
            '<div class="mtg-taxshare" id="mtg-taxshare"></div>' +
            '<a href="' + GREENTREE_URL + '" target="_blank" rel="noopener" class="mtg-btn">' +
              'Get a real rate from Greentree <i class="fas fa-arrow-right"></i></a>' +
          '</div>' +
        '</div>' +
        '<div class="mtg-disc">Estimate only, for information. Not a loan offer, a rate quote, or a commitment to lend. ' +
        'Actual terms depend on credit, income, property, and market conditions. Greentree Mortgage, an HMA Company, is a separate company ' +
        'and is not affiliated with Opus Elite Real Estate. You are never required to use any particular lender.</div>' +
      '</div>';
  }

  window.plMortgage = function () {
    function v(id) {
      var e = el(id); if (!e) return 0;
      if (e.type === 'number' || e.tagName === 'SELECT') return parseFloat(e.value) || 0;
      return parseFloat(String(e.value).replace(/[^0-9.]/g, '')) || 0;
    }
    var price = v('mtg-price'), downPct = v('mtg-down'), rate = v('mtg-rate');
    var term = v('mtg-term'), tax = v('mtg-tax'), ins = v('mtg-ins');
    var loan = price * (1 - downPct / 100);
    var i = rate / 100 / 12, n = term * 12;
    var pi = (i > 0 && n > 0) ? loan * (i * Math.pow(1 + i, n)) / (Math.pow(1 + i, n) - 1) : (n ? loan / n : 0);

    // PMI, roughly, when equity is under 20 percent
    var pmi = downPct < 20 && loan > 0 ? (loan * 0.0055) / 12 : 0;
    var total = pi + tax + ins + pmi;

    var t = el('mtg-total');
    if (t) t.textContent = money(total);
    var b = el('mtg-breakdown');
    if (b) {
      b.innerHTML =
        '<div class="mtg-line"><span>Principal and interest</span><b>' + money(pi) + '</b></div>' +
        '<div class="mtg-line"><span>Property tax</span><b>' + money(tax) + '</b></div>' +
        '<div class="mtg-line"><span>Insurance</span><b>' + money(ins) + '</b></div>' +
        (pmi > 0 ? '<div class="mtg-line"><span>Estimated PMI</span><b>' + money(pmi) + '</b></div>' : '') +
        '<div class="mtg-line" style="border:none;padding-top:9px;"><span>Loan amount</span><b>' + money(loan) + '</b></div>';
    }
    var ts = el('mtg-taxshare');
    if (ts && total > 0 && tax > 0) {
      var pct = Math.round((tax / total) * 100);
      ts.innerHTML = '<i class="fas fa-circle-info"></i> Property tax is <b>' + pct +
        '%</b> of this payment. That is the part an assessment appeal can actually move.';
    }
  };

  // ══════════════════════════════════════════════
  // PREAPPROVAL
  // ══════════════════════════════════════════════
  function buildPreapproval() {
    return '<div class="pre-wrap">' +
      '<div class="pre-photo"><img src="/johnvarano.jpg" alt="John Varano, Branch Manager, Greentree Mortgage an HMA Company" loading="lazy" onerror="this.parentNode.style.display=\'none\'"></div>' +
      '<div class="pre-body">' +
        '<div class="pre-eyebrow">Greentree Mortgage &middot; Advertisement</div>' +
        '<h3>Get preapproved before you shop</h3>' +
        '<p>A preapproval letter tells you the real number you can spend and makes your offer count when there is competition. ' +
        '<b>John Varano</b> is Branch Manager at Greentree Mortgage, an HMA Company, and handles the loan side for buyers across South Jersey.</p>' +
        '<ul class="pre-list">' +
          '<li><i class="fas fa-circle-check"></i>Know your true budget, taxes and escrow included</li>' +
          '<li><i class="fas fa-circle-check"></i>Sellers take preapproved offers more seriously</li>' +
          '<li><i class="fas fa-circle-check"></i>Find credit issues early, while there is time to fix them</li>' +
        '</ul>' +
        '<div class="pre-cta">' +
          '<a href="' + GREENTREE_URL + '" target="_blank" rel="noopener" class="pre-btn">Start my preapproval <i class="fas fa-arrow-right"></i></a>' +
          '<span class="pre-note">Opens johnvarano.com</span>' +
        '</div>' +
      '</div>' +
      '<div class="pre-disc">Advertisement. Greentree Mortgage, an HMA Company, is a separate company and is not affiliated with Opus Elite Real Estate. ' +
      'You are never required to use any particular lender and you are free to shop for a mortgage. Nothing here is a loan commitment, an offer of credit, or a guarantee of terms.</div>' +
    '</div>';
  }

  // ══════════════════════════════════════════════
  // LISTING PROPOSAL
  // Small overlay, never leaves the page.
  // ══════════════════════════════════════════════
  window.plProposal = function () {
    var a = AGENTS[activeAgentKey];
    plModalNote('Free listing proposal',
      '<div class="prop-agent">' +
        '<img src="' + a.photo + '" alt="' + esc(a.name) + '">' +
        '<div><b>' + esc(a.name) + '</b> can help you sell ' + esc(current.address) + '<br>' +
        '<span style="font-size:13px;color:#5a6070;">' + esc(a.team) + '  \u00b7  ' + esc(a.lic) + '</span></div>' +
      '</div>' +
      '<p style="margin-top:4px;">Your proposal covers what the home should list for and why, what it nets you after costs, ' +
      'the marketing plan, my commission in writing, and a review of your tax assessment before we go live. ' +
      '<b>No obligation and no cost.</b></p>' +
      '<div class="pl-form" style="grid-template-columns:1fr;">' +
        '<input id="prop-name" type="text" placeholder="Full name" autocomplete="name">' +
        '<input id="prop-email" type="email" placeholder="Email" autocomplete="email">' +
        '<input id="prop-phone" type="tel" placeholder="Phone" autocomplete="tel">' +
        '<select id="prop-when">' +
          '<option value="">When are you thinking of selling?</option>' +
          '<option>As soon as possible</option><option>1 to 3 months</option>' +
          '<option>3 to 6 months</option><option>6 to 12 months</option>' +
          '<option>Just want the numbers</option>' +
        '</select>' +
        '<button onclick="plSendProposal()">Send me the proposal</button>' +
      '</div>' +
      '<div class="prop-promise"><i class="fas fa-clock"></i> <span>Your proposal arrives <b>within one business day</b>. ' +
      'It comes from me directly, not an automated system, and no one else gets your information.</span></div>');
  };

  window.plSendProposal = function () {
    var name = (el('prop-name').value || '').trim();
    var email = (el('prop-email').value || '').trim();
    var phone = (el('prop-phone').value || '').trim();
    var when = (el('prop-when').value || '').trim() || 'Not stated';
    if (!name || !email) { alert('Please add your name and email so I know where to send it.'); return; }

    var a = AGENTS[activeAgentKey];
    send({
      name: name, email: email, phone: phone || 'Not provided',
      topic: '\u2b50 PROPOSAL REQUEST \u2b50 [' + (current.town || 'NJ') + '] ' + esc(current.address) + ' (' + activeAgentKey + ')',
      tenure: 'Homeowner', lead_type: 'Homeowner', finance: 'Not provided',
      town: current.town || 'Not provided', address: current.address || 'Not provided',
      message: ['*** LISTING PROPOSAL REQUESTED, RESPOND WITHIN ONE BUSINESS DAY ***',
                'Requested agent: ' + a.name,
                'Timing: ' + when]
        .concat(propertyLines())
        .concat(current.valuation ? ['Watchdog Tax Value: ' + money(current.valuation.mid)] : [])
        .concat(['Source: property-lookup.html, proposal modal']).join('\n')
    });
    if (typeof gtag === 'function') gtag('event', 'generate_lead', { source: 'listing_proposal' });

    el('plm-note-overlay').innerHTML =
      '<div class="plm-note-box" style="text-align:center;">' +
        '<div style="font-size:44px;color:var(--green);margin-bottom:12px;"><i class="fas fa-circle-check"></i></div>' +
        '<h3>Your proposal is on the way</h3>' +
        '<p>I will have it to you <b>within one business day</b>, covering ' + esc(current.address) +
        '. If anything is urgent, call me directly at <b>' + esc(a.phone) + '</b>.</p>' +
        '<button class="plm-rbtn" onclick="plCloseNote()">Close</button>' +
      '</div>';
  };

  // ══════════════════════════════════════════════
  // AGENT RAIL
  // ══════════════════════════════════════════════
  window.plSetAgent = function (key) {
    activeAgentKey = key;
    var s = el('plm-agent-slot');
    if (s) s.innerHTML = buildAgentRail();
  };

  function buildAgentRail() {
    var a = AGENTS[activeAgentKey];
    var bio = a.bio.replace('{COUNTY}', (current && current.county) ? esc(current.county) : 'South Jersey');
    var phone = a.phone
      ? '<a href="tel:' + a.phone.replace(/\D/g, '') + '" class="gold"><i class="fas fa-phone"></i> ' + esc(a.phone) + '</a>' : '';
    return '<div class="plm-agent">' +
      '<div class="plm-agent-toggle">' +
        '<button class="' + (activeAgentKey === 'john' ? 'active' : '') + '" onclick="plSetAgent(\'john\')">John</button>' +
        '<button class="' + (activeAgentKey === 'heather' ? 'active' : '') + '" onclick="plSetAgent(\'heather\')">Heather</button>' +
      '</div>' +
      '<div class="plm-agent-row">' +
        '<img src="' + a.photo + '" alt="' + esc(a.name) + '" loading="lazy">' +
        '<div><div class="plm-agent-nm">' + esc(a.name) + '</div>' +
        '<div class="plm-agent-ti">' + esc(a.title) + '</div>' +
        '<div class="plm-agent-li">' + esc(a.lic) + '</div></div>' +
      '</div>' +
      '<div class="plm-agent-bio">' + bio + '</div>' +
      '<div class="plm-creds">' +
        '<div class="plm-cred"><b>' + esc(a.sales) + '</b><span>Recent sales</span></div>' +
        '<div class="plm-cred"><b>' + esc(a.stars) + ' \u2605</b><span>' + (a.reviews === 'New' ? 'New agent' : a.reviews + ' reviews') + '</span></div>' +
        '<div class="plm-cred"><b>NJ</b><span>Licensed ' + esc(a.lic.replace('NJ License ', '')) + '</span></div>' +
      '</div>' +
      '<div class="plm-trust">' +
        '<div><i class="fas fa-reply"></i> Replies within one business day</div>' +
        '<div><i class="fas fa-user-shield"></i> Your information is never sold or shared</div>' +
        '<div><i class="fas fa-file-contract"></i> Commission and terms in writing, up front</div>' +
      '</div>' +
      '<div class="plm-proposal">' +
        '<div class="plm-proposal-top"><i class="fas fa-file-signature"></i><span>Thinking of selling?</span></div>' +
        '<button class="plm-proposal-btn" onclick="plProposal()">View proposal</button>' +
        '<div class="plm-proposal-fine">Free, no commitment. Pricing, net proceeds, and marketing plan, delivered within one business day.</div>' +
      '</div>' +
      '<div class="plm-agent-btns">' + phone +
        '<a href="mailto:' + esc(a.email) + '"><i class="fas fa-envelope"></i> Email ' + esc(a.name.split(' ')[0]) + '</a>' +
        '<a href="/index.html#contact"><i class="fas fa-calendar-check"></i> Book a call</a>' +
      '</div>' +
      '<img class="plm-agent-logo" src="' + a.logo + '" alt="Opus Elite Real Estate" onerror="this.style.display=\'none\'">' +
    '</div>';
  }

  // ══════════════════════════════════════════════
  // ZILLOW STYLE AGENT MATCHES
  // ══════════════════════════════════════════════
  function buildZillowMatches() {
    var where = (current && current.zip) ? esc(current.zip) : 'this area';
    return '<h3 class="plm-sec-h">Agent matches for ' + where + '</h3>' +
      '<div class="z-matches-alert"><i class="fas fa-trophy"></i> <span>Featured based on recent sales and local expertise in this area.</span></div>' +
      '<div class="z-matches-scroll">' + buildZillowCard('john') + buildZillowCard('heather') + '</div>';
  }
  function buildZillowCard(key) {
    var a = AGENTS[key];
    return '<div class="z-match-card">' +
      '<img class="z-match-avatar" src="' + a.photo + '" alt="' + esc(a.name) + '">' +
      '<div class="z-match-info">' +
        '<div class="z-match-name-row">' +
          '<h4 class="z-match-name">' + esc(a.name) + '</h4>' +
          '<div class="z-match-rating">' + a.stars + ' <i class="fas fa-star"></i>' +
            (a.reviewUrl ? '<a href="' + a.reviewUrl + '" target="_blank" rel="noopener"><span>(' + a.reviews + ')</span></a>'
                         : '<span>(' + a.reviews + ')</span>') +
          '</div>' +
        '</div>' +
        '<div class="z-match-broker">' + esc(a.team) + '</div>' +
        '<div class="z-match-stat"><strong>' + a.sales + '</strong> recent sales</div>' +
        '<div class="z-match-stat"><strong>' + a.salesNear + '</strong> sales near you</div>' +
        '<button class="plm-rbtn" style="margin-top:12px;padding:10px;font-size:13.5px;" onclick="plSetAgent(\'' + key + '\');plOpenForm(\'value\')">Contact ' + esc(a.name.split(' ')[0]) + '</button>' +
      '</div>' +
    '</div>';
  }

  function buildAppeal() {
    return '<div class="plm-agent" id="pl-appeal">' +
      '<h3 style="font-family:\'Playfair Display\',Georgia,serif;font-size:24px;margin:0 0 9px;">Is this assessment fair?</h3>' +
      '<p style="font-size:14.5px;color:#cdd9ec;line-height:1.7;margin:0 0 18px;">I will pull recent comparable sales for this address, work out the market value your town is implying, and tell you straight whether an appeal is worth your time. If the numbers do not support it, I will say so.</p>' +
      '<div class="pl-form">' +
        '<input id="pl-name" type="text" placeholder="Your name" autocomplete="name">' +
        '<input id="pl-email" type="email" placeholder="Email" autocomplete="email">' +
        '<input id="pl-phone" class="pl-wide" type="tel" placeholder="Phone (optional)" autocomplete="tel">' +
        '<button onclick="plSendLead()">Check my assessment for free</button>' +
      '</div>' +
      '<div class="pl-fine">This address and the figures above go with the request so I have what I need. No charge, no pitch, no sharing your information.</div>' +
    '</div>';
  }

  // ══════════════════════════════════════════════
  // INTENT FORMS  (rail card swaps in place)
  // ══════════════════════════════════════════════
  var INTENTS = {
    track: { topic: '[\uD83D\uDCC8 TRACKING] Monthly value report signup', label: 'Track this home',
             blurb: 'One email a month with the current value, nearby sales, and any assessment change.', rel: true },
    value: { topic: '[\uD83D\uDD25 HOT][Homeowner] Home value request', label: 'What is it worth today?',
             blurb: 'I will run current comparable sales and send you a real valuation, not an algorithm guess.' },
    sell:  { topic: '[\uD83D\uDD25 HOT][Homeowner] Wants to SELL this property', label: 'Sell this home',
             blurb: 'Tell me your timing and I will put together a pricing strategy and a net proceeds breakdown.' },
    buy:   { topic: '[\u2600\uFE0F WARM] Buyer lead, wants a home like this', label: 'Buy a home like this',
             blurb: 'Tell me what you are after and I will set you up with listings that match this style and price range.' },
    offer: { topic: '[\uD83D\uDD25 HOT] Wants to make an OFFER on this property', label: 'Make an offer',
             blurb: 'This home may not be listed. I can reach out to the owner on your behalf and find out where they stand.' },
    appeal: { topic: '[\uD83D\uDD25 HOT][Homeowner] APPEAL screening request', label: 'Check my appeal case',
             blurb: 'The public numbers suggest this assessment may be above where it should sit. I will pull real comps and the official ratio for your tax year and tell you straight whether it is worth filing.' },
    comps: { topic: '[\uD83D\uDD25 HOT][Homeowner] Real comps request', label: 'Send me the real comps',
             blurb: 'I will pull the MLS comps for this address with condition, upgrades, days on market, and what actually closed versus what was asked.' },
    premier: { topic: '[\uD83D\uDD25 HOT][Homeowner] Listing appointment request', label: 'List with John and Heather',
             blurb: 'Full service listing. Tell me your timing and I will send a pricing strategy, a net proceeds breakdown, and a review of your assessment before we go live.' },
    ownagent: { topic: '[\u2600\uFE0F WARM] Agent wants a listing featured', label: 'Feature my listing',
             blurb: 'Send me the address and your brokerage. We will feature the listing on this site free, no strings, no referral fee.' },
    fsbo:   { topic: '[\u2600\uFE0F WARM][Homeowner] FSBO showcase request', label: 'List my home free',
             blurb: 'Going for sale by owner? Send the details and we will showcase it here at no cost. If you get stuck partway through, I am around, but there is no obligation.' }
  };

  window.plOpenForm = function (kind) {
    var m = el('plm-menu'); if (m) m.classList.remove('open');
    var it = INTENTS[kind]; if (!it) return;
    var card = el('pl-track-card'); if (!card) return;
    card.innerHTML =
      '<h4>' + esc(it.label) + '</h4>' +
      '<p>' + esc(it.blurb) + '</p>' +
      '<div class="pl-form" style="grid-template-columns:1fr;">' +
        '<input id="pl-fname" type="text" placeholder="Your name" autocomplete="name">' +
        '<input id="pl-femail" type="email" placeholder="Email" autocomplete="email">' +
        '<input id="pl-fphone" type="tel" placeholder="Phone (optional)" autocomplete="tel">' +
        (it.rel
          ? '<select id="pl-frel"><option value="">I am the...</option><option>Owner, I live here</option><option>Owner, I rent it out</option><option>Tenant</option><option>Just researching</option></select>'
          : '<select id="pl-fwhen"><option value="">Timing</option><option>As soon as possible</option><option>1 to 3 months</option><option>3 to 6 months</option><option>6 to 12 months</option><option>Just exploring</option></select>') +
        '<button onclick="plSubmitForm(\'' + kind + '\')">Send to ' + esc(AGENTS[activeAgentKey].name.split(' ')[0]) + '</button>' +
      '</div>' +
      '<div class="pl-fine">The address, block and lot, and tax figures go with your message. <a href="#" onclick="plResetCard();return false;">Back</a></div>';
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  window.plResetCard = function () {
    var card = el('pl-track-card'); if (!card) return;
    card.innerHTML =
      '<h4><i class="fas fa-chart-line" style="color:var(--gold)"></i> Track this home</h4>' +
      '<p>One email a month: what it is worth now, what sold nearby, and any change to the assessment or tax rate.</p>' +
      '<button class="plm-rbtn" onclick="plOpenForm(\'track\')"><i class="fas fa-bell"></i>&nbsp; Start tracking</button>' +
      '<button class="plm-rbtn ghost" onclick="plOpenForm(\'value\')">What is it worth today?</button>' +
      '<button class="plm-rbtn ghost" onclick="plOpenForm(\'sell\')">I want to sell this home</button>';
  };

  window.plSubmitForm = function (kind) {
    var it = INTENTS[kind];
    var name = (el('pl-fname').value || '').trim();
    var email = (el('pl-femail').value || '').trim();
    var phone = (el('pl-fphone').value || '').trim();
    if (!name || !email) { alert('Please add your name and email.'); return; }

    var relEl = el('pl-frel'), whenEl = el('pl-fwhen');
    var rel = relEl ? (relEl.value || 'Not stated') : '';
    var when = whenEl ? (whenEl.value || 'Not stated') : '';
    var tenure = rel ? (/tenant/i.test(rel) ? 'Renter' : (/owner/i.test(rel) ? 'Homeowner' : 'Unknown'))
                     : ((kind === 'buy' || kind === 'offer') ? 'Unknown' : 'Homeowner');

    send({
      name: name, email: email, phone: phone || 'Not provided',
      topic: it.topic + ', ' + (current.town || 'NJ') + ' (' + activeAgentKey + ')',
      tenure: tenure, lead_type: tenure, finance: 'Not provided',
      town: current.town || 'Not provided', address: current.address || 'Not provided',
      message: [it.label + ' request from the Property Lookup tool',
                rel ? 'Relationship to property: ' + rel : 'Timing: ' + when,
                'Tenure: ' + tenure, 'Requested agent: ' + AGENTS[activeAgentKey].name]
        .concat(propertyLines()).concat(['Source: property-lookup.html']).join('\n')
    });
    if (typeof gtag === 'function') gtag('event', 'generate_lead', { source: 'property_lookup_' + kind });

    el('pl-track-card').innerHTML =
      '<div class="pl-sent"><i class="fas fa-circle-check"></i> Sent.<br>' +
      esc(AGENTS[activeAgentKey].name.split(' ')[0]) + ' will get back to you about ' + esc(current.address) + ' within one business day.</div>';
  };

  window.plSendLead = function () {
    var name = (el('pl-name').value || '').trim();
    var email = (el('pl-email').value || '').trim();
    var phone = (el('pl-phone').value || '').trim();
    if (!name || !email) { alert('Please add your name and email so I know where to send it.'); return; }
    send({
      name: name, email: email, phone: phone || 'Not provided',
      topic: '[\uD83D\uDD25 HOT][Homeowner] Assessment review request, ' + (current.town || 'NJ') + ' (' + activeAgentKey + ')',
      tenure: 'Homeowner', lead_type: 'Homeowner', finance: 'Not provided',
      town: current.town || 'Not provided', address: current.address || 'Not provided',
      message: ['Assessment review request from the Property Lookup tool',
                'Tenure: Homeowner (looked up their own property)']
        .concat(propertyLines()).concat(['Source: property-lookup.html']).join('\n')
    });
    if (typeof gtag === 'function') gtag('event', 'generate_lead', { source: 'property_lookup_review' });
    el('pl-appeal').innerHTML = '<div class="pl-sent"><i class="fas fa-circle-check"></i> Got it.<br>I will review ' + esc(current.address) + ' and get back to you within one business day.</div>';
  };

  // ══════════════════════════════════════════════
  // TOP BAR ACTIONS
  // ══════════════════════════════════════════════
  window.plMenu = function (e) { e.stopPropagation(); el('plm-menu').classList.toggle('open'); };
  document.addEventListener('click', function (e) {
    var m = el('plm-menu');
    if (m && m.classList.contains('open') && !m.contains(e.target)) m.classList.remove('open');
  });

  window.plSaveHome = function () {
    if (!current) return;
    var btn = el('plm-save');
    var saved = JSON.parse(localStorage.getItem('pl_saved') || '{}');
    var k = current.pin || current.address;
    if (saved[k]) { delete saved[k]; btn.classList.remove('saved'); btn.innerHTML = '<i class="far fa-heart"></i><span>Save</span>'; toast('Removed'); }
    else {
      saved[k] = { a: current.address, t: current.town, v: current.assessed, d: Date.now() };
      btn.classList.add('saved'); btn.innerHTML = '<i class="fas fa-heart"></i><span>Saved</span>'; toast('Saved to this browser');
    }
    localStorage.setItem('pl_saved', JSON.stringify(saved));
  };

  function shareUrl() {
    return location.origin + location.pathname + '?address=' +
      encodeURIComponent(current.address + ', ' + current.town + ', NJ ' + current.zip);
  }
  window.plCopy = function () {
    var m = el('plm-menu'); if (m) m.classList.remove('open');
    var url = shareUrl();
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { toast('Link copied'); })
      .catch(function () { window.prompt('Copy this link:', url); });
    else window.prompt('Copy this link:', url);
  };
  window.plShare = function () {
    var m = el('plm-menu'); if (m) m.classList.remove('open');
    if (navigator.share) navigator.share({ title: current.address, text: 'Property record for ' + current.address, url: shareUrl() }).catch(function () {});
    else window.plCopy();
  };
  window.plDirections = function () {
    var m = el('plm-menu'); if (m) m.classList.remove('open');
    window.open('https://www.google.com/maps/dir/?api=1&destination=' + current.lat + ',' + current.lon, '_blank', 'noopener');
  };
  window.plScrollTo = function (id) {
    var m = el('plm-menu'); if (m) m.classList.remove('open');
    var t = el(id); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  // photo swap
  var showingStreet = true;
  window.plSwapPhoto = function () {
    if (!current) return;
    var img = el('plm-photo-img'), c = el('plm-credit'), b = el('plm-swap');
    showingStreet = !showingStreet;
    if (showingStreet) {
      img.src = streetUrl(current.lat, current.lon) || aerialUrl(bboxFor(), 900, 600);
      c.textContent = 'Street level imagery, Google';
      if (b) b.innerHTML = '<i class="fas fa-repeat"></i> Aerial view';
    } else {
      img.src = aerialUrl(bboxFor(), 900, 600);
      c.textContent = 'Aerial imagery, Esri World Imagery';
      if (b) b.innerHTML = '<i class="fas fa-repeat"></i> Street view';
    }
  };
  window.plPhotoFail = function () {
    if (!current) return;
    var img = el('plm-photo-img'); img.onerror = null;
    img.src = aerialUrl(bboxFor(), 900, 600);
    var c = el('plm-credit'); if (c) c.textContent = 'Aerial imagery, Esri World Imagery';
    var b = el('plm-swap'); if (b) b.style.display = 'none';
    showingStreet = false;
  };
  // ══════════════════════════════════════════════
  // EMAIL
  // ══════════════════════════════════════════════
  function propertyLines() {
    return [
      'Property: ' + current.address,
      'Town: ' + current.town + ', ' + current.county + ' County ' + current.zip,
      'Block / Lot: ' + current.block + ' / ' + current.lot,
      'PAMS PIN: ' + current.pin,
      'Listing status shown: ' + (current.status || 'n/a'),
      'Assessed value: ' + (current.assessed ? money(current.assessed) : 'n/a'),
      'Prior year tax: ' + (current.tax ? money(current.tax) : 'n/a'),
      'Effective rate: ' + (current.rate ? current.rate.toFixed(2) + '%' : 'n/a'),
      'Year built: ' + (current.yearBuilt || 'n/a'),
      'Lot size: ' + (current.sqft ? current.sqft.toLocaleString() + ' sq ft' : 'n/a'),
      'Last sale: ' + (current.sale > 1000 ? money(current.sale) + (current.deedYear ? ' in ' + current.deedYear : '') : 'not recorded')
    ];
  }
  function send(payload) {
    if (typeof emailjs === 'undefined') return;
    emailjs.init({ publicKey: EJS_PUBLIC });
    emailjs.send(EJS_SERVICE, EJS_TMPL, payload).catch(function (e) { console.warn('EmailJS:', e); });
  }

  window.plFaq = function (q) { q.parentElement.classList.toggle('active'); };

  plInitAuth();
  scheduleReferenceWarmup();


  // ══════════════════════════════════════════════
  // STICKY LANDING SEARCH
  // Slides in once the hero search has scrolled out of reach, slides away
  // again when you come back up to it.
  // ══════════════════════════════════════════════
  window.ssGo = function () {
    var a = el('ss-addr'), main = el('pl-addr');
    if (!a || !main) return;
    var v = (a.value || '').trim();
    if (!v) { a.focus(); return; }
    main.value = v;
    window.plLookup();
  };

  (function stickySearch() {
    var bar = el('ssearch'), hero = document.querySelector('.pl-search-card');
    if (!bar || !hero) return;
    var ticking = false;
    function update() {
      ticking = false;
      var r = hero.getBoundingClientRect();
      // once the hero search box is off the top of the screen, take over
      bar.classList.toggle('on', r.bottom < 8);
    }
    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    window.addEventListener('resize', update, { passive: true });
    update();
  })();


  // Nav goes solid once the hero is behind you.
  (function navScroll() {
    var n = document.getElementById('wd-nav');
    if (!n) return;
    var hero = document.querySelector('.pl-hero');
    var ticking = false;
    function upd() {
      ticking = false;
      var past = hero ? (hero.getBoundingClientRect().bottom < 70) : (window.scrollY > 40);
      n.classList.toggle('solid', past);
    }
    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; requestAnimationFrame(upd); }
    }, { passive: true });
    upd();
  })();

  // Days to the filing deadline, on the glance panel.
  (function insDays() {
    var e = document.getElementById('ins-days');
    if (!e) return;
    var now = new Date(), apr = new Date(now.getFullYear(), 3, 1);
    if (now > apr) apr = new Date(now.getFullYear() + 1, 3, 1);
    e.textContent = Math.ceil((apr - now) / 864e5);
  })();

  var qs = new URLSearchParams(window.location.search);
  if (qs.get('address')) {
    el('pl-addr').value = qs.get('address');
    setTimeout(window.plLookup, 500);
  }

})();
