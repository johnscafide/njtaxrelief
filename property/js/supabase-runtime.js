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

  if (window.supabase && typeof window.supabase.createClient === 'function' && !window.supabase.__watchdogPreviewWrapped) {
    var originalCreateClient = window.supabase.createClient.bind(window.supabase);
    window.supabase.createClient = function (url, key, options) {
      var requestedUrl = String(url || '');
      if (previewHost && requestedUrl.indexOf(production.ref) !== -1) {
        return originalCreateClient(staging.url, staging.key, runtimeOptions(options));
      }
      return originalCreateClient(url, key, previewHost ? runtimeOptions(options) : options);
    };
    try { Object.defineProperty(window.supabase, '__watchdogPreviewWrapped', { value: true }); } catch (_error) {}
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
