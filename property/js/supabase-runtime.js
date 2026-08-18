(function () {
  'use strict';

  var production = {
    ref: 'uvkvaxljhhngydvlrzom',
    url: 'https://uvkvaxljhhngydvlrzom.supabase.co',
    key: 'sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa',
    environment: 'production'
  };
  var staging = {
    ref: 'pxossnwmrygxlpxtstnl',
    url: 'https://pxossnwmrygxlpxtstnl.supabase.co',
    key: 'sb_publishable_2knfdj4MRsPEtQpPbQ54ew_S5KngOcl',
    environment: 'staging'
  };

  var hostname = String(window.location && window.location.hostname || '').toLowerCase();
  var previewHost = hostname === 'localhost' || hostname === '127.0.0.1' || /\.vercel\.app$/.test(hostname);
  var selected = previewHost ? staging : production;
  var client = null;

  function runtimeOptions(base) {
    var out = Object.assign({}, base || {});
    out.auth = Object.assign({}, (base && base.auth) || {}, {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
      storageKey: 'sb-' + selected.ref + '-auth-token'
    });
    return out;
  }

  function knownConfigForUrl(url) {
    var value = String(url || '');
    if (value.indexOf(production.url) === 0 || value.indexOf(production.ref) !== -1) return production;
    if (value.indexOf(staging.url) === 0 || value.indexOf(staging.ref) !== -1) return staging;
    return null;
  }

  function rewriteHeaders(headers) {
    var out;
    try { out = new Headers(headers || {}); } catch (_error) { return headers || {}; }
    var apiKey = out.get('apikey');
    if (apiKey === production.key || apiKey === staging.key) out.set('apikey', selected.key);
    var auth = out.get('authorization');
    if (auth === 'Bearer ' + production.key || auth === 'Bearer ' + staging.key) {
      out.set('authorization', 'Bearer ' + selected.key);
    }
    return out;
  }

  if (window.supabase && typeof window.supabase.createClient === 'function' && !window.supabase.__watchdogRuntimeWrapped) {
    var originalCreateClient = window.supabase.createClient.bind(window.supabase);
    window.supabase.createClient = function (url, key, options) {
      var known = knownConfigForUrl(url);
      if (known) return originalCreateClient(selected.url, selected.key, runtimeOptions(options));
      return originalCreateClient(url, key, options);
    };
    try { Object.defineProperty(window.supabase, '__watchdogRuntimeWrapped', { value: true }); } catch (_error) {}
    try { Object.defineProperty(window.supabase, '__watchdogPreviewWrapped', { value: true }); } catch (_error) {}
  }

  if (typeof window.fetch === 'function' && !window.__watchdogSupabaseFetchWrapped) {
    var originalFetch = window.fetch.bind(window);
    window.fetch = function (input, init) {
      var requested = '';
      if (typeof input === 'string') requested = input;
      else if (typeof URL !== 'undefined' && input instanceof URL) requested = input.toString();
      var known = knownConfigForUrl(requested);
      if (!known) return originalFetch(input, init);

      var target = requested.replace(known.url, selected.url);
      var out = Object.assign({}, init || {});
      out.headers = rewriteHeaders((init && init.headers) || {});
      return originalFetch(target, out);
    };
    window.__watchdogSupabaseFetchWrapped = true;
  }

  function createClient() {
    if (client) return client;
    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
      throw new Error('Supabase client library unavailable');
    }
    client = window.supabase.createClient(selected.url, selected.key, runtimeOptions());
    return client;
  }

  window.NJPTRSupabaseRuntime = Object.freeze({
    ref: selected.ref,
    url: selected.url,
    key: selected.key,
    environment: selected.environment,
    isPreview: previewHost,
    storageKey: 'sb-' + selected.ref + '-auth-token',
    createClient: createClient
  });
})();
