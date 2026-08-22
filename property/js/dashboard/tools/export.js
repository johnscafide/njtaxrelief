/* Lazy dashboard module: export. Professional parcel exports use the canonical ROBUST score contract. */
(function () {
  'use strict';
  function toolExport() {
    if (!rows.length) return '';
    return toolCard('Export for your attorney or agent', 'fa-file-export',
      '<p class="tl-p">A clean parcel sheet with the canonical ROBUST Watchdog Score, evidence coverage, block, lot, PAMS PIN, assessment, town ratio, Uniformity and Chapter 123 context for each property.</p>' +
      '<div class="ex-btns">' +
        '<button class="tl-btn" onclick="dbExportCSV()"><i class="fas fa-file-csv"></i> Download CSV</button>' +
        '<button class="tl-btn ghost" onclick="dbExportPrint()"><i class="fas fa-print"></i> Printable sheet</button>' +
      '</div>' +
      '<div class="tl-fine">Watchdog Score fields use ROBUST-v1 only. Missing dimensions lower evidence coverage and are never replaced with a fallback score. Verify source records before filing anything.</div>');
  }

  function exportRows() {
    function pct(value) { return value == null ? '' : (value * 100).toFixed(2); }
    return rows.map(function (r) {
      var R = ratioFor(r.town, r.county);
      var mv = +r.watchdog_value || (R && r.assessed ? r.assessed / R.ratio : null);
      var fair = (mv && R) ? mv * R.ratio : null;
      var upper = fair ? fair * 1.15 : null;
      var town = typeof townIntelFor === 'function' ? townIntelFor(r) : null;
      var budget = typeof budgetPressureFor === 'function' ? budgetPressureFor(r) : null;
      var wd = typeof watchdogScore === 'function' ? watchdogScore(r) : null;
      var canonical = wd && wd.modelVersion === 'ROBUST-v1' ? wd : null;
      return {
        Address: r.address || '', Town: r.town || '', County: r.county || '', Zip: r.zip || '',
        Block: r.block || '', Lot: r.lot || '', PAMS_PIN: r.pams_pin || '',
        Watchdog_Score: canonical ? canonical.score : '',
        Watchdog_Score_Model: canonical ? canonical.modelVersion : '',
        Watchdog_Score_Evidence_Coverage_Pct: canonical ? Math.round(canonical.covered * 100) : '',
        Watchdog_Score_Confidence: canonical ? canonical.confidence : '',
        Assessed: r.assessed || '', Annual_Tax: r.last_year_tax || '',
        Effective_Rate_Pct: r.effective_rate || '',
        Town_Uniformity_Score: town ? town.score : '',
        Town_Statewide_Uniformity_Rank: town ? town.stateRank : '',
        Town_Rate_Trend_Pct_Per_Year: town && town.trajectory ? (town.trajectory.cagr * 100).toFixed(2) : '',
        Municipal_Budget_Pressure_Score: budget ? budget.score : '',
        Municipal_Budget_Pressure_Band: budget ? budget.band : '',
        Total_Levy_Growth_Pct_Per_Year: budget ? pct(budget.trend.total_levy_cagr) : '',
        Organic_Ratable_Growth_Pct_Per_Year: budget ? pct(budget.trend.ratable_growth) : '',
        School_Levy_Growth_Pct_Per_Year: budget ? pct(budget.trend.school_levy_cagr) : '',
        Municipal_Levy_Growth_Pct_Per_Year: budget ? pct(budget.trend.municipal_levy_cagr) : '',
        Town_Ratio_Pct: R ? (R.ratio * 100).toFixed(2) : '',
        Ratio_Tax_Year: R ? R.year : '',
        Est_Market_Value: mv ? Math.round(mv) : '',
        Supported_Assessment: fair ? Math.round(fair) : '',
        Ch123_Upper_Limit: upper ? Math.round(upper) : '',
        Over_Limit_By: (upper && r.assessed > upper) ? Math.round(r.assessed - upper) : 0,
        Appeal_Indicated: (upper && r.assessed > upper) ? 'YES' : 'no',
        Verification: r.verify_level || 'self', Kind: r.kind
      };
    });
  }

  window.dbExportCSV = function () {
    var d = exportRows();
    if (!d.length) return;
    var head = Object.keys(d[0]);
    var csv = [head.join(',')].concat(d.map(function (r) {
      return head.map(function (k) {
        var v = r[k] == null ? '' : String(r[k]);
        return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
      }).join(',');
    })).join('\n');
    var b = new Blob([csv], { type: 'text/csv' }), u = URL.createObjectURL(b);
    var a = document.createElement('a');
    a.href = u; a.download = 'nj-parcel-sheet-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(u);
  };

  window.dbExportPrint = function () {
    var d = exportRows();
    var w = window.open('', '_blank');
    if (!w) { toast('Allow popups to print'); return; }
    var head = ['Address', 'Town', 'Block', 'Lot', 'PAMS_PIN',
                'Watchdog_Score', 'Watchdog_Score_Model', 'Watchdog_Score_Evidence_Coverage_Pct', 'Watchdog_Score_Confidence',
                'Assessed', 'Annual_Tax', 'Town_Uniformity_Score', 'Town_Statewide_Uniformity_Rank', 'Town_Rate_Trend_Pct_Per_Year',
                'Municipal_Budget_Pressure_Score', 'Municipal_Budget_Pressure_Band',
                'Town_Ratio_Pct', 'Supported_Assessment', 'Ch123_Upper_Limit', 'Appeal_Indicated'];
    w.document.write('<html><head><title>NJ parcel sheet</title><style>' +
      'body{font-family:system-ui,sans-serif;padding:28px;color:#1a1a2e}' +
      'h1{font-size:19px;margin:0 0 4px}.sub{font-size:12px;color:#666;margin-bottom:18px}' +
      'table{width:100%;border-collapse:collapse;font-size:10px}' +
      'th{background:#0e2248;color:#fff;padding:7px;text-align:left}' +
      'td{padding:6px 7px;border-bottom:1px solid #ddd}' +
      'tr:nth-child(even) td{background:#f7f8fa}' +
      '.y{color:#c0392b;font-weight:700}' +
      '.f{margin-top:18px;font-size:10.5px;color:#666;line-height:1.6}' +
      '</style></head><body>' +
      '<h1>New Jersey parcel sheet · ROBUST-v1</h1>' +
      '<div class="sub">Prepared ' + new Date().toLocaleDateString() + ' for ' + esc(plUser.email || '') +
      ' via njpropertytaxrelief.com</div>' +
      '<table><thead><tr>' + head.map(function (h) { return '<th>' + h.replace(/_/g, ' ') + '</th>'; }).join('') +
      '</tr></thead><tbody>' +
      d.map(function (r) {
        return '<tr>' + head.map(function (h) {
          var v = r[h] == null ? '' : r[h];
          if (typeof v === 'number' && /Assess|Tax|Limit|Value/.test(h)) v = '$' + v.toLocaleString();
          return '<td' + (h === 'Appeal_Indicated' && v === 'YES' ? ' class="y"' : '') + '>' + v + '</td>';
        }).join('') + '</tr>';
      }).join('') +
      '</tbody></table>' +
      '<div class="f">Watchdog Score is the canonical ROBUST-v1 tax-position signal: Recourse 10%, Overassessment Position 20%, Burden 30%, Uniformity 15%, Stability 15%, Trajectory 10%. Missing evidence lowers coverage and remaining weights are renormalized. It is not a home, neighborhood or person desirability grade. Other figures are drawn from New Jersey public assessment, sales, uniformity and equalization sources. Verify source records before filing.</div>' +
      '</body></html>');
    w.document.close();
    setTimeout(function () { w.print(); }, 400);
  };

  Object.assign(window, { toolExport, exportRows });
})();

export {};
