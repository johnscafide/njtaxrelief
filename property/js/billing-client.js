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
    if (!token) return Promise.reject(new Error('Paddle Checkout is not configured yet'));
    if (paddleReady) return paddleReady;
    paddleReady = new Promise(function (resolve, reject) {
      function init() {
        try {
          if (environment === 'sandbox') window.Paddle.Environment.set('sandbox');
          window.Paddle.Initialize({
            token: token,
            eventCallback: function (event) {
              if (event && event.name === 'checkout.completed') location.href = '/property/account.html?checkout=success';
              if (event && event.name === 'checkout.closed') busy = false;
            }
          });
          resolve(window.Paddle);
        } catch (e) { paddleReady = null; reject(e); }
      }
      if (window.Paddle) { init(); return; }
      var script = document.createElement('script');
      script.src = 'https://cdn.paddle.com/paddle/v2/paddle.js';
      script.async = true;
      script.onload = init;
      script.onerror = function () { paddleReady = null; reject(new Error('Paddle Checkout could not load')); };
      document.head.appendChild(script);
    });
    return paddleReady;
  }
  function checkout(value) {
    var wanted = plan(value); if (!wanted || busy) return Promise.resolve(); busy = true;
    return session().then(function (s) {
      if (!s) {
        try { sessionStorage.setItem('watchdog:billing:pending-plan', wanted); } catch (_) {}
        location.href = '/property/dashboard.html?billing=signin';
        return null;
      }
      return invoke('create-checkout-session', { plan: wanted }).then(function (j) {
        if (j.url) { location.href = j.url; return null; }
        if (j.plan_change_requested) {
          location.href = '/property/account.html?plan_change=pending&plan=' + encodeURIComponent(j.requested_plan || wanted);
          return null;
        }
        if (!j.transaction_id) throw new Error('Paddle transaction was not created');
        return loadPaddle(j.client_token, j.environment).then(function (paddle) {
          paddle.Checkout.open({ transactionId: j.transaction_id });
        });
      });
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
