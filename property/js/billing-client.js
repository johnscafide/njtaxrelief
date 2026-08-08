(function () {
  'use strict';
  var URL = 'https://uvkvaxljhhngydvlrzom.supabase.co';
  var KEY = 'sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa';
  var client = null;
  var busy = false;
  var paddleReady = null;
  function sb() {
    if (!client && window.supabase) client = window.supabase.createClient(URL, KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce', storageKey: 'sb-uvkvaxljhhngydvlrzom-auth-token' } });
    return client;
  }
  function plan(value) { return value === 'pro_plus' || value === 'Pro+' ? 'pro_plus' : value === 'pro' || value === 'Pro' ? 'pro' : null; }
  function session() { var c = sb(); return c ? c.auth.getSession().then(function (r) { return r.data && r.data.session; }) : Promise.resolve(null); }
  function invoke(name, body) {
    return session().then(function (s) {
      if (!s) throw new Error('SIGN_IN_REQUIRED');
      return fetch(URL + '/functions/v1/' + name, { method: 'POST', headers: { 'Authorization': 'Bearer ' + s.access_token, 'apikey': KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
    }).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'Billing request failed'); return j; }); });
  }
  function loadPaddle(token, environment) {
    if (paddleReady) return paddleReady;
    paddleReady = new Promise(function (resolve, reject) {
      function start() {
        try {
          if (!window.Paddle) throw new Error('Paddle Checkout did not load');
          if (environment === 'sandbox') window.Paddle.Environment.set('sandbox');
          window.Paddle.Initialize({ token: token });
          resolve(window.Paddle);
        } catch (e) { reject(e); }
      }
      if (window.Paddle) { start(); return; }
      var script = document.createElement('script');
      script.src = 'https://cdn.paddle.com/paddle/v2/paddle.js';
      script.async = true;
      script.onload = start;
      script.onerror = function () { reject(new Error('Could not load secure checkout')); };
      document.head.appendChild(script);
    });
    return paddleReady;
  }
  function openCheckout(j) {
    if (j.url) { location.href = j.url; return Promise.resolve(); }
    if (j.provider !== 'paddle' || !j.transaction_id || !j.client_token) throw new Error('Checkout response is incomplete');
    return loadPaddle(j.client_token, j.environment).then(function (paddle) {
      paddle.Checkout.open({ transactionId: j.transaction_id, settings: { displayMode: 'overlay', variant: 'one-page', theme: 'light', locale: 'en', successUrl: 'https://njpropertytaxrelief.com/property/account.html?checkout=success' } });
      busy = false;
    });
  }
  function checkout(value) {
    var wanted = plan(value); if (!wanted || busy) return Promise.resolve(); busy = true;
    return session().then(function (s) {
      if (!s) {
        try { sessionStorage.setItem('watchdog:billing:pending-plan', wanted); } catch (_) {}
        location.href = '/property/dashboard.html?billing=signin';
        return null;
      }
      return invoke('create-checkout-session', { plan: wanted }).then(openCheckout);
    }).catch(function (e) { busy = false; alert(e.message === 'SIGN_IN_REQUIRED' ? 'Please sign in first.' : e.message); });
  }
  function portal() {
    if (busy) return Promise.resolve(); busy = true;
    return invoke('create-portal-session').then(function (j) { if (j.url) location.href = j.url; }).catch(function (e) { busy = false; alert(e.message); });
  }
  function resume() {
    var wanted = null; try { wanted = sessionStorage.getItem('watchdog:billing:pending-plan'); } catch (_) {}
    if (!wanted) return;
    session().then(function (s) {
      if (!s) return;
      try { sessionStorage.removeItem('watchdog:billing:pending-plan'); } catch (_) {}
      busy = false; checkout(wanted);
    });
  }
  function bind() {
    document.addEventListener('click', function (e) {
      var c = e.target.closest('[data-billing-plan]'); if (c) { e.preventDefault(); checkout(c.dataset.billingPlan); return; }
      var p = e.target.closest('[data-billing-portal]'); if (p) { e.preventDefault(); portal(); }
    });
  }
  window.WatchdogBilling = { checkout: checkout, portal: portal, resume: resume, client: sb };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true }); else bind();
})();
