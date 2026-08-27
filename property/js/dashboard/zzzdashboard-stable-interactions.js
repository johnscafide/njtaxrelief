/* Watchdog Dashboard stable interactions
   Replaces the former mutation-heavy interaction layer. Intentionally does not
   create dashboard navigation cards or mutate the grid continuously. */
(function () {
  'use strict';
  if (window.__WD_STABLE_INTERACTIONS__) return;
  window.__WD_STABLE_INTERACTIONS__ = true;

  var root = document.getElementById('wd4-root');
  if (!root || !window.supabase) return;

  var URL = 'https://uvkvaxljhhngydvlrzom.supabase.co';
  var KEY = 'sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa';
  var db = window.supabase.createClient(URL, KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
      storageKey: 'sb-uvkvaxljhhngydvlrzom-auth-token'
    }
  });

  var user = null;
  var profile = {};
  var entitlement = null;
  var properties = [];
  var scores = [];
  var events = [];
  var readAt = null;
  var dataReady = false;
  var portfolioFingerprint = '';
  var initAttempts = 0;
  var initTimer = null;
  var LS = 'watchdogDashboardInteractionsV1';

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>\"]/g, function (c) {
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '\"':'&quot;' }[c];
    });
  }
  function n(v) {
    if (v === null || v === undefined || v === '') return null;
    v = Number(v);
    return Number.isFinite(v) ? v : null;
  }
  function money(v) {
    v = n(v);
    if (v == null) return '—';
    var a = Math.abs(v);
    if (a >= 1e9) return '$' + (v / 1e9).toFixed(2).replace(/\.00$/, '') + 'B';
    if (a >= 1e6) return '$' + (v / 1e6).toFixed(a >= 1e7 ? 1 : 2).replace(/\.00$/, '').replace(/\.0$/, '') + 'M';
    return '$' + Math.round(v).toLocaleString();
  }
  function uniq(a) { return Array.from(new Set((a || []).filter(Boolean))); }
  function rows(part) {
    return part && part.status === 'fulfilled' && part.value && !part.value.error && Array.isArray(part.value.data) ? part.value.data : [];
  }
  function one(part) {
    return part && part.status === 'fulfilled' && part.value && !part.value.error ? part.value.data : null;
  }
  function plan(v) {
    v = String(v || '').toLowerCase().replace(/\+/g, '_plus').replace(/[^a-z_]/g, '');
    if (v === 'free') v = 'standard';
    return ['standard','agent','pro','pro_plus','teams','developer'].indexOf(v) >= 0 ? v : 'standard';
  }
  function actualPlan() {
    if (plan(profile.account_role) === 'developer' || plan(entitlement && entitlement.account_role) === 'developer') return 'developer';
    return plan((entitlement && entitlement.plan_tier) || profile.plan_tier || profile.plan);
  }
  function prettyPlan() {
    var p = actualPlan();
    return p === 'developer' ? 'Developer' : p.replace('_plus', '+').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }
  function timeLabel(v) {
    var d = new Date(v);
    if (!Number.isFinite(d.getTime())) return '';
    return d.toLocaleString('en-US', { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' });
  }
  function pretty(v) {
    return String(v || 'Property update').replace(/[._-]/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  function readPrefs() {
    try {
      var x = JSON.parse(localStorage.getItem(LS) || 'null');
      readAt = x && x.readAt ? x.readAt : null;
    } catch (_) {}
  }
  function saveReadAt() {
    try {
      var x = JSON.parse(localStorage.getItem(LS) || 'null') || {};
      x.readAt = readAt;
      if (!Array.isArray(x.hidden)) x.hidden = [];
      localStorage.setItem(LS, JSON.stringify(x));
    } catch (_) {}
  }

  function scoreMap() {
    var latest = {};
    scores.forEach(function (r) {
      var value = n(r.watchdog_score != null ? r.watchdog_score : r.score);
      if (value == null || !r.pams_pin) return;
      var t = new Date(r.computed_at || r.observed_at || r.observed_on || 0).getTime() || 0;
      if (!latest[r.pams_pin] || t >= latest[r.pams_pin].t) latest[r.pams_pin] = { value:value, t:t };
    });
    var out = {};
    Object.keys(latest).forEach(function (k) { out[k] = latest[k].value; });
    return out;
  }

  function patchPortfolioOnce() {
    if (!dataReady) return false;
    var tbody = document.querySelector('[data-card-id="properties"] .wd5-properties-table tbody');
    if (!tbody) return false;
    var sm = scoreMap();
    var list = properties.slice().sort(function (a, b) { return (n(b.watchdog_value) || 0) - (n(a.watchdog_value) || 0); });
    var fp = list.map(function (p) { return [p.pams_pin, sm[p.pams_pin], p.assessed, p.last_year_tax, p.watchdog_value].join(':'); }).join('|');
    if (portfolioFingerprint === fp) return true;
    portfolioFingerprint = fp;
    tbody.innerHTML = list.map(function (p) {
      var score = n(sm[p.pams_pin]);
      var cls = score == null ? '' : score >= 65 ? 'good' : score < 45 ? 'risk' : 'watch';
      return '<tr>' +
        '<td title="' + esc(p.address) + '">' + esc(p.address || 'Property') + '</td>' +
        '<td title="' + esc(p.town) + '">' + esc(p.town || '—') + '</td>' +
        '<td>' + (score == null ? '—' : '<span class="wd5-score-pill ' + cls + '">' + Math.round(score) + '</span>') + '</td>' +
        '<td>' + esc(p.assessed ? money(p.assessed) : '—') + '</td>' +
        '<td>' + esc(p.last_year_tax ? money(p.last_year_tax) : '—') + '</td>' +
        '<td>' + esc(p.watchdog_value ? money(p.watchdog_value) : '—') + '</td>' +
      '</tr>';
    }).join('');
    return true;
  }

  function unreadCount() {
    var cutoff = readAt ? new Date(readAt).getTime() : 0;
    return events.filter(function (x) { return (new Date(x.occurred_at).getTime() || 0) > cutoff; }).length;
  }
  function propertyForPin(pin) {
    return properties.find(function (x) { return x.pams_pin === pin; }) || {};
  }
  function notificationIcon(x) {
    var severity = String(x.severity || '').toLowerCase();
    var type = String(x.event_type || x.marker_id || '').toLowerCase();
    if (/critical|high/.test(severity)) return 'fa-triangle-exclamation';
    if (/tax|assessment/.test(type)) return 'fa-receipt';
    if (/market|value/.test(type)) return 'fa-chart-line';
    if (/permit/.test(type)) return 'fa-hammer';
    return 'fa-house';
  }

  function ensureOverlays() {
    var app = document.querySelector('.wd4-app');
    if (!app) return false;
    if (!document.getElementById('wd6-profile')) {
      app.insertAdjacentHTML('beforeend',
        '<aside id="wd6-profile" class="wd6-pop"></aside>' +
        '<aside id="wd6-notices" class="wd6-pop"></aside>' +
        '<button id="wd6-shade" class="wd6-shade" type="button" aria-label="Close dialog"></button>' +
        '<section id="wd6-invite" class="wd6-invite"></section>'
      );
    }
    if (user) buildProfile();
    if (dataReady) buildNotifications();
    if (user) buildInvite();
    ensureWidgetChrome();
    return true;
  }

  function buildProfile() {
    var p = document.getElementById('wd6-profile');
    if (!p || p.dataset.stableBuilt === '1') return;
    var meta = user && user.user_metadata || {};
    var name = profile.display_name || profile.full_name || meta.full_name || meta.name || user.email || 'Account';
    p.innerHTML = '<header><span><b>' + esc(name) + '</b><small>' + esc(user.email || '') + '</small></span><i>' + esc(prettyPlan()) + '</i></header>' +
      '<nav>' +
      '<a href="/property/account"><i class="fas fa-user-pen"></i><span><b>Edit profile & role</b><small>Profile, profession and preferences</small></span></a>' +
      '<button data-wd-stable="invite"><i class="fas fa-user-plus"></i><span><b>Invite others</b><small>Share your Watchdog referral link</small></span></button>' +
      '<a href="/property/account"><i class="fas fa-credit-card"></i><span><b>Account & billing</b><small>Plan, subscription and billing</small></span></a>' +
      '<a href="/property/home"><i class="fas fa-house"></i><span><b>Property Home</b><small>Your saved-home workspace</small></span></a>' +
      '</nav><button class="wd6-out" data-wd-stable="signout"><i class="fas fa-arrow-right-from-bracket"></i> Sign out</button>';
    p.dataset.stableBuilt = '1';
  }

  function buildNotifications(force) {
    var p = document.getElementById('wd6-notices');
    if (!p || (!force && p.dataset.stableBuilt === '1')) { updateBell(); return; }
    var unread = unreadCount();
    var cutoff = readAt ? new Date(readAt).getTime() : 0;
    p.innerHTML = '<header><span><b>Notifications</b><small>' + (unread ? unread + ' unread' : 'You’re caught up') + '</small></span><button data-wd-stable="read">Read all</button></header>' +
      '<div class="wd6-nlist">' + (events.length ? events.slice(0, 24).map(function (x) {
        var prop = propertyForPin(x.pams_pin);
        var isUnread = (new Date(x.occurred_at).getTime() || 0) > cutoff;
        return '<a class="wd6-note ' + (isUnread ? 'unread' : '') + '" href="/property/pulse">' +
          '<i class="fas ' + notificationIcon(x) + '"></i><span><b>' + esc(x.title || pretty(x.event_type || x.marker_id)) + '</b>' +
          '<small>' + esc(prop.address || x.pams_pin || 'Saved property') + '</small><em>' + esc(timeLabel(x.occurred_at)) + '</em></span>' +
          (isUnread ? '<u></u>' : '') + '</a>';
      }).join('') : '<div class="wd6-empty"><i class="far fa-bell-slash"></i><b>No notifications yet</b><small>Watchdog property changes will appear here.</small></div>') + '</div>' +
      '<a class="wd6-nfoot" href="/property/pulse">Open Change Intelligence <i class="fas fa-arrow-right"></i></a>';
    p.dataset.stableBuilt = '1';
    updateBell();
  }

  function updateBell() {
    var bell = document.querySelector('.wd4-icon-btn[data-action="activity-jump"]');
    if (!bell) return;
    var unread = unreadCount();
    var badge = bell.querySelector('.wd4-badge');
    if (!unread) { if (badge) badge.remove(); return; }
    if (!badge) { badge = document.createElement('span'); badge.className = 'wd4-badge'; bell.appendChild(badge); }
    badge.textContent = Math.min(99, unread);
  }

  function buildInvite() {
    var p = document.getElementById('wd6-invite');
    if (!p || p.dataset.stableBuilt === '1') return;
    var code = 'WD-' + String(user.id).replace(/-/g, '').slice(0, 10).toUpperCase();
    var link = location.origin + '/property/?ref=' + encodeURIComponent(code);
    p.innerHTML = '<button data-wd-stable="close" class="wd6-x"><i class="fas fa-xmark"></i></button>' +
      '<small>INVITE TO WATCHDOG</small><h2>Share better property intelligence.</h2>' +
      '<p>Send your personal Watchdog invite link to a friend, client or colleague.</p>' +
      '<label>Your invite link</label><div><input id="wd6-ref" readonly value="' + esc(link) + '">' +
      '<button data-wd-stable="copy"><i class="far fa-copy"></i> Copy</button></div>' +
      '<footer><a href="mailto:?subject=' + encodeURIComponent('Try Watchdog Property Intelligence') + '&body=' + encodeURIComponent('I thought you might find Watchdog useful: ' + link) + '"><i class="fas fa-envelope"></i>Email invite</a>' +
      '<button data-wd-stable="share"><i class="fas fa-share-nodes"></i>Share</button></footer><em>Invite code: ' + esc(code) + '</em>';
    p.dataset.stableBuilt = '1';
  }

  function ensureWidgetChrome() {
    var p = document.getElementById('wd4-widget-pop');
    if (!p) return;
    if (!p.querySelector('.wd6-wclose')) {
      var close = document.createElement('button');
      close.type = 'button';
      close.className = 'wd6-wclose';
      close.innerHTML = '<i class="fas fa-xmark"></i>';
      close.setAttribute('aria-label', 'Close widget settings');
      close.addEventListener('click', function () { p.classList.remove('open'); syncWidgetShade(); });
      p.appendChild(close);
    }
    var shade = document.getElementById('wd6-wshade');
    if (!shade) {
      shade = document.createElement('button');
      shade.id = 'wd6-wshade';
      shade.className = 'wd6-wshade';
      shade.type = 'button';
      shade.setAttribute('aria-label', 'Close widget settings');
      shade.addEventListener('click', function () { p.classList.remove('open'); syncWidgetShade(); });
      document.body.appendChild(shade);
    }
    syncWidgetShade();
  }
  function syncWidgetShade() {
    var p = document.getElementById('wd4-widget-pop');
    var shade = document.getElementById('wd6-wshade');
    if (p && shade) shade.classList.toggle('open', p.classList.contains('open'));
  }

  function pop(id) {
    ['wd6-profile','wd6-notices'].forEach(function (x) {
      var p = document.getElementById(x);
      if (!p) return;
      p.classList.toggle('open', x === id ? !p.classList.contains('open') : false);
    });
  }
  function closePops() {
    document.querySelectorAll('.wd6-pop.open').forEach(function (x) { x.classList.remove('open'); });
  }
  function inviteModal(on) {
    var p = document.getElementById('wd6-invite');
    var s = document.getElementById('wd6-shade');
    if (p) p.classList.toggle('open', on);
    if (s) s.classList.toggle('open', on);
    if (on) closePops();
  }

  function loadData() {
    readPrefs();
    db.auth.getSession().then(function (r) {
      var session = r && r.data && r.data.session;
      if (!session || !session.user) { dataReady = true; scheduleInit(); return; }
      user = session.user;
      return Promise.allSettled([
        db.from('profiles').select('id,email,display_name,full_name,role,roles,pro_agent,plan,plan_tier,account_role').eq('id', user.id).maybeSingle(),
        db.rpc('get_my_entitlement'),
        db.from('saved_properties').select('pams_pin,address,town,assessed,last_year_tax,watchdog_value').order('created_at', { ascending:false })
      ]).then(function (a) {
        profile = one(a[0]) || {};
        var ent = one(a[1]);
        entitlement = Array.isArray(ent) ? ent[0] : ent;
        properties = rows(a[2]);
        var pins = uniq(properties.map(function (p) { return p.pams_pin; }));
        if (!pins.length) return;
        return Promise.allSettled([
          db.from('public_watchdog_score_cache').select('pams_pin,watchdog_score,computed_at').in('pams_pin', pins),
          db.from('property_watchdog_scores').select('pams_pin,watchdog_score,observed_at,observed_on').in('pams_pin', pins).limit(4000),
          db.from('score_observations').select('pams_pin,score,observed_at,observed_on').in('pams_pin', pins).in('marker_id', ['watchdog.score','watchdog.watchdog_score']).limit(4000),
          db.from('property_update_events').select('pams_pin,event_type,severity,title,occurred_at,delta_numeric,marker_id').in('pams_pin', pins).order('occurred_at', { ascending:false }).limit(80)
        ]).then(function (b) {
          scores = rows(b[0]).concat(rows(b[1])).concat(rows(b[2]));
          events = rows(b[3]);
        });
      }).then(function () {
        dataReady = true;
        scheduleInit();
      });
    }).catch(function () {
      dataReady = true;
      scheduleInit();
    });
  }

  function scheduleInit() {
    if (initTimer) return;
    initTimer = setInterval(function () {
      initAttempts += 1;
      var appReady = ensureOverlays();
      var portfolioReady = patchPortfolioOnce();
      ensureWidgetChrome();
      if ((appReady && (portfolioReady || initAttempts > 20)) || initAttempts >= 40) {
        clearInterval(initTimer);
        initTimer = null;
      }
    }, 250);
  }

  document.addEventListener('dragstart', function (ev) {
    if (!document.body.classList.contains('wd4-layout-mode') && ev.target.closest && ev.target.closest('#wd4-grid>[data-card-id]')) {
      ev.preventDefault();
      ev.stopImmediatePropagation();
    }
  }, true);

  document.addEventListener('click', function (ev) {
    var account = ev.target.closest && ev.target.closest('.wd4-user[data-action="account"]');
    var bell = ev.target.closest && ev.target.closest('.wd4-icon-btn[data-action="activity-jump"]');
    if (account) {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      ensureOverlays();
      pop('wd6-profile');
      return;
    }
    if (bell) {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      ensureOverlays();
      buildNotifications(true);
      pop('wd6-notices');
      return;
    }

    var action = ev.target.closest && ev.target.closest('[data-wd-stable]');
    if (action) {
      var kind = action.dataset.wdStable;
      if (kind === 'invite') inviteModal(true);
      else if (kind === 'close') inviteModal(false);
      else if (kind === 'signout') db.auth.signOut().then(function () { location.href = '/property/'; });
      else if (kind === 'read') { readAt = new Date().toISOString(); saveReadAt(); buildNotifications(true); }
      else if (kind === 'copy') {
        var ref = document.getElementById('wd6-ref');
        if (ref && navigator.clipboard) navigator.clipboard.writeText(ref.value).then(function () { action.innerHTML = '<i class="fas fa-check"></i> Copied'; });
      } else if (kind === 'share') {
        var shareRef = document.getElementById('wd6-ref');
        if (shareRef && navigator.share) navigator.share({ title:'Watchdog Property Intelligence', url:shareRef.value }).catch(function () {});
        else if (shareRef && navigator.clipboard) navigator.clipboard.writeText(shareRef.value);
      }
      ev.preventDefault();
      return;
    }

    if (ev.target.id === 'wd6-shade') inviteModal(false);
    if (ev.target.closest && ev.target.closest('[data-action="widgets"]')) setTimeout(function () { ensureWidgetChrome(); syncWidgetShade(); }, 0);
    if (!ev.target.closest('.wd6-pop') && !ev.target.closest('.wd4-user') && !ev.target.closest('.wd4-icon-btn[data-action="activity-jump"]')) closePops();
  }, true);

  document.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Escape') return;
    closePops();
    inviteModal(false);
    var p = document.getElementById('wd4-widget-pop');
    if (p) p.classList.remove('open');
    syncWidgetShade();
  });

  loadData();
  scheduleInit();
})();
