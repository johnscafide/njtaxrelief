/* Shared municipal fairness and tax-rate intelligence. */
const TI_DATA = { promise: null, rows: [], byDistrict: Object.create(null) };
const TI_REGRESSIVITY = { byDistrict: Object.create(null), pending: Object.create(null) };

function tiEsc(value) {
  return String(value == null ? '' : value).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}

function tiNormalize(value) {
  return String(value || '').toUpperCase().trim()
    .replace(/\bTOWNSHIP\b|\bTWNSHP\b|\bTWSP\b/g, 'TWP')
    .replace(/\bBOROUGH\b|\bBORO\b/g, 'BORO').replace(/\bVILLAGE\b/g, 'VLG')
    .replace(/\bTOWN OF\b/g, '').replace(/[^A-Z0-9 ()]/g, ' ')
    .replace(/\s+/g, ' ');
}
window.NJPTRTownName = Object.freeze({ normalize: tiNormalize });

function tiBand(score) {
  return score >= 70 ? 'excellent' : score >= 50 ? 'good' : score >= 30 ? 'fair' : 'poor';
}

function tiRateHistory(rates, name, county) {
  var town = tiNormalize(name), co = tiNormalize(county);
  var keys = Object.keys(rates || {}), hit = null;
  for (var i = 0; i < keys.length; i++) {
    var normalized = tiNormalize(keys[i]);
    if (normalized === town + ' (' + co + ')') { hit = rates[keys[i]]; break; }
  }
  if (!hit) {
    for (var j = 0; j < keys.length; j++) {
      if (tiNormalize(keys[j]) === town) { hit = rates[keys[j]]; break; }
    }
  }
  if (!hit) return [];
  return Object.keys(hit).map(Number).filter(function (year) { return year > 1990 && +hit[year] > 0; })
    .sort().map(function (year) { return { year: year, rate: +hit[year] }; });
}

function tiTrajectory(history) {
  if (!history || history.length < 3) return null;
  var first = history[0], last = history[history.length - 1], span = last.year - first.year;
  if (span < 2 || first.rate <= 0) return null;
  var cagr = Math.pow(last.rate / first.rate, 1 / span) - 1;
  var up = 0, down = 0;
  for (var i = 1; i < history.length; i++) {
    var change = (history[i].rate - history[i - 1].rate) / history[i - 1].rate;
    if (change > .001) up++; else if (change < -.001) down++;
  }
  return {
    history: history, first: first, last: last, span: span, cagr: cagr, upYears: up, downYears: down,
    band: cagr < -.005 ? 'falling' : cagr < .01 ? 'stable' : cagr < .035 ? 'rising' : 'fast'
  };
}

function loadTownIntelligence() {
  if (TI_DATA.promise) return TI_DATA.promise;
  TI_DATA.promise = Promise.all([
    fetch('/property/uniformity.json').then(function (r) { if (!r.ok) throw new Error('uniformity'); return r.json(); }),
    fetch('/property/sr1a-ratios.json').then(function (r) { if (!r.ok) throw new Error('sales ratios'); return r.json(); }),
    fetch('/property/tax-rates.json').then(function (r) { if (!r.ok) throw new Error('tax rates'); return r.json(); })
  ]).then(function (results) {
    var uniformity = (results[0] && results[0].districts) || {};
    var sales = (results[1] && results[1].districts) || {};
    var rates = (results[2] && results[2].rates) || {};
    TI_DATA.rows = Object.keys(uniformity).map(function (district) {
      var u = uniformity[district], s = sales[district];
      if (!u || u.score == null) return null;
      var currency = s && s.drift != null ? Math.max(0, 100 - Math.abs(+s.drift) * 400) : null;
      var score = Math.round(currency == null ? +u.score : (+u.score * .7 + currency * .3));
      var history = tiRateHistory(rates, u.name, u.county);
      return {
        district: district, name: u.name, county: u.county, score: score, band: tiBand(score),
        coefficient: u.coefficient == null ? null : +u.coefficient,
        uniformityScore: +u.score, uniformityPercentile: +u.percentile || null,
        currency: currency, drift: s && s.drift != null ? +s.drift : null,
        salesRatio: s && s.ratio != null ? +s.ratio : null, salesCount: s && +s.n || null,
        trajectory: tiTrajectory(history)
      };
    }).filter(Boolean);
    TI_DATA.rows.sort(function (a, b) { return b.score - a.score || a.name.localeCompare(b.name); });
    var countyCounts = Object.create(null);
    TI_DATA.rows.forEach(function (row, index) {
      row.stateRank = index + 1;
      countyCounts[row.county] = (countyCounts[row.county] || 0) + 1;
      row.countyRank = countyCounts[row.county];
      TI_DATA.byDistrict[row.district] = row;
    });
    var totals = Object.create(null);
    TI_DATA.rows.forEach(function (row) { totals[row.county] = (totals[row.county] || 0) + 1; });
    TI_DATA.rows.forEach(function (row) { row.stateTotal = TI_DATA.rows.length; row.countyTotal = totals[row.county]; });
    return TI_DATA.rows;
  });
  return TI_DATA.promise;
}

