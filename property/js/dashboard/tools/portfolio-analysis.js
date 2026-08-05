/* Lazy dashboard module: portfolio-analysis. Generated from the original dashboard without calculation changes. */
(function () {
  'use strict';
  function toolPortfolio() {
    if (rows.length < 2) return '';
    var tot = rows.reduce(function (a, r) { return a + (+r.last_year_tax || 0); }, 0);
    var assessed = rows.reduce(function (a, r) { return a + (+r.assessed || 0); }, 0);
    var value = rows.reduce(function (a, r) { return a + (+r.watchdog_value || +r.assessed || 0); }, 0);
    var blended = value ? (tot / value) * 100 : 0;

    var ranked = rows.slice().filter(function (r) { return r.last_year_tax && (r.watchdog_value || r.assessed); })
      .map(function (r) {
        var v = +r.watchdog_value || +r.assessed;
        return { r: r, eff: (+r.last_year_tax / v) * 100 };
      }).sort(function (a, b) { return b.eff - a.eff; });

    return toolCard('Portfolio', 'fa-building-columns',
      '<div class="pf-stats">' +
        '<div><b>' + rows.length + '</b><span>Properties</span></div>' +
        '<div><b>' + money(tot) + '</b><span>Total annual tax</span></div>' +
        '<div><b>' + money(assessed) + '</b><span>Total assessed</span></div>' +
        '<div><b>' + blended.toFixed(2) + '%</b><span>Blended effective rate</span></div>' +
      '</div>' +
      (ranked.length
        ? '<div class="pf-rank"><div class="pf-rank-h">Worst value per dollar, highest tax burden first</div>' +
          ranked.slice(0, 6).map(function (o, i) {
            return '<div class="pf-line">' +
              '<span class="pf-n">' + (i + 1) + '</span>' +
              '<span class="pf-a">' + esc(o.r.address) + '<em>' + esc(o.r.town || '') + '</em></span>' +
              '<span class="pf-e' + (i === 0 && ranked.length > 1 ? ' worst' : '') + '">' + o.eff.toFixed(2) + '%</span>' +
              '<span class="pf-t">' + money(o.r.last_year_tax) + '</span>' +
            '</div>';
          }).join('') + '</div>'
        : '') +
      '<div class="tl-note">Effective rate is tax divided by estimated market value, which is the only fair way to ' +
      'compare properties across different towns. Two homes at the same price can differ by thousands a year.</div>');
  }

  // ══════════════════════════════════════════════
  // 6 · TOWN COMPARISON
  // ══════════════════════════════════════════════

  Object.assign(window, { toolPortfolio });
})();

export {};
