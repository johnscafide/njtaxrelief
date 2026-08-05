/* Lazy dashboard module: town-profile. Generated from the original dashboard without calculation changes. */
(function () {
  'use strict';
  // ══════════════════════════════════════════════
  // TOWN PROFILE  ·  one query, two tools
  //
  // Both of the tools below need the same thing: every class 2 parcel in the
  // municipality with its land and improvement values, plus the class mix of
  // the whole town. Pulling that once and sharing it keeps a single request on
  // a free public server rather than two.
  // ══════════════════════════════════════════════
  var townProfileCache = {};

  function townProfile(r) {
    var d = String(r.pams_pin || '').slice(0, 4);
    var town = r.town, county = r.county;
    if (!town) return Promise.resolve(null);
    var key = d || (town + county);
    if (townProfileCache[key]) return Promise.resolve(townProfileCache[key]);

    var where = "MUN_NAME = '" + String(town).replace(/'/g, "''") + "'" +
                (county ? " AND COUNTY = '" + String(county).replace(/'/g, "''") + "'" : '') +
                " AND NET_VALUE > 1000";
    var p = new URLSearchParams({
      where: where,
      outFields: 'PROP_CLASS,LAND_VAL,IMPRVT_VAL,NET_VALUE,YR_CONSTR,CALC_ACRE,PCLBLOCK,PCLLOT',
      returnGeometry: 'false', resultRecordCount: '2000', f: 'json'
    });

    return xfetch(NJ_PARCEL + '?' + p, 20000).then(function (x) { return x.json(); })
      .then(function (j) {
        if (!j.features || j.features.length < 40) return null;
        var byClass = {}, resid = [], subject = null;
        var blk = String(r.block || '').replace(/^0+/, '');
        var lot = String(r.lot || '').replace(/^0+/, '');

        j.features.forEach(function (f) {
          var a = f.attributes;
          var cls = String(a.PROP_CLASS || '').trim().toUpperCase();
          var net = +a.NET_VALUE || 0;
          if (!cls || net <= 0) return;
          if (!byClass[cls]) byClass[cls] = { n: 0, value: 0 };
          byClass[cls].n++;
          byClass[cls].value += net;

          if (cls === '2') {
            var land = +a.LAND_VAL || 0, imp = +a.IMPRVT_VAL || 0;
            if (land > 0 && imp > 0) {
              var rec = { land: land, imp: imp, net: net, share: imp / (land + imp),
                          built: +a.YR_CONSTR || 0, acres: +a.CALC_ACRE || 0 };
              resid.push(rec);
              if (blk && String(a.PCLBLOCK || '').replace(/^0+/, '') === blk &&
                  String(a.PCLLOT || '').replace(/^0+/, '') === lot) subject = rec;
            }
          }
        });

        if (resid.length < 25) return null;
        var out = {
          sampled: j.features.length,
          byClass: byClass,
          resid: resid,
          subject: subject,
          medShare: median(resid.map(function (x) { return x.share; })),
          medLand: median(resid.map(function (x) { return x.land; })),
          medImp: median(resid.map(function (x) { return x.imp; }))
        };
        townProfileCache[key] = out;
        return out;
      }).catch(function () { return null; });
  }

  // ══════════════════════════════════════════════
  // 3 · IMPROVEMENT RATIO ANOMALY
  //
  // Every assessment is two numbers: the land and the building on it. Land
  // value is set by location and lot size and is very hard to argue with,
  // because the lot next door is worth what your lot is worth. The improvement
  // figure is the assessor's judgment about a structure, and judgment is what
  // an appeal actually contests.
  //
  // So a property whose IMPROVEMENT share runs well above comparable homes in
  // the same town is carrying its excess in the one component that can be
  // argued, which makes it the most winnable kind of case. A property whose
  // excess is all in the land is a much harder fight.
  //
  // This is not a market value estimate. Both sides of the comparison are
  // assessments from the same roll, so no valuation model is involved and none
  // of its error comes with it.
  // ══════════════════════════════════════════════

  Object.assign(window, { townProfile });
})();

export {};
