/* Watchdog Attorney Appeal Pipeline evidence brief.
 * Uses only values returned by the server-authoritative appeal-prospect-scan
 * response. It does not recompute Chapter 123, market value, ranking, filing
 * deadlines, fees, represented status, or appeal outcomes in the browser.
 */
(function () {
  'use strict';

  if (new URLSearchParams(window.location.search).get('mode') !== 'attorney') return;

  var nativeFetch = window.fetch;
  var snapshot = null;
  var byAddress = Object.create(null);
  var decorateTimer = null;

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  }

  function key(value) { return String(value == null ? '' : value).trim().toLowerCase(); }
  function money(value) {
    var n = Number(value);
    return Number.isFinite(n) ? '$' + Math.round(n).toLocaleString() : 'not on file';
  }
  function percent(value, digits) {
    var n = Number(value);
    return Number.isFinite(n) ? (n * 100).toFixed(digits == null ? 1 : digits) + '%' : 'not on file';
  }
  function dateLabel(value) {
    var match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return value ? String(value) : 'not on file';
    return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
      .toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
  }
  function row(label, value, note) {
    return '<tr><th>' + esc(label) + '</th><td>' + esc(value) + (note ? '<small>' + esc(note) + '</small>' : '') + '</td></tr>';
  }

  function capture(payload) {
    if (!payload || payload.result !== 'ok' || !payload.run || !Array.isArray(payload.run.hits)) return;
    snapshot = {
      run: payload.run,
      formulaVersion: payload.formula_version || '',
      generatedAt: payload.generated_at || '',
      source: payload.source || null,
      deadlineSource: payload.deadline_source || null
    };
    byAddress = Object.create(null);
    payload.run.hits.forEach(function (hit) {
      var k = key(hit && hit.a);
      if (!k) return;
      if (Object.prototype.hasOwnProperty.call(byAddress, k)) byAddress[k] = null;
      else byAddress[k] = hit;
    });
    scheduleDecorate();
  }

  function sourceNote() {
    if (!snapshot) return '';
    var run = snapshot.run || {};
    var certified = run.certified || {};
    var bits = [];
    if (snapshot.formulaVersion) bits.push('Formula ' + snapshot.formulaVersion);
    if (certified.key) bits.push('Certified ratio record ' + certified.key);
    if (run.rateYear) bits.push('General Tax Rate year ' + run.rateYear);
    if (run.valuationDate) bits.push('Pretax valuation date ' + run.valuationDate);
    if (run.saleCutoff) bits.push('Sale cutoff ' + run.saleCutoff);
    return bits.join(' · ');
  }

  function deadlineBlock(run) {
    var context = run && run.deadlineContext;
    if (!context || context.status !== 'verify_current_notice') {
      return '<div class="notice"><b>Filing date not supplied.</b> Verify the current assessment notice and County Board instructions before relying on any filing date.</div>';
    }
    var board = context.county_board || {};
    var parts = [];
    if (board.statutory_baseline) parts.push('County Board statutory baseline: ' + dateLabel(board.statutory_baseline));
    if (board.choose_later_of_baseline_or_bulk_mailing === true && Number(board.bulk_mailing_days) > 0) {
      parts.push('A later filing date can apply ' + Number(board.bulk_mailing_days) + ' days after the certified bulk mailing.');
    }
    if (Number(context.change_of_assessment_notice_days) > 0) {
      parts.push('A qualifying change-of-assessment notice can create a ' + Number(context.change_of_assessment_notice_days) + '-day window from issuance.');
    }
    return '<div class="notice"><b>Filing-window context, not a deadline.</b> ' + esc(parts.join(' ')) + ' Verify the current notice, forum, revaluation/reassessment status, and any weekend/legal-holiday adjustment. No countdown is generated.</div>';
  }

  function factors(hit) {
    var parts = hit && hit.opportunity && Array.isArray(hit.opportunity.parts) ? hit.opportunity.parts : [];
    if (!parts.length) return '<p class="muted">No opportunity-factor detail was returned.</p>';
    return '<table class="factors"><thead><tr><th>Server-returned factor</th><th>Signal</th><th>Weight</th></tr></thead><tbody>' + parts.map(function (part) {
      return '<tr><td>' + esc(part.label || '') + '</td><td>' + esc(Math.round(Number(part.value) || 0) + '/100') + '</td><td>' + esc(String(part.weight == null ? '' : part.weight) + '%') + '</td></tr>';
    }).join('') + '</tbody></table>';
  }

  function briefHtml(hit) {
    var run = snapshot.run || {};
    var certified = run.certified || {};
    var score = hit && hit.opportunity && hit.opportunity.score != null ? String(hit.opportunity.score) : 'not on file';
    var band = hit && hit.opportunity && hit.opportunity.band || 'not on file';
    var grade = hit && hit.g && hit.g.k ? hit.g.k + (hit.g.t ? ' · ' + hit.g.t : '') : 'not on file';
    var sourceUrl = snapshot.source && /^https:\/\//i.test(String(snapshot.source.url || '')) ? String(snapshot.source.url) : '';
    var generated = snapshot.generatedAt ? new Date(snapshot.generatedAt).toLocaleString() : 'not on file';

    return '<!doctype html><html><head><meta charset="utf-8"><title>Attorney screening evidence brief, ' + esc(hit.a) + '</title><style>' +
      '@page{margin:18mm}body{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#111827;margin:0;font-size:11pt;line-height:1.45}' +
      'h1{font-size:20pt;margin:0 0 4px}h2{font-size:12pt;text-transform:uppercase;letter-spacing:.06em;margin:22px 0 8px;border-bottom:1px solid #cbd5e1;padding-bottom:5px}' +
      '.sub{color:#475569;margin-bottom:3px}.rule{border-bottom:3px solid #0f2747;margin:14px 0 18px}' +
      'table{width:100%;border-collapse:collapse}th,td{text-align:left;vertical-align:top;padding:6px 8px;border-bottom:1px solid #e2e8f0}th{width:38%;color:#475569;font-weight:600}td small{display:block;color:#64748b;margin-top:2px}' +
      '.factors th{width:auto;background:#f8fafc}.notice{margin:14px 0;padding:11px 13px;background:#fff7ed;border-left:4px solid #c2410c}' +
      '.warn{margin-top:20px;padding:12px 14px;background:#fef2f2;border-left:4px solid #b91c1c}.muted,.sources{color:#64748b;font-size:9.5pt}.sources{margin-top:18px;border-top:1px solid #cbd5e1;padding-top:10px}' +
      '</style></head><body>' +
      '<h1>Attorney screening evidence brief</h1><div class="sub">' + esc(hit.a) + ', ' + esc(run.name || '') + ', ' + esc(run.county || '') + ' County, New Jersey</div>' +
      '<div class="sub">Generated from an entitled Watchdog server result · ' + esc(generated) + '</div><div class="rule"></div>' +
      '<h2>Subject and governed sale evidence</h2><table>' +
      row('Property class', hit.c || '2', 'Current automated scanner is limited to Class 2 residential') +
      row('Block / lot', String(hit.b || '') + ' / ' + String(hit.l || '')) +
      row('Assessment', money(hit.av)) +
      row('NJ-verified sale', money(hit.p), hit.y ? 'Sale year ' + hit.y : '') +
      row('Market at pretax valuation date', money(hit.market), run.valuationDate ? 'Valuation date ' + run.valuationDate : '') +
      '</table>' +
      '<h2>Server-returned Chapter 123 screen</h2><table>' +
      row('Certified Director average ratio', percent(certified.ratio, 2)) +
      row('Applied upper common-level bound', percent(certified.upper_applied, 2)) +
      row('Chapter 123 screening threshold', money(hit.limit)) +
      row('Supported assessment', money(hit.fair)) +
      row('Assessment above threshold', money(hit.over)) +
      row('Estimated annual tax at stake', money(hit.saving), 'Screening estimate, not an appeal outcome or award') +
      row('Evidence grade', grade) +
      row('Opportunity index', score, band) +
      '</table>' +
      '<h2>Opportunity factors</h2>' + factors(hit) +
      '<h2>Filing-window context</h2>' + deadlineBlock(run) +
      '<h2>Provenance</h2><p class="sources">' + esc(sourceNote()) + (sourceUrl ? '<br>Certified Chapter 123 source: ' + esc(sourceUrl) : '') + '</p>' +
      '<div class="warn"><b>Screening evidence only.</b> This brief is not a filed pleading, legal opinion, appraisal, appeal-outcome prediction, fee recommendation, or final filing-deadline determination. It contains no owner-contact or represented-status conclusion. Public records cannot establish current condition, renovations, interior finish, exemptions, or other facts that require professional review. Confirm the property record and supporting evidence before action.</div>' +
      '</body></html>';
  }

  function openBrief(hit) {
    if (!snapshot || !hit) return;
    var w = window.open('', '_blank');
    if (!w) return;
    w.document.write(briefHtml(hit));
    w.document.close();
    setTimeout(function () { try { w.print(); } catch (_) {} }, 450);
    if (typeof gtag === 'function') gtag('event', 'attorney_evidence_brief', { town: snapshot.run && snapshot.run.name || '' });
  }

  function decorate() {
    decorateTimer = null;
    if (!snapshot) return;
    var out = document.getElementById('sc-out');
    if (!out) return;
    out.querySelectorAll('.sc-res tbody tr').forEach(function (tr) {
      if (tr.querySelector('.sc-evidence-brief')) return;
      var address = tr.querySelector('.sc-address');
      var cell = address && address.closest('td');
      if (!address || !cell) return;
      var hit = byAddress[key(address.textContent)];
      if (!hit) return;
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'sc-quick sc-evidence-brief';
      button.title = 'Open a printable brief using only this server-returned screening result';
      button.innerHTML = '<i class="fas fa-file-lines"></i><span>Evidence brief</span>';
      button.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        openBrief(hit);
      });
      cell.appendChild(button);
    });
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
    var out = document.getElementById('sc-out');
    if (!out || typeof MutationObserver === 'undefined') return;
    new MutationObserver(scheduleDecorate).observe(out, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
  else ready();
})();