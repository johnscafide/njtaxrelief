/* Lazy dashboard module: true-cost. Generated from the original dashboard without calculation changes. */
(function () {
  'use strict';
  function toolCost() {
    var homes = rows.filter(function (r) { return r.kind === 'home'; });
    if (!homes.length) return '';
    var r = homes[0];
    var v = +r.watchdog_value || +r.assessed || 300000;
    var mTax = Math.round((+r.last_year_tax || 0) / 12);

    return toolCard('True cost of ownership', 'fa-wallet',
      '<div class="tc-spon"><img src="/johnvarano.jpg" alt="John Varano">' +
        '<div><b>Sponsored by Greentree Mortgage, an HMA Company</b>' +
        '<span>John Varano, Branch Manager</span></div></div>' +
      '<div class="tc-grid">' +
        '<div class="tc-in">' +
          tcRow('Home value', 'tc-val', v.toLocaleString()) +
          tcRow('Loan balance', 'tc-loan', Math.round(v * 0.7).toLocaleString()) +
          tcRow('Rate %', 'tc-rate', '6.5', 'number', '0.125') +
          tcRow('Property tax, monthly', 'tc-tax', mTax.toLocaleString()) +
          tcRow('Insurance, monthly', 'tc-ins', '125') +
          tcRow('Upkeep, % of value/yr', 'tc-up', '1', 'number', '0.25') +
        '</div>' +
        '<div class="tc-out">' +
          '<div class="tc-big" id="tc-total">-</div>' +
          '<div class="tc-lbl">True monthly cost</div>' +
          '<div id="tc-break"></div>' +
          '<div class="tc-share" id="tc-share"></div>' +
          '<a class="tc-btn" href="' + GREENTREE_URL + '" target="_blank" rel="noopener">' +
            'Talk to John Varano <i class="fas fa-arrow-right"></i></a>' +
        '</div>' +
      '</div>' +
      '<div class="tl-fine">Estimate only. Not a loan offer or a commitment to lend. Greentree Mortgage, an HMA Company, ' +
      'is a separate company and is not affiliated with Opus Elite Real Estate. You are never required to use any particular lender.</div>');
  }
  function tcRow(label, id, val, type, step) {
    return '<div class="tc-row"><label>' + label + '</label>' +
      '<input id="' + id + '" type="' + (type || 'text') + '"' + (step ? ' step="' + step + '"' : '') +
      ' value="' + val + '" oninput="dbCost()"></div>';
  }

  window.dbCost = function () {
    function v(id) {
      var e = el(id); if (!e) return 0;
      return parseFloat(String(e.value).replace(/[^0-9.]/g, '')) || 0;
    }
    var val = v('tc-val'), loan = v('tc-loan'), rate = v('tc-rate');
    var tax = v('tc-tax'), ins = v('tc-ins'), up = v('tc-up');
    var i = rate / 100 / 12, n = 360;
    var pi = i > 0 ? loan * (i * Math.pow(1 + i, n)) / (Math.pow(1 + i, n) - 1) : loan / n;
    var upk = (val * (up / 100)) / 12;
    var total = pi + tax + ins + upk;

    var t = el('tc-total'); if (t) t.textContent = money(total);
    var b = el('tc-break');
    if (b) b.innerHTML =
      tcLine('Principal and interest', pi) + tcLine('Property tax', tax) +
      tcLine('Insurance', ins) + tcLine('Upkeep and repairs', upk);
    var sh = el('tc-share');
    if (sh && total > 0) {
      var pct = Math.round((tax / total) * 100);
      sh.innerHTML = '<i class="fas fa-circle-info"></i> Property tax is <b>' + pct +
        '%</b> of what this home costs you every month. It is also the only line here you can appeal.';
    }
  };
  function tcLine(l, v) {
    return '<div class="tc-line"><span>' + l + '</span><b>' + money(v) + '</b></div>';
  }

  // ══════════════════════════════════════════════
  // 10 · PROFESSIONAL EXPORT
  // ══════════════════════════════════════════════

  Object.assign(window, { toolCost, tcRow, tcLine });
})();

export {};
