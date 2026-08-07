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
      return sb().rpc('is_watchdog_developer').then(function (devResult) {
        if (devResult.error) throw devResult.error;
        var isDeveloper = devResult.data === true;
        if (required !== 'standard' && !isDeveloper) { location.replace(destination('restricted')); throw new Error('Developer access required'); }
        if (isDeveloper) {
          window.NJPTRDeveloperConfirmed = true;
          document.dispatchEvent(new CustomEvent('watchdog:developer-confirmed'));
        }
        reveal();
        return { user: user, developer: isDeveloper };
      });
    }).catch(function (error) {
      if (!/required$/.test(error.message || '')) location.replace(destination('restricted'));
      throw error;
    });
  }

  var required = document.documentElement.getAttribute('data-access-require') ||
    (document.body && document.body.getAttribute('data-access-require'));
  if (required) document.documentElement.classList.add('access-pending');
  window.NJPTRAccess = { require: requireAccess, client: sb };
  window.njptrAccessReady = required ? requireAccess(required) : Promise.resolve({ developer: false });
})();
