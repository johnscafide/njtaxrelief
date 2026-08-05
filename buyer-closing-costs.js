/* Lazy dashboard module: buyer-closing-costs. Generated from the original dashboard without calculation changes. */
(function () {
  'use strict';
  function buyerCost(r, price) {
    var s = sr1aFor(r);
    if (!s || !price) return null;
    var rate = (r.last_year_tax && r.assessed) ? r.last_year_tax / r.assessed : null;
    if (!rate) return null;

    var todayTax = r.last_year_tax;
    // if the town reassessed this parcel to the purchase price
    var caughtAssessment = price * s.ratio;
    var caughtTax = caughtAssessment * rate;

    var u = uniFor(r);
    var rv = (typeof revalRadar === 'function') ? revalRadar(r) : null;
    var town = typeof townIntelFor === 'function' ? townIntelFor(r) : null;

    // rate drift, from this town's own published history where we have it
    var yrs = [1, 3, 5];
    var growth = town && town.trajectory ? town.trajectory.cagr : 0.025;
    var proj = yrs.map(function (y) {
      return { y: y, low: todayTax * Math.pow(1 + growth, y),
                     high: Math.max(todayTax, caughtTax) * Math.pow(1 + growth, y) };
    });

    return {
      price: price, ratio: s.ratio, rate: rate,
      todayTax: todayTax, caughtAssessment: caughtAssessment, caughtTax: caughtTax,
      jump: caughtTax - todayTax,
      exposed: caughtTax > todayTax * 1.08,
      proj: proj, revalPressure: rv ? rv.score : null,
      rateGrowth: growth, town: town
    };
  }

  function toolBuyerCost(r) {
    var s = sr1aFor(r);
    if (!s || !r.last_year_tax || !r.assessed) return '';
    var guess = r.watchdog_value || (r.assessed / s.ratio);
    var id = 'bc-' + (r.pams_pin || 'x').replace(/[^\w]/g, '');

    return toolCard('Buyer tax outlook', 'fa-key',
      '<p class="tl-p">A listing shows the <em>seller\u2019s</em> tax bill. A buyer may not pay that. If the ' +
      'assessment has not kept pace with what the house is now worth, the gap closes eventually and the bill ' +
      'moves with it.</p>' +
      '<div class="bc-in">' +
        '<label for="' + id + '">Purchase price</label>' +
        '<div class="bc-money"><span>$</span>' +
        '<input id="' + id + '" type="text" inputmode="numeric" value="' +
          Math.round(guess / 1000) * 1000 + '" oninput="bcCalc(\'' + esc(r.pams_pin) + '\', this)"></div>' +
      '</div>' +
      '<div id="' + id + '-out"></div>' +
      (typeof townIntelSummary === 'function' ? townIntelSummary(r) : '') +
      '<div class="tl-fine">Projections use this municipality\'s own available general tax-rate history when it is available, ' +
      'and otherwise use a 2.5% annual illustration. They also assume the town eventually assesses at its current verified ratio of ' +
      (s.ratio * 100).toFixed(1) + '%. Neither is guaranteed. No one outside the municipality can say when an ' +
      'assessor will act on a specific parcel. This is exposure, not a schedule.</div>');
  }

  window.bcCalc = function (pin, input) {
    var v = String(input.value).replace(/[^0-9]/g, '');
    input.value = v ? parseInt(v, 10).toLocaleString() : '';
    var price = +v || 0;
    var r = null;
    for (var i = 0; i < rows.length; i++) if (rows[i].pams_pin === pin) r = rows[i];
    if (!r) return;
    var id = 'bc-' + pin.replace(/[^\w]/g, '');
    var host = el(id + '-out');
    if (!host) return;
    var b = buyerCost(r, price);
    if (!b) { host.innerHTML = ''; return; }

    host.innerHTML =
      '<div class="bc-now">' +
        '<div><b>' + money(b.todayTax) + '</b><span>the bill today</span></div>' +
        '<div class="' + (b.exposed ? 'up' : '') + '"><b>' + money(b.caughtTax) +
          '</b><span>if the assessment catches up to ' + money(price) + '</span></div>' +
        '<div class="' + (b.exposed ? 'up' : '') + '"><b>' +
          (b.jump > 0 ? '+' + money(b.jump) : money(0)) + '</b><span>a year, unbooked</span></div>' +
      '</div>' +
      (b.exposed
        ? '<div class="bc-warn"><i class="fas fa-triangle-exclamation"></i><div>' +
          'At ' + money(price) + ' this property would be assessed around <b>' +
          money(Math.round(b.caughtAssessment)) + '</b> if the town applied its own ratio, against the <b>' +
          money(r.assessed) + '</b> on the books now. The bill in the listing understates what a buyer ends up ' +
          'paying by roughly <b>' + money(Math.round(b.jump / 12)) + ' a month</b>.' +
          (b.revalPressure != null && b.revalPressure >= 45
            ? ' Revaluation pressure in this town is running at <b>' + b.revalPressure +
              ' out of 100</b>, which makes the catch-up more likely than not.' : '') +
          '</div></div>'
        : '<div class="bc-ok"><i class="fas fa-circle-check"></i><div>At ' + money(price) +
          ' the assessment is broadly in line with the town ratio, so there is no hidden catch-up waiting ' +
          'in this one.</div></div>') +
      '<div class="bc-proj"><h5>Projected annual tax</h5><table><tbody>' +
        b.proj.map(function (p) {
          return '<tr><td>In ' + p.y + ' year' + (p.y === 1 ? '' : 's') + '</td>' +
            '<td class="n">' + money(p.low) + '</td><td class="n">to</td>' +
            '<td class="n"><b>' + money(p.high) + '</b></td></tr>';
        }).join('') +
      '</tbody></table>' +
      '<p>The low column assumes the assessment is never revisited. The high column assumes it catches up. ' +
      'Both use a rate illustration of <b>' + (b.rateGrowth >= 0 ? '+' : '') + (b.rateGrowth * 100).toFixed(1) +
      '% per year</b>' + (b.town && b.town.trajectory ? ' from this town\'s own history' : ' as a statewide fallback') + '.</p></div>';
  };

  // ══════════════════════════════════════════════

  Object.assign(window, { buyerCost, toolBuyerCost });
})();

export {};
