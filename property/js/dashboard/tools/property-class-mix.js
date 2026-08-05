/* Lazy dashboard module: property-class-mix. Generated from the original dashboard without calculation changes. */
(function () {
  'use strict';
  var CLASS_NAMES = {
    '1':  ['Vacant land', 'vac'],
    '2':  ['Residential', 'res'],
    '3A': ['Farm, regular', 'farm'],
    '3B': ['Farm, qualified', 'farm'],
    '4A': ['Commercial', 'com'],
    '4B': ['Industrial', 'ind'],
    '4C': ['Apartments', 'apt'],
    '15A':['Public property', 'exempt'],
    '15B':['Exempt', 'exempt'],
    '15C':['Cemetery', 'exempt'],
    '15D':['Exempt', 'exempt'],
    '15E':['Exempt', 'exempt'],
    '15F':['Exempt', 'exempt'],
    '5A': ['Railroad', 'other'],
    '5B': ['Railroad', 'other'],
    '6A': ['Telephone', 'other']
  };

  function toolClassMix(r) {
    var id = 'cm-' + String(r.pams_pin || 'x').replace(/[^\w]/g, '');
    townProfile(r).then(function (t) {
      var host = el(id);
      if (!host) return;
      if (!t) { host.innerHTML = '<div class="tl-note">Not enough parcel records came back to read the mix.</div>'; return; }

      // taxable classes only; exempt parcels pay nothing and belong to a
      // different question, which is tool 10
      var taxable = {};
      var totalVal = 0;
      Object.keys(t.byClass).forEach(function (c) {
        if (c.charAt(0) === '1' && c.length > 1) return;      // 15A onward, exempt
        if (c === '5A' || c === '5B') return;
        var nm = CLASS_NAMES[c];
        if (!nm) return;
        var k = nm[0];
        if (!taxable[k]) taxable[k] = { value: 0, n: 0, cls: nm[1] };
        taxable[k].value += t.byClass[c].value;
        taxable[k].n += t.byClass[c].n;
        totalVal += t.byClass[c].value;
      });
      if (!totalVal) { host.innerHTML = ''; return; }

      var rows = Object.keys(taxable).map(function (k) {
        return { name: k, value: taxable[k].value, n: taxable[k].n,
                 cls: taxable[k].cls, share: taxable[k].value / totalVal };
      }).sort(function (a, b) { return b.value - a.value; });

      var res = rows.filter(function (x) { return x.name === 'Residential'; })[0];
      var resShare = res ? res.share : 0;
      var biz = rows.filter(function (x) {
        return x.name === 'Commercial' || x.name === 'Industrial' || x.name === 'Apartments';
      }).reduce(function (a, x) { return a + x.share; }, 0);

      var verdict = resShare >= 0.90
        ? ['bad', 'Almost entirely residential',
           'Houses carry nearly the whole budget here. When municipal costs rise there is no commercial base ' +
           'to absorb any of it, so the increase lands on homeowners more or less in full. This is a ' +
           'structural condition, not a bad year.']
        : resShare >= 0.75
        ? ['mid', 'Mostly residential',
           'Homeowners carry most of the burden, with some commercial base to share it. That is typical of a ' +
           'New Jersey suburb and it is why suburban bills climb steadily.']
        : ['good', 'Meaningfully diversified',
           'A real share of this town\u2019s base is business property, which absorbs part of every increase ' +
           'before it reaches a homeowner. Towns like this hold their rates down more easily.'];

      host.innerHTML =
        '<div class="cm-bar">' + rows.map(function (x) {
          return '<i class="' + x.cls + '" style="width:' + (x.share * 100).toFixed(2) + '%" ' +
            'title="' + esc(x.name) + '  ' + (x.share * 100).toFixed(1) + '%"></i>';
        }).join('') + '</div>' +

        '<table class="cm-t"><tbody>' + rows.map(function (x) {
          return '<tr><td><span class="k ' + x.cls + '"></span>' + esc(x.name) + '</td>' +
            '<td class="n">' + (x.share * 100).toFixed(1) + '%</td>' +
            '<td class="n">' + money(x.value) + '</td>' +
            '<td class="n q">' + x.n.toLocaleString() + ' parcels</td></tr>';
        }).join('') + '</tbody></table>' +

        '<div class="cm-say ' + verdict[0] + '"><b>' + verdict[1] + '.</b> ' + verdict[2] +
          ' Business property is <b>' + (biz * 100).toFixed(1) + '%</b> of the taxable base here.</div>';
    });

    return toolCard('Who pays for this town', 'fa-chart-pie',
      '<p class="tl-p">A municipal budget is divided across everything on the tax roll. The mix decides how ' +
      'much of every increase reaches a homeowner, and it barely changes from year to year, which makes it one ' +
      'of the more reliable things you can know about a town.</p>' +
      '<div id="' + id + '"><div class="tl-wait"><i class="fas fa-hourglass-half"></i>' +
      '<div>Reading the tax roll for ' + esc(r.town || 'this town') + '...</div></div></div>' +
      '<div class="tl-fine">Measured from the statewide parcel layer, taxable classes only. Fully exempt ' +
      'property, meaning churches, schools and government land, is excluded here and is a separate question. ' +
      'Large municipalities are sampled rather than counted in full, so treat the shares as close rather than ' +
      'exact.</div>');
  }

  // ══════════════════════════════════════════════

  Object.assign(window, { toolClassMix });
})();

export {};
