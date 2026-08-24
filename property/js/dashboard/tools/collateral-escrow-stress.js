/* Watchdog proprietary lender workflow: forward collateral / escrow tax stress. */
(function () {
  'use strict';

  function num(v) {
    v = +v;
    return isFinite(v) ? v : null;
  }
  function pct(v) {
    return v == null ? 'Not available' : ((v >= 0 ? '+' : '') + (v * 100).toFixed(1) + '%/yr');
  }
  function deltaMoney(v) {
    if (v == null) return 'Not available';
    var rounded = Math.round(v);
    return (rounded > 0 ? '+' : '') + money(rounded) + '/mo';
  }
  function scenario(label, annualTax, baseTax, basis) {
    if (annualTax == null || !isFinite(annualTax)) {
      return { label: label, available: false, basis: basis || 'Required evidence is not available.' };
    }
    return {
      label: label,
      available: true,
      annualTax: annualTax,
      monthlyTax: annualTax / 12,
      monthlyDelta: (annualTax - baseTax) / 12,
      basis: basis || ''
    };
  }

  function metrics(r, opts) {
    opts = opts || {};
    var base = num(r.last_year_tax);
    var assessed = num(r.assessed);
    if (base == null || base <= 0 || assessed == null || assessed <= 0) return null;

    var price = num(opts.price);
    if (price == null || price <= 0) price = num(r.watchdog_value);
    var addedAssessment = num(opts.addedAssessment);
    if (addedAssessment == null || addedAssessment < 0) addedAssessment = 0;
    var insurance = num(opts.insurance);
    if (insurance == null || insurance < 0) insurance = 0;
    var flood = num(opts.flood);
    if (flood == null || flood < 0) flood = 0;

    var bc = typeof buyerCost === 'function' && price ? buyerCost(r, price) : null;
    var bp = typeof budgetPressureFor === 'function' ? budgetPressureFor(r) : null;
    var rv = typeof revalRadar === 'function' ? revalRadar(r) : null;
    var taxRate = base / assessed;
    var addedTax = addedAssessment * taxRate;
    var horizon = 2;

    // Current trajectory is only shown when the municipality has an observed
    // general-tax-rate history. Do not substitute a statewide/default growth
    // assumption here; missing evidence should remain visibly missing.
    var trajectoryGrowth = bc && bc.town && bc.town.trajectory ? num(bc.town.trajectory.cagr) : null;
    var trajectoryTax = trajectoryGrowth == null
      ? null
      : (base + addedTax) * Math.pow(1 + trajectoryGrowth, horizon);

    // Revaluation/reassessment scenario uses the subject scenario value and
    // the verified municipal sales ratio exposed by buyerCost(). It is an
    // exposure scenario, never a claim that an assessor will act or when.
    var caughtTax = bc ? num(bc.caughtTax) : null;
    var revaluationBase = caughtTax == null ? null : Math.max(base, caughtTax) + addedTax;
    var revaluationTax = revaluationBase == null
      ? null
      : revaluationBase * Math.pow(1 + (trajectoryGrowth == null ? 0 : trajectoryGrowth), horizon);

    // Municipal-budget stress uses the municipality's observed total-levy
    // CAGR as a transparent proxy. It is not converted from the Watchdog
    // pressure score and is not represented as a forecast of this parcel.
    var levyGrowth = bp && bp.trend ? num(bp.trend.total_levy_cagr) : null;
    var budgetTax = levyGrowth == null
      ? null
      : (base + addedTax) * Math.pow(1 + levyGrowth, horizon);

    var scenarios = [
      scenario('Current trajectory', trajectoryTax, base,
        trajectoryGrowth == null
          ? 'Municipal general-tax-rate history is unavailable for this parcel.'
          : 'Two-year illustration using this municipality’s observed general-tax-rate CAGR of ' + pct(trajectoryGrowth) + '.'),
      scenario('Revaluation scenario', revaluationTax, base,
        caughtTax == null
          ? 'A verified municipal sales-ratio catch-up value is unavailable.'
          : 'Two-year assessment catch-up scenario at the verified municipal ratio and scenario property value' +
            (trajectoryGrowth == null ? ', with no added rate-growth assumption.' : ', then the observed tax-rate path.') ),
      scenario('Municipal budget stress', budgetTax, base,
        levyGrowth == null
          ? 'Municipal total-levy history is unavailable.'
          : 'Two-year proxy applying the municipality’s observed total-levy CAGR of ' + pct(levyGrowth) + ' to the tax line.')
    ];

    var revalScenario = scenarios[1];
    var sentence = revalScenario.available
      ? 'If a reassessment or revaluation scenario brought the assessment toward the verified municipal ratio within two years, the modeled tax escrow would move by roughly ' + deltaMoney(revalScenario.monthlyDelta) + ' versus today.'
      : 'A two-year revaluation payment scenario is not shown because the required verified ratio evidence is unavailable.';

    return {
      base: base,
      currentMonthlyTax: base / 12,
      currentMonthlyCarry: (base + insurance + flood) / 12,
      price: price,
      assessed: assessed,
      addedAssessment: addedAssessment,
      addedTax: addedTax,
      insurance: insurance,
      flood: flood,
      trajectoryGrowth: trajectoryGrowth,
      levyGrowth: levyGrowth,
      revaluationPressure: rv ? num(rv.score) : null,
      budgetPressure: bp ? num(bp.score) : null,
      scenarios: scenarios,
      sentence: sentence
    };
  }

  function scenarioHtml(s) {
    if (!s.available) {
      return '<span><small>' + s.label + '</small><b>Evidence missing</b><em>' + s.basis + '</em></span>';
    }
    return '<span><small>' + s.label + ' · 2 years</small><b>' + money(s.annualTax) + '/yr</b>' +
      '<strong>' + deltaMoney(s.monthlyDelta) + '</strong><em>' + s.basis + '</em></span>';
  }

  function resultHtml(v) {
    return '<div class="ces-kpis">' + v.scenarios.map(scenarioHtml).join('') + '</div>' +
      '<div class="ces-result"><b>' + v.sentence + '</b><span>' +
        ' Current tax escrow ' + money(v.currentMonthlyTax) + '/mo' +
        (v.revaluationPressure == null ? '' : ' · Revaluation context ' + Math.round(v.revaluationPressure) + '/100') +
        (v.budgetPressure == null ? '' : ' · Budget pressure context ' + Math.round(v.budgetPressure) + '/100') +
      '</span></div>';
  }

  function card(r) {
    var v = metrics(r);
    if (!v) return '';
    return toolCard('Collateral & Escrow Stress Lab', 'fa-vault',
      '<p class="tl-p">Translate sourced tax and municipal evidence into monthly planning scenarios. Each path is shown separately so a current trend, an assessment catch-up, and municipal budget pressure are never blended into one implied forecast.</p>' +
      '<div class="ces-kpis"><span><small>Current annual property tax</small><b>' + money(v.base) + '</b></span>' +
        '<span><small>Current monthly tax escrow</small><b>' + money(v.currentMonthlyTax) + '/mo</b></span>' +
        '<span><small>Scenario property value</small><b>' + (v.price ? money(v.price) : 'Enter value') + '</b></span>' +
        '<span><small>Added-assessment input</small><b>' + money(v.addedAssessment) + '</b></span></div>' +
      '<div class="ces-inputs"><label>Scenario property value <input type="number" min="0" step="1000" value="' + Math.round(v.price || 0) + '" data-ces="price"></label>' +
        '<label>Added assessment <input type="number" min="0" step="1000" value="' + Math.round(v.addedAssessment) + '" data-ces="added"></label>' +
        '<label>Annual insurance <input type="number" min="0" step="100" value="0" data-ces="insurance"></label>' +
        '<label>Annual flood premium <input type="number" min="0" step="100" value="0" data-ces="flood"></label>' +
        '<button type="button" onclick="cesRecalc(this,\'' + esc(r.pams_pin || '') + '\')">Run scenarios</button></div>' +
      '<div data-ces-results>' + resultHtml(v) + '</div>' +
      '<div class="tl-fine">Scenario model only, not an escrow disclosure, appraisal, tax prediction, insurance quote, underwriting decision, or recommendation to buy, sell, refinance, or appeal. Current trajectory requires observed municipal tax-rate history. The revaluation path requires verified ratio evidence. The budget-stress path uses reported municipal total-levy history as a proxy. Missing inputs stay unavailable rather than being replaced with a default forecast. Confirm taxes, assessments and insurance with controlling sources before relying on them.</div>');
  }

  window.cesRecalc = function (btn, pin) {
    var r = (window.rows || []).filter(function (x) { return x.pams_pin === pin; })[0];
    if (!r) return;
    var box = btn.closest('.tool,.tl-card,.sec2-body') || btn.parentNode.parentNode;
    var get = function (key) {
      var input = box.querySelector('[data-ces="' + key + '"]');
      return input ? +input.value : 0;
    };
    var v = metrics(r, {
      price: get('price'),
      addedAssessment: get('added'),
      insurance: get('insurance'),
      flood: get('flood')
    });
    var out = box.querySelector('[data-ces-results]');
    if (out && v) out.innerHTML = resultHtml(v);
  };

  Object.assign(window, {
    collateralEscrowStress: metrics,
    toolCollateralEscrowStress: card
  });
})();
export {};
