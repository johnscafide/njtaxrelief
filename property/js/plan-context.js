(function () {
  'use strict';

  var DEV_EMAILS = ['john.v.scafide@gmail.com'];
  var order = { standard: 0, pro: 1, pro_plus: 2, developer: 3 };
  var state = { user: null, profile: null, actual: 'standard', effective: 'standard', developer: false };

  function normalized(value) {
    value = String(value || '').toLowerCase().replace(/\+/g, '_plus').replace(/[^a-z_]/g, '');
    return order[value] == null ? 'standard' : value;
  }
  function devFor(user, profile) {
    var email = String(user && user.email || '').toLowerCase();
    return DEV_EMAILS.indexOf(email) >= 0 || normalized(profile && profile.account_role) === 'developer' ||
      normalized(user && user.user_metadata && user.user_metadata.account_role) === 'developer';
  }
  function actualFor(user, profile) {
    if (devFor(user, profile)) return 'developer';
    return normalized((profile && (profile.plan_tier || profile.plan)) ||
      (user && user.user_metadata && (user.user_metadata.plan_tier || user.user_metadata.plan)) || 'standard');
  }
  function savedView() {
    try { return normalized(localStorage.getItem('watchdog:developer:view-as')); } catch (_error) { return 'developer'; }
  }
  function label(plan) { return plan === 'pro_plus' ? 'Pro+' : plan.charAt(0).toUpperCase() + plan.slice(1); }
  function apply() {
    document.documentElement.dataset.accountPlan = state.actual;
    document.documentElement.dataset.viewPlan = state.effective;
    document.body && (document.body.dataset.viewPlan = state.effective);
    document.querySelectorAll('[data-min-plan]').forEach(function (node) {
      var required = normalized(node.dataset.minPlan);
      var allowed = order[state.effective] >= order[required] || state.effective === 'developer';
      node.classList.toggle('plan-locked', !allowed);
      node.setAttribute('aria-disabled', allowed ? 'false' : 'true');
    });
    var preview = document.getElementById('dc-tier');
    if (preview) {
      var previewPlan = state.effective === 'developer' ? 'pro_plus' : state.effective;
      if (preview.value !== previewPlan) {
        preview.value = previewPlan;
        preview.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
    paintBar();
    document.dispatchEvent(new CustomEvent('njptr:plan-change', { detail: Object.assign({}, state) }));
  }
  function paintBar() {
    var old = document.getElementById('dev-view-bar');
    if (!state.developer) { if (old) old.remove(); return; }
    var bar = old || document.createElement('aside');
    bar.id = 'dev-view-bar';
    bar.className = 'dev-view-bar';
    bar.innerHTML = '<div><i class="fas fa-code"></i><span><b>Developer access</b><small>Viewing the product as</small></span></div>' +
      '<label><span class="sr-only">View as plan</span><select id="dev-view-select">' +
      ['standard', 'pro', 'pro_plus', 'developer'].map(function (p) { return '<option value="' + p + '"' + (p === state.effective ? ' selected' : '') + '>' + label(p) + '</option>'; }).join('') +
      '</select></label><button id="dev-view-reset" type="button" title="Return to developer view"><i class="fas fa-rotate-left"></i></button>';
    if (!old) document.body.appendChild(bar);
    bar.querySelector('#dev-view-select').addEventListener('change', function (event) { setView(event.target.value); });
    bar.querySelector('#dev-view-reset').addEventListener('click', function () { setView('developer'); });
  }
  function setView(plan) {
    if (!state.developer) return;
    state.effective = normalized(plan);
    try { localStorage.setItem('watchdog:developer:view-as', state.effective); } catch (_error) {}
    apply();
  }
  function init(user, profile) {
    state.user = user || null;
    state.profile = profile || {};
    state.developer = devFor(state.user, state.profile);
    state.actual = actualFor(state.user, state.profile);
    state.effective = state.developer ? savedView() : state.actual;
    apply();
    return Object.assign({}, state);
  }
  function can(required) { return state.effective === 'developer' || order[state.effective] >= order[normalized(required)]; }

  function autoInit() {
    // Dashboard and Home already own their Supabase auth lifecycle and call
    // NJPTRPlan.init() with the settled session/profile. Only standalone pages
    // that explicitly opt in should create a lightweight client here.
    if (!document.body || document.body.getAttribute('data-plan-auto') !== 'true' || !window.supabase || state.user) return;
    var client = window.supabase.createClient('https://uvkvaxljhhngydvlrzom.supabase.co', 'sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa',
      { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce', storageKey: 'sb-uvkvaxljhhngydvlrzom-auth-token' } });
    client.auth.getSession().then(function (result) {
      var user = result && result.data && result.data.session && result.data.session.user;
      if (!user) return;
      client.from('profiles').select('account_role,plan_tier').eq('id', user.id).maybeSingle().then(function (profileResult) {
        init(user, profileResult && profileResult.data || {});
      });
    }).catch(function () {});
  }

  window.NJPTRPlan = { init: init, setView: setView, can: can, state: function () { return Object.assign({}, state); } };
  if (document.readyState !== 'loading') { apply(); autoInit(); }
  else document.addEventListener('DOMContentLoaded', function () { apply(); autoInit(); }, { once: true });
})();
