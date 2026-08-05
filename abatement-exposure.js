/* Lazy dashboard module: abatement-exposure. Generated from the original dashboard without calculation changes. */
(function () {
  'use strict';
  // ABATEMENT EXPOSURE
  //
  // Column 3 of the NJ Abstract of Ratables: "Total Taxable Value of Partial
  // Exemptions and Abatements". The slice of a town's assessment base that has
  // been granted partial relief and therefore does not pay the full rate.
  //
  // WHY IT MATTERS TO EVERYONE ELSE
  //
  //   A municipal levy is a fixed dollar amount divided across whatever base
  //   remains. Take a slice out and the rest covers the same budget. Nobody
  //   tells the people carrying it.
  //
  // WHAT THIS MEASURES, AND WHAT IT DOES NOT
  //
  //   Included: five year improvement abatements, fire suppression system
  //   exemptions, historic site exemptions, Urban Enterprise Zone abatements.
  //   All are PARTIAL relief on property that is otherwise on the tax roll.
  //
  //   NOT included, and this is the honest limit of the tool: PILOT agreements
  //   and long term tax exemptions, which are FULL exemptions rather than
  //   partial ones and sit in a different table entirely. Nor fully exempt
  //   property, meaning churches, schools, government and non-profits.
  //
  //   That matters most in exactly the places people assume it matters. A city
  //   financing redevelopment through PILOTs will look low here, because its
  //   largest giveaways are not in this column. The tool says so rather than
  //   letting the number be read as the whole story.
  // ══════════════════════════════════════════════
  var abateData = null;

  function loadAbatements() {
    if (abateData) return Promise.resolve();
    return xfetch('/property/abatements.json', 12000).then(function (r) { return r.json(); })
      .then(function (j) { abateData = j || {}; })
      .catch(function () { abateData = { districts: {} }; });
  }

  function abateFor(r) {
    if (!abateData || !abateData.districts) return null;
    var d = String(r.pams_pin || '').slice(0, 4);
    return d ? abateData.districts[d] : null;
  }

  function toolAbatement(r) {
    var a = abateFor(r);
    if (!a) return '';
    var med = abateData.statewide_median_share || 0;
    var share = a.abated_share;
    var pct = share * 100;

    // What the abated slice costs a specific bill. If the base were whole, the
    // rate needed to raise the same levy would be lower by the abated share.
    var mine = +r.last_year_tax || 0;
    var shifted = mine ? mine * share : 0;

    var band = pct >= 2 ? 'high' : pct >= 0.5 ? 'notable' : pct >= 0.05 ? 'small' : 'negligible';
    var BAND = {
      high:       ['Substantial', 'A meaningful share of this town\u2019s base carries partial relief.'],
      notable:    ['Noticeable', 'Enough of the base is abated to move the rate slightly.'],
      small:      ['Small', 'A little of the base is abated, not enough to matter much on any one bill.'],
      negligible: ['Effectively none', 'Almost nothing in this town carries a partial abatement.']
    };
    var t = BAND[band];

    return toolCard('Abatement exposure', 'fa-scissors',
      '<p class="tl-p">A town\u2019s tax levy is a fixed dollar figure spread across whatever assessment base ' +
      'remains after relief is granted. Every dollar taken out is covered by everyone still paying. New Jersey ' +
      'publishes the number in the Abstract of Ratables and it is never shown to the people carrying it.</p>' +

      '<div class="ab-head">' +
        '<div class="ab-n ' + band + '"><b>' + (pct < 0.01 && pct > 0 ? '<0.01' : pct.toFixed(2)) +
          '%</b><span>of the base abated</span></div>' +
        '<div class="ab-say"><b>' + t[0] + '.</b> ' + t[1] + ' ' +
          money(a.abated) + ' of ' + esc(a.name) + '\u2019s ' + money(a.total_base) +
          ' assessment base carries partial relief. ' +
          (a.percentile != null
            ? 'That is the <b>' + ordinal(a.percentile) + ' percentile</b> among the towns on file.'
            : '') +
        '</div>' +
      '</div>' +

      (mine && shifted >= 1
        ? '<div class="ab-mine">' +
            '<div><b>' + money(shifted) + '</b><span>of your ' + money(mine) +
              ' bill, roughly, covers the abated share</span></div>' +
            '<p>If that base were paying at the full rate, the levy would spread across a base <b>' +
            (share / (1 - share) * 100).toFixed(2) + '% larger</b>, and the rate would fall to match.</p>' +
          '</div>'
        : '') +

      '<div class="ab-cmp">' +
        '<div class="ab-bar"><i style="width:' + Math.min(100, Math.max(1.5, (share / 0.04) * 100)) + '%"></i></div>' +
        '<div class="ab-cmp-l"><span>' + esc(a.name) + ' <b>' + pct.toFixed(2) + '%</b></span>' +
        '<span>statewide median <b>' + (med * 100).toFixed(2) + '%</b></span></div>' +
      '</div>' +

      '<div class="ab-limit">' +
        '<b><i class="fas fa-circle-info"></i> What this figure leaves out</b>' +
        '<p>This is column 3 of the Abstract: <b>partial</b> exemptions and abatements. Five year improvement ' +
        'abatements, fire suppression systems, historic sites, Urban Enterprise Zone relief. All of it sits on ' +
        'property that is otherwise on the tax roll.</p>' +
        '<p>It does <b>not</b> include PILOT agreements or long term tax exemptions, which are full exemptions ' +
        'recorded elsewhere, nor fully exempt property such as churches, schools and government land. A city ' +
        'financing redevelopment through PILOTs will look low here precisely because its largest arrangements ' +
        'are not in this column. Read this as one component of the picture, not the whole of it.</p>' +
      '</div>' +

      '<div class="tl-fine">Source: NJ Division of Taxation Abstract of Ratables, filed annually by each county ' +
      'board of taxation. The share of your own bill attributable to the abated base is arithmetic on the levy, ' +
      'not a figure the state publishes, and it assumes the levy would be unchanged if the base were whole. ' +
      'Abatements are also how most redevelopment gets financed, so a high figure is a fact about a town\u2019s ' +
      'strategy rather than evidence of anything wrong.</div>');
  }

  // ══════════════════════════════════════════════
  // TOWN PROFILE  ·  one query, two tools
  //
  // Both of the tools below need the same thing: every class 2 parcel in the
  // municipality with its land and improvement values, plus the class mix of
  // the whole town. Pulling that once and sharing it keeps a single request on
  // a free public server rather than two.
  // ══════════════════════════════════════════════
  var townProfileCache = {};


  Object.assign(window, { loadAbatements, abateFor, toolAbatement });
})();

export {};
