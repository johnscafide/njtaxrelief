/* ==========================================================================
   wd-core.js — the only place that talks to Supabase or holds state.
   Fires 'wd:ready' when the data is in. No observers, no polling.
   Weather, notifications and the account menu belong to app-shell-2027.js.
   ========================================================================== */
(function (w, d) {
  'use strict';
  if (w.WD) return;

  /* Supabase configuration belongs to the shared Watchdog runtime. Keeping
     this page on that client preserves preview/production switching, PKCE,
     onboarding and key rotation in one place. */
  var H = {
    esc: function (v) {
      return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    },
    num: function (v) { var n = Number(v); return Number.isFinite(n) ? n : 0; },
    valid: function (v) { var n = Number(v); return Number.isFinite(n) ? n : null; },
    sum: function (a) { return a.reduce(function (x, y) { return x + H.num(y); }, 0); },
    avg: function (a) { var l = a.map(H.valid).filter(function (v) { return v != null; }); return l.length ? H.sum(l) / l.length : 0; },
    money: function (v) { var n = H.num(v), a = Math.abs(n); if (a >= 1e9) return '$' + (n / 1e9).toFixed(2).replace(/\.?0+$/, '') + 'B'; if (a >= 1e6) return '$' + (n / 1e6).toFixed(a >= 1e7 ? 1 : 2).replace(/\.?0+$/, '') + 'M'; return '$' + Math.round(n).toLocaleString(); },
    dollars: function (v) { return '$' + Math.round(H.num(v)).toLocaleString(); },
    ago: function (v) { var t = new Date(v).getTime(); if (!Number.isFinite(t)) return ''; var m = Math.round((Date.now() - t) / 60000); if (m < 60) return m + 'm ago'; if (m < 1440) return Math.round(m / 60) + 'h ago'; var dd = Math.round(m / 1440); if (dd < 30) return dd + 'd ago'; return new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); },
    daysAgoIso: function (n) { return new Date(Date.now() - n * 86400000).toISOString(); },
    unique: function (l) { return Array.from(new Set(l.filter(Boolean))); },
    titleCase: function (v) { return String(v || '').toLowerCase().replace(/\b\w/g, function (c) { return c.toUpperCase(); }); },
    pretty: function (v) { return H.titleCase(String(v || 'Update').replace(/[._-]/g, ' ')); },
    copy: function (v) {
      if (v == null) return '';
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v).trim();
      if (Array.isArray(v)) return v.map(H.copy).filter(Boolean).slice(0, 3).join(' ');
      if (typeof v === 'object') {
        var preferred = ['summary', 'why', 'reason', 'text', 'headline', 'explanation', 'detail', 'message'];
        for (var i = 0; i < preferred.length; i += 1) {
          if (Object.prototype.hasOwnProperty.call(v, preferred[i])) { var picked = H.copy(v[preferred[i]]); if (picked) return picked; }
        }
        return Object.keys(v).map(function (key) { return H.copy(v[key]); }).filter(Boolean).slice(0, 2).join(' ');
      }
      return '';
    },
    el: function (id) { return d.getElementById(id); },
    settled: function (p) { return p && p.status === 'fulfilled' && p.value && !p.value.error && Array.isArray(p.value.data) ? p.value.data : []; },
    one: function (p) { if (!p || p.status !== 'fulfilled' || !p.value) return null; var v = p.value.data; return Array.isArray(v) ? (v[0] || null) : (v || null); }
  };

  var S = { user: null, plan: 'free', entitlement: null, properties: [], scores: {}, changes: [], findings: [], county: 'ALL', tab: 'ledger', sort: { key: 'gap', dir: 'desc' } };
  var RANK = { standard: 0, agent: 1, pro: 2, pro_plus: 3, teams: 4, developer: 5 };
  function normPlan(v) { var k = String(v || '').toLowerCase().replace(/\+/g, '_plus').replace(/[^a-z_]/g, ''); if (k === 'free' || k === '') k = 'standard'; return RANK[k] == null ? 'standard' : k; }

  var client = null;
  function db() {
    if (client) return client;
    if (!w.NJPTRSupabaseRuntime || typeof w.NJPTRSupabaseRuntime.createClient !== 'function') return null;
    try { client = w.NJPTRSupabaseRuntime.createClient(); } catch (error) { console.warn('Watchdog shared Supabase runtime unavailable:', error); return null; }
    return client;
  }

  function gapFor(p) {
    var assessed = H.valid(p.assessed), value = H.valid(p.watchdog_value);
    if (assessed == null || value == null || value <= 0) return null;
    var over = assessed - value, rate = H.valid(p.effective_rate);
    return { pct: (assessed / value - 1) * 100, over: over, dollars: rate != null && rate > 0 ? (over * rate) / 100 : null };
  }
  function categoryFor(p) { var g = gapFor(p), s = S.scores[p.pams_pin]; if (g && g.pct >= 15) return 'bad'; if (g && g.pct >= 5) return 'warn'; if (s && s.score != null && s.score < 45) return 'bad'; if (s && s.score != null && s.score < 65) return 'warn'; return 'ok'; }
  function filtered() { if (S.county === 'ALL') return S.properties.slice(); return S.properties.filter(function (p) { return String(p.county || '').toUpperCase() === S.county; }); }
  function stats() {
    var props = filtered(), pins = new Set(props.map(function (p) { return p.pams_pin; }).filter(Boolean)), changes = S.changes.filter(function (r) { return pins.has(r.pams_pin); }), cut30 = Date.now() - 30 * 86400000;
    var scoreVals = [], peerVals = [], over = 0, atStake = 0, warn = 0, bad = 0;
    props.forEach(function (p) { var s = S.scores[p.pams_pin]; if (s && s.score != null) scoreVals.push(s.score); if (s && s.peer != null) peerVals.push(s.peer); var g = gapFor(p); if (g && g.pct >= 5) { over += 1; if (g.dollars) atStake += g.dollars; } var c = categoryFor(p); if (c === 'warn') warn += 1; if (c === 'bad') bad += 1; });
    return { count: props.length, score: scoreVals.length ? H.avg(scoreVals) : null, peer: peerVals.length ? H.avg(peerVals) : null, value: H.sum(props.map(function (p) { return p.watchdog_value; })), assessed: H.sum(props.map(function (p) { return p.assessed; })), tax: H.sum(props.map(function (p) { return p.last_year_tax; })), over: over, atStake: atStake, warn: warn, bad: bad, changes: changes, changes30: changes.filter(function (r) { var t = new Date(r.occurred_at).getTime(); return Number.isFinite(t) && t >= cut30; }).length };
  }

  function loadData() {
    var c = db();
    return Promise.allSettled([
      c.rpc('get_my_entitlement'),
      c.rpc('is_watchdog_developer'),
      c.from('saved_properties').select('*').order('created_at', { ascending: false })
    ]).then(function (a) {
      var ent = H.one(a[0]);
      var dev = a[1].status === 'fulfilled' && a[1].value && a[1].value.data === true;
      var saved = a[2];
      if (!saved || saved.status !== 'fulfilled') throw (saved && saved.reason) || new Error('Saved properties request failed');
      if (!saved.value || saved.value.error) throw (saved.value && saved.value.error) || new Error('Saved properties request failed');
      S.entitlement = ent || null;
      S.plan = dev ? 'developer' : normPlan(ent && (ent.plan_tier || ent.plan));
      S.properties = Array.isArray(saved.value.data) ? saved.value.data : [];
      var pins = H.unique(S.properties.map(function (p) { return p.pams_pin; }));
      if (!pins.length) return [];
      var towns = H.unique(S.properties.map(function (p) { return p.town; }));
      return Promise.allSettled([
        c.from('public_watchdog_score_cache').select('pams_pin,watchdog_score,town,county,peer_count,peer_median,computed_at').in('pams_pin', pins),
        c.from('property_watchdog_scores').select('pams_pin,watchdog_score,town,county,observed_on,observed_at').in('pams_pin', pins).order('observed_at', { ascending: false }).limit(1000),
        towns.length ? c.from('town_watchdog_scores').select('town,county,avg_watchdog_score,scored_properties,score_as_of').in('town', towns) : Promise.resolve({ data: [], error: null }),
        c.from('property_update_events').select('pams_pin,event_type,severity,title,summary,marker_id,delta_numeric,occurred_at,read_at').in('pams_pin', pins).gte('occurred_at', H.daysAgoIso(120)).order('occurred_at', { ascending: false }).limit(400),
        c.from('intelligence_findings').select('pams_pin,property_address,opportunity_type,score,confidence,evidence_coverage,why_now,recommended_actions,created_at').in('pams_pin', pins).order('created_at', { ascending: false }).limit(200)
      ]);
    }).then(function (parts) {
      if (!Array.isArray(parts)) return;
      var townPeers = {};
      H.settled(parts[2]).forEach(function (r) { var key = String(r.town || '').trim().toUpperCase(); if (key && H.valid(r.avg_watchdog_score) != null) townPeers[key] = H.num(r.avg_watchdog_score); });
      H.settled(parts[1]).forEach(function (r) { if (!r.pams_pin || H.valid(r.watchdog_score) == null || S.scores[r.pams_pin]) return; var townKey = String(r.town || '').trim().toUpperCase(); S.scores[r.pams_pin] = { score: H.num(r.watchdog_score), peer: townPeers[townKey] != null ? townPeers[townKey] : null, peerCount: null, town: r.town }; });
      H.settled(parts[0]).forEach(function (r) { if (!r.pams_pin || H.valid(r.watchdog_score) == null) return; var townKey = String(r.town || '').trim().toUpperCase(); S.scores[r.pams_pin] = { score: H.num(r.watchdog_score), peer: H.valid(r.peer_median) != null ? H.num(r.peer_median) : (townPeers[townKey] != null ? townPeers[townKey] : null), peerCount: H.num(r.peer_count), town: r.town }; });
      S.properties.forEach(function (p) { var s = S.scores[p.pams_pin], townKey = String(p.town || '').trim().toUpperCase(); if (s && s.peer == null && townPeers[townKey] != null) s.peer = townPeers[townKey]; });
      S.changes = H.settled(parts[3]);
      S.findings = H.settled(parts[4]);
    });
  }

  var listeners = [];
  var WD = {
    H: H, S: S, RANK: RANK, db: db, stats: stats, filtered: filtered, gapFor: gapFor, categoryFor: categoryFor,
    isPro: function () { return RANK[S.plan] >= RANK.pro; },
    counties: function () { return H.unique(S.properties.map(function (p) { return String(p.county || '').trim().toUpperCase(); })).sort(); },
    userName: function () { var m = (S.user && S.user.user_metadata) || {}, n = m.full_name || m.name || (S.user && S.user.email) || 'there'; return String(n).split(/\s+/)[0]; },
    planLabel: function () { return S.plan === 'developer' ? 'Developer' : S.plan === 'standard' ? 'Free' : S.plan.replace('_plus', '+').replace(/\b\w/g, function (c) { return c.toUpperCase(); }); },
    onRepaint: function (fn) { listeners.push(fn); },
    repaint: function () { listeners.forEach(function (fn) { try { fn(); } catch (e) { console.warn(e); } }); },
    toast: function (msg) { var t = H.el('wdd-toast'); if (!t) return; t.textContent = msg; t.classList.add('is-on'); clearTimeout(t.__timer); t.__timer = setTimeout(function () { t.classList.remove('is-on'); }, 2600); }
  };
  w.WD = WD;

  function fail(msg) { var m = H.el('wdd-boot-msg'), r = H.el('wdd-boot-retry'); if (m) m.textContent = msg; if (r) { r.hidden = false; r.addEventListener('click', function () { location.reload(); }, { once: true }); } }
  function boot() {
    var c = db();
    if (!c) { fail('The data client could not start. Reload to try again.'); return; }
    var guard = setTimeout(function () { fail('The dashboard did not finish loading. Reload to retry, or open your account page if it keeps happening.'); }, 14000);
    c.auth.getSession().then(function (res) { var session = res && res.data && res.data.session; if (!session || !session.user) { location.replace('/property/'); return null; } S.user = session.user; return loadData(); }).then(function (skipped) {
      if (skipped === null) return;
      clearTimeout(guard);
      var bootEl = H.el('wdd-boot'), app = H.el('wdd-app'), pull = H.el('wdd-pull');
      if (bootEl) bootEl.hidden = true; if (app) app.hidden = false; if (pull) pull.hidden = false;
      d.dispatchEvent(new CustomEvent('wd:ready'));
    }).catch(function (err) { clearTimeout(guard); console.warn('Watchdog dashboard load failed:', err); fail('We could not load your workspace. Reload to retry.'); });
  }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
})(window, document);
