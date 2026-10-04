/* 
     
     Hi There. I see you are checking the code. I'm sure you have reasons for such. Curiosity would be my guess. 

     My name is John. I've been building sites since I was 10. I was gifted ecommerce website software on floppy disks
     and fell in love with web developement ever since. I learned to code HTML using just notepad. I took computer science
     classes (BASIC and Visual Basic in high school). Took a few college classes learning C++, Python, Ruby and Javascript.
     My very first websites was with Angelfire and Geocities. In college I dabbed in game development, small tools, and
     graphic design. Database management with SQL by my sophmore year. Joomla and other CMS tools learned by the age of 20. 
     I have an understanding and experience writing code by hand, studing and analyzing bugs, issues, and corrections. 
     The introduction of AI is interesting. I can understand the worry and fear. I also see the memes of "Hey I can make 
     your job obsolete" then show a localhost:3000. haha. But I do believe, if you understand how to use the tools, it's
     no different than templates, hiring a local kid, outsourcing your work to fivrr or an agency. I code, I understand the
     backend and frontend. I'm not an expert by all means. But I do have insights. Watchdog was built on real research.
     Watchdog & it's companion, NJPropertyTaxRelief.com, is from years of listening to real people with real needs in NJ.
     I hope these sites and tools have benefit to you and/or your business. If you found them useful, the least I ask of
     you is to share. Sure, I have paid plan options for members, but majority of the site is free to use. I'm a real estate
     agent, licensed tax professional, and a big fan of the state of New Jersey. It's a great state, but not without its
     flaws. The idea is to educate more New Jerseyians about their benefits and property taxes in the state. It's possible
     one day this site will exceed some of the bigger natonal sites. Who knows. But for now, I present to you, Watchdog
     Property Intelligence.

     */
(function () {
  'use strict';

  var FALLBACK_URL = 'https://uvkvaxljhhngydvlrzom.supabase.co';
  var FALLBACK_KEY = 'sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa';
  var STAGING_URL = 'https://pxossnwmrygxlpxtstnl.supabase.co';
  var STAGING_KEY = 'sb_publishable_2knfdj4MRsPEtQpPbQ54ew_S5KngOcl';
  var STAGING_STORAGE = 'sb-pxossnwmrygxlpxtstnl-auth-token';
  var hostname = String(location.hostname || '').toLowerCase();
  var previewHost = hostname === 'localhost' || hostname === '127.0.0.1' || /\.vercel\.app$/.test(hostname);
  var cleanWatchdogHost = hostname === 'www.watchdogindex.com' || hostname === 'watchdogindex.com';
  var dashboardPath = cleanWatchdogHost ? '/dashboard' : '/property/dashboard';
  var trainingPath = '/agent/training/';
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
    // The auth library comes from a CDN; when it is blocked or offline there is no client to return.
    if (!window.supabase || typeof window.supabase.createClient !== 'function') return null;
    client = window.supabase.createClient(FALLBACK_URL, FALLBACK_KEY, { auth: {
      persistSession: true, autoRefreshToken: true, detectSessionInUrl: true,
      flowType: 'pkce', storageKey: previewHost ? STAGING_STORAGE : 'sb-uvkvaxljhhngydvlrzom-auth-token'
    }});
    return client;
  }

  // A redirect away (sign in, plan, training) rejects njptrAccessReady so pages
  // stop loading their data. The page is already leaving, so that rejection is
  // expected, not a crash: keep it out of the browser's uncaught-error reports.
  function leaving(error) {
    if (error && typeof error === 'object') {
      try { error.watchdogAccessRedirect = true; } catch (_error) {}
    }
    return error;
  }
  if (typeof window.addEventListener === 'function') {
    window.addEventListener('unhandledrejection', function (event) {
      if (event && event.reason && event.reason.watchdogAccessRedirect) event.preventDefault();
    });
  }

  function logicalPath(pathname) {
    var path = String(pathname || '').replace(/\/+$/, '');
    if (cleanWatchdogHost && (path === '/property' || path.indexOf('/property/') === 0)) {
      path = path.slice('/property'.length) || '/';
    }
    return path;
  }

  function destination(kind) {
    var params = new URLSearchParams();
    params.set('access', kind);
    params.set('return', location.pathname + location.search + location.hash);
    return dashboardPath + '?' + params.toString();
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
      if (!user) { location.replace(destination('signin')); throw leaving(new Error('Sign in required')); }
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
        if (!allowed) { location.replace(destination('restricted')); throw leaving(new Error('Plan access required')); }

        function finishAccess() {
          if (isDeveloper) {
            window.NJPTRDeveloperConfirmed = true;
            document.dispatchEvent(new CustomEvent('watchdog:developer-confirmed'));
          }
          reveal();
          return { user: user, developer: isDeveloper, entitlement: entitlement || null, plan: plan };
        }

        var pagePath = logicalPath(location.pathname).replace(/\/+$/, '');
        if (pagePath !== '/agent/training') {
          return sb().rpc('get_my_agent_training_state').then(function (trainingResult) {
            if (trainingResult.error) {
              console.warn('[Watchdog] professional training gate unavailable:', trainingResult.error.message || trainingResult.error);
              return finishAccess();
            }
            var training = Array.isArray(trainingResult.data) ? trainingResult.data[0] : trainingResult.data;
            if (training && training.required && !training.completed) {
              var returnTo = location.pathname + location.search + location.hash;
              location.replace(trainingPath + '?return=' + encodeURIComponent(returnTo));
              throw leaving(new Error('Training required'));
            }
            return finishAccess();
          });
        }

        return finishAccess();
      });
    }).catch(function (error) {
      if (!/required$/.test(error && error.message || '')) location.replace(destination('restricted'));
      throw leaving(error);
    });
  }

  var normalizedPath = logicalPath(location.pathname);
  var required = document.documentElement.getAttribute('data-access-require') ||
    (document.body && document.body.getAttribute('data-access-require'));
  if (normalizedPath === '/data-center') required = 'pro_plus';
  if (required) document.documentElement.classList.add('access-pending');
  window.NJPTRAccess = { require: requireAccess, client: sb };
  window.njptrAccessReady = required ? requireAccess(required) : Promise.resolve({ developer: false });
})();
