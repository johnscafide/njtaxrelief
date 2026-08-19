(function () {
  'use strict';

  var FALLBACK_URL = 'https://uvkvaxljhhngydvlrzom.supabase.co';
  var runtime = window.NJPTRSupabaseRuntime || {};
  var baseUrl = String(runtime.url || FALLBACK_URL).replace(/\/$/, '');
  var catalog = null;
  var loading = false;

  function money(value, decimals) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: decimals ? 2 : 0,
      maximumFractionDigits: decimals ? 2 : 0
    }).format(Number(value || 0));
  }

  function planForCard(card) {
    var heading = card && card.querySelector('.ac-price-head h3');
    var label = String(heading && heading.textContent || '').trim().toLowerCase();
    if (label === 'agent') return 'agent';
    if (label === 'pro') return 'pro';
    if (label === 'pro+') return 'pro_plus';
    return null;
  }

  function isYearly() {
    var yearly = document.querySelector('[data-cadence="yearly"]');
    return !yearly || yearly.getAttribute('aria-pressed') === 'true';
  }

  function applyCatalog() {
    if (!catalog || !catalog.plans) return;
    var annual = isYearly();
    var cadence = annual ? 'yearly' : 'monthly';

    document.querySelectorAll('#membership-options .ac-price-card').forEach(function (card) {
      var key = planForCard(card);
      if (!key || !catalog.plans[key] || !catalog.plans[key][cadence]) return;

      var amount = Number(catalog.plans[key][cadence].amount);
      if (!Number.isFinite(amount)) return;

      var price = card.querySelector('.ac-price b');
      var unit = card.querySelector('.ac-price span');
      var note = card.querySelector(':scope > small');
      if (price) price.textContent = money(amount, false);
      if (unit) unit.textContent = annual ? '/year' : '/month';

      if (note) {
        if (annual) {
          var monthly = Number(catalog.plans[key].monthly && catalog.plans[key].monthly.amount);
          var effective = amount / 12;
          var savings = Number.isFinite(monthly) ? (monthly * 12) - amount : 0;
          note.textContent = money(effective, true) + '/mo effective' + (savings > 0 ? ' · save ' + money(savings, false) + '/yr' : '');
        } else {
          note.textContent = 'Billed monthly';
        }
      }
    });
  }

  function loadCatalog() {
    if (loading || catalog) return;
    loading = true;
    fetch(baseUrl + '/functions/v1/billing-price-catalog', {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store'
    }).then(function (response) {
      if (!response.ok) throw new Error('Billing catalog unavailable');
      return response.json();
    }).then(function (payload) {
      if (!payload || payload.provider !== 'stripe' || !payload.plans) throw new Error('Invalid billing catalog');
      catalog = payload;
      applyCatalog();
    }).catch(function () {
      // account.js carries the last verified Live catalog as a fail-safe display fallback.
    }).finally(function () {
      loading = false;
    });
  }

  document.addEventListener('click', function (event) {
    if (event.target.closest('[data-cadence]')) setTimeout(applyCatalog, 0);
  });

  var observer = new MutationObserver(function () {
    if (document.getElementById('membership-options')) {
      loadCatalog();
      applyCatalog();
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadCatalog, { once: true });
  } else {
    loadCatalog();
  }
})();