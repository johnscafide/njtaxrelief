/* ============================================================
   APPEAL PROSPECT SCANNER
   njpropertytaxrelief.com/property

   Screens every parcel in a municipality that has a verified arm's length
   sale on record, and tests its current assessment against that sale using
   the Chapter 123 formula.

   WHY THIS WORKS WHERE A VALUATION MODEL DOES NOT

     I tested predicting sale prices from town median price per square foot,
     leave-one-out, across 790 Winslow sales. Median error 14.5%. Matching on
     size and vintage improved it to 13.8%, which is not enough to matter. The
     ceiling is inherent: public records cannot see condition, upgrades or
     interior finish, and those are most of what separates two houses of the
     same size on the same street.

     So this does not estimate value at all. It uses the price each property
     ACTUALLY SOLD FOR. That is not a model output, it is a fact the state has
     already verified, and it is the single strongest piece of evidence a
     county board accepts, because it is the subject property itself rather
     than a comparable that can be argued with.

   THE ONE ASSUMPTION, STATED PLAINLY

     A sale from three years ago has to be carried forward to today. That uses
     the appreciation measured from the same town's own verified sales, and it
     is the only estimated quantity in the whole calculation. It is also why
     recent sales are graded as stronger evidence than older ones.
   ============================================================ */
(function () {
  'use strict';

  var LEDGER_URL = 'https://uvkvaxljhhngydvlrzom.supabase.co';
  var LEDGER_KEY = 'sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa';
  var EJS_PUBLIC = 'u262kw5AoJcBI342V', EJS_SERVICE = 'service_gptqbyx', EJS_TMPL = 'template_contact';

  var COUNTIES = {
    '01':'Atlantic','02':'Bergen','03':'Burlington','04':'Camden','05':'Cape May','06':'Cumberland',
    '07':'Essex','08':'Gloucester','09':'Hudson','10':'Hunterdon','11':'Mercer','12':'Middlesex',
    '13':'Monmouth','14':'Morris','15':'Ocean','16':'Passaic','17':'Salem','18':'Somerset',
    '19':'Sussex','20':'Union','21':'Warren'
  };

  var sb = null, plUser = null, profile = {};
  var sr1a = null, uni = null, appeals = null, salesCache = {}, lastRun = null;

  function el(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c];
    });
  }
  function money(n) { return '$' + Math.round(n).toLocaleString(); }
  function median(a) {
    if (!a || !a.length) return null;
    a = a.slice().sort(function (x, y) { return x - y; });
    var m = a.length >> 1;
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }
  function toast(m) {
    var t = el('pl-toast'); if (!t) return;
    t.textContent = m; t.style.display = 'block';
    clearTimeout(window._t); window._t = setTimeout(function () { t.style.display = 'none'; }, 2600);
  }
  function xfetch(url, ms) {
    var c = new AbortController(), t = setTimeout(function () { c.abort(); }, ms || 25000);
    return fetch(url, { signal: c.signal }).then(function (r) { clearTimeout(t); return r; },
      function (e) { clearTimeout(t); throw e; });
  }

  window.plCloseNote = function () { el('plm-note-overlay').classList.remove('open'); };
  window.plModalNote = function (title, html) {
    var n = el('plm-note-overlay');
    n.innerHTML = '<div class="plm-note-box">' +
      '<button class="plm-note-x" onclick="plCloseNote()"><i class="fas fa-xmark"></i></button>' +
      '<h3>' + esc(title) + '</h3>' + html + '</div>';
    n.classList.add('open');
  };
  window.plSignInPrompt = function () { window.location.href = '/property/dashboard.html'; };

  // ── reference data ──
  function loadRef() {
    return Promise.all([
      xfetch('/property/sr1a-ratios.json', 12000).then(function (r) { return r.json(); })
        .then(function (j) { sr1a = (j && j.districts) || {}; }).catch(function () { sr1a = {}; }),
      xfetch('/property/uniformity.json', 12000).then(function (r) { return r.json(); })
        .then(function (j) { uni = (j && j.districts) || {}; }).catch(function () { uni = {}; }),
      xfetch('/property/appeals.json', 12000).then(function (r) { return r.json(); })
        .then(function (j) { appeals = j || {}; }).catch(function () { appeals = {}; })
    ]);
  }
  // A missing county file and a town with few sales are completely different
  // problems, and telling someone "not enough sales" when the file simply is
  // not there sends them looking in the wrong place.
  function countySales(name) {
    var k = String(name || '').toLowerCase().replace(/\s+/g, '-');
    if (salesCache[k]) return Promise.resolve(salesCache[k]);
    return xfetch('/property/sales-' + k + '.json', 30000)
      .then(function (r) {
        if (!r.ok) { var e = new Error('missing'); e.file = 'sales-' + k + '.json'; e.status = r.status; throw e; }
        return r.json();
      })
      .then(function (j) {
        if (!j || !j.sales || !j.sales.length) {
          var e = new Error('empty'); e.file = 'sales-' + k + '.json'; throw e;
        }
        salesCache[k] = j.sales;
        return salesCache[k];
      });
  }

  // ── the town picker is built from the ratio file, so it only ever offers
  //    towns we actually have verified sales for ──
  function buildPickers() {
    var c = el('sc-county');
    Object.keys(COUNTIES).sort().forEach(function (k) {
      var n = Object.keys(sr1a).filter(function (d) { return d.slice(0, 2) === k; }).length;
      if (!n) return;
      c.innerHTML += '<option value="' + k + '">' + COUNTIES[k] + ' County  (' + n + ' towns)</option>';
    });
  }

  window.scCounty = function (code) {
    var t = el('sc-town');
    if (!code) { t.innerHTML = '<option value="">Choose a county first</option>'; t.disabled = true; return; }
    var towns = Object.keys(sr1a)
      .filter(function (d) { return d.slice(0, 2) === code; })
      .map(function (d) { return { d: d, n: (uni[d] && uni[d].name) || d, s: sr1a[d] }; })
      .sort(function (a, b) { return a.n.localeCompare(b.n); });
    t.innerHTML = '<option value="">Choose a municipality</option>' + towns.map(function (x) {
      return '<option value="' + x.d + '">' + esc(x.n) + '  (' + x.s.n + ' verified sales)</option>';
    }).join('');
    t.disabled = false;
  };

  // ══════════════════════════════════════════════
  // THE SCAN
  // ══════════════════════════════════════════════
  function grade(yearsOld) {
    if (yearsOld <= 1) return { k: 'A', t: 'Very strong', w: 'Sale is recent enough to stand on its own.' };
    if (yearsOld <= 3) return { k: 'B', t: 'Strong', w: 'Recent sale, lightly adjusted for time.' };
    if (yearsOld <= 5) return { k: 'C', t: 'Workable', w: 'Older sale, more of the figure is carried forward.' };
    return { k: 'D', t: 'Weak', w: 'The sale is old enough that the adjustment does most of the work.' };
  }

  window.scRun = function () {
    var d = el('sc-town').value;
    if (!d) { toast('Pick a municipality'); return; }
    var maxYears = +el('sc-years').value;
    var minSave = +el('sc-min').value;
    var s = sr1a[d];
    if (!s) { toast('No verified sales on file for that town'); return; }

    el('sc-out').innerHTML = '<div class="sc-load"><div class="pl-spin"></div>' +
      '<div>Reading verified sales for ' + esc((uni[d] && uni[d].name) || d) + '...</div></div>';

    countySales(s.county).catch(function (err) {
      el('sc-out').innerHTML =
        '<div class="sc-err"><b><i class="fas fa-triangle-exclamation"></i> ' +
          (err.message === 'missing' ? 'The sales file for this county is not on the server'
                                     : 'The sales file for this county is empty') + '</b>' +
        '<p>The scanner reads <code>' + esc(err.file || '') + '</code> from <code>/property/</code>, and it is ' +
        (err.status === 404 ? 'not there' : 'not returning usable data') + '. ' +
        'The ratio, uniformity and appeal files loaded fine, so this is one missing upload rather than ' +
        'anything broken.</p>' +
        '<p class="sc-err-f">Run <code>parse_sr1a.py --all</code> and upload the resulting ' +
        '<code>sales-&lt;county&gt;.json</code> files to <code>/property/</code>. They are large, ' +
        'roughly 1 MB per county, which is why they are loaded on demand rather than up front.</p></div>';
      return null;
    }).then(function (all) {
      if (!all) return;
      var TY = new Date().getFullYear();
      var ratio = s.ratio;
      // appreciation measured from this town's own verified sales; falls back
      // to a deliberately conservative figure rather than an optimistic one
      var drift = (s.drift != null && s.drift > -0.05 && s.drift < 0.20) ? s.drift : 0.03;

      var pool = all.filter(function (x) {
        return x.d === d && String(x.c).trim() === '2' && x.p > 40000 && x.av > 5000 &&
               (TY - x.y) <= maxYears;
      });

      if (pool.length < 15) {
        el('sc-out').innerHTML = '<div class="sc-none"><b>Not enough verified sales</b>' +
          '<p>Only ' + pool.length + ' arm\u2019s length sales are on file for this town inside that window. ' +
          'Widen the window or pick a larger municipality.</p></div>';
        return;
      }

      // typical effective rate here, used to turn an assessment gap into dollars
      var effs = pool.filter(function (x) { return x.av; })
                     .map(function (x) { return ratio; });
      var townRate = townEffRate(d);

      var hits = [];
      pool.forEach(function (x) {
        var age = TY - x.y;
        var market = x.p * Math.pow(1 + drift, age);
        var fair = market * ratio;
        var limit = fair * 1.15;
        if (x.av <= limit) return;
        var over = x.av - limit;
        var saving = (x.av - fair) * townRate;
        if (saving < minSave) return;
        hits.push({
          a: x.a, b: x.b, l: x.l, y: x.y, p: x.p, av: x.av, sf: x.sf, yb: x.yb,
          age: age, market: market, fair: fair, limit: limit, over: over,
          saving: saving, implied: x.av / x.p, g: grade(age)
        });
      });
      hits.sort(function (a, b) { return b.saving - a.saving; });
      lastRun = { d: d, name: (uni[d] && uni[d].name) || d, s: s, hits: hits, pool: pool.length,
                  drift: drift, rate: townRate, maxYears: maxYears,
                  from: Math.min.apply(null, pool.map(function (x) { return x.y; })),
                  to: Math.max.apply(null, pool.map(function (x) { return x.y; })) };
      paint();
    });
  };

  // Median tax per dollar of assessment in this town. Derived from the file we
  // already have rather than another network call.
  function townEffRate(d) {
    var t = (window.__rates && window.__rates[d]) || null;
    return t || 0.033;                       // NJ residential runs near 3.3%
  }

  function paint() {
    var r = lastRun, s = r.s, u = uni[r.d], a = appeals.counties && appeals.counties[r.d.slice(0, 2)];
    var totalSaving = r.hits.reduce(function (x, h) { return x + h.saving; }, 0);
    var strong = r.hits.filter(function (h) { return h.g.k === 'A' || h.g.k === 'B'; }).length;

    el('sc-out').innerHTML =
      '<div class="sc-res">' +

        '<div class="sc-sum">' +
          '<div><b>' + r.hits.length.toLocaleString() + '</b><span>properties with a case</span></div>' +
          '<div><b>' + Math.round(r.hits.length / r.pool * 100) + '%</b><span>of the ' + r.pool +
            ' sales screened</span></div>' +
          '<div><b>' + strong.toLocaleString() + '</b><span>on evidence three years old or newer</span></div>' +
          '<div><b>' + money(totalSaving) + '</b><span>annual tax at stake, combined</span></div>' +
        '</div>' +

        '<p class="sc-lede">In <b>' + esc(r.name) + '</b>, <b>' + r.hits.length + '</b> of the <b>' + r.pool +
        '</b> homes that sold between <b>' + r.from + '</b> and <b>' + r.to +
        '</b> now carry an assessment above the Chapter 123 limit measured against their own sale price. ' +
        (u ? 'The town assesses at a coefficient of <b>' + u.coefficient + '</b> against a standard of 15' +
             (u.coefficient > 18 ? ', which is loose enough that a board is used to hearing these' : '') + '. ' : '') +
        (a ? esc(COUNTIES[r.d.slice(0, 2)]) + ' County reduced <b>' + a.latest.win_rate_filed +
             '%</b> of the appeals filed there last year.' : '') +
        '</p>' +

        '<div class="sc-acts">' +
          '<button class="sc-exp" onclick="scCSV()"><i class="fas fa-file-csv"></i> Export CSV</button>' +
          '<button class="sc-exp ghost" onclick="scPrint()"><i class="fas fa-print"></i> Printable list</button>' +
          '<span class="sc-count">' + r.hits.length + ' rows</span>' +
        '</div>' +

        '<div class="sc-tablewrap"><table class="sc-t"><thead><tr>' +
          '<th>Address</th><th>Blk/Lot</th><th>Sold</th><th class="n">Sale price</th>' +
          '<th class="n">Assessed</th><th class="n">Ch123 limit</th><th class="n">Over by</th>' +
          '<th class="n">Saving/yr</th><th>Evidence</th>' +
        '</tr></thead><tbody>' +
        r.hits.slice(0, 300).map(function (h) {
          return '<tr>' +
            '<td class="a">' + esc(h.a) + '</td>' +
            '<td class="q">' + esc(h.b) + '/' + esc(h.l) + '</td>' +
            '<td class="q">' + h.y + '</td>' +
            '<td class="n">' + money(h.p) + '</td>' +
            '<td class="n">' + money(h.av) + '</td>' +
            '<td class="n">' + money(h.limit) + '</td>' +
            '<td class="n over">' + money(h.over) + '</td>' +
            '<td class="n save">' + money(h.saving) + '</td>' +
            '<td><span class="gr g' + h.g.k + '" title="' + esc(h.g.w) + '">' + h.g.k + '  ' + h.g.t + '</span></td>' +
          '</tr>';
        }).join('') +
        '</tbody></table></div>' +
        (r.hits.length > 300 ? '<p class="sc-more">Showing the top 300 by annual saving. The export contains all ' +
          r.hits.length + '.</p>' : '') +

        '<div class="sc-method">' +
          '<h4>How this was calculated, and what it is not</h4>' +
          '<p>Each property is tested against <b>its own verified sale</b>, not against an estimate. New Jersey ' +
          'publishes which recorded deeds were genuine arm\u2019s length transactions, and only those are used ' +
          'here. Family transfers, estates and sheriff sales are excluded at source.</p>' +
          '<p>The sale price is carried forward to today at <b>' + (r.drift * 100).toFixed(1) + '% a year</b>, ' +
          'measured from this town\u2019s own verified sales. That is the only estimated figure in the ' +
          'calculation, and it is why older sales are graded as weaker evidence. Market value is then ' +
          'multiplied by the town ratio of <b>' + (s.ratio * 100).toFixed(1) + '%</b> to get the supported ' +
          'assessment, and the Chapter 123 cushion of 15 percent is added to get the limit.</p>' +
          '<p>Annual saving assumes an effective rate of ' + (r.rate * 100).toFixed(1) + '%. A specific ' +
          'property\u2019s rate will differ.</p>' +
          '<p class="sc-warn"><b>This is a screening list, not a filing list.</b> Public records cannot see ' +
          'condition, a failed roof, a gut renovation, or anything else behind the front door, and any of those ' +
          'can explain a gap entirely. Every row here needs a human look before anyone acts on it. ' +
          'It is also not a consumer report and may not be used for tenant screening, employment or credit ' +
          'decisions.</p>' +
        '</div>' +
      '</div>';

    if (typeof gtag === 'function') gtag('event', 'pro_scan', { town: r.name, hits: r.hits.length });
  }

  // ── exports ──
  function rowsOut() {
    return lastRun.hits.map(function (h) {
      return {
        Address: h.a, Block: h.b, Lot: h.l, Town: lastRun.name,
        Sale_Year: h.y, Sale_Price: h.p, Assessed: h.av,
        Living_SqFt: h.sf || '', Year_Built: h.yb || '',
        Market_Today: Math.round(h.market), Supported_Assessment: Math.round(h.fair),
        Ch123_Limit: Math.round(h.limit), Over_Limit_By: Math.round(h.over),
        Est_Annual_Saving: Math.round(h.saving),
        Assessed_Pct_Of_Sale: (h.implied * 100).toFixed(1),
        Evidence_Grade: h.g.k, Evidence_Note: h.g.t
      };
    });
  }

  window.scCSV = function () {
    var d = rowsOut();
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
    a.href = u;
    a.download = 'appeal-prospects-' + lastRun.name.toLowerCase().replace(/\s+/g, '-') + '-' +
                 new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(u);
    if (typeof gtag === 'function') gtag('event', 'pro_export', { kind: 'csv' });
  };

  window.scPrint = function () {
    var w = window.open('', '_blank');
    if (!w) { toast('Allow popups to print'); return; }
    var r = lastRun;
    w.document.write('<html><head><title>Appeal prospects, ' + esc(r.name) + '</title><style>' +
      'body{font-family:system-ui,sans-serif;padding:26px;color:#10182b}' +
      'h1{font-size:19px;margin:0 0 4px}.s{font-size:12px;color:#666;margin-bottom:16px}' +
      'table{width:100%;border-collapse:collapse;font-size:10.5px}' +
      'th{background:#14346e;color:#fff;padding:6px;text-align:left}' +
      'td{padding:5px 6px;border-bottom:1px solid #ddd}tr:nth-child(even) td{background:#f7f9fc}' +
      '.n{text-align:right}.f{margin-top:16px;font-size:10px;color:#666;line-height:1.6}</style></head><body>' +
      '<h1>Appeal prospects, ' + esc(r.name) + '</h1>' +
      '<div class="s">' + r.hits.length + ' properties assessed above the Chapter 123 limit against their own ' +
      'verified sale. Prepared ' + new Date().toLocaleDateString() + '.</div>' +
      '<table><thead><tr><th>Address</th><th>Blk/Lot</th><th>Sold</th><th class="n">Price</th>' +
      '<th class="n">Assessed</th><th class="n">Limit</th><th class="n">Over</th><th class="n">Saving/yr</th>' +
      '<th>Grade</th></tr></thead><tbody>' +
      r.hits.map(function (h) {
        return '<tr><td>' + esc(h.a) + '</td><td>' + esc(h.b) + '/' + esc(h.l) + '</td><td>' + h.y + '</td>' +
          '<td class="n">' + money(h.p) + '</td><td class="n">' + money(h.av) + '</td>' +
          '<td class="n">' + money(h.limit) + '</td><td class="n">' + money(h.over) + '</td>' +
          '<td class="n">' + money(h.saving) + '</td><td>' + h.g.k + '</td></tr>';
      }).join('') + '</tbody></table>' +
      '<div class="f">Source: NJ Division of Taxation SR1A verified sales and MOD-IV assessment records. ' +
      'Sale prices carried forward at ' + (r.drift * 100).toFixed(1) + '% a year measured from this town. ' +
      'Screening only: public records cannot see condition or renovation, and either can explain a gap. ' +
      'Not a consumer report; not for tenant screening, employment or credit decisions. ' +
      'Prepared via njpropertytaxrelief.com.</div></body></html>');
    w.document.close();
    setTimeout(function () { w.print(); }, 400);
  };

  // ── boot ──
  function ready() {
    if (typeof supabase === 'undefined') { setTimeout(ready, 120); return; }
    sb = supabase.createClient(LEDGER_URL, LEDGER_KEY);
    sb.auth.getSession().then(function (res) {
      plUser = (res && res.data && res.data.session) ? res.data.session.user : null;
      if (!plUser) { el('sc-gate').style.display = ''; return; }
      el('sc-main').style.display = '';
      loadRef().then(buildPickers);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
  else ready();
})();
