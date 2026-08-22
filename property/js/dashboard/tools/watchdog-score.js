/* Lazy dashboard module: watchdog-score. Generated from the original dashboard without calculation changes. */
(function () {
  'use strict';
  // THE WATCHDOG SCORE
  //
  // One number, 0 to 100, for how a New Jersey property stands as a tax
  // proposition. The public methodology beneath the score is the ROBUST
  // Framework: Recourse, Overassessment Position, Burden, Uniformity,
  // Stability and Trajectory.
  //
  // The internal key `fairness` remains for compatibility. Its public ROBUST
  // name is O - Overassessment Position. Branding does not alter the formula.
  //
  // Current weights:
  //   R Recourse                 10
  //   O Overassessment Position 20
  //   B Burden                   30
  //   U Uniformity               15
  //   S Stability                15
  //   T Trajectory               10
  //
  // This scores a property as a TAX position and nothing else. It knows
  // nothing about schools, commute, flood risk, condition or lifestyle.
  // Components with no data are dropped and the remaining weights are
  // renormalised rather than substituting a neutral guess.

  var BURDEN_BEST = 0.012, BURDEN_WORST = 0.036;
  var ROBUST_META = {
    recourse: { letter: 'R', name: 'Recourse', slug: 'recourse' },
    fairness: { letter: 'O', name: 'Overassessment Position', slug: 'overassessment-position' },
    burden: { letter: 'B', name: 'Burden', slug: 'burden' },
    uniformity: { letter: 'U', name: 'Uniformity', slug: 'uniformity' },
    stability: { letter: 'S', name: 'Stability', slug: 'stability' },
    trajectory: { letter: 'T', name: 'Trajectory', slug: 'trajectory' }
  };

  function clamp01(x) { return Math.max(0, Math.min(1, x)); }

  function watchdogScore(r) {
    var parts = [], detail = {};

    function add(key, weight, value, note) {
      var meta = ROBUST_META[key] || { letter: '', name: key, slug: key };
      var label = (meta.letter ? meta.letter + ' \u00b7 ' : '') + meta.name;
      if (value == null) {
        detail[key] = { key: key, letter: meta.letter, name: meta.name, slug: meta.slug, label: label, score: null, weight: weight, note: note || 'no data' };
        return;
      }
      var v = clamp01(value);
      parts.push({ w: weight, v: v });
      detail[key] = { key: key, letter: meta.letter, name: meta.name, slug: meta.slug, label: label, score: Math.round(v * 100), weight: weight, note: note };
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
      var burden = (BURDEN_WORST - eff) / (BURDEN_WORST - BURDEN_BEST);
      add('burden', 30, burden, '$' + (eff * 1000).toFixed(2) + ' per $1,000 of market value');
    } else {
      add('burden', 30, null);
    }

    // O - Overassessment Position, 20. Internal key remains `fairness`.
    if (c && c.testable && c.limit) {
      var over = (r.assessed - c.limit) / c.limit;
      var fair = over <= 0 ? clamp01(1 - (r.assessed - c.fair) / Math.max(c.fair, 1) * 0.5)
                           : clamp01(1 - over / 0.30) * 0.5;
      add('fairness', 20, fair,
          c.hasCase ? money(Math.round(c.over)) + ' above the Chapter 123 limit'
                    : 'within the statutory cushion');
    } else {
      add('fairness', 20, null, 'needs comparable sales to test');
    }

    // U - Uniformity, 15
    if (u && u.coefficient != null) {
      add('uniformity', 15, 1 - clamp01((u.coefficient - 7) / 23),
          'coefficient ' + u.coefficient + ', standard is 15');
    } else {
      add('uniformity', 15, null);
    }

    // S - Stability, 15
    if (rv && rv.score != null) {
      add('stability', 15, 1 - clamp01(rv.score / 100), 'revaluation pressure ' + rv.score + ' of 100');
    } else {
      add('stability', 15, null);
    }

    // T - Trajectory, 10
    if (s && r._lastSale && r._lastSaleYear && r.assessed) {
      var implied = r.assessed / r._lastSale;
      var rel = implied / s.ratio;
      var traj = rel < 0.85 ? clamp01(0.35 + rel * 0.4)
               : rel > 1.15 ? clamp01(1.15 - (rel - 1) * 0.8)
               : 1;
      add('trajectory', 10, traj,
          'assessed at ' + (implied * 100).toFixed(0) + '% of its own sale, town runs ' +
          (s.ratio * 100).toFixed(0) + '%');
    } else {
      add('trajectory', 10, null, 'no verified sale on record');
    }

    // R - Recourse, 10
    if (a && a.latest && a.latest.win_rate_filed != null) {
      add('recourse', 10, clamp01((a.latest.win_rate_filed - 20) / 45),
          a.latest.win_rate_filed + '% of filed appeals reduced in ' + titleCase(a.county) + ' County');
    } else {
      add('recourse', 10, null);
    }

    if (!parts.length) return null;
    var wsum = parts.reduce(function (x, p) { return x + p.w; }, 0);
    var raw = parts.reduce(function (x, p) { return x + p.v * p.w; }, 0) / wsum;
    var score = Math.round(raw * 100);
    var covered = wsum / 100;

    return {
      score: score,
      grade: score >= 80 ? 'A' : score >= 65 ? 'B' : score >= 50 ? 'C' : score >= 35 ? 'D' : 'E',
      band: score >= 65 ? 'good' : score >= 45 ? 'mid' : 'bad',
      verdict: WD_VERDICT(score),
      framework: 'ROBUST',
      frameworkVersion: 'ROBUST-v1',
      detail: detail,
      covered: covered,
      confidence: covered >= 0.85 ? 'high' : covered >= 0.6 ? 'medium' : 'low'
    };
  }

  function WD_VERDICT(s) {
    if (s >= 80) return 'Strong tax position';
    if (s >= 65) return 'Favorable tax position';
    if (s >= 50) return 'Typical or mixed tax position';
    if (s >= 35) return 'Pressured tax position';
    return 'Highly pressured tax position';
  }

  function wdBadge(r, size) {
    var w = watchdogScore(r);
    if (!w) return '';
    var cls = 'wd-badge ' + w.band + (size ? ' ' + size : '');
    return '<span class="' + cls + '" title="Watchdog Score ' + w.score +
      ' of 100. ' + esc(w.verdict) + '. Powered by the ROBUST Framework.">' +
      '<i class="fas fa-dog"></i><b>' + w.score + '</b></span>';
  }

  function wdBreakdown(r) {
    var w = watchdogScore(r);
    if (!w) return '';
    var keys = ['recourse', 'fairness', 'burden', 'uniformity', 'stability', 'trajectory'];
    return '<div class="wd-break" data-score-framework="ROBUST-v1">' +
      '<div class="wd-conf"><b>ROBUST Framework</b> \u00b7 Recourse, Overassessment Position, Burden, Uniformity, Stability and Trajectory.</div>' +
      keys.map(function (k) {
        var d = w.detail[k];
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

  Object.assign(window, { clamp01, watchdogScore, WD_VERDICT, wdBadge, wdBreakdown, toolCard, ROBUST_META });

  if (document.body && document.body.getAttribute('data-sidebar-page') === 'dashboard') {
    import('../dashboard-workspace.js').catch(function (error) {
      console.error('Modern dashboard workspace could not load:', error);
    });
  }
})();

export {};