function townIntelFor(value) {
  var district = typeof value === 'string' ? value : String((value && value.pams_pin) || '').slice(0, 4);
  return TI_DATA.byDistrict[String(district || '').slice(0, 4)] || null;
}

function townIntelAll() { return TI_DATA.rows.slice(); }

function townIntelSummary(value) {
  var row = value && value.score != null && value.stateRank ? value : townIntelFor(value);
  if (!row) return '';
  var rate = row.trajectory, band = row.band || tiBand(+row.score || 0);
  return '<div class="ti-mini ' + band + '">' +
    '<span><b>' + row.score + '</b><small>town fairness</small></span>' +
    '<span><b>#' + row.stateRank + '</b><small>of ' + row.stateTotal + ' statewide</small></span>' +
    (rate ? '<span><b>' + (rate.cagr >= 0 ? '+' : '') + (rate.cagr * 100).toFixed(1) + '%</b><small>tax rate / year</small></span>' : '<span><b>-</b><small>rate history limited</small></span>') +
  '</div>';
}

function tiRegressivityLabel(pattern) {
  return {
    lower_value_higher: 'Lower-value homes show materially higher assessment ratios',
    modest_lower_value_higher: 'Lower-value homes show a modestly higher assessment ratio',
    roughly_even: 'Assessment ratios are roughly even across value bands',
    higher_value_higher: 'Higher-value homes show the higher assessment ratio'
  }[pattern] || 'Pattern unavailable';
}

function tiRegressivityHtml(data) {
  if (!data || !data.available || !data.metric) {
    return '<div class="ti-rate"><i class="fas fa-chart-column"></i><div><b>Price-band study unavailable</b><span>At least 50 usable recent sales are required to form ten sale-price deciles without inventing missing evidence.</span></div></div>';
  }
  var m = data.metric;
  var gap = +m.lower_vs_upper_gap_pct;
  var low = (+m.lower_value_median_ratio * 100).toFixed(1);
  var high = (+m.upper_value_median_ratio * 100).toFixed(1);
  var deciles = Array.isArray(m.deciles) ? m.deciles : [];
  var bars = deciles.map(function (d) {
    var ratio = +d.median_assessment_ratio * 100;
    return '<span title="Decile ' + tiEsc(d.decile) + ': ' + ratio.toFixed(1) + '%"><i style="height:' + Math.max(8, Math.min(56, ratio * .55)).toFixed(0) + 'px"></i><small>' + tiEsc(d.decile) + '</small></span>';
  }).join('');
  return '<div class="ti-rate"><i class="fas fa-scale-balanced"></i><div><b>Assessment-to-sale ratio by value band</b><span>' + tiEsc(tiRegressivityLabel(m.pattern)) + '.</span></div></div>' +
    '<div class="ti-stat-grid"><div><b>' + low + '%</b><span>median ratio, lowest 30%</span></div><div><b>' + high + '%</b><span>median ratio, highest 30%</span></div><div><b>' + (gap >= 0 ? '+' : '') + gap.toFixed(1) + '%</b><span>lower vs upper gap</span></div><div><b>' + Number(m.sample_count).toLocaleString() + '</b><span>usable sales, ' + tiEsc(m.sale_year_min) + '–' + tiEsc(m.sale_year_max) + '</span></div></div>' +
    '<div class="ti-deciles" aria-label="Median assessment-to-sale ratio by sale-price decile">' + bars + '</div>' +
    '<p class="ti-limit"><b>Method:</b> State-usable recent sales are sorted into ten price deciles within this tax district. Watchdog compares median assessed-value-to-sale-price ratios across those bands. Positive gaps mean the lower-price bands carry higher measured ratios. This is descriptive evidence, not an accusation about assessor intent and not, by itself, a legal appeal conclusion.</p>';
}

