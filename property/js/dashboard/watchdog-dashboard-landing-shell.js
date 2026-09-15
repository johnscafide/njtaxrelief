/* Landing-page dashboard visual shell for the real Watchdog dashboard. */
(function () {
  'use strict';
  if (window.__WATCHDOG_LANDING_DASHBOARD_SHELL__) return;
  window.__WATCHDOG_LANDING_DASHBOARD_SHELL__ = true;

  var renderTimer = null;
  var lastSignature = '';

  function byId(id) { return document.getElementById(id); }
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>\"]/g, function (c) {
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '\"':'&quot;' }[c];
    });
  }
  function num(value) {
    var n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  function money(value) {
    var n = num(value);
    return n == null ? '—' : '$' + Math.round(n).toLocaleString('en-US');
  }
  function title(value) {
    return String(value || '').toLowerCase().replace(/(^|\s|[-/])\S/g, function (m) { return m.toUpperCase(); });
  }
  function dateLabel(value) {
    if (!value) return 'Latest available records';
    var d = new Date(value);
    if (!Number.isFinite(d.getTime())) return 'Latest available records';
    return 'Updated ' + d.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
  }
  function ago(value) {
    if (!value) return '';
    var d = new Date(value);
    if (!Number.isFinite(d.getTime())) return '';
    var days = Math.max(0, Math.round((Date.now() - d.getTime()) / 86400000));
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 30) return days + ' days ago';
    return d.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
  }
  function firstName() {
    var WD = window.WD;
    return WD && typeof WD.userName === 'function' ? WD.userName() : 'Watchdog';
  }
  function planLabel() {
    var WD = window.WD;
    return WD && typeof WD.planLabel === 'function' ? WD.planLabel() : 'Member';
  }
  function initials(name) {
    var pieces = String(name || 'W').trim().split(/\s+/).filter(Boolean);
    if (!pieces.length) return 'W';
    return (pieces[0].charAt(0) + (pieces.length > 1 ? pieces[pieces.length - 1].charAt(0) : '')).toUpperCase();
  }

  function bindShell() {
    document.body.classList.add('wdm-dashboard-shell');
    var toggle = byId('wdm-menu-toggle');
    var sidebar = byId('wdm-sidebar');
    var account = byId('wdm-account');
    var menu = byId('wdm-account-menu');
    var search = byId('wdm-search-form');

    if (toggle) toggle.addEventListener('click', function () {
      document.body.classList.toggle('wdm-menu-open');
      toggle.setAttribute('aria-expanded', String(document.body.classList.contains('wdm-menu-open')));
    });
    if (sidebar) sidebar.addEventListener('click', function (event) {
      if (event.target.closest('a') && window.innerWidth <= 900) document.body.classList.remove('wdm-menu-open');
    });
    document.addEventListener('click', function (event) {
      var mobileOpen = window.innerWidth <= 900 && document.body.classList.contains('wdm-menu-open');
      if (mobileOpen && !event.target.closest('#wdm-sidebar') && !event.target.closest('#wdm-menu-toggle')) {
        document.body.classList.remove('wdm-menu-open');
      }
      if (menu && !menu.hidden && !event.target.closest('#wdm-account') && !event.target.closest('#wdm-account-menu')) {
        menu.hidden = true;
      }
    });
    if (account && menu) account.addEventListener('click', function () { menu.hidden = !menu.hidden; });
    if (search) search.addEventListener('submit', function (event) {
      event.preventDefault();
      var input = byId('wdm-search-input');
      var q = input ? input.value.trim() : '';
      if (!q) { location.assign('/property/'); return; }
      try { sessionStorage.setItem('watchdog:property-search:query', q); } catch (_) {}
      location.assign('/property/?q=' + encodeURIComponent(q));
    });
    var signout = byId('wdm-signout');
    if (signout) signout.addEventListener('click', function () {
      var WD = window.WD;
      var client = WD && typeof WD.db === 'function' ? WD.db() : null;
      if (client && client.auth && typeof client.auth.signOut === 'function') {
        client.auth.signOut().finally(function () { location.assign('/'); });
      } else {
        location.assign('/');
      }
    });
  }

  function scoreObject(WD, property) {
    if (!WD || !WD.S || !property || !property.pams_pin) return null;
    return WD.S.scores && WD.S.scores[property.pams_pin] || null;
  }
  function scoreValue(score) {
    if (!score) return null;
    var value = num(score.score);
    return value == null ? num(score.watchdog_score) : value;
  }
  function selectedProperty(WD) {
    var props = WD && typeof WD.filtered === 'function' ? WD.filtered() : [];
    if (!Array.isArray(props) || !props.length) return null;
    return props.find(function (p) { return String(p.kind || '').toLowerCase() === 'home'; }) || props[0];
  }
  function propertyKind(property) {
    var raw = property && (property.property_type || property.property_class || property.use_description || property.kind);
    if (!raw || String(raw).toLowerCase() === 'home') return 'Saved property';
    return title(raw);
  }
  function eventIcon(event) {
    var raw = String(event && (event.event_type || event.marker_id || event.title) || '').toLowerCase();
    if (/permit|construction|work/.test(raw)) return 'fa-hammer';
    if (/tax|assessment|ratio/.test(raw)) return 'fa-receipt';
    if (/sale|market|value/.test(raw)) return 'fa-chart-line';
    if (/owner|deed/.test(raw)) return 'fa-house-user';
    return 'fa-house';
  }

  function chartMarkup(WD, property, currentScore) {
    var rows = WD && WD.S && Array.isArray(WD.S.scoreHistory) ? WD.S.scoreHistory.slice() : [];
    if (property && property.pams_pin) {
      rows = rows.filter(function (r) { return r.pams_pin === property.pams_pin; });
    }
    rows = rows.map(function (r) {
      var value = num(r.score);
      if (value == null) value = num(r.watchdog_score);
      return { score:value, at:r.observed_at || r.computed_at || r.created_at || null };
    }).filter(function (r) { return r.score != null; });
    rows.sort(function (a,b) { return new Date(a.at || 0) - new Date(b.at || 0); });
    if (rows.length > 8) rows = rows.slice(-8);

    var hasHistory = rows.length > 1;
    if (!rows.length && currentScore != null) rows = [{score:currentScore},{score:currentScore}];
    if (rows.length === 1) rows.push({score:rows[0].score});
    if (!rows.length) return '<div class="wdm-change-empty">Score history will appear as observations accumulate for this property.</div>';

    var width = 320, height = 108, padX = 8, padY = 10;
    var pts = rows.map(function (r, i) {
      var x = padX + i * ((width - padX * 2) / Math.max(1, rows.length - 1));
      var y = padY + (100 - Math.max(0, Math.min(100, r.score))) * ((height - padY * 2) / 100);
      return {x:x,y:y};
    });
    var poly = pts.map(function (p) { return p.x.toFixed(1)+','+p.y.toFixed(1); }).join(' ');
    var pathPoints = pts.map(function (p) { return p.x.toFixed(1)+' '+p.y.toFixed(1); }).join(' L ');
    var fill = 'M '+pts[0].x.toFixed(1)+' '+(height-padY)+' L '+pathPoints;
    fill += ' L '+pts[pts.length-1].x.toFixed(1)+' '+(height-padY)+' Z';
    var dots = pts.map(function (p) {
      return '<circle class="wdm-chart-dot" cx="'+p.x.toFixed(1)+'" cy="'+p.y.toFixed(1)+'" r="3"/>';
    }).join('');
    var note = hasHistory ? 'Historical Watchdog Score observations' : 'Current Watchdog Score; history appears as observations accumulate';
    return [
      '<div class="wdm-score-chart">',
      '<svg viewBox="0 0 '+width+' '+height+'" role="img" aria-label="Watchdog Score history">',
      '<defs><linearGradient id="wdm-chart-fill" x1="0" y1="0" x2="0" y2="1">',
      '<stop offset="0" stop-color="#80caff" stop-opacity=".5"/>',
      '<stop offset="1" stop-color="#d9f1ff" stop-opacity=".12"/></linearGradient></defs>',
      '<path class="wdm-gridline" d="M0 22H320M0 54H320M0 86H320"/>',
      '<path class="wdm-chart-fill" d="'+fill+'"/>',
      '<polyline class="wdm-chart-line" points="'+poly+'"/>', dots, '</svg>',
      '<span class="wdm-chart-note">'+esc(note)+'</span></div>'
    ].join('');
  }

  function changesMarkup(WD, property) {
    var changes = WD && WD.S && Array.isArray(WD.S.changes) ? WD.S.changes.slice() : [];
    if (property && property.pams_pin) {
      var scoped = changes.filter(function (e) { return e.pams_pin === property.pams_pin; });
      if (scoped.length) changes = scoped;
    }
    changes.sort(function (a,b) {
      return new Date(b.occurred_at || b.created_at || 0) - new Date(a.occurred_at || a.created_at || 0);
    });
    changes = changes.slice(0,3);
    if (!changes.length) {
      return '<div class="wdm-change-empty">No recent verified changes are available for this property yet.</div>';
    }
    return '<div class="wdm-change-list">'+changes.map(function (event) {
      var label = event.title || String(event.event_type || event.marker_id || 'Property update').replace(/[._-]+/g,' ');
      return '<div class="wdm-change"><span class="wdm-change-icon"><i class="fas '+eventIcon(event)+'"></i></span><div><b>'+esc(label)+'</b><small>'+esc(ago(event.occurred_at || event.created_at))+'</small></div></div>';
    }).join('')+'</div>';
  }

  function tabMarkup() {
    return [
      '<div class="wdm-tabs">',
      '<button class="wdm-tab active" type="button">Overview</button>',
      '<button class="wdm-tab" type="button" data-wdm-scroll="#wdd-positions">My Properties</button>',
      '<button class="wdm-tab" type="button" data-wdm-scroll="#wdd-rail">Change Alerts</button>',
      '<button class="wdm-tab" type="button" data-wdm-scroll="#wd4-root">Market Insights</button>',
      '<button class="wdm-tab" type="button" data-wdm-scroll="#wdd-queue">Reports &amp; Actions</button>',
      '</div>'
    ].join('');
  }

  function emptyOverviewMarkup() {
    return [
      '<div class="wdm-property">',
      '<img class="wdm-property-photo" src="/agent/assets/property-house.webp" alt="" width="148" height="94">',
      '<div class="wdm-property-info"><h1>Your Watchdog dashboard</h1>',
      '<p>Save a New Jersey property to build this intelligence view.</p>',
      '<span class="wdm-property-type">Property intelligence</span>',
      '<ul class="wdm-property-facts"><li>Assessment —</li><li>Market —</li><li>Annual tax —</li><li>Watchdog Score —</li></ul></div>',
      '<div class="wdm-property-side"><a class="wdm-property-action" href="/property/">Look up a property</a>',
      '<small>Start with an address, owner, block &amp; lot, or town.</small></div></div>', tabMarkup(),
      '<div class="wdm-overview-body"><h2 class="wdm-section-title">Property Intelligence</h2>',
      '<div class="wdm-metrics">',
      '<div class="wdm-metric"><span>Estimated Value</span><strong>—</strong><small>Add a property to begin.</small></div>',
      '<div class="wdm-metric"><span>Assessment</span><strong>—</strong><small>Current public record.</small></div>',
      '<div class="wdm-metric"><span>Annual Tax</span><strong>—</strong><small>Latest available bill data.</small></div>',
      '<div class="wdm-metric"><span>Watchdog Score</span><strong>—</strong><small>Updates as evidence accumulates.</small></div>',
      '</div></div>'
    ].join('');
  }

  function propertyOverviewMarkup(WD, property, score, scoreNum) {
    var address = property.address || property.pams_pin || 'Saved property';
    var place = [title(property.town), property.state || 'NJ', property.zip || property.zip_code].filter(Boolean).join(' ');
    var gap = typeof WD.gapFor === 'function' ? WD.gapFor(property) : null;
    var scoreTone = scoreNum == null ? '' : scoreNum >= 65 ? 'good' : scoreNum < 50 ? 'bad' : '';
    var scoreNote = scoreNum == null ? 'Score builds as evidence is available.' : scoreNum >= 80 ? 'Strong position' : scoreNum >= 65 ? 'Reasonable position' : scoreNum >= 50 ? 'Typical for New Jersey' : 'Worth a review';
    var gapNote = gap && num(gap.pct) != null ? ((gap.pct > 0 ? '+' : '') + Number(gap.pct).toFixed(1) + '% assessed vs market evidence') : 'Assessment compared with current evidence';
    var last = (score && (score.computed_at || score.observed_at)) || property.updated_at || property.created_at;
    var openUrl = '/property/home' + (property.pams_pin ? '?pin=' + encodeURIComponent(property.pams_pin) : '');

    return [
      '<div class="wdm-property">',
      '<img class="wdm-property-photo" src="/agent/assets/property-house.webp" alt="" width="148" height="94">',
      '<div class="wdm-property-info"><h1>'+esc(address)+'</h1><p>'+esc(place || 'New Jersey')+'</p>',
      '<span class="wdm-property-type">'+esc(propertyKind(property))+'</span>',
      '<ul class="wdm-property-facts"><li>Assessment '+esc(money(property.assessed))+'</li>',
      '<li>Market '+esc(money(property.watchdog_value))+'</li><li>Tax '+esc(money(property.last_year_tax))+'</li>',
      '<li>Watchdog '+esc(scoreNum == null ? '—' : Math.round(scoreNum))+'</li></ul></div>',
      '<div class="wdm-property-side"><a class="wdm-property-action" href="'+esc(openUrl)+'">Open Property</a>',
      '<small>'+esc(dateLabel(last))+'</small></div></div>', tabMarkup(),
      '<div class="wdm-overview-body"><h2 class="wdm-section-title">Property Intelligence</h2>',
      '<div class="wdm-metrics">',
      '<div class="wdm-metric"><span>Estimated Value</span><strong>'+esc(money(property.watchdog_value))+'</strong><small>'+esc(gapNote)+'</small></div>',
      '<div class="wdm-metric"><span>Assessment</span><strong>'+esc(money(property.assessed))+'</strong><small>Latest available assessment record</small></div>',
      '<div class="wdm-metric"><span>Annual Tax</span><strong>'+esc(money(property.last_year_tax))+'</strong><small>Latest available annual tax record</small></div>',
      '<div class="wdm-metric"><span>Watchdog Score</span><strong>'+(scoreNum == null ? '—' : Math.round(scoreNum))+'</strong>',
      '<small class="'+scoreTone+'">'+esc(scoreNote)+'</small></div></div>',
      '<div class="wdm-overview-bottom"><section class="wdm-chart-card"><div class="wdm-card-head">',
      '<h2>Watchdog Score History</h2><a href="/property/home">Property details</a></div>',
      chartMarkup(WD, property, scoreNum), '</section><section class="wdm-changes-card"><div class="wdm-card-head">',
      '<h2>Recent Changes</h2><a href="/property/pulse">View All</a></div>',
      changesMarkup(WD, property), '</section></div></div>'
    ].join('');
  }

  function bindDynamicTabs() {
    document.querySelectorAll('#wdm-overview [data-wdm-scroll]').forEach(function (node) {
      if (node.__wdmBound) return;
      node.__wdmBound = true;
      node.addEventListener('click', function () {
        var target = document.querySelector(node.getAttribute('data-wdm-scroll'));
        if (target) target.scrollIntoView({ behavior:'smooth', block:'start' });
      });
    });
  }

  function renderOverview(force) {
    var WD = window.WD;
    var overview = byId('wdm-overview');
    if (!overview || !WD || !WD.S) return false;
    var property = selectedProperty(WD);
    var score = scoreObject(WD, property);
    var scoreNum = scoreValue(score);
    if (typeof WD.stats === 'function') WD.stats();
    var signature = [property && property.pams_pin, property && property.assessed, property && property.watchdog_value,
      property && property.last_year_tax, scoreNum, WD.S.changes && WD.S.changes.length,
      WD.S.scoreHistory && WD.S.scoreHistory.length, firstName(), planLabel()].join('|');
    if (!force && signature === lastSignature) return true;
    lastSignature = signature;

    var accountName = byId('wdm-account-name');
    var accountPlan = byId('wdm-account-plan');
    var avatar = byId('wdm-avatar');
    if (accountName) accountName.textContent = firstName();
    if (accountPlan) accountPlan.textContent = planLabel();
    if (avatar) avatar.textContent = initials(firstName());

    overview.innerHTML = property ? propertyOverviewMarkup(WD, property, score, scoreNum) : emptyOverviewMarkup();
    overview.hidden = false;
    bindDynamicTabs();
    return true;
  }

  function queueRender(force) {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(function () { renderOverview(!!force); }, 60);
  }
  function watchDashboard() {
    var attempts = 0;
    var timer = setInterval(function () {
      attempts += 1;
      if (renderOverview(attempts === 1) || attempts > 80) clearInterval(timer);
    }, 125);
    var app = byId('wdd-app');
    if (app && 'MutationObserver' in window) {
      new MutationObserver(function () { queueRender(false); }).observe(app, { childList:true, subtree:true });
    }
    document.addEventListener('wd:ready', function () { queueRender(true); });
    window.addEventListener('watchdog:context-refresh', function () { queueRender(true); });
    window.addEventListener('pageshow', function () { queueRender(true); });
  }
  function boot() {
    bindShell();
    watchDashboard();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
  else boot();
})();
