import '/property/js/dashboard/tools/town-intelligence.js?v=20260805a';

const all = townIntelAll();
const selected = [];
const select = document.getElementById('tc-town');

all.slice().sort((a,b) => a.county.localeCompare(b.county) || a.name.localeCompare(b.name)).forEach(row => {
  const option = document.createElement('option');
  option.value = row.district;
  option.textContent = `${row.name} (${row.county} County)`;
  select.appendChild(option);
});

function esc(value) { return tiEsc(value); }
function rate(row) { return row.trajectory ? `${row.trajectory.cagr >= 0 ? '+' : ''}${(row.trajectory.cagr * 100).toFixed(1)}%` : 'Not available'; }
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
  output.innerHTML = `<section class="tc-cards">${rows.map(row => townIntelligenceCard(row.district)).join('')}</section>` +
    (rows.length > 1 ? `<div class="pro-wrap tc-table"><table class="pro"><thead><tr><th>Measure</th>${rows.map(row => `<th>${esc(row.name)}</th>`).join('')}</tr></thead><tbody>` +
      metric('Fairness score',rows,row=>row.score,'high') +
      metric('Statewide rank',rows,row=>row.stateRank,'low') +
      metric('County rank',rows,row=>row.countyRank,'low') +
      metric('Coefficient of deviation',rows,row=>row.coefficient == null ? null : row.coefficient,'low') +
      metric('Assessment currency gap',rows,row=>row.drift == null ? null : `${row.drift >= 0 ? '+' : ''}${(row.drift*100).toFixed(1)}%`) +
      metric('Tax-rate trend / year',rows,row=>rate(row)) +
      metric('Years of rate history',rows,row=>row.trajectory ? row.trajectory.history.length : null,'high') +
    '</tbody></table></div>' : '');
}

document.getElementById('tc-add').onclick = () => {
  const value = select.value;
  if (!value || selected.includes(value)) return;
  if (selected.length >= 4) { alert('Compare up to four towns at a time.'); return; }
  selected.push(value); select.value=''; render();
};

const initial = (new URLSearchParams(location.search).get('towns') || '').split(',').filter(d => townIntelFor(d)).slice(0,4);
selected.push(...initial);
document.getElementById('tc-loading').style.display='none';
render();
