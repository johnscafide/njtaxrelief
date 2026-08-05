/* Lazy dashboard module: reassessment-risk. Generated from the original dashboard without calculation changes. */
(function () {
  'use strict';
  // REASSESSMENT RISK
  //
  // When a home sells, the price becomes public evidence of what it is worth.
  // The assessment does not automatically follow. In most New Jersey towns it
  // sits untouched until the assessor gets to it, which can be years, or until
  // the town revalues, at which point it catches up all at once.
  //
  // That gap is visible in the state's own files, and it cuts two ways:
  //
  //   A buyer  needs to know the bill is about to jump, because the listing
  //            shows the seller's tax, not theirs.
  //   An owner needs to know they are currently under-assessed, which is good
  //            news worth not drawing attention to, and terrible news if they
  //            were about to file an appeal.
  //
  // THE TRAP, AND WHY THIS IS NOT A NAIVE RATIO SCREEN
  //
  //   A naive version flags every sale where assessed/price runs below the
  //   town norm, and it is wrong roughly a tenth of the time. New construction
  //   sells for the price of a finished house while still assessed on the bare
  //   land, which produces ratios near 10% that look spectacular and mean
  //   nothing. Same for teardowns and land sales.
  //
  //   Testing on Winslow: 98 sales looked like lags. 6 were land with no
  //   building on record, 3 were new construction awaiting an added
  //   assessment. Calling those "stale" would have been wrong and obvious to
  //   anyone who knows the market. They are classified separately here.
  // ══════════════════════════════════════════════

  var LAG_CLS = {
    stale: {
      label: 'Assessment has not kept up',
      why: 'An existing home that sold well above what its assessment implies. The assessor has not ' +
           'revisited it yet.'
    },
    'new': {
      label: 'New construction, added assessment coming',
      why: 'Built within a few years of the sale and still assessed close to bare land. New Jersey adds ' +
           'the improvement through an added assessment, and the bill rises sharply when it lands.'
    },
    land: {
      label: 'Land or teardown at time of sale',
      why: 'No building on record when it changed hands, so the assessment covers the lot only.'
    }
  };

  function lagClass(x, saleYear) {
    if (!x.sf && !x.yb) return 'land';
    if (x.yb && x.yb >= (saleYear || x.y) - 4) return 'new';
    return 'stale';
  }

  // Classify every recent verified sale in a town against that town's own ratio.
  function townLag(county, district, ratio) {
    return loadCountySales(county).then(function (all) {
      if (!all || !all.length || !ratio) return null;
      var thisYear = new Date().getFullYear();
      var recent = all.filter(function (x) {
        return x.d === district && String(x.c).trim() === '2' &&
               x.r && x.p > 40000 && x.y >= thisYear - 3;
      });
      if (recent.length < 20) return null;

      var out = { total: recent.length, stale: [], 'new': [], land: [] };
      recent.forEach(function (x) {
        if (x.r < ratio * 0.80) out[lagClass(x, x.y)].push(x);
      });
      out.staleShare = out.stale.length / recent.length;
      out.medianStale = out.stale.length
        ? median(out.stale.map(function (x) { return x.r; })) : null;
      out.stale.sort(function (a, b) { return a.r - b.r; });
      return out;
    });
  }

  // Where does THIS property sit? Needs its own verified sale to say anything.
  function ownLag(r, ratio) {
    if (!r._lastSale || !r._lastSaleYear || !r.assessed || !ratio) return null;
    var thisYear = new Date().getFullYear();
    if (thisYear - r._lastSaleYear > 6) return null;      // too old to be evidence

    var implied = r.assessed / r._lastSale;
    var expected = r._lastSale * ratio;
    var gap = expected - r.assessed;
    var eff = (r.last_year_tax && r.assessed) ? r.last_year_tax / r.assessed : null;

    return {
      sale: r._lastSale, year: r._lastSaleYear,
      implied: implied, expected: expected, gap: gap,
      pct: implied / ratio,
      behind: implied < ratio * 0.85,
      ahead: implied > ratio * 1.15,
      taxIfCaught: (gap > 0 && eff) ? gap * eff : null,
      cls: lagClass({ sf: r._sqft, yb: r._built }, r._lastSaleYear)
    };
  }

  // the sales loader is named countySales in this file
  function loadCountySales(c) { return countySales(c); }

  function toolReassessRisk(r) {
    var s = sr1aFor(r);
    if (!s || !s.ratio) return '';
    var own = ownLag(r, s.ratio);
    var d = String(r.pams_pin || '').slice(0, 4);

    var body = '';

    if (own && own.behind) {
      var meta = LAG_CLS[own.cls];
      body +=
        '<div class="rr-flag ' + (own.cls === 'stale' ? 'warn' : 'info') + '">' +
          '<div class="rr-flag-h"><i class="fas fa-triangle-exclamation"></i> ' + esc(meta.label) + '</div>' +
          '<p>This property sold for <b>' + money(own.sale) + '</b> in ' + own.year +
          ', and is assessed at <b>' + money(r.assessed) + '</b>. That is <b>' +
          (own.implied * 100).toFixed(1) + '%</b> of what it actually fetched, against a town norm of <b>' +
          (s.ratio * 100).toFixed(1) + '%</b>. ' + esc(meta.why) + '</p>' +
          '<div class="rr-math">' +
            '<div><span>Assessed at</span><b>' + money(r.assessed) + '</b></div>' +
            '<div><span>Town norm would put it at</span><b>' + money(Math.round(own.expected)) + '</b></div>' +
            '<div class="up"><span>If the assessor catches up</span><b>+' +
              money(Math.round(own.gap)) + '</b></div>' +
            (own.taxIfCaught
              ? '<div class="up"><span>Which would add, per year</span><b>+' +
                money(Math.round(own.taxIfCaught)) + '</b></div>' : '') +
          '</div>' +
          '<p class="rr-note">Nothing here is owed today and nothing is overdue. It is a standing exposure: ' +
          'the figures say this assessment is low relative to the sale, and assessments that sit low get ' +
          'corrected eventually, usually at a revaluation.</p>' +
        '</div>';
    } else if (own && own.ahead) {
      body +=
        '<div class="rr-flag good">' +
          '<div class="rr-flag-h"><i class="fas fa-circle-check"></i> Assessed above what it sold for</div>' +
          '<p>This sold for <b>' + money(own.sale) + '</b> in ' + own.year + ' and carries an assessment of <b>' +
          money(r.assessed) + '</b>, which works out to <b>' + (own.implied * 100).toFixed(1) +
          '%</b> against a town norm of <b>' + (s.ratio * 100).toFixed(1) + '%</b>. ' +
          'A recent arm\u2019s length sale below the assessed level is among the strongest appeal evidence there ' +
          'is, because it is your own property rather than a comparable.</p>' +
        '</div>';
    } else if (own) {
      body +=
        '<p class="tl-p">This sold for <b>' + money(own.sale) + '</b> in ' + own.year +
        ', which puts its assessment at <b>' + (own.implied * 100).toFixed(1) +
        '%</b> of the sale price against a town norm of <b>' + (s.ratio * 100).toFixed(1) +
        '%</b>. That is broadly in line, so there is no catch-up hanging over it.</p>';
    } else {
      body +=
        '<p class="tl-p">No verified sale is on file for this property in the years the state publishes, so ' +
        'there is nothing to measure its assessment against directly. What follows is the pattern across the ' +
        'town.</p>';
    }

    body += '<div id="rr-town-' + esc(d) + '" class="rr-town">' +
            '<div class="tl-wait"><i class="fas fa-hourglass-half"></i>' +
            '<div>Reading recent verified sales in ' + esc(r.town || 'this town') + '...</div></div></div>';

    // town level pattern, loaded after the card is on screen
    townLag(r.county, d, s.ratio).then(function (t) {
      var host = el('rr-town-' + d);
      if (!host) return;
      if (!t) { host.innerHTML = '<div class="tl-note">Not enough recent verified sales here to read a ' +
        'town wide pattern.</div>'; return; }

      var pct = Math.round(t.staleShare * 100);
      host.innerHTML =
        '<h5 class="rr-h">How common this is in ' + esc(r.town || 'this town') + '</h5>' +
        '<div class="rr-bar"><i style="width:' + Math.min(100, pct) + '%"></i></div>' +
        '<p class="rr-say"><b>' + pct + '%</b> of the ' + t.total + ' verified sales here in the last three ' +
        'years left the buyer with an assessment well below what they paid' +
        (t.medianStale ? ', the typical one sitting at <b>' + (t.medianStale * 100).toFixed(0) +
          '%</b> of the sale price against a town norm of <b>' + (s.ratio * 100).toFixed(0) + '%</b>' : '') +
        '. ' +
        (pct >= 15
          ? 'That is a lot, and it usually means the town is overdue for a revaluation.'
          : 'That is fairly typical for New Jersey.') + '</p>' +
        (t['new'].length || t.land.length
          ? '<p class="tl-fine">Excluded from that figure: <b>' + t['new'].length + '</b> new builds still ' +
            'assessed near bare land and <b>' + t.land.length + '</b> land or teardown sale' +
            (t.land.length === 1 ? '' : 's') + '. Both look like ' +
            'lagging assessments and neither is one.</p>'
          : '') +
        (t.stale.length
          ? locked('The properties themselves',
              'Every recent sale in this town whose assessment has not caught up, with the dollar gap on each.',
              '<div class="comps-wrap"><table class="comps"><thead><tr>' +
                '<th>Address</th><th>Sold</th><th class="num">Price</th><th class="num">Assessed</th>' +
                '<th class="num">Ratio</th><th class="num">Gap</th></tr></thead><tbody>' +
              t.stale.slice(0, 12).map(function (x) {
                return '<tr><td><b>' + esc(x.a) + '</b></td><td>' + x.y + '</td>' +
                  '<td class="num">' + money(x.p) + '</td>' +
                  '<td class="num">' + money(x.av) + '</td>' +
                  '<td class="num">' + (x.r * 100).toFixed(0) + '%</td>' +
                  '<td class="num neg">+' + money(Math.round(x.p * s.ratio - x.av)) + '</td></tr>';
              }).join('') + '</tbody></table></div>')
          : '');
    });

    return toolCard('Reassessment risk', 'fa-arrow-trend-up',
      '<p class="tl-p">A sale price is public evidence of what a home is worth. The assessment does not ' +
      'automatically follow it. Where the two have drifted apart, the bill is carrying an increase that has ' +
      'not arrived yet.</p>' + body +
      '<div class="tl-fine">Measured from the New Jersey SR1A file of sales the state verified as genuine ' +
      'arm\u2019s length transactions, against the same file\u2019s town level ratio. New construction and land ' +
      'sales are classified separately, because both produce very low ratios for reasons that have nothing ' +
      'to do with a stale assessment. This is not a prediction of when an assessor will act, and no one ' +
      'outside the municipality can make that prediction.</div>');
  }

  // ══════════════════════════════════════════════
  // REVALUATION RADAR
  //
  // A revaluation is the single largest thing that can happen to a New Jersey
  // property tax bill, and almost nobody sees it coming. Assessments across a
  // whole town are reset to current market value at once. In a town that has
  // not revalued in twenty years, assessments can double or triple overnight.
  //
  // The bill does not double, because the tax RATE falls to compensate. That is
  // the part that gets lost in the panic, and the part that matters: a
  // revaluation redistributes the burden rather than raising it. Whoever has
  // been under-assessed relative to their neighbours pays more afterwards, and
  // whoever has been over-assessed pays less. Which side you land on is
  // knowable in advance, and that is what this works out.
  //

  Object.assign(window, { lagClass, townLag, ownLag, loadCountySales, toolReassessRisk });
})();

export {};
