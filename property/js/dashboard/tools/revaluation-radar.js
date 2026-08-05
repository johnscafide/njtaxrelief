/* Lazy dashboard module: revaluation-radar. Generated from the original dashboard without calculation changes. */
(function () {
  'use strict';
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

  Object.assign(window, { revalRadar, toolRevalRadar });
})();

export {};
