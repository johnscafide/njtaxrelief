/* Watchdog Dashboard final grid behavior: clean navigation, exact packing, reliable controls. */
(function () {
  'use strict';
  if (window.__WD_GRID_FINAL__) return;
  window.__WD_GRID_FINAL__ = true;

  var root = document.getElementById('wd4-root');
  if (!root || !window.supabase) return;

  var db = window.supabase.createClient(
    'https://uvkvaxljhhngydvlrzom.supabase.co',
    'sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa',
    { auth: { persistSession:true, autoRefreshToken:true, detectSessionInUrl:true, flowType:'pkce', storageKey:'sb-uvkvaxljhhngydvlrzom-auth-token' } }
  );

  var queued = false;
  var access = { ready:false, profile:{}, entitlement:null };

  function plan(v) {
    v = String(v || '').toLowerCase().replace(/\+/g, '_plus').replace(/[^a-z_]/g, '');
    if (v === 'free') v = 'standard';
    return ['standard','agent','pro','pro_plus','teams','developer'].indexOf(v) >= 0 ? v : 'standard';
  }
  function actualPlan() {
    if (plan(access.profile.account_role) === 'developer' || plan(access.entitlement && access.entitlement.account_role) === 'developer') return 'developer';
    return plan((access.entitlement && access.entitlement.plan_tier) || access.profile.plan_tier || access.profile.plan);
  }
  function can(required) {
    var rank = { standard:0, agent:1, pro:2, pro_plus:3, teams:4, developer:5 };
    return rank[actualPlan()] >= rank[plan(required)];
  }
  function isAgent() {
    if (actualPlan() === 'developer') return true;
    var roles = Array.isArray(access.profile.roles) ? access.profile.roles.map(String) : [];
    return roles.some(function (x) { return /agent|realtor|real_estate/i.test(x); }) ||
      /agent|realtor|real_estate/i.test(access.profile.role || '') || !!access.profile.pro_agent;
  }

  function loadAccess() {
    db.auth.getSession().then(function (res) {
      var session = res && res.data && res.data.session;
      if (!session || !session.user) { access.ready = true; queue(); return; }
      return Promise.allSettled([
        db.from('profiles').select('id,role,roles,pro_agent,plan,plan_tier,account_role').eq('id', session.user.id).maybeSingle(),
        db.rpc('get_my_entitlement')
      ]).then(function (parts) {
        access.profile = parts[0] && parts[0].status === 'fulfilled' && parts[0].value && parts[0].value.data ? parts[0].value.data : {};
        var ent = parts[1] && parts[1].status === 'fulfilled' && parts[1].value ? parts[1].value.data : null;
        access.entitlement = Array.isArray(ent) ? ent[0] : ent;
        access.ready = true;
        queue();
      });
    }).catch(function () { access.ready = true; queue(); });
  }

  function navItem(href, icon, label, active) {
    return '<a' + (active ? ' class="active"' : '') + ' href="' + href + '"><i class="fas ' + icon + '"></i>' + label + '</a>';
  }
  function patchNavigation() {
    var nav = document.querySelector('.wd4-nav-links');
    if (!nav) return;
    var items = [
      navItem('/property/dashboard','fa-table-columns','Dashboard',true),
      navItem('/property/home','fa-house','Property Home'),
      navItem('/property/town-compare','fa-code-compare','Town Compare'),
      navItem('/property/robust/','fa-gauge-high','ROBUST Framework'),
      navItem('/property/pulse','fa-wave-square','Change Intelligence')
    ];
    if (access.ready && isAgent()) items.push(navItem('/property/agent-desk','fa-bullseye','Agent Control'));
    if (access.ready && can('pro_plus')) items.push(navItem('/property/scan','fa-magnifying-glass-chart','Appeal Scanner'));
    if (access.ready && can('agent')) items.push(navItem('/property/data-workbench','fa-table-list','Data Workbench'));
    if (access.ready && can('pro_plus')) items.push(navItem('/property/data-center','fa-database','Data Center'));
    items.push(navItem('/property/pro','fa-briefcase','Professional Hub'));
    items.push(navItem('/property/account','fa-user-gear','Account'));
    var html = items.join('');
    if (nav.dataset.wdFinalMenu !== html) {
      nav.dataset.wdFinalMenu = html;
      nav.innerHTML = html;
    }
  }

  function nearestAllowed(x) {
    var allowed = [4,6,8,12,24], best = allowed[0], d = Math.abs(x - best);
    allowed.forEach(function (v) { var nd = Math.abs(x - v); if (nd < d) { best = v; d = nd; } });
    return best;
  }
  function normalizeGrid() {
    if (window.innerWidth <= 1400) return;
    var grid = document.getElementById('wd4-grid');
    if (!grid) return;
    grid.querySelectorAll(':scope > [data-card-id]').forEach(function (card) {
      var id = card.getAttribute('data-card-id');
      if (id === 'summary-gap') return;
      var raw = parseInt(getComputedStyle(card).getPropertyValue('--wd5-x'), 10);
      if (!Number.isFinite(raw)) return;
      var snapped = nearestAllowed(raw);
      if (snapped !== raw) card.style.setProperty('--wd5-x', String(snapped));
    });
  }

  function protectCardControls() {
    if (document.body.classList.contains('wd4-layout-mode')) return;
    document.querySelectorAll('#wd4-grid > [data-card-id]').forEach(function (card) {
      card.setAttribute('draggable', 'false');
    });
  }

  function polish() {
    patchNavigation();
    normalizeGrid();
    protectCardControls();
  }
  function queue() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () { queued = false; polish(); });
  }

  /* The dashboard now intentionally has no nested wheel-scrolling areas.
     Let the page scroll naturally instead of trapping the wheel inside a card. */
  document.addEventListener('wheel', function (ev) {
    var zone = ev.target && ev.target.closest && ev.target.closest('.wd5-properties-wrap,.wd4-activity-list,.wd4-municipality,.wd5-county-list');
    if (!zone) return;
    zone.scrollTop = 0;
    ev.stopPropagation();
  }, { capture:true, passive:true });

  /* Interactive card controls always win over drag behavior. */
  document.addEventListener('pointerdown', function (ev) {
    if (document.body.classList.contains('wd4-layout-mode')) return;
    var control = ev.target && ev.target.closest && ev.target.closest('#wd4-grid a,#wd4-grid button,#wd4-grid select,#wd4-grid input');
    if (!control) return;
    var card = control.closest('[data-card-id]');
    if (card) card.setAttribute('draggable','false');
  }, true);

  document.addEventListener('pointerup', function () { setTimeout(function () { normalizeGrid(); protectCardControls(); }, 0); }, true);
  document.addEventListener('click', function (ev) {
    if (ev.target && ev.target.closest && ev.target.closest('[data-action="layout"]')) {
      setTimeout(function () { normalizeGrid(); protectCardControls(); }, 20);
    }
  });

  new MutationObserver(queue).observe(root, { childList:true, subtree:true });
  window.addEventListener('resize', queue);
  loadAccess();
  queue();
})();
export {};
