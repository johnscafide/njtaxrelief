(function () {
  'use strict';

  if (!/(^|\.)njpropertytaxrelief\.com$/i.test(location.hostname) || !/\/anchor-estimator\.html\/?$/i.test(location.pathname)) return;
  if (window.__wdAnchorAddressAutocompleteFallback) return;
  window.__wdAnchorAddressAutocompleteFallback = true;

  var NJ_GEOCODE = 'https://geo.nj.gov/arcgis/rest/services/Tasks/NJ_Geocode/GeocodeServer/findAddressCandidates';
  var NJ_BOUNDS = { west: -75.62, north: 41.38, east: -73.85, south: 38.88 };
  var activated = false;
  var bound = false;
  var observer = null;
  var startupTimer = 0;
  var pollTimer = 0;
  var pollCount = 0;
  var searchTimer = 0;
  var requestSeq = 0;
  var box = null;
  var activationReason = '';

  function field() { return document.getElementById('est-address'); }
  function statusEl() { return document.getElementById('est-address-google-status'); }

  function track(name, params) {
    try {
      if (window.AnchorFunnel && typeof window.AnchorFunnel.track === 'function') {
        window.AnchorFunnel.track(name, params || {});
      }
    } catch (_) {}
  }

  function ensureStyles() {
    if (document.getElementById('wd-anchor-address-fallback-style')) return;
    var style = document.createElement('style');
    style.id = 'wd-anchor-address-fallback-style';
    style.textContent = [
      'body.est-page.awd-njgis-address-fallback .awd-search-box{display:none!important}',
      'body.est-page.awd-njgis-address-fallback .pac-container{display:none!important}',
      '.awd-njgis-host{position:relative!important}',
      '.awd-njgis-box{position:absolute;left:0;right:0;top:calc(100% + 8px);z-index:9100;display:none;max-height:320px;overflow:auto;background:#fff;border:1px solid #dfe5ee;border-radius:14px;box-shadow:0 18px 42px rgba(14,34,72,.18);text-align:left}',
      '.awd-njgis-box.open{display:block}',
      '.awd-njgis-option{appearance:none;width:100%;border:0;border-top:1px solid #edf1f5;background:#fff;padding:12px 14px;text-align:left;cursor:pointer;color:#10294b}',
      '.awd-njgis-option:first-child{border-top:0}',
      '.awd-njgis-option:hover,.awd-njgis-option:focus-visible{background:#f5f8fc;outline:none}',
      '.awd-njgis-option strong{display:block;font-size:14px;line-height:1.3}',
      '.awd-njgis-option span{display:block;margin-top:3px;font-size:11px;color:#6d7889}',
      '.awd-njgis-empty{padding:12px 14px;font-size:12px;color:#6d7889}'
    ].join('');
    document.head.appendChild(style);
  }

  function setStatus(kind, message) {
    var input = field();
    var el = statusEl();
    if (!el) return;
    el.className = 'anchor-google-status' + (kind === 'valid' ? ' is-valid' : kind === 'error' ? ' is-error' : '');
    if (input) input.classList.toggle('anchor-field-error', kind === 'error');
    var icon = kind === 'valid' ? 'fa-circle-check' : kind === 'error' ? 'fa-circle-exclamation' : 'fa-location-dot';
    el.innerHTML = '<i class="fas ' + icon + '"></i><span>' + message + '</span>';
  }

  function ensureBox() {
    var input = field();
    if (!input) return null;
    if (box && box.isConnected) return box;
    var host = input.parentElement;
    if (!host) return null;
    host.classList.add('awd-njgis-host');
    box = document.createElement('div');
    box.className = 'awd-njgis-box';
    box.id = 'est-address-njgis-results';
    box.setAttribute('role', 'listbox');
    host.appendChild(box);
    input.setAttribute('aria-controls', box.id);
    input.setAttribute('aria-autocomplete', 'list');
    return box;
  }

  function closeBox() {
    if (box) {
      box.classList.remove('open');
      box.innerHTML = '';
    }
  }

  function candidateAddress(candidate) {
    var attrs = candidate && candidate.attributes || {};
    return String(candidate && candidate.address || attrs.Match_addr || attrs.LongLabel || '').trim();
  }

  function candidateCoords(candidate) {
    var loc = candidate && candidate.location || {};
    var lat = Number(loc.y);
    var lon = Number(loc.x);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return { lat: lat, lon: lon };
  }

  function insideNj(coords) {
    return !!coords && coords.lat >= NJ_BOUNDS.south && coords.lat <= NJ_BOUNDS.north && coords.lon >= NJ_BOUNDS.west && coords.lon <= NJ_BOUNDS.east;
  }

  function candidateId(candidate) {
    var coords = candidateCoords(candidate);
    if (!coords) return '';
    return 'njogis:' + coords.lat.toFixed(6) + ':' + coords.lon.toFixed(6);
  }

  function dispatchSelection(input, formatted, placeId, candidate) {
    var coords = candidateCoords(candidate);
    try {
      input.dispatchEvent(new CustomEvent('watchdog:address-selected', {
        bubbles: true,
        detail: {
          formattedAddress: formatted,
          placeId: placeId,
          state: 'NJ',
          source: 'nj_ogis',
          lat: coords ? coords.lat : null,
          lon: coords ? coords.lon : null
        }
      }));
    } catch (_) {}
  }

  function selectCandidate(candidate) {
    var input = field();
    if (!input) return;
    var formatted = candidateAddress(candidate);
    var placeId = candidateId(candidate);
    var coords = candidateCoords(candidate);
    if (!formatted || !placeId || !insideNj(coords)) return;

    input.value = formatted;
    // Keep the legacy verified-address flags populated for the existing submit
    // guard while recording the actual provider separately.
    input.dataset.googleAddress = '1';
    input.dataset.googlePlaceId = placeId;
    input.dataset.addressSource = 'nj_ogis';
    input.dataset.googleLat = String(coords.lat);
    input.dataset.googleLon = String(coords.lon);
    closeBox();
    setStatus('valid', 'New Jersey property selected and verified.');
    dispatchSelection(input, formatted, placeId, candidate);
    track('anchor_address_njgis_fallback_selected', {
      address_source: 'nj_ogis',
      match_score: Number(candidate && candidate.score) || 0,
      reason: activationReason || 'watchdog_search_unavailable'
    });
  }

  function renderCandidates(candidates) {
    var results = ensureBox();
    if (!results) return;
    results.innerHTML = '';
    if (!candidates.length) {
      var empty = document.createElement('div');
      empty.className = 'awd-njgis-empty';
      empty.textContent = 'No New Jersey address matches yet. Keep typing.';
      results.appendChild(empty);
      results.classList.add('open');
      return;
    }

    candidates.forEach(function (candidate) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'awd-njgis-option';
      button.setAttribute('role', 'option');
      var strong = document.createElement('strong');
      strong.textContent = candidateAddress(candidate);
      var meta = document.createElement('span');
      var score = Number(candidate && candidate.score) || 0;
      meta.textContent = score ? 'New Jersey address match · ' + Math.round(score) + '% confidence' : 'New Jersey address match';
      button.appendChild(strong);
      button.appendChild(meta);
      button.addEventListener('mousedown', function (event) { event.preventDefault(); });
      button.addEventListener('click', function () { selectCandidate(candidate); });
      results.appendChild(button);
    });
    results.classList.add('open');
  }

  function searchNj(value) {
    var seq = ++requestSeq;
    var query = String(value || '').trim();
    if (query.length < 3) {
      closeBox();
      return;
    }
    if (!/\bNJ\b|\bNEW JERSEY\b/i.test(query)) query += ', NJ';

    var params = new URLSearchParams({
      SingleLine: query,
      outSR: '4326',
      maxLocations: '8',
      f: 'json'
    });

    fetch(NJ_GEOCODE + '?' + params.toString(), { credentials: 'omit' })
      .then(function (response) {
        if (!response.ok) throw new Error('NJ geocoder returned ' + response.status);
        return response.json();
      })
      .then(function (data) {
        if (seq !== requestSeq || !activated) return;
        var candidates = (data && Array.isArray(data.candidates) ? data.candidates : []).filter(function (candidate) {
          return candidateAddress(candidate) && insideNj(candidateCoords(candidate)) && (Number(candidate.score) || 0) >= 70;
        }).slice(0, 8);
        renderCandidates(candidates);
      })
      .catch(function () {
        if (seq !== requestSeq || !activated) return;
        closeBox();
        setStatus('error', 'Address suggestions are temporarily unavailable. Please try again.');
        track('anchor_address_njgis_fallback_failed', { reason: activationReason || 'watchdog_search_unavailable' });
      });
  }

  function queueSearch() {
    var input = field();
    if (!input || !activated) return;
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(function () { searchNj(input.value); }, 220);
  }

  function activateNjFallback(reason) {
    var input = field();
    if (!input) return false;
    ensureStyles();
    activated = true;
    activationReason = reason || activationReason || 'watchdog_search_unavailable';
    document.body.classList.add('awd-njgis-address-fallback');
    ensureBox();

    if (!bound) {
      bound = true;
      input.dataset.wdAnchorSearchFallback = 'nj_ogis';
      input.setAttribute('autocomplete', 'off');
      input.addEventListener('input', queueSearch);
      input.addEventListener('focus', function () {
        if (String(input.value || '').trim().length >= 3) queueSearch();
      });
      document.addEventListener('click', function (event) {
        if (box && !box.contains(event.target) && event.target !== input) closeBox();
      });
    }

    setStatus('idle', 'Start typing, then choose your New Jersey property from the address suggestions.');
    track('anchor_address_njgis_fallback_activated', { reason: activationReason });
    if (String(input.value || '').trim().length >= 3) queueSearch();
    return true;
  }

  function maybeRecoverFromStatus() {
    var el = statusEl();
    if (!el) return;
    var message = String(el.textContent || '');
    if (/Watchdog property search could (?:not load|not initialize)/i.test(message) || /Google address verification could not load/i.test(message)) {
      activateNjFallback('provider_search_error');
    }
  }

  function observeStatus() {
    var el = statusEl();
    if (!el || observer || !window.MutationObserver) return;
    observer = new MutationObserver(maybeRecoverFromStatus);
    observer.observe(el, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class'] });
    maybeRecoverFromStatus();
  }

  function poll() {
    pollCount += 1;
    observeStatus();
    var input = field();
    if (input && !startupTimer) {
      startupTimer = setTimeout(function () {
        var current = field();
        if (!current || activated) return;
        if (current.dataset.wdAnchorSearch !== '1') activateNjFallback('watchdog_search_not_bound');
      }, 2200);
    }
    if (pollCount >= 80 || activated) {
      clearInterval(pollTimer);
      pollTimer = 0;
    }
  }

  function boot() {
    ensureStyles();
    observeStatus();
    poll();
    if (!pollTimer) pollTimer = setInterval(poll, 250);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
