/* Lazy dashboard module: assessment-drift. Generated from the original dashboard without calculation changes. */
(function () {
  'use strict';
  function toolDrift() {
    var withHist = rows.filter(function (r) { return (r.history || []).length; });
    if (!rows.length) return '';

    if (!withHist.length) {
      return toolCard('Assessment drift', 'fa-chart-line',
        '<div class="tl-wait"><i class="fas fa-hourglass-half"></i>' +
        '<div><b>Building your baseline.</b> Every time you open one of these properties we record the ' +
        'assessment and tax. The first time either one changes, this becomes a year over year chart of ' +
        'how your assessment has moved against your town. New Jersey does not publish that anywhere, ' +
        'so it can only be built by watching.</div></div>' +
        '<div class="tl-note">' + rows.length + ' propert' + (rows.length === 1 ? 'y' : 'ies') +
        ' being tracked. Nothing to compare yet.</div>');
    }

    var body = withHist.map(function (r) {
      var pts = (r.history || []).map(function (h) {
        return { t: h.seen ? new Date(h.seen).getTime() : 0, v: +h.assessed || 0, x: +h.last_year_tax || 0 };
      }).filter(function (p) { return p.v > 0; });
      pts.push({ t: Date.now(), v: +r.assessed || 0, x: +r.last_year_tax || 0 });
      if (pts.length < 2) return '';

      var first = pts[0], last = pts[pts.length - 1];
      var dA = last.v - first.v, pA = first.v ? (dA / first.v) * 100 : 0;
      var dT = last.x - first.x, pT = first.x ? (dT / first.x) * 100 : 0;

      var W = 300, H = 60, lo = Math.min.apply(null, pts.map(function (p) { return p.v; })),
          hi = Math.max.apply(null, pts.map(function (p) { return p.v; }));
      var path = pts.map(function (p, i) {
        var x = 4 + (i / (pts.length - 1)) * (W - 8);
        var y = H - 6 - ((p.v - lo) / ((hi - lo) || 1)) * (H - 14);
        return (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
      }).join(' ');

      return '<div class="dr-row">' +
        '<div class="dr-addr"><b>' + esc(r.address) + '</b><span>' + esc(r.town || '') + '</span></div>' +
        '<svg class="dr-spark" viewBox="0 0 ' + W + ' ' + H + '"><path d="' + path + '" fill="none" stroke="' +
          (dA > 0 ? '#c0392b' : '#1e6b3a') + '" stroke-width="2.4" stroke-linecap="round"/></svg>' +
        '<div class="dr-fig ' + (dA > 0 ? 'up' : 'down') + '">' + (dA >= 0 ? '+' : '') + money(dA) +
          '<span>' + (pA >= 0 ? '+' : '') + pA.toFixed(1) + '% assessed</span></div>' +
        '<div class="dr-fig ' + (dT > 0 ? 'up' : 'down') + '">' + (dT >= 0 ? '+' : '') + money(dT) +
          '<span>' + (pT >= 0 ? '+' : '') + pT.toFixed(1) + '% tax</span></div>' +
      '</div>';
    }).join('');

    return toolCard('Assessment drift', 'fa-chart-line', body +
      '<div class="tl-note">Measured from snapshots taken each time you opened the property. ' +
      'A rising assessment with a flat market is the clearest appeal signal there is.</div>');
  }

  // ══════════════════════════════════════════════
  // 2 · NEIGHBORHOOD TAX PERCENTILE
  // ══════════════════════════════════════════════

  Object.assign(window, { toolDrift });
})();

export {};
