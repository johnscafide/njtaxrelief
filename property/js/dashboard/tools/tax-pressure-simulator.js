/* Property tax pressure scenario: assessment movement and rate movement kept separate. */
(function () {
  'use strict';

  function toolTaxPressure(r) {
    if (!r || !r.assessed || !r.last_year_tax) return '';
    var town = typeof townIntelFor === 'function' ? townIntelFor(r) : null;
    var budget = typeof budgetPressureFor === 'function' ? budgetPressureFor(r) : null;
    var rateGrowth = town && town.trajectory ? town.trajectory.cagr * 100 : 2.5;
    var id = 'tp-' + String(r.pams_pin || 'property').replace(/[^a-z0-9]/gi, '');
    return toolCard('Tax bill pressure simulator', 'fa-sliders',
      '<p class="tl-p">A tax bill can move because the assessment changes, the general tax rate changes, or both. Adjust them separately so one does not get mistaken for the other.</p>' +
      '<div class="tp-controls" id="' + id + '">' +
        '<label>Assessment change <output>0%</output><input type="range" min="-20" max="100" value="0" step="1" data-k="assessment"></label>' +
        '<label>Annual rate change <output>' + rateGrowth.toFixed(1) + '%</output><input type="range" min="-3" max="8" value="' + rateGrowth.toFixed(1) + '" step="0.1" data-k="rate"></label>' +
        '<label>Years ahead <output>5</output><input type="range" min="1" max="10" value="5" step="1" data-k="years"></label>' +
      '</div><div class="tp-output" id="' + id + '-out"></div>' +
      (budget ? '<div class="tl-note"><b>Budget context:</b> ' + budget.score + '/100 ' + budget.band +
        ' municipal pressure. This does not change the rate slider because the pressure score is not a forecast.</div>' : '') +
      '<div class="tl-fine">This is an adjustable scenario, not a forecast. It starts with the current assessment and effective tax rate. The rate control defaults to the municipality\'s own historical pace when enough years are available.</div>');
  }

  function calculate(host) {
    var root = host.closest('.tool') || host.parentElement;
    var assessmentChange = +host.querySelector('[data-k="assessment"]').value;
    var rateChange = +host.querySelector('[data-k="rate"]').value;
    var years = +host.querySelector('[data-k="years"]').value;
    host.querySelector('[data-k="assessment"]').previousElementSibling.textContent = assessmentChange + '%';
    host.querySelector('[data-k="rate"]').previousElementSibling.textContent = rateChange.toFixed(1) + '%';
    host.querySelector('[data-k="years"]').previousElementSibling.textContent = years;
    var pin = host.id.replace(/^tp-/, '');
    var r = rows.filter(function (row) { return String(row.pams_pin || '').replace(/[^a-z0-9]/gi, '') === pin; })[0];
    if (!r) return;
    var currentRate = +r.last_year_tax / +r.assessed;
    var assessment = +r.assessed * (1 + assessmentChange / 100);
    var projected = assessment * currentRate * Math.pow(1 + rateChange / 100, years);
    var delta = projected - +r.last_year_tax;
    root.querySelector('.tp-output').innerHTML = '<div><span>Bill today</span><b>' + money(r.last_year_tax) + '</b></div>' +
      '<i class="fas fa-arrow-right"></i><div class="' + (delta > 0 ? 'up' : 'down') + '"><span>Scenario in ' + years + ' years</span><b>' + money(projected) + '</b><small>' +
      (delta >= 0 ? '+' : '-') + money(Math.abs(delta)) + ' per year</small></div>';
  }

  document.addEventListener('input', function (event) {
    var input = event.target.closest('.tp-controls input');
    if (input) calculate(input.closest('.tp-controls'));
  });
  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.tp-controls').forEach(calculate);
  });
  window.setTimeout(function () { document.querySelectorAll('.tp-controls').forEach(calculate); }, 0);

  Object.assign(window, { toolTaxPressure: toolTaxPressure });
})();

export {};
