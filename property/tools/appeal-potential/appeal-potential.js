(() => {
  'use strict';
  const DATA_URL = '../../data/cod/cod-history.json';
  const $ = id => document.getElementById(id);
  let municipalities = [];

  const validHistory = record => (record.history || []).filter(item => Number.isFinite(item.cod));
  const latest = record => validHistory(record).at(-1);
  const numberValue = id => {
    const cleaned = $(id).value.replace?.(/[$,\s]/g, '') ?? $(id).value;
    const value = Number(cleaned);
    return Number.isFinite(value) ? value : null;
  };

  function codPercentile(cod) {
    const values = municipalities.map(latest).filter(Boolean).map(item => item.cod);
    if (!values.length) return null;
    return Math.round(values.filter(value => value < cod).length / values.length * 100);
  }

  function calculate(record) {
    const ratio = NJPropertyModel.assessmentRatio(record);
    let score = 0;
    let availableWeight = 0;
    const reasons = [];

    // Property-specific assessed-to-market ratio: 55 points.
    if (Number.isFinite(ratio)) {
      availableWeight += 55;
      let points = 0;
      if (ratio >= 1.10) points = 55;
      else if (ratio >= 1.00) points = 44;
      else if (ratio >= .90) points = 28;
      else if (ratio >= .80) points = 14;
      score += points;
      if (ratio >= 1) reasons.push(`The assessed value is ${(ratio * 100).toFixed(1)}% of the entered market value, a strong screening signal that the valuation deserves review.`);
      else if (ratio >= .9) reasons.push(`The assessed value is ${(ratio * 100).toFixed(1)}% of the entered market value, which is close enough to warrant checking the municipality's applicable ratio and comparable sales.`);
      else reasons.push(`The assessed value is ${(ratio * 100).toFixed(1)}% of the entered market value, which by itself is not a strong over-assessment signal.`);
    }

    // Municipality consistency context: 15 points.
    const percentile = record.municipalityMetrics.codPercentile;
    if (Number.isFinite(percentile)) {
      availableWeight += 15;
      const points = percentile >= 75 ? 15 : percentile >= 50 ? 10 : percentile >= 25 ? 5 : 1;
      score += points;
      reasons.push(`The municipality's residential COD is ${record.municipalityMetrics.cod.toFixed(1)}, with roughly ${percentile}% of loaded municipalities showing a lower COD. This adds context but does not prove an individual error.`);
    }

    // Optional comparable ratio: 20 points.
    const comp = record.property.comparableMedianRatio;
    if (Number.isFinite(comp) && comp > 0) {
      availableWeight += 20;
      const gap = ratio - comp;
      const points = gap >= .20 ? 20 : gap >= .10 ? 14 : gap >= .05 ? 8 : 1;
      score += points;
      reasons.push(gap >= .05 ? `The property's implied ratio is ${(gap * 100).toFixed(1)} percentage points above the entered comparable median ratio.` : 'The entered comparable ratio is close to the property’s implied ratio, so it adds little appeal support.');
    }

    // Optional revaluation age: 10 points.
    const age = record.property.yearsSinceRevaluation;
    if (Number.isFinite(age)) {
      availableWeight += 10;
      const points = age >= 20 ? 10 : age >= 12 ? 7 : age >= 6 ? 3 : 0;
      score += points;
      reasons.push(age >= 12 ? `The entered revaluation age is ${age} years, which can increase the usefulness of a closer property-specific comparison.` : `The entered revaluation age is ${age} years and does not materially increase this screening score.`);
    }

    const normalized = availableWeight ? Math.round(score / availableWeight * 100) : 0;
    const confidence = availableWeight >= 95 ? 'High' : availableWeight >= 70 ? 'Moderate' : 'Basic';
    return { score: normalized, confidence, ratio, reasons, availableWeight };
  }

  function outcome(score) {
    if (score >= 68) return { label: 'High review potential', cls: 'is-high', summary: 'Multiple screening indicators suggest that gathering formal valuation evidence may be worthwhile.', recommendation: 'Confirm the official assessed value and applicable municipal or county ratio, collect recent comparable sales that predate the valuation date, and review the filing deadline before speaking with the assessor or an appeal professional.' };
    if (score >= 38) return { label: 'Moderate review potential', cls: 'is-moderate', summary: 'The available information is mixed. A targeted review could clarify whether stronger evidence exists.', recommendation: 'Verify the market-value estimate and add comparable property evidence. The result may change materially once a comparable median ratio or official equalization ratio is available.' };
    return { label: 'Low current signal', cls: 'is-low', summary: 'The entered information does not currently show a strong statistical reason for appeal.', recommendation: 'Keep the assessment notice and monitor future assessments. Recalculate if you obtain a lower supported market value or stronger comparable evidence.' };
  }

  function render(result, municipality) {
    const copy = outcome(result.score);
    $('score').textContent = result.score;
    $('resultLabel').textContent = copy.label;
    $('resultLabel').className = copy.cls;
    $('meterFill').style.width = `${result.score}%`;
    $('summary').textContent = copy.summary;
    $('ratio').textContent = `${(result.ratio * 100).toFixed(1)}%`;
    $('cod').textContent = latest(municipality).cod.toFixed(1);
    $('confidence').textContent = result.confidence;
    $('reasons').innerHTML = '';
    result.reasons.forEach(reason => { const li = document.createElement('li'); li.textContent = reason; $('reasons').appendChild(li); });
    $('recommendation').textContent = copy.recommendation;
    $('result').hidden = false;
    $('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function init() {
    try {
      const response = await fetch(DATA_URL, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      municipalities = (payload.municipalities || []).filter(latest).sort((a,b) => a.municipality.localeCompare(b.municipality));
      municipalities.forEach(record => {
        const option = document.createElement('option');
        option.value = record.id;
        option.textContent = `${record.municipality} — ${record.county} County`;
        $('municipality').appendChild(option);
      });
      $('status').textContent = `${municipalities.length} municipalities loaded from the official COD dataset.`;
    } catch (error) {
      $('status').textContent = 'Municipality data could not be loaded. Use a local web server rather than opening the file directly.';
      console.error(error);
    }
  }

  $('appealForm').addEventListener('submit', event => {
    event.preventDefault();
    const municipality = municipalities.find(item => item.id === $('municipality').value);
    if (!municipality) return;
    const current = latest(municipality);
    const record = NJPropertyModel.createPropertyRecord({
      address: $('address').value,
      municipalityId: municipality.id,
      municipality: municipality.municipality,
      county: municipality.county,
      assessedValue: numberValue('assessedValue'),
      estimatedMarketValue: numberValue('marketValue'),
      comparableMedianRatio: numberValue('comparableRatio'),
      yearsSinceRevaluation: numberValue('revaluationAge'),
      cod: current.cod,
      codPercentile: codPercentile(current.cod),
      codYear: current.year
    });
    const validation = NJPropertyModel.validatePropertyRecord(record);
    if (!validation.valid) { $('status').textContent = validation.errors.join(' '); return; }
    $('status').textContent = 'Calculation complete.';
    render(calculate(record), municipality);
  });

  init();
})();
