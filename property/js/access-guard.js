(function () {
  'use strict';

  var URL = 'https://uvkvaxljhhngydvlrzom.supabase.co';
  var KEY = 'sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa';
  var client;

  function sb() {
    if (client) return client;
    client = window.supabase.createClient(URL, KEY, { auth: {
      persistSession: true, autoRefreshToken: true, detectSessionInUrl: true,
      flowType: 'pkce', storageKey: 'sb-uvkvaxljhhngydvlrzom-auth-token'
    }});
    return client;
  }
  function destination(kind) {
    var params = new URLSearchParams();
    params.set('access', kind);
    params.set('return', location.pathname + location.search + location.hash);
    return '/property/dashboard.html?' + params.toString();
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

  var required = document.documentElement.getAttribute('data-access-require') ||
    (document.body && document.body.getAttribute('data-access-require'));
  if (location.pathname.replace(/\/+$/, '') === '/property/data-center.html') required = 'pro_plus';
  if (required) document.documentElement.classList.add('access-pending');
  window.NJPTRAccess = { require: requireAccess, client: sb };
  window.njptrAccessReady = required ? requireAccess(required) : Promise.resolve({ developer: false });
})();
