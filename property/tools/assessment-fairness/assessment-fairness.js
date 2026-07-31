(() => {
  'use strict';
  const DATA_URL = '../../data/cod/cod-history.json';
  const form = document.querySelector('#municipalityForm');
  const select = document.querySelector('#municipalitySelect');
  const report = document.querySelector('#report');
  const emptyState = document.querySelector('#emptyState');
  const status = document.querySelector('#dataStatus');
  let records = [];

  const el = id => document.getElementById(id);
  const latest = record => record.history.at(-1);
  const previous = record => record.history.at(-2) || latest(record);

  function scoreFor(cod, min, max) {
    if (max === min) return 75;
    return Math.max(0, Math.min(100, Math.round(100 - ((cod - min) / (max - min)) * 100)));
  }

  function percentileFor(cod) {
    const sorted = records.map(r => latest(r).cod).sort((a,b) => a-b);
    const betterOrEqual = sorted.filter(v => v <= cod).length;
    return Math.round((betterOrEqual / sorted.length) * 100);
  }

  function classification(score) {
    if (score >= 75) return {label:'More consistent', cls:'is-good'};
    if (score >= 45) return {label:'Mixed consistency', cls:'is-warn'};
    return {label:'Less consistent', cls:'is-bad'};
  }

  function appealCopy(score) {
    if (score < 45) return ['Stronger reason to investigate', 'The municipal data shows relatively wide assessment variation. That does not establish an individual over-assessment, but it increases the value of comparing your assessment with recent, similar sales and neighboring properties.'];
    if (score < 75) return ['Worth a closer look', 'The municipality falls in the middle of the loaded dataset. Homeowners should focus on property-specific evidence rather than relying on the municipal statistic alone.'];
    return ['Municipal consistency looks stronger', 'The municipality compares favorably on assessment uniformity. An appeal may still be justified when the individual assessment exceeds supported market value, but the town-wide statistic alone is not a strong warning signal.'];
  }

  function renderChart(history) {
    const chart = el('chart');
    chart.innerHTML = '';
    const max = Math.max(...history.map(d => d.cod)) * 1.15;
    history.forEach(d => {
      const wrap = document.createElement('div');
      wrap.className = 'af-bar-wrap';
      const bar = document.createElement('div');
      bar.className = 'af-bar';
      bar.style.height = `${Math.max(4, (d.cod / max) * 100)}%`;
      const value = document.createElement('span');
      value.textContent = d.cod.toFixed(1);
      bar.appendChild(value);
      const year = document.createElement('div');
      year.className = 'af-year';
      year.textContent = d.year;
      wrap.append(bar, year);
      chart.appendChild(wrap);
    });
  }

  function render(record) {
    const current = latest(record);
    const prior = previous(record);
    const all = records.map(r => latest(r).cod);
    const score = scoreFor(current.cod, Math.min(...all), Math.max(...all));
    const rank = percentileFor(current.cod);
    const quality = classification(score);
    const delta = current.cod - prior.cod;
    const trend = Math.abs(delta) < .05 ? 'Stable' : delta < 0 ? 'Improving' : 'Worsening';
    const trendClass = trend === 'Improving' ? 'is-good' : trend === 'Worsening' ? 'is-bad' : '';
    const lessConsistentPct = Math.max(0, 100 - rank);
    const appeal = appealCopy(score);

    el('reportTitle').textContent = `${record.municipality}, ${record.county} County`;
    el('reportMeta').textContent = `Latest loaded year: ${current.year} · Property class: ${record.propertyClass || 'Residential'}`;
    el('scoreValue').textContent = score;
    el('scoreLabel').textContent = quality.label;
    el('scoreLabel').className = quality.cls;
    el('plainEnglishTitle').textContent = quality.label;
    el('plainEnglishText').textContent = `Based on the loaded COD dataset, ${record.municipality}'s assessments are less consistent than approximately ${lessConsistentPct}% of included municipalities. This is a relative comparison, not a finding about any one property.`;
    el('codValue').textContent = current.cod.toFixed(1);
    el('codExplanation').textContent = 'Lower values generally indicate assessments cluster more closely around the median assessment ratio.';
    el('percentileValue').textContent = `${rank}th`;
    el('percentileText').textContent = `Approximately ${rank}% of loaded municipalities have an equal or lower COD.`;
    el('trendValue').textContent = trend;
    el('trendValue').className = `af-big-number af-trend ${trendClass}`;
    el('trendText').textContent = `${delta > 0 ? '+' : ''}${delta.toFixed(1)} COD points versus ${prior.year}.`;
    el('appealTitle').textContent = appeal[0];
    el('appealText').textContent = appeal[1];
    renderChart(record.history);
    emptyState.hidden = true;
    report.hidden = false;
    report.scrollIntoView({behavior:'smooth', block:'start'});
  }

  async function init() {
    try {
      const response = await fetch(DATA_URL, {cache:'no-store'});
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      records = payload.municipalities || [];
      if (!records.length) throw new Error('No municipality records found');
      records.sort((a,b) => a.municipality.localeCompare(b.municipality));
      for (const record of records) {
        const option = document.createElement('option');
        option.value = record.id;
        option.textContent = `${record.municipality} — ${record.county} County`;
        select.appendChild(option);
      }
      status.textContent = `${records.length} municipalities loaded · ${payload.sourceLabel || 'COD dataset'}`;
    } catch (error) {
      status.textContent = 'Data could not be loaded. Run the site through a local/server environment, not file://.';
      status.classList.add('is-bad');
      console.error('Assessment Fairness data load failed:', error);
    }
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    const record = records.find(r => r.id === select.value);
    if (record) render(record);
  });
  init();
})();
