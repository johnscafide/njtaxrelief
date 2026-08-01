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
      sb.from('profiles').select('*').eq('id', plUser.id).maybeSingle()
    ]).then(function (res) {
      rows = (res[0] && res[0].data) || [];
      profile = (res[1] && res[1].data) || {};
      render();
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
          (hot ? '<button class="tl-btn" onclick="dbAsk(\'appeal\')">Have John look at this</button>' : '') +
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

  // ── shared card shell ──
  // Named toolCard, not card. The dashboard already has a card(r) that renders
  // saved property tiles, and shadowing it silently replaced every property
  // card with a tool shell.
  function toolCard(title, icon, body) {
    return '<div class="tool"><div class="tool-h"><i class="fas ' + icon + '"></i>' + title + '</div>' +
           '<div class="tool-b">' + body + '</div></div>';
  }

  function render() {
    var homes = rows.filter(function (r) { return r.kind === 'home'; });
    var watch = rows.filter(function (r) { return r.kind === 'watch'; });
    var cases = rows.filter(function (r) { return r.has_appeal_case; });
    var totalTax = rows.filter(function (r) { return r.kind === 'home'; })
                       .reduce(function (a, r) { return a + (+r.last_year_tax || 0); }, 0);

    // deadline
    var now = new Date(), apr = new Date(now.getFullYear(), 3, 1);
    if (now > apr) apr = new Date(now.getFullYear() + 1, 3, 1);
    var days = Math.ceil((apr - now) / 864e5);

    el('db-alerts').innerHTML =
      (cases.length
        ? '<div class="db-alert warn"><i class="fas fa-scale-unbalanced-flip"></i><div>' +
          '<b>' + cases.length + ' of your properties look over-assessed.</b> ' +
          'There are <b>' + days + ' days</b> until the April 1 appeal deadline. ' +
          'I will screen ' + (cases.length === 1 ? 'it' : 'them') + ' at no charge and tell you straight if a case is not worth filing.' +
          '<button class="db-btn" style="margin-top:12px;" onclick="dbAsk(\'appeal\')">Ask John to review</button>' +
          '</div></div>'
        : '') +
      (!profile.profile_complete
        ? '<div class="db-alert info"><i class="fas fa-id-card"></i><div>' +
          '<b>Finish your profile.</b> Two minutes, and it lets me send you only what is actually relevant, ' +
          'like your town\'s appeal deadline or a rebate you qualify for. ' +
          '<button class="db-btn" style="margin-top:12px;" onclick="dbTab(\'profile\')">Complete profile</button>' +
          '</div></div>'
        : '');

    el('db-stats').innerHTML =
      stat(homes.length, 'Homes claimed', 'fa-house-chimney') +
      stat(watch.length, 'On watchlist', 'fa-eye') +
      stat(totalTax ? money(totalTax) : '-', 'Annual tax tracked', 'fa-file-invoice-dollar') +
      stat(days, 'Days to appeal deadline', 'fa-calendar-day');

    el('db-homes').innerHTML = homes.length
      ? homes.map(card).join('')
      : empty('fa-house-circle-check', 'No homes claimed yet',
              'Look up your address and claim it. Then I can track the assessment for you year over year.');
    el('db-watch').innerHTML = watch.length
      ? watch.map(card).join('')
      : empty('fa-eye', 'Watchlist is empty',
              'Add any New Jersey property and keep an eye on what it is assessed at.');
    el('db-profile').innerHTML = profileForm();

    // Tools need the reference data, so build them once it is in.
    loadRefData().then(function () {
      var t = el('db-tools');
      if (!t) return;
      var html = [toolDrift(), toolPercentile(), toolRebates(), toolPortfolio(),
                  toolCompare(), toolCost(), toolExport()].filter(Boolean).join('');
      t.innerHTML = html || '<div class="db-empty"><i class="fas fa-toolbox"></i>' +
        '<b>Save a property first</b><p>The tools work on the homes and watchlist items you save. ' +
        'Look up an address and claim it, then come back.</p>' +
        '<a class="db-btn" href="/property/">Look up an address</a></div>';
      if (el('tc-total')) window.dbCost();
      paintPercentile();
    });
  }

  function stat(v, l, i) {
    return '<div class="db-stat"><i class="fas ' + i + '"></i><b>' + v + '</b><span>' + l + '</span></div>';
  }
  function empty(i, t, p) {
    return '<div class="db-empty"><i class="fas ' + i + '"></i><b>' + t + '</b><p>' + p + '</p>' +
      '<a class="db-btn" href="/property/">Look up an address</a></div>';
  }

  var VERIFY = {
    self: { label: 'Unverified',        cls: 'no'  },
    doc:  { label: 'Document on file',  cls: 'mid' },
    mail: { label: 'Verified owner',    cls: 'yes' }
  };

  function card(r) {
    var v = VERIFY[r.verify_level || 'self'] || VERIFY.self;
    var hist = r.history || [], trend = '';
    if (hist.length && hist[0].assessed && r.assessed) {
      var d = r.assessed - hist[0].assessed;
      if (d) trend = '<div class="db-trend ' + (d > 0 ? 'up' : 'down') + '">' +
        (d > 0 ? '\u2191 ' : '\u2193 ') + money(Math.abs(d)) + ' since you saved it</div>';
    }
    var q = encodeURIComponent(r.address + ', ' + (r.town || '') + ', NJ ' + (r.zip || ''));
    return '<div class="db-card">' +
      '<div class="db-card-h">' +
        '<div><b>' + esc(r.address) + '</b><span>' + esc(r.town || '') +
          (r.county ? ', ' + esc(r.county) + ' County' : '') + '</span></div>' +
        '<div class="db-badges">' +
          (r.has_appeal_case ? '<span class="db-flag warn">Appeal case</span>' : '') +
          '<span class="db-flag ' + v.cls + '">' + v.label + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="db-figs">' +
        '<div><b>' + (r.assessed ? money(r.assessed) : '-') + '</b><span>Assessed</span></div>' +
        '<div><b>' + (r.last_year_tax ? money(r.last_year_tax) : '-') + '</b><span>Annual tax</span></div>' +
        '<div><b>' + (r.watchdog_value ? money(r.watchdog_value) : '-') + '</b><span>Watchdog value</span></div>' +
        '<div><b>' + (r.effective_rate ? (+r.effective_rate).toFixed(2) + '%' : '-') + '</b><span>Eff. rate</span></div>' +
      '</div>' + trend +
      '<div class="db-acts">' +
        '<a class="db-btn ghost" href="/property/?address=' + q + '">Open</a>' +
        (r.kind === 'home' && r.verify_level !== 'mail'
          ? '<button class="db-btn ghost" onclick="dbVerify(\'' + r.pams_pin + '\',\'' + esc(r.address).replace(/'/g, "") + '\')">Verify ownership</button>' : '') +
        '<button class="db-btn ghost" onclick="dbAskAbout(\'' + esc(r.address).replace(/'/g, "") + '\')">Ask John</button>' +
        '<button class="db-btn danger" onclick="dbRemove(\'' + r.id + '\')">Remove</button>' +
      '</div>' +
    '</div>';
  }

  window.dbTab = function (p) {
    ['homes', 'watch', 'tools', 'profile'].forEach(function (k) {
      var t = document.querySelector('.db-tab[data-p="' + k + '"]');
      if (t) t.classList.toggle('active', k === p);
      var panel = el('db-' + k);
      if (panel) panel.classList.toggle('active', k === p);
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
      '<div class="auth-fine">In a hurry? Email me a copy of your tax bill or deed and I will mark it verified by hand.</div>');
  };

  window.dbRequestCode = function (pin, address) {
    sb.rpc('request_verify_code', { p_pin: pin, p_address: address }).then(function (r) {
      if (r.error) { toast('Could not request a code'); return; }
      plModalNote('Code on the way',
        '<p>I will post a code to <b>' + esc(address) + '</b>. Allow a few days for it to arrive, then come back here and enter it.</p>' +
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
    plModalNote('On it', '<p>I will review those and get back to you within one business day.</p>' +
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
    plModalNote('Message sent', '<p>I will get back to you about <b>' + esc(address) + '</b> within one business day.</p>' +
      '<button class="plm-rbtn" onclick="plCloseNote()">Close</button>');
  };

})();
