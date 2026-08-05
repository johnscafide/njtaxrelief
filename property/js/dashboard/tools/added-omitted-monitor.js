/* Added / omitted assessment monitor and notice explainer. */
(function () {
  'use strict';
  var STORE = 'wd_added_omitted_monitor_v1';
  var propertyCache = {};

  function storeRead() {
    try { return JSON.parse(localStorage.getItem(STORE) || '{}') || {}; } catch (e) { return {}; }
  }
  function keyFor(r) { return String((r && (r.pams_pin || r.id)) || 'property'); }
  function savedFor(r) { return storeRead()[keyFor(r)] || {}; }
  function isoDate(value) { return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value) : ''; }
  function niceDate(value) {
    if (!value) return '';
    var d = new Date(value + 'T12:00:00');
    return isNaN(d.getTime()) ? value : d.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
  }
  function daysFrom(date) {
    if (!date) return null;
    var d = new Date(date + 'T12:00:00'), now = new Date();
    if (isNaN(d.getTime())) return null;
    return Math.ceil((d - now) / 86400000);
  }
  function appealDeadline(noticeDate) {
    var now = new Date(), year = now.getFullYear();
    if (noticeDate) year = new Date(noticeDate + 'T12:00:00').getFullYear();
    var dec1 = new Date(year, 11, 1, 12);
    var mailing = noticeDate ? new Date(noticeDate + 'T12:00:00') : null;
    if (mailing && !isNaN(mailing.getTime())) mailing.setDate(mailing.getDate() + 30);
    var due = mailing && mailing > dec1 ? mailing : dec1;
    while (due.getDay() === 0 || due.getDay() === 6) due.setDate(due.getDate() + 1);
    return due;
  }
  function deadlineText(s) {
    if (!s.notice_date || s.type === 'none' || !s.type) return 'If a notice arrives, the appeal is due by Dec. 1 of that tax year or 30 days after the collector completes the bulk mailing of added/omitted bills, whichever is later.';
    var d = appealDeadline(s.notice_date);
    var left = Math.ceil((d - new Date()) / 86400000);
    return '<b>Working deadline: ' + d.toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' }) + '.</b> ' +
      (left >= 0 ? left + ' day' + (left === 1 ? '' : 's') + ' remain based on the notice date you entered.' : 'That date has passed; contact the County Board immediately if this is still unresolved.') +
      ' Confirm the collector\'s actual bulk-mailing completion date because that date, not an individual envelope date, controls the 30-day alternative.';
  }
  function latestMovement(r) {
    if (typeof propertySnapshotPoints !== 'function') return null;
    var pts = propertySnapshotPoints(r);
    if (!pts || pts.length < 2) return null;
    var a = pts[pts.length - 2], b = pts[pts.length - 1], delta = (+b.assessed || 0) - (+a.assessed || 0);
    return delta ? { delta: delta, from: a.seen, to: b.seen } : null;
  }
  function riskRead(r, s) {
    var signals = [], built = +(r.yr_constr || r.year_built || r.year_constructed || 0), year = new Date().getFullYear();
    var movement = latestMovement(r);
    if (s.type && s.type !== 'none') signals.push('A ' + s.type.replace(/_/g, ' ') + ' notice is recorded in this monitor.');
    if (built >= year - 1) signals.push('The property record shows very recent construction (' + built + '), a common added-assessment trigger.');
    if (movement && movement.delta > 0) signals.push('Watchdog observed the assessment rise by ' + money(movement.delta) + ' between saved snapshots.');
    if (s.improvement === 'yes') signals.push('You marked a completed improvement after the normal Oct. 1 assessment date.');
    if (!signals.length) return { tone:'low', title:'No added/omitted signal recorded yet', text:'This is a monitor, not a municipal notice feed. Keep the property saved and enter any improvement or notice you receive.' };
    return { tone:'mid', title:'Review this property for an added/omitted assessment', text:signals.join(' ') };
  }
  function selected(value, current) { return value === current ? ' selected' : ''; }
  function checked(value) { return value ? ' checked' : ''; }

  function toolAddedOmitted(r) {
    propertyCache[keyFor(r)] = r;
    var s = savedFor(r), risk = riskRead(r, s), k = keyFor(r).replace(/[^a-zA-Z0-9_-]/g, '');
    return toolCard('Added & omitted assessment monitor', 'fa-bell',
      '<p class="tl-p">New construction or an improvement completed after the normal October 1 valuation date can create an added assessment. Property left off the tax list can create an omitted assessment. This monitor turns a notice into a deadline and evidence checklist.</p>' +
      '<div class="ao-alert ' + risk.tone + '"><i class="fas fa-bell"></i><div><b>' + esc(risk.title) + '</b><span>' + esc(risk.text) + '</span></div></div>' +
      '<div class="ao-form" id="ao-' + k + '">' +
        '<label><span>Have improvements been completed recently?</span><select data-ao="improvement"><option value="">Not entered</option><option value="yes"' + selected('yes',s.improvement) + '>Yes</option><option value="no"' + selected('no',s.improvement) + '>No</option></select></label>' +
        '<label><span>Notice type</span><select data-ao="type"><option value="none"' + selected('none',s.type || 'none') + '>No notice received</option><option value="added"' + selected('added',s.type) + '>Added assessment</option><option value="omitted"' + selected('omitted',s.type) + '>Omitted assessment</option><option value="omitted_added"' + selected('omitted_added',s.type) + '>Omitted added assessment</option></select></label>' +
        '<label><span>Notice / bulk-mailing date you know</span><input data-ao="notice_date" type="date" value="' + esc(isoDate(s.notice_date)) + '"></label>' +
        '<label><span>Added/omitted assessed amount</span><input data-ao="amount" inputmode="decimal" placeholder="e.g. 85000" value="' + esc(s.amount || '') + '"></label>' +
        '<button class="ao-save" type="button" onclick="dbAOMSave(\'' + esc(keyFor(r)).replace(/'/g, '') + '\')"><i class="fas fa-floppy-disk"></i> Save monitor</button>' +
      '</div>' +
      '<div class="ao-deadline"><i class="fas fa-calendar-check"></i><p>' + deadlineText(s) + '</p></div>' +
      '<div class="ao-explain"><b>What the state says the added value is</b><p>For an added assessment, the state form says the new amount should reflect the difference between the property\'s October 1 pretax-year assessed value and the taxable value after the improvement. The added value is prorated for the full months remaining after completion.</p></div>' +
      '<a class="tm-open" href="https://www.nj.gov/treasury/taxation/pdf/other_forms/lpt/adomap.pdf" target="_blank" rel="noopener">Open NJ Form AA-1 <i class="fas fa-arrow-up-right-from-square"></i></a>' +
      '<div class="tl-fine">Source: NJ Division of Taxation Form AA-1 (6-26) and Assessment & Appeals guidance. The form says an appeal must be received by the County Board by Dec. 1 of the tax year or 30 days after the collector completes bulk mailing, whichever is later; weekends/legal holidays extend to the next business day. This screen does not determine whether an assessment is valid and does not replace the notice or County Board instructions. Monitor entries are private to this browser.</div>');
  }

  window.dbAOMSave = function (key) {
    var id = String(key || '').replace(/[^a-zA-Z0-9_-]/g, ''), host = document.getElementById('ao-' + id);
    if (!host) return;
    var data = {};
    host.querySelectorAll('[data-ao]').forEach(function (node) { data[node.getAttribute('data-ao')] = node.value; });
    var all = storeRead(); all[String(key)] = data;
    try { localStorage.setItem(STORE, JSON.stringify(all)); } catch (e) {}
    if (typeof toast === 'function') toast('Added/omitted monitor saved');
    var r = propertyCache[String(key)];
    if (r) { var card = host.closest('.sec'); if (card) card.outerHTML = toolAddedOmitted(r); }
  };

  Object.assign(window, { toolAddedOmitted: toolAddedOmitted, addedOmittedSavedFor: savedFor });
})();

export {};
