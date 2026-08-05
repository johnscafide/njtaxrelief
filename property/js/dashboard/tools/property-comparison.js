/* Lazy dashboard module: property-comparison. Generated from the original dashboard without calculation changes. */
(function () {
  'use strict';
  function toolCompare() {
    var opts = Object.keys(ratios || {}).sort().map(function (k) {
      return '<option value="' + esc(k) + '">' + esc(k.replace(/ \(/, ', ').replace(/\)$/, '')) + '</option>';
    }).join('');
    var mine = rows.length ? rows[0] : null;
    return toolCard('Compare towns', 'fa-scale-balanced',
      '<div class="cmp-pick">' +
        '<select id="cmp-a"><option value="">Town A...</option>' + opts + '</select>' +
        '<select id="cmp-b"><option value="">Town B...</option>' + opts + '</select>' +
        '<select id="cmp-c"><option value="">Town C, optional...</option>' + opts + '</select>' +
        '<button class="tl-btn" onclick="dbCompare()">Compare</button>' +
      '</div>' +
      '<div id="cmp-out">' +
        (mine ? '<div class="tl-note">Tip: start with <b>' + esc(mine.town || '') + '</b>, where you already own, ' +
          'then add the towns you are considering.</div>' : '') +
      '</div>');
  }

  window.dbCompare = function () {
    var picks = ['cmp-a', 'cmp-b', 'cmp-c'].map(function (id) { return (el(id) || {}).value; })
      .filter(function (v) { return v; });
    var out = el('cmp-out');
    if (picks.length < 2) { out.innerHTML = '<div class="tl-note">Pick at least two towns.</div>'; return; }
    out.innerHTML = '<div class="tl-wait"><div class="pl-spin" style="margin:0;"></div><div>Measuring each town...</div></div>';

    Promise.all(picks.map(function (key) {
      var parts = key.replace(/\)$/, '').split(' (');
      var town = parts[0], county = parts[1] || '';
      var R = ratioFor(town, county);
      var where = "MUN_NAME = '" + town.replace(/'/g, "''") + "' AND COUNTY = '" + county.replace(/'/g, "''") +
                  "' AND PROP_CLASS = '2' AND NET_VALUE > 10000 AND LAST_YR_TX > 100";
      var p = new URLSearchParams({ where: where, outFields: 'NET_VALUE,LAST_YR_TX',
        returnGeometry: 'false', resultRecordCount: '1200', f: 'json' });
      return xfetch(NJ_PARCEL + '?' + p, 18000).then(function (x) { return x.json(); })
        .then(function (d) {
          var f = d.features || [];
          var assessed = f.map(function (x) { return +x.attributes.NET_VALUE; });
          var taxes = f.map(function (x) { return +x.attributes.LAST_YR_TX; });
          var eff = [];
          if (R) f.forEach(function (x) {
            var mv = (+x.attributes.NET_VALUE) / R.ratio;
            var e = (+x.attributes.LAST_YR_TX) / mv;
            if (isFinite(e) && e > 0.002 && e < 0.10) eff.push(e);
          });
          return { town: town, county: county, ratio: R, n: f.length,
                   medAssessed: median(assessed), medTax: median(taxes), eff: median(eff) };
        }).catch(function () { return { town: town, county: county, ratio: R, n: 0 }; });
    })).then(function (res) {
      var best = res.filter(function (r) { return r.eff; }).sort(function (a, b) { return a.eff - b.eff; })[0];
      out.innerHTML =
        '<div class="cmp-wrap"><table class="cmp"><thead><tr><th>Town</th>' +
        res.map(function (r) { return '<th>' + esc(r.town) + (best && r.town === best.town ? ' <span class="cmp-best">lowest</span>' : '') + '</th>'; }).join('') +
        '</tr></thead><tbody>' +
        cmpRow('Effective tax rate', res, function (r) { return r.eff ? (r.eff * 100).toFixed(2) + '%' : '-'; }) +
        cmpRow('Equalization ratio', res, function (r) { return r.ratio ? (r.ratio.ratio * 100).toFixed(2) + '%' : '-'; }) +
        cmpRow('Median assessment', res, function (r) { return r.medAssessed ? money(r.medAssessed) : '-'; }) +
        cmpRow('Median tax bill', res, function (r) { return r.medTax ? money(r.medTax) : '-'; }) +
        cmpRow('Tax on a $400k home', res, function (r) { return r.eff ? money(400000 * r.eff) : '-'; }) +
        cmpRow('Homes measured', res, function (r) { return r.n ? r.n.toLocaleString() : '-'; }) +
        '</tbody></table></div>' +
        (best ? '<div class="tl-good"><i class="fas fa-circle-check"></i> On a $400,000 home, <b>' + esc(best.town) +
          '</b> is the cheapest of these at about <b>' + money(400000 * best.eff) + '</b> a year.</div>' : '') +
        '<div class="tl-fine">Effective rates are measured live from each town\u2019s own parcels, not from a rate table. ' +
        'They will not match any single home exactly.</div>';
    });
  };
  function cmpRow(label, res, fn) {
    return '<tr><td class="cmp-l">' + label + '</td>' +
      res.map(function (r) { return '<td>' + fn(r) + '</td>'; }).join('') + '</tr>';
  }

  // ══════════════════════════════════════════════
  // 8 · TRUE COST OF OWNERSHIP  ·  sponsored
  // ══════════════════════════════════════════════

  Object.assign(window, { toolCompare, cmpRow });
})();

export {};
