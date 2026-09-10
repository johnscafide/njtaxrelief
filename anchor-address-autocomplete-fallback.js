(function () {
  'use strict';

  if (!/(^|\.)njpropertytaxrelief\.com$/i.test(location.hostname) || !/\/anchor-estimator\.html\/?$/i.test(location.pathname)) return;
  if (window.__wdAnchorAddressAutocompleteFallback) return;
  window.__wdAnchorAddressAutocompleteFallback = true;

  var activated = false;
  var bound = false;
  var autocomplete = null;
  var observer = null;
  var startupTimer = 0;
  var pollTimer = 0;
  var pollCount = 0;

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
      'body.est-page.awd-legacy-places-fallback .pac-container{display:block!important;z-index:9000!important}',
      'body.est-page.awd-legacy-places-fallback .awd-search-box{display:none!important}'
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

  function stateCode(place) {
    var components = place && place.address_components || [];
    for (var i = 0; i < components.length; i += 1) {
      var types = components[i].types || [];
      if (types.indexOf('administrative_area_level_1') !== -1) {
        return String(components[i].short_name || '').toUpperCase();
      }
    }
    return '';
  }

  function dispatchSelection(input, formatted, placeId) {
    try {
      input.dispatchEvent(new CustomEvent('watchdog:address-selected', {
        bubbles: true,
        detail: {
          formattedAddress: formatted,
          placeId: placeId,
          state: 'NJ',
          source: 'google_places_fallback'
        }
      }));
    } catch (_) {}
  }

  function bindLegacyAutocomplete(reason) {
    var input = field();
    var places = window.google && google.maps && google.maps.places;
    if (!input || !places || typeof places.Autocomplete !== 'function') return false;

    ensureStyles();
    activated = true;
    document.body.classList.add('awd-legacy-places-fallback');

    if (bound) {
      setStatus('idle', 'Start typing, then choose your New Jersey property from the address suggestions.');
      return true;
    }

    bound = true;
    input.dataset.anchorPlacesBound = '1';
    input.dataset.wdAnchorSearchFallback = '1';
    input.setAttribute('autocomplete', 'off');

    autocomplete = new places.Autocomplete(input, {
      componentRestrictions: { country: 'us' },
      types: ['address'],
      fields: ['formatted_address', 'place_id', 'address_components']
    });

    autocomplete.addListener('place_changed', function () {
      var place = autocomplete.getPlace();
      var formatted = String(place && place.formatted_address || input.value || '').trim();
      var placeId = String(place && place.place_id || '').trim();
      var state = stateCode(place);

      if (!formatted || !placeId) {
        input.dataset.googleAddress = '0';
        delete input.dataset.googlePlaceId;
        setStatus('error', 'Select your property from the address suggestions before continuing.');
        return;
      }
      if (state && state !== 'NJ') {
        input.value = formatted;
        input.dataset.googleAddress = '0';
        delete input.dataset.googlePlaceId;
        setStatus('error', 'Please choose a New Jersey property address.');
        return;
      }

      input.value = formatted;
      input.dataset.googleAddress = '1';
      input.dataset.googlePlaceId = placeId;
      setStatus('valid', 'New Jersey property selected and verified.');
      dispatchSelection(input, formatted, placeId);
      track('anchor_address_autocomplete_fallback_selected', {
        google_place_id: placeId,
        reason: reason || 'watchdog_search_unavailable'
      });
    });

    setStatus('idle', 'Start typing, then choose your New Jersey property from the address suggestions.');
    track('anchor_address_autocomplete_fallback_activated', { reason: reason || 'watchdog_search_unavailable' });
    return true;
  }

  function maybeRecoverFromStatus() {
    var el = statusEl();
    if (!el) return;
    var message = String(el.textContent || '');
    if (/Watchdog property search could (?:not load|not initialize)/i.test(message)) {
      if (!bindLegacyAutocomplete('watchdog_search_error') && !activated) {
        setStatus('error', 'Address suggestions could not load. Please refresh and try again.');
      } else if (activated) {
        setTimeout(function () {
          if (activated && field() && field().dataset.googleAddress !== '1') {
            setStatus('idle', 'Start typing, then choose your New Jersey property from the address suggestions.');
          }
        }, 0);
      }
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
    var googleReady = !!(window.google && google.maps && google.maps.places && typeof google.maps.places.Autocomplete === 'function');

    if (input && googleReady) {
      if (!startupTimer) {
        startupTimer = setTimeout(function () {
          var current = field();
          if (!current || activated) return;
          // The Watchdog bridge marks wdAnchorSearch only after the new Places
          // suggestion API is actually bound. If that never happens, recover
          // with the proven Google Places Autocomplete surface.
          if (current.dataset.wdAnchorSearch !== '1') {
            bindLegacyAutocomplete('watchdog_search_not_bound');
          }
        }, 1800);
      }
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
