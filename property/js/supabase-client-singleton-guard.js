/* Watchdog Supabase singleton guard.
 * Load immediately after supabase-js and before any Watchdog runtime that may
 * call createClient(). Supabase warns when multiple GoTrueClient instances use
 * the same storage key; this cache guarantees one browser client per project +
 * auth storage key while leaving unrelated Supabase projects untouched.
 */
(function () {
  'use strict';
  if (window.__WATCHDOG_SUPABASE_SINGLETON_GUARD__) return;
  window.__WATCHDOG_SUPABASE_SINGLETON_GUARD__ = true;

  if (!window.supabase || typeof window.supabase.createClient !== 'function') return;

  var originalCreateClient = window.supabase.createClient.bind(window.supabase);
  var cache = window.__WATCHDOG_SUPABASE_CLIENT_CACHE__ || Object.create(null);
  window.__WATCHDOG_SUPABASE_CLIENT_CACHE__ = cache;

  function projectRef(url) {
    try {
      var host = new URL(String(url || '')).hostname.toLowerCase();
      var match = host.match(/^([a-z0-9]+)\.supabase\.co$/);
      return match ? match[1] : '';
    } catch (_error) {
      return '';
    }
  }

  function cacheKey(url, options) {
    var ref = projectRef(url);
    var auth = options && options.auth || {};
    var storageKey = String(auth.storageKey || '');
    if (!ref || !storageKey || storageKey.indexOf('sb-' + ref + '-') !== 0) return '';
    return ref + '|' + storageKey;
  }

  window.supabase.createClient = function (url, key, options) {
    var id = cacheKey(url, options);
    if (!id) return originalCreateClient(url, key, options);
    if (cache[id]) return cache[id];
    cache[id] = originalCreateClient(url, key, options);
    return cache[id];
  };
})();
