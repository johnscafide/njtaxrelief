(function () {
  'use strict';

  var URL = 'https://uvkvaxljhhngydvlrzom.supabase.co';
  var KEY = 'sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa';
  var loaded = false;

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
    });
  }

  function label(value) {
    return String(value || 'unknown').replace(/_/g, ' ').replace(/\b\w/g, function (character) {
      return character.toUpperCase();
    });
  }

  function paint(payload) {
    var host = document.getElementById('do-billing-release');
    if (!host) return;
    var billing = payload && payload.billing;
    if (!billing) {
      host.innerHTML = '<div class="do-billing-head"><div><span>STRIPE LIVE RELEASE</span><h2>Billing health unavailable</h2><p>The Developer health endpoint did not return a billing payload.</p></div></div>';
      return;
    }

    var secrets = billing.secrets || {};
    var catalog = billing.catalog || {};
    var checks = billing.checks || [];
    var passed = checks.filter(function (check) { return check.passed; }).length;
    var gateStatus = billing.gate && billing.gate.status || 'missing';
    var ready = gateStatus === 'passed';
    var mode = billing.checkout_mode || 'closed';
    var catalogResolved = catalog.resolved == null ? secrets.catalog_lookup_resolved || 0 : catalog.resolved;
    var catalogRequired = catalog.required == null ? secrets.catalog_lookup_required || 6 : catalog.required;

    host.innerHTML =
      '<div class="do-billing-head"><div><span>STRIPE LIVE RELEASE</span><h2>' + (ready ? 'Live billing accepted' : 'Controlled billing gate') + '</h2>' +
      '<p>Server-owned launch evidence only. No Stripe secret value is returned to this page.</p></div>' +
      '<div class="do-billing-gate ' + esc(ready ? 'passed' : gateStatus) + '"><i class="fas ' + (ready ? 'fa-circle-check' : 'fa-shield-halved') + '"></i>' + esc(label(gateStatus)) + '</div></div>' +
      '<div class="do-billing-metrics">' +
      '<article><b>' + esc(label(mode)) + '</b><span>Checkout mode</span></article>' +
      '<article><b>' + (secrets.stripe_secret_configured ? 'Ready' : 'Missing') + '</b><span>Stripe Live key</span></article>' +
      '<article><b>' + (secrets.webhook_secret_configured ? 'Ready' : 'Missing') + '</b><span>Webhook secret</span></article>' +
      '<article><b>' + esc(catalogResolved + '/' + catalogRequired) + '</b><span>Live prices resolved</span></article>' +
      '<article><b>' + esc(billing.webhook_event_count || 0) + '</b><span>Processed Stripe events</span></article>' +
      '<article><b>' + passed + '/' + checks.length + '</b><span>Acceptance checks</span></article>' +
      '</div>' +
      '<div class="do-billing-checks">' + checks.map(function (check) {
        return '<article class="' + (check.passed ? 'passed' : 'pending') + '"><i class="fas ' + (check.passed ? 'fa-circle-check' : 'fa-circle') + '"></i><span>' + esc(check.label) + '</span></article>';
      }).join('') + '</div>' +
      '<div class="do-billing-actions"><a href="/property/account/">Open Account &amp; Billing <i class="fas fa-arrow-right"></i></a>' +
      '<span>Public paid enrollment must remain closed until the Live lifecycle gate is passed.</span></div>';
  }

  function load() {
    if (loaded || !window.supabase) return;
    loaded = true;
    var client = window.supabase.createClient(URL, KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
        storageKey: 'sb-uvkvaxljhhngydvlrzom-auth-token'
      }
    });
    client.functions.invoke('get-platform-health', { body: {} }).then(function (result) {
      if (result.error) throw result.error;
      paint(result.data || {});
    }).catch(function () {
      var host = document.getElementById('do-billing-release');
      if (host) host.innerHTML = '<div class="do-billing-head"><div><span>STRIPE LIVE RELEASE</span><h2>Billing health unavailable</h2><p>Sign in with Developer access and reload this control center.</p></div></div>';
    });
  }

  document.addEventListener('watchdog:developer-confirmed', load);
  if (document.body && !document.getElementById('do-denied')?.hidden) return;
  load();
})();