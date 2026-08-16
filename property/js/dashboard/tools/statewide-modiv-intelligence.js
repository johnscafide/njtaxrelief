const INTELLIGENCE_URL = '/property/data/statewide-intelligence.json?v=20260807h';

const intelligence = await fetch(INTELLIGENCE_URL).then(function (response) {
  if (!response.ok) throw new Error('Statewide intelligence unavailable: ' + response.status);
  return response.json();
});

const SIGNALS = [
  ['median_assessed_value', 'Median assessment', 'fa-house', 'pro'],
  ['median_annual_tax', 'Median reported tax', 'fa-receipt', 'pro'],
  ['median_land_share_pct', 'Median land share', 'fa-layer-group', 'pro'],
  ['residential_parcel_share_pct', 'Residential parcels', 'fa-house-chimney', 'pro'],
  ['median_building_age', 'Median building age', 'fa-calendar', 'pro'],
  ['median_parcel_acres', 'Median parcel size', 'fa-ruler-combined', 'pro'],
  ['assessment_dispersion_iqr_pct', 'Assessment dispersion', 'fa-arrows-left-right', 'pro_plus'],
  ['median_assessment_change_pct', 'Median assessment change', 'fa-arrow-trend-up', 'pro_plus'],
  ['assessment_growth_positive_share_pct', 'Assessments rising', 'fa-arrow-trend-up', 'pro_plus'],
  ['assessment_change_dispersion_pct', 'Assessment-change spread', 'fa-wave-square', 'pro_plus'],
  ['assessment_jump_share_pct', 'Large assessment jumps', 'fa-arrow-up-right-dots', 'pro_plus'],
  ['tax_dispersion_iqr_pct', 'Reported tax dispersion', 'fa-chart-simple', 'pro_plus'],
  ['improvement_value_share_pct', 'Improvement value share', 'fa-building', 'pro_plus'],
  ['commercial_parcel_share_pct', 'Commercial parcels', 'fa-store', 'pro_plus'],
  ['exempt_parcel_share_pct', 'Exempt parcels', 'fa-landmark', 'pro_plus'],
  ['vacant_parcel_share_pct', 'Vacant parcels', 'fa-border-all', 'pro_plus'],
  ['farm_parcel_share_pct', 'Farm parcels', 'fa-wheat-awn', 'pro_plus'],
  ['recent_sale_turnover_pct', 'Recent recorded-sale turnover', 'fa-right-left', 'pro_plus'],
  ['pre_1978_building_share_pct', 'Pre-1978 buildings', 'fa-clock-rotate-left', 'pro_plus'],
  ['recent_build_share_pct', 'Recent construction', 'fa-person-digging', 'pro_plus'],
  ['median_effective_tax_rate_pct', 'Reported tax / assessment', 'fa-percent', 'pro_plus'],
  ['median_sale_assessment_ratio_pct', 'Sale / assessment ratio', 'fa-scale-balanced', 'pro_plus'],
  ['sale_assessment_ratio_dispersion_pct', 'Sale-ratio dispersion', 'fa-chart-line', 'pro_plus'],
  ['assessed_value_per_acre', 'Assessed value / acre', 'fa-coins', 'pro_plus']
];

function esc(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char];
  });
}
function districtFor(record) {
  var pin = String(record && (record.pams_pin || record.parcel_key || '') || '');
  var match = pin.match(/^(\d{4})/);
  return match ? match[1] : '';
}
function profileFor(record) {
  var district = districtFor(record);
  return district && intelligence.municipalities ? intelligence.municipalities[district] || null : null;
}
function formatValue(key, value) {
  if (value == null) return 'Not reported';
  if (/value|tax$|per_acre/.test(key)) return '$' + Math.round(value).toLocaleString();
  if (/pct$/.test(key)) return (+value).toFixed(Math.abs(value) < 10 ? 2 : 1) + '%';
  if (key === 'median_parcel_acres') return (+value).toFixed(value < 1 ? 2 : 1) + ' ac';
  if (key === 'median_building_age') return Math.round(value) + ' yrs';
  return String(value);
}
function markerLink(record, key, signal, profile) {
  var value = formatValue(key, signal.value);
  var note = profile.name + ' · ' + (signal.state_percentile != null ? signal.state_percentile + 'th percentile statewide' : 'municipal baseline');
  return '/property/marker?id=' + encodeURIComponent('modiv_intel.' + key) + '&pin=' + encodeURIComponent(record.pams_pin || '') + '&value=' + encodeURIComponent(value) + '&note=' + encodeURIComponent(note);
}
function tile(record, profile, spec) {
  var key = spec[0], signal = profile.signals && profile.signals[key];
  if (!signal || signal.value == null) return '';
  var percentile = signal.state_percentile;
  return '<a class="mi-tile dm" data-marker-id="modiv_intel.' + esc(key) + '" data-marker-value="' + esc(formatValue(key, signal.value)) + '" data-marker-note="' +
    esc(profile.name + (percentile != null ? ' · ' + percentile + 'th percentile statewide' : '')) + '" href="' + esc(markerLink(record, key, signal, profile)) + '">' +
    '<span class="mi-icon"><i class="fas ' + spec[2] + '"></i></span><span><small>' + esc(spec[1]) + '</small><b>' + esc(formatValue(key, signal.value)) + '</b>' +
    (percentile != null ? '<em>' + esc(percentile) + 'th percentile in NJ <i class="fas fa-arrow-right"></i></em>' : '') + '</span></a>';
}

window.statewideModivProfile = profileFor;
window.statewideModivSummary = function (record) {
  var profile = profileFor(record);
  return profile ? '24 statewide benchmarks for ' + profile.name : '2026 statewide MOD-IV baseline';
};
window.toolStatewideModivIntelligence = function (record) {
  var profile = profileFor(record);
  if (!profile) return '<div class="tl-note">The statewide 2026 MOD-IV baseline could not be matched to this parcel identifier.</div>';
  var proPlus = !!(window.NJPTRPlan && window.NJPTRPlan.can('pro_plus'));
  var basic = SIGNALS.filter(function (signal) { return signal[3] === 'pro'; }).map(function (signal) { return tile(record, profile, signal); }).join('');
  var advanced = SIGNALS.filter(function (signal) { return signal[3] === 'pro_plus'; }).map(function (signal) { return tile(record, profile, signal); }).join('');
  return '<div class="mi-panel"><div class="mi-head"><div><span>2026 MOD-IV MUNICIPAL BASELINE</span><h3>' + esc(profile.name) + '</h3><p>' +
    Number(profile.property_count || 0).toLocaleString() + ' parcel records condensed into comparable town-level signals. Percentile means higher or lower than other municipalities—it does not mean better or worse.</p></div>' +
    '<a href="/property/data-methodology.html">Methodology <i class="fas fa-arrow-up-right-from-square"></i></a></div><div class="mi-grid">' + basic + '</div>' +
    (proPlus ? '<div class="mi-sub"><b>Pro+ diagnostics</b><span>Deeper distribution, turnover, composition and assessment signals.</span></div><div class="mi-grid mi-advanced">' + advanced + '</div>' :
      '<div class="mi-locked"><i class="fas fa-layer-group"></i><div><b>18 deeper Pro+ municipal signals</b><span>Distribution, turnover, property-class mix, age exposure and sale-assessment context are available in Pro+.</span></div></div>') +
    '<p class="mi-note"><b>Source:</b> New Jersey Division of Taxation 2026 MOD-IV. Reported tax uses the latest populated annual-tax field in this release. Recorded sale fields are not represented as verified arm\'s-length SR-1A sales.</p></div>';
};

export { intelligence };
