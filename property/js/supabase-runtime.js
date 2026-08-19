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
  var providerDefaults = {
    google: { label:'Google', enabled:true },
    apple: { label:'Apple', enabled:false },
    facebook: { label:'Facebook', enabled:true },
    linkedin_oidc: { label:'LinkedIn', enabled:true }
  };
  var providerOverrides = window.WATCHDOG_AUTH_PROVIDER_FLAGS || {};
  var providers = {};

  Object.keys(providerDefaults).forEach(function (key) {
    providers[key] = Object.assign({}, providerDefaults[key], providerOverrides[key] || {});
  });

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

  function safeNext(value) {
    var fallback = String(location.pathname || '/property/dashboard/') + String(location.search || '') + String(location.hash || '');
    try {
      var parsed = new URL(value || fallback, location.origin);
      if (parsed.origin !== location.origin || parsed.pathname.indexOf('/property/') !== 0 || parsed.pathname.indexOf('/property/onboarding') === 0) {
        return '/property/dashboard/';
      }
      return parsed.pathname + parsed.search + parsed.hash;
    } catch (_error) {
      return '/property/dashboard/';
    }
  }

  function onboardingRedirect(next) {
    return location.origin + '/property/onboarding/?next=' + encodeURIComponent(safeNext(next));
  }

  function patchOAuth(instance) {
    if (!instance || !instance.auth || instance.auth.__watchdogOnboardingWrapped) return instance;
    var originalOAuth = instance.auth.signInWithOAuth && instance.auth.signInWithOAuth.bind(instance.auth);
    if (!originalOAuth) return instance;

    instance.auth.signInWithOAuth = function (args) {
      var request = Object.assign({}, args || {});
      request.options = Object.assign({}, request.options || {});
      var intendedNext = request.options.redirectTo || (location.pathname + location.search + location.hash);
      request.options.redirectTo = onboardingRedirect(intendedNext);
      return originalOAuth(request);
    };
    try { Object.defineProperty(instance.auth, '__watchdogOnboardingWrapped', { value:true }); } catch (_error) { instance.auth.__watchdogOnboardingWrapped = true; }
    return instance;
  }

  if (window.supabase && typeof window.supabase.createClient === 'function' && !window.supabase.__watchdogRuntimeWrapped) {
    var originalCreateClient = window.supabase.createClient.bind(window.supabase);
    window.supabase.createClient = function (url, key, options) {
      var known = knownConfigForUrl(url);
      if (known) return patchOAuth(originalCreateClient(selected.url, selected.key, runtimeOptions(options)));
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
    client = patchOAuth(window.supabase.createClient(selected.url, selected.key, runtimeOptions()));
    return client;
  }

  function isProtectedMemberPath() {
    var path = String(location.pathname || '').replace(/\/+$/, '');
    if (path.indexOf('/property/onboarding') === 0) return false;
    return /^\/property\/(dashboard|home|account|agent-control|agent-desk|analytics|integrations|marketing-studio|pro-hub|data-center|backoffice|pulse|compare|reports|watchlist)(?:\/|$)/.test(path);
  }

  function clearGate() {
    document.documentElement.removeAttribute('data-watchdog-onboarding');
    var style = document.getElementById('watchdog-onboarding-gate-style');
    if (style) style.remove();
  }

  function startOnboardingGate() {
    if (!isProtectedMemberPath()) return;
    document.documentElement.setAttribute('data-watchdog-onboarding','pending');
    var style = document.createElement('style');
    style.id = 'watchdog-onboarding-gate-style';
    style.textContent = 'html[data-watchdog-onboarding="pending"] body{visibility:hidden!important}';
    (document.head || document.documentElement).appendChild(style);

    var guardClient;
    try { guardClient = createClient(); } catch (_error) { clearGate(); return; }
    guardClient.auth.getSession().then(function (result) {
      var session = result && result.data && result.data.session;
      if (!session || !session.user) { clearGate(); return null; }
      return guardClient.rpc('get_my_watchdog_onboarding_state').then(function (stateResult) {
        if (stateResult.error) {
          console.warn('[Watchdog] onboarding gate unavailable:', stateResult.error.message || stateResult.error);
          clearGate();
          return;
        }
        var state = Array.isArray(stateResult.data) ? stateResult.data[0] : stateResult.data;
        if (!state || !state.completed) {
          location.replace(onboardingRedirect(location.pathname + location.search + location.hash));
          return;
        }
        clearGate();
      });
    }).catch(function (error) {
      console.warn('[Watchdog] onboarding gate check failed:', error && error.message || error);
      clearGate();
    });
  }

  function stripLegacyEmailSignup(scope) {
    var host = scope && scope.querySelectorAll ? scope : document;
    host.querySelectorAll('.auth-magic').forEach(function (node) { node.remove(); });
    host.querySelectorAll('button[onclick*="plMagicLink"],button[onclick*="signInWithOtp"]').forEach(function (node) {
      var wrap = node.closest('.auth-magic') || node.closest('form');
      if (wrap && /sign in link|magic link|email/i.test(wrap.textContent || '')) wrap.remove();
      else node.remove();
    });
    host.querySelectorAll('.auth-or').forEach(function (node) { node.remove(); });
  }

  function watchLegacyAuthUi() {
    function clean() { stripLegacyEmailSignup(document); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', clean, { once:true });
    else clean();
    if (typeof MutationObserver !== 'undefined' && document.documentElement) {
      var observer = new MutationObserver(function (records) {
        for (var i=0;i<records.length;i++) {
          if (records[i].addedNodes && records[i].addedNodes.length) { clean(); break; }
        }
      });
      observer.observe(document.documentElement, { childList:true, subtree:true });
    }
  }

  window.NJPTRSupabaseRuntime = Object.freeze({
    ref: selected.ref,
    url: selected.url,
    key: selected.key,
    environment: selected.environment,
    isPreview: previewHost,
    storageKey: 'sb-' + selected.ref + '-auth-token',
    createClient: createClient,
    onboardingUrl: onboardingRedirect,
    requireOnboarding: startOnboardingGate
  });

  window.WatchdogAuth = Object.freeze({
    providers: providers,
    signIn: function (provider, next) {
      var config = providers[provider];
      if (!config || !config.enabled) return Promise.reject(new Error('This sign-in provider is not enabled yet.'));
      return createClient().auth.signInWithOAuth({ provider:provider, options:{ redirectTo:safeNext(next) } });
    }
  });

  watchLegacyAuthUi();
  startOnboardingGate();
})();
