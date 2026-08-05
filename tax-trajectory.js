/* Lazy dashboard module: tax-trajectory. */
(function () {
  'use strict';
  // TAX RATE TRAJECTORY
  //
  // Two different things move a property tax bill over time, and they get
  // confused constantly. A revaluation resets the ASSESSMENT to match market
  // value all at once, and the rate falls to compensate (see Revaluation
  // Radar). This is the other one: the town's general tax rate itself, which
  // moves every single year whether or not a reval ever happens, driven by
  // the municipal, school and county budgets it funds.
  //
  // Ten years of that rate are sitting in tax-rates.json, published every
  // year by the Division of Taxation, and mostly unused until now.
  //
  // WHAT THIS DOES NOT DO
  //
  //   It holds the assessment flat and projects the rate forward in a
  //   straight line. That is not a forecast, and budgets do not move in
  //   straight lines. It is the honest answer to "if nothing else changes,
  //   where has this town's rate been heading, and what would that alone do
  //   to this bill." Reassessment Risk and Revaluation Radar cover the
  //   assessment side of the bill separately.
  // ══════════════════════════════════════════════

  function trajectory(r) {
    var hist = rateHistory(r.town, r.county);
    if (!hist || hist.length < 3) return null;

    var first = hist[0], last = hist[hist.length - 1];
    var span = last.year - first.year;
    if (span < 2 || first.rate <= 0) return null;

    // Compound annual growth rate of the rate itself, not the bill, since
    // the bill also depends on the assessment.
    var cagr = Math.pow(last.rate / first.rate, 1 / span) - 1;

    var deltas = [];
    for (var i = 1; i < hist.length; i++) {
      deltas.push((hist[i].rate - hist[i - 1].rate) / hist[i - 1].rate);
    }
    var upYears = deltas.filter(function (d) { return d > 0.001; }).length;
    var downYears = deltas.filter(function (d) { return d < -0.001; }).length;

    // Bands set against New Jersey norms: statewide rate growth has typically
    // run in the low single digits a year. Under 1%/yr reads as flat next to
    // that; over 3.5%/yr is a genuine outlier worth a second look.
    var band = cagr < -0.005 ? 'falling'
             : cagr < 0.010 ? 'stable'
             : cagr < 0.035 ? 'rising'
             : 'fast';

    // Project this property's bill forward holding the assessment flat, to
    // isolate what the rate alone would do.
    var assessed = +r.assessed || null;
    var proj = null;
    if (assessed) {
      var y1 = assessed * (last.rate / 100);
      var y5rate = last.rate * Math.pow(1 + cagr, 5);
      var y5 = assessed * (y5rate / 100);
      proj = { y1: y1, y5: y5, y5rate: y5rate, delta5: y5 - y1 };
    }

    return {
      hist: hist, first: first, last: last, span: span,
      cagr: cagr, band: band, upYears: upYears, downYears: downYears,
      totalYears: hist.length, proj: proj
    };
  }

  var BAND_TEXT = {
    falling: ['Rate has been falling', 'Fewer towns see this than see increases. Usually means new ratables ' +
              'came onto the tax rolls, spreading the same budget over a larger base.'],
    stable:  ['Rate has been roughly flat', 'Budget growth here has stayed close to what new development and ' +
              'normal revenue growth cover on their own.'],
    rising:  ['Rate has been climbing steadily', 'A normal, unremarkable pace of increase for a New Jersey ' +
              'municipality, school district and county combined.'],
    fast:    ['Rate has been climbing fast', 'Meaningfully outpacing the typical town. Worth asking what is ' +
              'driving it, since three separate levies (municipal, school, county) share this one number.']
  };

  function sparkline(hist) {
    var w = 320, h = 64, pad = 6;
    var vals = hist.map(function (x) { return x.rate; });
    var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
    var range = (max - min) || 1;
    var step = (w - pad * 2) / (hist.length - 1);
    var pts = hist.map(function (x, i) {
      var px = pad + i * step;
      var py = h - pad - ((x.rate - min) / range) * (h - pad * 2);
      return px.toFixed(1) + ',' + py.toFixed(1);
    }).join(' ');
    var lastX = pad + (hist.length - 1) * step;
    var lastY = h - pad - ((hist[hist.length - 1].rate - min) / range) * (h - pad * 2);

    return '<svg viewBox="0 0 ' + w + ' ' + h + '" style="width:100%;max-width:' + w + 'px;height:' + h +
      'px;display:block" preserveAspectRatio="none">' +
      '<polyline points="' + pts + '" fill="none" stroke="var(--accent-2)" stroke-width="2" ' +
      'stroke-linejoin="round" stroke-linecap="round"/>' +
      '<circle cx="' + lastX.toFixed(1) + '" cy="' + lastY.toFixed(1) + '" r="3.5" fill="var(--accent-2)"/>' +
      '</svg>';
  }

  function toolTaxTrajectory(r) {
    var t = trajectory(r);
    if (!t) return '';
    var b = BAND_TEXT[t.band];
    var pctYr = (t.cagr * 100).toFixed(1);

    return toolCard('Tax rate trajectory', 'fa-chart-line',
      '<p class="tl-p">This tracks ' + esc(r.town || 'this town') + '\u2019s general tax rate itself, published ' +
      'every year by the Division of Taxation, separate from any reassessment or revaluation. It is the rate ' +
      'that funds the municipal, school and county budgets, and it moves every year on its own.</p>' +

      '<div class="rv-head">' +
        '<div class="rv-score ' +
          (t.band === 'fast' ? 'high' : t.band === 'rising' ? 'building' : t.band === 'falling' ? 'minimal' : 'low') +
          '"><b>' + (t.cagr >= 0 ? '+' : '') + pctYr + '%</b><span>per year</span></div>' +
        '<div class="rv-say"><b>' + b[0] + '.</b> ' + b[1] + '</div>' +
      '</div>' +

      '<div class="tt-chart">' + sparkline(t.hist) +
        '<div class="tt-chart-lbl"><span>' + t.first.year + ': ' + t.first.rate.toFixed(3) + '</span>' +
        '<span>' + t.last.year + ': ' + t.last.rate.toFixed(3) + '</span></div>' +
      '</div>' +

      '<p class="tl-p">Over the ' + t.span + ' years on file, the rate rose in ' + t.upYears + ' and fell in ' +
      t.downYears + '.' +
      (t.proj
        ? ' Holding this property\u2019s assessment exactly where it is today and carrying the same pace ' +
          'forward, its bill would move from about <b>' + money(t.proj.y1) + '</b> now to roughly <b>' +
          money(t.proj.y5) + '</b> in five years, a difference of <b>' + money(t.proj.delta5) +
          '</b> from the rate alone.'
        : '') + '</p>' +

      '<div class="tl-fine">Built from the Division of Taxation\u2019s General Tax Rates by County and ' +
      'Municipality, ' + t.first.year + '\u2013' + t.last.year + '. This is a straight line drawn through the ' +
      'past, not a budget forecast, and it holds the assessment fixed on purpose so it isolates the rate. A ' +
      'reassessment or revaluation changes the assessment side of the bill and is covered separately in ' +
      'Reassessment Risk and Revaluation Radar.</div>');
  }

  Object.assign(window, { trajectory, toolTaxTrajectory });
})();

export {};
