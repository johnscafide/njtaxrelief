(function () {
  'use strict';

  /* The public lookup shell loads this runtime synchronously from public-nav.
     Load the free-first grid imagery translator here so legacy neighborhood
     card URLs are converted to NJGIN before ownership/lookup spend guards run. */
  if (!window.__WATCHDOG_FREE_IMAGERY_GRID__ && document.readyState === 'loading') {
    document.write('<script src="/property/js/free-imagery-grid-runtime.js"><\/script>');
  }

  function ensureConsentRuntime() {
    if (window.WatchdogConsent || document.querySelector('script[src="/property/js/watchdog-consent.js"]')) return;
    var script = document.createElement('script');
    script.src = '/property/js/watchdog-consent.js';
    script.async = false;
    script.setAttribute('data-watchdog-consent-runtime','1');
    (document.head || document.documentElement).appendChild(script);
  }
  ensureConsentRuntime();

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
  var cleanWatchdogHost = hostname === 'www.watchdogindex.com' || hostname === 'watchdogindex.com';
  var routePrefix = cleanWatchdogHost ? '' : '/property';
  var dashboardPath = routePrefix + '/dashboard/';
  var onboardingPath = routePrefix + '/onboarding/';
  var trainingPath = '/agent/training/';
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

  var emailTypos = {
    'gamil.com':'gmail.com','gmial.com':'gmail.com','gmai.com':'gmail.com','gmail.co':'gmail.com','gmail.cm':'gmail.com','gmail.con':'gmail.com','gmail.cmo':'gmail.com','gmail.comm':'gmail.com','gmail.ocm':'gmail.com',
    'hotnail.com':'hotmail.com','hotmai.com':'hotmail.com','hotmail.co':'hotmail.com','hotmail.con':'hotmail.com','outlok.com':'outlook.com','outllok.com':'outlook.com','outlook.co':'outlook.com','outlook.con':'outlook.com',
    'yaho.com':'yahoo.com','yahoo.co':'yahoo.com','yahoo.con':'yahoo.com','icloud.co':'icloud.com','icloud.con':'icloud.com','aol.con':'aol.com'
  };

  function checkEmailQuality(value) {
    var email = String(value || '').trim().toLowerCase();
    if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+$/.test(email)) return { valid:false, suspicious:false, email:email, suggestion:'', message:'Enter a valid email address.' };
    var parts = email.split('@');
    if (parts.length !== 2 || !parts[0] || !parts[1] || parts[0].length > 64) return { valid:false, suspicious:false, email:email, suggestion:'', message:'Enter a valid email address.' };
    var domain = parts[1];
    if (domain.length > 253 || domain.indexOf('.') < 1 || domain.indexOf('..') !== -1 || !/^[a-z0-9.-]+$/.test(domain) || /(^\.|\.$|^-|-$|\.-|-\.)/.test(domain)) return { valid:false, suspicious:false, email:email, suggestion:'', message:'Enter a valid email address.' };
    var labels = domain.split('.');
    if (labels.some(function(label){ return !label || label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label); })) return { valid:false, suspicious:false, email:email, suggestion:'', message:'Enter a valid email address.' };
    var suggestedDomain = emailTypos[domain] || '';
    if (!suggestedDomain && /\.con$/.test(domain)) suggestedDomain = domain.replace(/\.con$/,'.com');
    if (suggestedDomain) {
      var suggestion = parts[0] + '@' + suggestedDomain;
      return { valid:true, suspicious:true, email:email, suggestion:suggestion, message:'That email looks like a typo. Did you mean ' + suggestion + '? Please correct it before we send a code.' };
    }
    return { valid:true, suspicious:false, email:email, suggestion:'', message:'' };
  }

  function emailQualityError(result) {
    var error = new Error(result.message || 'Please check your email address.');
    error.name = 'EmailQualityError';
    error.code = result.suspicious ? 'email_typo' : 'invalid_email';
    error.suggested_email = result.suggestion || '';
    return error;
  }

  function warningFor(input) {
    if (!input || !input.parentNode) return null;
    var next = input.nextElementSibling;
    if (next && next.classList && next.classList.contains('watchdog-email-quality-warning')) return next;
    var warning = document.createElement('div');
    warning.className = 'watchdog-email-quality-warning';
    warning.setAttribute('role','alert');
    warning.style.cssText = 'display:none;margin-top:7px;padding:9px 11px;border-radius:10px;background:#fff4e5;color:#7a4312;font:700 12px/1.4 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;';
    input.insertAdjacentElement('afterend', warning);
    return warning;
  }

  function paintEmailQuality(input) {
    if (!input) return;
    var result = checkEmailQuality(input.value);
    var warning = warningFor(input);
    var show = !!String(input.value || '').trim() && (!result.valid || result.suspicious);
    if (warning) {
      warning.textContent = show ? result.message : '';
      warning.style.display = show ? 'block' : 'none';
    }
    if (show) input.setAttribute('aria-invalid','true');
    else input.removeAttribute('aria-invalid');
  }

  function installEmailQualityUi() {
    function scan(root) {
      var scope = root && root.querySelectorAll ? root : document;
      scope.querySelectorAll('input[type="email"],input[inputmode="email"]').forEach(function(input){
        if (input.dataset.watchdogEmailQuality === '1') return;
        input.dataset.watchdogEmailQuality = '1';
        input.addEventListener('blur',function(){ paintEmailQuality(input); });
        input.addEventListener('input',function(){ if (input.getAttribute('aria-invalid') === 'true') paintEmailQuality(input); });
      });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',function(){ scan(document); },{once:true});
    else scan(document);
    if (typeof MutationObserver !== 'undefined' && document.documentElement) new MutationObserver(function(records){
      records.forEach(function(record){ Array.prototype.forEach.call(record.addedNodes || [],function(node){ if (node && node.nodeType === 1) scan(node); }); });
    }).observe(document.documentElement,{childList:true,subtree:true});
  }

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

  function logicalPath(pathname) {
    var path = String(pathname || '/');
    if (cleanWatchdogHost && (path === '/property' || path.indexOf('/property/') === 0)) {
      path = path.slice('/property'.length) || '/';
    }
    return path;
  }

  function safeNext(value) {
    var fallback = String(location.pathname || dashboardPath) + String(location.search || '') + String(location.hash || '');
    try {
      var parsed = new URL(value || fallback, location.origin);
      if (parsed.origin !== location.origin) return dashboardPath;

      var path = logicalPath(parsed.pathname);
      if (cleanWatchdogHost) {
        if (path === '/onboarding' || path.indexOf('/onboarding/') === 0 || path.indexOf('/api/') === 0) return dashboardPath;
        return path + parsed.search + parsed.hash;
      }

      if (path.indexOf('/property/') !== 0 || path.indexOf('/property/onboarding') === 0) return dashboardPath;
      return path + parsed.search + parsed.hash;
    } catch (_error) {
      return dashboardPath;
    }
  }

  function onboardingRedirect(next) {
    return location.origin + onboardingPath + '?next=' + encodeURIComponent(safeNext(next));
  }

  function openOnboarding(next) {
    location.assign(onboardingRedirect(next || (location.pathname + location.search + location.hash)));
  }

  function installLegacySignInBridge() {
    function routeLegacySignIn() {
      openOnboarding(location.pathname + location.search + location.hash);
    }
    try {
      Object.defineProperty(window, 'plSignInPrompt', {
        configurable: true,
        enumerable: true,
        get: function () { return routeLegacySignIn; },
        set: function (legacyHandler) { window.__watchdogLegacySignInPrompt = legacyHandler; }
      });
    } catch (_error) {
      window.plSignInPrompt = routeLegacySignIn;
    }
  }

  function patchOAuth(instance) {
    if (!instance || !instance.auth || instance.auth.__watchdogOnboardingWrapped) return instance;
    var originalOAuth = instance.auth.signInWithOAuth && instance.auth.signInWithOAuth.bind(instance.auth);
    var originalOtp = instance.auth.signInWithOtp && instance.auth.signInWithOtp.bind(instance.auth);
    if (originalOAuth) {
      instance.auth.signInWithOAuth = function (args) {
        var request = Object.assign({}, args || {});
        request.options = Object.assign({}, request.options || {});
        var intendedNext = request.options.redirectTo || (location.pathname + location.search + location.hash);
        request.options.redirectTo = onboardingRedirect(intendedNext);
        return originalOAuth(request);
      };
    }
    if (originalOtp) {
      instance.auth.signInWithOtp = function (args) {
        var request = Object.assign({}, args || {});
        var result = checkEmailQuality(request.email);
        if (!result.valid || result.suspicious) return Promise.resolve({ data:{ user:null, session:null }, error:emailQualityError(result) });
        request.email = result.email;
        return originalOtp(request);
      };
    }
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
    var path = logicalPath(String(location.pathname || '')).replace(/\/+$/, '');
    if (path === '/onboarding' || path.indexOf('/onboarding/') === 0) return false;
    return /^\/(dashboard|home|account|agent-control|agent-desk|agent|transaction|analytics|integrations|marketing-studio|pro-hub|data-center|backoffice|pulse|compare|reports|watchlist)(?:\/|$)/.test(path);
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

        var memberPath = logicalPath(String(location.pathname || '')).replace(/\/+$/, '');
        if (memberPath === '/agent/training') {
          clearGate();
          return;
        }

        return guardClient.rpc('get_my_agent_training_state').then(function (trainingResult) {
          if (trainingResult.error) {
            console.warn('[Watchdog] professional training gate unavailable:', trainingResult.error.message || trainingResult.error);
            clearGate();
            return;
          }
          var training = Array.isArray(trainingResult.data) ? trainingResult.data[0] : trainingResult.data;
          if (training && training.required && !training.completed) {
            var returnTo = location.pathname + location.search + location.hash;
            location.replace(trainingPath + '?return=' + encodeURIComponent(returnTo));
            return;
          }
          clearGate();
        });
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
    cleanRoutes: cleanWatchdogHost,
    routePrefix: routePrefix,
    storageKey: 'sb-' + selected.ref + '-auth-token',
    createClient: createClient,
    onboardingUrl: onboardingRedirect,
    openOnboarding: openOnboarding,
    requireOnboarding: startOnboardingGate
  });

  window.WatchdogEmailQuality = Object.freeze({ check:checkEmailQuality, paint:paintEmailQuality });

  window.WatchdogAuth = Object.freeze({
    providers: providers,
    openSignIn: openOnboarding,
    signIn: function (provider, next) {
      var config = providers[provider];
      if (!config || !config.enabled) return Promise.reject(new Error('This sign-in provider is not enabled yet.'));
      return createClient().auth.signInWithOAuth({ provider:provider, options:{ redirectTo:safeNext(next) } });
    }
  });

  installLegacySignInBridge();
  installEmailQualityUi();
  watchLegacyAuthUi();
  startOnboardingGate();
})();
