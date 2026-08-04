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
      { auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          // Keep the lookup page and dashboard on the exact same session key.
          storageKey: 'sb-uvkvaxljhhngydvlrzom-auth-token'
        } });
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

  // ── auth boot ──
  // A single settling function prevents getSession and INITIAL_SESSION from
  // racing each other and launching the dashboard twice.
  var authSettled = false;
  var authUserId = null;

  function settleAuth(session, force) {
    var nextUser = session && session.user ? session.user : null;
    var nextId = nextUser ? nextUser.id : null;

    if (!force && authSettled && nextId === authUserId) return;

    authSettled = true;
    authUserId = nextId;
    plUser = nextUser;

    var checking = el('db-auth-check');
    if (checking) checking.style.display = 'none';
    paint();
  }

  function showSignedOut() {
    settleAuth(null, true);
  }

  function readSession() {
    if (!ready()) {
      showSignedOut();
      return Promise.resolve();
    }

    return sb.auth.getSession().then(function (r) {
      if (r.error) throw r.error;
      var session = r.data && r.data.session;

      if (session) {
        settleAuth(session);
        return;
      }

      // A stored refresh token can still be valid even when the access token
      // expired while the tab was closed. Give Supabase one recovery attempt.
      return sb.auth.refreshSession().then(function (fresh) {
        var recovered = fresh && fresh.data && fresh.data.session;
        settleAuth(recovered || null);
      }).catch(showSignedOut);
    }).catch(function () {
      showSignedOut();
    });
  }

  function bootAuth() {
    if (!ready()) {
      showSignedOut();
      return;
    }

    sb.auth.onAuthStateChange(function (_event, session) {
      settleAuth(session || null);
    });

    readSession();

    if (location.hash.indexOf('access_token') > -1) {
      history.replaceState(null, '', location.pathname + location.search);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootAuth, { once: true });
  } else {
    bootAuth();
  }

  // Browsers may restore the dashboard from the back-forward cache with stale
  // in-memory state. Re-read the persisted session when that happens.
  window.addEventListener('pageshow', function (event) {
    if (event.persisted && sb) readSession();
  });

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

    // Give the workspace an intentional loading state while the account,
    // property and reference datasets are assembled.
    el('db-brief').innerHTML = '';
    el('db-line').innerHTML =
      '<div class="rail db-loading-rail">' +
        '<span><b>&mdash;</b>Loading properties</span>' +
        '<span><b>&mdash;</b>Reading tax records</span>' +
        '<span><b>&mdash;</b>Checking appeal signals</span>' +
        '<span><b>&mdash;</b>Preparing tools</span>' +
      '</div>';
    el('db-body').innerHTML =
      '<div class="db-loading-panel">' +
        '<div class="pl-spin"></div>' +
        '<div><b>Building your Watchdog workspace</b>' +
        '<span>Matching your saved properties to the latest available New Jersey records.</span></div>' +
      '</div>';

    Promise.all([
      sb.from('saved_properties').select('*').order('created_at', { ascending: false }),
      sb.from('profiles').select('*').eq('id', plUser.id).maybeSingle(),
      loadRefData(), loadSR1A(), loadUniformity(), loadAppeals(), loadAbatements()
    ]).then(function (res) {
      rows = (res[0] && res[0].data) || [];
      profile = (res[1] && res[1].data) || {};
      render();
      hydrateDetails().then(render);
      el('db-profile-body').innerHTML = profileForm();
    }).catch(function (err) {
      console.error('Dashboard workspace error:', err);
      el('db-line').innerHTML = '';
      el('db-body').innerHTML =
        '<div class="db-error-panel"><i class="fas fa-triangle-exclamation"></i>' +
          '<div><h3>We could not finish loading your workspace.</h3>' +
          '<p>Your saved information has not been changed. Check your connection and try again.</p>' +
          '<button class="db-btn" onclick="location.reload()">Try again</button></div></div>';
    });
  }

  // ══════════════════════════════════════════════
  // SHARED DATA
  // ══════════════════════════════════════════════
  var NJ_PARCEL = 'https://services2.arcgis.com/XVOqAjTOJ5P6ngMu/ArcGIS/rest/services/Parcels_Composite_NJ_WM/FeatureServer/0/query';
  var GREENTREE_URL = 'https://johnvarano.com/';
  var ratios = null, rates = null;

  function greentreeRailAd() {
    return '<aside class="gt-rail" aria-label="Greentree Mortgage advertisement">' +
      '<div class="gt-ad">' +
        '<div class="gt-ad-label"><span>Sponsored</span><i class="fas fa-building-columns"></i></div>' +
        '<div class="gt-ad-portrait">' +
          '<img src="/johnvarano.jpg" alt="John Varano of Greentree Mortgage" ' +
            'onerror="this.parentNode.classList.add(\'no-photo\')">' +
          '<span class="gt-ad-brand">Greentree Mortgage</span>' +
        '</div>' +
        '<div class="gt-ad-body">' +
          '<span class="gt-ad-kicker">Your local mortgage office</span>' +
          '<h3>Know your buying power before the next showing.</h3>' +
          '<p>John Varano helps South Jersey buyers turn a budget into a clear, competitive preapproval.</p>' +
          '<div class="gt-ad-benefits">' +
            '<span><i class="fas fa-circle-check"></i>Taxes and escrow included</span>' +
            '<span><i class="fas fa-circle-check"></i>Purchase, refinance and equity options</span>' +
            '<span><i class="fas fa-circle-check"></i>25+ years of mortgage experience</span>' +
          '</div>' +
          '<a class="gt-ad-cta" href="' + GREENTREE_URL + '" target="_blank" rel="sponsored noopener">' +
            'Start my preapproval <i class="fas fa-arrow-right"></i></a>' +
          '<div class="gt-ad-office">' +
            '<i class="fas fa-location-dot"></i>' +
            '<div><b>Turnersville office</b><span>5001 Route 42<br>Turnersville, NJ 08012</span></div>' +
          '</div>' +
          '<a class="gt-ad-phone" href="tel:+12152197357"><i class="fas fa-phone"></i> 215-219-7357</a>' +
        '</div>' +
        '<div class="gt-ad-fine">Advertisement. John Varano, NMLS #142739. Branch and Corporate NMLS #139164. ' +
          'Greentree Mortgage, an HMA Company, is a separate company and is not affiliated with Opus Elite Real Estate. ' +
          'You may choose any lender. This is not a commitment to lend or a guarantee of terms.</div>' +
      '</div>' +
    '</aside>';
  }

  function dashboardWithAd(content) {
    return '<div class="db-content-grid"><div class="db-content-main">' + content + '</div>' +
      greentreeRailAd() + '</div>';
  }

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
  var pageSize = 4;
  var currentPage = 1;
  var mobileVisibleCount = 4;
  var mobileSponsorAt = 4 + Math.floor(Math.random() * 3);
  var mobilePropertyObserver = null;
  var mobileCollectionQuery = window.matchMedia ? window.matchMedia('(max-width: 760px)') : null;
  try {
    var savedPageSize = parseInt(localStorage.getItem('watchdogDashboardPageSize'), 10);
    if ([4, 10, 25, 100].indexOf(savedPageSize) > -1) pageSize = savedPageSize;
  } catch (_pageSizeError) {}
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
    currentPage = 1;
    mobileVisibleCount = 4;
    render();
  };

  window.dbPageSize = function (value) {
    var next = parseInt(value, 10);
    if ([4, 10, 25, 100].indexOf(next) === -1) next = 4;
    pageSize = next;
    currentPage = 1;
    try { localStorage.setItem('watchdogDashboardPageSize', String(next)); } catch (_storageError) {}
    render();
  };

  window.dbPage = function (page) {
    var pages = Math.max(1, Math.ceil(orderedCollectionRows(false).length / pageSize));
    currentPage = Math.max(1, Math.min(pages, parseInt(page, 10) || 1));
    render();
    requestAnimationFrame(function () {
      var collection = document.getElementById('property-collection');
      if (!collection) return;
      var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      collection.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    });
  };

  function isMobileCollection() {
    return !!(mobileCollectionQuery && mobileCollectionQuery.matches);
  }

  function primaryHome() {
    return rows.filter(function (r) { return r.kind === 'home'; })[0] || null;
  }

  function orderedCollectionRows(mobile) {
    var home = primaryHome();
    var rest = rows.filter(function (r) { return !home || r.id !== home.id; })
      .slice().sort(SORTS[sortBy].fn);
    if (mobile && home) return [home].concat(rest);
    return home ? rest : rows.slice().sort(SORTS[sortBy].fn);
  }

  function mobileSponsorCard() {
    return '<article class="mobile-sponsored-card" aria-label="Sponsored Greentree Mortgage message">' +
      '<div class="mobile-sponsored-label">Sponsored</div>' +
      '<div class="mobile-sponsored-head"><img src="/johnvarano.jpg" alt="" loading="lazy" decoding="async" ' +
        'onerror="this.style.display=\'none\'"><div><span>Greentree Mortgage</span>' +
        '<h3>Know your buying power before the next showing.</h3></div></div>' +
      '<p>Get a clear preapproval with property taxes and escrow considered from the start.</p>' +
      '<a href="' + GREENTREE_URL + '" target="_blank" rel="sponsored noopener">Start my preapproval ' +
        '<i class="fas fa-arrow-right"></i></a>' +
      '<small>Advertisement. John Varano, NMLS #142739. This is not a commitment to lend.</small>' +
    '</article>';
  }

  function renderPropertyBatch(list, start, mobile) {
    return list.map(function (r, i) {
      var position = start + i;
      var html = propertyBlock(r, position);
      if (mobile && position + 1 === mobileSponsorAt) html += mobileSponsorCard();
      return html;
    }).join('');
  }

  function resetCollectionForViewport() {
    currentPage = 1;
    mobileVisibleCount = 4;
    if (rows.length) render();
  }

  if (mobileCollectionQuery) {
    if (mobileCollectionQuery.addEventListener) mobileCollectionQuery.addEventListener('change', resetCollectionForViewport);
    else if (mobileCollectionQuery.addListener) mobileCollectionQuery.addListener(resetCollectionForViewport);
  }

  function sortControl(total) {
    return '<div class="sortbar">' +
      '<div class="sortbar-control"><label for="db-sort">Sort</label>' +
        '<select id="db-sort" onchange="dbSort(this.value)">' +
          Object.keys(SORTS).map(function (k) {
            return '<option value="' + k + '"' + (k === sortBy ? ' selected' : '') + '>' +
              SORTS[k].label + '</option>';
          }).join('') +
        '</select></div>' +
      '<div class="sortbar-control page-size-control"><label for="db-page-size">Show</label>' +
        '<select id="db-page-size" onchange="dbPageSize(this.value)">' +
          [4, 10, 25, 100].map(function (n) {
            return '<option value="' + n + '"' + (n === pageSize ? ' selected' : '') + '>' + n + '</option>';
          }).join('') +
        '</select><span>per page</span></div>' +
      '<span class="property-total">' + total + ' saved propert' + (total === 1 ? 'y' : 'ies') + '</span>' +
      (picked.length
        ? '<span class="cmp-count">' + picked.length + ' selected' +
          '<button onclick="dbCompareSel()"' + (picked.length < 2 ? ' disabled' : '') + '>Compare</button>' +
          '<button class="clr" onclick="dbClearPick()">Clear</button></span>'
        : '<span class="cmp-hint">Tick up to three properties to compare them</span>') +
    '</div>';
  }

  function pagination(total) {
    var pages = Math.max(1, Math.ceil(total / pageSize));
    if (currentPage > pages) currentPage = pages;
    var start = total ? ((currentPage - 1) * pageSize) + 1 : 0;
    var end = Math.min(total, currentPage * pageSize);
    var from = Math.max(1, currentPage - 2);
    var to = Math.min(pages, from + 4);
    from = Math.max(1, to - 4);
    var numbered = '';

    if (from > 1) {
      numbered += '<button type="button" onclick="dbPage(1)">1</button>';
      if (from > 2) numbered += '<span class="pager-gap" aria-hidden="true">&hellip;</span>';
    }
    for (var p = from; p <= to; p++) {
      numbered += '<button type="button"' + (p === currentPage ? ' class="on" aria-current="page"' : '') +
        ' onclick="dbPage(' + p + ')">' + p + '</button>';
    }
    if (to < pages) {
      if (to < pages - 1) numbered += '<span class="pager-gap" aria-hidden="true">&hellip;</span>';
      numbered += '<button type="button" onclick="dbPage(' + pages + ')">' + pages + '</button>';
    }

    return '<nav class="property-pager" style="background:none; box-shadow: none;" aria-label="Saved property pages">' +
      '<span class="pager-count">Showing ' + start + '&ndash;' + end + ' of ' + total + '</span>' +
      '<div class="pager-buttons">' +
        '<button type="button" class="pager-arrow" aria-label="Previous page" onclick="dbPage(' + (currentPage - 1) + ')"' +
          (currentPage === 1 ? ' disabled' : '') + '><i class="fas fa-chevron-left"></i></button>' +
        numbered +
        '<button type="button" class="pager-arrow" aria-label="Next page" onclick="dbPage(' + (currentPage + 1) + ')"' +
          (currentPage === pages ? ' disabled' : '') + '><i class="fas fa-chevron-right"></i></button>' +
      '</div>' +
    '</nav>';
  }

  function mobileScrollStatus(total, showing) {
    return '<div class="mobile-scroll-status" aria-live="polite">' +
      '<span id="mobile-scroll-count">Showing ' + showing + ' of ' + total + '</span>' +
      (showing < total
        ? '<div class="property-scroll-sentinel" id="property-scroll-sentinel">' +
            '<span class="property-scroll-pulse"></span><span>Loading more properties</span></div>'
        : '<span class="mobile-scroll-end"><i class="fas fa-circle-check"></i>All properties loaded</span>') +
    '</div>';
  }

  window.dbLoadMoreProperties = function () {
    if (!isMobileCollection()) return;
    var grid = document.querySelector('#property-collection .property-card-grid');
    if (!grid) return;
    var ordered = orderedCollectionRows(true);
    var next = ordered.slice(mobileVisibleCount, mobileVisibleCount + 4);
    if (!next.length) {
      setupMobilePropertyScroll(ordered.length);
      return;
    }
    grid.insertAdjacentHTML('beforeend', renderPropertyBatch(next, mobileVisibleCount, true));
    mobileVisibleCount += next.length;
    setupMobilePropertyScroll(ordered.length);
  };

  function setupMobilePropertyScroll(total) {
    if (mobilePropertyObserver) {
      mobilePropertyObserver.disconnect();
      mobilePropertyObserver = null;
    }
    var status = document.querySelector('.mobile-scroll-status');
    if (!status) return;
    var shown = Math.min(mobileVisibleCount, total);
    var count = document.getElementById('mobile-scroll-count');
    if (count) count.textContent = 'Showing ' + shown + ' of ' + total;
    var sentinel = document.getElementById('property-scroll-sentinel');
    if (shown >= total) {
      if (sentinel) sentinel.outerHTML = '<span class="mobile-scroll-end"><i class="fas fa-circle-check"></i>All properties loaded</span>';
      return;
    }
    if (!sentinel) return;
    if (!('IntersectionObserver' in window)) {
      sentinel.innerHTML = '<button type="button" onclick="dbLoadMoreProperties()">Load more properties</button>';
      return;
    }
    mobilePropertyObserver = new IntersectionObserver(function (entries) {
      if (!entries[0] || !entries[0].isIntersecting) return;
      mobilePropertyObserver.disconnect();
      window.dbLoadMoreProperties();
    }, { root: null, rootMargin: '500px 0px', threshold: 0.01 });
    mobilePropertyObserver.observe(sentinel);
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
  function isPro() {
    var plan = String((profile && profile.plan) || '').toLowerCase().replace(/[\s_-]/g, '');
    return plan === 'pro' || plan === 'pro+' || plan === 'proplus' || plan === 'teams';
  }

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
// Tier-aware dashboard guidance using Watchdog icons.
// ══════════════════════════════════════════════
function brief() {
  if (!rows.length) return '';

  var homes = rows.filter(function (r) {
    return r.kind === 'home';
  });

  var lead = homes[0] || rows[0];
  var c = chapter123(lead);

  var tot = rows.reduce(function (total, r) {
    return total + (+r.last_year_tax || 0);
  }, 0);

  var cases = rows.filter(function (r) {
    var result = chapter123(r);
    return result && result.hasCase;
  });

  var plan = String(
    (profile && profile.plan) || 'free'
  ).toLowerCase().replace(/[\s_-]/g, '');

  var plus = plan === 'pro+' || plan === 'proplus';
  var pro = plus || plan === 'pro';

  var count =
    '<b>' + rows.length + ' propert' +
    (rows.length === 1 ? 'y' : 'ies') +
    '</b>';

  var taxes = tot
    ? ' representing <b>' + money(tot) +
      '</b> in annual property tax'
    : '';

  var d = deadline();
  var s = [];

  function briefPoint(content, extraClass) {
    return (
      '<span class="brief-point' +
        (extraClass ? ' ' + extraClass : '') +
      '">' +
        '<i class="fas fa-dog brief-point-icon" aria-hidden="true"></i>' +
        '<span class="brief-point-copy">' +
          content +
        '</span>' +
      '</span>'
    );
  }

  // FREE ACCOUNT
  if (!pro) {
    s.push(
      briefPoint(
        '<b>Your property-tax starting point.</b> You are currently tracking ' +
        count + taxes + '.'
      )
    );

    s.push(
      briefPoint(
        'Review each property card for its assessment, annual tax, estimated ' +
        'market value, town ratio, and basic appeal signals.'
      )
    );

    if (c) {
      var freeMarketValue =
        Number.isFinite(+c.market)
          ? money(rnd(+c.market))
          : 'not yet available';

      s.push(
        briefPoint(
          'For <b>' + esc(lead.address) + '</b>, the current records indicate ' +
          'an assessed value of <b>' + money(+lead.assessed || 0) +
          '</b> and an estimated market value near <b>' +
          freeMarketValue + '</b>.'
        )
      );
    }

    s.push(
      briefPoint(
        '<a href="/property/pro.html"><b>Upgrade to Pro</b></a> for Chapter 123 ' +
        'screening, verified sales comparables, professional town comparisons, ' +
        'unlimited saved properties, and client-ready exports.',
        'brief-point-upgrade'
      )
    );

    s.push(
      briefPoint(
        '<a href="/property/pro.html"><b>Step up to Pro+</b></a> for 1,000+ ' +
        'record workflows, exclusive Watchdog intelligence, bulk research, ' +
        'and API access.',
        'brief-point-upgrade'
      )
    );
  }

  // PRO AND PRO+ ACCOUNTS
  else {
    s.push(
      briefPoint(
        (plus
          ? '<b>Pro+ Dashboard.</b> '
          : '<b>Pro Dashboard.</b> ') +
        'Your workspace is tracking ' + count + taxes + '.'
      )
    );

    if (c) {
      var propertySummary =
        '<b>' + esc(lead.address) + '</b> is assessed at <b>' +
        money(+lead.assessed || 0) + '</b>. ';

      if (
        c.src === 'verified' &&
        Number.isFinite(+c.ratio) &&
        Number.isFinite(+c.market)
      ) {
        propertySummary +=
          'New Jersey verified sales place the town at <b>' +
          (+c.ratio * 100).toFixed(1) +
          '% of market</b>, supporting an estimated value near <b>' +
          money(rnd(+c.market)) + '</b>. ';
      } else if (Number.isFinite(+c.market)) {
        propertySummary +=
          'The published ratio supports an estimated value near <b>' +
          money(rnd(+c.market)) + '</b>. ';
      } else {
        propertySummary +=
          'A supported market-value estimate is still being assembled. ';
      }

      if (!c.testable) {
        propertySummary +=
          'Open the full record and review comparable sales before drawing ' +
          'an appeal conclusion.';
      } else if (c.hasCase) {
        propertySummary +=
          'The assessment appears <b class="neg">' +
          money(+c.over || 0) +
          ' above</b> the Chapter 123 limit';

        propertySummary += c.saving
          ? ', with approximately <b>' +
            money(+c.saving) +
            ' per year</b> potentially at stake.'
          : '.';
      } else {
        propertySummary +=
          'The assessment currently falls within the permitted Chapter 123 range.';
      }

      s.push(briefPoint(propertySummary));
    }

    s.push(
      briefPoint(
        'Use property reports to validate parcel-level findings, comparison ' +
        'tools to measure tax burden across municipalities, and exports to ' +
        'move supported figures into client, attorney, or internal review workflows.'
      )
    );

    if (plus) {
      s.push(
        briefPoint(
          'Use your Pro+ workspace to screen territories and portfolios in ' +
          'bulk, enrich 1,000+ records, surface Watchdog-only risk and ' +
          'opportunity signals, and deliver results through exports, scheduled ' +
          'workflows, or the API.',
          'brief-point-plus'
        )
      );
    } else {
      s.push(
        briefPoint(
          'Working at a larger scale? ' +
          '<a href="/property/pro.html"><b>Compare Pro+</b></a> for ' +
          'municipality-wide prospecting, 1,000+ record enrichment, ' +
          'proprietary signals, and direct system access.',
          'brief-point-upgrade'
        )
      );
    }
  }

  // APPEAL DEADLINE WARNING
  if (cases.length) {
    var warning =
      cases.length === 1
        ? '<b>Action may be needed.</b> One tracked property currently shows ' +
          'a possible over-assessment. The next general filing deadline is ' +
          '<b>' + d.days + ' days away</b>.'
        : '<b>Action may be needed.</b> ' + cases.length +
          ' tracked properties currently show possible over-assessments. ' +
          'The next general filing deadline is <b>' +
          d.days + ' days away</b>.';

    s.push(briefPoint(warning, 'urgent'));
  }

  return '<div class="brief">' + s.join('') + '</div>';
}

  // Shared helpers used by the brief, property cards and dashboard totals.
  function rnd(n) {
    n = Number(n);
    return Number.isFinite(n) ? Math.round(n / 1000) * 1000 : 0;
  }

  function deadline() {
    var now = new Date();
    var apr = new Date(now.getFullYear(), 3, 1);
    if (now > apr) apr = new Date(now.getFullYear() + 1, 3, 1);
    return { date: apr, days: Math.ceil((apr - now) / 864e5) };
  }
     
  // ══════════════════════════════════════════════
  // PROPERTY  ·  fast compact card view
  // Only the current page is rendered, keeping Street View requests bounded.
  // ══════════════════════════════════════════════
  function propertyBlock(r, index) {
    var c = chapter123(r);
    var q = encodeURIComponent(r.address + ', ' + (r.town || '') + ', NJ ' + (r.zip || ''));
    var v = VERIFY[r.verify_level || 'self'];
    var tone = (c && c.hasCase) ? 'hot' : (c && c.testable) ? 'ok' : 'neutral';
    var statusLabel = (c && c.hasCase) ? 'Review recommended' :
      (c && c.testable) ? 'Assessment in range' : 'Analysis building';
    var statusIcon = (c && c.hasCase) ? 'fa-triangle-exclamation' :
      (c && c.testable) ? 'fa-circle-check' : 'fa-wave-square';
    var market = c && Number.isFinite(+c.market) ? money(rnd(+c.market)) : '&mdash;';
    var paid = isPro();
    var tierLink = paid
      ? '<a class="pr-tier pro" href="/property/pro.html"><i class="fas fa-briefcase"></i>Pro Hub</a>'
      : '<a class="pr-tier upgrade" href="/property/pro.html"><i class="fas fa-star"></i>Upgrade to Pro</a>';

    return '<div class="pr-item" style="--card-i:' + (index || 0) + '">' +
      '<article class="pr-card ' + tone + (picked.indexOf(r.id) > -1 ? ' picked' : '') + '">' +
        '<div class="pr-card-media">' +
          '<img src="' + streetImg(r, 520, 390) + '" alt="Street View of ' + esc(r.address) + '" ' +
            'loading="lazy" decoding="async" fetchpriority="low" width="520" height="390" ' +
            'onerror="this.parentNode.classList.add(\'noimg\')">' +
          '<span class="pr-kind ' + (r.kind === 'home' ? 'home' : '') + '">' +
            (r.kind === 'home' ? 'Your home' : 'Watching') + '</span>' +
          '<label class="pr-card-compare"><input type="checkbox"' +
            (picked.indexOf(r.id) > -1 ? ' checked' : '') +
            ' onchange="dbPick(\'' + r.id + '\', this)"><span>Compare</span></label>' +
          '<div class="pr-card-menu">' + propMenu(r) + '</div>' +
          wdBadge(r) +
        '</div>' +
        '<div class="pr-card-body">' +
          '<div class="pr-card-status ' + tone + '"><i class="fas ' + statusIcon + '"></i>' +
            '<span>' + statusLabel + '</span><em>' + esc(v.label) + '</em></div>' +
          '<h3 title="' + esc(r.address) + '">' + esc(r.address) + '</h3>' +
          '<p>' + esc(r.town || '') + (r.county ? ', ' + esc(r.county) + ' County' : '') +
            (r.block ? ' &middot; Block ' + esc(r.block) + ' Lot ' + esc(r.lot || '') : '') + '</p>' +
          '<div class="pr-card-metrics">' +
            '<span><b>' + money(r.assessed || 0) + '</b><small>Assessed</small></span>' +
            '<span><b>' + money(r.last_year_tax || 0) + '</b><small>Tax / year</small></span>' +
            '<span><b>' + market + '</b><small>Market value</small></span>' +
          '</div>' +
        '</div>' +
      '</article>' +
      '<div class="pr-card-actions">' +
        '<a class="primary" href="' + reportLink(r) + '"><i class="fas fa-chart-line"></i>Full report</a>' +
        '<a href="/property/?address=' + q + '"><i class="fas fa-file-lines"></i>Property record</a>' +
        '<button type="button" onclick="dbAskAbout(\'' + esc(r.address).replace(/'/g, '') + '\')">' +
          '<i class="fas fa-envelope"></i>Contact agent</button>' +
        tierLink +
      '</div>' +
    '</div>';
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

  // ══════════════════════════════════════════════
  // UNIFORMITY AND APPEAL ODDS
  //
  // Two datasets New Jersey publishes and nobody reads, joined to the property
  // in front of you.
  //
  //   uniformity.json  how consistently a town assesses, 558 districts
  //   appeals.json     what actually happens to appeals, 21 counties, 10 years
  //
  // Separately they are trivia. Together with the property's own gap they
  // answer the only question that matters: is filing worth it.
  // ══════════════════════════════════════════════
  var uniData = null, appealData = null;

  function ordinal(n) {
    var s = ['th', 'st', 'nd', 'rd'], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }


  function loadUniformity() {
    if (uniData) return Promise.resolve();
    return xfetch('/property/uniformity.json', 12000).then(function (r) { return r.json(); })
      .then(function (j) { uniData = (j && j.districts) || {}; })
      .catch(function () { uniData = {}; });
  }
  function loadAppeals() {
    if (appealData) return Promise.resolve();
    return xfetch('/property/appeals.json', 12000).then(function (r) { return r.json(); })
      .then(function (j) { appealData = j || {}; })
      .catch(function () { appealData = {}; });
  }

  function uniFor(r) {
    var d = String(r.pams_pin || '').slice(0, 4);
    return (uniData && d) ? uniData[d] : null;
  }
  function appealFor(r) {
    var c = String(r.pams_pin || '').slice(0, 2);
    return (appealData && appealData.counties && c) ? appealData.counties[c] : null;
  }

  var BAND_TEXT = {
    'excellent': 'assesses very consistently',
    'good':      'assesses reasonably consistently',
    'fair':      'assessments here vary more than they should',
    'poor':      'assessments here are noticeably uneven',
    'very poor': 'the assessment roll here is a mess'
  };
  var BAND_CLS = {
    'excellent': 'good', 'good': 'good', 'fair': 'mid', 'poor': 'bad', 'very poor': 'bad'
  };

  // ── 1 · ASSESSMENT UNIFORMITY ──
  function toolUniformity() {
    var homes = rows.filter(function (r) { return uniFor(r); });
    if (!homes.length) return '';
    var r = homes[0], u = uniFor(r);

    var W = 320, H = 62;
    var yrs = Object.keys(u.series).sort();
    var vals = yrs.map(function (y) { return u.series[y]; });
    var lo = Math.min.apply(null, vals.concat([8])), hi = Math.max.apply(null, vals.concat([22]));
    var path = vals.map(function (v, i) {
      var x = 6 + (i / Math.max(1, vals.length - 1)) * (W - 12);
      var y = H - 8 - ((v - lo) / ((hi - lo) || 1)) * (H - 20);
      return (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
    }).join(' ');
    // the IAAO line, which is the only benchmark that means anything
    var iaao = H - 8 - ((15 - lo) / ((hi - lo) || 1)) * (H - 20);

    return toolCard('Assessment uniformity', 'fa-ruler-combined',
      '<p class="tl-p">Your town\u2019s equalization ratio says whether it assesses <em>high or low</em>. ' +
      'This says whether it assesses <em>fairly</em>. It is the average percentage by which individual ' +
      'assessments in ' + esc(u.name) + ' stray from the town\u2019s own standard, and New Jersey publishes ' +
      'it every year in a ninety page PDF nobody opens.</p>' +

      '<div class="un-head">' +
        '<div class="un-score ' + (BAND_CLS[u.band] || 'mid') + '">' +
          '<b>' + u.score + '</b><span>uniformity score</span></div>' +
        '<div class="un-say">' +
          '<b>' + esc(u.name) + ' ' + (BAND_TEXT[u.band] || '') + '.</b> ' +
          'Its residential coefficient of deviation is <b>' + u.coefficient + '</b>. ' +
          'The professional standard is 15 or below. ' +
          'That puts it in the <b>' + ordinal(u.percentile) + ' percentile</b> statewide, so ' +
          (u.percentile >= 50
            ? 'it is more consistent than most of New Jersey.'
            : 'most of New Jersey assesses more consistently than this.') +
        '</div>' +
      '</div>' +

      '<div class="un-chart">' +
        '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Coefficient of deviation over time">' +
          '<line x1="6" y1="' + iaao.toFixed(1) + '" x2="' + (W - 6) + '" y2="' + iaao.toFixed(1) +
            '" stroke="#c3cbdb" stroke-width="1" stroke-dasharray="4 4"/>' +
          '<text x="' + (W - 8) + '" y="' + (iaao - 5).toFixed(1) + '" text-anchor="end" ' +
            'font-size="9" fill="#8a93a6">standard, 15</text>' +
          '<path d="' + path + '" fill="none" stroke="' +
            (u.band === 'poor' || u.band === 'very poor' ? '#c0342b' : '#14346e') +
            '" stroke-width="2.4" stroke-linecap="round"/>' +
        '</svg>' +
        '<div class="un-yrs">' + yrs.map(function (y, i) {
          return '<span>' + y + '<em>' + vals[i] + '</em></span>';
        }).join('') + '</div>' +
      '</div>' +

      (u.commercial && u.commercial > u.coefficient * 1.5
        ? '<div class="tl-note">Commercial property here deviates at <b>' + u.commercial + '</b>, far worse ' +
          'than residential. Uneven commercial assessment shifts burden onto homeowners over time.</div>'
        : '') +

      '<div class="tl-fine">Coefficient of deviation, class 2 residential, from the NJ Division of Taxation ' +
      'Measures of Property Assessment Uniformity. Weighted toward recent years, adjusted for volatility and ' +
      'sample size. A high coefficient does not by itself win an appeal, but it is the condition that makes ' +
      'one arguable.</div>');
  }

  // ── 2 · APPEAL ODDS ──
  function toolAppealOdds() {
    var cands = rows.filter(function (r) { return appealFor(r); });
    if (!cands.length) return '';
    var r = cands[0], a = appealFor(r), L = a.latest, u = uniFor(r);
    var hist = Object.keys(a.history).sort();

    var W = 330, H = 58;
    var rates = hist.map(function (y) { return a.history[y].win_rate_filed; });
    var lo = Math.min.apply(null, rates), hi = Math.max.apply(null, rates);
    var path = rates.map(function (v, i) {
      var x = 6 + (i / Math.max(1, rates.length - 1)) * (W - 12);
      var y = H - 8 - ((v - lo) / ((hi - lo) || 1)) * (H - 18);
      return (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
    }).join(' ');

    // Expected value. This is the number nobody else can produce, because it
    // needs the county outcome record, the town's uniformity, and this
    // property's own gap, and no one publishes the three together.
    var c = chapter123(r);
    var ev = null;
    if (c && c.testable && c.hasCase && c.saving) {
      var p = L.win_rate_decided ? L.win_rate_decided / 100 : L.win_rate_filed / 100;
      // a sloppier roll is a friendlier roll for an appellant
      if (u) p = Math.max(0.05, Math.min(0.95, p * (u.coefficient > 20 ? 1.12 : u.coefficient < 10 ? 0.88 : 1)));
      ev = { p: p, gross: c.saving * 5, net: (c.saving * 5 * p) - 25 };
    }

    return toolCard('Appeal odds in ' + esc(a.county.toLowerCase().replace(/\b\w/g, function (m) { return m.toUpperCase(); })) + ' County',
      'fa-gavel',
      '<p class="tl-p">Appeals are decided by the <b>county</b> board of taxation, not your town, so this is the ' +
      'body that would actually hear your case. New Jersey publishes what happens to every appeal filed, ' +
      'and has done for ten years.</p>' +

      '<div class="ap-grid">' +
        '<div><b>' + L.win_rate_filed + '%</b><span>of all appeals filed won a reduction</span></div>' +
        '<div><b>' + (L.win_rate_decided != null ? L.win_rate_decided + '%' : '-') +
          '</b><span>of those actually decided</span></div>' +
        '<div><b>' + L.total.toLocaleString() + '</b><span>filed in ' + a.latest_year + '</span></div>' +
        '<div><b>' + L.residential.toLocaleString() + '</b><span>were residential like yours</span></div>' +
      '</div>' +

      '<div class="ap-chart">' +
        '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Win rate over ten years">' +
          '<path d="' + path + '" fill="none" stroke="#1c7a4a" stroke-width="2.4" stroke-linecap="round"/>' +
        '</svg>' +
        '<div class="ap-yrs"><span>' + hist[0] + '  ' + rates[0] + '%</span>' +
          '<span class="' + (a.trend > 0 ? 'up' : a.trend < 0 ? 'down' : '') + '">' +
          (a.trend > 0 ? 'up ' + a.trend + ' points' : a.trend < 0 ? 'down ' + Math.abs(a.trend) + ' points' : 'flat') +
          ' over ten years</span>' +
          '<span>' + hist[hist.length - 1] + '  ' + rates[rates.length - 1] + '%</span></div>' +
      '</div>' +

      (ev
        ? '<div class="ap-ev">' +
            '<div class="ap-ev-n">' + money(Math.round(ev.net)) + '</div>' +
            '<div class="ap-ev-l">Expected value of filing on <b>' + esc(r.address) + '</b>, over five years, ' +
              'after the filing fee. That is a <b>' + Math.round(ev.p * 100) + '%</b> chance of winning ' +
              money(Math.round(ev.gross)) + '.</div>' +
            '<button class="tl-btn" onclick="dbAsk(\'appeal\')">Have an agent screen this</button>' +
          '</div>'
        : '<div class="tl-note">Your saved properties do not currently show an assessment above the Chapter 123 ' +
          'limit, so there is nothing to weigh these odds against. Open a property\u2019s full record and the ' +
          'analysis saves back here.</div>') +

      '<div class="tl-fine">A win means the assessment came down, either revised by the board or stipulated by ' +
      'agreement before hearing. Most successful appeals settle, so counting only board revisions would ' +
      'understate this badly. Withdrawals and dismissals are excluded from the decided rate. ' +
      'The average successful appeal in ' + a.county.toLowerCase() + ' cut ' +
      (L.avg_reduction_per_win ? money(L.avg_reduction_per_win) : 'an unrecorded amount') +
      ' off the assessed value, though that figure is dominated by commercial cases and a house will be far less. ' +
      'This data is published by county, not by town. Anyone offering you a town level win rate for New Jersey ' +
      'is guessing.</div>');
  }

  // ══════════════════════════════════════════════
  // CONDENSED METRICS
  //
  // Every saved property gets its own numbers. The previous build computed
  // these once from rows[0] and printed them under a list of five properties,
  // which read as though they applied to all of them. They did not.
  //
  // Full depth lives on the per property report at home.html. What sits here
  // is the short version: four figures, each explained on hover, plus a link
  // through to the whole thing.
  // ══════════════════════════════════════════════

  var TIPS = {
    uniformity:
      'How consistently this town assesses its homes. The equalization ratio tells you whether a town ' +
      'assesses high or low; this tells you whether it assesses fairly. Scored 0 to 100 from the state\u2019s ' +
      'Coefficient of Deviation, where the professional standard is a coefficient of 15 or below.',
    ratio:
      'What share of true market value assessments run at in this town, measured from sales New Jersey ' +
      'itself verified as genuine arm\u2019s length transactions. Your assessment divided by this is roughly ' +
      'what the town thinks your home is worth.',
    odds:
      'The share of property tax appeals in this county that ended with the assessment reduced, counting ' +
      'both board decisions and settlements. Appeals are heard by the county board, not the town, so the ' +
      'county is the body whose behaviour this predicts.',
    gap:
      'How far the assessment sits above the Chapter 123 limit, which is the supported assessment plus the ' +
      '15 percent cushion New Jersey allows. Above zero means there is an argument to make. This needs an ' +
      'independent market value, so it only appears once the full record has been opened.',
    eff:
      'Annual tax divided by estimated market value. This is the only fair way to compare two properties in ' +
      'different towns, because assessment levels differ everywhere.',
    drift:
      'How much this assessment has moved since you started tracking it. New Jersey does not publish ' +
      'per parcel assessment history anywhere, so this accumulates from your own visits.'
  };

  function tip(key, label) {
    return '<span class="tip" tabindex="0" data-tip="' + esc(TIPS[key] || '') + '">' +
      label + '<i class="fas fa-circle-info"></i></span>';
  }

  // The four numbers worth showing on a card, each one specific to this row.
  // Each figure is graded against the state rather than shown bare, and each
  // tile flips to reveal what the number means. Data for its own sake is just
  // decoration; a number with a verdict attached is worth the space.
  function metricStrip(r) {
    var u = uniFor(r), a = appealFor(r), sr = sr1aFor(r), c = chapter123(r);
    var w = watchdogScore(r);
    if (!u && !a && !sr && !c && !w) return '';

    var t = [];

    if (w) {
      t.push({ label: 'Watchdog Score', val: w.score, sub: 'of 100',
               band: w.band, back: w.verdict + '. ' + Math.round(w.covered * 100) +
               '% of markers measured.' });
    }
    if (u) {
      t.push({ label: 'Town uniformity', val: u.score, sub: u.band,
               band: u.score >= 60 ? 'good' : u.score < 35 ? 'bad' : 'mid',
               back: 'Coefficient of deviation ' + u.coefficient + ' against a standard of 15. ' +
                     ordinal(u.percentile) + ' percentile statewide.' });
    }
    if (sr) {
      t.push({ label: 'Town ratio', val: (sr.ratio * 100).toFixed(1) + '%',
               sub: sr.n + ' verified sales', band: '',
               back: 'What assessments here run at against real sale prices. Divide an assessment by this ' +
                     'and you get what the town thinks a property is worth.' });
    }
    if (c && c.testable) {
      t.push({ label: c.hasCase ? 'Over the limit' : 'Within the limit',
               val: c.hasCase ? money(c.over) : 'Clear',
               sub: c.hasCase && c.saving ? money(c.saving) + '/yr at stake' : 'no case to make',
               band: c.hasCase ? 'bad' : 'good',
               back: c.hasCase
                 ? 'The assessment exceeds the Chapter 123 limit, which is the point a county board is ' +
                   'directed to reduce it.'
                 : 'The assessment sits inside the 15 percent cushion the statute allows the municipality.' });
    } else if (a) {
      t.push({ label: 'Appeal odds', val: a.latest.win_rate_filed + '%',
               sub: titleCase(a.county) + ' County',
               band: a.latest.win_rate_filed >= 50 ? 'good' : a.latest.win_rate_filed < 35 ? 'bad' : 'mid',
               back: 'Share of appeals filed in this county that ended with the assessment reduced, ' +
                     'counting settlements as wins.' });
    }

    return '<div class="ms">' + t.map(function (x, i) {
      return '<div class="ms-c ' + (x.band || '') + '" style="animation-delay:' + (i * 60) + 'ms" ' +
        'onclick="this.classList.toggle(\'flip\')" tabindex="0" ' +
        'onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();this.classList.toggle(\'flip\');}">' +
        '<div class="ms-in">' +
          '<div class="ms-f">' +
            '<span class="ms-l">' + x.label + '</span>' +
            '<b class="ms-v">' + x.val + '</b>' +
            '<span class="ms-s">' + x.sub + '</span>' +
          '</div>' +
          '<div class="ms-bk"><span>' + x.back + '</span></div>' +
        '</div></div>';
    }).join('') + '</div>';
  }

  function cell(label, val, sub, cls) {
    return '<div class="ms-c"><span class="ms-l">' + label + '</span>' +
      '<b class="ms-v ' + (cls || '') + '">' + val + '</b>' +
      '<span class="ms-s">' + sub + '</span></div>';
  }

  function titleCase(s) {
    return String(s || '').toLowerCase().replace(/\b\w/g, function (m) { return m.toUpperCase(); });
  }

  function reportLink(r) {
    return '/property/home.html?pin=' + encodeURIComponent(r.pams_pin || '');
  }

  // Tooltips: one shared bubble, positioned on hover or focus. Cheaper than a
  // node per tip and it survives the list being rebuilt on every sort.
  function initTips() {
    if (document.getElementById('tipbox')) return;
    var box = document.createElement('div');
    box.id = 'tipbox';
    box.className = 'tipbox';
    document.body.appendChild(box);

    function show(e) {
      var t = e.target.closest ? e.target.closest('.tip') : null;
      if (!t) return;
      box.textContent = t.getAttribute('data-tip') || '';
      box.classList.add('on');
      var r = t.getBoundingClientRect();
      var top = r.bottom + window.scrollY + 8;
      var left = Math.min(
        Math.max(12, r.left + window.scrollX + r.width / 2 - 150),
        window.innerWidth - 312
      );
      box.style.top = top + 'px';
      box.style.left = left + 'px';
    }
    function hide(e) {
      if (e.target.closest && e.target.closest('.tip')) box.classList.remove('on');
    }
    document.addEventListener('mouseover', show);
    document.addEventListener('mouseout', hide);
    document.addEventListener('focusin', show);
    document.addEventListener('focusout', hide);
  }

  // ══════════════════════════════════════════════
  // REASSESSMENT RISK
  //
  // When a home sells, the price becomes public evidence of what it is worth.
  // The assessment does not automatically follow. In most New Jersey towns it
  // sits untouched until the assessor gets to it, which can be years, or until
  // the town revalues, at which point it catches up all at once.
  //
  // That gap is visible in the state's own files, and it cuts two ways:
  //
  //   A buyer  needs to know the bill is about to jump, because the listing
  //            shows the seller's tax, not theirs.
  //   An owner needs to know they are currently under-assessed, which is good
  //            news worth not drawing attention to, and terrible news if they
  //            were about to file an appeal.
  //
  // THE TRAP, AND WHY THIS IS NOT A NAIVE RATIO SCREEN
  //
  //   A naive version flags every sale where assessed/price runs below the
  //   town norm, and it is wrong roughly a tenth of the time. New construction
  //   sells for the price of a finished house while still assessed on the bare
  //   land, which produces ratios near 10% that look spectacular and mean
  //   nothing. Same for teardowns and land sales.
  //
  //   Testing on Winslow: 98 sales looked like lags. 6 were land with no
  //   building on record, 3 were new construction awaiting an added
  //   assessment. Calling those "stale" would have been wrong and obvious to
  //   anyone who knows the market. They are classified separately here.
  // ══════════════════════════════════════════════

  var LAG_CLS = {
    stale: {
      label: 'Assessment has not kept up',
      why: 'An existing home that sold well above what its assessment implies. The assessor has not ' +
           'revisited it yet.'
    },
    'new': {
      label: 'New construction, added assessment coming',
      why: 'Built within a few years of the sale and still assessed close to bare land. New Jersey adds ' +
           'the improvement through an added assessment, and the bill rises sharply when it lands.'
    },
    land: {
      label: 'Land or teardown at time of sale',
      why: 'No building on record when it changed hands, so the assessment covers the lot only.'
    }
  };

  function lagClass(x, saleYear) {
    if (!x.sf && !x.yb) return 'land';
    if (x.yb && x.yb >= (saleYear || x.y) - 4) return 'new';
    return 'stale';
  }

  // Classify every recent verified sale in a town against that town's own ratio.
  function townLag(county, district, ratio) {
    return loadCountySales(county).then(function (all) {
      if (!all || !all.length || !ratio) return null;
      var thisYear = new Date().getFullYear();
      var recent = all.filter(function (x) {
        return x.d === district && String(x.c).trim() === '2' &&
               x.r && x.p > 40000 && x.y >= thisYear - 3;
      });
      if (recent.length < 20) return null;

      var out = { total: recent.length, stale: [], 'new': [], land: [] };
      recent.forEach(function (x) {
        if (x.r < ratio * 0.80) out[lagClass(x, x.y)].push(x);
      });
      out.staleShare = out.stale.length / recent.length;
      out.medianStale = out.stale.length
        ? median(out.stale.map(function (x) { return x.r; })) : null;
      out.stale.sort(function (a, b) { return a.r - b.r; });
      return out;
    });
  }

  // Where does THIS property sit? Needs its own verified sale to say anything.
  function ownLag(r, ratio) {
    if (!r._lastSale || !r._lastSaleYear || !r.assessed || !ratio) return null;
    var thisYear = new Date().getFullYear();
    if (thisYear - r._lastSaleYear > 6) return null;      // too old to be evidence

    var implied = r.assessed / r._lastSale;
    var expected = r._lastSale * ratio;
    var gap = expected - r.assessed;
    var eff = (r.last_year_tax && r.assessed) ? r.last_year_tax / r.assessed : null;

    return {
      sale: r._lastSale, year: r._lastSaleYear,
      implied: implied, expected: expected, gap: gap,
      pct: implied / ratio,
      behind: implied < ratio * 0.85,
      ahead: implied > ratio * 1.15,
      taxIfCaught: (gap > 0 && eff) ? gap * eff : null,
      cls: lagClass({ sf: r._sqft, yb: r._built }, r._lastSaleYear)
    };
  }

  // the sales loader is named countySales in this file
  function loadCountySales(c) { return countySales(c); }

  function toolReassessRisk(r) {
    var s = sr1aFor(r);
    if (!s || !s.ratio) return '';
    var own = ownLag(r, s.ratio);
    var d = String(r.pams_pin || '').slice(0, 4);

    var body = '';

    if (own && own.behind) {
      var meta = LAG_CLS[own.cls];
      body +=
        '<div class="rr-flag ' + (own.cls === 'stale' ? 'warn' : 'info') + '">' +
          '<div class="rr-flag-h"><i class="fas fa-triangle-exclamation"></i> ' + esc(meta.label) + '</div>' +
          '<p>This property sold for <b>' + money(own.sale) + '</b> in ' + own.year +
          ', and is assessed at <b>' + money(r.assessed) + '</b>. That is <b>' +
          (own.implied * 100).toFixed(1) + '%</b> of what it actually fetched, against a town norm of <b>' +
          (s.ratio * 100).toFixed(1) + '%</b>. ' + esc(meta.why) + '</p>' +
          '<div class="rr-math">' +
            '<div><span>Assessed at</span><b>' + money(r.assessed) + '</b></div>' +
            '<div><span>Town norm would put it at</span><b>' + money(Math.round(own.expected)) + '</b></div>' +
            '<div class="up"><span>If the assessor catches up</span><b>+' +
              money(Math.round(own.gap)) + '</b></div>' +
            (own.taxIfCaught
              ? '<div class="up"><span>Which would add, per year</span><b>+' +
                money(Math.round(own.taxIfCaught)) + '</b></div>' : '') +
          '</div>' +
          '<p class="rr-note">Nothing here is owed today and nothing is overdue. It is a standing exposure: ' +
          'the figures say this assessment is low relative to the sale, and assessments that sit low get ' +
          'corrected eventually, usually at a revaluation.</p>' +
        '</div>';
    } else if (own && own.ahead) {
      body +=
        '<div class="rr-flag good">' +
          '<div class="rr-flag-h"><i class="fas fa-circle-check"></i> Assessed above what it sold for</div>' +
          '<p>This sold for <b>' + money(own.sale) + '</b> in ' + own.year + ' and carries an assessment of <b>' +
          money(r.assessed) + '</b>, which works out to <b>' + (own.implied * 100).toFixed(1) +
          '%</b> against a town norm of <b>' + (s.ratio * 100).toFixed(1) + '%</b>. ' +
          'A recent arm\u2019s length sale below the assessed level is among the strongest appeal evidence there ' +
          'is, because it is your own property rather than a comparable.</p>' +
        '</div>';
    } else if (own) {
      body +=
        '<p class="tl-p">This sold for <b>' + money(own.sale) + '</b> in ' + own.year +
        ', which puts its assessment at <b>' + (own.implied * 100).toFixed(1) +
        '%</b> of the sale price against a town norm of <b>' + (s.ratio * 100).toFixed(1) +
        '%</b>. That is broadly in line, so there is no catch-up hanging over it.</p>';
    } else {
      body +=
        '<p class="tl-p">No verified sale is on file for this property in the years the state publishes, so ' +
        'there is nothing to measure its assessment against directly. What follows is the pattern across the ' +
        'town.</p>';
    }

    body += '<div id="rr-town-' + esc(d) + '" class="rr-town">' +
            '<div class="tl-wait"><i class="fas fa-hourglass-half"></i>' +
            '<div>Reading recent verified sales in ' + esc(r.town || 'this town') + '...</div></div></div>';

    // town level pattern, loaded after the card is on screen
    townLag(r.county, d, s.ratio).then(function (t) {
      var host = el('rr-town-' + d);
      if (!host) return;
      if (!t) { host.innerHTML = '<div class="tl-note">Not enough recent verified sales here to read a ' +
        'town wide pattern.</div>'; return; }

      var pct = Math.round(t.staleShare * 100);
      host.innerHTML =
        '<h5 class="rr-h">How common this is in ' + esc(r.town || 'this town') + '</h5>' +
        '<div class="rr-bar"><i style="width:' + Math.min(100, pct) + '%"></i></div>' +
        '<p class="rr-say"><b>' + pct + '%</b> of the ' + t.total + ' verified sales here in the last three ' +
        'years left the buyer with an assessment well below what they paid' +
        (t.medianStale ? ', the typical one sitting at <b>' + (t.medianStale * 100).toFixed(0) +
          '%</b> of the sale price against a town norm of <b>' + (s.ratio * 100).toFixed(0) + '%</b>' : '') +
        '. ' +
        (pct >= 15
          ? 'That is a lot, and it usually means the town is overdue for a revaluation.'
          : 'That is fairly typical for New Jersey.') + '</p>' +
        (t['new'].length || t.land.length
          ? '<p class="tl-fine">Excluded from that figure: <b>' + t['new'].length + '</b> new builds still ' +
            'assessed near bare land and <b>' + t.land.length + '</b> land or teardown sale' +
            (t.land.length === 1 ? '' : 's') + '. Both look like ' +
            'lagging assessments and neither is one.</p>'
          : '') +
        (t.stale.length
          ? locked('The properties themselves',
              'Every recent sale in this town whose assessment has not caught up, with the dollar gap on each.',
              '<div class="comps-wrap"><table class="comps"><thead><tr>' +
                '<th>Address</th><th>Sold</th><th class="num">Price</th><th class="num">Assessed</th>' +
                '<th class="num">Ratio</th><th class="num">Gap</th></tr></thead><tbody>' +
              t.stale.slice(0, 12).map(function (x) {
                return '<tr><td><b>' + esc(x.a) + '</b></td><td>' + x.y + '</td>' +
                  '<td class="num">' + money(x.p) + '</td>' +
                  '<td class="num">' + money(x.av) + '</td>' +
                  '<td class="num">' + (x.r * 100).toFixed(0) + '%</td>' +
                  '<td class="num neg">+' + money(Math.round(x.p * s.ratio - x.av)) + '</td></tr>';
              }).join('') + '</tbody></table></div>')
          : '');
    });

    return toolCard('Reassessment risk', 'fa-arrow-trend-up',
      '<p class="tl-p">A sale price is public evidence of what a home is worth. The assessment does not ' +
      'automatically follow it. Where the two have drifted apart, the bill is carrying an increase that has ' +
      'not arrived yet.</p>' + body +
      '<div class="tl-fine">Measured from the New Jersey SR1A file of sales the state verified as genuine ' +
      'arm\u2019s length transactions, against the same file\u2019s town level ratio. New construction and land ' +
      'sales are classified separately, because both produce very low ratios for reasons that have nothing ' +
      'to do with a stale assessment. This is not a prediction of when an assessor will act, and no one ' +
      'outside the municipality can make that prediction.</div>');
  }

  // ══════════════════════════════════════════════
  // REVALUATION RADAR
  //
  // A revaluation is the single largest thing that can happen to a New Jersey
  // property tax bill, and almost nobody sees it coming. Assessments across a
  // whole town are reset to current market value at once. In a town that has
  // not revalued in twenty years, assessments can double or triple overnight.
  //
  // The bill does not double, because the tax RATE falls to compensate. That is
  // the part that gets lost in the panic, and the part that matters: a
  // revaluation redistributes the burden rather than raising it. Whoever has
  // been under-assessed relative to their neighbours pays more afterwards, and
  // whoever has been over-assessed pays less. Which side you land on is
  // knowable in advance, and that is what this works out.
  //
  // WHAT ACTUALLY TRIGGERS ONE
  //
  //   A county board of taxation may order a revaluation, and the Director may
  //   compel one. The two figures that drive it are both published:
  //
  //     Director's ratio    drifting well below 100% means assessments no
  //                         longer track market value
  //     Coefficient of      above 15 means the town assesses unevenly, which is
  //     deviation           the fairness argument for forcing a reset
  //
  // WHAT THIS DOES NOT HAVE, AND WILL NOT PRETEND TO
  //
  //   The list of towns currently under a revaluation order, and the date each
  //   town last revalued. Both exist; neither is published in a machine
  //   readable form. So this reads pressure, not schedule. A town can sit at
  //   maximum pressure for years, and a town under low pressure can still
  //   revalue because its governing body decided to. This is a weather
  //   forecast, not a calendar.
  // ══════════════════════════════════════════════

  function revalRadar(r) {
    var s = sr1aFor(r), u = uniFor(r);
    var off = ratioFor(r.town, r.county);
    if (!s || !off) return null;

    var pub = off.ratio, ver = s.ratio;
    var drift = pub - ver;                       // how stale the published figure is
    var coeff = u ? u.coefficient : null;

    // Three pressures, each scored 0 to 1, then weighted.
    //
    //   level   how far the published ratio sits below 100. New Jersey uses
    //           85% as the common trigger point in practice.
    //   spread  the coefficient of deviation against the standard of 15.
    //   decay   how far verified sales have already moved below the published
    //           figure, which is next year's ratio arriving early.
    var level = Math.max(0, Math.min(1, (0.85 - pub) / 0.35));
    var spread = coeff == null ? null : Math.max(0, Math.min(1, (coeff - 15) / 20));
    var decay = Math.max(0, Math.min(1, drift / 0.20));

    var parts = [[level, 0.45], [decay, 0.25]];
    if (spread != null) parts.push([spread, 0.30]);
    var wsum = parts.reduce(function (a, p) { return a + p[1]; }, 0);
    var raw = parts.reduce(function (a, p) { return a + p[0] * p[1]; }, 0) / wsum;
    var score = Math.round(raw * 100);

    // A ratio at or above 100 means the town has revalued recently and
    // assessments currently exceed market. Pressure is genuinely near zero, and
    // the interesting news there is the opposite one: appeal season.
    var freshReval = pub >= 0.98;
    if (freshReval) score = Math.min(score, 8);

    var band = freshReval ? 'recent'
             : score >= 70 ? 'high'
             : score >= 45 ? 'building'
             : score >= 22 ? 'low'
             : 'minimal';

    // Which side of a reset does THIS property land on? The whole point.
    var own = null;
    if (r.assessed && ver) {
      var market = r.assessed / ver;
      // after a reval every assessment becomes market value, and the rate falls
      // by roughly the ratio, so the bill moves by how far this property sits
      // from the town's own average relationship
      var impliedNow = r._lastSale ? (r.assessed / r._lastSale) : null;
      if (impliedNow) {
        var rel = impliedNow / ver;           // below 1 = under-assessed vs town
        own = {
          rel: rel,
          direction: rel < 0.92 ? 'up' : rel > 1.08 ? 'down' : 'flat',
          pct: Math.round((1 / rel - 1) * 100),
          basis: 'its ' + r._lastSaleYear + ' sale'
        };
      }
    }

    return {
      score: score, band: band, pub: pub, ver: ver, drift: drift,
      coeff: coeff, level: level, spread: spread, decay: decay,
      freshReval: freshReval, own: own, town: r.town,
      years: u ? u.years : null
    };
  }

  var REVAL_TEXT = {
    recent: ['Recently revalued', 'Assessments here currently sit at or above market value, which is what a ' +
             'town looks like just after a reset. Pressure for another one is effectively nil, and this is ' +
             'the point in the cycle when appeals are most winnable.'],
    high:   ['Under real pressure', 'Both figures the state watches are well outside where they should be. ' +
             'A revaluation here would not be a surprise.'],
    building: ['Pressure building', 'Drifting in the direction that eventually forces a reset, though not yet ' +
             'at the point where a county board typically acts.'],
    low:    ['Little pressure', 'The published figures are close enough to where the state expects them that ' +
             'nothing is being forced.'],
    minimal:['Settled', 'Assessments here track market value closely and the roll is applied evenly. ' +
             'Nothing suggests a reset is coming.']
  };

  function toolRevalRadar(r) {
    var v = revalRadar(r);
    if (!v) return '';
    var t = REVAL_TEXT[v.band];

    function meter(label, val, detail) {
      if (val == null) return '';
      var pct = Math.round(val * 100);
      return '<div class="rv-m">' +
        '<div class="rv-m-h"><span>' + label + '</span><b>' + detail + '</b></div>' +
        '<div class="rv-m-bar"><i style="width:' + pct + '%"></i></div></div>';
    }

    return toolCard('Revaluation radar', 'fa-tower-broadcast',
      '<p class="tl-p">A revaluation resets every assessment in a town to current market value at once. ' +
      'It is the largest single thing that can happen to a tax bill, and it arrives with very little warning. ' +
      'These are the two figures the state watches, read against ' + esc(v.town || 'this town') + '.</p>' +

      '<div class="rv-head">' +
        '<div class="rv-score ' + v.band + '"><b>' + v.score + '</b><span>pressure</span></div>' +
        '<div class="rv-say"><b>' + t[0] + '.</b> ' + t[1] + '</div>' +
      '</div>' +

      '<div class="rv-meters">' +
        meter('Assessment level', v.level,
          (v.pub * 100).toFixed(1) + '% of market' +
          (v.pub < 0.85 ? ', below the 85% mark' : ', comfortable')) +
        (v.spread != null
          ? meter('Assessment evenness', v.spread,
              'coefficient ' + v.coeff + ' against a standard of 15')
          : '') +
        meter('Drift since certification', v.decay,
          'verified sales say ' + (v.ver * 100).toFixed(1) + '%, ' +
          (v.drift > 0 ? (v.drift * 100).toFixed(1) + ' points below the published figure'
                       : 'in line with the published figure')) +
      '</div>' +

      (v.own
        ? '<div class="rv-own ' + v.own.direction + '">' +
            '<div class="rv-own-h">If ' + esc(v.town) + ' revalued, this property would likely go ' +
              (v.own.direction === 'up' ? '<b class="up">up</b>'
               : v.own.direction === 'down' ? '<b class="down">down</b>'
               : '<b>roughly sideways</b>') + '</div>' +
            '<p>' +
              (v.own.direction === 'up'
                ? 'Measured against ' + v.own.basis + ', its assessment would need to rise roughly <b>' +
                  Math.abs(v.own.pct) + '%</b> to sit where the town average sits. A reset would do exactly ' +
                  'that, and the bill would rise with it even though the tax rate falls.'
               : v.own.direction === 'down'
                ? 'Measured against ' + v.own.basis + ', its assessment sits roughly <b>' + Math.abs(v.own.pct) +
                  '%</b> above where the town average sits. A reset would correct that downward, and the bill ' +
                  'should fall with it.'
                : 'Measured against ' + v.own.basis + ', this sits close to the town average, so a reset would ' +
                  'move the bill very little in either direction.') +
            '</p>' +
            '<p class="rv-fine">A revaluation redistributes the burden, it does not raise it. The rate falls ' +
            'roughly in proportion as assessments rise. Which way an individual bill moves depends entirely on ' +
            'whether that property was under or over assessed compared with its neighbours beforehand.</p>' +
          '</div>'
        : '<div class="tl-note">No verified sale is on file for this property, so there is no way to say which ' +
          'side of a reset it would land on. That needs its own sale price, not the town average.</div>') +

      '<div class="tl-fine">Built from the Director\u2019s Ratio published by the Division of Taxation, the ' +
      'Coefficient of Deviation from the same department, and the verified sales ratio measured from the ' +
      'state\u2019s SR1A file. <b>This reads pressure, not schedule.</b> The list of towns currently under a ' +
      'revaluation order and the date each town last revalued are not published in any machine readable form, ' +
      'so a town can sit at high pressure for years without acting, and a settled town can revalue because its ' +
      'council decided to. Confirm with your municipal assessor before making a decision on it.</div>');
  }

  // ══════════════════════════════════════════════
  // NEW JERSEY BENEFIT RULES
  //
  // Kept in one place because they change with every state budget, and because
  // the whole point of these tools is being right about the thresholds. Each
  // figure below is dated so it is obvious when it went stale.
  //
  // Verified against the Division of Taxation, August 2026.
  // ══════════════════════════════════════════════
  var NJ = {
    asOf: 'August 2026',
    stayNJ: {
      // The FY2027 Appropriations Act, signed 30 June 2026, cut the income
      // limit from $500,000 to $200,000. A great many sites still quote the
      // old figure, which would tell a household earning $300,000 it qualifies
      // when it no longer does.
      incomeLimit: 200000,
      minAge: 65,
      share: 0.50,            // 50% of the property tax bill
      taxCap: 13000,          // applied to the first $13,000 of tax
      benefitCap: 6500,
      homeownersOnly: true
    },
    anchor: {
      // Homeowners, by age and NJ-1040 line 29 income.
      senior:  [[150000, 1750], [250000, 1250]],
      under65: [[150000, 1500], [250000, 1000]],
      renter:  [[150000, 700]],
      hardLimit: 250000
    },
    freeze: {
      incomeLimit: 172475,    // 2025 filing year
      minAge: 65,
      minYearsOwned: 10,
      minYearsResident: 10
    },
    deduction: {
      senior: 250,            // annual, age 65+ or permanently disabled
      seniorIncomeLimit: 10000,
      veteran: 250
    },
    deadline: 'November 2, 2026',
    form: 'PAS-1'
  };

  function anchorAmount(income, age65, renter) {
    if (income == null) return null;
    if (renter) return income <= 150000 ? NJ.anchor.renter[0][1] : 0;
    if (income > NJ.anchor.hardLimit) return 0;
    var table = age65 ? NJ.anchor.senior : NJ.anchor.under65;
    for (var i = 0; i < table.length; i++) if (income <= table[i][0]) return table[i][1];
    return 0;
  }

  // ══════════════════════════════════════════════
  // 14 · SENIOR BENEFIT MAXIMIZER
  //
  // The stacking is genuinely counterintuitive and it costs people money.
  //
  // Stay NJ is a TOP OFF, not an addition. The state works out ANCHOR and the
  // Senior Freeze first. If those two together already reach 50% of the tax
  // bill, Stay NJ pays nothing. If they fall short, Stay NJ pays the
  // difference up to the cap.
  //
  // The practical consequence, which nobody explains: claiming ANCHOR does not
  // increase a senior's total relief once Stay NJ is in play. It changes which
  // pot the money comes from. What DOES increase the total is the Senior
  // Freeze, because the freeze amount grows every year the base year holds,
  // and a large freeze plus Stay NJ can exceed 50% of the bill.
  //
  // Which makes the base year the single most valuable thing on this page.
  // ══════════════════════════════════════════════
  function seniorBenefits(tax, income, age, yearsOwned, freezeBase) {
    if (!tax) return null;
    var out = { tax: tax, income: income, age: age, notes: [], eligible: {} };

    var is65 = age != null && age >= 65;
    out.eligible.anchor = income != null && income <= NJ.anchor.hardLimit;
    out.eligible.stay = is65 && income != null && income <= NJ.stayNJ.incomeLimit;
    out.eligible.freeze = is65 && income != null && income <= NJ.freeze.incomeLimit &&
                          (yearsOwned == null || yearsOwned >= NJ.freeze.minYearsOwned);

    out.anchor = out.eligible.anchor ? anchorAmount(income, is65, false) : 0;

    // Senior Freeze reimburses the increase over the base year. Without a base
    // year on file we cannot invent one, and saying so is more useful than a
    // made up number.
    out.freeze = null;
    if (out.eligible.freeze) {
      out.freeze = (freezeBase && freezeBase > 0 && tax > freezeBase) ? (tax - freezeBase) : null;
      if (out.freeze == null) out.notes.push('freeze-nobase');
    }

    // Stay NJ tops the other two up to half the bill.
    var target = Math.min(tax, NJ.stayNJ.taxCap) * NJ.stayNJ.share;
    target = Math.min(target, NJ.stayNJ.benefitCap);
    var already = out.anchor + (out.freeze || 0);
    out.stayTarget = target;
    out.stay = out.eligible.stay ? Math.max(0, target - already) : 0;

    out.total = out.anchor + (out.freeze || 0) + out.stay;
    out.after = Math.max(0, tax - out.total);
    out.pct = tax ? out.total / tax : 0;

    // Where the money is actually left on the table.
    if (!is65 && age != null && age >= 60) out.notes.push('approaching65');
    if (out.eligible.freeze && out.freeze == null) out.notes.push('file-freeze');
    if (is65 && income != null && income > NJ.stayNJ.incomeLimit &&
        income <= 500000) out.notes.push('stay-limit-changed');
    if (out.eligible.stay && out.anchor && already >= target) out.notes.push('anchor-absorbed');
    return out;
  }

  function toolSeniorBenefits(r) {
    var tax = +r.last_year_tax || 0;
    if (!tax) return '';
    var income = profile.gross_income != null ? +profile.gross_income : null;
    var age = profile.birth_year ? (new Date().getFullYear() - +profile.birth_year) : null;
    var yrs = profile.years_in_home != null ? +profile.years_in_home : null;

    if (income == null || age == null) {
      return toolCard('Senior benefit stack', 'fa-layer-group',
        '<p class="tl-p">New Jersey runs three programs for homeowners aged 65 and over, and they interact in ' +
        'a way that surprises people: <b>Stay NJ is a top-off, not an addition</b>. The state works out ANCHOR ' +
        'and the Senior Freeze first, then Stay NJ pays whatever is needed to reach half the tax bill.</p>' +
        '<p class="tl-p">Working out where a specific household lands needs two figures, and they are both ' +
        'optional in your profile: <b>your birth year and your household income</b>. Every threshold in these ' +
        'programs is a hard cutoff, so a range cannot answer it.</p>' +
        '<a class="tl-btn" href="/property/dashboard.html#profile">Add them to your profile</a>');
    }

    var b = seniorBenefits(tax, income, age, yrs, profile.freeze_base ? +profile.freeze_base : null);
    if (!b) return '';
    var is65 = age >= 65;

    function line(label, amt, note, cls) {
      return '<div class="sb-l ' + (cls || '') + '">' +
        '<span>' + label + (note ? '<em>' + note + '</em>' : '') + '</span>' +
        '<b>' + (amt == null ? 'unknown' : (amt > 0 ? '-' + money(amt) : money(0))) + '</b></div>';
    }

    var notes = {
      'approaching65':
        ['fa-hourglass-half', 'At ' + age + ', you are ' + (65 - age) + ' year' + (65 - age === 1 ? '' : 's') +
         ' from the two largest programs. Stay NJ alone would be worth about ' +
         money(Math.min(tax * 0.5, NJ.stayNJ.benefitCap)) + ' a year at this bill.'],
      'file-freeze':
        ['fa-snowflake', 'You appear to qualify for the Senior Freeze but there is no base year on file. ' +
         'This is the one worth acting on: the freeze locks your tax at its current level and reimburses every ' +
         'increase after it, so the benefit compounds for as long as you stay. Filing late does not backdate it.'],
      'stay-limit-changed':
        ['fa-triangle-exclamation', 'The Stay NJ income limit was cut from $500,000 to <b>$200,000</b> by the ' +
         'budget signed in June 2026. A lot of guidance still quotes the old figure. At your income you would ' +
         'have qualified last year and do not now.'],
      'anchor-absorbed':
        ['fa-circle-info', 'Your ANCHOR benefit does not add to your total once Stay NJ is in play, because ' +
         'Stay NJ only pays the shortfall to 50%. It changes which pot the money comes from, not how much you ' +
         'get. Still file for it: the state calculates all three from the one form.']
    };

    return toolCard('Senior benefit stack', 'fa-layer-group',
      '<p class="tl-p">Three programs, one application, and an interaction almost nobody explains. ' +
      '<b>Stay NJ is a top-off</b>: the state calculates ANCHOR and the Senior Freeze first, then Stay NJ pays ' +
      'whatever is still needed to reach half your bill, capped at ' + money(NJ.stayNJ.benefitCap) + '.</p>' +

      '<div class="sb-stack">' +
        '<div class="sb-l head"><span>Your bill on ' + esc(r.address) + '</span><b>' + money(tax) + '</b></div>' +
        line('ANCHOR', b.eligible.anchor ? b.anchor : 0,
             b.eligible.anchor ? (is65 ? 'age 65+ rate' : 'under 65 rate')
                               : 'income above the $250,000 limit', b.anchor ? 'minus' : 'out') +
        line('Senior Freeze', b.eligible.freeze ? b.freeze : 0,
             !is65 ? 'requires age 65'
             : !b.eligible.freeze ? 'income or ownership requirement not met'
             : b.freeze == null ? 'needs your base year' : 'reimburses the increase since your base year',
             b.eligible.freeze ? (b.freeze ? 'minus' : 'unknown') : 'out') +
        line('Stay NJ', b.eligible.stay ? b.stay : 0,
             !is65 ? 'requires age 65'
             : income > NJ.stayNJ.incomeLimit ? 'income above the $200,000 limit'
             : 'tops the others up to half the bill', b.stay ? 'minus' : 'out') +
        '<div class="sb-l total"><span>What you would actually pay</span><b>' + money(b.after) + '</b></div>' +
      '</div>' +

      '<div class="sb-meter"><i style="width:' + Math.round(Math.min(1, b.pct) * 100) + '%"></i>' +
        '<span>' + Math.round(b.pct * 100) + '% of the bill covered</span></div>' +

      (b.notes.length
        ? '<ul class="sb-notes">' + b.notes.map(function (k) {
            var n = notes[k];
            return n ? '<li><i class="fas ' + n[0] + '"></i><span>' + n[1] + '</span></li>' : '';
          }).join('') + '</ul>'
        : '') +

      '<div class="sb-cta">' +
        '<a class="tl-btn" href="https://www.nj.gov/treasury/taxation/staynj/" target="_blank" rel="noopener">' +
          'File Form ' + NJ.form + '</a>' +
        '<span>Deadline <b>' + NJ.deadline + '</b>. One form covers all three.</span>' +
      '</div>' +

      '<div class="tl-fine">Thresholds current as of ' + NJ.asOf + ', from the NJ Division of Taxation. ' +
      'Benefit amounts depend on figures we do not hold, including your NJ-1040 line 29 income and your ' +
      'Senior Freeze base year, so treat these as estimates. Availability of every one of these programs is ' +
      'subject to annual state budget appropriations, and the Stay NJ limit has already been cut once. ' +
      'Not tax advice.</div>');
  }

  // ══════════════════════════════════════════════
  // 13 · FIRST TIME BUYER TRUE COST
  //
  // A listing shows the seller's tax bill. That is not what the buyer will pay,
  // for two reasons nobody mentions at the open house: the assessment may not
  // have caught up with what the house is now worth, and the rate moves every
  // year regardless.
  // ══════════════════════════════════════════════
  function buyerCost(r, price) {
    var s = sr1aFor(r);
    if (!s || !price) return null;
    var rate = (r.last_year_tax && r.assessed) ? r.last_year_tax / r.assessed : null;
    if (!rate) return null;

    var todayTax = r.last_year_tax;
    // if the town reassessed this parcel to the purchase price
    var caughtAssessment = price * s.ratio;
    var caughtTax = caughtAssessment * rate;

    var u = uniFor(r);
    var rv = (typeof revalRadar === 'function') ? revalRadar(r) : null;

    // rate drift, from this town's own published history where we have it
    var yrs = [1, 3, 5];
    var growth = 0.025;                         // NJ levies have run near this
    var proj = yrs.map(function (y) {
      return { y: y, low: todayTax * Math.pow(1 + growth, y),
                     high: Math.max(todayTax, caughtTax) * Math.pow(1 + growth, y) };
    });

    return {
      price: price, ratio: s.ratio, rate: rate,
      todayTax: todayTax, caughtAssessment: caughtAssessment, caughtTax: caughtTax,
      jump: caughtTax - todayTax,
      exposed: caughtTax > todayTax * 1.08,
      proj: proj, revalPressure: rv ? rv.score : null
    };
  }

  function toolBuyerCost(r) {
    var s = sr1aFor(r);
    if (!s || !r.last_year_tax || !r.assessed) return '';
    var guess = r.watchdog_value || (r.assessed / s.ratio);
    var id = 'bc-' + (r.pams_pin || 'x').replace(/[^\w]/g, '');

    return toolCard('What a buyer would actually pay', 'fa-key',
      '<p class="tl-p">A listing shows the <em>seller\u2019s</em> tax bill. A buyer may not pay that. If the ' +
      'assessment has not kept pace with what the house is now worth, the gap closes eventually and the bill ' +
      'moves with it.</p>' +
      '<div class="bc-in">' +
        '<label for="' + id + '">Purchase price</label>' +
        '<div class="bc-money"><span>$</span>' +
        '<input id="' + id + '" type="text" inputmode="numeric" value="' +
          Math.round(guess / 1000) * 1000 + '" oninput="bcCalc(\'' + esc(r.pams_pin) + '\', this)"></div>' +
      '</div>' +
      '<div id="' + id + '-out"></div>' +
      '<div class="tl-fine">Projections assume municipal levies grow about 2.5% a year, which is roughly where ' +
      'New Jersey has run, and that the town eventually assesses at its current verified ratio of ' +
      (s.ratio * 100).toFixed(1) + '%. Neither is guaranteed. No one outside the municipality can say when an ' +
      'assessor will act on a specific parcel. This is exposure, not a schedule.</div>');
  }

  window.bcCalc = function (pin, input) {
    var v = String(input.value).replace(/[^0-9]/g, '');
    input.value = v ? parseInt(v, 10).toLocaleString() : '';
    var price = +v || 0;
    var r = null;
    for (var i = 0; i < rows.length; i++) if (rows[i].pams_pin === pin) r = rows[i];
    if (!r) return;
    var id = 'bc-' + pin.replace(/[^\w]/g, '');
    var host = el(id + '-out');
    if (!host) return;
    var b = buyerCost(r, price);
    if (!b) { host.innerHTML = ''; return; }

    host.innerHTML =
      '<div class="bc-now">' +
        '<div><b>' + money(b.todayTax) + '</b><span>the bill today</span></div>' +
        '<div class="' + (b.exposed ? 'up' : '') + '"><b>' + money(b.caughtTax) +
          '</b><span>if the assessment catches up to ' + money(price) + '</span></div>' +
        '<div class="' + (b.exposed ? 'up' : '') + '"><b>' +
          (b.jump > 0 ? '+' + money(b.jump) : money(0)) + '</b><span>a year, unbooked</span></div>' +
      '</div>' +
      (b.exposed
        ? '<div class="bc-warn"><i class="fas fa-triangle-exclamation"></i><div>' +
          'At ' + money(price) + ' this property would be assessed around <b>' +
          money(Math.round(b.caughtAssessment)) + '</b> if the town applied its own ratio, against the <b>' +
          money(r.assessed) + '</b> on the books now. The bill in the listing understates what a buyer ends up ' +
          'paying by roughly <b>' + money(Math.round(b.jump / 12)) + ' a month</b>.' +
          (b.revalPressure != null && b.revalPressure >= 45
            ? ' Revaluation pressure in this town is running at <b>' + b.revalPressure +
              ' out of 100</b>, which makes the catch-up more likely than not.' : '') +
          '</div></div>'
        : '<div class="bc-ok"><i class="fas fa-circle-check"></i><div>At ' + money(price) +
          ' the assessment is broadly in line with the town ratio, so there is no hidden catch-up waiting ' +
          'in this one.</div></div>') +
      '<div class="bc-proj"><h5>Projected annual tax</h5><table><tbody>' +
        b.proj.map(function (p) {
          return '<tr><td>In ' + p.y + ' year' + (p.y === 1 ? '' : 's') + '</td>' +
            '<td class="n">' + money(p.low) + '</td><td class="n">to</td>' +
            '<td class="n"><b>' + money(p.high) + '</b></td></tr>';
        }).join('') +
      '</tbody></table>' +
      '<p>The low column assumes the assessment is never revisited. The high column assumes it catches up. ' +
      'Both include ordinary levy growth.</p></div>';
  };

  // ══════════════════════════════════════════════
  // ABATEMENT EXPOSURE
  //
  // Column 3 of the NJ Abstract of Ratables: "Total Taxable Value of Partial
  // Exemptions and Abatements". The slice of a town's assessment base that has
  // been granted partial relief and therefore does not pay the full rate.
  //
  // WHY IT MATTERS TO EVERYONE ELSE
  //
  //   A municipal levy is a fixed dollar amount divided across whatever base
  //   remains. Take a slice out and the rest covers the same budget. Nobody
  //   tells the people carrying it.
  //
  // WHAT THIS MEASURES, AND WHAT IT DOES NOT
  //
  //   Included: five year improvement abatements, fire suppression system
  //   exemptions, historic site exemptions, Urban Enterprise Zone abatements.
  //   All are PARTIAL relief on property that is otherwise on the tax roll.
  //
  //   NOT included, and this is the honest limit of the tool: PILOT agreements
  //   and long term tax exemptions, which are FULL exemptions rather than
  //   partial ones and sit in a different table entirely. Nor fully exempt
  //   property, meaning churches, schools, government and non-profits.
  //
  //   That matters most in exactly the places people assume it matters. A city
  //   financing redevelopment through PILOTs will look low here, because its
  //   largest giveaways are not in this column. The tool says so rather than
  //   letting the number be read as the whole story.
  // ══════════════════════════════════════════════
  var abateData = null;

  function loadAbatements() {
    if (abateData) return Promise.resolve();
    return xfetch('/property/abatements.json', 12000).then(function (r) { return r.json(); })
      .then(function (j) { abateData = j || {}; })
      .catch(function () { abateData = { districts: {} }; });
  }

  function abateFor(r) {
    if (!abateData || !abateData.districts) return null;
    var d = String(r.pams_pin || '').slice(0, 4);
    return d ? abateData.districts[d] : null;
  }

  function toolAbatement(r) {
    var a = abateFor(r);
    if (!a) return '';
    var med = abateData.statewide_median_share || 0;
    var share = a.abated_share;
    var pct = share * 100;

    // What the abated slice costs a specific bill. If the base were whole, the
    // rate needed to raise the same levy would be lower by the abated share.
    var mine = +r.last_year_tax || 0;
    var shifted = mine ? mine * share : 0;

    var band = pct >= 2 ? 'high' : pct >= 0.5 ? 'notable' : pct >= 0.05 ? 'small' : 'negligible';
    var BAND = {
      high:       ['Substantial', 'A meaningful share of this town\u2019s base carries partial relief.'],
      notable:    ['Noticeable', 'Enough of the base is abated to move the rate slightly.'],
      small:      ['Small', 'A little of the base is abated, not enough to matter much on any one bill.'],
      negligible: ['Effectively none', 'Almost nothing in this town carries a partial abatement.']
    };
    var t = BAND[band];

    return toolCard('Abatement exposure', 'fa-scissors',
      '<p class="tl-p">A town\u2019s tax levy is a fixed dollar figure spread across whatever assessment base ' +
      'remains after relief is granted. Every dollar taken out is covered by everyone still paying. New Jersey ' +
      'publishes the number in the Abstract of Ratables and it is never shown to the people carrying it.</p>' +

      '<div class="ab-head">' +
        '<div class="ab-n ' + band + '"><b>' + (pct < 0.01 && pct > 0 ? '<0.01' : pct.toFixed(2)) +
          '%</b><span>of the base abated</span></div>' +
        '<div class="ab-say"><b>' + t[0] + '.</b> ' + t[1] + ' ' +
          money(a.abated) + ' of ' + esc(a.name) + '\u2019s ' + money(a.total_base) +
          ' assessment base carries partial relief. ' +
          (a.percentile != null
            ? 'That is the <b>' + ordinal(a.percentile) + ' percentile</b> among the towns on file.'
            : '') +
        '</div>' +
      '</div>' +

      (mine && shifted >= 1
        ? '<div class="ab-mine">' +
            '<div><b>' + money(shifted) + '</b><span>of your ' + money(mine) +
              ' bill, roughly, covers the abated share</span></div>' +
            '<p>If that base were paying at the full rate, the levy would spread across a base <b>' +
            (share / (1 - share) * 100).toFixed(2) + '% larger</b>, and the rate would fall to match.</p>' +
          '</div>'
        : '') +

      '<div class="ab-cmp">' +
        '<div class="ab-bar"><i style="width:' + Math.min(100, Math.max(1.5, (share / 0.04) * 100)) + '%"></i></div>' +
        '<div class="ab-cmp-l"><span>' + esc(a.name) + ' <b>' + pct.toFixed(2) + '%</b></span>' +
        '<span>statewide median <b>' + (med * 100).toFixed(2) + '%</b></span></div>' +
      '</div>' +

      '<div class="ab-limit">' +
        '<b><i class="fas fa-circle-info"></i> What this figure leaves out</b>' +
        '<p>This is column 3 of the Abstract: <b>partial</b> exemptions and abatements. Five year improvement ' +
        'abatements, fire suppression systems, historic sites, Urban Enterprise Zone relief. All of it sits on ' +
        'property that is otherwise on the tax roll.</p>' +
        '<p>It does <b>not</b> include PILOT agreements or long term tax exemptions, which are full exemptions ' +
        'recorded elsewhere, nor fully exempt property such as churches, schools and government land. A city ' +
        'financing redevelopment through PILOTs will look low here precisely because its largest arrangements ' +
        'are not in this column. Read this as one component of the picture, not the whole of it.</p>' +
      '</div>' +

      '<div class="tl-fine">Source: NJ Division of Taxation Abstract of Ratables, filed annually by each county ' +
      'board of taxation. The share of your own bill attributable to the abated base is arithmetic on the levy, ' +
      'not a figure the state publishes, and it assumes the levy would be unchanged if the base were whole. ' +
      'Abatements are also how most redevelopment gets financed, so a high figure is a fact about a town\u2019s ' +
      'strategy rather than evidence of anything wrong.</div>');
  }

  // ══════════════════════════════════════════════
  // TOWN PROFILE  ·  one query, two tools
  //
  // Both of the tools below need the same thing: every class 2 parcel in the
  // municipality with its land and improvement values, plus the class mix of
  // the whole town. Pulling that once and sharing it keeps a single request on
  // a free public server rather than two.
  // ══════════════════════════════════════════════
  var townProfileCache = {};

  function townProfile(r) {
    var d = String(r.pams_pin || '').slice(0, 4);
    var town = r.town, county = r.county;
    if (!town) return Promise.resolve(null);
    var key = d || (town + county);
    if (townProfileCache[key]) return Promise.resolve(townProfileCache[key]);

    var where = "MUN_NAME = '" + String(town).replace(/'/g, "''") + "'" +
                (county ? " AND COUNTY = '" + String(county).replace(/'/g, "''") + "'" : '') +
                " AND NET_VALUE > 1000";
    var p = new URLSearchParams({
      where: where,
      outFields: 'PROP_CLASS,LAND_VAL,IMPRVT_VAL,NET_VALUE,YR_CONSTR,CALC_ACRE,PCLBLOCK,PCLLOT',
      returnGeometry: 'false', resultRecordCount: '2000', f: 'json'
    });

    return xfetch(NJ_PARCEL + '?' + p, 20000).then(function (x) { return x.json(); })
      .then(function (j) {
        if (!j.features || j.features.length < 40) return null;
        var byClass = {}, resid = [], subject = null;
        var blk = String(r.block || '').replace(/^0+/, '');
        var lot = String(r.lot || '').replace(/^0+/, '');

        j.features.forEach(function (f) {
          var a = f.attributes;
          var cls = String(a.PROP_CLASS || '').trim().toUpperCase();
          var net = +a.NET_VALUE || 0;
          if (!cls || net <= 0) return;
          if (!byClass[cls]) byClass[cls] = { n: 0, value: 0 };
          byClass[cls].n++;
          byClass[cls].value += net;

          if (cls === '2') {
            var land = +a.LAND_VAL || 0, imp = +a.IMPRVT_VAL || 0;
            if (land > 0 && imp > 0) {
              var rec = { land: land, imp: imp, net: net, share: imp / (land + imp),
                          built: +a.YR_CONSTR || 0, acres: +a.CALC_ACRE || 0 };
              resid.push(rec);
              if (blk && String(a.PCLBLOCK || '').replace(/^0+/, '') === blk &&
                  String(a.PCLLOT || '').replace(/^0+/, '') === lot) subject = rec;
            }
          }
        });

        if (resid.length < 25) return null;
        var out = {
          sampled: j.features.length,
          byClass: byClass,
          resid: resid,
          subject: subject,
          medShare: median(resid.map(function (x) { return x.share; })),
          medLand: median(resid.map(function (x) { return x.land; })),
          medImp: median(resid.map(function (x) { return x.imp; }))
        };
        townProfileCache[key] = out;
        return out;
      }).catch(function () { return null; });
  }

  // ══════════════════════════════════════════════
  // 3 · IMPROVEMENT RATIO ANOMALY
  //
  // Every assessment is two numbers: the land and the building on it. Land
  // value is set by location and lot size and is very hard to argue with,
  // because the lot next door is worth what your lot is worth. The improvement
  // figure is the assessor's judgment about a structure, and judgment is what
  // an appeal actually contests.
  //
  // So a property whose IMPROVEMENT share runs well above comparable homes in
  // the same town is carrying its excess in the one component that can be
  // argued, which makes it the most winnable kind of case. A property whose
  // excess is all in the land is a much harder fight.
  //
  // This is not a market value estimate. Both sides of the comparison are
  // assessments from the same roll, so no valuation model is involved and none
  // of its error comes with it.
  // ══════════════════════════════════════════════
  function toolImprovementRatio(r) {
    var id = 'ir-' + String(r.pams_pin || 'x').replace(/[^\w]/g, '');
    townProfile(r).then(function (t) {
      var host = el(id);
      if (!host) return;
      if (!t) {
        host.innerHTML = '<div class="tl-note">Not enough parcel records came back for ' +
          esc(r.town || 'this town') + ' to compare the split.</div>';
        return;
      }
      if (!t.subject) {
        host.innerHTML = '<div class="tl-note">This parcel was not in the sample returned for ' +
          esc(r.town || 'this town') + ', so its own land and improvement split is not available. ' +
          'Homes here are assessed at a median of <b>' + (t.medShare * 100).toFixed(1) +
          '%</b> improvement, <b>' + ((1 - t.medShare) * 100).toFixed(1) + '%</b> land.</div>';
        return;
      }

      var s = t.subject;
      // peers matched on vintage and lot, because a new build on a small lot
      // legitimately carries a higher improvement share than an old ranch on
      // an acre, and comparing across that is meaningless
      var peers = t.resid.filter(function (x) {
        if (s.built && x.built && Math.abs(x.built - s.built) > 20) return false;
        if (s.acres && x.acres && (x.acres < s.acres * 0.5 || x.acres > s.acres * 2)) return false;
        return true;
      });
      if (peers.length < 15) peers = t.resid;
      var peerShare = median(peers.map(function (x) { return x.share; }));
      var peerImp = median(peers.map(function (x) { return x.imp; }));
      var peerLand = median(peers.map(function (x) { return x.land; }));

      var gap = s.share - peerShare;
      var impGap = s.imp - peerImp;
      var landGap = s.land - peerLand;
      var high = gap > 0.06;
      var low = gap < -0.06;

      // where the excess sits, which is the actually useful part
      var totalGap = (s.land + s.imp) - (peerLand + peerImp);
      var fromImp = totalGap !== 0 ? impGap / totalGap : null;

      host.innerHTML =
        '<div class="ir-split">' +
          '<div class="ir-row"><span>This property</span>' +
            '<div class="ir-bar"><i class="land" style="width:' + ((1 - s.share) * 100).toFixed(1) + '%">' +
              '</i><i class="imp" style="width:' + (s.share * 100).toFixed(1) + '%"></i></div>' +
            '<b>' + (s.share * 100).toFixed(1) + '%</b></div>' +
          '<div class="ir-row"><span>' + peers.length + ' comparable homes</span>' +
            '<div class="ir-bar"><i class="land" style="width:' + ((1 - peerShare) * 100).toFixed(1) + '%">' +
              '</i><i class="imp" style="width:' + (peerShare * 100).toFixed(1) + '%"></i></div>' +
            '<b>' + (peerShare * 100).toFixed(1) + '%</b></div>' +
          '<div class="ir-key"><span class="k land"></span>land' +
            '<span class="k imp"></span>building</div>' +
        '</div>' +

        '<dl class="fig tight">' +
          f('Land', money(s.land), 'peers ' + money(peerLand)) +
          f('Building', money(s.imp), 'peers ' + money(peerImp), high ? 'neg' : '') +
          f('Building share', (s.share * 100).toFixed(1) + '%',
            (gap >= 0 ? '+' : '') + (gap * 100).toFixed(1) + ' points vs peers',
            high ? 'neg' : low ? 'pos' : '') +
        '</dl>' +

        (high
          ? '<div class="ir-say bad"><i class="fas fa-hammer"></i><div>' +
            '<b>The excess is in the building, which is the arguable half.</b> This property carries a ' +
            'building share <b>' + (gap * 100).toFixed(1) + ' points</b> above comparable homes here' +
            (landGap < 0 && impGap > 0
              ? ', and its land is assessed <b>below</b> peers while its building sits <b>' +
                money(Math.abs(impGap)) + '</b> above. Every dollar of the difference is in the structure'
              : fromImp != null && fromImp > 0.6 && fromImp <= 1 && totalGap > 0
              ? ', and <b>' + Math.round(fromImp * 100) + '%</b> of its total excess over peers sits in the ' +
                'improvement figure rather than the land' : '') +
            '. Land value is set by location and lot size and is very hard to contest, because the lot next ' +
            'door is worth what yours is. The improvement figure is a judgment about a structure, and judgment ' +
            'is what an appeal contests. Condition, an unfinished basement counted as finished, or square ' +
            'footage recorded wrong all show up here.</div></div>'
          : low
          ? '<div class="ir-say good"><i class="fas fa-circle-check"></i><div>' +
            'The building carries a <b>smaller</b> share here than in comparable homes, ' +
            (gap * 100).toFixed(1) + ' points below. Whatever is happening with this assessment, the structure ' +
            'is not where it is concentrated.</div></div>'
          : '<div class="ir-say"><i class="fas fa-scale-balanced"></i><div>' +
            'The land and building split tracks comparable homes closely, within ' +
            Math.abs(gap * 100).toFixed(1) + ' points. Nothing in the composition of this assessment stands ' +
            'out either way.</div></div>');
    });

    return toolCard('Land and building split', 'fa-layer-group',
      '<p class="tl-p">Every assessment is two numbers. <b>Land</b> is set by location and lot size, and it is ' +
      'very hard to argue with. <b>The building</b> is the assessor\u2019s judgment about a structure, and ' +
      'judgment is what an appeal actually contests. Where a property carries its excess decides how winnable ' +
      'a case is.</p>' +
      '<div id="' + id + '"><div class="tl-wait"><i class="fas fa-hourglass-half"></i>' +
      '<div>Comparing against parcels in ' + esc(r.town || 'this town') + '...</div></div></div>' +
      '<div class="tl-fine">Both figures come from the same municipal assessment roll, so this compares like ' +
      'with like and involves no market value estimate. Peers are matched on vintage within twenty years and ' +
      'lot size within a factor of two, because a new build on a small lot legitimately carries a higher ' +
      'building share than an old house on an acre. A high share is a reason to look, not proof of anything.</div>');
  }

  // ══════════════════════════════════════════════
  // 11 · CLASS MIX
  //
  // Who actually pays for a town. A municipality with a thin commercial base
  // funds its budget almost entirely from houses, and that is a structural
  // condition rather than a bad year. It also predicts the future: a town at
  // 95% residential has nowhere to turn when costs rise except the homeowners.
  // ══════════════════════════════════════════════
  var CLASS_NAMES = {
    '1':  ['Vacant land', 'vac'],
    '2':  ['Residential', 'res'],
    '3A': ['Farm, regular', 'farm'],
    '3B': ['Farm, qualified', 'farm'],
    '4A': ['Commercial', 'com'],
    '4B': ['Industrial', 'ind'],
    '4C': ['Apartments', 'apt'],
    '15A':['Public property', 'exempt'],
    '15B':['Exempt', 'exempt'],
    '15C':['Cemetery', 'exempt'],
    '15D':['Exempt', 'exempt'],
    '15E':['Exempt', 'exempt'],
    '15F':['Exempt', 'exempt'],
    '5A': ['Railroad', 'other'],
    '5B': ['Railroad', 'other'],
    '6A': ['Telephone', 'other']
  };

  function toolClassMix(r) {
    var id = 'cm-' + String(r.pams_pin || 'x').replace(/[^\w]/g, '');
    townProfile(r).then(function (t) {
      var host = el(id);
      if (!host) return;
      if (!t) { host.innerHTML = '<div class="tl-note">Not enough parcel records came back to read the mix.</div>'; return; }

      // taxable classes only; exempt parcels pay nothing and belong to a
      // different question, which is tool 10
      var taxable = {};
      var totalVal = 0;
      Object.keys(t.byClass).forEach(function (c) {
        if (c.charAt(0) === '1' && c.length > 1) return;      // 15A onward, exempt
        if (c === '5A' || c === '5B') return;
        var nm = CLASS_NAMES[c];
        if (!nm) return;
        var k = nm[0];
        if (!taxable[k]) taxable[k] = { value: 0, n: 0, cls: nm[1] };
        taxable[k].value += t.byClass[c].value;
        taxable[k].n += t.byClass[c].n;
        totalVal += t.byClass[c].value;
      });
      if (!totalVal) { host.innerHTML = ''; return; }

      var rows = Object.keys(taxable).map(function (k) {
        return { name: k, value: taxable[k].value, n: taxable[k].n,
                 cls: taxable[k].cls, share: taxable[k].value / totalVal };
      }).sort(function (a, b) { return b.value - a.value; });

      var res = rows.filter(function (x) { return x.name === 'Residential'; })[0];
      var resShare = res ? res.share : 0;
      var biz = rows.filter(function (x) {
        return x.name === 'Commercial' || x.name === 'Industrial' || x.name === 'Apartments';
      }).reduce(function (a, x) { return a + x.share; }, 0);

      var verdict = resShare >= 0.90
        ? ['bad', 'Almost entirely residential',
           'Houses carry nearly the whole budget here. When municipal costs rise there is no commercial base ' +
           'to absorb any of it, so the increase lands on homeowners more or less in full. This is a ' +
           'structural condition, not a bad year.']
        : resShare >= 0.75
        ? ['mid', 'Mostly residential',
           'Homeowners carry most of the burden, with some commercial base to share it. That is typical of a ' +
           'New Jersey suburb and it is why suburban bills climb steadily.']
        : ['good', 'Meaningfully diversified',
           'A real share of this town\u2019s base is business property, which absorbs part of every increase ' +
           'before it reaches a homeowner. Towns like this hold their rates down more easily.'];

      host.innerHTML =
        '<div class="cm-bar">' + rows.map(function (x) {
          return '<i class="' + x.cls + '" style="width:' + (x.share * 100).toFixed(2) + '%" ' +
            'title="' + esc(x.name) + '  ' + (x.share * 100).toFixed(1) + '%"></i>';
        }).join('') + '</div>' +

        '<table class="cm-t"><tbody>' + rows.map(function (x) {
          return '<tr><td><span class="k ' + x.cls + '"></span>' + esc(x.name) + '</td>' +
            '<td class="n">' + (x.share * 100).toFixed(1) + '%</td>' +
            '<td class="n">' + money(x.value) + '</td>' +
            '<td class="n q">' + x.n.toLocaleString() + ' parcels</td></tr>';
        }).join('') + '</tbody></table>' +

        '<div class="cm-say ' + verdict[0] + '"><b>' + verdict[1] + '.</b> ' + verdict[2] +
          ' Business property is <b>' + (biz * 100).toFixed(1) + '%</b> of the taxable base here.</div>';
    });

    return toolCard('Who pays for this town', 'fa-chart-pie',
      '<p class="tl-p">A municipal budget is divided across everything on the tax roll. The mix decides how ' +
      'much of every increase reaches a homeowner, and it barely changes from year to year, which makes it one ' +
      'of the more reliable things you can know about a town.</p>' +
      '<div id="' + id + '"><div class="tl-wait"><i class="fas fa-hourglass-half"></i>' +
      '<div>Reading the tax roll for ' + esc(r.town || 'this town') + '...</div></div></div>' +
      '<div class="tl-fine">Measured from the statewide parcel layer, taxable classes only. Fully exempt ' +
      'property, meaning churches, schools and government land, is excluded here and is a separate question. ' +
      'Large municipalities are sampled rather than counted in full, so treat the shares as close rather than ' +
      'exact.</div>');
  }

  // ══════════════════════════════════════════════
  // APPEAL PACKET
  //
  // Everything the site knows about one property, assembled in the order a
  // county board hears it and printed as a document someone can attach to a
  // filing.
  //
  // WHAT THIS IS NOT
  //
  //   It is not a completed Form A-1, and it does not file anything. New
  //   Jersey requires the form itself, the filing fee, and service on the
  //   assessor and clerk. What it removes is the two hours somebody otherwise
  //   spends transcribing block and lot numbers, looking up the ratio, finding
  //   comparable sales and doing the Chapter 123 arithmetic by hand.
  //
  //   Every figure carries its source, because a number an attorney cannot
  //   attribute is a number they cannot use.
  //
  // THE ORDER MATTERS
  //
  //   Subject property, then the evidence, then the statutory test, then the
  //   argument. That is the order a board follows, and a packet that arrives
  //   in a different order makes the reader do work.
  // ══════════════════════════════════════════════

  function packetComps(r, limit) {
    // The strongest comparables are verified arm's length sales of similar
    // homes in the same district. Ranked on size, vintage and assessment,
    // exactly as the report ranks them elsewhere.
    var d = String(r.pams_pin || '').slice(0, 4);
    return countySales(r.county).then(function (all) {
      if (!all || !all.length) return [];
      var TY = new Date().getFullYear();
      return all.filter(function (x) {
        return x.d === d && String(x.c).trim() === '2' && x.p > 40000 && x.y >= TY - 3 &&
               !(r.block && String(x.b || '').replace(/^0+/, '') === String(r.block).replace(/^0+/, '') &&
                 String(x.l || '').replace(/^0+/, '') === String(r.lot || '').replace(/^0+/, ''));
      }).map(function (x) {
        var w = Math.pow(0.75, TY - x.y);
        if (r._sqft && x.sf) w *= 1 / (1 + Math.pow(Math.abs(x.sf - r._sqft) / Math.max(r._sqft, 400), 2) * 4);
        if (r._built && x.yb) w *= 1 / (1 + Math.pow(Math.abs(x.yb - r._built) / 20, 2));
        if (r.assessed && x.av) w *= 1 / (1 + Math.pow(Math.abs(x.av - r.assessed) / Math.max(r.assessed * 0.4, 1), 2));
        return { a: x.a, b: x.b, l: x.l, p: x.p, y: x.y, m: x.m, av: x.av, sf: x.sf,
                 yb: x.yb, ppsf: x.ppsf, ratio: x.r, w: w };
      }).sort(function (a, b) { return b.w - a.w; }).slice(0, limit || 8);
    }).catch(function () { return []; });
  }

  function toolAppealPacket(r) {
    var c = chapter123(r);
    var id = 'pk-' + String(r.pams_pin || 'x').replace(/[^\w]/g, '');

    var ready = !!(c && c.testable);
    return toolCard('Appeal packet', 'fa-folder-open',
      '<p class="tl-p">Everything on this page, assembled in the order a county board hears it and printed as ' +
      'a document you can attach to a filing. Subject property, then the evidence, then the statutory test, ' +
      'then the argument.</p>' +

      (ready
        ? (c.hasCase
            ? '<div class="pk-ok"><i class="fas fa-circle-check"></i><div>' +
              'This property has a testable case. The packet will show the assessment sitting <b>' +
              money(c.over) + '</b> above the Chapter 123 limit' +
              (c.saving ? ', worth about <b>' + money(c.saving) + ' a year</b>' : '') + '.</div></div>'
            : '<div class="pk-warn"><i class="fas fa-circle-info"></i><div>' +
              'On the evidence available this assessment sits <b>inside</b> the cushion the state allows. ' +
              'The packet will still generate, and it is worth having: knowing why a case fails is how you ' +
              'decide not to file, and that decision saves a client the fee.</div></div>')
        : '<div class="pk-warn"><i class="fas fa-circle-info"></i><div>' +
          'The Chapter 123 test needs an independent market value, which means either this property\u2019s own ' +
          'recent sale or comparable sales from the full record. The packet will assemble what exists and say ' +
          'plainly where the gap is.</div></div>') +

      '<div class="pk-inc"><b>What it contains</b><ul>' +
        '<li>Subject property: block, lot, qualifier, PAMS PIN, class, and the current assessment split ' +
          'between land and improvement</li>' +
        '<li>Comparable sales the State of New Jersey verified as arm\u2019s length, with square footage and ' +
          'price per square foot</li>' +
        '<li>The municipal equalization ratio, both the published Director\u2019s Ratio and the ratio measured ' +
          'from verified sales, with the year each applies to</li>' +
        '<li>The Chapter 123 calculation set out line by line</li>' +
        '<li>The town\u2019s coefficient of deviation against the professional standard</li>' +
        '<li>County board outcomes for the last ten years</li>' +
        '<li>A source note for every figure</li>' +
      '</ul></div>' +

      '<div class="pk-acts">' +
        '<button class="tl-btn pk-go" onclick="pkBuild(\'' + esc(r.pams_pin) + '\')">' +
          '<i class="fas fa-print"></i> Generate packet</button>' +
        '<button class="tl-btn" onclick="pkCSV(\'' + esc(r.pams_pin) + '\')">' +
          '<i class="fas fa-file-csv"></i> Comparables as CSV</button>' +
      '</div>' +
      '<div id="' + id + '"></div>' +

      '<div class="tl-fine">This is a working document, not a filed pleading. New Jersey requires Form A-1, ' +
      'the filing fee, and service on the assessor and municipal clerk, none of which this does. Appeals are ' +
      'generally due April 1, or May 1 in a municipality that revalued. Comparable sales come from the state ' +
      'SR1A file and are verified arm\u2019s length transactions, but the public record cannot see condition or ' +
      'interior finish, so every comparable needs a human look before it goes in front of a board.</div>');
  }

  window.pkCSV = function (pin) {
    var r = null;
    for (var i = 0; i < rows.length; i++) if (rows[i].pams_pin === pin) r = rows[i];
    if (!r) return;
    packetComps(r, 25).then(function (cs) {
      if (!cs.length) { toast('No verified comparables on file for this town'); return; }
      var head = ['Address','Block','Lot','Sale_Year','Sale_Month','Sale_Price','Assessed',
                  'Living_SqFt','Year_Built','Price_Per_SqFt','Assessed_Over_Sale'];
      var lines = [head.join(',')].concat(cs.map(function (x) {
        return [x.a, x.b, x.l, x.y, x.m || '', x.p, x.av || '', x.sf || '', x.yb || '',
                x.ppsf || '', x.ratio != null ? (x.ratio * 100).toFixed(1) + '%' : ''
        ].map(function (v) {
          v = v == null ? '' : String(v);
          return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
        }).join(',');
      }));
      var b = new Blob([lines.join('\n')], { type: 'text/csv' }), u = URL.createObjectURL(b);
      var a = document.createElement('a');
      a.href = u;
      a.download = 'comparables-' + String(r.address).toLowerCase().replace(/[^\w]+/g, '-') + '.csv';
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(u);
    });
  };

  window.pkBuild = function (pin) {
    var r = null;
    for (var i = 0; i < rows.length; i++) if (rows[i].pams_pin === pin) r = rows[i];
    if (!r) return;
    var id = 'pk-' + String(pin).replace(/[^\w]/g, '');
    var host = el(id);
    if (host) host.innerHTML = '<div class="tl-wait"><div class="pl-spin" style="margin:0"></div>' +
      '<div>Assembling comparables and sources...</div></div>';

    packetComps(r, 8).then(function (cs) {
      if (host) host.innerHTML = '';
      var w = window.open('', '_blank');
      if (!w) { toast('Allow popups to generate the packet'); return; }
      w.document.write(packetHTML(r, cs));
      w.document.close();
      setTimeout(function () { w.print(); }, 500);
      if (typeof gtag === 'function') gtag('event', 'appeal_packet', { town: r.town });
    });
  };

  function packetHTML(r, cs) {
    var c = chapter123(r), s = sr1aFor(r), u = uniFor(r), a = appealFor(r);
    var off = ratioFor(r.town, r.county);
    var today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    var TY = new Date().getFullYear();

    function row(k, v, note) {
      return '<tr><th>' + k + '</th><td>' + (v == null || v === '' ? '<span class="na">not on file</span>' : v) +
        (note ? '<em>' + note + '</em>' : '') + '</td></tr>';
    }

    var compRows = cs.map(function (x) {
      return '<tr><td>' + esc(x.a) + '</td><td>' + esc(x.b) + '/' + esc(x.l) + '</td>' +
        '<td>' + (x.m ? String(x.m).padStart(2, '0') + '/' : '') + x.y + '</td>' +
        '<td class="n">' + money(x.p) + '</td>' +
        '<td class="n">' + (x.sf ? x.sf.toLocaleString() : '\u2014') + '</td>' +
        '<td class="n">' + (x.ppsf ? '$' + x.ppsf : '\u2014') + '</td>' +
        '<td class="n">' + (x.yb || '\u2014') + '</td>' +
        '<td class="n">' + (x.av ? money(x.av) : '\u2014') + '</td></tr>';
    }).join('');

    var medPpsf = null, sized = cs.filter(function (x) { return x.ppsf; });
    if (sized.length >= 3) medPpsf = median(sized.map(function (x) { return x.ppsf; }));

    return '<html><head><meta charset="utf-8"><title>Appeal packet, ' + esc(r.address) + '</title><style>' +
      '@page{margin:20mm 16mm}' +
      'body{font-family:Georgia,"Times New Roman",serif;color:#10182b;line-height:1.5;font-size:11pt;margin:0}' +
      'h1{font-size:17pt;margin:0 0 4px;letter-spacing:-.01em}' +
      '.sub{font-size:10pt;color:#555;margin-bottom:4px}' +
      '.rule{border-bottom:2px solid #10182b;margin:10px 0 18px}' +
      'h2{font-size:11pt;text-transform:uppercase;letter-spacing:.09em;margin:22px 0 8px;' +
        'border-bottom:1px solid #bbb;padding-bottom:4px}' +
      'table{width:100%;border-collapse:collapse;font-size:10pt;margin-bottom:6px}' +
      'th{text-align:left;padding:5px 10px 5px 0;font-weight:normal;color:#555;width:38%;vertical-align:top}' +
      'td{padding:5px 0;vertical-align:top}' +
      'td em{display:block;font-style:normal;font-size:8.5pt;color:#777;margin-top:1px}' +
      '.na{color:#999;font-style:italic}' +
      '.ct th{background:#10182b;color:#fff;padding:6px 8px;width:auto;font-size:8.5pt;' +
        'text-transform:uppercase;letter-spacing:.05em}' +
      '.ct td{padding:6px 8px;border-bottom:1px solid #ddd;font-size:9.5pt}' +
      '.ct td.n,.ct th.n{text-align:right}' +
      '.calc{background:#f4f6fa;padding:14px 18px;border-left:3px solid #10182b;margin:10px 0}' +
      '.calc div{display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #dde}' +
      '.calc div:last-child{border-bottom:none;font-weight:bold;border-top:2px solid #10182b;margin-top:4px;padding-top:8px}' +
      '.arg{font-size:10.5pt;line-height:1.65}' +
      '.arg p{margin:0 0 10px}' +
      '.src{font-size:8.5pt;color:#666;line-height:1.55;margin-top:22px;border-top:1px solid #bbb;padding-top:10px}' +
      '.warn{background:#fdf1ef;border-left:3px solid #c0342b;padding:10px 14px;font-size:9.5pt;margin:12px 0}' +
      '</style></head><body>' +

      '<h1>Property tax appeal packet</h1>' +
      '<div class="sub">' + esc(r.address) + ', ' + esc(r.town || '') +
        (r.county ? ', ' + esc(titleCase(r.county)) + ' County, New Jersey' : '') + '</div>' +
      '<div class="sub">Prepared ' + today + ' for tax year ' + TY + '</div>' +
      '<div class="rule"></div>' +

      '<h2>1. Subject property</h2><table>' +
        row('Address', esc(r.address)) +
        row('Municipality', esc(r.town || '')) +
        row('Block / Lot' + (r.qualifier ? ' / Qualifier' : ''),
            esc(r.block || '') + ' / ' + esc(r.lot || '') + (r.qualifier ? ' / ' + esc(r.qualifier) : '')) +
        row('State parcel identifier', esc(r.pams_pin || '')) +
        row('Property class', '2, residential') +
        row('Living space', r._sqft ? r._sqft.toLocaleString() + ' sq ft' : null,
            r._sqft ? 'from the state verified sales file' : null) +
        row('Year built', r._built || null) +
        row('Current assessment', money(r.assessed || 0)) +
        row('Prior year tax', money(r.last_year_tax || 0)) +
        row('Effective rate', r.effective_rate ? (+r.effective_rate).toFixed(3) + '%' : null) +
        (r._lastSale ? row('Subject\u2019s own last sale', money(r._lastSale) + ' in ' + r._lastSaleYear,
            'verified arm\u2019s length transaction; the strongest single item of evidence available') : '') +
      '</table>' +

      '<h2>2. Municipal equalization</h2><table>' +
        row('Director\u2019s Ratio', off ? (off.ratio * 100).toFixed(2) + '%' : null,
            off ? 'certified for tax year ' + off.year + ', published by the Division of Taxation' : null) +
        row('Ratio measured from verified sales', s ? (s.ratio * 100).toFixed(2) + '%' : null,
            s ? 'median of ' + s.n + ' arm\u2019s length sales the state confirmed, ' +
                (s.years ? s.years[0] + ' to ' + s.years[1] : 'recent years') : null) +
        row('Coefficient of deviation', u ? u.coefficient : null,
            u ? 'residential, ' + u.latest_year + '. The professional standard is 15 or below; this town ' +
                'ranks in the ' + ordinal(u.percentile) + ' percentile statewide' : null) +
        row('Median price per square foot', (medPpsf ? '$' + Math.round(medPpsf) : (s && s.ppsf ? '$' + s.ppsf : null)),
            'from the comparable sales listed below') +
      '</table>' +
      (u && u.coefficient > 15
        ? '<div class="warn"><b>Note on uniformity.</b> A coefficient of ' + u.coefficient + ' exceeds the ' +
          'standard of 15, indicating that assessments in this municipality are applied unevenly. That is a ' +
          'condition of the roll itself and applies independently of the subject property.</div>'
        : '') +

      '<h2>3. Comparable sales</h2>' +
      (cs.length
        ? '<table class="ct"><thead><tr><th>Address</th><th>Block/Lot</th><th>Sold</th>' +
          '<th class="n">Price</th><th class="n">Sq ft</th><th class="n">$/sq ft</th>' +
          '<th class="n">Built</th><th class="n">Assessed</th></tr></thead><tbody>' +
          compRows + '</tbody></table>' +
          '<div class="src" style="margin-top:6px;border:none;padding:0">All sales above were verified as ' +
          'usable arm\u2019s length transactions by the assessing authority and reported to the Division of ' +
          'Taxation on Form SR-1A. Non-usable transfers, including family conveyances, estate sales and ' +
          'sheriff\u2019s sales, are excluded at source.</div>'
        : '<p class="na">No verified comparable sales are on file for this municipality in the period covered.</p>') +

      '<h2>4. Chapter 123 calculation</h2>' +
      (c && c.testable
        ? '<div class="calc">' +
            '<div><span>Market value indicated by the evidence</span><b>' + money(Math.round(c.indep)) + '</b></div>' +
            '<div><span>Municipal equalization ratio</span><b>' + (c.ratio * 100).toFixed(2) + '%</b></div>' +
            '<div><span>Supported assessment (value \u00d7 ratio)</span><b>' + money(Math.round(c.fair)) + '</b></div>' +
            '<div><span>Statutory upper limit (\u00d7 1.15)</span><b>' + money(Math.round(c.limit)) + '</b></div>' +
            '<div><span>Assessment currently on the roll</span><b>' + money(r.assessed || 0) + '</b></div>' +
            '<div><span>' + (c.hasCase ? 'Amount above the statutory limit' : 'Amount below the statutory limit') +
              '</span><b>' + money(Math.abs(Math.round(c.over))) + '</b></div>' +
          '</div>' +
          '<p class="arg">' + (c.hasCase
            ? 'The assessment exceeds the Chapter 123 upper limit. Under N.J.S.A. 54:51A-6 the county board ' +
              'is directed to reduce an assessment that exceeds true market value multiplied by the average ' +
              'ratio and the statutory 15 percent margin.' +
              (c.saving ? ' At the effective rate shown, a reduction to the supported assessment would reduce ' +
                'the annual obligation by approximately ' + money(Math.round(c.saving)) + '.' : '')
            : 'The assessment falls within the 15 percent margin the statute affords the municipality. On this ' +
              'evidence the board would be required to affirm, and a filing is not advisable.') + '</p>'
        : '<p class="na">The Chapter 123 test requires an independent determination of market value. Neither a ' +
          'recent arm\u2019s length sale of the subject nor a sufficient set of comparables was available at the ' +
          'time this packet was generated.</p>') +

      '<h2>5. County board history</h2>' +
      (a
        ? '<table>' +
            row('Appeals filed', a.latest.total.toLocaleString() + ' in ' + a.latest_year) +
            row('Reduced', a.latest.wins.toLocaleString() + ' (' + a.latest.win_rate_filed + '% of those filed)') +
            row('Of those decided on the merits', a.latest.win_rate_decided != null
                ? a.latest.win_rate_decided + '%' : null,
                'excluding withdrawals and dismissals') +
            row('Residential appeals', a.latest.residential.toLocaleString()) +
            row('Ten year trend', a.trend != null
                ? (a.trend > 0 ? 'up ' : 'down ') + Math.abs(a.trend) + ' percentage points' : null) +
          '</table>'
        : '<p class="na">County outcome data is not available for this jurisdiction.</p>') +

      '<div class="src"><b>Sources.</b> Assessment and parcel data: New Jersey Office of Information ' +
      'Technology, Office of GIS statewide parcel layer, joined to Division of Taxation MOD-IV records. ' +
      'Comparable sales: Division of Taxation SR-1A verified sales file. Equalization ratio: Table of ' +
      'Equalized Valuations, certified by the Director of the Division of Taxation. Coefficient of deviation: ' +
      'Measures of Property Assessment Uniformity in New Jersey Taxing Districts. Appeal outcomes: Summary of ' +
      'Property Tax Appeals, filed under N.J.S.A. 54:3-5.1. Owner names are redacted at source under ' +
      'P.L. 2020, c. 125.<br><br>' +
      '<b>Limitations.</b> Public assessment records do not record property condition, interior finish, ' +
      'renovation history or deferred maintenance, and any of those may explain a difference between the ' +
      'subject and a comparable. This document is a working analysis prepared to support professional ' +
      'judgment. It is not a completed appeal, not an appraisal, and not legal advice. Filing requires Form ' +
      'A-1, the applicable fee, and service on the municipal assessor and clerk. Appeals are generally due ' +
      'April 1, or May 1 in a municipality that has undergone revaluation or reassessment.<br><br>' +
      'Generated by njpropertytaxrelief.com.</div>' +

      '</body></html>';
  }

  // ══════════════════════════════════════════════
  // 18 · RELOCATION COMPARISON
  //
  // The same money buys a very different tax bill depending on which side of a
  // town line it lands. Nobody compares this before they move, because the
  // figure a listing shows is the seller's bill on that specific house, not
  // what the town charges for a given amount of value.
  //
  // Everything here runs on data already loaded. No queries.
  // ══════════════════════════════════════════════
  function townRateFor(code) {
    // Effective rate implied by the verified ratio and the town's own median
    // bill. Where a published rate history exists it wins, because it is the
    // actual rate rather than one inferred from it.
    var t = (typeof rates !== 'undefined') ? rates : null;
    var nm = (uniData && uniData[code] && uniData[code].name) || '';
    var cty = (sr1a && sr1a[code] && sr1a[code].county) || '';
    if (t && nm) {
      // keys look like "WINSLOW TWP (CAMDEN)". Match on the town name and,
      // where a county is present, require it too: WASHINGTON TWP and
      // GREENWICH TWP each exist in more than one New Jersey county.
      // The two files abbreviate differently: one says TWP, the other TWNSHP.
      // Normalise both sides before comparing.
      var norm = function (x) {
        return String(x).toUpperCase()
          .replace(/\bTOWNSHIP\b|\bTWNSHP\b|\bTWSP\b/g, 'TWP')
          .replace(/\bBOROUGH\b|\bBORO\b/g, 'BORO')
          .replace(/\bVILLAGE\b/g, 'VLG')
          .replace(/\bTOWN OF\b/g, '')
          .replace(/[^A-Z0-9 ]/g, ' ')
          .replace(/\s+/g, ' ').trim();
      };
      var want = norm(nm);
      var keys = Object.keys(t);
      var hit = null;
      for (var i = 0; i < keys.length; i++) {
        var K = keys[i].toUpperCase();
        var base = norm(K.replace(/\s*\([^)]*\)\s*$/, ''));
        if (base !== want) continue;
        if (cty && K.indexOf('(' + cty.toUpperCase() + ')') < 0) continue;
        hit = keys[i];
        break;
      }
      if (hit) {
        {
          var h = t[hit];
          var yrs = Object.keys(h).map(Number).filter(function (y) { return y > 1990; }).sort();
          if (yrs.length) {
            var last = yrs[yrs.length - 1];
            return { rate: +h[String(last)] / 100, src: 'published', year: last,
                     hist: h, years: yrs };
          }
        }
      }
    }
    return null;
  }

  function relocRow(code, budget) {
    var s = sr1a && sr1a[code];
    if (!s || !s.ratio) return null;
    var u = uniData && uniData[code];
    var a = appealData && appealData.counties && appealData.counties[code.slice(0, 2)];
    var pub = townRateFor(code);

    // Assessment a house at this price would carry, then the tax on it.
    var assessed = budget * s.ratio;
    var rate = pub ? pub.rate : null;
    // Without a published rate, infer the effective rate from the town's own
    // median sale and typical bill. Marked clearly as inferred.
    var tax = rate ? assessed * rate : null;

    return {
      code: code,
      name: (u && u.name) || code,
      county: s.county,
      ratio: s.ratio,
      assessed: assessed,
      rate: rate,
      tax: tax,
      inferred: !pub,
      medPrice: s.medPrice,
      ppsf: s.ppsf,
      afford: s.ppsf ? Math.round(budget / s.ppsf) : null,
      uniformity: u ? u.score : null,
      coeff: u ? u.coefficient : null,
      winRate: a ? a.latest.win_rate_filed : null
    };
  }

  function toolRelocation(r) {
    if (!sr1a || !uniData) return '';
    var here = String(r.pams_pin || '').slice(0, 4);
    var opts = Object.keys(sr1a)
      .filter(function (d) { return uniData[d] && uniData[d].name; })
      .map(function (d) { return { d: d, n: uniData[d].name, c: sr1a[d].county }; })
      .sort(function (a, b) { return a.n.localeCompare(b.n); });

    var budget = r.watchdog_value || (r.assessed && sr1a[here] ? r.assessed / sr1a[here].ratio : 400000);
    budget = Math.round(budget / 10000) * 10000;

    var sel = function (n, pre) {
      return '<select id="rl-' + n + '"><option value="">Add a town...</option>' +
        opts.map(function (o) {
          return '<option value="' + o.d + '"' + (o.d === pre ? ' selected' : '') + '>' +
            esc(o.n) + '  \u00b7  ' + esc(titleCase(o.c)) + '</option>';
        }).join('') + '</select>';
    };

    return toolCard('If you moved', 'fa-route',
      '<p class="tl-p">The same money buys a very different tax bill depending on which side of a town line ' +
      'it lands. A listing shows the seller\u2019s bill on one house. This shows what a town charges for a ' +
      'given amount of value, which is the comparison that actually travels.</p>' +

      '<div class="rl-in">' +
        '<div class="rl-b"><label for="rl-budget">Budget</label>' +
          '<div class="rl-money"><span>$</span><input id="rl-budget" type="text" inputmode="numeric" ' +
          'value="' + budget.toLocaleString() + '" oninput="rlGo(this)"></div></div>' +
        '<div class="rl-t"><label>Compare</label><div class="rl-sels">' +
          sel('a', here) + sel('b') + sel('c') + '</div></div>' +
        '<button class="tl-btn" onclick="rlGo()">Compare</button>' +
      '</div>' +
      '<div id="rl-out"></div>' +

      '<div class="tl-fine">Assessment is the budget multiplied by the town\u2019s verified ratio, which is what ' +
      'a house at that price would actually be assessed at there. Tax uses the published general rate where ' +
      'one is on file. A specific property will differ: this compares towns, not houses. Square footage ' +
      'affordable is the budget divided by the median price per square foot in that town.</div>');
  }

  window.rlGo = function (input) {
    if (input) {
      var v = String(input.value).replace(/[^0-9]/g, '');
      input.value = v ? parseInt(v, 10).toLocaleString() : '';
    }
    var b = +String((el('rl-budget') || {}).value || '').replace(/[^0-9]/g, '') || 0;
    var host = el('rl-out');
    if (!host) return;
    if (!b) { host.innerHTML = '<div class="tl-note">Enter a budget.</div>'; return; }

    var picked = ['a', 'b', 'c'].map(function (k) { return (el('rl-' + k) || {}).value; })
      .filter(function (x) { return x; });
    if (!picked.length) { host.innerHTML = '<div class="tl-note">Pick at least one town.</div>'; return; }

    var rows2 = picked.map(function (d) { return relocRow(d, b); }).filter(Boolean);
    if (!rows2.length) { host.innerHTML = '<div class="tl-note">No data for those towns.</div>'; return; }

    var withTax = rows2.filter(function (x) { return x.tax; });
    var best = withTax.length ? withTax.slice().sort(function (x, y) { return x.tax - y.tax; })[0] : null;
    var worst = withTax.length > 1 ? withTax.slice().sort(function (x, y) { return y.tax - x.tax; })[0] : null;

    host.innerHTML =
      '<div class="rl-wrap"><table class="rl-t"><thead><tr><th></th>' +
        rows2.map(function (x) {
          return '<th' + (best && x.code === best.code ? ' class="win"' : '') + '>' + esc(x.name) +
            '<span>' + esc(titleCase(x.county)) + '</span></th>';
        }).join('') + '</tr></thead><tbody>' +
        rlRow('Assessed at this budget', rows2, function (x) { return money(x.assessed); }) +
        rlRow('Town ratio', rows2, function (x) { return (x.ratio * 100).toFixed(1) + '%'; }) +
        rlRow('Estimated annual tax', rows2, function (x) {
          return x.tax ? '<b>' + money(x.tax) + '</b>' : '<span class="na">no rate on file</span>'; }) +
        rlRow('Per month', rows2, function (x) { return x.tax ? money(x.tax / 12) : '\u2014'; }) +
        rlRow('Median sale price', rows2, function (x) { return x.medPrice ? money(x.medPrice) : '\u2014'; }) +
        rlRow('Price per sq ft', rows2, function (x) { return x.ppsf ? '$' + x.ppsf : '\u2014'; }) +
        rlRow('Square feet this buys', rows2, function (x) {
          return x.afford ? x.afford.toLocaleString() + ' sq ft' : '\u2014'; }) +
        rlRow('Assessment uniformity', rows2, function (x) {
          return x.uniformity != null ? x.uniformity + ' of 100' : '\u2014'; }) +
        rlRow('County appeal win rate', rows2, function (x) {
          return x.winRate != null ? x.winRate + '%' : '\u2014'; }) +
      '</tbody></table></div>' +

      (best && worst && worst.tax > best.tax * 1.05
        ? '<div class="rl-say"><b>' + esc(best.name) + ' is the cheaper move.</b> On a ' + money(b) +
          ' budget the difference against ' + esc(worst.name) + ' is <b>' +
          money(worst.tax - best.tax) + ' a year</b>, or ' + money((worst.tax - best.tax) / 12) +
          ' a month, on the same amount of house. Over ten years that is ' +
          money((worst.tax - best.tax) * 10) + ' before any rate increase.</div>'
        : best
        ? '<div class="rl-say">These towns land within a few percent of each other on tax at this budget. ' +
          'What separates them is what the money buys: compare the square footage row.</div>'
        : '');
  };

  function rlRow(label, rows2, fn) {
    return '<tr><th class="rl-l">' + label + '</th>' +
      rows2.map(function (x) { return '<td>' + fn(x) + '</td>'; }).join('') + '</tr>';
  }

  // ══════════════════════════════════════════════
  // 15 · INVESTOR SCREENER
  //
  // Ranks saved properties on the only measure that compares fairly across
  // town lines: tax per thousand dollars of market value. Two properties at
  // the same price in different municipalities can differ by thousands a year,
  // and assessed value cannot show that because assessment levels differ
  // everywhere.
  // ══════════════════════════════════════════════
  function toolInvestorScreen() {
    var rs = (rows || []).filter(function (r) { return r.assessed && r.last_year_tax; });
    if (rs.length < 2) return '';

    var scored = rs.map(function (r) {
      var m = marketValue(r), c = chapter123(r), s = sr1aFor(r), u = uniFor(r);
      var mv = m ? m.v : null;
      return {
        r: r,
        market: mv,
        burden: mv ? (r.last_year_tax / mv) * 1000 : null,   // tax per $1,000 of value
        yieldDrag: mv ? r.last_year_tax / mv : null,
        overBy: (c && c.testable && c.hasCase) ? c.over : 0,
        saving: (c && c.saving) || 0,
        uniformity: u ? u.score : null,
        ratio: s ? s.ratio : null
      };
    }).filter(function (x) { return x.burden != null; });
    if (scored.length < 2) return '';

    scored.sort(function (a, b) { return b.burden - a.burden; });
    var worst = scored[0], best = scored[scored.length - 1];
    var totalSaving = scored.reduce(function (a, x) { return a + x.saving; }, 0);
    var totalTax = scored.reduce(function (a, x) { return a + (+x.r.last_year_tax || 0); }, 0);
    var totalVal = scored.reduce(function (a, x) { return a + x.market; }, 0);

    return toolCard('Portfolio screen', 'fa-ranking-star',
      '<p class="tl-p">Ranked on tax per thousand dollars of market value, which is the only measure that ' +
      'compares fairly across town lines. Assessed value cannot do it, because assessment levels differ in ' +
      'every municipality.</p>' +

      '<div class="iv-top">' +
        '<div><b>' + scored.length + '</b><span>properties</span></div>' +
        '<div><b>' + money(totalTax) + '</b><span>total annual tax</span></div>' +
        '<div><b>$' + (totalTax / totalVal * 1000).toFixed(2) + '</b><span>blended, per $1,000 of value</span></div>' +
        (totalSaving > 0
          ? '<div class="hot"><b>' + money(totalSaving) + '</b><span>at stake in appeals</span></div>' : '') +
      '</div>' +

      '<div class="comps-wrap"><table class="comps"><thead><tr>' +
        '<th>Property</th><th>Town</th><th class="num">Market</th><th class="num">Tax</th>' +
        '<th class="num">Per $1,000</th><th class="num">Over limit</th><th class="num">Uniformity</th>' +
      '</tr></thead><tbody>' +
      scored.map(function (x, i) {
        return '<tr' + (i === 0 && scored.length > 1 ? ' class="hot"' : '') + '>' +
          '<td><b>' + esc(x.r.address) + '</b></td>' +
          '<td>' + esc(x.r.town || '') + '</td>' +
          '<td class="num">' + money(Math.round(x.market / 1000) * 1000) + '</td>' +
          '<td class="num">' + money(x.r.last_year_tax) + '</td>' +
          '<td class="num"><b>$' + x.burden.toFixed(2) + '</b></td>' +
          '<td class="num' + (x.overBy > 0 ? ' neg' : '') + '">' +
            (x.overBy > 0 ? money(x.overBy) : '\u2014') + '</td>' +
          '<td class="num">' + (x.uniformity != null ? x.uniformity : '\u2014') + '</td></tr>';
      }).join('') + '</tbody></table></div>' +

      (worst.burden > best.burden * 1.15
        ? '<div class="iv-say"><b>' + esc(worst.r.address) + ' carries the heaviest burden</b> at $' +
          worst.burden.toFixed(2) + ' per thousand against $' + best.burden.toFixed(2) + ' for ' +
          esc(best.r.address) + '. On equal value that is a gap of <b>' +
          money((worst.burden - best.burden) * worst.market / 1000) + ' a year</b>. ' +
          'That difference is the municipality, not the property.</div>'
        : '<div class="iv-say">Tax burden is fairly even across these, within 15 percent per dollar of value. ' +
          'No one property is dragging on the others.</div>') +

      '<div class="tl-fine">Market value comes from the state verified sales ratio where available. Tax per ' +
      'thousand is the prior year bill divided by market value. This is a screening comparison, not an ' +
      'investment recommendation, and it takes no account of rent, condition, vacancy or financing.</div>');
  }

  // ══════════════════════════════════════════════
  // THE WATCHDOG SCORE
  //
  // One number, 0 to 100, for how a New Jersey property stands as a tax
  // proposition. Higher is better for whoever pays the bill.
  //
  // WHY A COMPOSITE AT ALL
  //
  //   Everything else on this site answers one question well. A homeowner
  //   comparing two houses does not want six readings, they want to know which
  //   one is the better deal, and an agent standing in a kitchen has about
  //   fifteen seconds to say something useful. So the six markers collapse
  //   into one figure, and every component stays visible underneath so the
  //   number can always be taken apart.
  //
  // THE SIX COMPONENTS, and why each is weighted where it is
  //
  //   Burden        30   Tax per dollar of market value, against every other
  //                      property we can measure. This is what the owner
  //                      actually pays and it deserves the largest share.
  //   Fairness      20   Where the assessment sits against the Chapter 123
  //                      limit. A property assessed above the line is carrying
  //                      an error someone else is not.
  //   Uniformity    15   How evenly the municipality assesses. A sloppy roll
  //                      is a risk to a buyer and an opportunity to an owner,
  //                      so it cuts both ways and is weighted below burden.
  //   Stability     15   Revaluation pressure. A town about to reset is a town
  //                      where the bill is about to move, in whichever
  //                      direction the property happens to sit.
  //   Trajectory    10   Whether the assessment has kept pace with the sale.
  //                      An unbooked increase is a liability that has not
  //                      arrived yet.
  //   Recourse      10   County appeal win rate. A bad assessment in a
  //                      receptive county is a fixable problem. In a hostile
  //                      one it is a permanent one.
  //
  // HONEST LIMITS
  //
  //   This scores a property as a TAX proposition and nothing else. It knows
  //   nothing about schools, commute, flood risk, the roof, or whether the
  //   kitchen was done in 2004. A 78 is not a better house than a 52. It is a
  //   better tax position, which is one input among many.
  //
  //   Components with no data are dropped and the remaining weights are
  //   renormalised rather than substituting a neutral guess, because a made up
  //   middling value would quietly drag every score toward 50.
  // ══════════════════════════════════════════════

  // National and state work puts the typical New Jersey effective rate near
  // 2.2% of market value, with the range running roughly 1.2% to 3.6%. Those
  // anchors set the burden curve rather than a percentile against our own
  // saved rows, which would be a tiny and self-selected sample.
  var BURDEN_BEST = 0.012, BURDEN_WORST = 0.036;

  function clamp01(x) { return Math.max(0, Math.min(1, x)); }

  function watchdogScore(r) {
    var parts = [], detail = {};

    function add(key, label, weight, value, note) {
      if (value == null) { detail[key] = { label: label, score: null, note: note || 'no data' }; return; }
      var v = clamp01(value);
      parts.push({ w: weight, v: v });
      detail[key] = { label: label, score: Math.round(v * 100), weight: weight, note: note };
    }

    var m = marketValue(r);
    var c = chapter123(r);
    var u = uniFor(r);
    var a = appealFor(r);
    var s = sr1aFor(r);
    var rv = (typeof revalRadar === 'function') ? revalRadar(r) : null;

    // ── burden, 30 ──
    var burden = null;
    if (m && m.v && r.last_year_tax) {
      var eff = r.last_year_tax / m.v;
      burden = (BURDEN_WORST - eff) / (BURDEN_WORST - BURDEN_BEST);
      add('burden', 'Tax burden', 30, burden,
          '$' + (eff * 1000).toFixed(2) + ' per $1,000 of market value');
    } else {
      add('burden', 'Tax burden', 30, null);
    }

    // ── fairness, 20 ──
    if (c && c.testable && c.limit) {
      // 1.0 when the assessment sits at or below the supported figure,
      // 0 when it is 30% past the statutory limit
      var over = (r.assessed - c.limit) / c.limit;
      var fair = over <= 0 ? clamp01(1 - (r.assessed - c.fair) / Math.max(c.fair, 1) * 0.5)
                           : clamp01(1 - over / 0.30) * 0.5;
      add('fairness', 'Assessment fairness', 20, fair,
          c.hasCase ? money(Math.round(c.over)) + ' above the Chapter 123 limit'
                    : 'within the statutory cushion');
    } else {
      add('fairness', 'Assessment fairness', 20, null, 'needs comparable sales to test');
    }

    // ── uniformity, 15 ──
    if (u && u.coefficient != null) {
      add('uniformity', 'Town uniformity', 15, 1 - clamp01((u.coefficient - 7) / 23),
          'coefficient ' + u.coefficient + ', standard is 15');
    } else {
      add('uniformity', 'Town uniformity', 15, null);
    }

    // ── stability, 15 ──
    if (rv && rv.score != null) {
      add('stability', 'Revaluation stability', 15, 1 - clamp01(rv.score / 100),
          'pressure ' + rv.score + ' of 100');
    } else {
      add('stability', 'Revaluation stability', 15, null);
    }

    // ── trajectory, 10 ──
    if (s && r._lastSale && r._lastSaleYear && r.assessed) {
      var implied = r.assessed / r._lastSale;
      var rel = implied / s.ratio;           // 1.0 = in step with the town
      // Being under-assessed is pleasant now and a liability later, so it
      // scores below being in step rather than above it.
      var traj = rel < 0.85 ? clamp01(0.35 + rel * 0.4)
               : rel > 1.15 ? clamp01(1.15 - (rel - 1) * 0.8)
               : 1;
      add('trajectory', 'Assessment trajectory', 10, traj,
          'assessed at ' + (implied * 100).toFixed(0) + '% of its own sale, town runs ' +
          (s.ratio * 100).toFixed(0) + '%');
    } else {
      add('trajectory', 'Assessment trajectory', 10, null, 'no verified sale on record');
    }

    // ── recourse, 10 ──
    if (a && a.latest && a.latest.win_rate_filed != null) {
      add('recourse', 'Appeal recourse', 10, clamp01((a.latest.win_rate_filed - 20) / 45),
          a.latest.win_rate_filed + '% of appeals won in ' + titleCase(a.county) + ' County');
    } else {
      add('recourse', 'Appeal recourse', 10, null);
    }

    if (!parts.length) return null;
    var wsum = parts.reduce(function (x, p) { return x + p.w; }, 0);
    var raw = parts.reduce(function (x, p) { return x + p.v * p.w; }, 0) / wsum;
    var score = Math.round(raw * 100);

    // Confidence is how much of the total weight we could actually measure.
    // A score built on three of six components is worth saying so about.
    var covered = wsum / 100;

    return {
      score: score,
      grade: score >= 80 ? 'A' : score >= 65 ? 'B' : score >= 50 ? 'C' : score >= 35 ? 'D' : 'E',
      band: score >= 65 ? 'good' : score >= 45 ? 'mid' : 'bad',
      verdict: WD_VERDICT(score),
      detail: detail,
      covered: covered,
      confidence: covered >= 0.85 ? 'high' : covered >= 0.6 ? 'medium' : 'low'
    };
  }

  function WD_VERDICT(s) {
    if (s >= 80) return 'Unusually good tax position';
    if (s >= 65) return 'Better than most New Jersey property';
    if (s >= 50) return 'About typical for New Jersey';
    if (s >= 35) return 'Carrying more than its share';
    return 'A heavy tax position';
  }

  // The badge. Small enough to sit next to a photo, readable at a glance.
  function wdBadge(r, size) {
    var w = watchdogScore(r);
    if (!w) return '';
    var cls = 'wd-badge ' + w.band + (size ? ' ' + size : '');
    return '<span class="' + cls + '" title="Watchdog Score ' + w.score +
      ' of 100. ' + esc(w.verdict) + '.">' +
      '<i class="fas fa-dog"></i><b>' + w.score + '</b></span>';
  }

  // The full breakdown, used on the report page and in the dashboard drawer.
  function wdBreakdown(r) {
    var w = watchdogScore(r);
    if (!w) return '';
    var keys = ['burden', 'fairness', 'uniformity', 'stability', 'trajectory', 'recourse'];
    return '<div class="wd-break">' +
      keys.map(function (k) {
        var d = w.detail[k];
        if (!d) return '';
        var has = d.score != null;
        return '<div class="wd-r' + (has ? '' : ' off') + '">' +
          '<span class="wd-rl">' + d.label + '<em>' + (d.note || '') + '</em></span>' +
          '<span class="wd-rb"><i style="width:' + (has ? d.score : 0) + '%"></i></span>' +
          '<span class="wd-rn">' + (has ? d.score : '\u2014') + '</span>' +
          '<span class="wd-rw">' + d.weight + '%</span>' +
        '</div>';
      }).join('') +
      '<div class="wd-conf">Built from ' + Math.round(w.covered * 100) + '% of the available weight, ' +
      w.confidence + ' confidence. Components with no data are dropped and the rest reweighted, rather than ' +
      'filled with a guess.</div>' +
    '</div>';
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

  function agentIntelMarkup(paid, mobile) {
    return '<section class="ai' + (mobile ? ' ai-mobile' : '') + '">' +
      '<div class="ai-h">' +
        '<img src="/johnprofile.jpg" alt="" onerror="this.style.display=\'none\'">' +
        '<div><b' + (mobile ? ' id="mobile-intel-title"' : '') + '>' +
          (paid ? 'Pro Intel' : 'Agent Intel') + '</b>' +
          '<span>Generated from your saved properties</span></div>' +
      '</div>' +
      (paid
        ? '<span class="ai-star pro" title="Pro tier"><i class="fas fa-star"></i></span>'
        : '<span class="ai-star" title="Standard account"><i class="far fa-star"></i></span>') +
      brief() +
    '</section>';
  }

  window.dbIntelOpen = function () {
    var overlay = el('mobile-intel-overlay');
    var content = el('mobile-intel-content');
    if (!overlay || !content) return;
    content.innerHTML = agentIntelMarkup(isPro(), true);
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('mobile-intel-open');
    try { sessionStorage.setItem('watchdogIntelSeen', '1'); } catch (_intelStorageError) {}
    var nav = document.querySelector('.mobile-intel-nav');
    if (nav) nav.classList.add('seen');
    var close = overlay.querySelector('.mobile-intel-close');
    if (close) close.focus();
  };

  window.dbIntelClose = function () {
    var overlay = el('mobile-intel-overlay');
    if (!overlay) return;
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('mobile-intel-open');
  };

  window.dbToggleSidebar = function () {
    if (isMobileCollection()) return;
    document.body.classList.toggle('db-sidebar-expanded');
    var expanded = document.body.classList.contains('db-sidebar-expanded');
    try { localStorage.setItem('watchdogSidebarExpanded', expanded ? '1' : '0'); } catch (_sidebarStorageError) {}
    paintSidebarToggle();
  };

  function paintSidebarToggle() {
    var button = el('db-sidebar-toggle');
    if (!button) return;
    var expanded = document.body.classList.contains('db-sidebar-expanded');
    button.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    button.setAttribute('aria-label', expanded ? 'Collapse navigation' : 'Expand navigation');
    var icon = button.querySelector('i');
    var label = button.querySelector('span');
    if (icon) icon.className = 'fas fa-chevron-' + (expanded ? 'left' : 'right');
    if (label) label.textContent = expanded ? 'Collapse navigation' : 'Expand navigation';
  }

  window.dbScrollTop = function () {
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
  };

  function initDashboardChrome() {
    try {
      if (localStorage.getItem('watchdogSidebarExpanded') === '1' && !isMobileCollection()) {
        document.body.classList.add('db-sidebar-expanded');
      }
      if (sessionStorage.getItem('watchdogIntelSeen') === '1') {
        var intelNav = document.querySelector('.mobile-intel-nav');
        if (intelNav) intelNav.classList.add('seen');
      }
    } catch (_chromeStorageError) {}
    paintSidebarToggle();
    var queued = false;
    window.addEventListener('scroll', function () {
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () {
        queued = false;
        var top = el('db-to-top');
        if (top) top.classList.toggle('show', window.scrollY > 850);
      });
    }, { passive: true });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') window.dbIntelClose();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initDashboardChrome, { once: true });
  else initDashboardChrome();

  function render() {
    var homes = rows.filter(function (r) { return r.kind === 'home'; });
    var watch = rows.filter(function (r) { return r.kind === 'watch'; });
    var cases = rows.filter(function (r) { var c = chapter123(r); return c && c.hasCase; });
    var d = deadline();

    var paid = isPro();
    var home = primaryHome();
    el('db-brief').innerHTML = rows.length && !isMobileCollection()
      ? '<div class="intel-home-row">' + agentIntelMarkup(paid, false) +
          '<div class="intel-home-card">' +
            (home ? propertyBlock(home, 0) :
              '<a class="claim-home-card" href="/property/"><i class="fas fa-house-circle-plus"></i>' +
              '<b>Claim your home</b><span>Keep your primary property at the center of the workspace.</span></a>') +
          '</div></div>'
      : '';

    // The rail used to sit here as four large figures. It was space spent on
    // numbers nobody acts on, so it now reads as one quiet line under the
    // greeting: present when useful, never competing with the brief.
    var stat = el('db-stat');
    if (stat) {
      stat.innerHTML = rows.length
        ? '<span>' + rows.length + ' tracked</span>' +
          '<span>' + money(rows.reduce(function (a, r) { return a + (+r.last_year_tax || 0); }, 0)) +
            ' a year</span>' +
          (cases.length ? '<span class="hot">' + cases.length + ' possible appeal' +
            (cases.length === 1 ? '' : 's') + '</span>' : '') +
          '<span' + (d.days <= 75 ? ' class="hot"' : '') + '>' + d.days + ' days to file</span>'
        : '';
    }
    el('db-line').innerHTML = '';

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
        dashboardWithAd(
          locked('The full table',
            'Every property with its ratio, supported assessment, statutory limit and appeal value, in one scannable grid.',
            proTable()) +
          toolsHTML()
        );
      afterTools();
      return;
    }

    var mobileCollection = isMobileCollection();
    var ordered = orderedCollectionRows(mobileCollection);
    var pages = Math.max(1, Math.ceil(ordered.length / pageSize));
    if (currentPage > pages) currentPage = pages;
    var offset = mobileCollection ? 0 : (currentPage - 1) * pageSize;
    var visible = mobileCollection
      ? ordered.slice(0, Math.min(mobileVisibleCount, ordered.length))
      : ordered.slice(offset, offset + pageSize);

    el('db-body').innerHTML =
      dashboardWithAd(
        sortControl(ordered.length) +
        '<section class="property-collection" id="property-collection" aria-label="Saved properties">' +
          '<div class="property-card-grid">' +
            renderPropertyBatch(visible, offset, mobileCollection) +
          '</div>' +
          (mobileCollection
            ? mobileScrollStatus(ordered.length, visible.length)
            : pagination(ordered.length)) +
        '</section>' +
        toolsHTML()
      );
    afterTools();
    if (mobileCollection) setupMobilePropertyScroll(ordered.length);
  }

  function rl(v, l, cls) {
    return '<span class="' + (cls || '') + '"><b>' + v + '</b>' + l + '</span>';
  }

  function toolsHTML() {
    // Uniformity is free on purpose: it is the most surprising number on the
    // site and the reason someone tells a neighbour about it.
    // toolUniformity and toolAppealOdds used to sit here. Both describe a single
    // property, so printing them under a list of five was misleading. They now
    // live on that property's own report page, and each card carries the short
    // version instead.
    var free = [toolDrift()].filter(Boolean).join('');
    var pro = [toolPortfolio(), toolCompare(), toolExport()].filter(Boolean).join('');
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
  // ══════════════════════════════════════════════
  // PROFILE
  //
  // Built as a set of collapsible groups rather than one long form, because a
  // wall of forty inputs gets abandoned. Each group states plainly what the
  // answers unlock, since people fill in fields when they can see the point
  // and skip them when they cannot.
  //
  // Income is a real number, not a band. Every New Jersey benefit that matters
  // turns on a threshold, and a band cannot answer "do I qualify" when the
  // cutoff sits inside it.
  // ══════════════════════════════════════════════

  var PF_OPEN = { you: true };

  function pfCompletion() {
    var fields = ['display_name','photo_url','city','zip','role','household_size','filing_status',
      'birth_year','gross_income','income_year','years_in_home','properties_owned','move_timeline',
      'mortgage_balance','mortgage_rate','home_insurance','credit_band','contact_pref','phone',
      'claims_anchor','is_veteran','goals'];
    var have = fields.filter(function (k) {
      var v = profile[k];
      return v !== null && v !== undefined && v !== '' && v !== false;
    }).length;
    return Math.round(have / fields.length * 100);
  }

  function grp(key, title, why, body) {
    var open = !!PF_OPEN[key];
    return '<section class="pg' + (open ? ' open' : '') + '" id="pg-' + key + '">' +
      '<button class="pg-h" onclick="pfToggle(\'' + key + '\')">' +
        '<span class="pg-t">' + title + '</span>' +
        '<span class="pg-w">' + why + '</span>' +
        '<i class="fas fa-chevron-down"></i>' +
      '</button>' +
      '<div class="pg-b">' + body + '</div>' +
    '</section>';
  }

  window.pfToggle = function (k) {
    PF_OPEN[k] = !PF_OPEN[k];
    var e = el('pg-' + k);
    if (e) e.classList.toggle('open', PF_OPEN[k]);
  };

  function txt(id, label, ph, type, hint) {
    var v = profile[id];
    return '<div class="pf-f"><label for="pf-' + id + '">' + label + '</label>' +
      '<input id="pf-' + id + '" type="' + (type || 'text') + '" placeholder="' + (ph || '') + '"' +
      (type === 'number' ? ' inputmode="numeric"' : '') +
      ' value="' + esc(v == null ? '' : v) + '">' +
      (hint ? '<em>' + hint + '</em>' : '') + '</div>';
  }

  function mny(id, label, ph, hint) {
    var v = profile[id];
    return '<div class="pf-f"><label for="pf-' + id + '">' + label + '</label>' +
      '<div class="pf-money"><span>$</span><input id="pf-' + id + '" type="text" inputmode="numeric" ' +
      'placeholder="' + (ph || '') + '" value="' + (v == null || v === '' ? '' : (+v).toLocaleString()) + '" ' +
      'oninput="pfNum(this)"></div>' + (hint ? '<em>' + hint + '</em>' : '') + '</div>';
  }

  window.pfNum = function (e) {
    var v = e.value.replace(/[^0-9]/g, '');
    e.value = v ? parseInt(v, 10).toLocaleString() : '';
  };

  function pick(id, label, opts, hint) {
    var v = profile[id];
    return '<div class="pf-f"><label for="pf-' + id + '">' + label + '</label>' +
      '<select id="pf-' + id + '"><option value="">Prefer not to say</option>' +
      opts.map(function (o) {
        return '<option value="' + o[0] + '"' + (v === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
      }).join('') + '</select>' + (hint ? '<em>' + hint + '</em>' : '') + '</div>';
  }

  function yn(id, label) {
    return '<label class="pf-yn"><input type="checkbox" id="pf-' + id + '"' +
      (profile[id] ? ' checked' : '') + '><span>' + label + '</span></label>';
  }

  function multi(id, label, opts, hint) {
    var cur = profile[id] || [];
    return '<div class="pf-f wide"><label>' + label + '</label><div class="pf-chips">' +
      opts.map(function (o) {
        var on = cur.indexOf(o[0]) > -1;
        return '<label class="chip' + (on ? ' on' : '') + '">' +
          '<input type="checkbox" data-multi="' + id + '" value="' + o[0] + '"' + (on ? ' checked' : '') +
          ' onchange="this.parentNode.classList.toggle(\'on\', this.checked)">' + o[1] + '</label>';
      }).join('') + '</div>' + (hint ? '<em>' + hint + '</em>' : '') + '</div>';
  }

  // A professional the user works with. Stored as one JSON object per role.
  function pro(id, label, hint) {
    var v = profile[id] || {};
    return '<div class="pf-pro"><div class="pf-pro-h">' + label + (hint ? '<em>' + hint + '</em>' : '') + '</div>' +
      '<div class="pf-pro-g">' +
        '<input id="pf-' + id + '-name"  placeholder="Name"    value="' + esc(v.name || '') + '">' +
        '<input id="pf-' + id + '-co"    placeholder="Company" value="' + esc(v.company || '') + '">' +
        '<input id="pf-' + id + '-phone" placeholder="Phone"   value="' + esc(v.phone || '') + '">' +
        '<input id="pf-' + id + '-email" placeholder="Email"   value="' + esc(v.email || '') + '">' +
      '</div></div>';
  }

  function profileForm() {
    var pct = pfCompletion();
    var photo = profile.photo_url || meta().avatar_url || meta().picture || '';

    return '<div class="pf">' +

      '<div class="pf-top">' +
        '<div class="pf-photo">' +
          (photo ? '<img src="' + esc(photo) + '" alt="" onerror="this.style.display=\'none\'">'
                 : '<div class="pf-noimg">' + esc((name() || '?').charAt(0).toUpperCase()) + '</div>') +
        '</div>' +
        '<div class="pf-topb">' +
          '<div class="pf-meter"><i style="width:' + pct + '%"></i></div>' +
          '<div class="pf-pct"><b>' + pct + '% complete</b>' +
            (pct < 100 ? ' \u00b7 the more you fill in, the more of this we can answer for you' : ' \u00b7 everything filled') +
          '</div>' +
        '</div>' +
      '</div>' +

      grp('you', 'You', 'Name, photo and where you are',
        '<div class="pf-grid">' +
          txt('display_name', 'Display name', 'How you want to be addressed') +
          txt('phone', 'Phone', 'Optional', 'tel') +
          txt('city', 'Town you live in', 'Williamstown') +
          txt('zip', 'Zip', '08094') +
          txt('photo_url', 'Photo URL', 'Paste a link, or leave it to use your sign in photo', 'url',
              'Direct image link. Upload arrives once storage is switched on.') +
          txt('headline', 'One line about you', 'Homeowner since 2014, thinking about downsizing') +
        '</div>' +
        multi('roles', 'What are you, in the property market?', [
          ['owner','Homeowner'], ['renter','Renter'], ['buyer','Buying'], ['seller','Selling'],
          ['investor','Investor'], ['landlord','Landlord'], ['agent','Real estate agent'],
          ['attorney','Attorney'], ['lender','Lender'], ['appraiser','Appraiser']
        ], 'Pick as many as fit. Most people are more than one.')) +

      grp('house', 'Your household', 'Decides which New Jersey benefits you qualify for',
        '<div class="pf-grid">' +
          txt('household_size', 'People in the household', '3', 'number') +
          txt('dependents', 'Dependents claimed', '1', 'number') +
          pick('filing_status', 'Filing status', [
            ['single','Single'], ['married_joint','Married, filing jointly'],
            ['married_separate','Married, filing separately'], ['head','Head of household'],
            ['widow','Qualifying widow or widower']
          ]) +
          txt('birth_year', 'Your birth year', '1968', 'number', 'Stay NJ and the Senior Freeze start at 65') +
          txt('spouse_birth_year', 'Spouse birth year', 'Optional', 'number') +
          txt('years_in_home', 'Years in your current home', '11', 'number') +
        '</div>') +

      grp('money', 'Income and housing costs',
        'Exact figures, because every benefit here turns on a threshold',
        '<p class="pf-say">New Jersey\u2019s programs cut off at specific numbers. ANCHOR changes at $150,000. ' +
        'Stay NJ stops at $500,000. The Senior Freeze has its own limit that moves each year. A range cannot ' +
        'tell you which side of a line you are on, so this asks for the real figure.</p>' +
        '<div class="pf-grid">' +
          mny('gross_income', 'Gross annual income', '112,000', 'Total household, before tax') +
          txt('income_year', 'For tax year', '2025', 'number') +
          mny('nj_taxable_income', 'NJ taxable income', 'Optional', 'Line 29 of your NJ-1040, if you have it') +
          mny('mortgage_balance', 'Mortgage balance', '184,000') +
          txt('mortgage_rate', 'Rate %', '6.25', 'number') +
          mny('mortgage_payment', 'Monthly payment', '1,940', 'Principal and interest') +
          mny('escrow_monthly', 'Monthly escrow', '620') +
          mny('home_insurance', 'Annual home insurance', '1,450') +
          mny('heloc_balance', 'HELOC or second lien', 'Optional') +
          pick('credit_band', 'Credit range', [
            ['excellent','Excellent, 760 and up'], ['good','Good, 700 to 759'],
            ['fair','Fair, 640 to 699'], ['building','Building, under 640']
          ], 'Never checked, never pulled. Self reported only.') +
        '</div>') +

      grp('benefits', 'What you already claim', 'So we stop suggesting things you have',
        '<div class="pf-yns">' +
          yn('claims_anchor', 'ANCHOR') +
          yn('claims_stay_nj', 'Stay NJ') +
          yn('claims_senior_freeze', 'Senior Freeze') +
          yn('claims_senior_deduction', '$250 senior deduction') +
          yn('claims_vet_deduction', '$250 veteran deduction') +
          yn('is_veteran', 'I am a veteran') +
          yn('filed_appeal_before', 'I have filed a tax appeal before') +
        '</div>' +
        '<div class="pf-grid">' +
          txt('appeal_year', 'Year of that appeal', '2023', 'number') +
          pick('appeal_outcome', 'How it went', [
            ['won','Assessment reduced'], ['settled','Settled before hearing'],
            ['lost','No reduction'], ['withdrew','Withdrew it']
          ]) +
        '</div>') +

      grp('plans', 'What you are planning', 'Shapes what gets flagged for you',
        '<div class="pf-grid">' +
          pick('move_timeline', 'Thinking of selling', [
            ['asap','As soon as possible'], ['3mo','Within 3 months'], ['6mo','Within 6 months'],
            ['12mo','Within a year'], ['2yr','One to two years'], ['none','Not at all']
          ]) +
          pick('buy_timeline', 'Thinking of buying', [
            ['asap','As soon as possible'], ['3mo','Within 3 months'], ['6mo','Within 6 months'],
            ['12mo','Within a year'], ['none','Not at all']
          ]) +
          mny('price_target_low', 'Budget from', '350,000') +
          mny('price_target_high', 'Budget to', '475,000') +
          txt('properties_owned', 'Properties you own', '1', 'number') +
        '</div>' +
        '<div class="pf-f wide"><label for="pf-target_towns">Towns you are watching</label>' +
        '<input id="pf-target_towns" placeholder="Washington Twp, Deptford, Mantua" value="' +
        esc((profile.target_towns || []).join(', ')) + '"><em>Comma separated. We will flag revaluations and ' +
        'rate changes in these.</em></div>' +
        '<div class="pf-f wide"><label for="pf-goals">What are you actually trying to do?</label>' +
        '<textarea id="pf-goals" rows="3" placeholder="Cut the tax bill, then downsize in about two years once ' +
        'the youngest finishes school.">' + esc(profile.goals || '') + '</textarea></div>') +

      grp('pros', 'Your people', 'Keep them handy, and we will not suggest replacements',
        pro('pro_agent', 'Real estate agent') +
        pro('pro_lender', 'Lender or mortgage broker') +
        pro('pro_attorney', 'Attorney') +
        pro('pro_accountant', 'Accountant or tax preparer') +
        pro('pro_insurance', 'Insurance agent')) +

      grp('reach', 'How to reach you', 'And what is worth interrupting you for',
        '<div class="pf-grid">' +
          pick('contact_pref', 'Preferred contact', [
            ['email','Email'], ['phone','Phone call'], ['text','Text message'], ['none','Do not contact me']
          ]) +
          pick('best_time', 'Best time', [
            ['morning','Morning'], ['midday','Midday'], ['evening','Evening'], ['weekend','Weekends']
          ]) +
        '</div>' +
        '<div class="pf-yns">' +
          yn('notify_deadline', 'Appeal deadlines') +
          yn('notify_reval', 'My town announces a revaluation') +
          yn('notify_value', 'My assessment or value changes') +
          yn('notify_market', 'Monthly market note for my towns') +
        '</div>') +

      '<div class="pf-save">' +
        '<button class="db-btn" onclick="dbSaveProfile()">Save profile</button>' +
        '<span id="pf-saved"></span>' +
      '</div>' +

      '<p class="pf-priv"><i class="fas fa-lock"></i> Everything here is visible only to your account. ' +
      'It is never sold, never shared, and never shown to other users. Every field is optional and you can ' +
      'clear any of them at any time.</p>' +
    '</div>';
  }

  // ══════════════════════════════════════════════
  // SAVE
  // ══════════════════════════════════════════════
  function gv(id) { var e = el('pf-' + id); return e ? String(e.value || '').trim() : ''; }
  function gn(id) { var v = gv(id).replace(/[^0-9.\-]/g, ''); return v === '' ? null : Math.round(+v); }
  function gf(id) { var v = gv(id).replace(/[^0-9.\-]/g, ''); return v === '' ? null : +v; }
  function gb(id) { var e = el('pf-' + id); return e ? !!e.checked : null; }
  function gs(id) { return gv(id) || null; }
  function gpro(id) {
    var o = { name: gv(id + '-name'), company: gv(id + '-co'),
              phone: gv(id + '-phone'), email: gv(id + '-email') };
    return (o.name || o.company || o.phone || o.email) ? o : null;
  }
  function gmulti(id) {
    var out = [];
    document.querySelectorAll('input[data-multi="' + id + '"]:checked')
      .forEach(function (c) { out.push(c.value); });
    return out.length ? out : null;
  }

  window.dbSaveProfile = function () {
    var towns = gv('target_towns').split(',').map(function (t) { return t.trim(); }).filter(Boolean);
    var patch = {
      display_name: gs('display_name'), photo_url: gs('photo_url'), headline: gs('headline'),
      city: gs('city'), zip: gs('zip'), phone: gs('phone'),
      roles: gmulti('roles'),
      household_size: gn('household_size'), dependents: gn('dependents'),
      filing_status: gs('filing_status'), birth_year: gn('birth_year'),
      spouse_birth_year: gn('spouse_birth_year'), years_in_home: gn('years_in_home'),
      gross_income: gn('gross_income'), income_year: gn('income_year'),
      nj_taxable_income: gn('nj_taxable_income'),
      mortgage_balance: gn('mortgage_balance'), mortgage_rate: gf('mortgage_rate'),
      mortgage_payment: gf('mortgage_payment'), escrow_monthly: gf('escrow_monthly'),
      home_insurance: gf('home_insurance'), heloc_balance: gn('heloc_balance'),
      credit_band: gs('credit_band'),
      claims_anchor: gb('claims_anchor'), claims_stay_nj: gb('claims_stay_nj'),
      claims_senior_freeze: gb('claims_senior_freeze'),
      claims_senior_deduction: gb('claims_senior_deduction'),
      claims_vet_deduction: gb('claims_vet_deduction'), is_veteran: gb('is_veteran'),
      filed_appeal_before: gb('filed_appeal_before'), appeal_year: gn('appeal_year'),
      appeal_outcome: gs('appeal_outcome'),
      move_timeline: gs('move_timeline'), buy_timeline: gs('buy_timeline'),
      price_target_low: gn('price_target_low'), price_target_high: gn('price_target_high'),
      properties_owned: gn('properties_owned'),
      target_towns: towns.length ? towns : null, goals: gs('goals'),
      pro_agent: gpro('pro_agent'), pro_lender: gpro('pro_lender'),
      pro_attorney: gpro('pro_attorney'), pro_accountant: gpro('pro_accountant'),
      pro_insurance: gpro('pro_insurance'),
      contact_pref: gs('contact_pref'), best_time: gs('best_time'),
      notify_deadline: gb('notify_deadline'), notify_reval: gb('notify_reval'),
      notify_value: gb('notify_value'), notify_market: gb('notify_market'),
      profile_complete: true
    };
    // derive the age band so existing tools keep working
    if (patch.birth_year) {
      var age = new Date().getFullYear() - patch.birth_year;
      patch.age_band = age >= 65 ? '65plus' : age >= 50 ? '50to64' : age >= 35 ? '35to49' : 'under35';
    }
    Object.keys(patch).forEach(function (k) { profile[k] = patch[k]; });
    patch.profile_pct = pfCompletion();

    sb.from('profiles').update(patch).eq('id', plUser.id).then(function (r) {
      var s = el('pf-saved');
      if (r.error) {
        if (s) s.innerHTML = '<span class="bad">Could not save. ' + esc(r.error.message || '') + '</span>';
        return;
      }
      if (s) s.innerHTML = '<span class="ok"><i class="fas fa-circle-check"></i> Saved</span>';
      el('db-profile-body').innerHTML = profileForm();
      render();
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
