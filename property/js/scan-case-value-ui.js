/* Watchdog Attorney Appeal Pipeline case-value working assumptions.
 * This layer never supplies a default fee assumption and never persists or
 * transmits attorney-entered values. It only applies user-supplied business
 * assumptions to the server-returned annual tax-at-stake figure.
 */
(function () {
  'use strict';

  if (new URLSearchParams(window.location.search).get('mode') !== 'attorney') return;

  var nativeFetch = window.fetch;
  var snapshot = null;
  var hits = Object.create(null);
  var decorateTimer = null;

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  }
  function normalize(value) { return String(value == null ? '' : value).trim().toLowerCase().replace(/\s+/g, ' '); }
  function hitKey(hit) { return normalize(hit && hit.a) + '|' + normalize(String(hit && hit.b || '') + '/' + String(hit && hit.l || '')); }
  function rowKey(tr) {
    var address = tr.querySelector('.sc-address');
    var blockLot = tr.querySelector('td.q');
    return normalize(address && address.textContent) + '|' + normalize(blockLot && blockLot.textContent);
  }
  function money(value) {
    var n = Number(value);
    return Number.isFinite(n) ? '$' + Math.round(n).toLocaleString() : '—';
  }

  function readAssumptions() {
    var feeNode = document.getElementById('sc-fee-share');
    var yearsNode = document.getElementById('sc-value-horizon');
    var feeText = feeNode ? feeNode.value.trim() : '';
    var yearsText = yearsNode ? yearsNode.value.trim() : '';
    if (!feeText && !yearsText) return { ready: false, empty: true, feePct: null, years: null };
    var feePct = Number(feeText);
    var years = Number(yearsText);
    return {
      ready: Number.isFinite(feePct) && feePct > 0 && feePct <= 100 && Number.isFinite(years) && years > 0 && years <= 20,
      empty: false,
      feePct: feePct,
      years: years
    };
  }

  function estimate(hit, assumptions) {
    if (!hit || !assumptions || !assumptions.ready) return null;
    var annual = Number(hit.saving);
    if (!Number.isFinite(annual) || annual < 0) return null;
    return annual * (assumptions.feePct / 100) * assumptions.years;
  }

  function panel() {
    if (document.getElementById('sc-case-model')) return;
    var intro = document.querySelector('#sc-tool .sc-intro');
    if (!intro) return;
    var node = document.createElement('section');
    node.id = 'sc-case-model';
    node.className = 'sc-method';
    node.setAttribute('aria-label', 'Optional attorney case-value working assumptions');
    node.innerHTML = '<h4><i class="fas fa-calculator"></i> Optional case-value working assumptions</h4>' +
      '<p>Enter your own fee share and value horizon only if they match your engagement model. Watchdog provides <b>no default fee percentage</b>, does not recommend a fee, and does not save or send these inputs.</p>' +
      '<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:end">' +
        '<label style="display:grid;gap:5px;min-width:180px"><span style="font-weight:700">Fee share assumption (%)</span><input id="sc-fee-share" type="number" inputmode="decimal" min="0.01" max="100" step="0.01" placeholder="Enter your assumption" autocomplete="off" style="font:inherit;padding:9px 10px;border:1px solid #cbd5e1;border-radius:8px"></label>' +
        '<label style="display:grid;gap:5px;min-width:180px"><span style="font-weight:700">Value horizon (years)</span><input id="sc-value-horizon" type="number" inputmode="decimal" min="0.01" max="20" step="0.01" placeholder="Enter your assumption" autocomplete="off" style="font:inherit;padding:9px 10px;border:1px solid #cbd5e1;border-radius:8px"></label>' +
        '<button id="sc-case-export" type="button" class="sc-exp" disabled><i class="fas fa-file-csv"></i> Export with assumptions</button>' +
      '</div>' +
      '<p id="sc-case-note" class="sc-sources">No case-value assumption is applied until both fields are entered. Uniform assumptions preserve the existing dollars-at-stake ranking.</p>';
    intro.insertAdjacentElement('afterend', node);
    var fee = document.getElementById('sc-fee-share');
    var years = document.getElementById('sc-value-horizon');
    var exportButton = document.getElementById('sc-case-export');
    if (fee) fee.addEventListener('input', assumptionsChanged);
    if (years) years.addEventListener('input', assumptionsChanged);
    if (exportButton) exportButton.addEventListener('click', exportCsv);
  }

  function assumptionsChanged() {
    var assumptions = readAssumptions();
    var note = document.getElementById('sc-case-note');
    var exportButton = document.getElementById('sc-case-export');
    if (exportButton) exportButton.disabled = !(assumptions.ready && snapshot);
    if (note) {
      if (assumptions.empty) {
        note.textContent = 'No case-value assumption is applied until both fields are entered. Uniform assumptions preserve the existing dollars-at-stake ranking.';
      } else if (!assumptions.ready) {
        note.textContent = 'Enter a fee share above 0% and no more than 100%, plus a value horizon above 0 and no more than 20 years. No estimate is shown until both inputs are valid.';
      } else {
        note.textContent = 'Working formula: server-returned annual tax at stake × your ' + assumptions.feePct + '% fee-share assumption × your ' + assumptions.years + '-year horizon. These values stay in this browser tab and are not saved or sent.';
      }
    }
    window.__watchdogCaseValueAssumptions = assumptions.ready ? { feePct: assumptions.feePct, years: assumptions.years } : null;
    scheduleDecorate();
  }

  function capture(payload) {
    if (!payload || payload.result !== 'ok' || !payload.run || !Array.isArray(payload.run.hits)) return;
    snapshot = {
      run: payload.run,
      formulaVersion: payload.formula_version || '',
      generatedAt: payload.generated_at || ''
    };
    hits = Object.create(null);
    payload.run.hits.forEach(function (hit) {
      var k = hitKey(hit);
      if (!k || k === '|') return;
      hits[k] = hit;
    });
    var exportButton = document.getElementById('sc-case-export');
    if (exportButton) exportButton.disabled = !readAssumptions().ready;
    scheduleDecorate();
  }

  function decorate() {
    decorateTimer = null;
    panel();
    var out = document.getElementById('sc-out');
    if (!out || !snapshot) return;
    var assumptions = readAssumptions();
    var header = out.querySelector('.sc-res table.sc-t thead tr');
    if (header && !header.querySelector('[data-case-value-col]')) {
      var th = document.createElement('th');
      th.className = 'n';
      th.setAttribute('data-case-value-col', 'true');
      th.textContent = 'Est. case value*';
      th.title = 'Uses only your optional fee-share and value-horizon assumptions';
      header.appendChild(th);
    }
    out.querySelectorAll('.sc-res table.sc-t tbody tr').forEach(function (tr) {
      var cell = tr.querySelector('[data-case-value-cell]');
      if (!cell) {
        cell = document.createElement('td');
        cell.className = 'n';
        cell.setAttribute('data-case-value-cell', 'true');
        tr.appendChild(cell);
      }
      var hit = hits[rowKey(tr)];
      var value = estimate(hit, assumptions);
      cell.textContent = value == null ? '—' : money(value);
      cell.title = assumptions.ready ? 'User-supplied working assumptions; not fee advice' : 'Enter optional working assumptions above';
    });
  }

  function csvCell(value) {
    var text = value == null ? '' : String(value);
    return /[",\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  }

  function exportCsv() {
    if (!snapshot) return;
    var assumptions = readAssumptions();
    if (!assumptions.ready) return;
    var run = snapshot.run || {};
    var rows = Array.isArray(run.hits) ? run.hits : [];
    var head = ['Address','Block','Lot','Town','County','Property_Class','Assessed','Annual_Tax_At_Stake','Fee_Share_Assumption_Pct','Value_Horizon_Years','Estimated_Case_Value','Opportunity_Index','Evidence_Grade','Formula_Version'];
    var lines = [head.join(',')].concat(rows.map(function (hit) {
      return [
        hit.a, hit.b, hit.l, run.name, run.county, hit.c || '2', hit.av, hit.saving,
        assumptions.feePct, assumptions.years, Math.round(estimate(hit, assumptions) || 0),
        hit.opportunity && hit.opportunity.score, hit.g && hit.g.k, snapshot.formulaVersion
      ].map(csvCell).join(',');
    }));
    var blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = 'attorney-working-set-' + String(run.name || 'municipality').toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function scheduleDecorate() {
    clearTimeout(decorateTimer);
    decorateTimer = setTimeout(decorate, 0);
  }

  window.fetch = function () {
    var args = arguments;
    return nativeFetch.apply(this, args).then(function (response) {
      try {
        var request = args[0];
        var url = typeof request === 'string' ? request : request && request.url;
        if (url && /\/functions\/v1\/appeal-prospect-scan(?:\?|$)/.test(url)) {
          response.clone().json().then(capture).catch(function () {});
        }
      } catch (_) {}
      return response;
    });
  };

  function ready() {
    panel();
    var out = document.getElementById('sc-out');
    if (!out || typeof MutationObserver === 'undefined') return;
    new MutationObserver(scheduleDecorate).observe(out, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
  else ready();
})();