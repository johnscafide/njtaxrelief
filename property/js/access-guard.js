(function () {
  'use strict';

  var FALLBACK_URL = 'https://uvkvaxljhhngydvlrzom.supabase.co';
  var FALLBACK_KEY = 'sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa';
  var STAGING_URL = 'https://pxossnwmrygxlpxtstnl.supabase.co';
  var STAGING_KEY = 'sb_publishable_2knfdj4MRsPEtQpPbQ54ew_S5KngOcl';
  var STAGING_STORAGE = 'sb-pxossnwmrygxlpxtstnl-auth-token';
  var hostname = String(location.hostname || '').toLowerCase();
  var previewHost = hostname === 'localhost' || hostname === '127.0.0.1' || /\.vercel\.app$/.test(hostname);
  var client;

  if (previewHost && window.supabase && typeof window.supabase.createClient === 'function' && !window.supabase.__watchdogPreviewWrapped) {
    var originalCreateClient = window.supabase.createClient.bind(window.supabase);
    window.supabase.createClient = function (url, key, options) {
      var out = Object.assign({}, options || {});
      out.auth = Object.assign({}, (options && options.auth) || {}, { storageKey: STAGING_STORAGE });
      if (String(url || '').indexOf('uvkvaxljhhngydvlrzom') !== -1) {
        return originalCreateClient(STAGING_URL, STAGING_KEY, out);
      }
      return originalCreateClient(url, key, out);
    };
    try { Object.defineProperty(window.supabase, '__watchdogPreviewWrapped', { value: true }); } catch (_error) {}
  }

  function sb() {
    if (client) return client;
    if (window.NJPTRSupabaseRuntime) {
      client = window.NJPTRSupabaseRuntime.createClient();
      return client;
    }
    client = window.supabase.createClient(FALLBACK_URL, FALLBACK_KEY, { auth: {
      persistSession: true, autoRefreshToken: true, detectSessionInUrl: true,
      flowType: 'pkce', storageKey: previewHost ? STAGING_STORAGE : 'sb-uvkvaxljhhngydvlrzom-auth-token'
    }});
    return client;
  }
  function destination(kind) {
    var params = new URLSearchParams();
    params.set('access', kind);
    params.set('return', location.pathname + location.search + location.hash);
    return '/property/dashboard?' + params.toString();
  }
  function reveal() {
    document.documentElement.classList.remove('access-pending');
    document.documentElement.classList.add('access-granted');
  }
  function requireAccess(required) {
    required = required || 'standard';
    if (!window.supabase) return Promise.reject(new Error('Authentication library unavailable'));
    return sb().auth.getUser().then(function (result) {
      var user = result && result.data && result.data.user;
      if (!user) { location.replace(destination('signin')); throw new Error('Sign in required'); }
      return Promise.all([sb().rpc('is_watchdog_developer'), sb().rpc('get_my_entitlement')]).then(function (values) {
        var devResult = values[0], entitlementResult = values[1];
        if (devResult.error) throw devResult.error;
        if (entitlementResult.error) throw entitlementResult.error;
        var isDeveloper = devResult.data === true;
        var rows = entitlementResult.data || [], entitlement = Array.isArray(rows) ? rows[0] : rows;
        var order = { standard: 0, agent: 1, pro: 2, pro_plus: 3, teams: 4, developer: 5 };
        var plan = isDeveloper ? 'developer' : String(entitlement && entitlement.plan_tier || 'standard');
        if (order[plan] == null) plan = 'standard';
        var status = String(entitlement && entitlement.subscription_status || 'none');
        var paidActive = status === 'active' || status === 'trialing' || status === 'past_due';
        var allowed = required === 'standard' || isDeveloper || (paidActive && order[plan] >= (order[required] == null ? 999 : order[required]));
        if (required === 'developer' && !isDeveloper) allowed = false;
        if (!allowed) { location.replace(destination('restricted')); throw new Error('Plan access required'); }
        if (isDeveloper) {
          window.NJPTRDeveloperConfirmed = true;
          document.dispatchEvent(new CustomEvent('watchdog:developer-confirmed'));
        }
        reveal();
        return { user: user, developer: isDeveloper, entitlement: entitlement || null, plan: plan };
      });
    }).catch(function (error) {
      if (!/required$/.test(error.message || '')) location.replace(destination('restricted'));
      throw error;
    });
  }

  var normalizedPath = location.pathname.replace(/\/+$/, '');
  var required = document.documentElement.getAttribute('data-access-require') ||
    (document.body && document.body.getAttribute('data-access-require'));
  if (normalizedPath === '/property/data-center') required = 'pro_plus';
  if (normalizedPath === '/property/backoffice') required = null;
  if (required) document.documentElement.classList.add('access-pending');
  window.NJPTRAccess = { require: requireAccess, client: sb };
  window.njptrAccessReady = required ? requireAccess(required) : Promise.resolve({ developer: false });
})();
