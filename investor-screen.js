/* Lazy dashboard module: investor-screen. Generated from the original dashboard without calculation changes. */
(function () {
  'use strict';
  function toolInvestorScreen() {
    var rs = (rows || []).filter(function (r) { return r.assessed && r.last_year_tax; });
    if (rs.length < 2) return '';

    var scored = rs.map(function (r) {
      var m = marketValue(r), c = chapter123(r), s = sr1aFor(r), u = uniFor(r);
      var mv = m ? m.v : null;
      return {
        r: r,
        market: mv,
        burden: mv ? (r.last_year_tax / mv) * 1000 : null,   // tax per $1,000 of value
        yieldDrag: mv ? r.last_year_tax / mv : null,
        overBy: (c && c.testable && c.hasCase) ? c.over : 0,
        saving: (c && c.saving) || 0,
        uniformity: u ? u.score : null,
        ratio: s ? s.ratio : null
      };
    }).filter(function (x) { return x.burden != null; });
    if (scored.length < 2) return '';

    scored.sort(function (a, b) { return b.burden - a.burden; });
    var worst = scored[0], best = scored[scored.length - 1];
    var totalSaving = scored.reduce(function (a, x) { return a + x.saving; }, 0);
    var totalTax = scored.reduce(function (a, x) { return a + (+x.r.last_year_tax || 0); }, 0);
    var totalVal = scored.reduce(function (a, x) { return a + x.market; }, 0);

    return toolCard('Portfolio screen', 'fa-ranking-star',
      '<p class="tl-p">Ranked on tax per thousand dollars of market value, which is the only measure that ' +
      'compares fairly across town lines. Assessed value cannot do it, because assessment levels differ in ' +
      'every municipality.</p>' +

      '<div class="iv-top">' +
        '<div><b>' + scored.length + '</b><span>properties</span></div>' +
        '<div><b>' + money(totalTax) + '</b><span>total annual tax</span></div>' +
        '<div><b>$' + (totalTax / totalVal * 1000).toFixed(2) + '</b><span>blended, per $1,000 of value</span></div>' +
        (totalSaving > 0
          ? '<div class="hot"><b>' + money(totalSaving) + '</b><span>at stake in appeals</span></div>' : '') +
      '</div>' +

      '<div class="comps-wrap"><table class="comps"><thead><tr>' +
        '<th>Property</th><th>Town</th><th class="num">Market</th><th class="num">Tax</th>' +
        '<th class="num">Per $1,000</th><th class="num">Over limit</th><th class="num">Uniformity</th>' +
      '</tr></thead><tbody>' +
      scored.map(function (x, i) {
        return '<tr' + (i === 0 && scored.length > 1 ? ' class="hot"' : '') + '>' +
          '<td><b>' + esc(x.r.address) + '</b></td>' +
          '<td>' + esc(x.r.town || '') + '</td>' +
          '<td class="num">' + money(Math.round(x.market / 1000) * 1000) + '</td>' +
          '<td class="num">' + money(x.r.last_year_tax) + '</td>' +
          '<td class="num"><b>$' + x.burden.toFixed(2) + '</b></td>' +
          '<td class="num' + (x.overBy > 0 ? ' neg' : '') + '">' +
            (x.overBy > 0 ? money(x.overBy) : '\u2014') + '</td>' +
          '<td class="num">' + (x.uniformity != null ? x.uniformity : '\u2014') + '</td></tr>';
      }).join('') + '</tbody></table></div>' +

      (worst.burden > best.burden * 1.15
        ? '<div class="iv-say"><b>' + esc(worst.r.address) + ' carries the heaviest burden</b> at $' +
          worst.burden.toFixed(2) + ' per thousand against $' + best.burden.toFixed(2) + ' for ' +
          esc(best.r.address) + '. On equal value that is a gap of <b>' +
          money((worst.burden - best.burden) * worst.market / 1000) + ' a year</b>. ' +
          'That difference is the municipality, not the property.</div>'
        : '<div class="iv-say">Tax burden is fairly even across these, within 15 percent per dollar of value. ' +
          'No one property is dragging on the others.</div>') +

      '<div class="tl-fine">Market value comes from the state verified sales ratio where available. Tax per ' +
      'thousand is the prior year bill divided by market value. This is a screening comparison, not an ' +
      'investment recommendation, and it takes no account of rent, condition, vacancy or financing.</div>');
  }

  // ══════════════════════════════════════════════

  Object.assign(window, { toolInvestorScreen });
})();

export {};
