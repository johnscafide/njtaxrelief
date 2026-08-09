/* Lazy dashboard module: relocation. Generated from the original dashboard without calculation changes. */
(function () {
  'use strict';
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
      var norm = window.NJPTRTownName && window.NJPTRTownName.normalize;
      if (!norm) throw new Error('Shared town-name normalizer is unavailable');
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

  Object.assign(window, { townRateFor, relocRow, toolRelocation, rlRow });
})();

export {};
