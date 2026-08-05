/* Statewide exempt-property and PILOT exposure, built from 2025/2026 NJ sources. */
(function () {
  'use strict';
  var exposureData = null;
  var exposurePromise = null;

  function loadExemptPilot() {
    if (exposureData) return Promise.resolve(exposureData);
    if (!exposurePromise) {
      exposurePromise = xfetch('/property/data/exempt-pilot.json', 12000).then(function (r) {
        if (!r.ok) throw new Error('exempt/PILOT data unavailable');
        return r.json();
      }).then(function (data) {
        exposureData = data || { municipalities: {} };
        return exposureData;
      }).catch(function () {
        exposureData = { municipalities: {}, statewide: {} };
        return exposureData;
      });
    }
    return exposurePromise;
  }

  function exemptPilotFor(r) {
    if (!exposureData || !exposureData.municipalities) return null;
    var code = String((r && r.pams_pin) || '').slice(0, 4);
    return code ? exposureData.municipalities[code] || null : null;
  }

  function pct(value, digits) {
    return value == null ? '—' : (value * 100).toFixed(digits == null ? 1 : digits) + '%';
  }

  function exposureBand(value) {
    value = +value || 0;
    if (value >= .30) return ['high', 'Large exempt footprint'];
    if (value >= .15) return ['mid', 'Meaningful exempt footprint'];
    return ['low', 'Smaller exempt footprint'];
  }

  function toolExemptPilot(r) {
    var d = exemptPilotFor(r);
    if (!d) return toolCard('Exempt property & PILOT exposure', 'fa-landmark',
      '<div class="tl-note">Statewide exposure data is not available for this municipality yet.</div>');
    var band = exposureBand(d.exempt_share);
    var statewide = (exposureData && exposureData.statewide) || {};
    var pilotText = d.pilot_count
      ? '<b>' + d.pilot_count.toLocaleString() + ' PILOT agreement' + (d.pilot_count === 1 ? '' : 's') + '</b> with ' +
        money(d.pilot_assessed_value) + ' in PILOT assessed value. DCA estimates a municipal subsidy of <b>' +
        money(d.municipal_subsidy) + '</b>, equal to ' + pct(d.subsidy_budget_share, 1) + ' of the municipal budget.'
      : '<b>No PILOT agreements are reported</b> for this municipality in DCA\'s 2026 database.';

    return toolCard('Exempt property & PILOT exposure', 'fa-landmark',
      '<p class="tl-p">Taxable property is only part of a municipality\'s assessed footprint. This view puts fully ' +
      'exempt value, long-term PILOT agreements and partial abatements on the same page without treating them as the same thing.</p>' +
      '<div class="xp-kpis">' +
        '<div class="' + band[0] + '"><span>Fully exempt share</span><b>' + pct(d.exempt_share, 1) + '</b><small>' +
          money(d.exempt_value) + ' of assessed footprint</small></div>' +
        '<div><span>PILOT value share</span><b>' + pct(d.pilot_value_share, 1) + '</b><small>' + d.pilot_count + ' reported agreements</small></div>' +
        '<div><span>Partial relief</span><b>' + pct(d.partial_relief_share, 2) + '</b><small>' + money(d.partial_exemptions_abatements) + ' in Abstract col. 3</small></div>' +
      '</div>' +
      '<div class="xp-read"><b>' + band[1] + '.</b> ' + pct(d.exempt_share, 1) + ' of all assessed value reported to DCA is outside the ordinary taxable land-and-improvement base. ' +
        (d.exempt_percentile != null ? 'That is around the <b>' + d.exempt_percentile + 'th percentile</b> statewide. ' : '') +
        'The statewide median is ' + pct(statewide.median_exempt_share, 1) + '.</div>' +
      '<div class="xp-pilot"><i class="fas fa-building-columns"></i><p>' + pilotText + '</p></div>' +
      '<div class="xp-split"><span><b>' + money(d.exempt_nonpilot_value) + '</b>Exempt value outside reported PILOT assessed value</span>' +
        '<span><b>' + money(d.pilot_billing) + '</b>Annual PILOT billing reported by DCA</span>' +
        '<span><b>' + money(d.tax_if_conventional) + '</b>Tax if PILOT value were billed conventionally</span></div>' +
      '<div class="tl-fine">Sources: NJ Division of Taxation 2025 Abstract of Ratables and NJ DCA/DLGS 2026 PILOT Database and Viewer. ' +
      'The exempt share is derived by subtracting Abstract taxable land/improvement value from DCA assessed valuation including exempt property. ' +
      'Exempt property includes public, charitable and other legally exempt property; it is not synonymous with a subsidy or PILOT. DCA\'s municipal-subsidy estimate is shown as published.</div>');
  }

  Object.assign(window, { loadExemptPilot: loadExemptPilot, exemptPilotFor: exemptPilotFor, toolExemptPilot: toolExemptPilot });
})();

export {};
