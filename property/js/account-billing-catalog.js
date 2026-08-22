(function () {
  'use strict';

  var FALLBACK_URL = 'https://uvkvaxljhhngydvlrzom.supabase.co';
  var runtime = window.NJPTRSupabaseRuntime || {};
  var baseUrl = String(runtime.url || FALLBACK_URL).replace(/\/$/, '');
  var catalog = null;
  var loading = false;
  var observer = null;

  function money(value, decimals) {
    return new Intl.NumberFormat('en-US', { style:'currency', currency:'USD', minimumFractionDigits:decimals ? 2 : 0, maximumFractionDigits:decimals ? 2 : 0 }).format(Number(value || 0));
  }
  function setText(node, value) {
    if (!node) return;
    var next = String(value == null ? '' : value);
    if (node.textContent !== next) node.textContent = next;
  }
  function planForCard(card) {
    var key = String(card && card.dataset && card.dataset.plan || '').trim().toLowerCase().replace(/\+/g,'_plus');
    return ['agent','pro','pro_plus'].indexOf(key) >= 0 ? key : null;
  }
  function isYearly() {
    var yearly = document.querySelector('[data-cadence="yearly"]');
    return !yearly || yearly.getAttribute('aria-pressed') === 'true';
  }
  function applyCatalog() {
    if (!catalog || !catalog.plans) return;
    var annual = isYearly();
    var cadence = annual ? 'yearly' : 'monthly';
    document.querySelectorAll('#membership-options .ac-price-card[data-plan]').forEach(function (card) {
      var key = planForCard(card);
      if (!key || !catalog.plans[key] || !catalog.plans[key][cadence]) return;
      var amount = Number(catalog.plans[key][cadence].amount);
      if (!Number.isFinite(amount)) return;
      var price = card.querySelector('.ac-price b');
      var unit = card.querySelector('.ac-price span');
      var note = card.querySelector(':scope > small');
      setText(price, money(amount, false));
      setText(unit, annual ? '/year' : '/month');
      if (note) {
        if (annual) {
          var monthly = Number(catalog.plans[key].monthly && catalog.plans[key].monthly.amount);
          var effective = amount / 12;
          var savings = Number.isFinite(monthly) ? (monthly * 12) - amount : 0;
          setText(note, money(effective, true) + '/mo effective' + (savings > 0 ? ' · save ' + money(savings, false) + '/yr' : ''));
        } else setText(note, 'Billed monthly');
      }
    });
  }
  function loadCatalog() {
    if (loading || catalog) return;
    loading = true;
    fetch(baseUrl + '/functions/v1/billing-price-catalog', { method:'GET', headers:{Accept:'application/json'}, cache:'no-store' })
      .then(function (response) { if (!response.ok) throw new Error('Billing catalog unavailable'); return response.json(); })
      .then(function (payload) { if (!payload || payload.provider !== 'stripe' || !payload.plans) throw new Error('Invalid billing catalog'); catalog = payload; applyCatalog(); })
      .catch(function () { /* account.js carries the last verified display fallback. */ })
      .finally(function () { loading = false; });
  }
  function refreshCatalogDisplay() {
    if (!document.getElementById('membership-options')) return;
    loadCatalog();
    applyCatalog();
  }
  function observeAccountRenders() {
    var app = document.getElementById('ac-app');
    if (!app || observer) return;
    observer = new MutationObserver(refreshCatalogDisplay);
    observer.observe(app, { childList:true, subtree:false });
  }
  document.addEventListener('click', function (event) { if (event.target.closest('[data-cadence]')) setTimeout(refreshCatalogDisplay, 0); });
  document.addEventListener('watchdog:account-rendered', refreshCatalogDisplay);
  function start() { observeAccountRenders(); loadCatalog(); refreshCatalogDisplay(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true }); else start();
})();
