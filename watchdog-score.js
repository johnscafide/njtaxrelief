/* Lazy dashboard module: watchdog-score. Generated from the original dashboard without calculation changes. */
(function () {
  'use strict';
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

  Object.assign(window, { clamp01, watchdogScore, WD_VERDICT, wdBadge, wdBreakdown, toolCard });
})();

export {};
