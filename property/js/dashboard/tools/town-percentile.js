/* Lazy dashboard module: town-percentile. Generated from the original dashboard without calculation changes. */
(function () {
  'use strict';
  function toolPercentile() {
    var homes = rows.filter(function (r) { return r.kind === 'home' && r.last_year_tax > 0; });
    if (!homes.length) return '';
    return toolCard('Where you sit in your town', 'fa-ranking-star',
      '<div id="pct-body"><div class="tl-wait"><div class="pl-spin" style="margin:0;"></div>' +
      '<div>Reading the tax distribution for your town...</div></div></div>');
  }

  function paintPercentile() {
    var host = el('pct-body');
    if (!host) return;
    var homes = rows.filter(function (r) { return r.kind === 'home' && r.last_year_tax > 0; });
    if (!homes.length) return;

    Promise.all(homes.slice(0, 3).map(function (r) {
      var where = "MUN_NAME = '" + String(r.town || '').replace(/'/g, "''") + "'" +
                  " AND PROP_CLASS = '2' AND LAST_YR_TX > 100";
      var p = new URLSearchParams({ where: where, outFields: 'LAST_YR_TX',
        returnGeometry: 'false', resultRecordCount: '2000', f: 'json' });
      return xfetch(NJ_PARCEL + '?' + p, 18000).then(function (x) { return x.json(); })
        .then(function (d) {
          var t = (d.features || []).map(function (f) { return +f.attributes.LAST_YR_TX; })
                    .filter(function (v) { return v > 100 && v < 200000; }).sort(function (a, b) { return a - b; });
          if (t.length < 30) return { r: r, ok: false };
          var below = 0;
          for (var i = 0; i < t.length; i++) if (t[i] < r.last_year_tax) below++;
          return { r: r, ok: true, pct: Math.round(below / t.length * 100), n: t.length, med: median(t) };
        }).catch(function () { return { r: r, ok: false }; });
    })).then(function (res) {
      host.innerHTML = res.map(function (o) {
        if (!o.ok) return '<div class="tl-note">Not enough data for ' + esc(o.r.town || 'that town') + ' yet.</div>';
        var hot = o.pct >= 75;
        return '<div class="pct-row">' +
          '<div class="pct-top"><b>' + esc(o.r.address) + '</b>' +
            '<span class="pct-badge ' + (hot ? 'hot' : 'ok') + '">' + o.pct + 'th percentile</span></div>' +
          '<div class="pct-bar"><i style="left:' + Math.min(97, Math.max(1, o.pct)) + '%"></i></div>' +
          '<div class="pct-legend"><span>lowest in ' + esc(o.r.town) + '</span><span>highest</span></div>' +
          '<div class="pct-say">You pay <b>' + money(o.r.last_year_tax) + '</b>. The median home here pays <b>' +
            money(o.med) + '</b>. That puts you above <b>' + o.pct + '%</b> of the ' + o.n.toLocaleString() +
            ' homes in town.' +
            (hot ? ' <b style="color:var(--red)">That is high enough to be worth challenging.</b>' : '') +
          '</div>' +
          (hot ? '<button class="tl-btn" onclick="dbAsk(\'appeal\')">Have an agent review this</button>' : '') +
        '</div>';
      }).join('');
    });
  }

  // ══════════════════════════════════════════════
  // 4 · REBATE STACK
  // ══════════════════════════════════════════════

  Object.assign(window, { toolPercentile, paintPercentile });
})();

export {};
