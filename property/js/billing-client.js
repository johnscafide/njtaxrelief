(function () {
  'use strict';

  var URL = 'https://uvkvaxljhhngydvlrzom.supabase.co';
  var KEY = 'sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa';
  var client = null;
  var busy = false;
  var paddleReady = null;

  function sb() {
    if (!client && window.supabase) {
      client = window.supabase.createClient(URL, KEY, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          flowType: 'pkce',
          storageKey: 'sb-uvkvaxljhhngydvlrzom-auth-token'
        }
      });
    }
    return client;
  }

  function product(value) {
    var raw = String(value || '').toLowerCase();
    if (raw === 'agent' || raw === 'pro') return { tier: 'agent', plan: 'pro' };
    if (raw === 'professional' || raw === 'pro_plus' || raw === 'pro+') {
      return { tier: 'professional', plan: 'pro_plus' };
    }
    if (raw === 'firm' || raw === 'firm_api' || raw === 'teams') {
      return { tier: 'firm', plan: 'teams', gated: true };
    }
    return null;
  }

  function cadence(value) {
    return value === 'monthly' ? 'monthly' : 'yearly';
  }

  function session() {
    var c = sb();
    return c
      ? c.auth.getSession().then(function (result) { return result.data && result.data.session; })
      : Promise.resolve(null);
  }

  function toast(message) {
    var node = document.getElementById('wd-billing-toast');
    if (!node) {
      node = document.createElement('div');
      node.id = 'wd-billing-toast';
      node.setAttribute('role', 'alert');
      Object.assign(node.style, {
        position: 'fixed', right: '18px', bottom: '18px', zIndex: '100000', maxWidth: '390px',
        padding: '14px 17px', borderRadius: '12px', background: '#10294b', color: '#fff',
        boxShadow: '0 16px 38px rgba(8,25,48,.28)', font: '700 14px/1.45 "Source Sans 3",sans-serif'
      });
      document.body.appendChild(node);
    }
    node.textContent = message;
    node.hidden = false;
    clearTimeout(window.__wdBillingToast);
    window.__wdBillingToast = setTimeout(function () { node.hidden = true; }, 6200);
  }

  function billingError(error, context) {
    console.error('Billing ' + context + ' failed', error);
    var message = error && error.message === 'SIGN_IN_REQUIRED'
      ? 'Please sign in before managing a plan.'
      : error && error.code === 'ENROLLMENT_CLOSED'
        ? 'Paid enrollment is still in controlled release. Your account was not charged.'
        : error && error.code === 'PRICE_NOT_CONFIGURED'
          ? 'That billing option is being configured. Your account was not charged.'
          : error && error.code === 'FIRM_GATED'
            ? 'Firm / API access is being enrolled separately while team controls are completed.'
            : context === 'portal'
              ? 'We could not open billing management. Please try again in a moment.'
              : 'We could not start checkout. Your account was not charged. Please try again.';
    toast(message);
  }

  function invoke(name, body) {
    return session().then(function (activeSession) {
      if (!activeSession) throw new Error('SIGN_IN_REQUIRED');
      return fetch(URL + '/functions/v1/' + name, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + activeSession.access_token,
          apikey: KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body || {})
      });
    }).then(function (response) {
      return response.json().then(function (payload) {
        if (!response.ok) {
          var error = new Error(payload.error || 'Billing request failed');
          error.code = payload.code || '';
          throw error;
        }
        return payload;
      });
    });
  }

  function entitlement() {
    var c = sb();
    return c ? c.rpc('get_my_entitlement').then(function (result) {
      if (result.error) throw result.error;
      var rows = result.data || [];
      return Array.isArray(rows) ? (rows[0] || {}) : rows;
    }) : Promise.resolve({});
  }

  function downgradeDialog() {
    return new Promise(function (resolve) {
      var old = document.getElementById('wd-downgrade-dialog');
      if (old) old.remove();
      var wrap = document.createElement('div');
      wrap.id = 'wd-downgrade-dialog';
      wrap.className = 'wd-billing-dialog';
      wrap.innerHTML = '<div class="wd-billing-backdrop"></div>' +
        '<section role="dialog" aria-modal="true" aria-labelledby="wd-downgrade-title" class="wd-billing-sheet">' +
        '<button class="wd-billing-x" type="button" aria-label="Keep Professional and close">&times;</button>' +
        '<span class="wd-billing-kicker">Confirm your plan change</span>' +
        '<h2 id="wd-downgrade-title">Move from Professional to Agent?</h2>' +
        '<p>You will keep Agent tools, saved properties and account history. Professional data operations, bulk workflows and advanced exports will become locked.</p>' +
        '<div class="wd-billing-note"><b>This change happens now.</b><span>Paddle will calculate any prorated adjustment. Your saved work is not deleted.</span></div>' +
        '<div class="wd-billing-actions"><button class="wd-billing-keep" type="button">Keep Professional</button>' +
        '<button class="wd-billing-confirm" type="button">Downgrade to Agent now</button></div></section>';
      document.body.appendChild(wrap);
      var previous = document.activeElement;
      function done(value) {
        wrap.remove();
        if (previous && previous.focus) previous.focus();
        resolve(value);
      }
      wrap.querySelector('.wd-billing-keep').onclick = function () { done(false); };
      wrap.querySelector('.wd-billing-x').onclick = function () { done(false); };
      wrap.querySelector('.wd-billing-backdrop').onclick = function () { done(false); };
      wrap.querySelector('.wd-billing-confirm').onclick = function () { done(true); };
      wrap.addEventListener('keydown', function (event) { if (event.key === 'Escape') done(false); });
      wrap.querySelector('.wd-billing-keep').focus();
    });
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
              if (event && event.name === 'checkout.completed') {
                location.href = '/property/account.html?checkout=success';
              }
              if (event && event.name === 'checkout.closed') busy = false;
            }
          });
          resolve(window.Paddle);
        } catch (error) {
          paddleReady = null;
          reject(error);
        }
      }
      if (window.Paddle) { init(); return; }
      var script = document.createElement('script');
      script.src = 'https://cdn.paddle.com/paddle/v2/paddle.js';
      script.async = true;
      script.onload = init;
      script.onerror = function () {
        paddleReady = null;
        reject(new Error('Paddle Checkout could not load'));
      };
      document.head.appendChild(script);
    });
    return paddleReady;
  }

  function checkout(value, options) {
    var wanted = product(value);
    var wantedCadence = cadence(options && options.cadence);
    if (!wanted || busy) return Promise.resolve();
    if (wanted.gated) {
      billingError(Object.assign(new Error('Firm is gated'), { code: 'FIRM_GATED' }), 'checkout');
      return Promise.resolve();
    }
    busy = true;

    return session().then(function (activeSession) {
      if (!activeSession) {
        try {
          sessionStorage.setItem('watchdog:billing:pending', JSON.stringify({
            tier: wanted.tier,
            cadence: wantedCadence
          }));
        } catch (_pendingStorageError) {}
        location.href = '/property/dashboard.html?billing=signin';
        return null;
      }
      return entitlement().then(function (current) {
        var currentProduct = product(current && current.plan_tier);
        if (currentProduct && currentProduct.plan === 'pro_plus' && wanted.plan === 'pro' && !(options && options.confirmed)) {
          busy = false;
          return downgradeDialog().then(function (confirmed) {
            return confirmed ? checkout(wanted.tier, { confirmed: true, cadence: wantedCadence }) : null;
          });
        }
        return invoke('create-checkout-session', {
          plan: wanted.plan,
          tier: wanted.tier,
          cadence: wantedCadence
        }).then(function (payload) {
          if (payload.url) { location.href = payload.url; return null; }
          if (payload.plan_change_requested) {
            location.href = '/property/account.html?plan_change=pending&plan=' +
              encodeURIComponent(payload.requested_tier || wanted.tier) + '&cadence=' +
              encodeURIComponent(payload.requested_cadence || wantedCadence);
            return null;
          }
          if (!payload.transaction_id) throw new Error('Paddle transaction was not created');
          return loadPaddle(payload.client_token, payload.environment).then(function (paddle) {
            paddle.Checkout.open({ transactionId: payload.transaction_id });
          });
        });
      });
    }).catch(function (error) {
      busy = false;
      billingError(error, 'checkout');
    });
  }

  function portal() {
    if (busy) return Promise.resolve();
    busy = true;
    return invoke('create-portal-session').then(function (payload) {
      if (payload.url) location.href = payload.url;
    }).catch(function (error) {
      busy = false;
      billingError(error, 'portal');
    });
  }

  function resume() {
    var pending = null;
    try { pending = JSON.parse(sessionStorage.getItem('watchdog:billing:pending') || 'null'); } catch (_) {}
    if (!pending || !pending.tier) return;
    session().then(function (activeSession) {
      if (!activeSession) return;
      try { sessionStorage.removeItem('watchdog:billing:pending'); } catch (_) {}
      busy = false;
      checkout(pending.tier, { cadence: pending.cadence });
    });
  }

  function bind() {
    document.addEventListener('click', function (event) {
      var choice = event.target.closest('[data-billing-plan]');
      if (choice) {
        event.preventDefault();
        checkout(choice.dataset.billingPlan, { cadence: choice.dataset.billingCadence });
        return;
      }
      var manage = event.target.closest('[data-billing-portal]');
      if (manage) { event.preventDefault(); portal(); }
    });
  }

  window.WatchdogBilling = {
    checkout: checkout,
    portal: portal,
    resume: resume,
    client: sb,
    product: product
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind, { once: true });
  } else {
    bind();
  }
})();
