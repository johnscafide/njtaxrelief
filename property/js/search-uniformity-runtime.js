/* Watchdog public search uniformity: reuse the canonical landing-page address
   search inside property-list results so Google suggestions, parcel enrichment,
   Watchdog Scores, keyboard behavior, and submit handling cannot drift. */
(function () {
  'use strict';
  if (window.__WATCHDOG_SEARCH_UNIFORMITY__) return;
  window.__WATCHDOG_SEARCH_UNIFORMITY__ = true;

  var searchNode = null;
  var homeMarker = null;
  var scanTimer = null;

  function resultSlot() {
    return document.querySelector('#njw-filterbar .njw-search-slot');
  }

  function canonicalSearch() {
    return document.querySelector('.pl-search-card .pl-input-wrap') ||
      document.querySelector('.pl-input-wrap');
  }

  function rememberHome(node) {
    if (!node || homeMarker) return;
    var parent = node.parentNode;
    if (!parent) return;
    homeMarker = document.createComment('watchdog-canonical-search-home');
    parent.insertBefore(homeMarker, node);
  }

  function hideLegacyResultSearch(slot) {
    if (!slot) return;
    var legacy = slot.querySelector('.hd-searchbox');
    if (!legacy) return;
    legacy.dataset.watchdogSearchReplaced = '1';
    legacy.setAttribute('aria-hidden', 'true');
  }

  function moveToResults() {
    var slot = resultSlot();
    if (!slot) return;

    searchNode = searchNode && document.documentElement.contains(searchNode) ?
      searchNode : canonicalSearch();
    if (!searchNode) return;

    rememberHome(searchNode);
    hideLegacyResultSearch(slot);

    if (searchNode.parentNode !== slot) slot.appendChild(searchNode);
    searchNode.classList.add('njw-uniform-property-search');

    var input = searchNode.querySelector('#pl-addr');
    if (input) {
      input.setAttribute('aria-label', 'Search New Jersey property addresses');
      input.placeholder = '123 Main Street, Williamstown, NJ 08094';
    }
  }

  function restoreHome() {
    if (!searchNode || !homeMarker || !homeMarker.parentNode) return;
    homeMarker.parentNode.insertBefore(searchNode, homeMarker.nextSibling);
    searchNode.classList.remove('njw-uniform-property-search');
  }

  function scan() {
    if (!document.body) return;
    if (document.body.classList.contains('hood-on')) moveToResults();
    else restoreHome();
  }

  function scheduleScan() {
    window.clearTimeout(scanTimer);
    scanTimer = window.setTimeout(scan, 40);
  }

  var observer = new MutationObserver(scheduleScan);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class']
  });

  window.addEventListener('load', scan);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scan, { once: true });
  } else {
    scan();
  }
})();
