/* Watchdog free map preview runtime
 * Replaces property photography and legacy Street View/aerial thumbnails with
 * a consistent, address-centered map preview from the NJ Office of GIS.
 * It also preempts Property Home Street View so passive property surfaces do
 * not create billable Google Static or Dynamic Street View requests.
 */
(function () {
  'use strict';
  if (window.__WATCHDOG_FREE_IMAGERY_GRID__) return;
  window.__WATCHDOG_FREE_IMAGERY_GRID__ = true;

  var NJ_MAP = 'https://maps.nj.gov/arcgis/rest/services/Basemap/LtGray_NJ_WM/MapServer/export';
  var NJ_GEOCODE = 'https://geo.nj.gov/arcgis/rest/services/Tasks/NJ_Geocode/GeocodeServer/findAddressCandidates';
  var STREET = /^https:\/\/maps\.googleapis\.com\/maps\/api\/streetview(?:\?|$)/i;
  var WORLD_EXPORT = /^https:\/\/services\.arcgisonline\.com\/ArcGIS\/rest\/services\/World_Imagery\/MapServer\/export(?:\?|$)/i;
  var NJ_AERIAL = /^https:\/\/maps\.nj\.gov\/arcgis\/rest\/services\/Basemap\/Orthos_Natural_2020_NJ_WM\/MapServer\/export(?:\?|$)/i;
  var NJ_MAP_RE = /^https:\/\/maps\.nj\.gov\/arcgis\/rest\/services\/Basemap\/LtGray_NJ_WM\/MapServer\/export(?:\?|$)/i;
  var MAP_TOKEN = '#wdmap=';
  var EMPTY = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="760" height="460" viewBox="0 0 760 460">' +
      '<rect width="760" height="460" fill="#eef2f4"/>' +
    '</svg>'
  );
  var geocodeCache = Object.create(null);
  var geocodePending = Object.create(null);
  var scanTimer = 0;

  var state = window.WatchdogFreeImageryGrid = {
    translated: 0,
    mapped: 0,
    geocoded: 0,
    failed: 0,
    installs: 0,
    reinforced: false,
    provider: 'NJ Office of GIS LtGray_NJ_WM',
    installedAt: new Date().toISOString()
  };

  function validNj(lat, lon) {
    lat = Number(lat); lon = Number(lon);
    return Number.isFinite(lat) && Number.isFinite(lon) &&
      lat >= 38.8 && lat <= 41.4 && lon >= -75.7 && lon <= -73.8;
  }

  function text(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  }

  function safeDecode(value) {
    try { return decodeURIComponent(value); } catch (_error) { return String(value || ''); }
  }

  function mapUrl(lat, lon, width, height) {
    width = Math.max(240, Math.min(1000, Number(width) || 640));
    height = Math.max(160, Math.min(760, Number(height) || 400));
    var latHalf = 0.0027;
    var aspect = width / height;
    var cos = Math.max(0.45, Math.cos(Number(lat) * Math.PI / 180));
    var lonHalf = latHalf * aspect / cos;
    return NJ_MAP + '?' + new URLSearchParams({
      bbox: [Number(lon) - lonHalf, Number(lat) - latHalf, Number(lon) + lonHalf, Number(lat) + latHalf].join(','),
      bboxSR: '4326',
      imageSR: '3857',
      size: Math.round(width) + ',' + Math.round(height),
      format: 'jpg',
      transparent: 'false',
      f: 'image'
    }).toString();
  }

  function parseSize(value) {
    var raw = text(value).toLowerCase().split('x');
    return {
      width: Math.max(240, Math.min(1000, Number(raw[0]) || 640)),
      height: Math.max(160, Math.min(760, Number(raw[1]) || 400))
    };
  }

  function centerFromBbox(value) {
    var parts = text(value).split(',').map(Number);
    if (parts.length !== 4 || parts.some(function (n) { return !Number.isFinite(n); })) return null;
    var lon = (parts[0] + parts[2]) / 2;
    var lat = (parts[1] + parts[3]) / 2;
    return validNj(lat, lon) ? { lat: lat, lon: lon } : null;
  }

  function tokenFor(source) {
    return EMPTY + MAP_TOKEN + encodeURIComponent(String(source || ''));
  }

  function tokenSource(value) {
    var raw = String(value || '');
    var i = raw.indexOf(MAP_TOKEN);
    return i >= 0 ? safeDecode(raw.slice(i + MAP_TOKEN.length)) : '';
  }

  function sourceInfo(value) {
    var raw = (tokenSource(value) || String(value || '')).replace(/&amp;/g, '&');
    if (!raw) return null;
    if (NJ_MAP_RE.test(raw)) {
      try {
        var existing = new URL(raw);
        var center = centerFromBbox(existing.searchParams.get('bbox') || '');
        return center ? { recognized: true, lat: center.lat, lon: center.lon, size: parseSize((existing.searchParams.get('size') || '').replace(',', 'x')) } : { recognized: true };
      } catch (_mapError) { return { recognized: true }; }
    }
    if (STREET.test(raw)) {
      try {
        var street = new URL(raw);
        var location = safeDecode(street.searchParams.get('location') || '');
        var size = parseSize(street.searchParams.get('size') || '640x400');
        var coords = location.split(',').map(Number);
        if (coords.length === 2 && validNj(coords[0], coords[1])) {
          return { recognized: true, lat: coords[0], lon: coords[1], size: size };
        }
        return { recognized: true, query: text(location), size: size };
      } catch (_streetError) { return { recognized: true }; }
    }
    if (WORLD_EXPORT.test(raw) || NJ_AERIAL.test(raw)) {
      try {
        var aerial = new URL(raw);
        var c = centerFromBbox(aerial.searchParams.get('bbox') || '');
        var sz = parseSize((aerial.searchParams.get('size') || '640,400').replace(',', 'x'));
        return c ? { recognized: true, lat: c.lat, lon: c.lon, size: sz } : { recognized: true, size: sz };
      } catch (_aerialError) { return { recognized: true }; }
    }
    return null;
  }

  function visualHost(img) {
    if (!img || !img.closest) return null;
    return img.closest('.wd-property-photo,.pr-card-media,.hd-shot,.hm-shot,.ch') ||
      (img.id === 'plm-photo-img' ? img.parentElement : null);
  }

  function propertyVisualImage(img) {
    if (!img) return false;
    if (img.dataset && img.dataset.wdMapImage === '1') return false;
    if (sourceInfo(img.getAttribute && img.getAttribute('src'))) return true;
    var host = visualHost(img);
    if (!host) return false;
    if (host.classList && host.classList.contains('wd-free-map-host')) return true;
    return !!(
      img.id === 'plm-photo-img' ||
      (host.matches && host.matches('.wd-property-photo,.pr-card-media,.hd-shot,.hm-shot,.ch'))
    );
  }

  function queryFromHost(host, info, img) {
    if (info && info.query) return text(info.query);
    if (host && host.dataset && host.dataset.wdMapQuery) return text(host.dataset.wdMapQuery);

    var card = host && host.closest ? host.closest('.hd-card') : null;
    if (card && card.dataset && card.dataset.address) return text(card.dataset.address);

    card = host && host.closest ? host.closest('.wd-property-card') : null;
    if (card) {
      var wh = card.querySelector('.wd-property-copy h3');
      var wp = card.querySelector('.wd-property-copy > p');
      if (wh) {
        var locality = wp ? text(wp.textContent) : '';
        return [text(wh.textContent), locality, /\bNJ\b/i.test(locality) ? '' : 'NJ'].filter(Boolean).join(', ');
      }
    }

    card = host && host.closest ? host.closest('.pr-card') : null;
    if (card) {
      var ph = card.querySelector('h3');
      var pp = card.querySelector('.pr-card-body > p');
      var town = pp ? text(pp.textContent).split(',')[0].split('·')[0].trim() : '';
      if (ph) return [text(ph.textContent), town, 'NJ'].filter(Boolean).join(', ');
    }

    if (host && host.classList && host.classList.contains('ch')) {
      var b = host.querySelector('b');
      var s = host.querySelector('span');
      if (b) return [text(b.textContent), s ? text(s.textContent) : '', 'NJ'].filter(Boolean).join(', ');
    }

    if (img && img.id === 'plm-photo-img') {
      var modal = document.getElementById('plm');
      var mh = modal && modal.querySelector('.plm-title,.plm-address,h2,h3');
      var input = document.getElementById('pl-addr');
      var q = input && text(input.value);
      if (q) return q;
      if (mh) return [text(mh.textContent), 'NJ'].join(', ');
      var alt = text(img.getAttribute('alt') || '').replace(/^(?:View|Map|Street View|Aerial view) of\s+/i, '');
      if (alt) return [alt, 'NJ'].join(', ');
    }

    if (host && host.classList && host.classList.contains('hm-shot')) {
      var hh = document.querySelector('#hm-body .hm-id h1,#hm-body .hm-id h2,#hm-body .hm-id strong');
      var hp = document.querySelector('#hm-body .hm-id p,#hm-body .hm-locality');
      if (hh) return [text(hh.textContent), hp ? text(hp.textContent) : '', 'NJ'].filter(Boolean).join(', ');
    }

    var altText = img ? text(img.getAttribute('alt') || '').replace(/^(?:View|Map|Street View|Aerial view) of\s+/i, '') : '';
    return altText ? [altText, 'NJ'].join(', ') : '';
  }

  function labelFor(host, query, img) {
    var label = query;
    if (!label && img) label = text(img.getAttribute('alt') || '');
    if (!label && host) label = text(host.getAttribute('aria-label') || '');
    return label ? 'Map of ' + label.replace(/,\s*NJ(?:\s+\d{5})?.*$/i, '') : 'Property map';
  }

  function ensureStyle() {
    if (document.getElementById('wd-free-map-preview-style')) return;
    var style = document.createElement('style');
    style.id = 'wd-free-map-preview-style';
    style.textContent = [
      '.wd-free-map-host{position:relative!important;overflow:hidden!important;background:#eef2f4!important}',
      '.wd-free-map-host>img.wd-free-map-image{display:block!important;width:100%!important;height:100%!important;object-fit:cover!important;object-position:center!important;filter:none!important;transform:none!important;background:#eef2f4!important}',
      '.wd-free-map-pin{position:absolute;left:50%;top:50%;z-index:3;transform:translate(-50%,-92%);width:30px;height:30px;border-radius:50% 50% 50% 0;background:#1677ff;box-shadow:0 3px 10px rgba(15,34,72,.22);rotate:-45deg;pointer-events:none}',
      '.wd-free-map-pin:after{content:"";position:absolute;left:50%;top:50%;width:10px;height:10px;border-radius:50%;background:#fff;transform:translate(-50%,-50%)}',
      '.wd-free-map-source{position:absolute;left:7px;bottom:6px;z-index:3;padding:3px 6px;border-radius:6px;background:rgba(255,255,255,.88);color:#536174;font:700 8px/1.15 Inter,Arial,sans-serif;letter-spacing:.02em;pointer-events:none;box-shadow:0 1px 4px rgba(15,34,72,.08)}',
      '.wd-free-map-loading{position:absolute;inset:0;display:grid;place-items:center;z-index:1;color:#64748b;font:700 11px/1.2 Inter,Arial,sans-serif;background:#eef2f4}',
      '.wd-free-map-host.wd-free-map-ready .wd-free-map-loading{display:none}',
      '.wd-free-map-host.wd-free-map-failed .wd-free-map-pin{display:none}',
      '.hm-shot.wd-free-map-host{background-image:none!important}',
      '.hm-shot.wd-free-map-host>img.wd-free-map-image{position:absolute!important;inset:0!important}',
      '.ch.wd-free-map-host>img.wd-free-map-image{height:150px!important;min-height:150px!important;position:relative!important}',
      '.ch.wd-free-map-host>.wd-free-map-pin{top:75px}',
      '.ch.wd-free-map-host>.wd-free-map-source{top:128px;bottom:auto}',
      '.wd-property-photo.wd-free-map-host .wd-free-map-source{font-size:7px}',
      '@media(max-width:640px){.wd-free-map-pin{width:26px;height:26px}.wd-free-map-source{left:5px;bottom:5px}}'
    ].join('');
    (document.head || document.documentElement).appendChild(style);
  }

  function ensureDecor(host, query) {
    if (!host) return;
    host.classList.add('wd-free-map-host');
    if (host.dataset) {
      host.dataset.wdMapOwned = '1';
      if (query) host.dataset.wdMapQuery = query;
    }
    if (!host.querySelector('.wd-free-map-loading')) {
      var loading = document.createElement('span');
      loading.className = 'wd-free-map-loading';
      loading.textContent = 'Loading map';
      host.insertBefore(loading, host.firstChild || null);
    }
    if (!host.querySelector('.wd-free-map-pin')) {
      var pin = document.createElement('span');
      pin.className = 'wd-free-map-pin';
      pin.setAttribute('aria-hidden', 'true');
      host.appendChild(pin);
    }
    if (!host.querySelector('.wd-free-map-source')) {
      var source = document.createElement('span');
      source.className = 'wd-free-map-source';
      source.textContent = 'NJ Office of GIS';
      host.appendChild(source);
    }
    var oldCredit = host.querySelector('#plm-credit,.plm-imgcredit');
    if (oldCredit) oldCredit.textContent = 'Map · NJ Office of GIS';
    var swap = host.querySelector('#plm-swap,.plm-swap');
    if (swap) swap.style.display = 'none';
  }

  function geocode(query) {
    query = text(query);
    if (!query) return Promise.resolve(null);
    var key = query.toUpperCase();
    if (Object.prototype.hasOwnProperty.call(geocodeCache, key)) return Promise.resolve(geocodeCache[key]);
    if (geocodePending[key]) return geocodePending[key];

    var params = new URLSearchParams({
      SingleLine: query,
      outFields: 'Match_addr,Addr_type,City,Postal',
      outSR: '4326',
      maxLocations: '1',
      f: 'json'
    });
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, 7000) : null;

    geocodePending[key] = fetch(NJ_GEOCODE + '?' + params.toString(), ctl ? { signal: ctl.signal } : undefined)
      .then(function (response) {
        if (timer) clearTimeout(timer);
        if (!response.ok) throw new Error(String(response.status));
        return response.json();
      })
      .then(function (data) {
        var c = data && data.candidates && data.candidates[0];
        var loc = c && c.location;
        var hit = c && Number(c.score || 0) >= 75 && loc && validNj(Number(loc.y), Number(loc.x))
          ? { lat: Number(loc.y), lon: Number(loc.x) }
          : null;
        geocodeCache[key] = hit;
        if (hit) state.geocoded += 1;
        return hit;
      })
      .catch(function () {
        if (timer) clearTimeout(timer);
        geocodeCache[key] = null;
        return null;
      })
      .then(function (hit) {
        delete geocodePending[key];
        return hit;
      });
    return geocodePending[key];
  }

  function finishImage(img, host, lat, lon, size, query) {
    if (!img || !host || !document.documentElement.contains(img)) return;
    if (!validNj(lat, lon)) {
      state.failed += 1;
      host.classList.add('wd-free-map-failed');
      var loading = host.querySelector('.wd-free-map-loading');
      if (loading) loading.textContent = 'Map unavailable';
      return;
    }

    img.dataset.wdMapImage = '1';
    img.classList.add('wd-free-map-image');
    img.removeAttribute('onerror');
    img.alt = labelFor(host, query, img);
    img.onerror = function () {
      host.classList.remove('wd-free-map-ready');
      host.classList.add('wd-free-map-failed');
      var pending = host.querySelector('.wd-free-map-loading');
      if (pending) pending.textContent = 'Map unavailable';
      state.failed += 1;
    };
    img.src = mapUrl(lat, lon, size && size.width, size && size.height);
    host.classList.remove('noimg', 'no-photo', 'wd-free-map-failed');
    host.classList.add('wd-free-map-ready');
    if (host.dataset) {
      host.dataset.wdMapLat = String(lat);
      host.dataset.wdMapLon = String(lon);
    }
    state.mapped += 1;
  }

  function mapImage(img, originalSource) {
    if (!img || !document.documentElement.contains(img)) return;
    var host = visualHost(img);
    if (!host) return;
    var raw = originalSource || tokenSource(img.getAttribute('src') || '') || img.getAttribute('src') || '';
    var info = sourceInfo(raw) || {};
    var query = queryFromHost(host, info, img);
    var size = info.size || {
      width: Number(img.getAttribute('width')) || 640,
      height: Number(img.getAttribute('height')) || (host.classList.contains('ch') ? 150 : 400)
    };
    ensureDecor(host, query);

    if (validNj(info.lat, info.lon)) {
      finishImage(img, host, info.lat, info.lon, size, query);
      return;
    }
    var dlat = Number(host.dataset && host.dataset.wdMapLat);
    var dlon = Number(host.dataset && host.dataset.wdMapLon);
    if (validNj(dlat, dlon)) {
      finishImage(img, host, dlat, dlon, size, query);
      return;
    }
    if (!query) {
      state.failed += 1;
      host.classList.add('wd-free-map-failed');
      var pending = host.querySelector('.wd-free-map-loading');
      if (pending) pending.textContent = 'Map unavailable';
      return;
    }

    img.dataset.wdMapPending = '1';
    img.src = EMPTY;
    geocode(query).then(function (hit) {
      if (!document.documentElement.contains(img)) return;
      delete img.dataset.wdMapPending;
      if (!hit) {
        state.failed += 1;
        host.classList.add('wd-free-map-failed');
        var loading = host.querySelector('.wd-free-map-loading');
        if (loading) loading.textContent = 'Map unavailable';
        return;
      }
      finishImage(img, host, hit.lat, hit.lon, size, query);
    });
  }

  function homeRow() {
    var rows = window.rows || window.hmRows || [];
    var select = document.getElementById('hm-switch');
    var pin = select && select.value;
    if (pin && rows && rows.length) {
      for (var i = 0; i < rows.length; i++) {
        if (String(rows[i].pams_pin || '') === String(pin)) return rows[i];
      }
    }
    return rows && rows.length ? rows[0] : null;
  }

  function mapHomeHero(root) {
    root = root || document;
    var hosts = [];
    if (root.matches && root.matches('.hm-shot')) hosts.push(root);
    if (root.querySelectorAll) {
      Array.prototype.push.apply(hosts, Array.prototype.slice.call(root.querySelectorAll('.hm-shot')));
    }
    hosts.forEach(function (host) {
      if (!host || !document.documentElement.contains(host)) return;
      var row = homeRow();
      var select = document.getElementById('hm-switch');
      var urlPin = '';
      try { urlPin = new URL(window.location.href).searchParams.get('pin') || ''; } catch (_pinUrlError) {}
      var pin = urlPin || (select && select.value ? String(select.value) : '');
      var h = document.querySelector('#hm-body .hm-id h1,#hm-body .hm-id h2,#hm-body .hm-id strong');
      var p = document.querySelector('#hm-body .hm-id p,#hm-body .hm-locality');
      var address = row && row.address ? text(row.address) : (h ? text(h.textContent) : '');
      var town = row && (row.city || row.town) ? text(row.city || row.town) : (p ? text(p.textContent) : '');
      var zip = row && row.zip ? text(row.zip) : '';
      var query = [address, town, 'NJ', zip].filter(Boolean).join(', ');
      if (!query || !address) return;

      /* Property Home's intelligence runtime skips Street View when this marker
         already matches the active property. Its imagery runtime also respects
         the completed-address marker below. Set both before observer callbacks run. */
      host.dataset.wdStreetviewPin = pin || String((row && row.pams_pin) || query);
      host.dataset.wdImageryAddress = address;
      host.dataset.wdImageryDone = '1';
      host.dataset.wdMapQuery = query;
      host.classList.remove('wd-streetview-live', 'wd-streetview-host');
      host.style.backgroundImage = 'none';
      ensureDecor(host, query);

      var existing = host.querySelector('img.wd-free-map-image,img[data-wd-home-map="1"]');
      if (!existing) {
        existing = document.createElement('img');
        existing.setAttribute('data-wd-home-map', '1');
        existing.loading = 'lazy';
        existing.decoding = 'async';
        host.insertBefore(existing, host.firstChild || null);
      }
      existing.dataset.wdMapImage = '1';
      var lat = row && Number(row.lat), lon = row && Number(row.lon);
      if (validNj(lat, lon)) finishImage(existing, host, lat, lon, { width: 900, height: 540 }, query);
      else mapImage(existing, '');
    });
  }

  function ensureEmptyHosts(root) {
    if (!root) return;
    var hosts = [];
    if (root.matches && root.matches('#wd-property-grid .wd-property-photo')) hosts.push(root);
    if (root.querySelectorAll) {
      Array.prototype.push.apply(hosts, Array.prototype.slice.call(root.querySelectorAll('#wd-property-grid .wd-property-photo')));
    }
    hosts.forEach(function (host) {
      if (!host || host.querySelector('img')) return;
      var query = queryFromHost(host, {}, null);
      if (!query) return;
      ensureDecor(host, query);
      var img = document.createElement('img');
      img.loading = 'lazy';
      img.decoding = 'async';
      host.insertBefore(img, host.firstChild || null);
      mapImage(img, '');
    });
  }

  function scrub(root) {
    if (!root) return;
    var images = [];
    if (root instanceof HTMLImageElement) images.push(root);
    if (root.querySelectorAll) {
      Array.prototype.push.apply(images, Array.prototype.slice.call(
        root.querySelectorAll(
          'img[src*="maps.googleapis.com/maps/api/streetview"],' +
          'img[src*="services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export"],' +
          'img[src*="maps.nj.gov/arcgis/rest/services/Basemap/Orthos_Natural_2020_NJ_WM/MapServer/export"],' +
          '.wd-property-photo>img,.pr-card-media>img,.hd-shot>img,.hm-shot>img,.ch>img,#plm-photo-img'
        )
      ));
    }
    images.forEach(function (img) {
      if (!img || img.dataset.wdMapImage === '1' || img.dataset.wdMapPending === '1') return;
      if (!propertyVisualImage(img)) return;
      var source = tokenSource(img.getAttribute('src') || '') || img.getAttribute('src') || '';
      mapImage(img, source);
    });
    ensureEmptyHosts(root);
    mapHomeHero(root);
  }

  function rewriteHtml(value) {
    if (typeof value !== 'string') return value;
    if (!/maps\.googleapis\.com\/maps\/api\/streetview|services\.arcgisonline\.com\/ArcGIS\/rest\/services\/World_Imagery\/MapServer\/export|maps\.nj\.gov\/arcgis\/rest\/services\/Basemap\/Orthos_Natural_2020_NJ_WM\/MapServer\/export/i.test(value)) return value;
    return value.replace(
      /https:\/\/(?:maps\.googleapis\.com\/maps\/api\/streetview|services\.arcgisonline\.com\/ArcGIS\/rest\/services\/World_Imagery\/MapServer\/export|maps\.nj\.gov\/arcgis\/rest\/services\/Basemap\/Orthos_Natural_2020_NJ_WM\/MapServer\/export)\?[^"'<>\s]*/gi,
      function (url) {
        state.translated += 1;
        return tokenFor(url);
      }
    );
  }

  function installHooks() {
    state.installs += 1;

    try {
      var srcDescriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
      if (srcDescriptor && srcDescriptor.get && srcDescriptor.set) {
        Object.defineProperty(HTMLImageElement.prototype, 'src', {
          configurable: srcDescriptor.configurable,
          enumerable: srcDescriptor.enumerable,
          get: srcDescriptor.get,
          set: function (value) {
            var info = sourceInfo(value);
            var host = visualHost(this);
            var owned = host && host.dataset && host.dataset.wdMapOwned === '1';
            if ((info && !NJ_MAP_RE.test(String(value || ''))) || (owned && !NJ_MAP_RE.test(String(value || '')) && String(value || '').indexOf('data:image') !== 0)) {
              state.translated += 1;
              srcDescriptor.set.call(this, tokenFor(value));
              var img = this, original = value;
              Promise.resolve().then(function () { mapImage(img, original); });
              return;
            }
            srcDescriptor.set.call(this, value);
          }
        });
      }
    } catch (_srcError) {}

    try {
      var previousSetAttribute = Element.prototype.setAttribute;
      Element.prototype.setAttribute = function (name, value) {
        if (this instanceof HTMLImageElement && String(name).toLowerCase() === 'src') {
          var info = sourceInfo(value);
          var host = visualHost(this);
          var owned = host && host.dataset && host.dataset.wdMapOwned === '1';
          if ((info && !NJ_MAP_RE.test(String(value || ''))) || (owned && !NJ_MAP_RE.test(String(value || '')) && String(value || '').indexOf('data:image') !== 0)) {
            state.translated += 1;
            var img = this, original = value;
            var result = previousSetAttribute.call(this, name, tokenFor(value));
            Promise.resolve().then(function () { mapImage(img, original); });
            return result;
          }
        }
        return previousSetAttribute.call(this, name, value);
      };
    } catch (_attributeError) {}

    try {
      var htmlDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
      if (htmlDescriptor && htmlDescriptor.get && htmlDescriptor.set) {
        Object.defineProperty(Element.prototype, 'innerHTML', {
          configurable: htmlDescriptor.configurable,
          enumerable: htmlDescriptor.enumerable,
          get: htmlDescriptor.get,
          set: function (value) {
            htmlDescriptor.set.call(this, rewriteHtml(value));
            scrub(this);
          }
        });
      }
    } catch (_htmlError) {}
  }

  function scheduleScrub(root) {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(function () { scrub(root || document); }, 0);
  }

  ensureStyle();
  installHooks();

  try {
    var observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
        Array.prototype.forEach.call(mutation.addedNodes || [], function (node) {
          if (!node || node.nodeType !== 1) return;
          scrub(node);
        });
      });
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  } catch (_observerError) {}

  function reinforce() {
    if (state.reinforced) return;
    state.reinforced = true;
    installHooks();
    scrub(document);
  }

  document.addEventListener('change', function (event) {
    if (event.target && event.target.id === 'hm-switch') scheduleScrub(document);
  });
  window.addEventListener('watchdog:context-refresh', function () { scheduleScrub(document); });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', reinforce, { once: true });
  } else {
    reinforce();
  }
})();