/* ============================================================
   PROPERTY REPORT
   njpropertytaxrelief.com/property
   ============================================================ */
(function () {
  'use strict';

  var HOME_MODULE_VERSION = '20260805p';
  var homeModulePromises = Object.create(null);
  var homeModuleDependencies = {
    'revaluation-radar': ['uniformity'],
    'buyer-closing-costs': ['uniformity', 'revaluation-radar', 'town-intelligence'],
    'tax-pressure-simulator': ['town-intelligence', 'municipal-budget-pressure'],
    'appeal-packet': ['uniformity'],
    'relocation': ['uniformity'],
    'investor-screen': ['uniformity'],
    'improvement-ratio': ['town-profile'],
    'property-class-mix': ['town-profile']
  };

  function loadHomeTool(name) {
    if (!homeModulePromises[name]) {
      homeModulePromises[name] = Promise.all((homeModuleDependencies[name] || []).map(loadHomeTool))
        .then(function () { return import('../tools/' + name + '.js?v=' + HOME_MODULE_VERSION); })
        .then(function (module) {
          if (name === 'uniformity') return Promise.all([loadUniformity(), loadAppeals()]).then(function () { return module; });
          if (name === 'abatement-exposure') return loadAbatements().then(function () { return module; });
          if (name === 'exempt-pilot-exposure') return loadExemptPilot().then(function () { return module; });
          return module;
        }).catch(function (error) { delete homeModulePromises[name]; throw error; });
    }
    return homeModulePromises[name];
  }
  function loadHomeTools(names) { return Promise.all(names.map(loadHomeTool)); }
  window.NJPropertyModules = { version: HOME_MODULE_VERSION, loadTool: loadHomeTool, loadTools: loadHomeTools };

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

  function getClient() {
    if (sb) return true;
    if (typeof window.supabase === 'undefined' || LEDGER_KEY.indexOf('PASTE') === 0) return false;
    sb = window.supabase.createClient(LEDGER_URL, LEDGER_KEY,
      { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce', storageKey: 'sb-uvkvaxljhhngydvlrzom-auth-token' } });
    return true;
  }

  window.plSignInPrompt = function () {
    if (!getClient()) { plModalNote('Sign in unavailable', '<p>Accounts are not switched on yet.</p>'); return; }
    plModalNote('Sign in',
      '<div class="auth-magic"><label for="auth-email">Email me a sign in link</label>' +
        '<div class="auth-magic-row"><input id="auth-email" type="email" placeholder="you@email.com" ' +
        'onkeydown="if(event.key===\'Enter\')plMagicLink()"><button onclick="plMagicLink()">Send link</button></div>' +
        '<div class="auth-magic-note">No password to create or remember.</div></div>' +
      '<div class="auth-or"><span>or</span></div>' +
      '<div class="auth-btns"><button class="auth-btn google" onclick="plOAuth(\'google\')">Continue with Google</button></div>');
  };
  window.plOAuth = function (p) {
    if (!getClient()) return;
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

  // Authentication starts once the initial shared modules are ready.

  function meta() { return (plUser && plUser.user_metadata) || {}; }
  function name() { return meta().full_name || meta().name || (plUser.email || '').split('@')[0]; }

  var NJ_PARCEL = 'https://services2.arcgis.com/XVOqAjTOJ5P6ngMu/ArcGIS/rest/services/Parcels_Composite_NJ_WM/FeatureServer/0/query';
  var GREENTREE_URL = 'https://johnvarano.com/';
  var ratios = null, rates = null;
  var GMAPS_KEY = 'AIzaSyCZBo_mj5WXyR-Bsb5yHdekxAxauTYNmlU';

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

  // Full multi-year general tax rate history for a town, sorted oldest to
  // newest. Same name-matching rule as ratioFor: try "TOWN (COUNTY)" first,
  // fall back to town alone, since a few small towns are unique statewide.
  function rateHistory(town, county) {
    if (!rates) return null;
    var t = (town || '').toUpperCase().trim();
    var tc = t + ' (' + (county || '').toUpperCase().trim() + ')';
    var keys = Object.keys(rates), hit = null;
    for (var i = 0; i < keys.length; i++) if (keys[i].toUpperCase().trim() === tc) { hit = rates[keys[i]]; break; }
    if (!hit) for (var j = 0; j < keys.length; j++) if (keys[j].toUpperCase().trim() === t) { hit = rates[keys[j]]; break; }
    if (!hit) return null;
    var years = Object.keys(hit).map(Number).filter(function (y) { return y > 1990; }).sort();
    if (years.length < 3) return null;
    return years.map(function (y) { return { year: y, rate: +hit[String(y)] }; });
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

  window.dbVerify = function (pin, address, town, zip) {
    if (!getClient() || !window.NJPTRVerification) { toast('Verification is temporarily unavailable'); return; }
    window.NJPTRVerification.open({
      client: sb, pin: pin, address: address, town: town, zip: zip,
      modal: window.plModalNote, close: window.plCloseNote, toast: toast,
      onVerified: function () { setTimeout(function () { location.reload(); }, 350); }
    });
  };

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
  function uniBody(r, u) {

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
  function appealBody(r, a) {
    var L = a.latest, u = uniFor(r);
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

  

  

  // The four numbers worth showing on a card, each one specific to this row.
  

  

  

  

  // Tooltips: one shared bubble, positioned on hover or focus. Cheaper than a
  // node per tip and it survives the list being rebuilt on every sort.
  

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
  function metricStrip(r) {
    var u = uniFor(r), a = appealFor(r), s = sr1aFor(r), c = chapter123(r);
    if (!u && !a && !s && !c) return '';

    var cells = [];
    if (u) cells.push(cell(tip('uniformity', 'Uniformity'), u.score,
      u.band, BAND_CLS[u.band] || 'mid'));
    if (s) cells.push(cell(tip('ratio', 'Town ratio'), (s.ratio * 100).toFixed(1) + '%',
      s.n + ' verified sales', ''));
    if (a) cells.push(cell(tip('odds', 'Appeal odds'), a.latest.win_rate_filed + '%',
      esc(titleCase(a.county)) + ' County', ''));
    if (c && c.testable) {
      cells.push(cell(tip('gap', 'Over the limit'),
        c.hasCase ? money(c.over) : 'No',
        c.hasCase ? 'worth ' + money(c.saving) + '/yr' : 'within Chapter 123',
        c.hasCase ? 'bad' : 'good'));
    } else if (r.effective_rate) {
      cells.push(cell(tip('eff', 'Effective rate'), (+r.effective_rate).toFixed(2) + '%',
        'of market value', ''));
    }

    return '<div class="ms">' + cells.join('') + '</div>';
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

  // A section, not a card. A hairline and a small label, then the content.
  function toolCard(title, icon, body) {
    return '<section class="sec"><h4><i class="fas ' + icon + '"></i>' + title + '</h4>' + body + '</section>';
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

  

  // Classify every recent verified sale in a town against that town's own ratio.
  

  // Where does THIS property sit? Needs its own verified sale to say anything.
  

  // the sales loader is named countySales in this file
  

  

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
  

  

  // ══════════════════════════════════════════════
  // 13 · FIRST TIME BUYER TRUE COST
  //
  // A listing shows the seller's tax bill. That is not what the buyer will pay,
  // for two reasons nobody mentions at the open house: the assessment may not
  // have caught up with what the house is now worth, and the rate moves every
  // year regardless.
  // ══════════════════════════════════════════════
  

  

  

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

  

  

  

  // ══════════════════════════════════════════════
  // TOWN PROFILE  ·  one query, two tools
  //
  // Both of the tools below need the same thing: every class 2 parcel in the
  // municipality with its land and improvement values, plus the class mix of
  // the whole town. Pulling that once and sharing it keeps a single request on
  // a free public server rather than two.
  // ══════════════════════════════════════════════
  var townProfileCache = {};

  

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
  

  

  

  

  

  // ══════════════════════════════════════════════
  // 15 · INVESTOR SCREENER
  //
  // Ranks saved properties on the only measure that compares fairly across
  // town lines: tax per thousand dollars of market value. Two properties at
  // the same price in different municipalities can differ by thousands a year,
  // and assessed value cannot show that because assessment levels differ
  // everywhere.
  // ══════════════════════════════════════════════
  

  // ══════════════════════════════════════════════
  // PROPERTY REPORT
  //
  // Everything the site knows about one property, in one place. The dashboard
  // shows four numbers per property and links here for the rest, which is the
  // right split: a list should stay scannable and a report should go deep.
  // ══════════════════════════════════════════════
  var current = null;

  function qsPin() {
    var m = window.location.search.match(/[?&]pin=([^&]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  }

  window.hmSwitch = function (pin) {
    history.replaceState({}, '', '/property/home.html?pin=' + encodeURIComponent(pin));
    current = rows.filter(function (r) { return r.pams_pin === pin; })[0] || rows[0];
    OPEN = {};
    paintReport();
    paintHomeChrome();
  };

  window.hmGlossary = function () {
    plModalNote('Glossary',
      '<div class="gl">' + Object.keys(GLOSSARY).map(function (k) {
        return '<div><b>' + esc(k) + '</b><span>' + GLOSSARY[k] + '</span></div>';
      }).join('') + '</div>');
  };

  var GLOSSARY = {
    'Assessed value':
      'What your municipality says your property is worth for tax purposes. In almost no New Jersey town ' +
      'does this equal market value, which is the source of most confusion about property taxes.',
    'Equalization ratio':
      'The share of true market value that assessments in a town run at. Certified each October by the ' +
      'Director of the Division of Taxation for the following tax year, which means it is priced roughly ' +
      'eighteen months behind the market.',
    'Verified sales ratio':
      'The same measurement, but taken from the state\u2019s SR1A file of sales an assessor confirmed were ' +
      'genuine arm\u2019s length transactions, and from the most recent ones. It usually runs lower than the ' +
      'published ratio in a rising market, and lands closer to what homes actually sell for.',
    'Coefficient of deviation':
      'The average percentage by which individual assessments in a town stray from that town\u2019s own ' +
      'average. Under 15 is the professional standard for residential property. A high coefficient means ' +
      'the town assesses unevenly, which is the condition an appeal argues from.',
    'Chapter 123':
      'The New Jersey statute that governs assessment appeals. It gives every town a 15 percent cushion: ' +
      'your assessment has to exceed the supported figure by more than 15 percent before a county board is ' +
      'required to reduce it.',
    'Supported assessment':
      'Market value multiplied by the town ratio. What your assessment should be if the town applied its own ' +
      'standard to your property.',
    'Effective tax rate':
      'Annual tax divided by market value, rather than by assessed value. The only fair way to compare two ' +
      'properties in different towns.',
    'Stipulated appeal':
      'An appeal settled by agreement with the town before a hearing. It counts as a win, and most successful ' +
      'appeals end this way.',
    'PAMS PIN':
      'The statewide parcel identifier. The first two digits are the county, the next two the municipality, ' +
      'which is how every dataset on this site joins together.'
  };

  function paintReport() {
    var r = current;
    paintHomeChrome();
    if (!r) {
      el('hm-body').innerHTML = '<div class="wrap"><div class="blank"><h3>Nothing saved yet</h3>' +
        '<p>Look up an address and claim it, and its report appears here.</p>' +
        '<a class="db-btn" href="/property/">Look up an address</a></div></div>';
      return;
    }

    var sw = el('hm-switch');
    if (sw) {
      sw.innerHTML = rows.map(function (x) {
        return '<option value="' + esc(x.pams_pin) + '"' + (x.pams_pin === r.pams_pin ? ' selected' : '') +
          '>' + esc(x.address) + (x.kind === 'home' ? '  \u00b7  your home' : '  \u00b7  watchlist') + '</option>';
      }).join('');
    }

    var c = chapter123(r), u = uniFor(r), a = appealFor(r), s = sr1aFor(r);
    var loc = [r.address, r.town, 'NJ', r.zip].filter(Boolean).join(', ');

    el('hm-body').innerHTML =
      '<header class="hm-hero">' +
        '<div class="hm-hero-in">' +
          '<div class="hm-shot" style="background-image:url(\'https://maps.googleapis.com/maps/api/streetview' +
            '?size=760x460&location=' + encodeURIComponent(loc) + '&fov=76&pitch=6&source=outdoor&key=' +
            GMAPS_KEY + '\')"></div>' +
          '<div class="hm-id">' +
            '<span class="hm-kind">' + (r.kind === 'home' ? 'Your home' : 'Watchlist') + '</span>' +
            '<h1>' + esc(r.address) + '</h1>' +
            '<p>' + esc(r.town || '') + (r.county ? ', ' + esc(titleCase(r.county)) + ' County' : '') +
              (r.block ? '  \u00b7  Block ' + esc(r.block) + ' Lot ' + esc(r.lot || '') : '') +
              (r.pams_pin ? '  \u00b7  ' + esc(r.pams_pin) : '') + '</p>' +
            (c ? '<div class="hm-val"><b>' + money(Math.round(c.market / 1000) * 1000) + '</b>' +
              '<span>estimated market value, from ' +
              (c.src === 'verified' ? c.n + ' verified sales in this town' : 'the published town ratio') +
              '</span></div>' : '') +
          '</div>' +
        '</div>' +
      '</header>' +

      '<div class="wrap hm-wrap">' +
        '<section class="ai">' +
          '<div class="ai-h">' +
            '<img src="/johnprofile.jpg" alt="" onerror="this.style.display=\'none\'">' +
            '<div><b>Agent Intel</b><span>Generated from this property\u2019s records</span></div>' +
          '</div>' +
          summarySentence(r, c, u, a) +
          intelPoints(r, c, u, a) +
        '</section>' +
        '<div class="hm-figs">' +
          hf('Assessed', money(r.assessed || 0), 'what the town says') +
          hf('Annual tax', money(r.last_year_tax || 0), 'last full year') +
          hf('Effective rate', r.effective_rate ? (+r.effective_rate).toFixed(2) + '%' : '-', 'of market value') +
          (s ? hf('Town ratio', (s.ratio * 100).toFixed(1) + '%', s.n + ' verified sales') : '') +
          (s && s.ppsf ? hf('Price per sq ft', '$' + s.ppsf, 'median here') : '') +
          (s && s.medPrice ? hf('Median sale', money(s.medPrice), 'in this town') : '') +
        '</div>' +

        scorecard(r) +

        '<div class="hm-secbar"><h2>The detail</h2>' +
          '<button id="hm-all" onclick="hmExpandAll()"><i class="fas fa-expand"></i> Expand all</button></div>' +

        SECTIONS.map(function (sec) { return sectionShell(sec, r); }).join('') +

        '<div class="hm-acts">' +
          '<a class="db-btn" href="/property/?address=' + encodeURIComponent(loc) + '">Open the full property record</a>' +
          '<button class="tl-btn" onclick="dbAskAbout(\'' + esc(r.address).replace(/'/g, '') + '\')">Contact an agent</button>' +
        '</div>' +
      '</div>';

    initTips();
  }


  // ══════════════════════════════════════════════
  // PAGE STRUCTURE
  //
  // The previous version stacked fourteen tools down one column. Everything was
  // correct and almost nobody would have read past the third. A tax report has
  // two readers who want opposite things: a homeowner wants one sentence and a
  // number, a professional wants every figure at once.
  //
  // So the page opens with a scorecard, then collapses everything. Each closed
  // header carries a one line summary, so the whole page can be scanned without
  // opening anything. Each opened section leads with the plain reading and
  // carries a separate note on why a professional would care. Content is built
  // on open rather than on load, which keeps the first paint fast.
  // ══════════════════════════════════════════════
  var OPEN = {};

  var SECTIONS = [
    {
      k: 'fair', icon: 'fa-scale-balanced', title: 'Is this assessment fair?',
      pro: 'The Chapter 123 test verbatim, then where the excess sits. Land value is close to unarguable; ' +
           'the improvement figure is a judgment about a structure, and judgment is what an appeal contests.',
      build: function (r) {
        var c = chapter123(r);
        return (c && c.testable ? ch123Block(r, c) : untestableBlock(r)) + toolImprovementRatio(r);
      },
      sum: function (r) {
        var c = chapter123(r);
        if (!c || !c.testable) return 'Needs comparable sales to test';
        return c.hasCase ? money(c.over) + ' above the limit' : 'Within the cushion the state allows';
      },
      tone: function (r) {
        var c = chapter123(r);
        return (c && c.testable && c.hasCase) ? 'bad' : (c && c.testable) ? 'good' : '';
      }
    },
    {
      k: 'kept', icon: 'fa-arrow-trend-up', title: 'Has the assessment kept up?',
      pro: 'For a buyer this is undisclosed exposure, because the listing shows the seller\u2019s bill. ' +
           'For a seller it is worth knowing before an offer arrives.',
      build: function (r) { return toolReassessRisk(r) + toolAddedOmitted(r); }
    },
    {
      k: 'farmland', icon: 'fa-seedling', title: 'Could farmland assessment apply?',
      pro: 'For rural property, a small change in qualifying acreage, gross sales or continued use can change the assessment basis entirely. This checklist makes the filing requirements and rollback exposure explicit before a client relies on the benefit.',
      build: function (r) { return toolFarmland(r); },
      sum: function (r) {
        var s = typeof farmlandSavedFor === 'function' ? farmlandSavedFor(r) : null;
        return s && s.acres ? s.acres + ' acres entered' : '5-acre, use and gross-sales screen';
      }
    },
    {
      k: 'reval', icon: 'fa-tower-broadcast', title: 'Is a revaluation coming?',
      pro: 'A reset redistributes burden across a whole town at once. Knowing which side a client lands on ' +
           'beforehand is the difference between a call they thank you for and one they do not.',
      build: function (r) { return toolRevalRadar(r); },
      sum: function (r) {
        var v = revalRadar(r);
        return v ? 'Pressure ' + v.score + ' of 100' : '';
      }
    },
    {
      k: 'town', icon: 'fa-ruler-combined', title: 'How this town assesses',
      pro: 'A high coefficient of deviation means the roll itself is uneven, which strengthens every appeal ' +
           'in the municipality regardless of the individual property.',
      build: function (r) {
        var u = uniFor(r);
        return townIntelligenceCard(r) + budgetPressureCard(r) + (u ? uniBody(r, u) : '') + toolClassMix(r) + toolAbatement(r) + toolExemptPilot(r);
      },
      sum: function (r) {
        var t = townIntelFor(r), u = uniFor(r), b = budgetPressureFor(r);
        return t ? 'Fairness ' + t.score + ', statewide rank #' + t.stateRank + (b ? ', budget pressure ' + b.score + '/100' : '') :
          (u ? 'Uniformity ' + u.score + ' of 100, ' + u.band : '');
      }
    },
    {
      k: 'file', icon: 'fa-gavel', title: 'What happens if you file',
      pro: 'Ten years of county board outcomes, then a printable packet with the comparables and the ' +
           'statutory calculation already assembled.',
      build: function (r) {
        var a = appealFor(r);
        return (a ? appealBody(r, a) : '') + toolAppealPacket(r);
      },
      sum: function (r) {
        var a = appealFor(r);
        return a ? a.latest.win_rate_filed + '% of appeals here won a reduction' : '';
      }
    },
    {
      k: 'owed', icon: 'fa-hand-holding-dollar', title: 'Money you may be owed',
      pro: 'ANCHOR, Stay NJ and the Senior Freeze interact in a way most people get wrong. Stay NJ is a ' +
           'top-off rather than an addition, and the Freeze base year is the item that actually compounds.',
      build: function (r) { return toolSeniorBenefits(r); }
    },
    {
      k: 'buy', icon: 'fa-key', title: 'What a buyer would pay',
      pro: 'Running the buyer\u2019s number before an offer is written avoids the conversation nobody wants ' +
           'after closing.',
      build: function (r) { return toolBuyerCost(r); }
    },
    {
      k: 'compare', icon: 'fa-route', title: 'Compare against other towns',
      pro: 'Tax per dollar of value is the only measure that travels across municipal lines. Useful for a ' +
           'relocation conversation and for ranking a portfolio.',
      build: function (r) { return toolRelocation(r) + toolInvestorScreen(); }
    },
    {
      k: 'trend', icon: 'fa-chart-line', title: 'Where is this bill headed?',
      pro: 'Isolates the town\u2019s tax RATE trend from any reassessment or revaluation, so a buyer or ' +
           'seller can see the budget-driven trajectory on its own.',
      build: function (r) { return toolTaxTrajectory(r) + toolTaxPressure(r); },
      sum: function (r) {
        var t = trajectory(r);
        return t ? (t.cagr >= 0 ? '+' : '') + (t.cagr * 100).toFixed(1) + '%/yr' : '';
      }
    },
    {
      k: 'history', icon: 'fa-clock-rotate-left', title: 'How has this property changed?',
      pro: 'Watchdog preserves observed assessment and tax snapshots that are not available as a clean parcel history from the state. The timeline separates a changed assessment from a changed bill.',
      build: function (r) { return toolTimeMachine(r); },
      sum: function (r) {
        var pts = typeof propertySnapshotPoints === 'function' ? propertySnapshotPoints(r) : [];
        return pts.length > 1 ? pts.length + ' recorded observations' : 'Baseline is being built';
      }
    }
  ];

  function sectionShell(sec, r) {
    var sum = '', tone = '';
    try { sum = sec.sum ? (sec.sum(r) || '') : ''; } catch (e) {}
    try { tone = sec.tone ? (sec.tone(r) || '') : ''; } catch (e) {}
    return '<section class="sec2 ' + tone + '" id="sec-' + sec.k + '">' +
      '<button class="sec2-h" onclick="hmToggle(\'' + sec.k + '\')">' +
        '<i class="fas ' + sec.icon + ' sec2-i"></i>' +
        '<span class="sec2-t">' + sec.title + '</span>' +
        (sum ? '<span class="sec2-s">' + sum + '</span>' : '') +
        '<i class="fas fa-chevron-down sec2-c"></i>' +
      '</button>' +
      '<div class="sec2-b">' +
        '<div class="sec2-pro"><b>Why a professional cares</b><span>' + sec.pro + '</span></div>' +
        '<div id="secb-' + sec.k + '"></div>' +
      '</div></section>';
  }


  var HOME_SECTION_MODULES = {
    fair: ['improvement-ratio'],
    kept: ['reassessment-risk', 'assessment-drift', 'added-omitted-monitor'],
    farmland: ['farmland-qualification'],
    reval: ['revaluation-radar'],
    town: ['town-intelligence', 'municipal-budget-pressure', 'property-class-mix', 'abatement-exposure', 'exempt-pilot-exposure'],
    file: ['appeal-packet'],
    owed: ['senior-benefits'],
    buy: ['buyer-closing-costs'],
    compare: ['relocation', 'investor-screen'],
    trend: ['tax-trajectory', 'tax-pressure-simulator'],
    history: ['assessment-drift']
  };

  window.hmToggle = function (k) {
    OPEN[k] = !OPEN[k];
    var e = el('sec-' + k);
    if (!e) return;
    e.classList.toggle('open', OPEN[k]);
    if (OPEN[k] && !e.getAttribute('data-built')) {
      var sec = SECTIONS.filter(function (x) { return x.k === k; })[0];
      var host = el('secb-' + k);
      if (sec && host && current) {
        host.innerHTML = '<div class="tl-note"><div class="pl-spin"></div> Loading this analysis...</div>';
        loadHomeTools(HOME_SECTION_MODULES[k] || []).then(function () {
          var html = '';
          try { html = sec.build(current) || ''; }
          catch (err) { console.error('Section build failed:', k, err); html = '<div class="tl-note">This section could not be built for this property.</div>'; }
          host.innerHTML = html || '<div class="tl-note">Nothing to show here for this property.</div>';
          e.setAttribute('data-built', '1');
          initTips();
          if (el('tc-total')) window.dbCost();
        }).catch(function (error) {
          console.error('Section module failed:', k, error);
          host.innerHTML = '<div class="tl-note">This analysis could not load. Close and reopen the section to try again.</div>';
        });
      }
    }
  };

  window.hmOpen = function (k) {
    if (!OPEN[k]) window.hmToggle(k);
    var e = el('sec-' + k);
    if (e && e.scrollIntoView) e.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  window.hmExpandAll = function () {
    SECTIONS.forEach(function (x) { if (!OPEN[x.k]) window.hmToggle(x.k); });
    var b = el('hm-all');
    if (b) { b.innerHTML = '<i class="fas fa-compress"></i> Collapse all';
             b.setAttribute('onclick', 'hmCollapseAll()'); }
  };
  window.hmCollapseAll = function () {
    SECTIONS.forEach(function (x) { if (OPEN[x.k]) window.hmToggle(x.k); });
    var b = el('hm-all');
    if (b) { b.innerHTML = '<i class="fas fa-expand"></i> Expand all';
             b.setAttribute('onclick', 'hmExpandAll()'); }
  };

  // ── the scorecard: four numbers, each with a verdict you can act on ──
  function scorecard(r) {
    var c = chapter123(r), u = uniFor(r), a = appealFor(r), s = sr1aFor(r);
    var cards = [];

    if (c) {
      var over = c.testable && c.hasCase;
      cards.push({ k: 'fair',
        n: c.testable ? (over ? money(c.over) : 'None') : '\u2014',
        l: 'Over the Chapter 123 limit',
        v: !c.testable ? 'Needs comparable sales to test'
           : over ? (c.saving ? 'Worth about ' + money(c.saving) + ' a year' : 'There is a case here')
           : 'No appeal to make on these numbers',
        tone: over ? 'bad' : c.testable ? 'good' : '' });
    }
    if (u) {
      cards.push({ k: 'town', n: u.score, l: 'Assessment uniformity, of 100',
        v: u.percentile >= 50 ? 'Fairer than ' + u.percentile + '% of New Jersey'
                              : 'Less consistent than ' + (100 - u.percentile) + '% of New Jersey',
        tone: u.score >= 60 ? 'good' : u.score < 35 ? 'bad' : 'mid' });
    }
    if (a) {
      cards.push({ k: 'file', n: a.latest.win_rate_filed + '%', l: 'Appeals here that won',
        v: titleCase(a.county) + ' County, ' + a.latest_year,
        tone: a.latest.win_rate_filed >= 50 ? 'good' : a.latest.win_rate_filed < 35 ? 'bad' : 'mid' });
    }
    if (c) {
      cards.push({ k: 'kept', n: money(Math.round(c.market / 1000) * 1000), l: 'Estimated market value',
        v: c.src === 'verified' ? 'From ' + c.n + ' verified sales in this town'
                                : 'From the published town ratio', tone: '' });
    }
    if (!cards.length) return '';

    return '<div class="sc-cards">' + cards.map(function (x) {
      return '<button class="sc-c ' + (x.tone || '') + '" onclick="hmOpen(\'' + x.k + '\')">' +
        '<b>' + x.n + '</b><span class="sc-l">' + x.l + '</span>' +
        '<span class="sc-v">' + x.v + '</span>' +
        '<span class="sc-go">See why <i class="fas fa-arrow-down"></i></span></button>';
    }).join('') + '</div>';
  }

  function f(k, v, note, cls) {
    return '<div><dt>' + k + '</dt><dd' + (cls ? ' class="' + cls + '"' : '') + '>' + v +
      (note ? '<em>' + note + '</em>' : '') + '</dd></div>';
  }


  // The paragraph gives the shape. These are the things an agent would actually
  // say out loud, and only the ones this property earns.
  function intelPoints(r, c, u, a) {
    var p = [];
    if (c && c.testable && c.hasCase) {
      p.push(['fa-scale-unbalanced-flip', 'bad',
        'There is an argument here. The assessment is above the Chapter 123 limit' +
        (c.saving ? ' and a reduction is worth about ' + money(Math.round(c.saving)) + ' a year' : '') + '.']);
    }
    if (u && u.coefficient > 20) {
      p.push(['fa-ruler-combined', 'bad',
        'The town assesses unevenly, at a coefficient of ' + u.coefficient +
        ' against a standard of 15. That inconsistency is what an appeal argues from.']);
    } else if (u && u.coefficient < 10) {
      p.push(['fa-ruler-combined', 'good',
        'The town assesses tightly, at a coefficient of ' + u.coefficient +
        '. A board here will be harder to persuade, because the roll is defensible.']);
    }
    if (a && a.latest && a.latest.win_rate_filed >= 50) {
      p.push(['fa-gavel', 'good',
        titleCase(a.county) + ' County reduced ' + a.latest.win_rate_filed +
        '% of the appeals filed last year. That is a receptive board.']);
    } else if (a && a.latest && a.latest.win_rate_filed < 35) {
      p.push(['fa-gavel', 'bad',
        titleCase(a.county) + ' County reduced only ' + a.latest.win_rate_filed +
        '% of appeals filed last year. Bring real evidence or do not file.']);
    }
    if (a && a.trend && Math.abs(a.trend) >= 8) {
      p.push(['fa-arrow-trend-' + (a.trend > 0 ? 'up' : 'down'), a.trend > 0 ? 'good' : 'bad',
        'Appeal success in this county has moved ' + (a.trend > 0 ? 'up ' : 'down ') +
        Math.abs(a.trend) + ' points over ten years.']);
    }
    var s = sr1aFor(r), own = s ? ownLag(r, s.ratio) : null;
    if (own && own.behind && own.cls === 'stale') {
      p.push(['fa-arrow-trend-up', 'bad',
        'The assessment has not caught up with the ' + own.year + ' sale. Roughly ' +
        money(Math.round(own.gap)) + ' of assessed value is unbooked, and it will land eventually.']);
    }
    if (own && own.ahead) {
      p.push(['fa-file-signature', 'good',
        'It sold below its own assessed level in ' + own.year +
        '. Your own arm\u2019s length sale is stronger evidence than any comparable.']);
    }
    var bp = typeof budgetPressureAgentPoint === 'function' ? budgetPressureAgentPoint(r) : null;
    if (bp && (bp.band === 'high' || bp.band === 'elevated')) {
      p.push(['fa-building-columns', 'bad',
        'Municipal budget pressure is ' + bp.band + ' at ' + bp.score + '/100. ' + bp.text]);
    } else if (bp && bp.band === 'low') {
      p.push(['fa-building-columns', 'good',
        'Municipal budget pressure is currently low at ' + bp.score + '/100. ' + bp.text]);
    }
    if (r.verify_level !== 'mail' && r.kind === 'home') {
      p.push(['fa-badge-check', '',
        'Ownership is not verified on this one yet, which is worth doing before anything is filed.']);
    }
    if (!p.length) return '';
    return '<ul class="ai-pts">' + p.map(function (x) {
      return '<li class="' + x[1] + '"><i class="fas ' + x[0] + '"></i><span>' + x[2] + '</span></li>';
    }).join('') + '</ul>';
  }

  function hf(k, v, sub) {
    return '<div><dt>' + k + '</dt><dd>' + v + '<em>' + sub + '</em></dd></div>';
  }

  function summarySentence(r, c, u, a) {
    var p = [];
    p.push('<b>' + esc(r.address) + '</b> is assessed at <b>' + money(r.assessed || 0) + '</b>');
    if (r.last_year_tax) p.push(' and taxed <b>' + money(r.last_year_tax) + '</b> a year');
    p.push('. ');
    if (c) {
      p.push(c.src === 'verified'
        ? 'Sales in ' + esc(r.town) + ' that New Jersey verified as genuine put assessments there at <b>' +
          (c.ratio * 100).toFixed(1) + '%</b> of market, implying a value around <b>' +
          money(Math.round(c.market / 1000) * 1000) + '</b>. '
        : 'At the published ratio that implies about <b>' + money(Math.round(c.market / 1000) * 1000) + '</b>. ');
    }
    if (u) {
      p.push('The town scores <b>' + u.score + '</b> for assessment uniformity, ' +
        (u.percentile >= 50 ? 'better than ' + u.percentile + '% of New Jersey'
                            : 'behind ' + (100 - u.percentile) + '% of New Jersey') + '. ');
    }
    if (c && c.testable && c.hasCase) {
      p.push('<span class="hm-flag">The assessment sits ' + money(c.over) +
        ' above the Chapter 123 limit' + (c.saving ? ', worth about ' + money(c.saving) + ' a year' : '') + '.</span>');
    } else if (c && c.testable) {
      p.push('Against ' + c.basis + ' it sits inside the cushion the state allows.');
    }
    return '<p class="hm-lede">' + p.join('') + '</p>';
  }

  function ch123Block(r, c) {
    return toolCard('Chapter 123 analysis', 'fa-scale-balanced',
      '<p class="tl-p">This is the test a county board applies. Your assessment has to exceed the supported ' +
      'figure by more than 15 percent before a reduction is required.</p>' +
      '<dl class="fig">' +
        f('Market value', money(Math.round(c.indep)), 'from ' + c.basis) +
        f('Supported assessment', money(Math.round(c.fair))) +
        f('Chapter 123 limit', money(Math.round(c.limit))) +
        f(c.hasCase ? 'Over by' : 'Under by', money(Math.abs(Math.round(c.over))), null,
          c.hasCase ? 'neg' : 'pos') +
        (c.saving ? f('If reduced', money(Math.round(c.saving)) + '/yr') : '') +
      '</dl>');
  }

  function untestableBlock(r) {
    return toolCard('Chapter 123 analysis', 'fa-scale-balanced',
      '<p class="tl-p">An appeal is argued against comparable sales, not against the town ratio. Deriving a ' +
      'market value from the assessment and then testing the assessment against it would be circular, so this ' +
      'stays blank until there is independent evidence.</p>' +
      '<a class="tl-btn" href="/property/?address=' +
      encodeURIComponent([r.address, r.town, 'NJ', r.zip].filter(Boolean).join(', ')) +
      '">Open the full record to run it</a>');
  }

  function paintHomeChrome() {
    if (!plUser) return;
    var m = meta();
    var displayName = name() || '';
    var avatar = el('hm-avatar');
    if (avatar) {
      var photo = m.avatar_url || m.picture;
      avatar.innerHTML = photo
        ? '<img src="' + esc(photo) + '" alt="">'
        : '<div class="db-noav">' + esc((displayName || '?').charAt(0).toUpperCase()) + '</div>';
    }
    var heading = el('hm-hi');
    if (heading) heading.textContent = current && current.address ? current.address : 'Your property report';
    var email = el('hm-email');
    if (email) email.textContent = plUser.email || '';
    var stat = el('hm-stat');
    if (stat) {
      stat.innerHTML = current
        ? '<span>' + esc(current.town || 'New Jersey') + '</span>' +
          (current.last_year_tax ? '<span>' + money(current.last_year_tax) + ' yearly tax</span>' : '') +
          '<span>' + (current.kind === 'home' ? 'Your home' : 'Watchlist') + '</span>'
        : '<span>' + rows.length + ' saved ' + (rows.length === 1 ? 'property' : 'properties') + '</span>';
    }
  }

  window.hmToggleSidebar = function () {
    if (window.matchMedia && window.matchMedia('(max-width: 760px)').matches) return;
    document.body.classList.toggle('db-sidebar-expanded');
    var expanded = document.body.classList.contains('db-sidebar-expanded');
    try { localStorage.setItem('watchdogSidebarExpanded', expanded ? '1' : '0'); } catch (e) {}
    paintHomeSidebarToggle();
  };

  function paintHomeSidebarToggle() {
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

  window.hmAgentIntel = function () {
    var panel = document.querySelector('#hm-body .ai');
    if (panel && panel.scrollIntoView) panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  window.hmScrollTop = function () {
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
  };

  function initHomeChrome() {
    try {
      if (localStorage.getItem('watchdogSidebarExpanded') === '1' &&
          !(window.matchMedia && window.matchMedia('(max-width: 760px)').matches)) {
        document.body.classList.add('db-sidebar-expanded');
      }
    } catch (e) {}
    paintHomeSidebarToggle();
    var queued = false;
    window.addEventListener('scroll', function () {
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () {
        queued = false;
        var button = el('db-to-top');
        if (button) button.classList.toggle('show', window.scrollY > 850);
      });
    }, { passive: true });
  }

  // Per property versions of the two tools that used to run once for rows[0].
  function toolUniformityFor(r) { var s = uniFor(r); return s ? uniBody(r, s) : ''; }
  function toolAppealOddsFor(r) { var a = appealFor(r); return a ? appealBody(r, a) : ''; }

  // ── boot ──
  function bootHome() {
    if (!getClient()) { setTimeout(bootHome, 120); return; }
    sb.auth.getSession().then(function (res) {
      plUser = (res && res.data && res.data.session) ? res.data.session.user : null;
      if (!plUser) {
        el('hm-loading').style.display = 'none';
        el('hm-gate').style.display = '';
        return;
      }
      el('hm-loading').style.display = 'none';
      el('hm-gate').style.display = 'none';
      el('hm-main').style.display = '';
      Promise.all([
        // These three modules supply calculations used while the report is
        // first painted. The remaining report tools stay lazy-loaded when
        // their corresponding sections are opened.
        loadHomeTools(['uniformity', 'town-intelligence', 'municipal-budget-pressure', 'revaluation-radar', 'reassessment-risk']),
        sb.from('saved_properties').select('*').order('created_at', { ascending: false }),
        sb.from('profiles').select('*').eq('id', plUser.id).maybeSingle(),
        loadRefData(), loadSR1A()
      ]).then(function (out) {
        rows = (out[1] && out[1].data) || [];
        profile = (out[2] && out[2].data) || {};
        var pin = qsPin();
        current = (pin && rows.filter(function (x) { return x.pams_pin === pin; })[0]) ||
                  rows.filter(function (x) { return x.kind === 'home'; })[0] || rows[0];
        paintHomeChrome();
        paintReport();
        if (location.hash === '#sec-history') window.hmToggle('history');
        // square footage, year built and the last verified sale come from the
        // SR1A county file, which is too large to block the first paint on.
        hydrateDetails().then(function () { paintReport(); paintHomeChrome(); });
      }).catch(function (error) {
        console.error('Property report workspace failed:', error);
        el('hm-body').innerHTML = '<div class="wrap"><div class="db-error-panel"><i class="fas fa-triangle-exclamation"></i>' +
          '<div><h3>We could not finish loading this property report.</h3><p>Your saved information has not been changed.</p>' +
          '<button class="db-btn" onclick="location.reload()">Try again</button></div></div></div>';
      });
    }).catch(function (error) {
      console.error('Property report session failed:', error);
      el('hm-loading').style.display = 'none';
      el('hm-gate').style.display = '';
    });
  }
  function startHome() {
    Promise.resolve(window.njptrSideMenuReady).then(function () {
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootHome, { once: true });
      else bootHome();
    });
  }
  initHomeChrome();
  startHome();
  Object.assign(window, { el, money, esc, toast, getClient, meta, name, xfetch, median, loadRefData, ratioFor, rateHistory, loadSR1A, sr1aFor, marketValue, chapter123, countySales, hydrateDetails, detailLine, addedOn, mv, sortControl, propMenu, byId, propUrl, isPro, locked, uniBody, appealBody, tip, metricStrip, cell, titleCase, reportLink, initTips, toolCard, qsPin, paintReport, sectionShell, scorecard, f, intelPoints, hf, summarySentence, ch123Block, untestableBlock, paintHomeChrome, paintHomeSidebarToggle, initHomeChrome, toolUniformityFor, toolAppealOddsFor, bootHome, startHome });
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

})();
