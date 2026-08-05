/* Municipal Budget Pressure: statewide levy, ratable, budget, debt and collection context. */
const BP_STATE = { promise: null, rows: Object.create(null), meta: null };

const BP_DRIVER_LABELS = {
  levy_base_gap: 'Levy growth vs. ratable growth',
  levy_growth: 'Total levy growth',
  budget_growth: 'Municipal budget growth',
  debt_service_share: 'Debt service share',
  collection_weakness: 'Tax collection weakness',
  structural_imbalance_share: 'Reported structural imbalance'
};

function bpEsc(value) {
  return String(value == null ? '' : value).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}

function bpDistrict(value) {
  if (typeof value === 'string') return value.slice(0, 4);
  return String((value && (value.pams_pin || value.district)) || '').slice(0, 4);
}

function bpPct(value, digits) {
  return value == null ? 'Not available' : ((value >= 0 ? '+' : '') + (value * 100).toFixed(digits == null ? 1 : digits) + '%');
}

function bpBandLabel(band) {
  return { low: 'Low', moderate: 'Moderate', elevated: 'Elevated', high: 'High' }[band] || 'Not rated';
}

function loadBudgetPressure() {
  if (BP_STATE.promise) return BP_STATE.promise;
  BP_STATE.promise = fetch('/property/data/budget-pressure.json?v=20260805a')
    .then(function (response) { if (!response.ok) throw new Error('budget pressure data'); return response.json(); })
    .then(function (data) {
      BP_STATE.rows = (data && data.municipalities) || Object.create(null);
      BP_STATE.meta = data || null;
      return BP_STATE.rows;
    });
  return BP_STATE.promise;
}

function budgetPressureFor(value) {
  return BP_STATE.rows[bpDistrict(value)] || null;
}

function budgetPressureAll() {
  return Object.keys(BP_STATE.rows).map(function (key) { return BP_STATE.rows[key]; });
}

function budgetPressureSummary(value) {
  var row = budgetPressureFor(value);
  if (!row) return '';
  return '<div class="bp-mini ' + row.band + '">' +
    '<span><b>' + row.score + '</b><small>budget pressure</small></span>' +
    '<span><b>' + bpPct(row.trend.total_levy_cagr) + '</b><small>levy / year</small></span>' +
    '<span><b>' + bpPct(row.trend.ratable_growth) + '</b><small>ratables / year</small></span>' +
  '</div>';
}

function bpHistory(row) {
  var history = row.history || [];
  if (!history.length) return '';
  var values = history.map(function (item) { return +item.total_levy || 0; });
  var min = Math.min.apply(null, values), max = Math.max.apply(null, values), range = Math.max(1, max - min);
  return '<div class="bp-history">' + history.map(function (item) {
    var height = 24 + ((+item.total_levy - min) / range) * 58;
    return '<span><i style="height:' + height.toFixed(1) + '%"></i><b>' + item.year + '</b></span>';
  }).join('') + '</div>';
}

function bpDriverRows(row) {
  var drivers = (row.drivers || []).slice().sort(function (a, b) { return b.pressure_percentile - a.pressure_percentile; });
  return drivers.map(function (driver) {
    return '<div class="bp-driver"><span>' + bpEsc(BP_DRIVER_LABELS[driver.key] || driver.key) + '</span>' +
      '<div><i style="width:' + Math.max(2, Math.min(100, driver.pressure_percentile)).toFixed(1) + '%"></i></div>' +
      '<b>' + Math.round(driver.pressure_percentile) + '<small>th</small></b></div>';
  }).join('');
}

