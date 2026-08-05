/* Lazy dashboard module: rebates. Generated from the original dashboard without calculation changes. */
(function () {
  'use strict';
  function toolRebates() {
    var homes = rows.filter(function (r) { return r.kind === 'home' && r.last_year_tax > 0; });
    if (!homes.length) return '';
    var r = homes[0];
    var tax = +r.last_year_tax;
    var senior = profile.age_band === '65plus';

    var anchor = 1500;
    var stay = senior ? Math.min(6500, tax * 0.5) : 0;
    var freeze = senior ? 0 : 0;                       // needs a base year, cannot infer
    var after = Math.max(0, tax - anchor - stay);

    return toolCard('Your rebate stack', 'fa-layer-group',
      '<div class="rb-stack">' +
        '<div class="rb-line"><span>Your bill for ' + esc(r.address) + '</span><b>' + money(tax) + '</b></div>' +
        '<div class="rb-line minus"><span>ANCHOR, homeowners</span><b>-' + money(Math.min(anchor, tax)) + '</b></div>' +
        (senior
          ? '<div class="rb-line minus"><span>Stay NJ, age 65+, capped at half the bill</span><b>-' + money(stay) + '</b></div>'
          : '<div class="rb-line muted"><span>Stay NJ, only from age 65</span><b>not yet</b></div>') +
        '<div class="rb-line total"><span>What you would actually pay</span><b>' + money(after) + '</b></div>' +
      '</div>' +
      (senior
        ? '<div class="tl-good"><i class="fas fa-circle-check"></i> At 65 or over you can stack both. Most people who ' +
          'qualify for Stay NJ have never filed for it, and it does not backdate.</div>'
        : '<div class="tl-note">Set your age band in your profile and this recalculates. If you are approaching 65, ' +
          'Stay NJ is worth planning for: it covers up to half the bill.</div>') +
      '<a class="tl-btn" href="/anchor-estimator.html">Run the full estimator</a>' +
      '<div class="tl-fine">Illustration only. Actual benefits depend on income, age, and residency. ' +
      'The Senior Freeze needs a base year we cannot infer, so it is not included here and may add more.</div>');
  }

  // ══════════════════════════════════════════════
  // 5 · PORTFOLIO
  // ══════════════════════════════════════════════

  Object.assign(window, { toolRebates });
})();

export {};
