/* Watchdog Agent trial landing page (/agents/trial) and thank-you page
   (/agents/trial/thanks). One page, one action.

   Variant A (public checkout open): "Start your 14-day Agent trial" opens the
   card-required Stripe Checkout through create-checkout-session with the
   first-use trial offer. Variant B (checkout controlled or closed): the
   Founding Agent invite request form is the primary action. The variant comes
   from the public get_public_checkout_mode read; the checkout function stays
   the authority and any rejection flips the page to variant B.

   Runs only on the clean and implementation paths of the two pages. */
(function () {
  'use strict';

  var path = String(location.pathname || '').replace(/\/+$/, '').replace(/\/index\.html$/i, '');
  var TRIAL_PATHS = { '/agents/trial': 1, '/property/agents/trial': 1 };
  var THANKS_PATHS = { '/agents/trial/thanks': 1, '/property/agents/trial/thanks': 1 };
  var isThanks = Boolean(THANKS_PATHS[path]);
  var isTrial = Boolean(TRIAL_PATHS[path]);
  if (!isThanks && !isTrial) return;

  var TRIAL_OFFER = 'watchdog_14d_card_v1';
  var PRODUCTION_FUNCTIONS = 'https://uvkvaxljhhngydvlrzom.supabase.co/functions/v1/';
  var PRODUCTION_KEY = 'sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa';
  /* 15-minute onboarding call. Leave empty until the scheduler link is
     confirmed; the button then points at the contact page. */
  var SCHEDULER_URL = '';

  var runtime = window.NJPTRSupabaseRuntime || null;
  var prefix = runtime ? runtime.routePrefix : (/^\/property\//.test(location.pathname) ? '/property' : '');
  var trialPath = prefix + '/agents/trial';
  var thanksPath = prefix + '/agents/trial/thanks';
  var query = new URLSearchParams(location.search || '');
  var busy = false;

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function client() {
    try {
      if (runtime && typeof runtime.createClient === 'function') return runtime.createClient();
      if (window.WatchdogBilling && typeof window.WatchdogBilling.client === 'function') return window.WatchdogBilling.client();
    } catch (_) {}
    return null;
  }

  function functionsBase() {
    return (runtime && runtime.url ? String(runtime.url).replace(/\/$/, '') + '/functions/v1/' : PRODUCTION_FUNCTIONS);
  }
  function publishableKey() { return (runtime && runtime.key) || PRODUCTION_KEY; }

  /* GA4 (injected by the routing adapter on the Watchdog host) plus the
     first-party product analytics for the events it accepts. */
  function ga(name, params) {
    try { if (typeof window.gtag === 'function') window.gtag('event', name, Object.assign({ page_type: isThanks ? 'agent_trial_thanks' : 'agent_trial_landing' }, params || {})); } catch (_) {}
  }
  function wd(name, props) {
    try { if (window.WatchdogAnalytics && typeof window.WatchdogAnalytics.track === 'function') window.WatchdogAnalytics.track(name, props || {}); } catch (_) {}
  }

  function currentVariant() { return document.documentElement.getAttribute('data-trial-variant') || 'b'; }
  function setVariant(v) {
    document.documentElement.setAttribute('data-trial-variant', v === 'a' ? 'a' : 'b');
    $$('[data-variant-label]').forEach(function (n) { n.textContent = v === 'a' ? 'a' : 'b'; });
  }

  function notice(message, isError) {
    var n = $('[data-trial-notice]');
    if (!n) return;
    n.textContent = message || '';
    n.hidden = !message;
    n.classList.toggle('is-error', Boolean(isError));
    if (message) { try { n.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (_) {} }
  }

  function setBusy(on) {
    busy = Boolean(on);
    $$('[data-trial-cta]').forEach(function (b) {
      b.setAttribute('aria-busy', busy ? 'true' : 'false');
      b.disabled = busy;
      if (busy) { b.dataset.label = b.dataset.label || b.textContent; b.textContent = 'Opening secure checkout'; }
      else if (b.dataset.label) b.textContent = b.dataset.label;
    });
  }

  /* Variant resolution: forced with ?variant=a|b for QA, otherwise the public
     checkout-mode read. Anything but "open" renders the invite door. */
  function resolveVariant() {
    var forced = query.get('variant');
    if (forced === 'a' || forced === 'b') return Promise.resolve(forced);
    var c = client();
    if (!c || typeof c.rpc !== 'function') return Promise.resolve('b');
    return c.rpc('get_public_checkout_mode').then(function (r) {
      if (r.error) return 'b';
      var data = Array.isArray(r.data) ? r.data[0] : r.data;
      var mode = typeof data === 'string' ? data : (data && data.get_public_checkout_mode) || '';
      return String(mode).toLowerCase() === 'open' ? 'a' : 'b';
    }).catch(function () { return 'b'; });
  }

  function signInReturnTo(next) {
    if (window.WatchdogAuth && typeof window.WatchdogAuth.openSignIn === 'function') { window.WatchdogAuth.openSignIn(next); return; }
    location.assign(prefix + '/onboarding/?next=' + encodeURIComponent(next));
  }

  function session() {
    var c = client();
    if (!c) return Promise.resolve(null);
    return c.auth.getSession().then(function (r) { return r && r.data && r.data.session ? r.data.session : null; }).catch(function () { return null; });
  }

  function checkoutErrorMessage(e) {
    var code = e && e.code ? String(e.code) : '';
    if (code === 'SIGN_IN_REQUIRED') return { text: 'Sign in first, then the trial starts.', flip: false, signIn: true };
    if (code === 'BILLING_ENROLLMENT_CLOSED' || code === 'BILLING_CONTROLLED_ONLY' || code === 'BILLING_GATE_NOT_PASSED' || code === 'CONTROLLED_TRIAL_UNAVAILABLE') {
      return { text: 'Public enrollment is not open yet. Request a Founding Agent invite below and we will email you the day it opens.', flip: true };
    }
    if (code === 'TRIAL_ALREADY_USED' || code === 'CONTROLLED_TRIAL_ALREADY_USED' || code === 'CONTROLLED_TRIAL_NOT_ELIGIBLE') {
      return { text: 'This account has already used its Agent trial. Open Account to choose a plan.', flip: false, account: true };
    }
    if (code === 'LEGACY_SUBSCRIPTION_MIGRATION_REQUIRED') return { text: 'This account has legacy billing that must be migrated before starting Stripe. Contact Watchdog support so you are not charged twice.', flip: false };
    if (code === 'WATCHDOG_TEST_NO_REAL_SPEND') return { text: 'This test account cannot create a real charge.', flip: false };
    if (code === 'PRICE_NOT_CONFIGURED' || code === 'STRIPE_NOT_CONFIGURED' || code === 'STRIPE_API_KEY_INVALID') return { text: 'Checkout is not configured yet. Your card was not charged.', flip: false };
    return { text: 'Checkout could not open: ' + ((e && e.message) || 'unknown error') + '. Nothing was charged.', flip: false };
  }

  function launchCheckout() {
    if (busy) return;
    if (!window.WatchdogBilling || typeof window.WatchdogBilling.invoke !== 'function') { notice('Checkout is not available right now. Nothing was charged.', true); return; }
    setBusy(true);
    notice('');
    ga('checkout_started', { plan: 'agent', cadence: 'monthly', variant: currentVariant() });
    wd('checkout_started', { plan: 'agent', billing_period: 'monthly', source: 'agents_trial' });
    window.WatchdogBilling.invoke('create-checkout-session', { plan: 'agent', tier: 'agent', cadence: 'monthly', trial: true, offer: TRIAL_OFFER, return_to: 'agents_trial' })
      .then(function (p) {
        if (!p || !p.url) throw new Error('Stripe did not return a secure checkout URL.');
        location.href = p.url;
      })
      .catch(function (e) {
        setBusy(false);
        var m = checkoutErrorMessage(e);
        if (m.signIn) { signInReturnTo(trialPath + '?start=trial'); return; }
        if (m.flip) { setVariant('b'); ga('view_landing', { variant: 'b', reason: 'checkout_rejected' }); }
        notice(m.text + (m.account ? ' ' : ''), true);
        if (m.account) {
          var n = $('[data-trial-notice]');
          // content-architecture: dynamic, this notice and link exist only for a server-side checkout rejection code; the text is chosen from live billing state, not static page copy.
          if (n) { var a = document.createElement('a'); a.href = prefix + '/account'; a.textContent = 'Open Account'; n.appendChild(document.createTextNode(' ')); n.appendChild(a); }
        }
      });
  }

  function startTrial(position) {
    if (busy) return;
    ga('cta_click', { cta: 'trial', position: position || 'hero', variant: currentVariant() });
    wd('upgrade_cta_clicked', { plan: 'agent', source: 'agents_trial' });
    session().then(function (s) {
      if (!s) { signInReturnTo(trialPath + '?start=trial'); return; }
      launchCheckout();
    });
  }

  /* Founding Agent invite request: a backoffice lead plus an internal email.
     No card, no trial is created here; invite codes go out by hand in batches. */
  function bindInviteForm() {
    var form = $('[data-invite-form]');
    if (!form) return;
    var status = $('[data-invite-status]', form);
    var submit = $('button[type="submit"]', form);
    function setStatus(text, kind) {
      if (!status) return;
      status.textContent = text || '';
      status.classList.remove('is-error', 'is-success');
      if (kind) status.classList.add(kind);
    }
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!form.reportValidity()) return;
      var data = new FormData(form);
      /* Sent to the existing plans-page request endpoint with the fields it
         already accepts. Brokerage travels as company; office town, license
         and page variant travel in the message so the backoffice lead reads
         as a Founding Agent invite request. */
      var officeTown = String(data.get('office_town') || '').trim();
      var license = String(data.get('license_number') || '').trim();
      var payload = {
        full_name: String(data.get('full_name') || '').trim(),
        email: String(data.get('email') || '').trim(),
        company: String(data.get('brokerage') || '').trim(),
        role: 'Real estate agent',
        volume: 'Founding Agent invite request',
        plan: 'agent',
        cadence: 'monthly',
        website: String(data.get('website') || '').trim(),
        source: 'agents-trial',
        page_url: location.href.slice(0, 500),
        message: ['Founding Agent invite request.', 'Office town: ' + (officeTown || 'not provided') + '.', license ? 'NJ license: ' + license + '.' : '', 'Page variant: ' + currentVariant() + '.'].filter(Boolean).join(' ')
      };
      if (submit) submit.disabled = true;
      setStatus('Sending your request', '');
      fetch(functionsBase() + 'pro-demo-request', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: publishableKey() }, body: JSON.stringify(payload) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (body) { if (!r.ok) throw new Error(body.error || 'Request could not be sent.'); return body; }); })
        .then(function () {
          ga('founding_invite_requested', { variant: currentVariant(), source_page: isThanks ? 'thanks' : 'agents_trial' });
          setStatus('Request received.', 'is-success');
          try { sessionStorage.setItem('watchdog:founding-invite:requested', '1'); } catch (_) {}
          location.assign(thanksPath + '?invite=requested');
        })
        .catch(function (err) {
          if (submit) submit.disabled = false;
          setStatus((err && err.message) || 'Could not send your request. Please try again.', 'is-error');
        });
    });
  }

  function bindInviteModal() {
    var modal = $('[data-invite-modal]');
    if (!modal) return;
    var prior = null;
    function open(position) {
      ga('cta_click', { cta: 'invite', position: position || 'hero', variant: currentVariant() });
      prior = document.activeElement;
      modal.hidden = false;
      document.body.style.overflow = 'hidden';
      var first = $('input', modal);
      if (first) first.focus();
    }
    function close() {
      modal.hidden = true;
      document.body.style.overflow = '';
      if (prior && prior.focus) prior.focus();
    }
    $$('[data-invite-cta]').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.preventDefault();
        /* In variant B the form is inline; scroll to it instead of a modal. */
        var inline = $('[data-invite-inline]');
        if (currentVariant() === 'b' && inline && !inline.hidden) {
          ga('cta_click', { cta: 'invite', position: b.dataset.position || 'hero', variant: 'b' });
          inline.scrollIntoView({ behavior: 'smooth', block: 'start' });
          var first = $('input', inline); if (first) first.focus({ preventScroll: true });
          return;
        }
        open(b.dataset.position);
      });
    });
    $$('[data-invite-close]', modal).forEach(function (b) { b.addEventListener('click', close); });
    modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !modal.hidden) close(); });
  }

  /* In variant B the inline form is the primary action; in variant A the same
     form lives in a sheet behind the secondary link. One form element is
     moved between the two homes so there is a single set of fields. */
  function placeInviteForm() {
    var form = $('[data-invite-form]');
    var inline = $('[data-invite-inline]');
    var sheet = $('[data-invite-sheet-host]');
    if (!form || !inline || !sheet) return;
    var inlineHost = $('.wt-wrap', inline) || inline;
    if (currentVariant() === 'b') { inlineHost.appendChild(form); inline.hidden = false; }
    else { sheet.appendChild(form); inline.hidden = true; }
  }

  function bindSticky() {
    var bar = $('[data-sticky]');
    var hero = $('[data-hero]');
    if (!bar || !hero) return;
    document.body.classList.add('wt-has-sticky');
    function update() {
      var pastHero = hero.getBoundingClientRect().bottom < 0;
      var faqOpen = Boolean($('.wt-faq details[open]'));
      var modalOpen = Boolean($('[data-invite-modal]:not([hidden])'));
      bar.hidden = !(pastHero && !faqOpen && !modalOpen);
    }
    window.addEventListener('scroll', update, { passive: true });
    document.addEventListener('toggle', update, true);
    update();
  }

  function bindFaq() {
    $$('.wt-faq details').forEach(function (d, i) {
      d.addEventListener('toggle', function () { if (d.open) ga('faq_open', { question: i + 1, variant: currentVariant() }); });
    });
  }

  function bindSignIn() {
    $$('[data-signin]').forEach(function (a) {
      a.addEventListener('click', function (e) { e.preventDefault(); signInReturnTo(isThanks ? location.pathname + location.search : trialPath); });
    });
  }

  function bootLanding() {
    bindSignIn();
    bindInviteForm();
    bindInviteModal();
    bindFaq();
    $$('[data-trial-cta]').forEach(function (b) { b.addEventListener('click', function (e) { e.preventDefault(); startTrial(b.dataset.position); }); });
    $$('[data-free-cta]').forEach(function (b) { b.addEventListener('click', function () { ga('cta_click', { cta: 'free', position: b.dataset.position || 'hero', variant: currentVariant() }); }); });

    if (query.get('checkout') === 'cancelled') notice('Checkout was cancelled. Nothing was charged. Start again whenever you are ready.');

    resolveVariant().then(function (v) {
      setVariant(v);
      placeInviteForm();
      bindSticky();
      ga('view_landing', { variant: v });
      wd('page_view', { tool: 'agents_trial', plan: 'agent' });

      /* Returning from sign-in with ?start=trial: open checkout once. */
      if (query.get('start') === 'trial') {
        try { history.replaceState(null, '', location.pathname); } catch (_) {}
        if (v !== 'a') { notice('Public enrollment is not open yet. Request a Founding Agent invite below.'); return; }
        session().then(function (s) { if (s) launchCheckout(); });
      }
    });
  }

  /* Thank-you page. Reached with ?checkout=trial&session_id=... after Stripe,
     or ?invite=requested after the form. A bare visit shows "Start here" and
     fires nothing. */
  function showThanks(state) {
    $$('[data-thanks-state]').forEach(function (n) { n.hidden = n.getAttribute('data-thanks-state') !== state; });
  }

  function bootThanks() {
    bindSignIn();
    bindInviteForm();
    var sessionId = String(query.get('session_id') || '').slice(0, 120);
    var mode = query.get('checkout') === 'trial' && sessionId ? 'trial' : (query.get('invite') === 'requested' ? 'invite' : 'none');
    var scheduler = $$('[data-scheduler]');
    scheduler.forEach(function (a) { a.setAttribute('href', SCHEDULER_URL || (prefix + '/contact')); });
    $$('[data-thanks-step]').forEach(function (a) { a.addEventListener('click', function () { ga('thanks_step_click', { step: Number(a.dataset.thanksStep) || 0 }); }); });

    if (mode === 'none') { showThanks('none'); return; }
    if (mode === 'invite') {
      showThanks('invite');
      ga('thanks_view', { variant: 'b' });
      return;
    }
    showThanks('checking');
    session().then(function (s) {
      if (!s) { showThanks('signin'); return; }
      showThanks('trial');
      var key = 'watchdog:trial_started:' + sessionId;
      var already = false;
      try { already = sessionStorage.getItem(key) === '1'; } catch (_) {}
      if (!already) {
        try { sessionStorage.setItem(key, '1'); } catch (_) {}
        ga('trial_started', { plan: 'agent', cadence: 'monthly', variant: 'a', event_id: sessionId });
        wd('subscription_confirmed', { plan: 'agent', billing_period: 'monthly', status: 'trialing', source: 'agents_trial' });
      }
      /* Best-effort status line from the server-owned billing state. The
         webhook can lag the redirect by a few seconds, so a missing row is
         not treated as an error. */
      var c = client();
      if (!c || typeof c.rpc !== 'function') return;
      c.rpc('get_my_account_billing_state').then(function (r) {
        if (r.error) return;
        var row = Array.isArray(r.data) ? r.data[0] : r.data;
        var status = row && (row.subscription_status || row.status);
        var line = $('[data-trial-status]');
        if (!line) return;
        if (status === 'trialing') line.textContent = 'Your Agent trial is active. Your card is charged $14.99 on day 14 unless you cancel first.';
        else if (status === 'active') line.textContent = 'Your Agent plan is active.';
        else line.textContent = 'Your trial is being confirmed with Stripe. Refresh this page in a moment if the status does not update.';
      }).catch(function () {});
    });
  }

  function boot() { if (isThanks) bootThanks(); else bootLanding(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
