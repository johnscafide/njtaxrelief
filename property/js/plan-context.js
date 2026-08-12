(function () {
  'use strict';

  var order = { standard: 0, agent: 1, pro: 2, pro_plus: 3, teams: 4, developer: 5 };
  var state = { user: null, profile: null, actual: 'standard', effective: 'standard', developer: false };

  function normalized(value) {
    value = String(value || '').toLowerCase().replace(/\+/g, '_plus').replace(/[^a-z_]/g, '');
    return order[value] == null ? 'standard' : value;
  }
  function devFor(_user, profile) { return normalized(profile && profile.account_role) === 'developer'; }
  function actualFor(user, profile) {
    if (devFor(user, profile)) return 'developer';
    return normalized((profile && (profile.plan_tier || profile.plan)) || 'standard');
  }
  function apply() {
    document.documentElement.dataset.accountPlan = state.actual;
    document.documentElement.dataset.viewPlan = state.effective;
    if (document.body) document.body.dataset.viewPlan = state.effective;
    var legacyBar = document.getElementById('dev-view-bar');
    if (legacyBar) legacyBar.remove();
    try { localStorage.removeItem('watchdog:developer:view-as'); } catch (_error) {}
    document.querySelectorAll('[data-min-plan]').forEach(function (node) {
      var required = normalized(node.dataset.minPlan);
      var allowed = can(required);
      node.classList.toggle('plan-locked', !allowed);
      node.setAttribute('aria-disabled', allowed ? 'false' : 'true');
    });
    var preview = document.getElementById('dc-tier');
    if (preview) {
      var previewPlan = state.effective === 'developer' ? 'pro_plus' : state.effective;
      if (preview.value !== previewPlan && Array.from(preview.options || []).some(function(o){return o.value===previewPlan;})) {
        preview.value = previewPlan;
        preview.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
    document.dispatchEvent(new CustomEvent('njptr:plan-change', { detail: Object.assign({}, state) }));
  }
  function setView() {
    /* Developer plan simulation was retired in NJW-99. Keep the API as a no-op for older callers. */
    state.effective = state.actual;
    apply();
  }
  function init(user, profile) {
    state.user = user || null;
    state.profile = profile || {};
    state.developer = devFor(state.user, state.profile);
    state.actual = actualFor(state.user, state.profile);
    state.effective = state.actual;
    apply();
    return Object.assign({}, state);
  }
  function can(required) {
    var need = normalized(required);
    return state.effective === 'developer' || order[state.effective] >= order[need];
  }

  function autoInit() {
    if (!document.body || document.body.getAttribute('data-plan-auto') !== 'true' || !window.supabase || state.user) return;
    var client = window.supabase.createClient('https://uvkvaxljhhngydvlrzom.supabase.co', 'sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa',
      { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce', storageKey: 'sb-uvkvaxljhhngydvlrzom-auth-token' } });
    client.auth.getUser().then(function (result) {
      var user = result && result.data && result.data.user;
      if (!user) return;
      client.rpc('get_my_entitlement').then(function (entitlementResult) {
        var rows = entitlementResult && entitlementResult.data || [], ent = Array.isArray(rows) ? rows[0] : rows;
        if (ent) { init(user, { account_role: ent.account_role, plan_tier: ent.plan_tier, subscription_status: ent.subscription_status, current_period_end: ent.current_period_end }); return; }
        init(user, {});
      });
    }).catch(function () {});
  }

  window.NJPTRPlan = { init: init, setView: setView, can: can, state: function () { return Object.assign({}, state); } };
  if (document.readyState !== 'loading') { apply(); autoInit(); }
  else document.addEventListener('DOMContentLoaded', function () { apply(); autoInit(); }, { once: true });
})();
