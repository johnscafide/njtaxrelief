(function(){
  'use strict';
  if (!window.supabase || typeof window.supabase.createClient !== 'function') return;

  var PROJECT_REF = 'uvkvaxljhhngydvlrzom';
  var PROJECT_URL = 'https://' + PROJECT_REF + '.supabase.co';
  var sharedClient = null;

  function isWatchdogSupabase(url){
    var value = String(url || '');
    return value.indexOf(PROJECT_REF) !== -1 || value.indexOf(PROJECT_URL) === 0;
  }

  if (!window.supabase.__watchdogMarketingSingletonWrapped) {
    var originalCreateClient = window.supabase.createClient.bind(window.supabase);
    window.supabase.createClient = function(url, key, options){
      if (!isWatchdogSupabase(url)) return originalCreateClient(url, key, options);
      if (sharedClient) return sharedClient;
      sharedClient = originalCreateClient(url, key, options);
      return sharedClient;
    };
    try { Object.defineProperty(window.supabase, '__watchdogMarketingSingletonWrapped', { value:true }); }
    catch (_error) { window.supabase.__watchdogMarketingSingletonWrapped = true; }
  }

  if (typeof window.fetch === 'function' && !window.__watchdogMarketingFetchGuard) {
    var originalFetch = window.fetch.bind(window);
    window.fetch = function(input, init){
      var url = '';
      try {
        if (typeof input === 'string') url = input;
        else if (input instanceof URL) url = input.toString();
        else if (input && input.url) url = String(input.url);
      } catch (_error) {}

      var isFunctionCall = isWatchdogSupabase(url) && url.indexOf('/functions/v1/') !== -1;
      if (!isFunctionCall) return originalFetch(input, init);

      var sourceHeaders = (init && init.headers) || (input && input.headers) || {};
      var headers;
      try { headers = new Headers(sourceHeaders); }
      catch (_error) { headers = sourceHeaders; }
      try {
        if (headers && typeof headers.delete === 'function') headers.delete('x-client-info');
        else if (headers && typeof headers === 'object') {
          delete headers['x-client-info'];
          delete headers['X-Client-Info'];
        }
      } catch (_error) {}

      var out = Object.assign({}, init || {}, { headers: headers });
      if (typeof input === 'string' || input instanceof URL) return originalFetch(input, out);
      try {
        var request = new Request(input, out);
        return originalFetch(request);
      } catch (_error) {
        return originalFetch(input, out);
      }
    };
    window.__watchdogMarketingFetchGuard = true;
  }
})();
