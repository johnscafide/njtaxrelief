import '/property/js/dashboard/tools/town-intelligence.js?v=20260805a';
import '/property/js/dashboard/tools/municipal-budget-pressure.js?v=20260805a';

const all = townIntelAll();
const selected = [];
const select = document.getElementById('tc-town');
const search = document.getElementById('tc-town-search');
const list = document.getElementById('tc-town-list');
const townByLabel = new Map();

all.slice().sort((a,b) => a.county.localeCompare(b.county) || a.name.localeCompare(b.name)).forEach(row => {
  const label = `${row.name} (${row.county} County)`;
  const option = document.createElement('option');
  option.value = row.district;
  option.textContent = label;
  select.appendChild(option);
  const suggestion = document.createElement('option');
  suggestion.value = label;
  list.appendChild(suggestion);
  townByLabel.set(label.toLowerCase(), row.district);
});

function searchedDistrict() {
  const value = search.value.trim().toLowerCase();
  if (!value) return '';
  if (townByLabel.has(value)) return townByLabel.get(value);
  const matches = all.filter(row => row.name.toLowerCase() === value || row.name.toLowerCase().startsWith(value));
  return matches.length === 1 ? matches[0].district : '';
}

function esc(value) { return tiEsc(value); }
function rate(row) { return row.trajectory ? `${row.trajectory.cagr >= 0 ? '+' : ''}${(row.trajectory.cagr * 100).toFixed(1)}%` : 'Not available'; }
function pressureRate(value) { return value == null ? null : `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)}%`; }
function metric(label, rows, value, best) {
  const vals = rows.map(value);
  const nums = vals.map(v => typeof v === 'number' ? v : null).filter(v => v != null);
  const winner = nums.length && best ? (best === 'low' ? Math.min(...nums) : Math.max(...nums)) : null;
  return `<tr><th>${label}</th>${rows.map((row,i) => {
    const raw = vals[i], display = raw == null ? 'Not available' : raw;
    return `<td${winner != null && raw === winner ? ' class="win"' : ''}>${display}</td>`;
  }).join('')}</tr>`;
}

function render() {
  const rows = selected.map(townIntelFor).filter(Boolean);
  document.getElementById('tc-selected').innerHTML = rows.map(row =>
    `<span>${esc(row.name)}<button type="button" data-remove="${row.district}" aria-label="Remove ${esc(row.name)}"><i class="fas fa-xmark"></i></button></span>`
  ).join('');
  document.querySelectorAll('[data-remove]').forEach(button => button.onclick = () => {
    const index = selected.indexOf(button.dataset.remove); if (index > -1) selected.splice(index,1); render();
  });
  history.replaceState(null,'',selected.length ? `?towns=${selected.join(',')}` : location.pathname);
  const output = document.getElementById('tc-output');
  if (!rows.length) {
    output.innerHTML = '<div class="blank"><h3>Choose your first town</h3><p>Add two or more municipalities to compare their assessment systems and tax-rate direction.</p></div>';
    return;
  }
  output.innerHTML = `<section class="tc-cards">${rows.map(row => '<div>' + townIntelligenceCard(row.district) + budgetPressureSummary(row.district) + '</div>').join('')}</section>` +
    (rows.length > 1 ? `<div class="pro-wrap tc-table"><table class="pro"><thead><tr><th>Measure</th>${rows.map(row => `<th>${esc(row.name)}</th>`).join('')}</tr></thead><tbody>` +
      metric('Fairness score',rows,row=>row.score,'high') +
      metric('Statewide rank',rows,row=>row.stateRank,'low') +
      metric('County rank',rows,row=>row.countyRank,'low') +
      metric('Coefficient of deviation',rows,row=>row.coefficient == null ? null : row.coefficient,'low') +
      metric('Assessment currency gap',rows,row=>row.drift == null ? null : `${row.drift >= 0 ? '+' : ''}${(row.drift*100).toFixed(1)}%`) +
      metric('Tax-rate trend / year',rows,row=>rate(row)) +
      metric('Budget pressure score',rows,row=>{ const b=budgetPressureFor(row.district); return b ? b.score : null; },'low') +
      metric('Budget pressure band',rows,row=>{ const b=budgetPressureFor(row.district); return b ? b.band : null; }) +
      metric('Total levy growth / year',rows,row=>{ const b=budgetPressureFor(row.district); return b ? pressureRate(b.trend.total_levy_cagr) : null; }) +
      metric('Organic ratable growth / year',rows,row=>{ const b=budgetPressureFor(row.district); return b ? pressureRate(b.trend.ratable_growth) : null; }) +
      metric('School levy growth / year',rows,row=>{ const b=budgetPressureFor(row.district); return b ? pressureRate(b.trend.school_levy_cagr) : null; }) +
      metric('Municipal levy growth / year',rows,row=>{ const b=budgetPressureFor(row.district); return b ? pressureRate(b.trend.municipal_levy_cagr) : null; }) +
      metric('Years of rate history',rows,row=>row.trajectory ? row.trajectory.history.length : null,'high') +
    '</tbody></table></div>' : '');
}

document.getElementById('tc-add').onclick = () => {
  const value = searchedDistrict() || select.value;
  if (!value) { search.setCustomValidity('Choose a town from the suggestions or the full list.'); search.reportValidity(); return; }
  search.setCustomValidity('');
  if (selected.includes(value)) return;
  if (selected.length >= 4) { alert('Compare up to four towns at a time.'); return; }
  selected.push(value); select.value=''; search.value=''; render();
};
search.addEventListener('input', () => search.setCustomValidity(''));
search.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); document.getElementById('tc-add').click(); } });
select.addEventListener('change', () => { if (select.value) search.value = ''; });

const initial = (new URLSearchParams(location.search).get('towns') || '').split(',').filter(d => townIntelFor(d)).slice(0,4);
selected.push(...initial);
document.getElementById('tc-loading').style.display='none';
render();
