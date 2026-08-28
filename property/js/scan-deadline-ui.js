/* Watchdog Attorney Appeal Pipeline filing-window context.
 * Observes the server-authoritative appeal-prospect-scan response and renders
 * only the governed filing-window context returned by the Edge Function.
 * No filing-date calculation or countdown is performed in the browser.
 */
(function () {
  'use strict';

  if (new URLSearchParams(window.location.search).get('mode') !== 'attorney') return;

  var nativeFetch = window.fetch;
  var latest = null;

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  }

  function formatDate(value) {
    var match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return '';
    var date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    return date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  }

  function contextFrom(payload) {
    if (!payload || typeof payload !== 'object') return null;
    return payload.deadline_context || (payload.run && payload.run.deadlineContext) || null;
  }

  function thresholdLabel(context) {
    var direct = context && context.direct_tax_court || {};
    var threshold = Number(direct.ordinary_assessment_must_exceed);
    if (!Number.isFinite(threshold) || threshold <= 0) return '';
    return '$' + Math.round(threshold).toLocaleString();
  }

  function markup(context) {
    if (!context || context.status !== 'verify_current_notice') return '';
    var countyBoard = context.county_board || {};
    var baseline = formatDate(countyBoard.statutory_baseline);
    var threshold = thresholdLabel(context);
    var calendar = context.calendar === 'alternate' ? 'alternate assessment calendar' : 'traditional assessment calendar';
    var laterRule = countyBoard.choose_later_of_baseline_or_bulk_mailing === true && Number(countyBoard.bulk_mailing_days) > 0;
    var noticeDays = Number(context.change_of_assessment_notice_days);

    return '<section class="sc-method sc-deadline-context" data-deadline-status="verify_current_notice" aria-label="New Jersey appeal filing-window context">' +
      '<h4><i class="fas fa-calendar-check"></i> Filing-window context <span style="font-weight:600;color:#9a6700">Verify current notice</span></h4>' +
      '<p><b>County Board statutory baseline:</b> ' + (baseline ? esc(baseline) : 'not available') + ' under the ' + esc(calendar) + '.</p>' +
      (laterRule ? '<p>New Jersey rules can make the County Board filing date <b>' + Number(countyBoard.bulk_mailing_days) + ' days after the certified bulk mailing</b> when that date is later than the statutory baseline.</p>' : '') +
      (Number.isFinite(noticeDays) && noticeDays > 0 ? '<p>A qualifying Notification of Change of Assessment can also create a <b>' + noticeDays + '-day filing window</b> from issuance.</p>' : '') +
      (threshold ? '<p><b>Direct Tax Court:</b> ordinary assessments <b>over ' + esc(threshold) + '</b> may qualify for direct filing. This municipality-level view does not determine parcel-specific forum eligibility.</p>' : '') +
      '<p class="sc-warn"><b>This is not a final filing deadline.</b> Watchdog does not show days remaining from this baseline. Verify the current assessment notice, certified bulk-mailing date, forum, revaluation/reassessment status, and any weekend or legal-holiday adjustment before relying on a date.</p>' +
      '</section>';
  }

  function render() {
    if (!latest) return;
    var out = document.getElementById('sc-out');
    if (!out) return;
    var existing = out.querySelector('.sc-deadline-context');
    if (existing) existing.remove();
    var html = markup(latest);
    if (!html) return;

    var result = out.querySelector('.sc-res');
    if (result) {
      var lede = result.querySelector('.sc-lede');
      if (lede) lede.insertAdjacentHTML('afterend', html);
      else result.insertAdjacentHTML('afterbegin', html);
      return;
    }

    var state = out.querySelector('.sc-none, .sc-err');
    if (state) state.insertAdjacentHTML('beforeend', html);
  }

  function capture(payload) {
    var context = contextFrom(payload);
    if (!context) return;
    latest = context;
    window.__watchdogAppealDeadlineContext = context;
    window.dispatchEvent(new CustomEvent('watchdog:appeal-deadline-context', { detail: context }));
    setTimeout(render, 0);
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
    new MutationObserver(function () { setTimeout(render, 0); }).observe(out, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
  else ready();
})();
