import '../../watchdog-score-core.js';

/* Lazy dashboard module: watchdog-score. Canonical ROBUST component evaluation for the Dashboard. */
(function () {
  'use strict';

  var Core = window.WatchdogScoreCore;
  if (!Core) throw new Error('WatchdogScoreCore is required before watchdog-score');

  // THE WATCHDOG SCORE
  // One number, 0 to 100, for how a New Jersey property stands as a tax
  // proposition. ROBUST-v1 owns dimension order, weights, aggregation,
  // evidence coverage, confidence and accepted model versions.
  //
  // The internal key `fairness` remains for compatibility. Its public ROBUST
  // name is O - Overassessment Position.

  var BURDEN_BEST = 0.012, BURDEN_WORST = 0.036;
  var ROBUST_META = Core.DIMENSIONS;
  var clamp01 = Core.clamp01;

  function watchdogScore(r) {
    var detail = {};

    function add(key, value, note) {
      var meta = ROBUST_META[key];
      var label = meta.letter + ' \u00b7 ' + meta.name;
      var normalized = value == null ? null : clamp01(value);
      detail[key] = {
        key: key,
        publicKey: meta.publicKey,
        letter: meta.letter,
        name: meta.name,
        slug: meta.slug,
        label: label,
        score: normalized == null ? null : Math.round(normalized * 100),
        weight: meta.weight,
        note: note || (normalized == null ? 'no data' : '')
      };
    }

    var m = marketValue(r);
    var c = chapter123(r);
    var u = uniFor(r);
    var a = appealFor(r);
    var s = sr1aFor(r);
    var rv = (typeof revalRadar === 'function') ? revalRadar(r) : null;

    // B - Burden, 30
    if (m && m.v && r.last_year_tax) {
      var eff = r.last_year_tax / m.v;
      add('burden', (BURDEN_WORST - eff) / (BURDEN_WORST - BURDEN_BEST),
          '$' + (eff * 1000).toFixed(2) + ' per $1,000 of market value');
    } else {
      add('burden', null);
    }

    // O - Overassessment Position, 20. Internal key remains `fairness`.
    if (c && c.testable && c.limit) {
      var over = (r.assessed - c.limit) / c.limit;
      var fair = over <= 0 ? clamp01(1 - (r.assessed - c.fair) / Math.max(c.fair, 1) * 0.5)
                           : clamp01(1 - over / 0.30) * 0.5;
      add('fairness', fair,
          c.hasCase ? money(Math.round(c.over)) + ' above the Chapter 123 limit'
                    : 'within the statutory cushion');
    } else {
      add('fairness', null, 'needs comparable sales to test');
    }

    // U - Uniformity, 15
    if (u && u.coefficient != null) {
      add('uniformity', 1 - clamp01((u.coefficient - 7) / 23),
          'coefficient ' + u.coefficient + ', standard is 15');
    } else {
      add('uniformity', null);
    }

    // S - Stability, 15
    if (rv && rv.score != null) {
      add('stability', 1 - clamp01(rv.score / 100), 'revaluation pressure ' + rv.score + ' of 100');
    } else {
      add('stability', null);
    }

    // T - Trajectory, 10
    // Raw MOD-IV deed fields can contain nominal $1/$100 transfers. They are
    // not evidence of market trajectory. Until a stronger verified-sale flag
    // is available in this Dashboard record shape, require a plausible sale
    // amount and year or drop T and let evidence coverage fall honestly.
    var lastSale = Number(r._lastSale);
    var lastSaleYear = Number(r._lastSaleYear);
    var currentYear = new Date().getFullYear();
    var defensibleSale = Number.isFinite(lastSale) && lastSale > 40000 &&
      Number.isFinite(lastSaleYear) && lastSaleYear >= 1900 && lastSaleYear <= currentYear;
    if (s && defensibleSale && r.assessed) {
      var implied = r.assessed / lastSale;
      var rel = implied / s.ratio;
      var traj = rel < 0.85 ? clamp01(0.35 + rel * 0.4)
               : rel > 1.15 ? clamp01(1.15 - (rel - 1) * 0.8)
               : 1;
      add('trajectory', traj,
          'assessed at ' + (implied * 100).toFixed(0) + '% of its defensible sale, town runs ' +
          (s.ratio * 100).toFixed(0) + '%');
    } else {
      add('trajectory', null, 'needs a defensible sale on record; nominal deed transfers are excluded');
    }

    // R - Recourse, 10
    if (a && a.latest && a.latest.win_rate_filed != null) {
      add('recourse', clamp01((a.latest.win_rate_filed - 20) / 45),
          a.latest.win_rate_filed + '% of filed appeals reduced in ' + titleCase(a.county) + ' County');
    } else {
      add('recourse', null);
    }

    return Core.aggregate(detail);
  }

  function WD_VERDICT(score) { return Core.verdict(score); }

  function wdBadge(r, size) {
    var w = watchdogScore(r);
    if (!w) return '';
    var cls = 'wd-badge ' + w.band + (size ? ' ' + size : '');
    return '<span class="' + cls + '" data-score-model="' + w.modelVersion + '" title="Watchdog Score ' + w.score +
      ' of 100. ' + esc(w.verdict) + '. Powered by the ROBUST Framework.">' +
      '<i class="fas fa-dog"></i><b>' + w.score + '</b></span>';
  }

  function wdBreakdown(r) {
    var w = watchdogScore(r);
    if (!w) return '';
    return '<div class="wd-break" data-score-framework="' + w.frameworkVersion + '" data-score-model="' + w.modelVersion + '">' +
      '<div class="wd-conf"><b>ROBUST Framework</b> \u00b7 Recourse, Overassessment Position, Burden, Uniformity, Stability and Trajectory.</div>' +
      Core.ORDER.map(function (key) {
        var d = w.detail[key];
        if (!d) return '';
        var has = d.score != null;
        return '<div class="wd-r' + (has ? '' : ' off') + '">' +
          '<span class="wd-rl"><a href="/property/robust/' + d.slug + '/" style="color:inherit;text-decoration:none">' + d.label + '</a><em>' + (d.note || '') + '</em></span>' +
          '<span class="wd-rb"><i style="width:' + (has ? d.score : 0) + '%"></i></span>' +
          '<span class="wd-rn">' + (has ? d.score : '\u2014') + '</span>' +
          '<span class="wd-rw">' + d.weight + '%</span>' +
        '</div>';
      }).join('') +
      '<div class="wd-conf">Built from ' + Math.round(w.covered * 100) + '% of the available weight, ' +
      w.confidence + ' confidence. Components with no data are dropped and the rest reweighted, rather than ' +
      'filled with a guess. <a href="/property/robust/" style="font-weight:800">How ROBUST works</a></div>' +
    '</div>';
  }

  function toolCard(title, icon, body) {
    return '<section class="sec"><h4><i class="fas ' + icon + '"></i>' + title + '</h4>' + body + '</section>';
  }

  Object.assign(window, { clamp01: clamp01, watchdogScore: watchdogScore, WD_VERDICT: WD_VERDICT, wdBadge: wdBadge, wdBreakdown: wdBreakdown, toolCard: toolCard, ROBUST_META: ROBUST_META });

  if (document.body && document.body.getAttribute('data-sidebar-page') === 'dashboard') {
    import('../dashboard-workspace.js').catch(function (error) {
      console.error('Modern dashboard workspace could not load:', error);
    });
  }
})();

export {};
