/* ============================================================
   DASHBOARD
   njpropertytaxrelief.com/property
   ============================================================ */
(function () {
  'use strict';

  var MODULE_VERSION = '20260807b';
  var modulePromises = Object.create(null);
  var moduleDependencies = {
    'appeal-odds': ['uniformity'],
    'watchdog-score': ['uniformity', 'revaluation-radar'],
    'score-history': ['watchdog-score'],
    'revaluation-radar': ['uniformity'],
    'buyer-closing-costs': ['uniformity', 'revaluation-radar', 'town-intelligence'],
    'town-risk-matrix': ['town-intelligence', 'municipal-budget-pressure', 'watchdog-score'],
    'export': ['municipal-budget-pressure'],
    'investor-screen': ['uniformity'],
    'investor-carry-volatility': ['uniformity', 'revaluation-radar', 'municipal-budget-pressure', 'tax-trajectory', 'exempt-pilot-exposure'],
    'appeal-packet': ['uniformity'],
    'relocation': ['uniformity'],
    'improvement-ratio': ['town-profile'],
    'property-class-mix': ['town-profile']
  };
  var moduleGroups = {
    initial: ['uniformity', 'town-intelligence', 'municipal-budget-pressure', 'exempt-pilot-exposure', 'revaluation-radar', 'abatement-exposure', 'watchdog-score', 'score-history', 'real-estate-concierge', 'assessment-drift', 'true-cost'],
    pro: ['town-percentile', 'portfolio-analysis', 'town-risk-matrix', 'property-comparison', 'professional-due-diligence', 'investor-carry-volatility', 'export']
  };

  function loadToolModule(name) {
    if (!modulePromises[name]) {
      modulePromises[name] = Promise.all((moduleDependencies[name] || []).map(loadToolModule))
        .then(function () { return import('./tools/' + name + '.js?v=' + MODULE_VERSION); })
        .then(function (module) {
          if (name === 'exempt-pilot-exposure' && typeof loadExemptPilot === 'function') {
            return loadExemptPilot().then(function () { return module; });
          }
          return module;
        }).catch(function (error) {
        delete modulePromises[name];
        throw error;
      });
    }
    return modulePromises[name];
  }

  function loadToolModules(names) {
    return Promise.all(names.map(loadToolModule));
  }

  window.NJDashboard = {
    version: MODULE_VERSION,
    loadTool: loadToolModule,
    loadTools: loadToolModules,
    groups: moduleGroups
  };

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
    document.body.classList.add('note-modal-open');
  };
  window.plCloseNote = function () {
    var n = el('plm-note-overlay');
    if (n) n.classList.remove('open', 'comparison-open');
    document.body.classList.remove('note-modal-open');
  };

  function ready() {
    if (sb) return true;
    if (typeof window.supabase === 'undefined' || LEDGER_KEY.indexOf('PASTE') === 0) return false;
    sb = window.supabase.createClient(LEDGER_URL, LEDGER_KEY,
      { auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          flowType: 'pkce',
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
    sb.auth.signInWithOAuth({ provider: p, options: { redirectTo: location.origin + location.pathname } })
      .then(function (result) {
        if (result && result.error) {
          console.error('OAuth start failed:', result.error);
          toast('Google sign in could not start. Please try again.');
        }
      });
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

    // During an OAuth or magic-link callback, INITIAL_SESSION/getSession can
    // finish with an older null result after SIGNED_IN has already supplied a
    // valid user. Never let that stale result replace an authenticated state.
    if (!force && authUserId && !nextId) return;
    if (!force && authSettled && nextId === authUserId) return;

    authSettled = true;
    authUserId = nextId;
    plUser = nextUser;

    var checking = el('db-auth-check');
    if (checking) checking.style.display = 'none';
    paint();
    if (nextUser && window.WatchdogBilling) window.setTimeout(function () { window.WatchdogBilling.resume(); }, 0);
  }

  function showSignedOut(force) {
    if (!force && authUserId) return;
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
      }).catch(function () { showSignedOut(false); });
    }).catch(function () {
      showSignedOut();
    });
  }

  function bootAuth() {
    if (!ready()) {
      showSignedOut();
      return;
    }

    sb.auth.onAuthStateChange(function (event, session) {
      if (session && session.user) {
        settleAuth(session);
      } else if (event === 'SIGNED_OUT') {
        showSignedOut(true);
      }
    });

    // Supabase owns the OAuth callback URL. Do not clear its code/hash here:
    // doing so can remove the callback before the asynchronous exchange has
    // persisted the session. Supabase safely cleans it after processing.
    readSession();
  }

  // Authentication starts after the initial calculation modules are available.

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
      sb.rpc('get_my_entitlement'),
      loadRefData(), loadSR1A(), loadUniformity(), loadAppeals(), loadAbatements()
    ]).then(function (res) {
      rows = (res[0] && res[0].data) || [];
      profile = (res[1] && res[1].data) || {};
      var entRows = (res[2] && res[2].data) || [], ent = Array.isArray(entRows) ? entRows[0] : entRows;
      if (ent) profile = Object.assign({}, profile, { account_role: ent.account_role || profile.account_role, plan_tier: ent.plan_tier || profile.plan_tier, subscription_status: ent.subscription_status, current_period_end: ent.current_period_end });
      if (window.NJPTRPlan) window.NJPTRPlan.init(plUser, profile);
      render();
      hydrateDetails().then(render);
      el('db-profile-body').innerHTML = profileForm();
      if (location.hash === '#profile') window.dbPanel('profile');
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
  function rateHistory(town, county) {
    if (!rates) return null;
    var t=(town||'').toUpperCase().trim(),tc=t+' ('+(county||'').toUpperCase().trim()+')',keys=Object.keys(rates),hit=null;
    for(var i=0;i<keys.length;i++)if(keys[i].toUpperCase().trim()===tc){hit=rates[keys[i]];break;}
    if(!hit)for(var j=0;j<keys.length;j++)if(keys[j].toUpperCase().trim()===t){hit=rates[keys[j]];break;}
    if(!hit)return null;
    var years=Object.keys(hit).map(Number).filter(function(y){return y>1990;}).sort();
    return years.length<3?null:years.map(function(y){return{year:y,rate:+hit[String(y)]};});
  }

  // ══════════════════════════════════════════════
  // 1 · ASSESSMENT DRIFT
  // Uses the history snapshots the ledger writes whenever a figure changes.
  // Nobody else has this, because New Jersey does not publish per parcel
  // assessment history. It accumulates from your own visits.
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
    taxLow:    { label: 'Lowest taxes',     fn: function (a, b) { return (+a.last_year_tax || 0) - (+b.last_year_tax || 0); } },
    fairHigh:  { label: 'Fairest town',     fn: function (a, b) { var x = townIntelFor(a), y = townIntelFor(b); return (y ? y.score : -1) - (x ? x.score : -1); } },
    fairLow:   { label: 'Least fair town',  fn: function (a, b) { var x = townIntelFor(a), y = townIntelFor(b); return (x ? x.score : 101) - (y ? y.score : 101); } },
    rateHigh:  { label: 'Fastest rate rise', fn: function (a, b) { var x = townIntelFor(a), y = townIntelFor(b); return (y && y.trajectory ? y.trajectory.cagr : -1) - (x && x.trajectory ? x.trajectory.cagr : -1); } },
    pressureHigh: { label: 'Highest budget pressure', fn: function (a, b) { var x = budgetPressureFor(a), y = budgetPressureFor(b); return (y ? y.score : -1) - (x ? x.score : -1); } },
    pressureLow: { label: 'Lowest budget pressure', fn: function (a, b) { var x = budgetPressureFor(a), y = budgetPressureFor(b); return (x ? x.score : 101) - (y ? y.score : 101); } }
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

  function selectedRows() {
    return picked.map(function (id) { return byId(id); }).filter(Boolean);
  }

  function paintCompareTray() {
    var root = el('compare-tray-root');
    if (!root) return;
    var selected = selectedRows();
    if (!selected.length) {
      root.innerHTML = '';
      document.body.classList.remove('compare-tray-visible');
      return;
    }
    root.innerHTML = '<section class="compare-tray" aria-label="Selected properties for comparison">' +
      '<div class="compare-tray-head"><i class="fas fa-code-compare"></i><span><b>' + selected.length +
        '</b> of 3 selected</span></div>' +
      '<div class="compare-tray-items">' + selected.map(function (r) {
        return '<div class="compare-tray-item"><span><b>' + esc(r.address || 'Saved property') + '</b>' +
          '<small>' + esc(r.town || '') + '</small></span>' +
          '<button type="button" onclick="dbRemovePick(\'' + esc(r.id) + '\')" aria-label="Remove ' +
            esc(r.address || 'property') + ' from comparison"><i class="fas fa-xmark"></i></button></div>';
      }).join('') + '</div>' +
      '<div class="compare-tray-actions"><button class="compare-tray-clear" type="button" onclick="dbClearPick()">Clear</button>' +
        '<button class="compare-tray-go" type="button" onclick="dbCompareSel()"' +
          (selected.length < 2 ? ' disabled title="Select one more property"' : '') +
          '><i class="fas fa-code-compare"></i> Compare' + (selected.length > 1 ? ' ' + selected.length : '') + '</button></div>' +
    '</section>';
    document.body.classList.add('compare-tray-visible');
  }

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
    paintCompareTray();
  };
  window.dbRemovePick = function (id) {
    picked = picked.filter(function (pickedId) { return pickedId !== id; });
    render();
    paintCompareTray();
  };
  window.dbClearPick = function () {
    picked = [];
    render();
    paintCompareTray();
  };

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
        row('Town fairness (0-100)', function (r) { var t = townIntelFor(r); return t ? t.score : null; }, 'high') +
        row('Statewide town rank', function (r) { var t = townIntelFor(r); return t ? '#' + t.stateRank + ' of ' + t.stateTotal : null; }) +
        row('Tax-rate trend', function (r) { var t = townIntelFor(r); return t && t.trajectory ? (t.trajectory.cagr >= 0 ? '+' : '') + (t.trajectory.cagr * 100).toFixed(1) + '% / year' : null; }, 'low') +
        row('Budget pressure (0-100)', function (r) { var b = budgetPressureFor(r); return b ? b.score : null; }, 'low') +
        row('Budget pressure band', function (r) { var b = budgetPressureFor(r); return b ? b.band : null; }) +
        row('Total levy growth', function (r) { var b = budgetPressureFor(r), v = b && b.trend.total_levy_cagr; return v == null ? null : ((v >= 0 ? '+' : '') + (v * 100).toFixed(1) + '% / year'); }, 'low') +
        row('Organic ratable growth', function (r) { var b = budgetPressureFor(r), v = b && b.trend.ratable_growth; return v == null ? null : ((v >= 0 ? '+' : '') + (v * 100).toFixed(1) + '% / year'); }, 'high') +
        row('School levy growth', function (r) { var b = budgetPressureFor(r), v = b && b.trend.school_levy_cagr; return v == null ? null : ((v >= 0 ? '+' : '') + (v * 100).toFixed(1) + '% / year'); }, 'low') +
        row('Municipal levy growth', function (r) { var b = budgetPressureFor(r), v = b && b.trend.municipal_levy_cagr; return v == null ? null : ((v >= 0 ? '+' : '') + (v * 100).toFixed(1) + '% / year'); }, 'low') +
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
    var modal = el('plm-note-overlay');
    if (modal) modal.classList.add('comparison-open');
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
          ? '<button onclick="dbVerify(\'' + r.pams_pin + '\',\'' + esc(r.address).replace(/'/g, '') + '\',\'' + esc(r.town || '').replace(/'/g, '') + '\',\'' + esc(r.zip || '').replace(/'/g, '') + '\')"><i class="fas fa-badge-check"></i> Verify ownership</button>'
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
    if (window.NJPTRPlan) return window.NJPTRPlan.can('pro');
    var plan = String((profile && (profile.plan_tier || profile.plan)) || '').toLowerCase().replace(/[\s_-]/g, '');
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
    location.href = '/property/pro.html#plans';
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
          townIntelSummary(r) +
          budgetPressureSummary(r) +
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
      var ti = townIntelFor(r);
      var bp = budgetPressureFor(r);
      return '<tr' + (c && c.hasCase ? ' class="hot"' : '') + '>' +
        '<td class="a">' + esc(r.address) + '</td>' +
        '<td>' + esc(r.town || '') + '</td>' +
        '<td>' + esc(r.block || '') + '/' + esc(r.lot || '') + '</td>' +
        '<td class="n">' + (r.assessed ? r.assessed.toLocaleString() : '-') + '</td>' +
        '<td class="n">' + (r.last_year_tax ? Math.round(r.last_year_tax).toLocaleString() : '-') + '</td>' +
        '<td class="n">' + (r.effective_rate ? (+r.effective_rate).toFixed(2) : '-') + '</td>' +
        '<td class="n">' + (ti ? ti.score : '-') + '</td>' +
        '<td class="n">' + (ti ? ti.stateRank : '-') + '</td>' +
        '<td class="n">' + (ti && ti.trajectory ? (ti.trajectory.cagr * 100).toFixed(1) : '-') + '</td>' +
        '<td class="n">' + (bp ? bp.score : '-') + '</td>' +
        '<td>' + (bp ? bp.band : '-') + '</td>' +
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
      ['Address','Town','Blk/Lot','Assessed','Tax','Eff%','Fairness','NJ rank','Rate trend%','Budget pressure','Pressure band','Ratio%','n','Market','Supported','Ch123 limit','Over','Saving/yr','Verified']
        .map(function (h, i) { return '<th' + (i >= 3 && i <= 9 || i >= 11 && i <= 17 ? ' class="n"' : '') + '>' + h + '</th>'; }).join('') +
      '</tr></thead><tbody>' + body + '</tbody></table></div>' +
      '<p class="pro-note">Ratio is measured from state verified arm\u2019s length sales where available, ' +
      'otherwise the published Director\u2019s Ratio. n is the number of verified sales behind it. ' +
      'Supported assessment is market value times the ratio; the Chapter 123 limit adds the statutory 15 percent.</p>';
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

  var view = 'simple';

  window.dbView = function (v) {
    view = v;
    document.body.classList.toggle('pro-view', v === 'pro');
    ['simple', 'pro'].forEach(function (k) {
      var b = document.querySelector('.vw[data-v="' + k + '"]');
      if (b) b.classList.toggle('on', k === v);
    });
    if (v !== 'pro') { render(); return; }
    var body = el('db-body');
    if (body) body.innerHTML = '<div class="db-loading-panel"><div class="pl-spin"></div><div><b>Loading Pro tools</b><span>Preparing portfolio analysis and exports.</span></div></div>';
    loadToolModules(moduleGroups.pro).then(render).catch(function (error) {
      console.error('Could not load Pro tools:', error);
      if (body) body.innerHTML = '<div class="db-error-panel"><i class="fas fa-triangle-exclamation"></i><div><h3>Pro tools could not load.</h3><p>Check your connection and try again.</p><button class="db-btn" onclick="dbView(\'pro\')">Try again</button></div></div>';
    });
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
      brief() + townIntelAgentPoints() +
    '</section>';
  }

  function townIntelAgentPoints() {
    var intel = rows.map(function (r) { var t = townIntelFor(r); return t ? { r: r, t: t } : null; }).filter(Boolean);
    if (!intel.length) return '';
    var leastFair = intel.slice().sort(function (a, b) { return a.t.score - b.t.score; })[0];
    var fastest = intel.filter(function (x) { return x.t.trajectory; })
      .sort(function (a, b) { return b.t.trajectory.cagr - a.t.trajectory.cagr; })[0];
    var pressure = rows.map(function (r) { var b = budgetPressureFor(r); return b ? { r: r, b: b } : null; }).filter(Boolean)
      .sort(function (a, b) { return b.b.score - a.b.score; })[0];
    var pilot = typeof exemptPilotFor === 'function' ? rows.map(function (r) {
      var x = exemptPilotFor(r); return x ? { r:r, x:x } : null;
    }).filter(Boolean).sort(function (a, b) {
      return (+b.x.pilot_value_share || 0) - (+a.x.pilot_value_share || 0);
    })[0] : null;
    return '<div class="ai-town-intel"><b>Town signals</b>' +
      '<p><i class="fas fa-scale-balanced"></i><span><strong>' + esc(leastFair.r.address) + '</strong> is in ' +
        esc(leastFair.t.name) + ', ranked #' + leastFair.t.stateRank + ' of ' + leastFair.t.stateTotal +
        ' statewide for assessment fairness.</span></p>' +
      (fastest ? '<p><i class="fas fa-chart-line"></i><span><strong>' + esc(fastest.r.address) + '</strong> has the fastest municipal rate trend in this list at ' +
        (fastest.t.trajectory.cagr >= 0 ? '+' : '') + (fastest.t.trajectory.cagr * 100).toFixed(1) + '% per year.</span></p>' : '') +
      (pressure ? '<p><i class="fas fa-building-columns"></i><span><strong>' + esc(pressure.r.address) + '</strong> has the highest municipal budget pressure in this list at ' + pressure.b.score + '/100 (' + pressure.b.band + ').</span></p>' : '') +
      (pilot && pilot.x.pilot_count ? '<p><i class="fas fa-landmark"></i><span><strong>' + esc(pilot.r.address) + '</strong> is in a town reporting ' + pilot.x.pilot_count + ' PILOT agreement' + (pilot.x.pilot_count === 1 ? '' : 's') + ', covering ' + (pilot.x.pilot_value_share * 100).toFixed(1) + '% of assessed value.</span></p>' : '') +
      '<a href="/property/town-compare.html">Compare municipalities</a></div>';
  }


  // ══════════════════════════════════════════════
  // PORTFOLIO STRIP
  //
  // What replaced the Intel panel. A map on its own is decoration: pins tell
  // you where things are, which the address already did. This pairs the map
  // with the Watchdog Score, so the pin IS the comparison, and puts the whole
  // portfolio on one scale beside it.
  //
  // Uses Leaflet where it is loaded and degrades to the ranking alone where it
  // is not, because the ranking is the part that carries the meaning.
  // ══════════════════════════════════════════════

  // ══════════════════════════════════════════════
  // COORDINATES
  //
  // saved_properties has no lat/lon columns, and save_property never sent any,
  // so nothing on this page knew where a property was. Rather than a schema
  // change and a backfill, addresses are geocoded on demand against the state
  // service and cached in localStorage. NJOGIS answers in about 130ms and the
  // cache means each address is looked up once, ever.
  // ══════════════════════════════════════════════
  var NJ_GEOCODE_URL = 'https://geo.nj.gov/arcgis/rest/services/Tasks/NJ_Geocode/GeocodeServer/findAddressCandidates';
  var geoCache = null;

  function loadGeoCache() {
    if (geoCache) return geoCache;
    try { geoCache = JSON.parse(localStorage.getItem('wd_geo') || '{}'); }
    catch (e) { geoCache = {}; }
    return geoCache;
  }
  function saveGeoCache() {
    try { localStorage.setItem('wd_geo', JSON.stringify(geoCache || {})); } catch (e) {}
  }

  function geocodeRow(r) {
    var key = String(r.pams_pin || r.address || '');
    if (!key) return Promise.resolve(null);
    var cache = loadGeoCache();
    if (cache[key]) return Promise.resolve(cache[key]);

    var addr = [r.address, r.town, 'NJ', r.zip].filter(Boolean).join(', ');
    var q = new URLSearchParams({ SingleLine: addr, outSR: '4326', maxLocations: '1', f: 'json' });
    return xfetch(NJ_GEOCODE_URL + '?' + q, 8000)
      .then(function (x) { return x.json(); })
      .then(function (d) {
        var c = d && d.candidates && d.candidates[0];
        if (!c || !c.location) return null;
        var pt = { lat: c.location.y, lon: c.location.x };
        cache[key] = pt;
        saveGeoCache();
        return pt;
      })
      .catch(function () { return null; });
  }

  function locateRows(list) {
    return Promise.all(list.map(function (r) {
      if (r.lat != null && r.lon != null) return Promise.resolve(r);
      return geocodeRow(r).then(function (pt) {
        if (pt) { r.lat = pt.lat; r.lon = pt.lon; }
        return r;
      });
    }));
  }

  var pfMap = null, pfMarkers = {}, pfHost = null;

  function portfolioMap() {
    var scored = rows.map(function (r) {
      var w = watchdogScore(r);
      return w ? { r: r, w: w } : null;
    }).filter(Boolean);

    if (!scored.length) return '';
    scored.sort(function (a, b) { return b.w.score - a.w.score; });

    var avg = Math.round(scored.reduce(function (a, x) { return a + x.w.score; }, 0) / scored.length);
    var cases = rows.filter(function (r) { var c = chapter123(r); return c && c.testable && c.hasCase; }).length;

    // paint() runs again after details hydrate, and it returns a brand new
    // #pf-map div every time. A guard that only compared the property list
    // therefore skipped the redraw into a container that had just been
    // replaced, leaving the placeholder spinning forever with the live map
    // still bound to a node no longer in the document.
    //
    // So the guard now asks the only question that matters: is the map
    // attached to the element currently on the page?
    setTimeout(function () {
      var host = el('pf-map');
      if (!host) return;
      if (pfHost === host && pfMap) {
        pfMap.invalidateSize();
        return;
      }
      pfHost = host;
      locateRows(rows.slice()).then(function () { drawPortfolioMap(); });
    }, 0);

    return '<section class="pf-strip">' +
      '<div class="pf-map"><div id="pf-map">' +
          '<div class="pf-none"><div class="pl-spin" style="margin:0"></div>' +
          '<span>Placing your properties...</span></div></div>' +
        '<div class="pf-map-note"><i class="fas fa-dog"></i> Pins show the Watchdog Score</div></div>' +
      '<div class="pf-rank">' +
        '<div class="pf-rank-h">' +
          '<div><b>' + avg + '</b><span>average Watchdog Score</span></div>' +
          (cases ? '<div class="hot"><b>' + cases + '</b><span>with an appeal case</span></div>' : '') +
        '</div>' +
        '<div class="pf-list">' + scored.map(function (x) {
          return '<a class="pf-i" href="/property/home.html?pin=' + encodeURIComponent(x.r.pams_pin || '') + '" ' +
            'onmouseenter="pfHi(\'' + esc(x.r.pams_pin) + '\',1)" ' +
            'onmouseleave="pfHi(\'' + esc(x.r.pams_pin) + '\',0)">' +
            '<span class="pf-s ' + x.w.band + '">' + x.w.score + '</span>' +
            '<span class="pf-a">' + esc(x.r.address) + '<em>' + esc(x.r.town || '') + '</em></span>' +
            '<span class="pf-b"><i class="' + x.w.band + '" style="width:' + x.w.score + '%"></i></span>' +
          '</a>';
        }).join('') + '</div>' +
        '<div class="pf-foot">Higher is a better tax position. It says nothing about the house itself.</div>' +
      '</div></section>';
  }

  function mapFallback(msg) {
    var host = el('pf-map');
    if (!host) return;
    // Never leave the slot blank. An empty half of the page reads as broken;
    // a short line saying why reads as honest.
    host.innerHTML = '<div class="pf-none"><i class="fas fa-map-location-dot"></i><span>' + msg + '</span></div>';
  }

  function drawPortfolioMap() {
    var host = el('pf-map');
    if (!host) { pfHost = null; return; }
    pfHost = host;
    if (typeof L === 'undefined') { mapFallback('Map library did not load.'); pfMap = null; return; }
    var pts = [];
    try {
      if (pfMap) { pfMap.remove(); pfMap = null; }
      pfMarkers = {};
      pfMap = L.map('pf-map', { zoomControl: false, scrollWheelZoom: false, attributionControl: false });
      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}{r}.png',
        { maxZoom: 19, subdomains: 'abcd' }).addTo(pfMap);

      rows.forEach(function (r) {
        if (r.lat == null || r.lon == null) return;
        var w = watchdogScore(r);
        if (!w) return;
        var mk = L.marker([r.lat, r.lon], {
          icon: L.divIcon({ className: 'pf-pin-wrap',
            html: '<div class="pf-pin ' + w.band + '"><i class="fas fa-dog"></i><b>' + w.score + '</b></div>',
            iconSize: [58, 24], iconAnchor: [29, 24] })
        }).addTo(pfMap);
        mk.bindTooltip('<b>' + esc(r.address) + '</b><br>Watchdog Score ' + w.score, { direction: 'top' });
        pfMarkers[r.pams_pin] = mk;
        pts.push([r.lat, r.lon]);
      });

      if (!pts.length) { mapFallback('Could not place these addresses on a map.'); pfMap = null; return; }
      if (pts.length === 1) pfMap.setView(pts[0], 14);
      else pfMap.fitBounds(pts, { padding: [34, 34], maxZoom: 13 });
      setTimeout(function () { if (pfMap) pfMap.invalidateSize(); }, 120);
    } catch (e) {
      mapFallback('Map could not be drawn.');
      pfMap = null;
    }
  }

  window.pfHi = function (pin, on) {
    var m = pfMarkers[pin];
    if (!m || !m._icon) return;
    var p = m._icon.querySelector('.pf-pin');
    if (p) p.classList.toggle('hi', !!on);
  };

  window.dbIntelOpen = function () {
    var overlay = el('mobile-intel-overlay');
    var content = el('mobile-intel-content');
    if (!overlay || !content) return;
    content.innerHTML = agentIntelMarkup(isPro(), true);
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('mobile-intel-open');
    try { sessionStorage.setItem('watchdogIntelSeen', '1'); } catch (_intelStorageError) {}
    var nav = document.querySelector('.intel-nav');
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
        var intelNav = document.querySelector('.intel-nav');
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
    // Agent Intel is now an overlay at every width, reached from the sidebar.
    // It reads better as something you open than as a block you scroll past,
    // and it frees the top of the page for something that earns its place.
    el('db-brief').innerHTML = rows.length ? portfolioMap() : '';

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
      var body;
      if (isPro()) {
        body = proTable() +
          [toolDueDiligencePortfolio(rows), toolCarryCostPortfolio(rows), toolPortfolio(), toolTownRiskMatrix(), toolCompare(), toolExport()].filter(Boolean).join('');
      } else {
        body =
          proLocked('The full table',
            'Every saved property on one line, with its town ratio, supported assessment, statutory limit ' +
            'and the annual dollars at stake. Built to be scanned, sorted and exported.',
            ['Ratio and supported assessment per parcel',
             'Chapter 123 limit and the amount over it',
             'Estimated annual saving, ranked',
             'Sortable and exportable'],
            ghostTable(7, 8)) +
          proLocked('Analysis tools',
            'The comparisons that need more than one property to be worth anything.',
            ['Where each property sits in its town\u2019s tax distribution',
             'Portfolio totals and blended effective rate',
             'Town by town comparison across all 565 municipalities',
             'CSV and print exports in the format a county board expects'],
            ghostPanel());
      }
      el('db-body').innerHTML = dashboardWithAd(body);
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
    // The standard view shows only what a standard account can use. A locked
    // panel sitting in the default view is an advert wearing the costume of a
    // feature, and it makes the page feel smaller than it is. Everything gated
    // lives behind the Pro tab, where somebody has actively gone looking.
    var home=primaryHome();
    return [home&&typeof toolScoreHistory==='function'?toolScoreHistory(home):'',home&&typeof toolRealEstateConcierge==='function'?toolRealEstateConcierge(home):'',toolDrift()].filter(Boolean).join('') + toolCost();
  }

  // ══════════════════════════════════════════════
  // PRO VIEW
  //
  // A standard account sees the shape of what it is missing, not a wall of
  // text telling it. The preview underneath is deliberately generic: real
  // figures behind a blur are still readable if somebody opens the inspector,
  // and showing a stranger's numbers to make a sales point is a bad trade.
  // ══════════════════════════════════════════════
  function proLocked(title, why, bullets, preview) {
    if (isPro()) return null;
    return '<section class="prolock">' +
      '<div class="prolock-ghost" aria-hidden="true">' + preview + '</div>' +
      '<div class="prolock-over">' +
        '<div class="prolock-badge"><i class="fas fa-lock"></i> Pro</div>' +
        '<h3>' + esc(title) + '</h3>' +
        '<p>' + why + '</p>' +
        '<ul>' + bullets.map(function (b) { return '<li>' + b + '</li>'; }).join('') + '</ul>' +
        '<button class="prolock-btn" onclick="dbUpgrade()">See what Pro includes</button>' +
      '</div></section>';
  }

  // Placeholder geometry only. No real addresses, no real figures.
  function ghostTable(rowsN, colsN) {
    var head = '<div class="gh-r gh-h">' + Array(colsN + 1).join('<i></i>') + '</div>';
    var body = '';
    for (var i = 0; i < rowsN; i++) {
      body += '<div class="gh-r">';
      for (var j = 0; j < colsN; j++) {
        body += '<i style="width:' + (42 + ((i * 7 + j * 13) % 46)) + '%"></i>';
      }
      body += '</div>';
    }
    return '<div class="gh-t">' + head + body + '</div>';
  }

  function ghostPanel() {
    return '<div class="gh-p">' +
      '<div class="gh-bars">' +
        [72, 46, 88, 61, 34].map(function (h) {
          return '<i style="height:' + h + '%"></i>';
        }).join('') +
      '</div>' +
      '<div class="gh-lines">' +
        [86, 64, 92, 51].map(function (w) { return '<i style="width:' + w + '%"></i>'; }).join('') +
      '</div></div>';
  }

  function afterTools() {
    if (el('tc-total')) window.dbCost();
    // The percentile painter lives in the lazy Pro bundle. Developer/Pro
    // accounts can render the standard dashboard before that bundle has ever
    // been requested, so never assume the function already exists.
    if (isPro() && typeof window.paintPercentile === 'function') window.paintPercentile();
  }

  window.dbPanel = function (p) {
    ['main','profile'].forEach(function (k) {
      var action = k === 'main' ? 'overview' : 'profile';
      var b = document.querySelector('[data-side-action="' + action + '"]');
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
  window.dbVerify = function (pin, address, town, zip) {
    if (!window.NJPTRVerification) { toast('Verification is temporarily unavailable'); return; }
    window.NJPTRVerification.open({
      client: sb, pin: pin, address: address, town: town, zip: zip,
      modal: window.plModalNote, close: window.plCloseNote, toast: toast, onVerified: paint
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

  window.dbLeadGen = function (kind, address) {
    var seller=kind==='seller';
    send({name:name(),email:plUser.email,phone:profile.phone||'Not provided',topic:'⭐ WATCHDOG '+(seller?'Seller strategy request':'Buyer strategy request'),tenure:seller?'Homeowner':'Buyer',lead_type:seller?'Seller lead':'Buyer lead',finance:'Not provided',town:'Not provided',address:address||'Not provided',message:[seller?'Seller strategy request from dashboard.':'Buyer strategy request from dashboard.','Property: '+(address||'Not provided'),'Source: /property/dashboard.html'].join('\n')});
    plModalNote(seller?'Seller strategy':'Buyer strategy','<p>'+(seller?'An agent will pair the Watchdog tax story with current comps and a listing plan.':'An agent will pair the Watchdog diligence with live market context and an offer plan.')+'</p><p><b>No obligation and no pressure.</b></p>');
  };
  window.watchdogScoreObserve = function (r, score, markerId) {
    if(!sb||!plUser||!r||!r.pams_pin)return Promise.resolve([]);
    markerId=markerId||'watchdog.score';var row={user_id:plUser.id,pams_pin:r.pams_pin,marker_id:markerId,score:+score,observed_on:new Date().toISOString().slice(0,10)};
    return sb.from('score_observations').upsert(row,{onConflict:'user_id,pams_pin,marker_id,observed_on'}).select().then(function(){return sb.from('score_observations').select('score,observed_at,observed_on').eq('user_id',plUser.id).eq('pams_pin',r.pams_pin).eq('marker_id',markerId).order('observed_at',{ascending:true}).limit(120);}).then(function(x){return x.data||[];});
  };

  // Compatibility bridge for lazy modules. Read-only getters keep shared state private.
  Object.assign(window, { el, money, esc, toast, ready, settleAuth, showSignedOut, readSession, bootAuth, meta, name, paint, greentreeRailAd, dashboardWithAd, xfetch, median, loadRefData, ratioFor, rateHistory, streetImg, loadSR1A, sr1aFor, marketValue, chapter123, countySales, hydrateDetails, detailLine, addedOn, mv, isMobileCollection, primaryHome, orderedCollectionRows, mobileSponsorCard, renderPropertyBatch, resetCollectionForViewport, sortControl, pagination, mobileScrollStatus, setupMobilePropertyScroll, propMenu, byId, propUrl, isPro, locked, brief, rnd, deadline, propertyBlock, f, proTable, tip, metricStrip, cell, titleCase, reportLink, initTips, agentIntelMarkup, loadGeoCache, saveGeoCache, geocodeRow, locateRows, portfolioMap, mapFallback, drawPortfolioMap, paintSidebarToggle, initDashboardChrome, render, rl, toolsHTML, proLocked, ghostTable, ghostPanel, afterTools, pfCompletion, grp, txt, mny, pick, yn, multi, pro, profileForm, gv, gn, gf, gb, gs, gpro, gmulti, send });
  [
    ['plUser', function () { return plUser; }],
    ['rows', function () { return rows; }],
    ['profile', function () { return profile; }],
    ['ratios', function () { return ratios; }],
    ['rates', function () { return rates; }],
    ['sr1a', function () { return sr1a; }],
    ['NJ_PARCEL', function () { return NJ_PARCEL; }],
    ['GREENTREE_URL', function () { return GREENTREE_URL; }]
  ].forEach(function (entry) {
    Object.defineProperty(window, entry[0], { configurable: true, get: entry[1] });
  });

  Promise.all([
    loadToolModules(moduleGroups.initial),
    Promise.resolve(window.njptrSideMenuReady)
  ]).then(function () {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', bootAuth, { once: true });
    } else {
      bootAuth();
    }
  }).catch(function (error) {
    console.error('Dashboard modules could not load:', error);
    var checking = el('db-auth-check');
    if (checking) checking.innerHTML = '<p>The dashboard could not load its calculation modules. Refresh the page to try again.</p>';
  });

})();
