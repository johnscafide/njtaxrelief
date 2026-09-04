(function () {
  'use strict';

  if (window.WatchdogSignupAnalytics) return;

  var PREF_KEY = 'watchdog_cookie_preferences_v1';
  var VISITOR_KEY = 'wd_visitor_id';
  var SESSION_KEY = 'wd_session_id';
  var FIRST_TOUCH_KEY = 'wd_first_touch';
  var SESSION_TOUCH_KEY = 'wd_session_touch';
  var LEGACY_VISITOR_KEY = 'watchdog_signup_visitor_v1';
  var LEGACY_SESSION_KEY = 'watchdog_signup_session_v1';
  var PENDING_KEY = 'watchdog_signup_pending_v1';
  var initialized = false;
  var client = null;
  var context = null;
  var recorded = Object.create(null);
  var observer = null;
  var authListenerAttached = false;
  var authAttachAttempts = 0;

  function analyticsAllowed() {
    if (navigator.globalPrivacyControl === true || String(navigator.doNotTrack || '') === '1') return false;
    try {
      if (window.WatchdogConsent && typeof window.WatchdogConsent.state === 'function') {
        return window.WatchdogConsent.state().analytics === true;
      }
      var stored = JSON.parse(localStorage.getItem(PREF_KEY) || 'null');
      return !!(stored && stored.analytics === true);
    } catch (_error) {
      return false;
    }
  }

  function uuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
  }

  function newUuid() {
    return window.crypto && typeof window.crypto.randomUUID === 'function' ? window.crypto.randomUUID() : '';
  }

  function readJson(storage, key) {
    try { return JSON.parse(storage.getItem(key) || 'null'); } catch (_error) { return null; }
  }

  function writeJson(storage, key, value) {
    try { storage.setItem(key, JSON.stringify(value)); } catch (_error) {}
  }

  function readString(storage, key) {
    try { return storage.getItem(key) || ''; } catch (_error) { return ''; }
  }

  function writeString(storage, key, value) {
    try { storage.setItem(key, value); } catch (_error) {}
  }

  function referrerHost() {
    if (!document.referrer) return '';
    try {
      var url = new URL(document.referrer);
      var current = String(location.hostname || '').toLowerCase();
      var host = String(url.hostname || '').toLowerCase();
      return host && host !== current ? host : '';
    } catch (_error) {
      return '';
    }
  }

  function captureTouch() {
    var params;
    try { params = new URLSearchParams(location.search || ''); } catch (_error) { params = new URLSearchParams(); }
    return {
      referrer_host: referrerHost(),
      landing_path: String(location.pathname || '/').slice(0, 240),
      utm_source: String(params.get('utm_source') || '').slice(0, 80),
      utm_medium: String(params.get('utm_medium') || '').slice(0, 80),
      utm_campaign: String(params.get('utm_campaign') || '').slice(0, 120)
    };
  }

  function ensureContext() {
    if (context) return context;
    if (!window.crypto || typeof window.crypto.randomUUID !== 'function') return null;

    var visitorId = readString(localStorage, VISITOR_KEY);
    if (!uuid(visitorId)) {
      var legacyVisitor = readString(localStorage, LEGACY_VISITOR_KEY);
      visitorId = uuid(legacyVisitor) ? legacyVisitor : newUuid();
      writeString(localStorage, VISITOR_KEY, visitorId);
    }

    var sessionId = readString(sessionStorage, SESSION_KEY);
    var legacySession = readJson(sessionStorage, LEGACY_SESSION_KEY);
    if (!uuid(sessionId)) {
      sessionId = legacySession && uuid(legacySession.id) ? legacySession.id : newUuid();
      writeString(sessionStorage, SESSION_KEY, sessionId);
    }

    var firstTouch = readJson(localStorage, FIRST_TOUCH_KEY);
    if (!firstTouch) {
      firstTouch = captureTouch();
      writeJson(localStorage, FIRST_TOUCH_KEY, firstTouch);
    }

    var sessionTouch = readJson(sessionStorage, SESSION_TOUCH_KEY);
    if (!sessionTouch) {
      sessionTouch = legacySession && legacySession.touch ? legacySession.touch : captureTouch();
      writeJson(sessionStorage, SESSION_TOUCH_KEY, sessionTouch);
    }

    context = {
      visitor_id: visitorId,
      session_id: sessionId,
      touch: sessionTouch,
      first_touch: firstTouch
    };
    return context;
  }

  function inferredContext(target) {
    var path = String(location.pathname || '').toLowerCase();
    if (target && target.closest && target.closest('[data-anchor-auth-host],#wd-library-auth,.wd-anchor-home-funnel')) return 'anchor_application';
    if (path.indexOf('/anchor/') !== -1 || path.indexOf('/anchor') === 0) return 'anchor_application';
    if (path.indexOf('/onboarding') !== -1) return 'watchdog_onboarding';
    return 'watchdog_public';
  }

  function normalizeProvider(value) {
    var provider = String(value || '').trim().toLowerCase();
    if (!/^[a-z0-9_.-]{1,64}$/.test(provider)) return '';
    return provider;
  }

  function rememberPending(signupContext, provider) {
    var pending = {
      signup_context: signupContext || inferredContext(null),
      auth_provider: normalizeProvider(provider),
      at: Date.now()
    };
    writeJson(sessionStorage, PENDING_KEY, pending);
    return pending;
  }

  function readPending() {
    var pending = readJson(sessionStorage, PENDING_KEY);
    if (!pending || !pending.signup_context || Number(pending.at || 0) < Date.now() - (2 * 60 * 60 * 1000)) return null;
    return pending;
  }

  function db() {
    if (client) return client;
    if (!window.NJPTRSupabaseRuntime || typeof window.NJPTRSupabaseRuntime.createClient !== 'function') return null;
    try { client = window.NJPTRSupabaseRuntime.createClient(); } catch (_error) { client = null; }
    return client;
  }

  function record(eventName, provider, signupContext) {
    if (!initialized || !analyticsAllowed()) return Promise.resolve(null);
    var c = ensureContext();
    var database = db();
    if (!c || !database) return Promise.resolve(null);
    var touch = c.touch || {};
    return database.rpc('record_watchdog_auth_funnel_event', {
      p_event_name: eventName,
      p_visitor_id: c.visitor_id,
      p_session_id: c.session_id,
      p_signup_context: signupContext || inferredContext(null),
      p_auth_provider: normalizeProvider(provider) || null,
      p_path: String(location.pathname || '/').slice(0, 240),
      p_referrer_host: String(touch.referrer_host || '').slice(0, 120),
      p_landing_path: String(touch.landing_path || '').slice(0, 240),
      p_utm_source: String(touch.utm_source || '').slice(0, 80),
      p_utm_medium: String(touch.utm_medium || '').slice(0, 80),
      p_utm_campaign: String(touch.utm_campaign || '').slice(0, 120)
    }).then(function (result) {
      return result && result.error ? null : result;
    }).catch(function () { return null; });
  }

  function recordOnce(key, eventName, provider, signupContext) {
    var c = ensureContext();
    var fingerprint = (c ? c.session_id : 'none') + '|' + key;
    if (recorded[fingerprint]) return Promise.resolve(null);
    recorded[fingerprint] = true;
    return record(eventName, provider, signupContext);
  }

  function recentUser(user) {
    if (!user || !user.created_at) return false;
    var created = Date.parse(user.created_at);
    return Number.isFinite(created) && Math.abs(Date.now() - created) <= (2 * 60 * 60 * 1000);
  }

  function providerForUser(user, fallback) {
    var app = user && user.app_metadata || {};
    return normalizeProvider(app.provider) || normalizeProvider(fallback) || 'unknown';
  }

  function linkSession(session) {
    if (!initialized || !analyticsAllowed() || !session || !session.user || !recentUser(session.user)) return Promise.resolve(false);
    var pending = readPending();
    if (!pending) return Promise.resolve(false);

    var c = ensureContext();
    var database = db();
    if (!c || !database) return Promise.resolve(false);

    var signupContext = pending.signup_context;
    var provider = providerForUser(session.user, pending.auth_provider);

    return database.rpc('link_my_watchdog_signup_attribution', {
      p_visitor_id: c.visitor_id,
      p_session_id: c.session_id,
      p_signup_context: signupContext,
      p_auth_provider: provider
    }).then(function (result) {
      if (!result || result.error || result.data !== true) return false;
      try { sessionStorage.removeItem(PENDING_KEY); } catch (_error) {}
      return true;
    }).catch(function () { return false; });
  }

  function markSurface(target) {
    var signupContext = inferredContext(target);
    return recordOnce('surface|' + signupContext, 'signup_surface_viewed', '', signupContext);
  }

  function scanSurfaces() {
    var social = document.querySelector('.wd-auth-panel');
    if (social) markSurface(social);
    var library = document.querySelector('#wd-library-auth:not([hidden])');
    if (library) markSurface(library);
    var anchor = document.querySelector('[data-anchor-auth-host]:not([hidden])');
    if (anchor) markSurface(anchor);
  }

  function onClick(event) {
    if (!initialized || !analyticsAllowed()) return;
    var target = event.target && event.target.closest ? event.target.closest('button,a') : null;
    if (!target) return;

    var providerButton = target.closest('[data-provider]');
    if (providerButton) {
      var provider = normalizeProvider(providerButton.getAttribute('data-provider'));
      var socialContext = inferredContext(providerButton);
      rememberPending(socialContext, provider);
      recordOnce('provider|' + socialContext + '|' + provider, 'auth_provider_clicked', provider, socialContext);
      return;
    }

    if (target.closest('[data-email-start]')) {
      var emailContext = inferredContext(target);
      rememberPending(emailContext, 'email');
      recordOnce('provider|' + emailContext + '|email', 'auth_provider_clicked', 'email', emailContext);
      return;
    }

    if (target.matches('[data-email-send],[data-anchor-auth-send],#wd-library-send')) {
      var codeContext = inferredContext(target);
      rememberPending(codeContext, 'email');
      recordOnce('provider|' + codeContext + '|email', 'auth_provider_clicked', 'email', codeContext);
      record('auth_code_requested', 'email', codeContext);
      return;
    }

    if (target.matches('[data-email-verify],[data-anchor-auth-verify],#wd-library-verify')) {
      rememberPending(inferredContext(target), 'email');
    }
  }

  function attachAuthListener() {
    if (authListenerAttached) return;
    var database = db();
    if (!database || !database.auth) {
      authAttachAttempts += 1;
      if (authAttachAttempts <= 20) window.setTimeout(attachAuthListener, 250);
      return;
    }
    try {
      authListenerAttached = true;
      database.auth.onAuthStateChange(function (event, session) {
        if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') linkSession(session);
      });
      database.auth.getSession().then(function (result) {
        var session = result && result.data && result.data.session;
        if (session) linkSession(session);
      }).catch(function () {});
    } catch (_error) {
      authListenerAttached = false;
    }
  }

  function init() {
    if (initialized || !analyticsAllowed()) return;
    initialized = true;
    ensureContext();
    document.addEventListener('click', onClick, true);
    scanSurfaces();
    observer = new MutationObserver(function () { window.setTimeout(scanSurfaces, 0); });
    observer.observe(document.documentElement, { childList:true, subtree:true, attributes:true, attributeFilter:['hidden','class'] });
    attachAuthListener();
  }

  window.WatchdogSignupAnalytics = Object.freeze({
    enabled: function () { return initialized && analyticsAllowed(); },
    context: function () { return initialized ? ensureContext() : null; },
    record: record,
    linkSession: linkSession
  });

  if (analyticsAllowed()) init();
  window.addEventListener('watchdog:consent-change', function (event) {
    if (event && event.detail && event.detail.analytics === true) init();
  });
})();