function budgetPressureCard(value) {
  var row = budgetPressureFor(value);
  if (!row) return '';
  var t = row.trend || {}, b = row.budget || {}, c = row.components || {};
  var totalShare = (c.municipal_share || 0) + (c.school_share || 0) + (c.county_share || 0) || 1;
  var school = (c.school_share || 0) / totalShare * 100;
  var municipal = (c.municipal_share || 0) / totalShare * 100;
  var county = (c.county_share || 0) / totalShare * 100;
  var lead = row.band === 'high'
    ? 'Pressure is high relative to other New Jersey municipalities. The underlying drivers deserve a closer look before assuming recent tax trends will continue.'
    : row.band === 'elevated'
      ? 'Several fiscal drivers are running above the statewide middle. That does not guarantee a tax increase, but the pressure is worth watching.'
      : row.band === 'moderate'
        ? 'The town sits near the middle of the statewide pressure range. Some drivers are rising while others are absorbing part of the load.'
        : 'Current fiscal pressure measures are comparatively restrained against the rest of New Jersey.';

  return '<div class="bp-report ' + row.band + '">' +
    '<div class="bp-head"><div><span>Municipal Budget Pressure</span><h4>' + bpEsc(row.name) + '</h4><p>' + bpEsc(lead) + '</p></div>' +
      '<div class="bp-score"><b>' + row.score + '</b><span>' + bpBandLabel(row.band) + '</span></div></div>' +
    '<div class="bp-grid">' +
      '<div><b>' + bpPct(t.total_levy_cagr) + '</b><span>total levy growth / year</span></div>' +
      '<div><b>' + bpPct(t.ratable_growth) + '</b><span>organic ratable growth / year</span></div>' +
      '<div><b>' + bpPct(b.appropriation_growth) + '</b><span>municipal budget change</span></div>' +
      '<div><b>' + (b.collection_rate == null ? 'Not available' : (b.collection_rate * 100).toFixed(1) + '%') + '</b><span>taxes collected</span></div>' +
      '<div><b>' + (b.debt_service_share == null ? 'Not available' : (b.debt_service_share * 100).toFixed(1) + '%') + '</b><span>budget going to debt service</span></div>' +
      '<div><b>' + (b.structural_imbalance_share == null ? 'Not available' : (b.structural_imbalance_share * 100).toFixed(1) + '%') + '</b><span>reported structural imbalance</span></div>' +
    '</div>' +
    '<div class="bp-two"><div><h5>Five-year total levy</h5>' + bpHistory(row) +
      '<p>' + bpPct(t.total_levy_change) + ' from 2021 to 2025</p></div>' +
      '<div><h5>2025 levy mix</h5><div class="bp-mix"><i class="school" style="width:' + school.toFixed(2) + '%"></i>' +
        '<i class="municipal" style="width:' + municipal.toFixed(2) + '%"></i><i class="county" style="width:' + county.toFixed(2) + '%"></i></div>' +
        '<p><span class="school">School ' + school.toFixed(0) + '%</span><span class="municipal">Municipal ' + municipal.toFixed(0) + '%</span><span class="county">County ' + county.toFixed(0) + '%</span></p></div></div>' +
    '<div class="bp-components"><span><b>' + bpPct(t.school_levy_cagr) + '</b> school levy / year</span>' +
      '<span><b>' + bpPct(t.municipal_levy_cagr) + '</b> municipal levy / year</span>' +
      '<span><b>' + bpPct(t.county_levy_cagr) + '</b> county levy / year</span></div>' +
    '<div class="bp-drivers"><h5>Where the pressure comes from</h5>' + bpDriverRows(row) + '</div>' +
    '<p class="bp-note">Score is a relative statewide pressure indicator built from NJ DCA property-tax and User-Friendly Budget data. It measures conditions already reported, not next year\'s tax bill. Apparent revaluation resets are excluded from the organic ratable-growth calculation.</p>' +
  '</div>';
}

function budgetPressureAgentPoint(value) {
  var row = budgetPressureFor(value);
  if (!row) return null;
  return {
    score: row.score,
    band: row.band,
    text: 'Total levy growth is ' + bpPct(row.trend.total_levy_cagr) + ' per year versus ' +
      bpPct(row.trend.ratable_growth) + ' organic ratable growth.'
  };
}

await loadBudgetPressure();
Object.assign(window, {
  loadBudgetPressure: loadBudgetPressure,
  budgetPressureFor: budgetPressureFor,
  budgetPressureAll: budgetPressureAll,
  budgetPressureSummary: budgetPressureSummary,
  budgetPressureCard: budgetPressureCard,
  budgetPressureAgentPoint: budgetPressureAgentPoint
});

export { loadBudgetPressure, budgetPressureFor, budgetPressureAll, budgetPressureSummary, budgetPressureCard, budgetPressureAgentPoint };
