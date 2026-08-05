/* Pro portfolio matrix: municipal fairness against tax-rate growth. */
(function () {
  'use strict';

  function toolTownRiskMatrix() {
    var points = rows.map(function (r) {
      var town = townIntelFor(r), score = typeof watchdogScore === 'function' ? watchdogScore(r) : null;
      if (!town || !town.trajectory) return null;
      return { r: r, town: town, watchdog: score ? score.score : null };
    }).filter(Boolean);
    if (points.length < 2) return '';
    var maxGrowth = Math.max(.05, Math.max.apply(null, points.map(function (p) { return Math.max(0, p.town.trajectory.cagr); })));
    return toolCard('Portfolio municipal risk matrix', 'fa-chart-simple',
      '<p class="tl-p">Fairness and rate pressure answer different questions. This view puts both on one field so an uneven assessment roll and a fast-moving tax rate cannot hide inside separate reports.</p>' +
      '<div class="ti-matrix"><span class="ti-axis-y">Tax-rate growth</span><span class="ti-axis-x">Town fairness</span><i class="ti-quadrant"></i>' +
        points.map(function (p) {
          var left = 7 + p.town.score * .86;
          var top = 90 - Math.max(0, p.town.trajectory.cagr) / maxGrowth * 78;
          var cls = p.town.score < 40 && p.town.trajectory.cagr > .025 ? 'risk' :
            p.town.score < 55 || p.town.trajectory.cagr > .03 ? 'watch' : 'strong';
          return '<a class="ti-dot ' + cls + '" style="left:' + left.toFixed(1) + '%;top:' + top.toFixed(1) + '%" ' +
            'href="' + reportLink(p.r) + '" title="' + esc(p.r.address) + ': fairness ' + p.town.score +
            ', rate ' + (p.town.trajectory.cagr * 100).toFixed(1) + '% per year">' +
            (p.watchdog == null ? p.town.score : p.watchdog) + '</a>';
        }).join('') + '</div>' +
      '<div class="ti-matrix-legend"><span><i style="background:#cf4c42"></i>Uneven and fast rising</span>' +
        '<span><i style="background:#c69222"></i>Watch</span><span><i style="background:#1d9a6c"></i>Stronger position</span></div>' +
      '<div class="tl-fine">Each marker is a saved property. Its label is the Watchdog Score when available. This is municipal context, not an appeal prediction.</div>');
  }

  Object.assign(window, { toolTownRiskMatrix: toolTownRiskMatrix });
})();

export {};
