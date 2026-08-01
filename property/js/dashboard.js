/* ============================================================
   DASHBOARD
   njpropertytaxrelief.com/property
   ============================================================ */
(function () {
  'use strict';

  var LEDGER_URL = 'https://uvkvaxljhhngydvlrzom.supabase.co';
  var LEDGER_KEY = 'sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa';

  var EJS_PUBLIC  = 'u262kw5AoJcBI342V';
  var EJS_SERVICE = 'service_gptqbyx';
  var EJS_TMPL    = 'template_contact';

  var sb = null, plUser = null, rows = [], profile = null;

  function el(id) { return document.getElementById(id); }
  function money(n) { return '$' + Math.round(n).toLocaleString(); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c];
    });
  }
  function toast(m) {
    var t = el('pl-toast'); if (!t) return;
    t.textContent = m; t.style.display = 'block';
    clearTimeout(window._t); window._t = setTimeout(function () { t.style.display = 'none'; }, 2600);
  }
  window.plModalNote = function (title, html) {
    var n = el('plm-note-overlay');
    n.innerHTML = '<div class="plm-note-box"><button class="plm-note-x" onclick="plCloseNote()"><i class="fas fa-xmark"></i></button>' +
      '<h3>' + esc(title) + '</h3>' + html + '</div>';
    n.classList.add('open');
  };
  window.plCloseNote = function () { el('plm-note-overlay').classList.remove('open'); };

  function ready() {
    if (sb) return true;
    if (typeof window.supabase === 'undefined' || LEDGER_KEY.indexOf('PASTE') === 0) return false;
    sb = window.supabase.createClient(LEDGER_URL, LEDGER_KEY,
      { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    return true;
  }

  window.plSignInPrompt = function () {
    if (!ready()) { plModalNote('Sign in unavailable', '<p>Accounts are not switched on yet.</p>'); return; }
    plModalNote('Sign in',
      '<div class="auth-magic"><label for="auth-email">Email me a sign in link</label>' +
        '<div class="auth-magic-row"><input id="auth-email" type="email" placeholder="you@email.com" ' +
        'onkeydown="if(event.key===\'Enter\')plMagicLink()"><button onclick="plMagicLink()">Send link</button></div>' +
        '<div class="auth-magic-note">No password to create or remember.</div></div>' +
      '<div class="auth-or"><span>or</span></div>' +
      '<div class="auth-btns"><button class="auth-btn google" onclick="plOAuth(\'google\')">Continue with Google</button></div>');
  };
  window.plOAuth = function (p) {
    if (!ready()) return;
    sb.auth.signInWithOAuth({ provider: p, options: { redirectTo: location.origin + location.pathname } });
  };
  window.plMagicLink = function () {
    var e = el('auth-email'), v = e ? e.value.trim() : '';
    if (!v || v.indexOf('@') < 1) { toast('Enter a valid email'); return; }
    sb.auth.signInWithOtp({ email: v, options: { emailRedirectTo: location.origin + location.pathname } })
      .then(function (r) {
        if (r.error) { toast('Could not send, try again shortly'); return; }
        plModalNote('Check your email', '<p>Sign in link sent to <b>' + esc(v) + '</b>.</p>');
      });
  };
  window.plSignOut = function () { if (sb) sb.auth.signOut().then(function () { location.reload(); }); };

  // ── boot ──
  if (ready()) {
    sb.auth.getSession().then(function (r) {
      plUser = (r.data && r.data.session) ? r.data.session.user : null;
      if (location.hash.indexOf('access_token') > -1) history.replaceState(null, '', location.pathname);
      paint();
    });
    sb.auth.onAuthStateChange(function (_e, s) { plUser = s ? s.user : null; paint(); });
  } else {
    document.addEventListener('DOMContentLoaded', function () { el('db-gate').style.display = ''; });
  }

  function meta() { return (plUser && plUser.user_metadata) || {}; }
  function name() { return meta().full_name || meta().name || (plUser.email || '').split('@')[0]; }

  function paint() {
    if (!plUser) { el('db-gate').style.display = ''; el('db-main').style.display = 'none'; return; }
    el('db-gate').style.display = 'none';
    el('db-main').style.display = '';

    var av = meta().avatar_url || meta().picture;
    el('db-avatar').innerHTML = av
      ? '<img src="' + esc(av) + '" alt="">'
      : '<div class="db-noav">' + esc((name() || '?').charAt(0).toUpperCase()) + '</div>';
    el('db-hi').textContent = 'Welcome back, ' + (name() || '').split(' ')[0];
    el('db-email').textContent = plUser.email || '';

    Promise.all([
      sb.from('saved_properties').select('*').order('created_at', { ascending: false }),
      sb.from('profiles').select('*').eq('id', plUser.id).maybeSingle(),
      loadRefData(), loadSR1A()
    ]).then(function (res) {
      rows = (res[0] && res[0].data) || [];
      profile = (res[1] && res[1].data) || {};
      render();
      hydrateDetails().then(render);
      el('db-profile-body').innerHTML = profileForm();
    });
  }

  // ══════════════════════════════════════════════
  // SHARED DATA
  // ══════════════════════════════════════════════
  var NJ_PARCEL = 'https://services2.arcgis.com/XVOqAjTOJ5P6ngMu/ArcGIS/rest/services/Parcels_Composite_NJ_WM/FeatureServer/0/query';
  var GREENTREE_URL = 'https://johnvarano.com/';
  var ratios = null, rates = null;

  function xfetch(url, ms) {
    ms = ms || 14000;
    var ctl = new AbortController();
    var t = setTimeout(function () { ctl.abort(); }, ms);
    return fetch(url, { signal: ctl.signal }).then(function (r) { clearTimeout(t); return r; },
      function (e) { clearTimeout(t); throw new Error(e && e.name === 'AbortError' ? 'timeout' : 'network'); });
  }
  function median(a) {
    if (!a || !a.length) return null;
    a = a.slice().sort(function (x, y) { return x - y; });
    var m = a.length >> 1;
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }
  function loadRefData() {
    if (ratios && rates) return Promise.resolve();
    return Promise.all([
      xfetch('/equalization-ratios.json', 8000).then(function (r) { return r.json(); })
        .then(function (j) { ratios = (j && j.ratios) || {}; }).catch(function () { ratios = {}; }),
      xfetch('/tax-rates.json', 8000).then(function (r) { return r.json(); })
        .then(function (j) { rates = (j && j.rates) || {}; }).catch(function () { rates = {}; })
    ]);
  }
  function ratioFor(town, county) {
    if (!ratios) return null;
    var t = (town || '').toUpperCase().trim();
    var tc = t + ' (' + (county || '').toUpperCase().trim() + ')';
    var keys = Object.keys(ratios), hit = null;
    for (var i = 0; i < keys.length; i++) if (keys[i].toUpperCase().trim() === tc) { hit = ratios[keys[i]]; break; }
    if (!hit) for (var j = 0; j < keys.length; j++) if (keys[j].toUpperCase().trim() === t) { hit = ratios[keys[j]]; break; }
    if (!hit) return null;
    var yrs = Object.keys(hit).map(Number).filter(function (y) { return y > 1990; }).sort();
    if (!yrs.length) return null;
    var row = hit[String(yrs[yrs.length - 1])];
    var pct = (row && typeof row === 'object') ? +row.ratio : +row;
    if (!pct || pct <= 0) return null;
    return { ratio: pct / 100, year: yrs[yrs.length - 1],
             upper: row && row.upper ? +row.upper / 100 : null };
  }

  // ══════════════════════════════════════════════
  // 1 · ASSESSMENT DRIFT
  // Uses the history snapshots the ledger writes whenever a figure changes.
  // Nobody else has this, because New Jersey does not publish per parcel
  // assessment history. It accumulates from your own visits.
  // ══════════════════════════════════════════════
  function toolDrift() {
    var withHist = rows.filter(function (r) { return (r.history || []).length; });
    if (!rows.length) return '';

    if (!withHist.length) {
      return toolCard('Assessment drift', 'fa-chart-line',
        '<div class="tl-wait"><i class="fas fa-hourglass-half"></i>' +
        '<div><b>Building your baseline.</b> Every time you open one of these properties we record the ' +
        'assessment and tax. The first time either one changes, this becomes a year over year chart of ' +
        'how your assessment has moved against your town. New Jersey does not publish that anywhere, ' +
        'so it can only be built by watching.</div></div>' +
        '<div class="tl-note">' + rows.length + ' propert' + (rows.length === 1 ? 'y' : 'ies') +
        ' being tracked. Nothing to compare yet.</div>');
    }

    var body = withHist.map(function (r) {
      var pts = (r.history || []).map(function (h) {
        return { t: h.seen ? new Date(h.seen).getTime() : 0, v: +h.assessed || 0, x: +h.last_year_tax || 0 };
      }).filter(function (p) { return p.v > 0; });
      pts.push({ t: Date.now(), v: +r.assessed || 0, x: +r.last_year_tax || 0 });
      if (pts.length < 2) return '';

      var first = pts[0], last = pts[pts.length - 1];
      var dA = last.v - first.v, pA = first.v ? (dA / first.v) * 100 : 0;
      var dT = last.x - first.x, pT = first.x ? (dT / first.x) * 100 : 0;

      var W = 300, H = 60, lo = Math.min.apply(null, pts.map(function (p) { return p.v; })),
          hi = Math.max.apply(null, pts.map(function (p) { return p.v; }));
      var path = pts.map(function (p, i) {
        var x = 4 + (i / (pts.length - 1)) * (W - 8);
        var y = H - 6 - ((p.v - lo) / ((hi - lo) || 1)) * (H - 14);
        return (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
      }).join(' ');

      return '<div class="dr-row">' +
        '<div class="dr-addr"><b>' + esc(r.address) + '</b><span>' + esc(r.town || '') + '</span></div>' +
        '<svg class="dr-spark" viewBox="0 0 ' + W + ' ' + H + '"><path d="' + path + '" fill="none" stroke="' +
          (dA > 0 ? '#c0392b' : '#1e6b3a') + '" stroke-width="2.4" stroke-linecap="round"/></svg>' +
        '<div class="dr-fig ' + (dA > 0 ? 'up' : 'down') + '">' + (dA >= 0 ? '+' : '') + money(dA) +
          '<span>' + (pA >= 0 ? '+' : '') + pA.toFixed(1) + '% assessed</span></div>' +
        '<div class="dr-fig ' + (dT > 0 ? 'up' : 'down') + '">' + (dT >= 0 ? '+' : '') + money(dT) +
          '<span>' + (pT >= 0 ? '+' : '') + pT.toFixed(1) + '% tax</span></div>' +
      '</div>';
    }).join('');

    return toolCard('Assessment drift', 'fa-chart-line', body +
      '<div class="tl-note">Measured from snapshots taken each time you opened the property. ' +
      'A rising assessment with a flat market is the clearest appeal signal there is.</div>');
  }

  // ══════════════════════════════════════════════
  // 2 · NEIGHBORHOOD TAX PERCENTILE
  // ══════════════════════════════════════════════
  function toolPercentile() {
    var homes = rows.filter(function (r) { return r.kind === 'home' && r.last_year_tax > 0; });
    if (!homes.length) return '';
    return toolCard('Where you sit in your town', 'fa-ranking-star',
      '<div id="pct-body"><div class="tl-wait"><div class="pl-spin" style="margin:0;"></div>' +
      '<div>Reading the tax distribution for your town...</div></div></div>');
  }

  function paintPercentile() {
    var host = el('pct-body');
    if (!host) return;
    var homes = rows.filter(function (r) { return r.kind === 'home' && r.last_year_tax > 0; });
    if (!homes.length) return;

    Promise.all(homes.slice(0, 3).map(function (r) {
      var where = "MUN_NAME = '" + String(r.town || '').replace(/'/g, "''") + "'" +
                  " AND PROP_CLASS = '2' AND LAST_YR_TX > 100";
      var p = new URLSearchParams({ where: where, outFields: 'LAST_YR_TX',
        returnGeometry: 'false', resultRecordCount: '2000', f: 'json' });
      return xfetch(NJ_PARCEL + '?' + p, 18000).then(function (x) { return x.json(); })
        .then(function (d) {
          var t = (d.features || []).map(function (f) { return +f.attributes.LAST_YR_TX; })
                    .filter(function (v) { return v > 100 && v < 200000; }).sort(function (a, b) { return a - b; });
          if (t.length < 30) return { r: r, ok: false };
          var below = 0;
          for (var i = 0; i < t.length; i++) if (t[i] < r.last_year_tax) below++;
          return { r: r, ok: true, pct: Math.round(below / t.length * 100), n: t.length, med: median(t) };
        }).catch(function () { return { r: r, ok: false }; });
    })).then(function (res) {
      host.innerHTML = res.map(function (o) {
        if (!o.ok) return '<div class="tl-note">Not enough data for ' + esc(o.r.town || 'that town') + ' yet.</div>';
        var hot = o.pct >= 75;
        return '<div class="pct-row">' +
          '<div class="pct-top"><b>' + esc(o.r.address) + '</b>' +
            '<span class="pct-badge ' + (hot ? 'hot' : 'ok') + '">' + o.pct + 'th percentile</span></div>' +
          '<div class="pct-bar"><i style="left:' + Math.min(97, Math.max(1, o.pct)) + '%"></i></div>' +
          '<div class="pct-legend"><span>lowest in ' + esc(o.r.town) + '</span><span>highest</span></div>' +
          '<div class="pct-say">You pay <b>' + money(o.r.last_year_tax) + '</b>. The median home here pays <b>' +
            money(o.med) + '</b>. That puts you above <b>' + o.pct + '%</b> of the ' + o.n.toLocaleString() +
            ' homes in town.' +
            (hot ? ' <b style="color:var(--red)">That is high enough to be worth challenging.</b>' : '') +
          '</div>' +
          (hot ? '<button class="tl-btn" onclick="dbAsk(\'appeal\')">Have an agent review this</button>' : '') +
        '</div>';
      }).join('');
    });
  }

  // ══════════════════════════════════════════════
  // 4 · REBATE STACK
  // ══════════════════════════════════════════════
  function toolRebates() {
    var homes = rows.filter(function (r) { return r.kind === 'home' && r.last_year_tax > 0; });
    if (!homes.length) return '';
    var r = homes[0];
    var tax = +r.last_year_tax;
    var senior = profile.age_band === '65plus';

    var anchor = 1500;
    var stay = senior ? Math.min(6500, tax * 0.5) : 0;
    var freeze = senior ? 0 : 0;                       // needs a base year, cannot infer
    var after = Math.max(0, tax - anchor - stay);

    return toolCard('Your rebate stack', 'fa-layer-group',
      '<div class="rb-stack">' +
        '<div class="rb-line"><span>Your bill for ' + esc(r.address) + '</span><b>' + money(tax) + '</b></div>' +
        '<div class="rb-line minus"><span>ANCHOR, homeowners</span><b>-' + money(Math.min(anchor, tax)) + '</b></div>' +
        (senior
          ? '<div class="rb-line minus"><span>Stay NJ, age 65+, capped at half the bill</span><b>-' + money(stay) + '</b></div>'
          : '<div class="rb-line muted"><span>Stay NJ, only from age 65</span><b>not yet</b></div>') +
        '<div class="rb-line total"><span>What you would actually pay</span><b>' + money(after) + '</b></div>' +
      '</div>' +
      (senior
        ? '<div class="tl-good"><i class="fas fa-circle-check"></i> At 65 or over you can stack both. Most people who ' +
          'qualify for Stay NJ have never filed for it, and it does not backdate.</div>'
        : '<div class="tl-note">Set your age band in your profile and this recalculates. If you are approaching 65, ' +
          'Stay NJ is worth planning for: it covers up to half the bill.</div>') +
      '<a class="tl-btn" href="/anchor-estimator.html">Run the full estimator</a>' +
      '<div class="tl-fine">Illustration only. Actual benefits depend on income, age, and residency. ' +
      'The Senior Freeze needs a base year we cannot infer, so it is not included here and may add more.</div>');
  }

  // ══════════════════════════════════════════════
  // 5 · PORTFOLIO
  // ══════════════════════════════════════════════
  function toolPortfolio() {
    if (rows.length < 2) return '';
    var tot = rows.reduce(function (a, r) { return a + (+r.last_year_tax || 0); }, 0);
    var assessed = rows.reduce(function (a, r) { return a + (+r.assessed || 0); }, 0);
    var value = rows.reduce(function (a, r) { return a + (+r.watchdog_value || +r.assessed || 0); }, 0);
    var blended = value ? (tot / value) * 100 : 0;

    var ranked = rows.slice().filter(function (r) { return r.last_year_tax && (r.watchdog_value || r.assessed); })
      .map(function (r) {
        var v = +r.watchdog_value || +r.assessed;
        return { r: r, eff: (+r.last_year_tax / v) * 100 };
      }).sort(function (a, b) { return b.eff - a.eff; });

    return toolCard('Portfolio', 'fa-building-columns',
      '<div class="pf-stats">' +
        '<div><b>' + rows.length + '</b><span>Properties</span></div>' +
        '<div><b>' + money(tot) + '</b><span>Total annual tax</span></div>' +
        '<div><b>' + money(assessed) + '</b><span>Total assessed</span></div>' +
        '<div><b>' + blended.toFixed(2) + '%</b><span>Blended effective rate</span></div>' +
      '</div>' +
      (ranked.length
        ? '<div class="pf-rank"><div class="pf-rank-h">Worst value per dollar, highest tax burden first</div>' +
          ranked.slice(0, 6).map(function (o, i) {
            return '<div class="pf-line">' +
              '<span class="pf-n">' + (i + 1) + '</span>' +
              '<span class="pf-a">' + esc(o.r.address) + '<em>' + esc(o.r.town || '') + '</em></span>' +
              '<span class="pf-e' + (i === 0 && ranked.length > 1 ? ' worst' : '') + '">' + o.eff.toFixed(2) + '%</span>' +
              '<span class="pf-t">' + money(o.r.last_year_tax) + '</span>' +
            '</div>';
          }).join('') + '</div>'
        : '') +
      '<div class="tl-note">Effective rate is tax divided by estimated market value, which is the only fair way to ' +
      'compare properties across different towns. Two homes at the same price can differ by thousands a year.</div>');
  }

  // ══════════════════════════════════════════════
  // 6 · TOWN COMPARISON
  // ══════════════════════════════════════════════
  function toolCompare() {
    var opts = Object.keys(ratios || {}).sort().map(function (k) {
      return '<option value="' + esc(k) + '">' + esc(k.replace(/ \(/, ', ').replace(/\)$/, '')) + '</option>';
    }).join('');
    var mine = rows.length ? rows[0] : null;
    return toolCard('Compare towns', 'fa-scale-balanced',
      '<div class="cmp-pick">' +
        '<select id="cmp-a"><option value="">Town A...</option>' + opts + '</select>' +
        '<select id="cmp-b"><option value="">Town B...</option>' + opts + '</select>' +
        '<select id="cmp-c"><option value="">Town C, optional...</option>' + opts + '</select>' +
        '<button class="tl-btn" onclick="dbCompare()">Compare</button>' +
      '</div>' +
      '<div id="cmp-out">' +
        (mine ? '<div class="tl-note">Tip: start with <b>' + esc(mine.town || '') + '</b>, where you already own, ' +
          'then add the towns you are considering.</div>' : '') +
      '</div>');
  }

  window.dbCompare = function () {
    var picks = ['cmp-a', 'cmp-b', 'cmp-c'].map(function (id) { return (el(id) || {}).value; })
      .filter(function (v) { return v; });
    var out = el('cmp-out');
    if (picks.length < 2) { out.innerHTML = '<div class="tl-note">Pick at least two towns.</div>'; return; }
    out.innerHTML = '<div class="tl-wait"><div class="pl-spin" style="margin:0;"></div><div>Measuring each town...</div></div>';

    Promise.all(picks.map(function (key) {
      var parts = key.replace(/\)$/, '').split(' (');
      var town = parts[0], county = parts[1] || '';
      var R = ratioFor(town, county);
      var where = "MUN_NAME = '" + town.replace(/'/g, "''") + "' AND COUNTY = '" + county.replace(/'/g, "''") +
                  "' AND PROP_CLASS = '2' AND NET_VALUE > 10000 AND LAST_YR_TX > 100";
      var p = new URLSearchParams({ where: where, outFields: 'NET_VALUE,LAST_YR_TX',
        returnGeometry: 'false', resultRecordCount: '1200', f: 'json' });
      return xfetch(NJ_PARCEL + '?' + p, 18000).then(function (x) { return x.json(); })
        .then(function (d) {
          var f = d.features || [];
          var assessed = f.map(function (x) { return +x.attributes.NET_VALUE; });
          var taxes = f.map(function (x) { return +x.attributes.LAST_YR_TX; });
          var eff = [];
          if (R) f.forEach(function (x) {
            var mv = (+x.attributes.NET_VALUE) / R.ratio;
            var e = (+x.attributes.LAST_YR_TX) / mv;
            if (isFinite(e) && e > 0.002 && e < 0.10) eff.push(e);
          });
          return { town: town, county: county, ratio: R, n: f.length,
                   medAssessed: median(assessed), medTax: median(taxes), eff: median(eff) };
        }).catch(function () { return { town: town, county: county, ratio: R, n: 0 }; });
    })).then(function (res) {
      var best = res.filter(function (r) { return r.eff; }).sort(function (a, b) { return a.eff - b.eff; })[0];
      out.innerHTML =
        '<div class="cmp-wrap"><table class="cmp"><thead><tr><th>Town</th>' +
        res.map(function (r) { return '<th>' + esc(r.town) + (best && r.town === best.town ? ' <span class="cmp-best">lowest</span>' : '') + '</th>'; }).join('') +
        '</tr></thead><tbody>' +
        cmpRow('Effective tax rate', res, function (r) { return r.eff ? (r.eff * 100).toFixed(2) + '%' : '-'; }) +
        cmpRow('Equalization ratio', res, function (r) { return r.ratio ? (r.ratio.ratio * 100).toFixed(2) + '%' : '-'; }) +
        cmpRow('Median assessment', res, function (r) { return r.medAssessed ? money(r.medAssessed) : '-'; }) +
        cmpRow('Median tax bill', res, function (r) { return r.medTax ? money(r.medTax) : '-'; }) +
        cmpRow('Tax on a $400k home', res, function (r) { return r.eff ? money(400000 * r.eff) : '-'; }) +
        cmpRow('Homes measured', res, function (r) { return r.n ? r.n.toLocaleString() : '-'; }) +
        '</tbody></table></div>' +
        (best ? '<div class="tl-good"><i class="fas fa-circle-check"></i> On a $400,000 home, <b>' + esc(best.town) +
          '</b> is the cheapest of these at about <b>' + money(400000 * best.eff) + '</b> a year.</div>' : '') +
        '<div class="tl-fine">Effective rates are measured live from each town\u2019s own parcels, not from a rate table. ' +
        'They will not match any single home exactly.</div>';
    });
  };
  function cmpRow(label, res, fn) {
    return '<tr><td class="cmp-l">' + label + '</td>' +
      res.map(function (r) { return '<td>' + fn(r) + '</td>'; }).join('') + '</tr>';
  }

  // ══════════════════════════════════════════════
  // 8 · TRUE COST OF OWNERSHIP  ·  sponsored
  // ══════════════════════════════════════════════
  function toolCost() {
    var homes = rows.filter(function (r) { return r.kind === 'home'; });
    if (!homes.length) return '';
    var r = homes[0];
    var v = +r.watchdog_value || +r.assessed || 300000;
    var mTax = Math.round((+r.last_year_tax || 0) / 12);

    return toolCard('True cost of ownership', 'fa-wallet',
      '<div class="tc-spon"><img src="/johnvarano.jpg" alt="John Varano">' +
        '<div><b>Sponsored by Greentree Mortgage, an HMA Company</b>' +
        '<span>John Varano, Branch Manager</span></div></div>' +
      '<div class="tc-grid">' +
        '<div class="tc-in">' +
          tcRow('Home value', 'tc-val', v.toLocaleString()) +
          tcRow('Loan balance', 'tc-loan', Math.round(v * 0.7).toLocaleString()) +
          tcRow('Rate %', 'tc-rate', '6.5', 'number', '0.125') +
          tcRow('Property tax, monthly', 'tc-tax', mTax.toLocaleString()) +
          tcRow('Insurance, monthly', 'tc-ins', '125') +
          tcRow('Upkeep, % of value/yr', 'tc-up', '1', 'number', '0.25') +
        '</div>' +
        '<div class="tc-out">' +
          '<div class="tc-big" id="tc-total">-</div>' +
          '<div class="tc-lbl">True monthly cost</div>' +
          '<div id="tc-break"></div>' +
          '<div class="tc-share" id="tc-share"></div>' +
          '<a class="tc-btn" href="' + GREENTREE_URL + '" target="_blank" rel="noopener">' +
            'Talk to John Varano <i class="fas fa-arrow-right"></i></a>' +
        '</div>' +
      '</div>' +
      '<div class="tl-fine">Estimate only. Not a loan offer or a commitment to lend. Greentree Mortgage, an HMA Company, ' +
      'is a separate company and is not affiliated with Opus Elite Real Estate. You are never required to use any particular lender.</div>');
  }
  function tcRow(label, id, val, type, step) {
    return '<div class="tc-row"><label>' + label + '</label>' +
      '<input id="' + id + '" type="' + (type || 'text') + '"' + (step ? ' step="' + step + '"' : '') +
      ' value="' + val + '" oninput="dbCost()"></div>';
  }

  window.dbCost = function () {
    function v(id) {
      var e = el(id); if (!e) return 0;
      return parseFloat(String(e.value).replace(/[^0-9.]/g, '')) || 0;
    }
    var val = v('tc-val'), loan = v('tc-loan'), rate = v('tc-rate');
    var tax = v('tc-tax'), ins = v('tc-ins'), up = v('tc-up');
    var i = rate / 100 / 12, n = 360;
    var pi = i > 0 ? loan * (i * Math.pow(1 + i, n)) / (Math.pow(1 + i, n) - 1) : loan / n;
    var upk = (val * (up / 100)) / 12;
    var total = pi + tax + ins + upk;

    var t = el('tc-total'); if (t) t.textContent = money(total);
    var b = el('tc-break');
    if (b) b.innerHTML =
      tcLine('Principal and interest', pi) + tcLine('Property tax', tax) +
      tcLine('Insurance', ins) + tcLine('Upkeep and repairs', upk);
    var sh = el('tc-share');
    if (sh && total > 0) {
      var pct = Math.round((tax / total) * 100);
      sh.innerHTML = '<i class="fas fa-circle-info"></i> Property tax is <b>' + pct +
        '%</b> of what this home costs you every month. It is also the only line here you can appeal.';
    }
  };
  function tcLine(l, v) {
    return '<div class="tc-line"><span>' + l + '</span><b>' + money(v) + '</b></div>';
  }

  // ══════════════════════════════════════════════
  // 10 · PROFESSIONAL EXPORT
  // ══════════════════════════════════════════════
  function toolExport() {
    if (!rows.length) return '';
    return toolCard('Export for your attorney or agent', 'fa-file-export',
      '<p class="tl-p">A clean parcel sheet with block, lot, PAMS PIN, assessment, the town ratio, and the ' +
      'Chapter 123 upper limit worked out for each property. This is the format a tax attorney or a county board ' +
      'actually wants, and it saves an hour of transcription.</p>' +
      '<div class="ex-btns">' +
        '<button class="tl-btn" onclick="dbExportCSV()"><i class="fas fa-file-csv"></i> Download CSV</button>' +
        '<button class="tl-btn ghost" onclick="dbExportPrint()"><i class="fas fa-print"></i> Printable sheet</button>' +
      '</div>' +
      '<div class="tl-fine">Figures are drawn from public assessment records and the state equalization table. ' +
      'Verify against the municipal record before filing anything.</div>');
  }

  function exportRows() {
    return rows.map(function (r) {
      var R = ratioFor(r.town, r.county);
      var mv = +r.watchdog_value || (R && r.assessed ? r.assessed / R.ratio : null);
      var fair = (mv && R) ? mv * R.ratio : null;
      var upper = fair ? fair * 1.15 : null;
      return {
        Address: r.address || '', Town: r.town || '', County: r.county || '', Zip: r.zip || '',
        Block: r.block || '', Lot: r.lot || '', PAMS_PIN: r.pams_pin || '',
        Assessed: r.assessed || '', Annual_Tax: r.last_year_tax || '',
        Effective_Rate_Pct: r.effective_rate || '',
        Town_Ratio_Pct: R ? (R.ratio * 100).toFixed(2) : '',
        Ratio_Tax_Year: R ? R.year : '',
        Est_Market_Value: mv ? Math.round(mv) : '',
        Supported_Assessment: fair ? Math.round(fair) : '',
        Ch123_Upper_Limit: upper ? Math.round(upper) : '',
        Over_Limit_By: (upper && r.assessed > upper) ? Math.round(r.assessed - upper) : 0,
        Appeal_Indicated: (upper && r.assessed > upper) ? 'YES' : 'no',
        Verification: r.verify_level || 'self', Kind: r.kind
      };
    });
  }

  window.dbExportCSV = function () {
    var d = exportRows();
    if (!d.length) return;
    var head = Object.keys(d[0]);
    var csv = [head.join(',')].concat(d.map(function (r) {
      return head.map(function (k) {
        var v = r[k] == null ? '' : String(r[k]);
        return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
      }).join(',');
    })).join('\n');
    var b = new Blob([csv], { type: 'text/csv' }), u = URL.createObjectURL(b);
    var a = document.createElement('a');
    a.href = u; a.download = 'nj-parcel-sheet-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(u);
  };

  window.dbExportPrint = function () {
    var d = exportRows();
    var w = window.open('', '_blank');
    if (!w) { toast('Allow popups to print'); return; }
    var head = ['Address', 'Town', 'Block', 'Lot', 'PAMS_PIN', 'Assessed', 'Annual_Tax',
                'Town_Ratio_Pct', 'Supported_Assessment', 'Ch123_Upper_Limit', 'Appeal_Indicated'];
    w.document.write('<html><head><title>NJ parcel sheet</title><style>' +
      'body{font-family:system-ui,sans-serif;padding:28px;color:#1a1a2e}' +
      'h1{font-size:19px;margin:0 0 4px}.sub{font-size:12px;color:#666;margin-bottom:18px}' +
      'table{width:100%;border-collapse:collapse;font-size:11px}' +
      'th{background:#0e2248;color:#fff;padding:7px;text-align:left}' +
      'td{padding:6px 7px;border-bottom:1px solid #ddd}' +
      'tr:nth-child(even) td{background:#f7f8fa}' +
      '.y{color:#c0392b;font-weight:700}' +
      '.f{margin-top:18px;font-size:10.5px;color:#666;line-height:1.6}' +
      '</style></head><body>' +
      '<h1>New Jersey parcel sheet</h1>' +
      '<div class="sub">Prepared ' + new Date().toLocaleDateString() + ' for ' + esc(plUser.email || '') +
      ' via njpropertytaxrelief.com</div>' +
      '<table><thead><tr>' + head.map(function (h) { return '<th>' + h.replace(/_/g, ' ') + '</th>'; }).join('') +
      '</tr></thead><tbody>' +
      d.map(function (r) {
        return '<tr>' + head.map(function (h) {
          var v = r[h] == null ? '' : r[h];
          if (typeof v === 'number' && /Assess|Tax|Limit|Value/.test(h)) v = '$' + v.toLocaleString();
          return '<td' + (h === 'Appeal_Indicated' && v === 'YES' ? ' class="y"' : '') + '>' + v + '</td>';
        }).join('') + '</tr>';
      }).join('') +
      '</tbody></table>' +
      '<div class="f">Figures drawn from the NJ Office of GIS parcel layer joined to Division of Taxation MOD-IV records, ' +
      'and the NJ Division of Taxation Table of Equalized Valuations. Chapter 123 upper limit is the supported assessment ' +
      'times 1.15. Estimates only; verify against the municipal record before filing. ' +
      'Prepared by John Scafide, Licensed NJ Real Estate Agent #2079591, The McKenty Team at Opus Elite Real Estate.</div>' +
      '</body></html>');
    w.document.close();
    setTimeout(function () { w.print(); }, 400);
  };


  // ══════════════════════════════════════════════
  // STREET VIEW
  // The Static API takes a plain address, so no coordinates needed and no
  // schema change. Images are requested live from Google every time. They are
  // never downloaded, cached or re-hosted, which is what Google's terms require
  // and what keeps this clean if the report is ever exported.
  // ══════════════════════════════════════════════
  var GMAPS_KEY = 'AIzaSyCZBo_mj5WXyR-Bsb5yHdekxAxauTYNmlU';

  function streetImg(r, w, h) {
    var loc = [r.address, r.town, 'NJ', r.zip].filter(Boolean).join(', ');
    return 'https://maps.googleapis.com/maps/api/streetview?size=' + w + 'x' + h +
           '&location=' + encodeURIComponent(loc) +
           '&fov=76&pitch=6&source=outdoor&key=' + GMAPS_KEY;
  }

  // ══════════════════════════════════════════════
  // SR1A  ·  verified sales ratios
  // ══════════════════════════════════════════════
  var sr1a = null;
  function loadSR1A() {
    if (sr1a) return Promise.resolve();
    return xfetch('/property/sr1a-ratios.json', 9000).then(function (r) { return r.json(); })
      .then(function (j) { sr1a = (j && j.districts) || {}; }).catch(function () { sr1a = {}; });
  }
  function sr1aFor(r) {
    if (!sr1a) return null;
    var d = String(r.pams_pin || '').slice(0, 4);
    var row = d && sr1a[d];
    return (row && row.ratio && row.n >= 10) ? row : null;
  }

  // Market value from the state's verified sales, falling back to the
  // published ratio. This is the number every other figure hangs off.
  function marketValue(r) {
    var s = sr1aFor(r);
    if (s && r.assessed) return { v: r.assessed / s.ratio, ratio: s.ratio, n: s.n, src: 'verified' };
    var R = ratioFor(r.town, r.county);
    if (R && r.assessed) return { v: r.assessed / R.ratio, ratio: R.ratio, n: null, src: 'published' };
    if (r.watchdog_value) return { v: r.watchdog_value, ratio: null, n: null, src: 'stored' };
    return null;
  }

  // An appeal test needs a market value that did NOT come from the assessment.
  // Dividing the assessment by the town ratio and then multiplying it back is
  // circular: the supported assessment always equals the assessment and no
  // case can ever fire. So we only test when there is an independent anchor.
  //
  //   A. watchdog_value  the comps based estimate saved from the lookup page
  //   B. median price per square foot in town, applied to this home's size
  //
  // With neither, we say so rather than showing a number that means nothing.
  function chapter123(r) {
    var m = marketValue(r);
    if (!m || !r.assessed) return null;

    var indep = null, basis = null;
    if (r.watchdog_value && Math.abs(r.watchdog_value - m.v) / m.v > 0.001) {
      indep = +r.watchdog_value; basis = 'comparable sales from the full record';
    } else {
      var s = sr1aFor(r);
      if (s && s.ppsf && r.living_sqft) {
        indep = s.ppsf * r.living_sqft;
        basis = 'median price per square foot in this town';
      }
    }

    var eff = (r.last_year_tax && r.assessed) ? r.last_year_tax / r.assessed : null;
    var out = {
      market: m.v, ratio: m.ratio, src: m.src, n: m.n,
      testable: false, hasCase: false, indep: indep, basis: basis
    };
    if (indep == null) return out;

    var fair = indep * m.ratio;
    var limit = fair * 1.15;
    out.testable = true;
    out.fair = fair;
    out.limit = limit;
    out.over = r.assessed - limit;
    out.hasCase = out.over > 0;
    out.saving = (out.hasCase && eff) ? (r.assessed - fair) * eff : null;
    return out;
  }

  // ══════════════════════════════════════════════
  // PROPERTY DETAIL FROM SR1A
  //
  // MOD-IV publishes no square footage and New Jersey publishes no bedroom or
  // bathroom counts anywhere in the public record. Those live in the MLS.
  // What the SR1A file does carry, on any parcel that has sold, is living
  // space and year built, so we look the property up by block and lot and use
  // what genuinely exists rather than inventing the rest.
  // ══════════════════════════════════════════════
  var salesCache = {};

  function countySales(county) {
    var k = String(county || '').toLowerCase().replace(/\s+/g, '-');
    if (!k) return Promise.resolve([]);
    if (salesCache[k]) return Promise.resolve(salesCache[k]);
    return xfetch('/property/sales-' + k + '.json', 20000)
      .then(function (r) { return r.json(); })
      .then(function (j) { salesCache[k] = (j && j.sales) || []; return salesCache[k]; })
      .catch(function () { salesCache[k] = []; return []; });
  }

  function hydrateDetails() {
    var counties = {};
    rows.forEach(function (r) { if (r.county) counties[r.county] = 1; });
    return Promise.all(Object.keys(counties).map(countySales)).then(function () {
      rows.forEach(function (r) {
        var all = salesCache[String(r.county || '').toLowerCase().replace(/\s+/g, '-')];
        if (!all) return;
        var d = String(r.pams_pin || '').slice(0, 4);
        var blk = String(r.block || '').replace(/^0+/, '');
        var lot = String(r.lot || '').replace(/^0+/, '');
        if (!d || !blk) return;
        var hit = null;
        for (var i = 0; i < all.length; i++) {
          var s = all[i];
          if (s.d !== d) continue;
          if (String(s.b || '').replace(/^0+/, '') !== blk) continue;
          if (String(s.l || '').replace(/^0+/, '') !== lot) continue;
          if (!hit || s.y > hit.y) hit = s;
        }
        if (hit) {
          r._sqft = hit.sf || null;
          r._built = hit.yb || null;
          r._lastSale = hit.p || null;
          r._lastSaleYear = hit.y || null;
        }
      });
    });
  }

  // A short factual line. Only what the public record actually holds.
  function detailLine(r) {
    var bits = [];
    if (r._sqft) bits.push('<b>' + r._sqft.toLocaleString() + '</b> sq ft');
    if (r._built) bits.push('built <b>' + r._built + '</b>');
    if (r._lastSale && r._lastSaleYear)
      bits.push('last sold <b>' + money(r._lastSale) + '</b> in ' + r._lastSaleYear);
    return bits.length ? '<div class="pr-facts">' + bits.join('<span class="dot">&middot;</span>') + '</div>' : '';
  }

  function addedOn(r) {
    if (!r.created_at) return '';
    var d = new Date(r.created_at);
    if (isNaN(d)) return '';
    return (r.kind === 'home' ? 'Claimed ' : 'Added ') +
      d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  // ══════════════════════════════════════════════
  // SORTING
  // ══════════════════════════════════════════════
  var sortBy = 'added';
  var SORTS = {
    added:     { label: 'Recently added',   fn: function (a, b) { return new Date(b.created_at || 0) - new Date(a.created_at || 0); } },
    valHigh:   { label: 'Highest value',    fn: function (a, b) { return mv(b) - mv(a); } },
    valLow:    { label: 'Lowest value',     fn: function (a, b) { return mv(a) - mv(b); } },
    taxHigh:   { label: 'Highest taxes',    fn: function (a, b) { return (+b.last_year_tax || 0) - (+a.last_year_tax || 0); } },
    taxLow:    { label: 'Lowest taxes',     fn: function (a, b) { return (+a.last_year_tax || 0) - (+b.last_year_tax || 0); } }
  };
  function mv(r) { var m = marketValue(r); return m ? m.v : 0; }

  window.dbSort = function (k) {
    sortBy = k;
    render();
  };

  function sortControl() {
    return '<div class="sortbar">' +
      '<label>Sort</label>' +
      '<select onchange="dbSort(this.value)">' +
        Object.keys(SORTS).map(function (k) {
          return '<option value="' + k + '"' + (k === sortBy ? ' selected' : '') + '>' +
            SORTS[k].label + '</option>';
        }).join('') +
      '</select>' +
      (picked.length
        ? '<span class="cmp-count">' + picked.length + ' selected' +
          '<button onclick="dbCompareSel()"' + (picked.length < 2 ? ' disabled' : '') + '>Compare</button>' +
          '<button class="clr" onclick="dbClearPick()">Clear</button></span>'
        : '<span class="cmp-hint">Tick up to three properties to compare them</span>') +
    '</div>';
  }

  // ══════════════════════════════════════════════
  // COMPARE
  // ══════════════════════════════════════════════
  var picked = [];

  window.dbPick = function (id, box) {
    var i = picked.indexOf(id);
    if (i > -1) picked.splice(i, 1);
    else {
      if (picked.length >= 3) {
        if (box) box.checked = false;
        toast('Three at a time is the limit');
        return;
      }
      picked.push(id);
    }
    render();
  };
  window.dbClearPick = function () { picked = []; render(); };

  window.dbCompareSel = function () {
    var sel = picked.map(function (id) {
      return rows.filter(function (r) { return r.id === id; })[0];
    }).filter(Boolean);
    if (sel.length < 2) return;

    function row(label, fn, note) {
      var vals = sel.map(fn);
      var nums = vals.map(function (v) { return typeof v === 'number' ? v : null; });
      var real = nums.filter(function (v) { return v != null; });
      var best = null;
      if (real.length === sel.length && note) {
        best = note === 'low' ? Math.min.apply(null, real) : Math.max.apply(null, real);
      }
      return '<tr><th>' + label + '</th>' +
        vals.map(function (v, i) {
          var txt = (v == null || v === '') ? '<span class="na">not on file</span>'
                  : (typeof v === 'number' ? money(v) : v);
          var mark = (best != null && nums[i] === best) ? ' class="win"' : '';
          return '<td' + mark + '>' + txt + '</td>';
        }).join('') + '</tr>';
    }

    plModalNote('Comparing ' + sel.length + ' properties',
      '<div class="cw"><table class="cmp3"><thead><tr><th></th>' +
        sel.map(function (r) {
          return '<td class="ch"><img src="' + streetImg(r, 260, 150) + '" alt="" ' +
            'onerror="this.style.display=\'none\'"><b>' + esc(r.address) + '</b>' +
            '<span>' + esc(r.town || '') + '</span></td>';
        }).join('') +
      '</tr></thead><tbody>' +
        row('Assessed', function (r) { return +r.assessed || null; }) +
        row('Annual tax', function (r) { return +r.last_year_tax || null; }, 'low') +
        row('Market value', function (r) { var m = marketValue(r); return m ? Math.round(m.v) : null; }, 'high') +
        row('Effective rate', function (r) { return r.effective_rate ? (+r.effective_rate).toFixed(2) + '%' : null; }) +
        row('Town ratio', function (r) { var s = sr1aFor(r); return s ? (s.ratio * 100).toFixed(1) + '%' : null; }) +
        row('Square feet', function (r) { return r._sqft ? r._sqft.toLocaleString() : null; }) +
        row('Year built', function (r) { return r._built || null; }) +
        row('Median sale in town', function (r) { var s = sr1aFor(r); return s && s.medPrice ? s.medPrice : null; }) +
        row('Price per sq ft here', function (r) { var s = sr1aFor(r); return s && s.ppsf ? '$' + s.ppsf : null; }) +
        row('Tax per $1,000 of value', function (r) {
          var m = marketValue(r);
          return (m && r.last_year_tax) ? Math.round(r.last_year_tax / m.v * 1000) : null;
        }, 'low') +
        row('Appeal case', function (r) {
          var c = chapter123(r);
          if (!c || !c.testable) return 'needs full record';
          return c.hasCase ? 'yes, over by ' + money(c.over) : 'no';
        }) +
      '</tbody></table></div>' +
      '<p class="cw-note">Highlighted cells are the better number in that row. Bedroom and bathroom counts are ' +
      'not published anywhere in New Jersey\u2019s public property records, so they are not shown. Square footage ' +
      'comes from the state sales file and only exists for properties that have sold.</p>');
  };

  // ══════════════════════════════════════════════
  // PER PROPERTY MENU
  // ══════════════════════════════════════════════
  window.dbMenu = function (id, ev) {
    ev.stopPropagation();
    var open = document.querySelector('.pm.open');
    if (open) open.classList.remove('open');
    var m = document.getElementById('pm-' + id);
    if (m && (!open || open !== m)) m.classList.add('open');
  };
  document.addEventListener('click', function () {
    var o = document.querySelector('.pm.open');
    if (o) o.classList.remove('open');
  });

  function propMenu(r) {
    var q = encodeURIComponent(r.address + ', ' + (r.town || '') + ', NJ ' + (r.zip || ''));
    return '<div class="pm-wrap">' +
      '<button class="pm-btn" onclick="dbMenu(\'' + r.id + '\', event)" aria-label="More"><i class="fas fa-ellipsis"></i></button>' +
      '<div class="pm" id="pm-' + r.id + '">' +
        '<a href="/property/?address=' + q + '"><i class="fas fa-file-lines"></i> Open full record</a>' +
        '<button onclick="dbShare(\'' + r.id + '\')"><i class="fas fa-share-nodes"></i> Share</button>' +
        '<button onclick="dbCopy(\'' + r.id + '\')"><i class="fas fa-link"></i> Copy link</button>' +
        '<button onclick="dbAskAbout(\'' + esc(r.address).replace(/'/g, '') + '\')"><i class="fas fa-envelope"></i> Email an agent</button>' +
        '<button onclick="dbDirections(\'' + r.id + '\')"><i class="fas fa-diamond-turn-right"></i> Directions</button>' +
        '<hr>' +
        (r.kind === 'home' && r.verify_level !== 'mail'
          ? '<button onclick="dbVerify(\'' + r.pams_pin + '\',\'' + esc(r.address).replace(/'/g, '') + '\')"><i class="fas fa-badge-check"></i> Verify ownership</button>'
          : '') +
        '<button class="rm" onclick="dbRemove(\'' + r.id + '\')"><i class="fas fa-trash"></i> Remove</button>' +
      '</div></div>';
  }

  function byId(id) { return rows.filter(function (r) { return r.id === id; })[0]; }
  function propUrl(r) {
    return 'https://njpropertytaxrelief.com/property/?address=' +
      encodeURIComponent(r.address + ', ' + (r.town || '') + ', NJ ' + (r.zip || ''));
  }
  window.dbShare = function (id) {
    var r = byId(id); if (!r) return;
    if (navigator.share) navigator.share({ title: r.address, url: propUrl(r) }).catch(function () {});
    else window.dbCopy(id);
  };
  window.dbCopy = function (id) {
    var r = byId(id); if (!r) return;
    var u = propUrl(r);
    if (navigator.clipboard) navigator.clipboard.writeText(u).then(function () { toast('Link copied'); })
      .catch(function () { window.prompt('Copy this link:', u); });
    else window.prompt('Copy this link:', u);
  };
  window.dbDirections = function (id) {
    var r = byId(id); if (!r) return;
    window.open('https://www.google.com/maps/dir/?api=1&destination=' +
      encodeURIComponent(r.address + ', ' + (r.town || '') + ', NJ'), '_blank', 'noopener');
  };

  // ══════════════════════════════════════════════
  // ACCESS TIERS
  //   free  · signed in, sees their own numbers
  //   pro   · paid, sees the analysis and the exports
  // Gating is presentational. Everything here is public record either way,
  // so nothing sensitive hides behind it.
  // ══════════════════════════════════════════════
  function isPro() { return !!(profile && profile.plan === 'pro'); }

  function locked(label, why, html) {
    if (isPro()) return html;
    return '<div class="lk">' +
      '<div class="lk-in">' + html + '</div>' +
      '<div class="lk-over">' +
        '<div class="lk-t"><i class="fas fa-lock"></i> ' + esc(label) + '</div>' +
        '<div class="lk-w">' + why + '</div>' +
        '<button class="lk-b" onclick="dbUpgrade()">See what Pro includes</button>' +
      '</div></div>';
  }

  window.dbUpgrade = function () {
    plModalNote('Watchdog Pro',
      '<p>Everything on this page stays free. Pro is for the work that comes after: the analysis, ' +
      'the comparisons across towns, and the exports you can hand to an attorney or a client.</p>' +
      '<div class="pro-list">' +
        '<div><b>Chapter 123 screening on every property</b><span>The supported assessment, the statutory limit, ' +
        'and the dollar figure you would be arguing for.</span></div>' +
        '<div><b>Verified sales comparables</b><span>Arm\u2019s length sales the state itself confirmed, with square ' +
        'footage and price per square foot.</span></div>' +
        '<div><b>Town by town comparison</b><span>Effective rates measured from live parcel data across all 565 ' +
        'municipalities.</span></div>' +
        '<div><b>CSV and print exports</b><span>Block, lot, PAMS PIN, ratio and limits in the format a county board ' +
        'expects.</span></div>' +
        '<div><b>Unlimited saved properties</b><span>Portfolio totals, blended rates, and drift tracking across all ' +
        'of them.</span></div>' +
      '</div>' +
      '<p style="font-size:13.5px;color:#8a93a6;">Not open yet. Tell me you want it and We will let you know the day ' +
      'it is, at the price early users get.</p>' +
      '<button class="db-btn" onclick="dbWantPro()">Tell us we want this</button>');
  };

  window.dbWantPro = function () {
    send({
      name: name(), email: plUser.email, phone: (profile && profile.phone) || 'Not provided',
      topic: '\u2b50 PRO INTEREST \u2b50 dashboard upgrade request',
      tenure: 'Homeowner', lead_type: 'Homeowner', finance: 'Not provided',
      town: (rows[0] && rows[0].town) || 'Not provided',
      address: (rows[0] && rows[0].address) || 'Not provided',
      message: ['Wants to know when Watchdog Pro opens.',
                'Properties saved: ' + rows.length,
                'Source: /property/dashboard.html'].join('\n')
    });
    plModalNote('Noted', '<p>We will let you know. Nothing changes on your account in the meantime.</p>' +
      '<button class="db-btn" onclick="plCloseNote()">Close</button>');
  };

  // ══════════════════════════════════════════════
  // THE BRIEF
  // A paragraph that actually says something, instead of a row of tiles.
  // This is the first thing anyone reads, so it has to be worth reading.
  // ══════════════════════════════════════════════
  function brief() {
    if (!rows.length) return '';
    var homes = rows.filter(function (r) { return r.kind === 'home'; });
    var lead = homes[0] || rows[0];
    var c = chapter123(lead);
    var tot = rows.reduce(function (a, r) { return a + (+r.last_year_tax || 0); }, 0);
    var cases = rows.filter(function (r) { var x = chapter123(r); return x && x.hasCase; });

    var s = [];
    s.push('You are tracking <b>' + rows.length + ' propert' + (rows.length === 1 ? 'y' : 'ies') + '</b>');
    if (tot) s.push(' carrying <b>' + money(tot) + '</b> a year in property tax between them');
    s.push('. ');

    if (c) {
      s.push('<b>' + esc(lead.address) + '</b> is assessed at ' + money(lead.assessed) + '. ');
      s.push(c.src === 'verified'
        ? 'Sales in ' + esc(lead.town) + ' that New Jersey verified as genuine put assessments there at ' +
          (c.ratio * 100).toFixed(1) + '% of market, which values it around <b>' + money(rnd(c.market)) + '</b>. '
        : 'At the published ' + (c.ratio * 100).toFixed(1) + '% ratio that implies about <b>' +
          money(rnd(c.market)) + '</b>. ');
      s.push(!c.testable
        ? '<a href="/property/?address=' + encodeURIComponent(lead.address + ', ' + (lead.town || '') + ', NJ') +
          '">Open the full record</a> to test it against comparable sales, which is what an appeal turns on.'
        : c.hasCase
        ? 'That puts the assessment <b class="neg">' + money(c.over) + ' above</b> the Chapter 123 limit' +
          (c.saving ? ', worth roughly <b>' + money(c.saving) + ' a year</b> if it came down' : '') + '.'
        : 'Against ' + c.basis + ' it sits inside the cushion the state allows, so there is no appeal to make here.');
    }

    var d = deadline();
    if (cases.length) {
      s.push(cases.length === 1
        ? ' <span class="urgent">One of your properties looks over-assessed, and the filing deadline is ' +
          d.days + ' days out.</span>'
        : ' <span class="urgent">' + cases.length + ' of your properties look over-assessed, and the filing ' +
          'deadline is ' + d.days + ' days out.</span>');
    }
    return '<p class="brief">' + s.join('') + '</p>';
  }

  function rnd(n) { return Math.round(n / 1000) * 1000; }
  function deadline() {
    var now = new Date(), apr = new Date(now.getFullYear(), 3, 1);
    if (now > apr) apr = new Date(now.getFullYear() + 1, 3, 1);
    return { date: apr, days: Math.ceil((apr - now) / 864e5) };
  }

  // ══════════════════════════════════════════════
  // PROPERTY  ·  simple view
  // The numbers, in a sentence, then a hairline table. No card, no shadow.
  // ══════════════════════════════════════════════
  function propertyBlock(r) {
    var c = chapter123(r);
    var s = sr1aFor(r);
    var q = encodeURIComponent(r.address + ', ' + (r.town || '') + ', NJ ' + (r.zip || ''));
    var v = VERIFY[r.verify_level || 'self'];

    var tone = (c && c.hasCase) ? 'hot' : (c && c.testable) ? 'ok' : 'neutral';

    var head =
      '<div class="pr-top">' +
        '<div class="pr-shotwrap">' +
          '<div class="pr-shot">' +
            '<img src="' + streetImg(r, 400, 260) + '" alt="' + esc(r.address) + '" loading="lazy" ' +
              'onerror="this.parentNode.classList.add(\'noimg\')">' +
            (r.kind === 'home' ? '<span class="pr-kind home">Your home</span>'
                               : '<span class="pr-kind">Watching</span>') +
          '</div>' +
          '<div class="pr-when">' + esc(addedOn(r)) + '</div>' +
        '</div>' +
        '<div class="pr-id">' +
          '<div class="pr-titlerow">' +
            '<label class="pick"><input type="checkbox"' + (picked.indexOf(r.id) > -1 ? ' checked' : '') +
              ' onchange="dbPick(\'' + r.id + '\', this)"><span>Compare</span></label>' +
            propMenu(r) +
          '</div>' +
          '<h3>' + esc(r.address) + '</h3>' +
          '<div class="pr-sub">' + esc(r.town || '') +
            (r.county ? ', ' + esc(r.county) + ' County' : '') +
            (r.block ? '  \u00b7  Block ' + esc(r.block) + ' Lot ' + esc(r.lot || '') : '') +
          '</div>' +
          detailLine(r) +
          '<div class="pr-tags">' +
            '<span class="tg ' + v.cls + '"><i class="fas ' +
              (r.verify_level === 'mail' ? 'fa-circle-check' : 'fa-circle-half-stroke') + '"></i>' +
              v.label + '</span>' +
            (c && c.hasCase
              ? '<span class="tg hot"><i class="fas fa-scale-unbalanced-flip"></i>Over the limit by ' +
                money(c.over) + '</span>'
              : c && c.testable
              ? '<span class="tg ok"><i class="fas fa-circle-check"></i>Within Chapter 123</span>'
              : '') +
          '</div>' +
        '</div>' +
      '</div>';

    var line = c
      ? '<p class="pr-line">Assessed <b>' + money(r.assessed) + '</b>, taxed <b>' +
        money(r.last_year_tax || 0) + '</b> a year. ' +
        (c.src === 'verified'
          ? 'Against <b>' + c.n + '</b> verified sales in this town the market value works out to <b>' +
            money(rnd(c.market)) + '</b>.'
          : 'The published ratio implies <b>' + money(rnd(c.market)) + '</b>.') +
        (s && s.ppsf ? ' Homes here trade around <b>$' + s.ppsf + ' a square foot</b>.' : '') + '</p>'
      : '';

    var figs =
      '<dl class="fig">' +
        f('Assessed', money(r.assessed || 0)) +
        f('Annual tax', money(r.last_year_tax || 0)) +
        f('Effective rate', r.effective_rate ? (+r.effective_rate).toFixed(2) + '%' : '-') +
        (c ? f('Market value', money(rnd(c.market))) : '') +
        (s ? f('Town ratio', (s.ratio * 100).toFixed(1) + '%', s.n + ' verified sales') : '') +
        (s && s.medPrice ? f('Median sale here', money(s.medPrice)) : '') +
      '</dl>';

    var appeal = '';
    if (c && c.testable) {
      appeal = locked('Chapter 123 analysis',
        'The supported assessment, the statutory limit, and what an appeal would actually be worth.',
        '<dl class="fig tight">' +
          f('Supported assessment', money(c.fair), 'from ' + c.basis) +
          f('Chapter 123 limit', money(c.limit)) +
          f(c.hasCase ? 'Over by' : 'Under by', money(Math.abs(c.over)), null, c.hasCase ? 'neg' : 'pos') +
          (c.saving ? f('If reduced', money(c.saving) + '/yr') : '') +
        '</dl>');
    } else if (c) {
      appeal = '<p class="untest">An appeal is argued against comparable sales, not against the ratio, so this ' +
        'needs the full record to test properly. ' +
        '<a href="/property/?address=' + q + '">Open it</a> and the analysis saves back here.</p>';
    }

    return '<article class="pr ' + tone + (picked.indexOf(r.id) > -1 ? ' picked' : '') + '">' +
      head + line + figs + appeal +
      '<div class="pr-acts">' +
        '<a href="/property/?address=' + q + '">Open full record</a>' +
        '<button onclick="dbAskAbout(\'' + esc(r.address).replace(/'/g, '') + '\')">Contact agent</button>' +
      '</div></article>';
  }

  function f(k, v, note, cls) {
    return '<div><dt>' + k + '</dt><dd' + (cls ? ' class="' + cls + '"' : '') + '>' + v +
      (note ? '<em>' + note + '</em>' : '') + '</dd></div>';
  }

  var VERIFY = {
    self: { label: 'unverified', cls: 'no' },
    doc:  { label: 'document on file', cls: 'mid' },
    mail: { label: 'verified owner', cls: 'yes' }
  };

  // ══════════════════════════════════════════════
  // PRO VIEW  ·  one dense table, everything at once
  // Built for someone who already knows what they are looking at and wants
  // to scan twenty properties, not read twenty paragraphs.
  // ══════════════════════════════════════════════
  function proTable() {
    if (!rows.length) return '';
    var body = rows.map(function (r) {
      var c = chapter123(r);
      var s = sr1aFor(r);
      return '<tr' + (c && c.hasCase ? ' class="hot"' : '') + '>' +
        '<td class="a">' + esc(r.address) + '</td>' +
        '<td>' + esc(r.town || '') + '</td>' +
        '<td>' + esc(r.block || '') + '/' + esc(r.lot || '') + '</td>' +
        '<td class="n">' + (r.assessed ? r.assessed.toLocaleString() : '-') + '</td>' +
        '<td class="n">' + (r.last_year_tax ? Math.round(r.last_year_tax).toLocaleString() : '-') + '</td>' +
        '<td class="n">' + (r.effective_rate ? (+r.effective_rate).toFixed(2) : '-') + '</td>' +
        '<td class="n">' + (s ? (s.ratio * 100).toFixed(1) : (c ? (c.ratio * 100).toFixed(1) : '-')) + '</td>' +
        '<td class="n">' + (s ? s.n : '-') + '</td>' +
        '<td class="n">' + (c ? rnd(c.market).toLocaleString() : '-') + '</td>' +
        '<td class="n">' + (c && c.testable ? Math.round(c.fair).toLocaleString() : '-') + '</td>' +
        '<td class="n">' + (c && c.testable ? Math.round(c.limit).toLocaleString() : '-') + '</td>' +
        '<td class="n ' + (c && c.hasCase ? 'neg' : '') + '">' + (c && c.testable ? Math.round(c.over).toLocaleString() : '-') + '</td>' +
        '<td class="n">' + (c && c.saving ? Math.round(c.saving).toLocaleString() : '-') + '</td>' +
        '<td>' + (r.verify_level || 'self') + '</td>' +
      '</tr>';
    }).join('');

    return '<div class="pro-wrap"><table class="pro"><thead><tr>' +
      ['Address','Town','Blk/Lot','Assessed','Tax','Eff%','Ratio%','n','Market','Supported','Ch123 limit','Over','Saving/yr','Verified']
        .map(function (h, i) { return '<th' + (i >= 3 && i <= 12 ? ' class="n"' : '') + '>' + h + '</th>'; }).join('') +
      '</tr></thead><tbody>' + body + '</tbody></table></div>' +
      '<p class="pro-note">Ratio is measured from state verified arm\u2019s length sales where available, ' +
      'otherwise the published Director\u2019s Ratio. n is the number of verified sales behind it. ' +
      'Supported assessment is market value times the ratio; the Chapter 123 limit adds the statutory 15 percent.</p>';
  }

  // ── shared card shell ──
  // Named toolCard, not card. The dashboard already has a card(r) that renders
  // saved property tiles, and shadowing it silently replaced every property
  // card with a tool shell.
  // A section, not a card. A hairline and a small label, then the content.
  function toolCard(title, icon, body) {
    return '<section class="sec"><h4><i class="fas ' + icon + '"></i>' + title + '</h4>' + body + '</section>';
  }

  var view = 'simple';

  window.dbView = function (v) {
    view = v;
    document.body.classList.toggle('pro-view', v === 'pro');
    ['simple', 'pro'].forEach(function (k) {
      var b = document.querySelector('.vw[data-v="' + k + '"]');
      if (b) b.classList.toggle('on', k === v);
    });
    render();
  };

  function render() {
    var homes = rows.filter(function (r) { return r.kind === 'home'; });
    var watch = rows.filter(function (r) { return r.kind === 'watch'; });
    var cases = rows.filter(function (r) { var c = chapter123(r); return c && c.hasCase; });
    var d = deadline();

    el('db-brief').innerHTML = rows.length ? brief() : '';

    // A thin status line, not a row of tiles.
    el('db-line').innerHTML = rows.length
      ? '<div class="rail">' +
          rl(rows.length, 'tracked') +
          rl(money(rows.reduce(function (a, r) { return a + (+r.last_year_tax || 0); }, 0)), 'annual tax') +
          rl(cases.length, cases.length === 1 ? 'possible appeal' : 'possible appeals', cases.length ? 'neg' : '') +
          rl(d.days, 'days to file', d.days <= 75 ? 'neg' : '') +
        '</div>'
      : '';

    if (!rows.length) {
      el('db-body').innerHTML =
        '<div class="blank"><h3>Nothing saved yet</h3>' +
        '<p>Look up any New Jersey address and claim it as your home, or add it to a watchlist. ' +
        'Everything on this page is built from the properties you save.</p>' +
        '<a class="db-btn" href="/property/">Look up an address</a></div>';
      return;
    }

    if (view === 'pro') {
      el('db-body').innerHTML =
        locked('The full table',
          'Every property with its ratio, supported assessment, statutory limit and appeal value, in one scannable grid.',
          proTable()) +
        toolsHTML();
      afterTools();
      return;
    }

    var srt = SORTS[sortBy].fn;
    homes = homes.slice().sort(srt);
    watch = watch.slice().sort(srt);

    el('db-body').innerHTML =
      sortControl() +
      (homes.length
        ? '<section class="band own"><h2 class="grp">Your home' + (homes.length > 1 ? 's' : '') + '</h2>' +
          homes.map(propertyBlock).join('') + '</section>' : '') +
      (watch.length
        ? '<section class="band"><h2 class="grp">Watchlist</h2>' +
          watch.map(propertyBlock).join('') + '</section>' : '') +
      toolsHTML();
    afterTools();
  }

  function rl(v, l, cls) {
    return '<span class="' + (cls || '') + '"><b>' + v + '</b>' + l + '</span>';
  }

  function toolsHTML() {
    var free = [toolDrift(), toolRebates()].filter(Boolean).join('');
    var pro = [toolPercentile(), toolPortfolio(), toolCompare(), toolExport()].filter(Boolean).join('');
    return free +
      (pro ? locked('Analysis tools',
        'Where you sit in your town, portfolio totals, town comparisons and the exports.', pro) : '') +
      toolCost();
  }

  function afterTools() {
    if (el('tc-total')) window.dbCost();
    if (isPro()) paintPercentile();
  }

  window.dbPanel = function (p) {
    ['main','profile'].forEach(function (k) {
      var b = document.querySelector('.pn[data-p="' + k + '"]');
      if (b) b.classList.toggle('on', k === p);
      var e = el(k === 'main' ? 'db-panel-main' : 'db-' + k);
      if (e) e.style.display = (k === p) ? '' : 'none';
    });
  };

  window.dbRemove = function (id) {
    if (!confirm('Remove this property from your list?')) return;
    sb.from('saved_properties').delete().eq('id', id).then(paint);
  };

  // ── ownership verification ──
  window.dbVerify = function (pin, address) {
    plModalNote('Verify you own this home',
      '<p>New Jersey redacts owner names from the public property file under Daniel\'s Law, so nothing can confirm ownership ' +
      'automatically from public records. The reliable way is the old fashioned one.</p>' +
      '<p><b>I mail a six character code to ' + esc(address) + '.</b> You type it in here. That proves someone receiving mail ' +
      'at the property asked for it, which is the same standard a county board would accept.</p>' +
      '<div class="pl-form" style="grid-template-columns:1fr;">' +
        '<button onclick="dbRequestCode(\'' + pin + '\',\'' + esc(address).replace(/\'/g, "") + '\')">Mail me a code</button>' +
      '</div>' +
      '<div class="auth-or"><span>already have one</span></div>' +
      '<div class="pl-form" style="grid-template-columns:1fr;">' +
        '<input id="vc-code" type="text" placeholder="Six character code" maxlength="8" style="text-transform:uppercase;letter-spacing:.15em;">' +
        '<button onclick="dbRedeem(\'' + pin + '\')">Verify</button>' +
      '</div>' +
      '<div class="auth-fine">In a hurry? Email a copy of your tax bill or deed and we will mark it verified by hand.</div>');
  };

  window.dbRequestCode = function (pin, address) {
    sb.rpc('request_verify_code', { p_pin: pin, p_address: address }).then(function (r) {
      if (r.error) { toast('Could not request a code'); return; }
      plModalNote('Code on the way',
        '<p>We will post a code to <b>' + esc(address) + '</b>. Allow a few days for it to arrive, then come back here and enter it.</p>' +
        '<p style="font-size:13.5px;color:#8a93a6;">The code goes to the property address, not to your email, because that is the whole point.</p>' +
        '<button class="plm-rbtn" onclick="plCloseNote()">Got it</button>');
    });
  };

  window.dbRedeem = function (pin) {
    var c = el('vc-code'), v = c ? c.value.trim().toUpperCase() : '';
    if (!v) { toast('Enter the code'); return; }
    sb.rpc('redeem_verify_code', { p_pin: pin, p_code: v }).then(function (r) {
      var d = r.data || {};
      if (r.error || !d.ok) {
        toast(d.reason === 'wrong code' ? 'That code did not match' : (d.reason || 'Could not verify'));
        return;
      }
      plModalNote('Verified', '<p>This home is now marked as verified. Thanks for confirming.</p>' +
        '<button class="plm-rbtn" onclick="plCloseNote()">Close</button>');
      paint();
    });
  };

  // ── profile ──
  function sel(id, label, opts, val) {
    return '<div class="db-field"><label>' + label + '</label><select id="' + id + '">' +
      '<option value="">Prefer not to say</option>' +
      opts.map(function (o) {
        return '<option value="' + o[0] + '"' + (val === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
      }).join('') + '</select></div>';
  }

  function profileForm() {
    var ints = profile.interests || [];
    function chk(v, l) {
      return '<label class="db-chk"><input type="checkbox" value="' + v + '"' +
        (ints.indexOf(v) > -1 ? ' checked' : '') + '> ' + l + '</label>';
    }
    return '<div class="db-card">' +
      '<h3 style="margin:0 0 6px;font-size:18px;color:#0e2248;">About you</h3>' +
      '<p style="font-size:14px;color:#5a6070;line-height:1.65;margin:0 0 18px;">' +
        'All optional, and it only shapes what I send you. I do not sell or share any of this, ' +
        'and you can clear it any time.</p>' +
      '<div class="db-field"><label>Phone, if you would rather I call</label>' +
        '<input id="pf-phone" type="tel" value="' + esc(profile.phone || '') + '" placeholder="Optional"></div>' +
      sel('pf-owner', 'Which are you?', [['own','I own my home'],['rent','I rent'],
          ['looking','Looking to buy'],['agent','I am an agent or investor']], profile.owner_status) +
      sel('pf-age', 'Age band, this decides which rebates apply to you',
          [['under35','Under 35'],['35to49','35 to 49'],['50to64','50 to 64'],['65plus','65 or older']], profile.age_band) +
      sel('pf-house', 'People in the household',
          [['1','Just me'],['2','Two'],['3','Three'],['4','Four'],['5','Five or more']],
          profile.household_size ? String(profile.household_size) : '') +
      sel('pf-move', 'Thinking about moving?',
          [['asap','As soon as possible'],['3mo','Within 3 months'],['6mo','Within 6 months'],
           ['12mo','Within a year'],['none','Not at all']], profile.move_timeline) +
      '<div class="db-field"><label>What would you like help with?</label>' +
        '<div class="db-chks" id="pf-ints">' +
          chk('appeal', 'Lowering my property tax') +
          chk('rebates', 'ANCHOR and Stay NJ rebates') +
          chk('selling', 'Selling my home') +
          chk('buying', 'Buying a home') +
        '</div></div>' +
      '<label class="db-chk" style="margin:6px 0 16px;"><input type="checkbox" id="pf-optin"' +
        (profile.marketing_optin ? ' checked' : '') + '> Send me occasional updates about deadlines and rebates I qualify for</label>' +
      '<button class="db-btn" onclick="dbSaveProfile()">Save my profile</button>' +
    '</div>';
  }

  window.dbSaveProfile = function () {
    var ints = [];
    document.querySelectorAll('#pf-ints input:checked').forEach(function (c) { ints.push(c.value); });
    var hs = el('pf-house').value;
    sb.from('profiles').update({
      phone: el('pf-phone').value.trim() || null,
      owner_status: el('pf-owner').value || null,
      age_band: el('pf-age').value || null,
      household_size: hs ? parseInt(hs, 10) : null,
      move_timeline: el('pf-move').value || null,
      interests: ints.length ? ints : null,
      marketing_optin: el('pf-optin').checked,
      profile_complete: true
    }).eq('id', plUser.id).then(function (r) {
      if (r.error) { toast('Could not save'); return; }
      toast('Profile saved');
      paint();
    });
  };

  // ── contact ──
  function send(payload) {
    if (typeof emailjs === 'undefined') return;
    emailjs.init({ publicKey: EJS_PUBLIC });
    emailjs.send(EJS_SERVICE, EJS_TMPL, payload).catch(function (e) { console.warn(e); });
  }

  window.dbAsk = function (kind) {
    var list = rows.filter(function (r) { return r.has_appeal_case; })
                   .map(function (r) { return r.address + ', ' + r.town + ' (assessed ' + money(r.assessed || 0) + ')'; });
    send({
      name: name(), email: plUser.email, phone: profile.phone || 'Not provided',
      topic: '\u2b50 DASHBOARD [' + kind.toUpperCase() + '] appeal review request',
      tenure: 'Homeowner', lead_type: 'Homeowner', finance: 'Not provided',
      town: (rows[0] && rows[0].town) || 'Not provided',
      address: (rows[0] && rows[0].address) || 'Not provided',
      message: ['Appeal review requested from the dashboard.', 'Properties flagged:']
        .concat(list).concat(['Source: /property/dashboard.html']).join('\n')
    });
    plModalNote('On it', '<p>An agent will review those and get back to you within one business day.</p>' +
      '<button class="plm-rbtn" onclick="plCloseNote()">Close</button>');
  };

  window.dbAskAbout = function (address) {
    send({
      name: name(), email: plUser.email, phone: profile.phone || 'Not provided',
      topic: '\u2b50 DASHBOARD question about ' + address,
      tenure: 'Homeowner', lead_type: 'Homeowner', finance: 'Not provided',
      town: 'Not provided', address: address,
      message: ['Question from the dashboard about ' + address, 'Source: /property/dashboard.html'].join('\n')
    });
    plModalNote('Message sent', '<p>An agent will get back to you about <b>' + esc(address) + '</b> within one business day.</p>' +
      '<button class="plm-rbtn" onclick="plCloseNote()">Close</button>');
  };

})();
