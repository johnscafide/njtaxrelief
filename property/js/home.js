/* ============================================================
   PROPERTY REPORT
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
      build: function (r) { return toolReassessRisk(r); }
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
        return (u ? uniBody(r, u) : '') + toolClassMix(r) + toolAbatement(r);
      },
      sum: function (r) {
        var u = uniFor(r);
        return u ? 'Uniformity ' + u.score + ' of 100, ' + u.band : '';
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

  window.hmToggle = function (k) {
    OPEN[k] = !OPEN[k];
    var e = el('sec-' + k);
    if (!e) return;
    e.classList.toggle('open', OPEN[k]);
    if (OPEN[k] && !e.getAttribute('data-built')) {
      var sec = SECTIONS.filter(function (x) { return x.k === k; })[0];
      var host = el('secb-' + k);
      if (sec && host && current) {
        var html = '';
        try { html = sec.build(current) || ''; }
        catch (err) { html = '<div class="tl-note">This section could not be built for this property.</div>'; }
        host.innerHTML = html || '<div class="tl-note">Nothing to show here for this property.</div>';
        e.setAttribute('data-built', '1');
        initTips();
        if (el('tc-total')) window.dbCost();
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

  // Per property versions of the two tools that used to run once for rows[0].
  function toolUniformityFor(r) { var s = uniFor(r); return s ? uniBody(r, s) : ''; }
  function toolAppealOddsFor(r) { var a = appealFor(r); return a ? appealBody(r, a) : ''; }

  // ── boot ──
  function ready() {
    if (typeof supabase === 'undefined') { setTimeout(ready, 120); return; }
    sb = supabase.createClient(LEDGER_URL, LEDGER_KEY);
    sb.auth.getSession().then(function (res) {
      plUser = (res && res.data && res.data.session) ? res.data.session.user : null;
      if (!plUser) { el('hm-gate').style.display = ''; return; }
      el('hm-main').style.display = '';
      Promise.all([
        sb.from('saved_properties').select('*').order('created_at', { ascending: false }),
        sb.from('profiles').select('*').eq('id', plUser.id).maybeSingle(),
        loadRefData(), loadSR1A(), loadUniformity(), loadAppeals(), loadAbatements()
      ]).then(function (out) {
        rows = (out[0] && out[0].data) || [];
        profile = (out[1] && out[1].data) || {};
        var pin = qsPin();
        current = (pin && rows.filter(function (x) { return x.pams_pin === pin; })[0]) ||
                  rows.filter(function (x) { return x.kind === 'home'; })[0] || rows[0];
        paintReport();
        // square footage, year built and the last verified sale come from the
        // SR1A county file, which is too large to block the first paint on.
        hydrateDetails().then(paintReport);
      });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
  else ready();
})();
