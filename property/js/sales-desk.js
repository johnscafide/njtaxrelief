/* Watchdog Sales Desk (/sales-desk).
   Consultant: her code, share links, attributed accounts, commission ledger,
   her own prospects. Owner (developer or admin): the same desk for any
   consultant, plus provisioning, offline attribution, payout marking, and
   ending a consultant. All reads go through get_sales_desk; all owner writes
   go through owner-checked RPCs. */
(function () {
  'use strict';
  var path = String(location.pathname || '').replace(/\/+$/, '').replace(/\/index\.html$/i, '');
  if (path !== '/sales-desk' && path !== '/property/sales-desk') return;

  var runtime = window.NJPTRSupabaseRuntime || null;
  var db = null;
  try { db = runtime && typeof runtime.createClient === 'function' ? runtime.createClient() : null; } catch (_) { db = null; }
  if (!db) {
    /* The sign-in library did not load (offline, blocked CDN). Show the
       signed-out state with a plain message instead of a blank page. */
    document.addEventListener('DOMContentLoaded', function () {
      var n = document.querySelector('[data-notice]');
      // content-architecture: dynamic, shown only when the auth library failed to load at runtime; a recovery message for a failure state, not page copy.
      if (n) { n.textContent = 'The sign-in library did not load. Refresh the page or check your connection.'; n.hidden = false; n.classList.add('is-error'); }
      Array.prototype.forEach.call(document.querySelectorAll('[data-state]'), function (x) { x.hidden = x.getAttribute('data-state') !== 'signin'; });
    }, { once: true });
    return;
  }
  var prefix = runtime.routePrefix || '';
  var SITE = 'https://www.watchdogindex.com';
  var state = { user: null, role: 'user', isOwner: false, consultant: null, desk: null, viewing: null };

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function money(cents) { var n = Number(cents || 0) / 100; return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function day(v) { if (!v) return ''; var d = new Date(v); return isNaN(d) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  function plan(v) { return { agent: 'Agent', pro: 'Pro', pro_plus: 'Pro+', teams: 'Teams', standard: 'Free' }[v] || (v || ''); }
  function kind(v) { return { lifetime: 'Lifetime', yearly_first: 'Annual, first year', monthly: 'Monthly', renewal: 'Renewal', adjustment: 'Adjustment' }[v] || v; }
  function show(name) { $$('[data-state]').forEach(function (n) { n.hidden = n.getAttribute('data-state') !== name; }); }
  function notice(text, isError) { var n = $('[data-notice]'); if (!n) return; n.textContent = text || ''; n.hidden = !text; n.classList.toggle('is-error', Boolean(isError)); }
  function err(e) { return (e && (e.message || e.error_description)) || 'Something went wrong.'; }

  function signInReturn() {
    var next = location.pathname + location.search;
    if (window.WatchdogAuth && typeof window.WatchdogAuth.openSignIn === 'function') { window.WatchdogAuth.openSignIn(next); return; }
    location.assign(prefix + '/onboarding/?next=' + encodeURIComponent(next));
  }

  /* ---- Loading ---- */
  function loadRole() {
    return db.rpc('get_my_entitlement').then(function (r) {
      var row = Array.isArray(r.data) ? r.data[0] : r.data;
      state.role = (row && row.account_role) || 'user';
      state.isOwner = state.role === 'developer' || state.role === 'admin';
    });
  }

  function loadDesk(consultantId) {
    return db.rpc('get_sales_desk', { p_consultant: consultantId || null }).then(function (r) {
      if (r.error) throw r.error;
      state.desk = r.data || {};
      state.consultant = state.desk.consultant || null;
      state.viewing = consultantId || (state.consultant && state.consultant.consultant_user_id) || null;
      return state.desk;
    });
  }

  function loadConsultants() {
    return db.rpc('list_sales_consultants').then(function (r) {
      if (r.error) throw r.error;
      return Array.isArray(r.data) ? r.data : [];
    });
  }

  /* ---- Rendering ---- */
  function renderConsultants(list) {
    var body = $('[data-consultants-table] tbody');
    var empty = $('[data-consultants-empty]');
    body.innerHTML = list.map(function (c) {
      return '<tr><td><b>' + esc(c.display_name) + '</b></td><td>' + esc(c.consultant_code) + '</td><td><span class="sd-pill">' + esc(c.status) + '</span></td><td>' + esc(c.attributed) + '</td><td>' + money(c.owed_cents) + '</td><td>' + money(c.paid_cents) + '</td><td><button type="button" class="sd-btn sd-btn-secondary" data-open-consultant="' + esc(c.consultant_user_id) + '">Open desk</button></td></tr>';
    }).join('');
    empty.hidden = list.length > 0;
    $$('[data-open-consultant]').forEach(function (b) { b.addEventListener('click', function () { openDesk(b.getAttribute('data-open-consultant')); }); });
  }

  function shareLinks(code) {
    var utm = '&utm_source=consultant&utm_medium=referral&utm_campaign=' + encodeURIComponent(code.toLowerCase());
    return [
      { label: 'Agent trial page', url: SITE + '/agents/trial?sc=' + code + utm },
      { label: 'For real estate agents', url: SITE + '/for/real-estate-agents?sc=' + code + utm },
      { label: 'Plans and pricing', url: SITE + '/pro?sc=' + code + utm },
      { label: 'Free account', url: SITE + '/free?sc=' + code + utm },
      { label: 'Home page', url: SITE + '/?sc=' + code + utm }
    ];
  }

  function renderDesk() {
    var d = state.desk || {};
    var c = state.consultant || {};
    var t = d.totals || {};
    var owner = Boolean(d.is_owner);
    $$('[data-owner-only]').forEach(function (n) { n.hidden = !owner; });
    $$('[data-consultant-only]').forEach(function (n) { n.hidden = owner && state.viewing !== (state.user && state.user.id); });
    $('[data-desk-kicker]').textContent = owner ? 'Owner view' : 'Sales Desk';
    $('[data-desk-title]').textContent = c.display_name ? c.display_name + (owner ? "'s desk" : ', your desk') : 'Sales desk';
    $('[data-desk-sub]').textContent = (c.status === 'active' ? 'Active since ' + day(c.started_at) : 'Status: ' + (c.status || 'unknown')) + '. Commission plan: ' + planSummary(c.commission_plan) + '.';
    $('[data-total="attributed"]').textContent = String(t.attributed || 0);
    $('[data-total="active_plans"]').textContent = String(t.active_plans || 0);
    $('[data-total="eligible_cents"]').textContent = money(t.eligible_cents);
    $('[data-total="paid_cents"]').textContent = money(t.paid_cents);
    $('[data-code]').textContent = c.consultant_code || '';
    var links = $('[data-links]');
    links.innerHTML = shareLinks(c.consultant_code || 'SC').map(function (l, i) {
      return '<div class="sd-link"><input type="text" readonly aria-label="' + esc(l.label) + '" value="' + esc(l.url) + '" id="sd-link-' + i + '"><button type="button" class="sd-btn sd-btn-secondary" data-copy="sd-link-' + i + '">Copy</button></div>';
    }).join('');
    $$('[data-copy]').forEach(function (b) {
      b.addEventListener('click', function () {
        var input = document.getElementById(b.getAttribute('data-copy'));
        if (!input) return;
        input.select();
        // content-architecture: dynamic, button label flips with the clipboard result and reverts after a moment; interaction state, not static copy.
        try { navigator.clipboard.writeText(input.value); b.textContent = 'Copied'; setTimeout(function () { b.textContent = 'Copy'; }, 1500); } catch (_) { document.execCommand('copy'); }
      });
    });
    renderAccounts(d.accounts || []);
    renderCommissions(d.commissions || [], owner);
    renderProspects(d.prospects || []);
  }

  function planSummary(p) {
    p = p || {};
    var pct = function (k, dflt) { return ((Number(p[k] != null ? p[k] : dflt)) / 100).toFixed(0) + '%'; };
    return 'lifetime ' + pct('lifetime_bps', 2000) + ', annual first year ' + pct('yearly_first_bps', 2000) + ', monthly ' + pct('monthly_bps', 2000) + ' for ' + (p.monthly_months || 12) + ' months, renewals ' + pct('renewal_bps', 1000);
  }

  function renderAccounts(rows) {
    var body = $('[data-accounts-table] tbody');
    body.innerHTML = rows.map(function (a) {
      var status = a.billing_interval === 'lifetime' ? 'lifetime' : (a.subscription_status || 'none');
      return '<tr><td><b>' + esc(a.name || '') + '</b><br><span class="sd-muted">' + esc(a.email || '') + '</span></td><td>' + esc(day(a.attributed_at)) + '</td><td>' + esc(a.source) + '</td><td>' + esc(plan(a.plan_tier)) + '</td><td><span class="sd-pill">' + esc(status) + '</span></td><td>' + money(a.commission_cents) + '</td></tr>';
    }).join('');
    $('[data-accounts-empty]').hidden = rows.length > 0;
  }

  function renderCommissions(rows, owner) {
    var body = $('[data-commissions-table] tbody');
    body.innerHTML = rows.map(function (m) {
      var action = '';
      if (owner) {
        if (m.status === 'eligible' || m.status === 'pending') action = '<div class="sd-inline"><input type="text" placeholder="Payout ref" aria-label="Payout reference" data-ref-for="' + m.id + '"><button type="button" class="sd-btn sd-btn-secondary" data-mark="paid" data-id="' + m.id + '">Mark paid</button><button type="button" class="sd-btn sd-btn-danger" data-mark="void" data-id="' + m.id + '">Void</button></div>';
        else if (m.status === 'paid') action = '<span class="sd-muted">' + esc(m.payout_ref || '') + '</span>';
        else action = '<span class="sd-muted">' + esc(m.void_reason || '') + '</span>';
      }
      return '<tr><td>' + esc(day(m.created_at)) + '</td><td>' + esc(m.email || '') + '</td><td>' + esc(kind(m.kind)) + '</td><td>' + esc(plan(m.tier)) + '</td><td>' + money(m.gross_cents) + '</td><td>' + (Number(m.rate_bps || 0) / 100).toFixed(0) + '%</td><td><b>' + money(m.commission_cents) + '</b></td><td><span class="sd-pill is-' + esc(m.status) + '">' + esc(m.status) + '</span></td><td>' + esc(day(m.hold_until)) + '</td>' + (owner ? '<td>' + action + '</td>' : '') + '</tr>';
    }).join('');
    $('[data-commissions-empty]').hidden = rows.length > 0;
    $$('[data-mark]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = Number(b.getAttribute('data-id'));
        var status = b.getAttribute('data-mark');
        var refInput = $('[data-ref-for="' + id + '"]');
        var ref = refInput ? refInput.value.trim() : '';
        var note = status === 'void' ? (window.prompt('Reason for voiding this commission:') || '') : '';
        if (status === 'void' && !note) return;
        if (status === 'paid' && !window.confirm('Mark this commission as paid' + (ref ? ' (ref ' + ref + ')' : '') + '?')) return;
        b.disabled = true;
        db.rpc('mark_sales_commission', { p_id: id, p_status: status, p_ref: ref || null, p_note: note || null }).then(function (r) {
          if (r.error) throw r.error;
          return refresh();
        }).catch(function (e) { b.disabled = false; notice(err(e), true); });
      });
    });
  }

  function renderProspects(rows) {
    var body = $('[data-prospects-table] tbody');
    var canEdit = !state.desk.is_owner || state.viewing === (state.user && state.user.id);
    body.innerHTML = rows.map(function (p) {
      return '<tr><td><b>' + esc(p.full_name) + '</b><br><span class="sd-muted">' + esc(p.email || '') + (p.phone ? ' ' + esc(p.phone) : '') + '</span></td><td>' + esc(p.brokerage || '') + '</td><td><span class="sd-pill">' + esc(p.stage) + '</span></td><td>' + esc(plan(p.plan_interest) || '') + '</td><td>' + esc(p.next_action || '') + (p.next_action_at ? '<br><span class="sd-muted">' + esc(day(p.next_action_at)) + '</span>' : '') + '</td><td>' + esc(day(p.updated_at)) + '</td><td>' + (canEdit ? '<div class="sd-inline"><button type="button" class="sd-btn sd-btn-secondary" data-edit-prospect="' + p.id + '">Edit</button><button type="button" class="sd-btn sd-btn-danger" data-delete-prospect="' + p.id + '">Delete</button></div>' : '') + '</td></tr>';
    }).join('');
    $('[data-prospects-empty]').hidden = rows.length > 0;
    var form = $('[data-prospect-form]');
    form.hidden = !canEdit;
    $$('[data-edit-prospect]').forEach(function (b) {
      b.addEventListener('click', function () {
        var p = rows.filter(function (x) { return String(x.id) === b.getAttribute('data-edit-prospect'); })[0];
        if (!p) return;
        ['id', 'full_name', 'brokerage', 'email', 'phone', 'role', 'stage', 'plan_interest', 'next_action', 'notes'].forEach(function (k) { var f = form.elements[k]; if (f) f.value = p[k] == null ? '' : p[k]; });
        form.elements.next_action_at.value = p.next_action_at ? String(p.next_action_at).slice(0, 10) : '';
        form.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
    $$('[data-delete-prospect]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (!window.confirm('Delete this prospect?')) return;
        db.from('watchdog_sales_prospects').delete().eq('id', Number(b.getAttribute('data-delete-prospect'))).then(function (r) { if (r.error) throw r.error; return refresh(); }).catch(function (e) { notice(err(e), true); });
      });
    });
  }

  /* ---- Actions ---- */
  function bindTabs() {
    $$('[data-tab]').forEach(function (t) {
      t.addEventListener('click', function () {
        $$('[data-tab]').forEach(function (x) { x.setAttribute('aria-selected', x === t ? 'true' : 'false'); });
        $$('[data-panel]').forEach(function (p) { p.hidden = p.getAttribute('data-panel') !== t.getAttribute('data-tab'); });
      });
    });
  }

  function bindProspectForm() {
    var form = $('[data-prospect-form]');
    var status = $('[data-prospect-status]');
    function reset() { form.reset(); form.elements.id.value = ''; status.textContent = ''; }
    $('[data-prospect-reset]').addEventListener('click', reset);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!form.reportValidity()) return;
      var f = form.elements;
      var row = {
        consultant_user_id: state.user.id,
        full_name: f.full_name.value.trim(), brokerage: f.brokerage.value.trim() || null, email: f.email.value.trim() || null, phone: f.phone.value.trim() || null,
        role: f.role.value, stage: f.stage.value, plan_interest: f.plan_interest.value || null,
        next_action: f.next_action.value.trim() || null, next_action_at: f.next_action_at.value ? new Date(f.next_action_at.value + 'T12:00:00').toISOString() : null,
        notes: f.notes.value.trim() || null, source: 'sales-desk'
      };
      var id = Number(f.id.value || 0);
      status.textContent = 'Saving';
      var q = id ? db.from('watchdog_sales_prospects').update(row).eq('id', id) : db.from('watchdog_sales_prospects').insert(row);
      q.then(function (r) { if (r.error) throw r.error; reset(); return refresh(); }).catch(function (e) { status.textContent = err(e); });
    });
  }

  function bindOwnerForms() {
    var prov = $('[data-provision-form]');
    if (prov) prov.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!prov.reportValidity()) return;
      var st = $('[data-provision-status]');
      st.textContent = 'Provisioning';
      db.rpc('provision_sales_consultant', { p_email: prov.elements.email.value.trim(), p_display_name: prov.elements.display_name.value.trim(), p_code: prov.elements.code.value.trim() || null }).then(function (r) {
        if (r.error) throw r.error;
        st.textContent = 'Provisioned. Code: ' + (r.data && r.data.consultant_code);
        prov.reset();
        return loadConsultants().then(renderConsultants);
      }).catch(function (e) { st.textContent = err(e); });
    });
    var assign = $('[data-assign-form]');
    if (assign) assign.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!assign.reportValidity()) return;
      var st = $('[data-assign-status]');
      st.textContent = 'Attributing';
      db.rpc('assign_sales_attribution', { p_email: assign.elements.email.value.trim(), p_code: state.consultant.consultant_code, p_note: assign.elements.note.value.trim() || null }).then(function (r) {
        if (r.error) throw r.error;
        st.textContent = r.data && r.data.assigned ? 'Attributed.' : (r.data && r.data.reason) || 'Not attributed.';
        assign.reset();
        return refresh();
      }).catch(function (e) { st.textContent = err(e); });
    });
    var end = $('[data-end-consultant]');
    if (end) end.addEventListener('click', function () {
      if (!window.confirm('End this consultant? Role returns to user and Pro+ access is removed. Commissions stay on the ledger.')) return;
      db.rpc('end_sales_consultant', { p_consultant: state.viewing }).then(function (r) { if (r.error) throw r.error; return openList(); }).catch(function (e) { notice(err(e), true); });
    });
    var back = $('[data-back-to-list]');
    if (back) back.addEventListener('click', openList);
  }

  function openList() {
    show('owner-pick');
    return loadConsultants().then(renderConsultants).catch(function (e) { notice(err(e), true); });
  }

  function openDesk(consultantId) {
    return loadDesk(consultantId).then(function (d) {
      if (!d.consultant) { notice('That consultant was not found.', true); return openList(); }
      notice('');
      renderDesk();
      show('desk');
    }).catch(function (e) { notice(err(e), true); if (state.isOwner) openList(); else show('denied'); });
  }

  function refresh() { return openDesk(state.viewing); }

  function boot() {
    bindTabs(); bindProspectForm(); bindOwnerForms();
    $$('[data-signin]').forEach(function (a) { a.addEventListener('click', function (e) { e.preventDefault(); signInReturn(); }); });
    db.auth.getSession().then(function (r) {
      var s = r && r.data && r.data.session;
      if (!s || !s.user) { show('signin'); return; }
      state.user = s.user;
      return loadRole().then(function () {
        if (state.isOwner) {
          var q = new URLSearchParams(location.search);
          var pick = q.get('consultant');
          return pick ? openDesk(pick) : openList();
        }
        if (state.role !== 'sales_consultant') { show('denied'); return; }
        return openDesk(null);
      });
    }).catch(function (e) { notice(err(e), true); show('denied'); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
