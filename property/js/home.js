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
            '?size=560x340&location=' + encodeURIComponent(loc) + '&fov=76&pitch=6&source=outdoor&key=' +
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
        summarySentence(r, c, u, a) +
        '<div class="hm-figs">' +
          hf('Assessed', money(r.assessed || 0), 'what the town says') +
          hf('Annual tax', money(r.last_year_tax || 0), 'last full year') +
          hf('Effective rate', r.effective_rate ? (+r.effective_rate).toFixed(2) + '%' : '-', 'of market value') +
          (s ? hf('Town ratio', (s.ratio * 100).toFixed(1) + '%', s.n + ' verified sales') : '') +
          (s && s.ppsf ? hf('Price per sq ft', '$' + s.ppsf, 'median here') : '') +
          (s && s.medPrice ? hf('Median sale', money(s.medPrice), 'in this town') : '') +
        '</div>' +

        (u ? toolUniformityFor(r) : '') +
        (a ? toolAppealOddsFor(r) : '') +
        (c && c.testable ? ch123Block(r, c) : untestableBlock(r)) +
        toolReassessRisk(r) +

        '<div class="hm-acts">' +
          '<a class="db-btn" href="/property/?address=' + encodeURIComponent(loc) + '">Open the full property record</a>' +
          '<button class="tl-btn" onclick="dbAskAbout(\'' + esc(r.address).replace(/'/g, '') + '\')">Contact an agent</button>' +
        '</div>' +
      '</div>';

    initTips();
  }

  function f(k, v, note, cls) {
    return '<div><dt>' + k + '</dt><dd' + (cls ? ' class="' + cls + '"' : '') + '>' + v +
      (note ? '<em>' + note + '</em>' : '') + '</dd></div>';
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
        loadRefData(), loadSR1A(), loadUniformity(), loadAppeals()
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