function loadAssessmentRegressivity(district) {
  district = String(district || '').replace(/\D/g, '').slice(0, 4);
  if (district.length !== 4) return Promise.resolve(null);
  if (TI_REGRESSIVITY.byDistrict[district]) return Promise.resolve(TI_REGRESSIVITY.byDistrict[district]);
  if (TI_REGRESSIVITY.pending[district]) return TI_REGRESSIVITY.pending[district];
  TI_REGRESSIVITY.pending[district] = fetch('/api/assessment-regressivity?district=' + encodeURIComponent(district), { headers: { Accept: 'application/json' } })
    .then(function (response) { if (response.status === 404) return response.json(); if (!response.ok) throw new Error('regressivity'); return response.json(); })
    .then(function (data) { TI_REGRESSIVITY.byDistrict[district] = data; delete TI_REGRESSIVITY.pending[district]; return data; })
    .catch(function () { delete TI_REGRESSIVITY.pending[district]; return null; });
  return TI_REGRESSIVITY.pending[district];
}

function hydrateRegressivity(district) {
  var id = 'ti-regressivity-' + String(district || '').replace(/\D/g, '').slice(0, 4);
  loadAssessmentRegressivity(district).then(function (data) {
    var host = document.getElementById(id);
    if (host) host.innerHTML = tiRegressivityHtml(data);
  });
}

function townIntelligenceCard(property) {
  var row = townIntelFor(property);
  if (!row) return '';
  var rate = row.trajectory;
  var rateText = !rate ? 'Not enough tax-rate history is available.' :
    'The general rate has moved ' + (rate.cagr >= 0 ? 'up ' : 'down ') + Math.abs(rate.cagr * 100).toFixed(1) +
    '% per year across ' + rate.span + ' years, rising in ' + rate.upYears + ' and falling in ' + rate.downYears + '.';
  if (location.pathname.indexOf('/fairness') !== -1) setTimeout(function () { hydrateRegressivity(row.district); }, 0);
  return '<div class="ti-report">' +
    '<div class="ti-report-head"><div><span>Town Intelligence</span><h4>' + tiEsc(row.name) + '</h4>' +
      '<p>' + tiEsc(row.county) + ' County</p></div><div class="ti-score ' + row.band + '"><b>' + row.score + '</b><span>fairness</span></div></div>' +
    '<div class="ti-stat-grid">' +
      '<div><b>#' + row.stateRank + '</b><span>of ' + row.stateTotal + ' statewide</span></div>' +
      '<div><b>#' + row.countyRank + '</b><span>of ' + row.countyTotal + ' in county</span></div>' +
      '<div><b>' + (row.coefficient == null ? 'Not available' : row.coefficient.toFixed(1)) + '</b><span>coefficient of deviation</span></div>' +
      '<div><b>' + (row.drift == null ? 'Not available' : (row.drift >= 0 ? '+' : '') + (row.drift * 100).toFixed(1) + '%') + '</b><span>assessment currency gap</span></div>' +
    '</div>' +
    '<div class="ti-rate"><i class="fas fa-chart-line"></i><div><b>' +
      (!rate ? 'Rate history unavailable' : (rate.cagr >= 0 ? '+' : '') + (rate.cagr * 100).toFixed(1) + '% per year') +
      '</b><span>' + tiEsc(rateText) + '</span></div></div>' +
    (location.pathname.indexOf('/fairness') !== -1 ? '<div id="ti-regressivity-' + tiEsc(row.district) + '"><div class="ti-rate"><i class="fas fa-chart-column"></i><div><b>Loading price-band fairness study</b><span>Comparing assessment-to-sale ratios across ten municipal sale-price deciles.</span></div></div></div>' : '') +
    '<p class="ti-limit">Fairness measures consistency inside the municipality. It does not mean taxes are low, and it does not decide whether this property has an appeal.</p>' +
    '<div class="ti-links"><a href="/property/fairness?district=' + encodeURIComponent(row.district) + '">Open shareable town report</a>' +
      '<a href="/property/town-compare?towns=' + encodeURIComponent(row.district) + '">Compare this town</a></div>' +
  '</div>';
}

await loadTownIntelligence();
Object.assign(window, {
  loadTownIntelligence: loadTownIntelligence, townIntelFor: townIntelFor, townIntelAll: townIntelAll,
  townIntelSummary: townIntelSummary, townIntelligenceCard: townIntelligenceCard,
  loadAssessmentRegressivity: loadAssessmentRegressivity, tiEsc: tiEsc
});

export { loadTownIntelligence, townIntelFor, townIntelAll, townIntelSummary, townIntelligenceCard, loadAssessmentRegressivity };
