/* Lazy dashboard module: appeal-odds. Generated from the original dashboard without calculation changes. */
(function () {
  'use strict';
  function toolAppealOdds() {
    var cands = rows.filter(function (r) { return appealFor(r); });
    if (!cands.length) return '';
    var r = cands[0], a = appealFor(r), L = a.latest, u = uniFor(r);
    var hist = Object.keys(a.history).sort();

    var W = 330, H = 58;
    var rates = hist.map(function (y) { return a.history[y].win_rate_filed; });
    var lo = Math.min.apply(null, rates), hi = Math.max.apply(null, rates);
    var path = rates.map(function (v, i) {
      var x = 6 + (i / Math.max(1, rates.length - 1)) * (W - 12);
      var y = H - 8 - ((v - lo) / ((hi - lo) || 1)) * (H - 18);
      return (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
    }).join(' ');

    // Expected value. This is the number nobody else can produce, because it
    // needs the county outcome record, the town's uniformity, and this
    // property's own gap, and no one publishes the three together.
    var c = chapter123(r);
    var ev = null;
    if (c && c.testable && c.hasCase && c.saving && L.win_rate_filed != null) {
      // Expected value uses the outcome of every filed appeal. The merits-only
      // decided rate excludes dismissals and withdrawals and is context, not odds.
      var p = L.win_rate_filed / 100;
      ev = { p: p, gross: c.saving * 5, net: (c.saving * 5 * p) - 25 };
    }

    return toolCard('Appeal odds in ' + esc(a.county.toLowerCase().replace(/\b\w/g, function (m) { return m.toUpperCase(); })) + ' County',
      'fa-gavel',
      '<p class="tl-p">Appeals are decided by the <b>county</b> board of taxation, not your town, so this is the ' +
      'body that would actually hear your case. New Jersey publishes what happens to every appeal filed, ' +
      'and has done for ten years.</p>' +

      '<div class="ap-grid">' +
        '<div><b>' + L.win_rate_filed + '%</b><span>of all appeals filed won a reduction</span></div>' +
        '<div><b>' + (L.win_rate_decided != null ? L.win_rate_decided + '%' : '-') +
          '</b><span>of those actually decided</span></div>' +
        '<div><b>' + L.total.toLocaleString() + '</b><span>filed in ' + a.latest_year + '</span></div>' +
        '<div><b>' + L.residential.toLocaleString() + '</b><span>were residential like yours</span></div>' +
      '</div>' +

      '<div class="ap-chart">' +
        '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Win rate over ten years">' +
          '<path d="' + path + '" fill="none" stroke="#1c7a4a" stroke-width="2.4" stroke-linecap="round"/>' +
        '</svg>' +
        '<div class="ap-yrs"><span>' + hist[0] + '  ' + rates[0] + '%</span>' +
          '<span class="' + (a.trend > 0 ? 'up' : a.trend < 0 ? 'down' : '') + '">' +
          (a.trend > 0 ? 'up ' + a.trend + ' points' : a.trend < 0 ? 'down ' + Math.abs(a.trend) + ' points' : 'flat') +
          ' over ten years</span>' +
          '<span>' + hist[hist.length - 1] + '  ' + rates[rates.length - 1] + '%</span></div>' +
      '</div>' +

      (ev
        ? '<div class="ap-ev">' +
            '<div class="ap-ev-n">' + money(Math.round(ev.net)) + '</div>' +
            '<div class="ap-ev-l">Expected value of filing on <b>' + esc(r.address) + '</b>, over five years, ' +
              'after the filing fee. That is a <b>' + Math.round(ev.p * 100) + '%</b> chance of winning ' +
              money(Math.round(ev.gross)) + '.</div>' +
            '<button class="tl-btn" onclick="dbAsk(\'appeal\')">Have an agent screen this</button>' +
          '</div>'
        : '<div class="tl-note">Your saved properties do not currently show an assessment above the Chapter 123 ' +
          'limit, so there is nothing to weigh these odds against. Open a property\u2019s full record and the ' +
          'analysis saves back here.</div>') +

      '<div class="tl-fine">A win means the assessment came down, either revised by the board or stipulated by ' +
      'agreement before hearing. Most successful appeals settle, so counting only board revisions would ' +
      'understate this badly. The filed rate is the headline probability used in expected value. The decided-on-the-merits rate is shown separately because it excludes withdrawals and dismissals. ' +
      'The average successful appeal in ' + a.county.toLowerCase() + ' cut ' +
      (L.avg_reduction_per_win ? money(L.avg_reduction_per_win) : 'an unrecorded amount') +
      ' off the assessed value, though that figure is dominated by commercial cases and a house will be far less. ' +
      'This data is published by county, not by town. Anyone offering you a town level win rate for New Jersey ' +
      'is guessing.</div>');
  }

  // ══════════════════════════════════════════════

  Object.assign(window, { toolAppealOdds });
})();

export {};
