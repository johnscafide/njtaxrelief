/* Watchdog free-first grid imagery runtime
 * Converts legacy passive Google Static Street View card URLs into official
 * NJ Office of GIS aerial imagery before the existing spend guard sees them.
 * This keeps bulk property grids useful without generating Google charges.
 */
(function () {
  'use strict';
  if (window.__WATCHDOG_FREE_IMAGERY_GRID__) return;
  window.__WATCHDOG_FREE_IMAGERY_GRID__ = true;

  var NJ_AERIAL = 'https://maps.nj.gov/arcgis/rest/services/Basemap/Orthos_Natural_2020_NJ_WM/MapServer/export';
  var STREET = /^https:\/\/maps\.googleapis\.com\/maps\/api\/streetview(?:\?|$)/i;
  var WORLD_EXPORT = /^https:\/\/services\.arcgisonline\.com\/ArcGIS\/rest\/services\/World_Imagery\/MapServer\/export(?:\?|$)/i;
  var state = window.WatchdogFreeImageryGrid = { translated: 0, installedAt: new Date().toISOString() };

  function validNj(lat, lon) {
    return Number.isFinite(lat) && Number.isFinite(lon) && lat >= 38.8 && lat <= 41.4 && lon >= -75.7 && lon <= -73.8;
  }

  function aerial(lat, lon, width, height) {
    var dx = .00145, dy = .001;
    width = Math.max(240, Math.min(900, Number(width) || 640));
    height = Math.max(160, Math.min(700, Number(height) || 400));
    return NJ_AERIAL + '?' + new URLSearchParams({
      bbox: [lon - dx, lat - dy, lon + dx, lat + dy].join(','),
      bboxSR: '4326',
      imageSR: '3857',
      size: Math.round(width) + ',' + Math.round(height),
      format: 'jpg',
      transparent: 'false',
      f: 'image'
    }).toString();
  }

  function translate(value) {
    var raw = String(value || '');
    var decoded = raw.replace(/&amp;/g, '&');

    if (WORLD_EXPORT.test(decoded)) {
      state.translated += 1;
      return NJ_AERIAL + decoded.slice(decoded.indexOf('?'));
    }

    if (!STREET.test(decoded)) return value;
    try {
      var u = new URL(decoded);
      var loc = decodeURIComponent(u.searchParams.get('location') || '');
      var parts = loc.split(',');
      if (parts.length !== 2) return value;
      var lat = Number(parts[0]);
      var lon = Number(parts[1]);
      if (!validNj(lat, lon)) return value;
      var size = String(u.searchParams.get('size') || '640x400').split('x');
      state.translated += 1;
      return aerial(lat, lon, Number(size[0]), Number(size[1]));
    } catch (_error) {
      return value;
    }
  }

  function rewriteHtml(value) {
    if (typeof value !== 'string') return value;
    if (!/maps\.googleapis\.com\/maps\/api\/streetview|services\.arcgisonline\.com\/ArcGIS\/rest\/services\/World_Imagery\/MapServer\/export/i.test(value)) return value;
    return value.replace(/https:\/\/(?:maps\.googleapis\.com\/maps\/api\/streetview|services\.arcgisonline\.com\/ArcGIS\/rest\/services\/World_Imagery\/MapServer\/export)\?[^\"'<>\s]*/gi, function (url) {
      return String(translate(url));
    });
  }

  try {
    var srcDescriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
    if (srcDescriptor && srcDescriptor.get && srcDescriptor.set) {
      Object.defineProperty(HTMLImageElement.prototype, 'src', {
        configurable: srcDescriptor.configurable,
        enumerable: srcDescriptor.enumerable,
        get: srcDescriptor.get,
        set: function (value) { srcDescriptor.set.call(this, translate(value)); }
      });
    }
  } catch (_srcError) {}

  try {
    var previousSetAttribute = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function (name, value) {
      if (this instanceof HTMLImageElement && String(name).toLowerCase() === 'src') value = translate(value);
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
        set: function (value) { htmlDescriptor.set.call(this, rewriteHtml(value)); }
      });
    }
  } catch (_htmlError) {}

  function scrub(root) {
    if (!root || !root.querySelectorAll) return;
    var images = root.querySelectorAll('img[src*="maps.googleapis.com/maps/api/streetview"],img[src*="services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export"]');
    Array.prototype.forEach.call(images, function (img) {
      var current = img.getAttribute('src') || '';
      var next = translate(current);
      if (next !== current) img.setAttribute('src', next);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { scrub(document); }, { once: true });
  else scrub(document);
})();
