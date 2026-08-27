/* Lazy dashboard module: appeal-packet. Generated from the original dashboard without calculation changes. */
(function () {
  'use strict';
  // APPEAL PACKET
  //
  // Everything the site knows about one property, assembled in the order a
  // county board hears it and printed as a document someone can attach to a
  // filing.
  //
  // WHAT THIS IS NOT
  //
  //   It is not a completed Form A-1, and it does not file anything. New
  //   Jersey requires the form itself, the filing fee, and service on the
  //   assessor and clerk. What it removes is the two hours somebody otherwise
  //   spends transcribing block and lot numbers, looking up the ratio, finding
  //   comparable sales and doing the Chapter 123 arithmetic by hand.
  //
  //   Every figure carries its source, because a number an attorney cannot
  //   attribute is a number they cannot use.
  //
  // THE ORDER MATTERS
  //
  //   Subject property, then the evidence, then the statutory test, then the
  //   argument. That is the order a board follows, and a packet that arrives
  //   in a different order makes the reader do work.
  // ══════════════════════════════════════════════

  function packetComps(r, limit) {
    // County-board evidence is market-value evidence, not assessment evidence.
    // The SR-1A export contains only sales the State marked usable (arm's length)
    // by default; keep an explicit NU guard in case a future export includes
    // non-usable records. Rank only on timing and physical similarity.
    var d = String(r.pams_pin || '').slice(0, 4);
    return countySales(r.county).then(function (all) {
      if (!all || !all.length) return [];
      var TY = new Date().getFullYear();
      var valuationYear = TY - 1;
      return all.filter(function (x) {
        var month = +x.m;
        var ageMonths = (valuationYear - (+x.y)) * 12 + (10 - month);
        return x.d === d && String(x.c).trim() === '2' && x.p > 40000 && !x.nu &&
               month >= 1 && month <= 12 && ageMonths >= 1 && ageMonths <= 36 &&
               !(r.block && String(x.b || '').replace(/^0+/, '') === String(r.block).replace(/^0+/, '') &&
                 String(x.l || '').replace(/^0+/, '') === String(r.lot || '').replace(/^0+/, ''));
      }).map(function (x) {
        var ageMonths = (valuationYear - (+x.y)) * 12 + (10 - (+x.m));
        var w = Math.pow(0.94, ageMonths);
        var fit = ['SR-1A usable sale', ageMonths + ' mo before 10/1/' + valuationYear];
        if (r._sqft && x.sf) {
          var sizePct = Math.round(Math.abs(x.sf - r._sqft) / Math.max(r._sqft, 1) * 100);
          w *= 1 / (1 + Math.pow(Math.abs(x.sf - r._sqft) / Math.max(r._sqft, 400), 2) * 4);
          fit.push(sizePct + '% size gap');
        }
        if (r._built && x.yb) {
          var vintageGap = Math.abs(x.yb - r._built);
          w *= 1 / (1 + Math.pow(vintageGap / 20, 2));
          fit.push(vintageGap + ' yr vintage gap');
        }
        return { a: x.a, b: x.b, l: x.l, p: x.p, y: x.y, m: x.m, sf: x.sf,
                 yb: x.yb, ppsf: x.ppsf, ageMonths: ageMonths, fit: fit.join('; '), w: w };
      }).sort(function (a, b) { return b.w - a.w; }).slice(0, limit || 5);
    }).catch(function () { return []; });
  }

  function toolAppealPacket(r) {
    var c = chapter123(r);
    var id = 'pk-' + String(r.pams_pin || 'x').replace(/[^\w]/g, '');

    var ready = !!(c && c.testable);
    return toolCard('Appeal packet', 'fa-folder-open',
      '<p class="tl-p">Everything on this page, assembled in the order a county board hears it and printed as ' +
      'a document you can attach to a filing. Subject property, then the evidence, then the statutory test, ' +
      'then the argument.</p>' +

      (ready
        ? (c.hasCase
            ? '<div class="pk-ok"><i class="fas fa-circle-check"></i><div>' +
              'This property has a testable case. The packet will show the assessment sitting <b>' +
              money(c.over) + '</b> above the Chapter 123 limit' +
              (c.saving ? ', worth about <b>' + money(c.saving) + ' a year</b>' : '') + '.</div></div>'
            : '<div class="pk-warn"><i class="fas fa-circle-info"></i><div>' +
              'On the evidence available this assessment sits <b>inside</b> the cushion the state allows. ' +
              'The packet will still generate, and it is worth having: knowing why a case fails is how you ' +
              'decide not to file, and that decision saves a client the fee.</div></div>')
        : '<div class="pk-warn"><i class="fas fa-circle-info"></i><div>' +
          'The Chapter 123 test needs an independent market value, which means either this property\u2019s own ' +
          'recent sale or comparable sales from the full record. The packet will assemble what exists and say ' +
          'plainly where the gap is.</div></div>') +

      '<div class="pk-inc"><b>What it contains</b><ul>' +
        '<li>Subject property: block, lot, qualifier, PAMS PIN, class, and the current assessment split ' +
          'between land and improvement</li>' +
        '<li>Up to five comparable sales the State of New Jersey verified as usable arm\u2019s length transactions, ' +
          'ranked by timing and available physical similarity rather than comparable assessments</li>' +
        '<li>The municipal equalization ratio, both the published Director\u2019s Ratio and the ratio measured ' +
          'from verified sales, with the year each applies to</li>' +
        '<li>The Chapter 123 calculation set out line by line</li>' +
        '<li>The town\u2019s coefficient of deviation against the professional standard</li>' +
        '<li>County board outcomes for the last ten years</li>' +
        '<li>A source note for every figure</li>' +
      '</ul></div>' +

      '<div class="pk-acts">' +
        '<button class="tl-btn pk-go" onclick="pkBuild(\'' + esc(r.pams_pin) + '\')">' +
          '<i class="fas fa-print"></i> Generate packet</button>' +
        '<button class="tl-btn" onclick="pkCSV(\'' + esc(r.pams_pin) + '\')">' +
          '<i class="fas fa-file-csv"></i> Comparable candidates as CSV</button>' +
      '</div>' +
      '<div id="' + id + '"></div>' +

      '<div class="tl-fine">This is a working document, not a filed pleading. New Jersey requires Form A-1, ' +
      'the filing fee, and service on the assessor and municipal clerk, none of which this does. Current State ' +
      'guidance uses April 1 for most counties, May 1 where a revaluation or reassessment was implemented, and ' +
      'January 15 under the alternate assessment calendar in Burlington, Gloucester and Monmouth Counties. ' +
      'Verify the current county instructions before filing. Comparable sales come from the State SR-1A file ' +
      'and are verified usable arm\u2019s length transactions, but public records cannot see condition or interior ' +
      'finish, so every comparable needs a human look before it goes in front of a board.</div>');
  }

  window.pkCSV = function (pin) {
    var r = null;
    for (var i = 0; i < rows.length; i++) if (rows[i].pams_pin === pin) r = rows[i];
    if (!r) return;
    packetComps(r, 25).then(function (cs) {
      if (!cs.length) { toast('No verified pre-valuation comparable sales on file for this town'); return; }
      var head = ['Address','Block','Lot','Sale_Year','Sale_Month','Sale_Price',
                  'Living_SqFt','Year_Built','Price_Per_SqFt','Months_Before_Valuation','Evidence_Fit'];
      var lines = [head.join(',')].concat(cs.map(function (x) {
        return [x.a, x.b, x.l, x.y, x.m || '', x.p, x.sf || '', x.yb || '',
                x.ppsf || '', x.ageMonths, x.fit
        ].map(function (v) {
          v = v == null ? '' : String(v);
          return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
        }).join(',');
      }));
      var b = new Blob([lines.join('\n')], { type: 'text/csv' }), u = URL.createObjectURL(b);
      var a = document.createElement('a');
      a.href = u;
      a.download = 'comparable-candidates-' + String(r.address).toLowerCase().replace(/[^\w]+/g, '-') + '.csv';
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(u);
    });
  };

  window.pkBuild = function (pin) {
    var r = null;
    for (var i = 0; i < rows.length; i++) if (rows[i].pams_pin === pin) r = rows[i];
    if (!r) return;
    var id = 'pk-' + String(pin).replace(/[^\w]/g, '');
    var host = el(id);
    if (host) host.innerHTML = '<div class="tl-wait"><div class="pl-spin" style="margin:0"></div>' +
      '<div>Assembling comparables and sources...</div></div>';

    packetComps(r, 5).then(function (cs) {
      if (host) host.innerHTML = '';
      var w = window.open('', '_blank');
      if (!w) { toast('Allow popups to generate the packet'); return; }
      w.document.write(packetHTML(r, cs));
      w.document.close();
      setTimeout(function () { w.print(); }, 500);
      if (typeof gtag === 'function') gtag('event', 'appeal_packet', { town: r.town });
    });
  };

  function packetHTML(r, cs) {
    var c = chapter123(r), s = sr1aFor(r), u = uniFor(r), a = appealFor(r);
    var off = ratioFor(r.town, r.county);
    var today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    var TY = new Date().getFullYear();
    var valuationYear = TY - 1;

    function row(k, v, note) {
      return '<tr><th>' + k + '</th><td>' + (v == null || v === '' ? '<span class="na">not on file</span>' : v) +
        (note ? '<em>' + note + '</em>' : '') + '</td></tr>';
    }

    var compRows = cs.map(function (x) {
      return '<tr><td>' + esc(x.a) + '</td><td>' + esc(x.b) + '/' + esc(x.l) + '</td>' +
        '<td>' + (x.m ? String(x.m).padStart(2, '0') + '/' : '') + x.y + '</td>' +
        '<td class="n">' + money(x.p) + '</td>' +
        '<td class="n">' + (x.sf ? x.sf.toLocaleString() : '\u2014') + '</td>' +
        '<td class="n">' + (x.ppsf ? '$' + x.ppsf : '\u2014') + '</td>' +
        '<td class="n">' + (x.yb || '\u2014') + '</td>' +
        '<td>' + esc(x.fit || '') + '</td></tr>';
    }).join('');

    var medPpsf = null, sized = cs.filter(function (x) { return x.ppsf; });
    if (sized.length >= 3) medPpsf = median(sized.map(function (x) { return x.ppsf; }));

    return '<html><head><meta charset="utf-8"><title>Appeal packet, ' + esc(r.address) + '</title><style>' +
      '@page{margin:20mm 16mm}' +
      'body{font-family:Georgia,"Times New Roman",serif;color:#10182b;line-height:1.5;font-size:11pt;margin:0}' +
      'h1{font-size:17pt;margin:0 0 4px;letter-spacing:-.01em}' +
      '.sub{font-size:10pt;color:#555;margin-bottom:4px}' +
      '.rule{border-bottom:2px solid #10182b;margin:10px 0 18px}' +
      'h2{font-size:11pt;text-transform:uppercase;letter-spacing:.09em;margin:22px 0 8px;' +
        'border-bottom:1px solid #bbb;padding-bottom:4px}' +
      'table{width:100%;border-collapse:collapse;font-size:10pt;margin-bottom:6px}' +
      'th{text-align:left;padding:5px 10px 5px 0;font-weight:normal;color:#555;width:38%;vertical-align:top}' +
      'td{padding:5px 0;vertical-align:top}' +
      'td em{display:block;font-style:normal;font-size:8.5pt;color:#777;margin-top:1px}' +
      '.na{color:#999;font-style:italic}' +
      '.ct th{background:#10182b;color:#fff;padding:6px 8px;width:auto;font-size:8.5pt;' +
        'text-transform:uppercase;letter-spacing:.05em}' +
      '.ct td{padding:6px 8px;border-bottom:1px solid #ddd;font-size:9.5pt}' +
      '.ct td.n,.ct th.n{text-align:right}' +
      '.calc{background:#f4f6fa;padding:14px 18px;border-left:3px solid #10182b;margin:10px 0}' +
      '.calc div{display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #dde}' +
      '.calc div:last-child{border-bottom:none;font-weight:bold;border-top:2px solid #10182b;margin-top:4px;padding-top:8px}' +
      '.arg{font-size:10.5pt;line-height:1.65}' +
      '.arg p{margin:0 0 10px}' +
      '.src{font-size:8.5pt;color:#666;line-height:1.55;margin-top:22px;border-top:1px solid #bbb;padding-top:10px}' +
      '.warn{background:#fdf1ef;border-left:3px solid #c0342b;padding:10px 14px;font-size:9.5pt;margin:12px 0}' +
      '</style></head><body>' +

      '<h1>Property tax appeal packet</h1>' +
      '<div class="sub">' + esc(r.address) + ', ' + esc(r.town || '') +
        (r.county ? ', ' + esc(titleCase(r.county)) + ' County, New Jersey' : '') + '</div>' +
      '<div class="sub">Prepared ' + today + ' for tax year ' + TY + '</div>' +
      '<div class="rule"></div>' +

      '<h2>1. Subject property</h2><table>' +
        row('Address', esc(r.address)) +
        row('Municipality', esc(r.town || '')) +
        row('Block / Lot' + (r.qualifier ? ' / Qualifier' : ''),
            esc(r.block || '') + ' / ' + esc(r.lot || '') + (r.qualifier ? ' / ' + esc(r.qualifier) : '')) +
        row('State parcel identifier', esc(r.pams_pin || '')) +
        row('Property class', '2, residential') +
        row('Living space', r._sqft ? r._sqft.toLocaleString() + ' sq ft' : null,
            r._sqft ? 'from the state verified sales file' : null) +
        row('Year built', r._built || null) +
        row('Current assessment', money(r.assessed || 0)) +
        row('Prior year tax', money(r.last_year_tax || 0)) +
        row('Effective rate', r.effective_rate ? (+r.effective_rate).toFixed(3) + '%' : null) +
        (r._lastSale ? row('Subject\u2019s own last sale', money(r._lastSale) + ' in ' + r._lastSaleYear,
            'verified arm\u2019s length transaction; the strongest single item of evidence available') : '') +
      '</table>' +

      '<h2>2. Municipal equalization</h2><table>' +
        row('Director\u2019s Ratio', off ? (off.ratio * 100).toFixed(2) + '%' : null,
            off ? 'certified for tax year ' + off.year + ', published by the Division of Taxation' : null) +
        row('Ratio measured from verified sales', s ? (s.ratio * 100).toFixed(2) + '%' : null,
            s ? 'median of ' + s.n + ' arm\u2019s length sales the state confirmed, ' +
                (s.years ? s.years[0] + ' to ' + s.years[1] : 'recent years') : null) +
        row('Coefficient of deviation', u ? u.coefficient : null,
            u ? 'residential, ' + u.latest_year + '. The professional standard is 15 or below; this town ' +
                'ranks in the ' + ordinal(u.percentile) + ' percentile statewide' : null) +
        row('Median price per square foot', (medPpsf ? '$' + Math.round(medPpsf) : (s && s.ppsf ? '$' + s.ppsf : null)),
            'from the comparable sales listed below') +
      '</table>' +
      (u && u.coefficient > 15
        ? '<div class="warn"><b>Note on uniformity.</b> A coefficient of ' + u.coefficient + ' exceeds the ' +
          'standard of 15, indicating that assessments in this municipality are applied unevenly. That is a ' +
          'condition of the roll itself and applies independently of the subject property.</div>'
        : '') +

      '<h2>3. Comparable sales</h2>' +
      (cs.length
        ? '<table class="ct"><thead><tr><th>Address</th><th>Block/Lot</th><th>Sold</th>' +
          '<th class="n">Price</th><th class="n">Sq ft</th><th class="n">$/sq ft</th>' +
          '<th class="n">Built</th><th>Evidence fit</th></tr></thead><tbody>' +
          compRows + '</tbody></table>' +
          '<div class="src" style="margin-top:6px;border:none;padding:0">New Jersey\u2019s current A-1 instructions ' +
          'permit no more than five comparable sales and state that comparable sales are acceptable market-value ' +
          'evidence while comparable assessments are not. This packet therefore never ranks or displays a comp ' +
          'because its assessment resembles the subject. All candidates are same-district Class 2 SR-1A sales ' +
          'the State marked usable, are limited to the 36 months before the October 1, ' + valuationYear +
          ' valuation date, and are ranked only by deed timing plus available living-space/year-built similarity. ' +
          'The compact evidence file preserves deed month, not day, so October ' + valuationYear +
          ' sales are conservatively excluded rather than risk using a post-valuation transfer. Human review of ' +
          'condition, location and other material differences remains required.</div>'
        : '<p class="na">No verified pre-valuation comparable sales are on file for this municipality in the governed period.</p>') +

      '<h2>4. Chapter 123 calculation</h2>' +
      (c && c.testable
        ? '<div class="calc">' +
            '<div><span>Market value indicated by the evidence</span><b>' + money(Math.round(c.indep)) + '</b></div>' +
            '<div><span>Municipal equalization ratio</span><b>' + (c.ratio * 100).toFixed(2) + '%</b></div>' +
            '<div><span>Supported assessment (value \u00d7 ratio)</span><b>' + money(Math.round(c.fair)) + '</b></div>' +
            '<div><span>Statutory upper limit (\u00d7 1.15)</span><b>' + money(Math.round(c.limit)) + '</b></div>' +
            '<div><span>Assessment currently on the roll</span><b>' + money(r.assessed || 0) + '</b></div>' +
            '<div><span>' + (c.hasCase ? 'Amount above the statutory limit' : 'Amount below the statutory limit') +
              '</span><b>' + money(Math.abs(Math.round(c.over))) + '</b></div>' +
          '</div>' +
          '<p class="arg">' + (c.hasCase
            ? 'The assessment exceeds the Chapter 123 upper limit. Under N.J.S.A. 54:51A-6 the county board ' +
              'is directed to reduce an assessment that exceeds true market value multiplied by the average ' +
              'ratio and the statutory 15 percent margin.' +
              (c.saving ? ' At the effective rate shown, a reduction to the supported assessment would reduce ' +
                'the annual obligation by approximately ' + money(Math.round(c.saving)) + '.' : '')
            : 'The assessment falls within the 15 percent margin the statute affords the municipality. On this ' +
              'evidence the board would be required to affirm, and a filing is not advisable.') + '</p>'
        : '<p class="na">The Chapter 123 test requires an independent determination of market value. Neither a ' +
          'recent arm\u2019s length sale of the subject nor a sufficient set of comparables was available at the ' +
          'time this packet was generated.</p>') +

      '<h2>5. County board history</h2>' +
      (a
        ? '<table>' +
            row('Appeals filed', a.latest.total.toLocaleString() + ' in ' + a.latest_year) +
            row('Reduced', a.latest.wins.toLocaleString() + ' (' + a.latest.win_rate_filed + '% of those filed)') +
            row('Of those decided on the merits', a.latest.win_rate_decided != null
                ? a.latest.win_rate_decided + '%' : null,
                'excluding withdrawals and dismissals') +
            row('Residential appeals', a.latest.residential.toLocaleString()) +
            row('Ten year trend', a.trend != null
                ? (a.trend > 0 ? 'up ' : 'down ') + Math.abs(a.trend) + ' percentage points' : null) +
          '</table>'
        : '<p class="na">County outcome data is not available for this jurisdiction.</p>') +

      '<div class="src"><b>Sources.</b> Assessment and parcel data: New Jersey Office of Information ' +
      'Technology, Office of GIS statewide parcel layer, joined to Division of Taxation MOD-IV records. ' +
      'Comparable sales: Division of Taxation SR-1A verified sales file. Equalization ratio: Table of ' +
      'Equalized Valuations, certified by the Director of the Division of Taxation. Coefficient of deviation: ' +
      'Measures of Property Assessment Uniformity in New Jersey Taxing Districts. Appeal outcomes: Summary of ' +
      'Property Tax Appeals, filed under N.J.S.A. 54:3-5.1. Owner names are redacted at source under ' +
      'P.L. 2020, c. 125.<br><br>' +
      '<b>Comparable-evidence boundary.</b> The State\u2019s A-1 instructions require market-value proof as of October 1 ' +
      'of the pretax year, limit submitted comparable sales to five, and expressly reject comparable assessments ' +
      'as evidence of value. The candidate ranking above follows that boundary; it is not an appraisal adjustment grid.<br><br>' +
      '<b>Limitations.</b> Public assessment records do not record property condition, interior finish, ' +
      'renovation history or deferred maintenance, and any of those may explain a difference between the ' +
      'subject and a comparable. This document is a working analysis prepared to support professional ' +
      'judgment. It is not a completed appeal, not an appraisal, and not legal advice. Filing requires Form ' +
      'A-1, the applicable fee, and service on the municipal assessor and clerk. Verify the current filing ' +
      'calendar with the applicable County Board before submission.<br><br>' +
      'Generated by Watchdog Index at watchdogindex.com.</div>' +

      '</body></html>';
  }

  // ══════════════════════════════════════════════
  // 18 · RELOCATION COMPARISON
  //
  // The same money buys a very different tax bill depending on which side of a
  // town line it lands. Nobody compares this before they move, because the
  // figure a listing shows is the seller's bill on that specific house, not
  // what the town charges for a given amount of value.
  //
  // Everything here runs on data already loaded. No queries.
  // ══════════════════════════════════════════════

  Object.assign(window, { packetComps, toolAppealPacket, packetHTML });
})();

export {};
