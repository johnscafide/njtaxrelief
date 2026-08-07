/* Watchdog proprietary: property-level appeal opportunity triage. */
(function () {
  'use strict';

  function clamp(value) { return Math.max(0, Math.min(100, +value || 0)); }
  function calc(r) {
    var c = typeof chapter123 === 'function' ? chapter123(r) : null;
    var u = typeof uniFor === 'function' ? uniFor(r) : null;
    var a = typeof appealFor === 'function' ? appealFor(r) : null;
    var evidence = typeof appealEvidenceStrength === 'function' ? appealEvidenceStrength(r) : null;
    var parts = [], available = 0;

    function add(label, weight, value, note) {
      if (value == null || !isFinite(value)) return;
      available += weight;
      parts.push({ label: label, weight: weight, value: clamp(value), note: note || '' });
    }

    if (c && c.testable) {
      var margin = c.hasCase && r.assessed ? Math.max(0, +c.over || 0) / Math.max(1, +r.assessed) : 0;
      add('Chapter 123 position', 35, c.hasCase ? 70 + Math.min(30, margin * 300) : 0,
        c.hasCase ? 'Independent value evidence places the assessment above the statutory cushion.' : 'The current independent value anchor remains inside the statutory cushion.');
    }
    if (evidence) add('Evidence file strength', 25, evidence.score, evidence.band + ' evidence file');
    if (u) add('Assessment consistency', 15, 100 - clamp(u.score), 'Lower municipal consistency increases review priority; it does not prove this parcel is wrong.');
    if (a && a.latest) add('County appeal outcomes', 10, +a.latest.win_rate_filed, 'Historical county outcomes are context, not a forecast of this appeal.');
    if (c && c.testable && c.saving != null) add('Annual dollars at stake', 15, clamp((+c.saving || 0) / 2500 * 100), 'Scaled at $2,500 estimated annual savings for triage only.');

    var weighted = parts.reduce(function (total, p) { return total + p.value * p.weight; }, 0);
    var score = available ? Math.round(weighted / available) : null;
    var confidence = Math.round(available);
    var band = score == null ? 'Not enough evidence' : score >= 75 ? 'High-priority review' : score >= 55 ? 'Worth investigating' : score >= 35 ? 'Needs stronger evidence' : 'Low current signal';
    return { score: score, confidence: confidence, band: band, parts: parts, testable: !!(c && c.testable), caseSignal: !!(c && c.testable && c.hasCase), chapter: c, evidence: evidence };
  }

  function card(r) {
    var v = calc(r), score = v.score == null ? '&mdash;' : v.score;
    var message = v.score == null
      ? 'The current record does not contain enough independent evidence to rank this property yet.'
      : v.caseSignal
        ? 'The current record has an independent Chapter 123 signal. This is a reason for professional review, not a prediction that an appeal will succeed.'
        : 'The known evidence does not currently show a strong Chapter 123 position. Adding better comparable evidence can change the screen.';
    return toolCard('Watchdog Appeal Opportunity Index', 'fa-magnifying-glass-chart',
      '<p class="tl-p">One triage number for the question professionals actually ask first: <b>is this file worth opening?</b> It combines only the appeal signals currently available and reports missing inputs as lower confidence instead of treating them as evidence against the property.</p>' +
      '<div class="aoi-hero"><div class="aoi-score"><b>' + score + '</b><span>/ 100 opportunity</span></div><div><strong>' + v.band + '</strong><p>' + message + '</p><span class="aoi-confidence">Evidence coverage ' + v.confidence + '%</span></div></div>' +
      '<div class="aoi-parts">' + (v.parts.length ? v.parts.map(function (p) { return '<div title="' + esc(p.note) + '"><span>' + p.label + '</span><b>' + Math.round(p.value) + '</b><i><em style="width:' + p.value + '%"></em></i></div>'; }).join('') : '<p>No appeal inputs are available yet.</p>') + '</div>' +
      '<div class="tl-fine">Watchdog-derived screening marker. It is not a win probability, appraisal, legal opinion, or filing recommendation. Available inputs are normalized across their published/derived scales; unavailable inputs reduce evidence coverage rather than the opportunity score.</div>');
  }

  Object.assign(window, { appealOpportunityIndex: calc, toolAppealOpportunity: card });
})();
export {};
