/* ==========================================================================
   Property Pulse, in the Watchdog board design.
   Reads saved properties, alert preferences, property update events and
   trusted Watchdog Score observations. Writes only what the member changes:
   alert preferences and read receipts. Data jobs create the events; this
   page reads and explains them and never creates historical evidence.
   ========================================================================== */
(function () {
  'use strict';
  var URL_FALLBACK = 'https://uvkvaxljhhngydvlrzom.supabase.co',
      KEY_FALLBACK = 'sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa';
  var client = null, user = null, properties = [], prefs = [], events = [], scoreHistory = [];
  var ui = { pin: 'all', days: 183, type: 'all', day: '', selected: '', all: false, prefPin: '', calY: new Date().getFullYear(), calM: new Date().getMonth() };
  var DAY = 86400000, LIST_LIMIT = 8;
  var TYPES = [['all', 'All'], ['score_change', 'Scores'], ['assessment_change', 'Assessment'], ['tax_change', 'Tax'], ['permit_change', 'Permits'], ['deed_change', 'Deeds'], ['source_refresh', 'Sources']];
  var TYPE_LABEL = { appeal_deadline: 'Appeal deadline', score_change: 'Score', assessment_change: 'Assessment', tax_change: 'Tax', permit_change: 'Permit', deed_change: 'Deed', environment_change: 'Environment', evidence_change: 'Evidence', market_change: 'Market', municipal_change: 'Municipal', source_refresh: 'Source refresh' };
  var PREF_OPTS = [['alert_score', 'Score changes', 'fa-chart-line'], ['alert_tax', 'Tax changes', 'fa-receipt'], ['alert_assessment', 'Assessment changes', 'fa-building-columns'], ['alert_deadline', 'Appeal deadlines', 'fa-calendar-day']];

  function $(id) { return document.getElementById(id); }
  function sb() {
    if (client) return client;
    var rt = window.NJPTRSupabaseRuntime;
    if (rt && typeof rt.createClient === 'function') { try { client = rt.createClient(); return client; } catch (_) {} }
    client = window.supabase.createClient(URL_FALLBACK, KEY_FALLBACK, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce', storageKey: 'sb-uvkvaxljhhngydvlrzom-auth-token' } });
    return client;
  }
  function route(path) {
    var rt = window.NJPTRSupabaseRuntime, prefix = rt && typeof rt.routePrefix === 'string' ? rt.routePrefix : ((location.hostname === 'watchdogindex.com' || location.hostname === 'www.watchdogindex.com') ? '' : '/property');
    return prefix + (path.charAt(0) === '/' ? path : '/' + path);
  }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function date(v) { var d = new Date(v); return Number.isFinite(d.getTime()) ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''; }
  function short(v) { var d = new Date(v); return Number.isFinite(d.getTime()) ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''; }
  function dateKey(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function safeUrl(v) { try { var u = new URL(v); return /^https?:$/.test(u.protocol) ? u.href : ''; } catch (_) { return ''; } }
  function plural(n, a, b) { return n === 1 ? a : b; }
  function icon(t) { return ({ appeal_deadline: 'fa-scale-balanced', score_change: 'fa-chart-line', assessment_change: 'fa-building-columns', tax_change: 'fa-receipt', permit_change: 'fa-helmet-safety', deed_change: 'fa-file-signature', environment_change: 'fa-leaf', evidence_change: 'fa-diagram-project', market_change: 'fa-house-signal', municipal_change: 'fa-city' }[t] || 'fa-satellite-dish'); }
  function tone(e) { var s = String(e.severity || '').toLowerCase(); return s === 'action' || s === 'high' || s === 'critical' ? 'review' : s === 'watch' || s === 'medium' || s === 'warning' ? 'watch' : 'good'; }
  function toneLabel(e) { return { review: 'Action', watch: 'Watch', good: 'Info' }[tone(e)]; }
  function propFor(pin) { return properties.filter(function (p) { return p.pams_pin === pin; })[0] || null; }
  function propName(p) { return p ? (p.nickname || p.address || p.pams_pin) : 'Saved property'; }
  function setHTML(id, html) { var el = $(id); if (!el || el.__html === html) return; el.__html = html; el.innerHTML = html; }
  function toast(msg) { var t = $('wdd-toast'); if (!t) return; t.textContent = msg; t.classList.add('is-on'); clearTimeout(t.__t); t.__t = setTimeout(function () { t.classList.remove('is-on'); }, 2400); }
  function refocus(sel) { setTimeout(function () { var el = document.querySelector(sel); if (el) el.focus({ preventScroll: true }); }, 0); }

  function inRange() {
    var cutoff = ui.days ? Date.now() - ui.days * DAY : 0;
    return events.filter(function (e) {
      return (!cutoff || new Date(e.occurred_at).getTime() >= cutoff) && (ui.pin === 'all' || e.pams_pin === ui.pin);
    });
  }
  function inView() {
    return inRange().filter(function (e) {
      if (ui.type !== 'all' && e.event_type !== ui.type) return false;
      if (ui.day) { var d = new Date(e.occurred_at); if (!Number.isFinite(d.getTime()) || dateKey(d) !== ui.day) return false; }
      return true;
    });
  }
  function rangeLabel() { return { 30: 'the last 30 days', 183: 'the last 6 months', 365: 'the last year', 0: 'all time' }[ui.days] || 'this period'; }

  /* ---------------------------------------------------------------- head */
  function paintHead() {
    var n = properties.length, list = inRange(), unread = list.filter(function (e) { return !e.read_at; }).length;
    var who = ui.pin === 'all' ? '<b>' + n + ' ' + plural(n, 'property', 'properties') + '</b>' : '<b>' + esc(propName(propFor(ui.pin))) + '</b>';
    setHTML('pulse-line', 'Everything that moved across ' + who + ' in ' + rangeLabel() + ': <b>' + list.length + ' ' + plural(list.length, 'change', 'changes') + '</b>' + (unread ? ', ' + unread + ' unread.' : '.'));
    var sel = $('pulse-property');
    var opts = '<option value="all">All properties</option>' + properties.map(function (p) { return '<option value="' + esc(p.pams_pin) + '">' + esc(propName(p)) + '</option>'; }).join('');
    if (sel.__opts !== opts) { sel.__opts = opts; sel.innerHTML = opts; }
    sel.value = ui.pin;
    setHTML('pulse-types', TYPES.map(function (t) { return '<button type="button" data-type="' + t[0] + '" aria-pressed="' + (ui.type === t[0]) + '">' + t[1] + '</button>'; }).join(''));
  }

  /* --------------------------------------------------------------- cards */
  var DECO = {
    shield: '<svg class="wdd-deco wdd-deco--shield" viewBox="0 0 100 116" aria-hidden="true" focusable="false"><path d="M50 2 94 18v34c0 30-19 52-44 62C25 104 6 82 6 52V18Z" stroke="none"/><path d="m30 58 14 14 28-30" fill="none" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    house: '<svg class="wdd-deco wdd-deco--house" viewBox="0 0 100 92" aria-hidden="true" focusable="false"><path d="M50 4 96 42h-12v46H62V62H38v26H16V42H4Z"/></svg>',
    magnifier: '<svg class="wdd-deco wdd-deco--magnifier" viewBox="0 0 100 100" aria-hidden="true" focusable="false"><circle cx="42" cy="42" r="28" stroke-width="14"/><path d="m64 64 26 26" stroke-width="16" stroke-linecap="round"/></svg>',
    pin: '<svg class="wdd-deco wdd-deco--pin" viewBox="0 0 80 100" aria-hidden="true" focusable="false"><path d="M40 2C19 2 4 17 4 37c0 26 36 61 36 61s36-35 36-61C76 17 61 2 40 2Z"/><circle cx="40" cy="37" r="13"/></svg>'
  };
  function stat(v, unit, cap, lead) { return '<div class="wdd-stat' + (lead ? ' is-lead' : '') + '"><b>' + v + (unit ? '<small>' + unit + '</small>' : '') + '</b><span>' + cap + '</span></div>'; }
  function trendPin() { return ui.pin !== 'all' ? ui.pin : (properties[0] && properties[0].pams_pin) || ''; }

  function scoreCard() {
    var pin = trendPin(), p = propFor(pin), pts = scoreHistory.slice(-17), bars, s = '', head;
    if (!pts.length) {
      head = stat('-', '', 'Latest', true) + stat('-', '', 'Change') + stat('0', '', 'Observations');
      bars = '<div class="wdd-bars" aria-hidden="true">' + [40, 52, 46, 60, 55, 62, 58].map(function (h) { return '<span class="wdd-bar is-empty"><i style="height:' + h + '%"></i></span>'; }).join('') + '</div>';
      s = 'No trusted score history has been captured for this property yet.';
    } else {
      var vals = pts.map(function (o) { return +o.score; }), first = +scoreHistory[0].score, last = +scoreHistory[scoreHistory.length - 1].score, d = last - first;
      var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals), span = (hi - lo) || 1;
      head = stat(String(Math.round(last)), '/100', 'Latest', true) + stat((d > 0 ? '+' : d < 0 ? '−' : '') + Math.abs(d).toFixed(1), '', 'Since ' + short(scoreHistory[0].observed_at)) + stat(String(scoreHistory.length), '', 'Observations');
      bars = '<div class="wdd-bars" role="img" aria-label="' + esc('Watchdog Score for ' + propName(p) + ', ' + pts.length + ' latest trusted observations, from ' + vals[0] + ' to ' + last + '.') + '">' + pts.map(function (o, i) {
        var h = 18 + ((+o.score - lo) / span) * 78;
        return '<span class="wdd-bar' + (i === pts.length - 1 ? ' is-selected' : '') + '" title="' + esc(date(o.observed_at) + ': ' + o.score) + '"><i style="height:' + h.toFixed(0) + '%"></i></span>';
      }).join('') + '</div>';
      s = 'Scale ' + Math.round(lo) + '–' + Math.round(hi) + ' · ' + esc(propName(p));
    }
    return '<article class="wdd-card wdd-card--score">' + DECO.shield + '<div class="wdd-card-head"><h2>Watchdog Score:</h2></div><div class="wdd-stats">' + head + '</div><div class="wdd-bars-wrap">' + bars + '</div><div class="wdd-axis"><span>' + s + '</span></div></article>';
  }
  function weekly(list) {
    var weeks = ui.days ? Math.max(4, Math.min(26, Math.ceil(ui.days / 7))) : 26, end = new Date(); end.setHours(23, 59, 59, 999);
    var endT = end.getTime(), out = [];
    for (var i = 0; i < weeks; i++) out.push({ from: endT - (weeks - i) * 7 * DAY, count: 0 });
    list.forEach(function (e) { var t = new Date(e.occurred_at).getTime(); if (!Number.isFinite(t)) return; var idx = weeks - 1 - Math.floor((endT - t) / (7 * DAY)); if (idx >= 0 && idx < weeks) out[idx].count++; });
    return out;
  }
  function changesCard() {
    var list = inRange(), unread = list.filter(function (e) { return !e.read_at; }).length, affected = {}, wk = weekly(list);
    list.forEach(function (e) { affected[e.pams_pin] = 1; });
    var max = Math.max.apply(null, wk.map(function (w) { return w.count; }).concat([1])), W = 600, top = 12, base = 108;
    var pts = wk.map(function (w, i) { return [6 + i * (W - 12) / Math.max(1, wk.length - 1), base - (w.count / max) * (base - top)]; });
    var d = pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ');
    var peak = -1, pc = 0; wk.forEach(function (w, i) { if (w.count > pc) { pc = w.count; peak = i; } });
    return '<article class="wdd-card wdd-card--changes">' + DECO.house + '<div class="wdd-card-head"><h2>Changes:</h2></div><div class="wdd-stats">' +
      stat(String(unread), '', 'Unread', true) + stat(String(list.length), '', 'In ' + (ui.days ? 'range' : 'total')) + stat(String(Object.keys(affected).length), properties.length ? 'of ' + properties.length : '', 'Properties') + '</div>' +
      '<svg class="wdd-line" viewBox="0 0 600 120" preserveAspectRatio="none" role="img" aria-label="' + esc('Changes per week, ' + rangeLabel() + (peak > -1 ? '. Busiest week: ' + pc + ' ' + plural(pc, 'change', 'changes') + ', week of ' + short(wk[peak].from + DAY) + '.' : '. No changes.')) + '"><line class="wdd-line-base" x1="0" y1="108" x2="600" y2="108" vector-effect="non-scaling-stroke"/>' +
      (peak > -1 ? '<line class="wdd-line-drop" x1="' + pts[peak][0].toFixed(1) + '" y1="' + pts[peak][1].toFixed(1) + '" x2="' + pts[peak][0].toFixed(1) + '" y2="108" vector-effect="non-scaling-stroke"/>' : '') +
      '<path class="wdd-line-path" d="' + d + '" vector-effect="non-scaling-stroke"/></svg>' +
      '<div class="wdd-line-axis" aria-hidden="true"><span>' + esc(short(wk[0].from + DAY)) + '</span>' + (peak > -1 ? '<b>' + esc(short(wk[peak].from + DAY)) + '</b>' : '') + '<span>Today</span></div></article>';
  }
  function typeCard() {
    var list = inRange(), c = {};
    list.forEach(function (e) { c[e.event_type] = (c[e.event_type] || 0) + 1; });
    var main = ['assessment_change', 'tax_change', 'score_change'], rest = list.length - main.reduce(function (s, k) { return s + (c[k] || 0); }, 0);
    return '<article class="wdd-card wdd-card--status">' + DECO.magnifier + '<div class="wdd-card-head"><h2>By type:</h2></div><div class="wdd-stats">' +
      stat(String(c.assessment_change || 0), '', 'Assessment', true) + stat(String(c.tax_change || 0), '', 'Tax') + stat(String(c.score_change || 0), '', 'Score') + '</div>' +
      (rest ? '<p class="wdd-card-note">Plus ' + rest + ' permit, deed, source and other ' + plural(rest, 'change', 'changes') + '.</p>' : '') + '</article>';
  }
  function actionCard() {
    var acts = inRange().filter(function (e) { return tone(e) === 'review'; }), latest = acts[0];
    return '<article class="wdd-card wdd-card--value">' + DECO.pin + '<div class="wdd-card-head"><h2>Action signs:</h2></div><div class="wdd-stats">' +
      stat(String(acts.length), '', 'Higher priority', true) + stat(String(acts.filter(function (e) { return !e.read_at; }).length), '', 'Unread') + '</div>' +
      '<p class="wdd-card-note">' + (latest ? 'Latest: <b>' + esc(latest.title) + '</b>, ' + esc(propName(propFor(latest.pams_pin))) + ' · ' + esc(short(latest.occurred_at)) : 'No higher-priority changes in ' + rangeLabel() + '.') + '</p></article>';
  }
  function paintCards() { setHTML('pulse-cards', scoreCard() + changesCard() + typeCard() + actionCard()); }

  /* ------------------------------------------------------- ledger+detail */
  function selectedEvent(list) {
    if (!list.length) return null;
    var e = list.filter(function (x) { return String(x.id) === ui.selected; })[0];
    if (!e) { e = list[0]; ui.selected = String(e.id); }
    return e;
  }
  function paintLedger() {
    var list = inView(), sel = selectedEvent(list), unread = events.some(function (e) { return !e.read_at; });
    var head = '<div class="wdd-section-head"><h2 id="pulse-ledger-title">Change ledger</h2>' + (unread ? '<button type="button" class="wdd-list-more pulse-readall" data-act="read-all">Mark all read</button>' : '') + '</div>';
    var body;
    if (!list.length) body = '<div class="wdd-empty"><i class="fas fa-wave-square" aria-hidden="true"></i><p>' + (events.length ? 'No changes match this view. Try another time range, property or change type.' : 'No verified changes yet. New events will appear here with their source and date.') + '</p>' + (ui.day ? '<button type="button" class="wdd-btn" data-act="clear-day">Show all days</button>' : '') + '</div>';
    else {
      var shown = ui.all ? list : list.slice(0, LIST_LIMIT);
      body = (ui.day ? '<p class="pulse-dayline">Showing ' + esc(new Date(ui.day + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' })) + ' · <button type="button" class="pulse-link" data-act="clear-day">Show all days</button></p>' : '') +
        '<ul class="wdd-rows" aria-labelledby="pulse-ledger-title">' + shown.map(function (e) {
          var t = tone(e), on = sel && String(e.id) === String(sel.id);
          return '<li><button type="button" class="wdd-row' + (on ? ' is-selected' : '') + '" data-event="' + esc(e.id) + '" aria-pressed="' + on + '"><span class="wdd-row-icon is-tone-' + t + '" aria-hidden="true"><i class="fas ' + icon(e.event_type) + '"></i></span><span class="wdd-row-text"><b>' + esc(e.title || 'Property change') + '</b><small>' + esc(propName(propFor(e.pams_pin))) + ' · ' + esc(short(e.occurred_at)) + (e.read_at ? '' : ' · New') + '</small></span><span class="wdd-tag is-tone-' + t + '">' + toneLabel(e) + '</span></button></li>';
        }).join('') + '</ul>' +
        (list.length > LIST_LIMIT ? '<button type="button" class="wdd-list-more" data-act="list-all" aria-expanded="' + ui.all + '">' + (ui.all ? 'Show fewer' : 'Show all ' + list.length) + '</button>' : '');
    }
    setHTML('pulse-ledger', head + body);
    paintDetail(sel);
  }
  function paintDetail(e) {
    var head = '<div class="wdd-section-head"><h2>Change details</h2></div>';
    if (!e) { setHTML('pulse-detail', head + '<div class="wdd-detail-card"><p class="pulse-muted">Pick a change from the ledger to see what moved, when, and where the evidence came from.</p></div>'); return; }
    var p = propFor(e.pams_pin), src = safeUrl(e.source_url), plan = e.minimum_plan && e.minimum_plan !== 'standard' ? (e.minimum_plan === 'pro_plus' ? 'PRO+' : 'PRO') : '';
    var tags = ['<span>' + toneLabel(e) + '</span>', '<span>' + esc(TYPE_LABEL[e.event_type] || 'Change') + '</span>', '<span>' + (e.read_at ? 'Read' : 'New') + '</span>'];
    if (plan) tags.push('<span>' + plan + '</span>');
    var rows = [];
    if (e.summary) rows.push(['What happened', esc(e.summary)]);
    if (e.old_value != null || e.new_value != null) {
      var arrow = e.delta_numeric > 0 ? '↑' : e.delta_numeric < 0 ? '↓' : '→';
      rows.push(['Before → after', esc(e.old_value || '-') + ' <span class="pulse-arrow">' + arrow + '</span> ' + esc(e.new_value || '-')]);
    }
    rows.push(['Recorded', esc(date(e.occurred_at))]);
    if (e.marker_id) rows.push(['Watchdog marker', '<a href="' + esc(route('/marker') + '?id=' + encodeURIComponent(e.marker_id)) + '">' + esc(e.marker_id) + '</a>']);
    if (src) rows.push(['Source', '<a href="' + esc(src) + '" target="_blank" rel="noopener noreferrer">' + esc(new URL(src).hostname.replace(/^www\./, '')) + ' <i class="fas fa-arrow-up-right-from-square" aria-hidden="true"></i></a>']);
    setHTML('pulse-detail', head + '<div class="wdd-detail-card"><div class="wdd-detail-top"><div><a href="' + esc(route('/home') + '?pin=' + encodeURIComponent(e.pams_pin || '')) + '">' + esc(e.title || 'Property change') + '</a><p>' + esc(propName(p)) + (p && p.town ? ' · ' + esc(p.town) : '') + '</p></div><span class="wdd-pin">' + esc(date(e.occurred_at)) + '</span></div>' +
      '<div class="wdd-detail-tags">' + tags.join('') + '</div><dl class="wdd-detail-list">' + rows.map(function (r) { return '<div><dt>' + r[0] + '</dt><dd>' + r[1] + '</dd></div>'; }).join('') + '</dl>' +
      '<div class="wdd-detail-actions"><a class="wdd-btn" href="' + esc(route('/home') + '?pin=' + encodeURIComponent(e.pams_pin || '')) + '">Open property</a>' + (src ? '<a class="wdd-btn is-ghost" href="' + esc(src) + '" target="_blank" rel="noopener noreferrer">View source</a>' : '') + '</div></div>');
  }

  /* ---------------------------------------------------------------- side */
  function isoWeek(dt) { var t = new Date(Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate())); var d = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - d); var y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return Math.ceil(((t - y0) / DAY + 1) / 7); }
  function calendar() {
    var byDay = {};
    inRange().filter(function (e) { return ui.type === 'all' || e.event_type === ui.type; }).forEach(function (e) { var d = new Date(e.occurred_at); if (Number.isFinite(d.getTime())) { var k = dateKey(d); byDay[k] = (byDay[k] || 0) + 1; } });
    var y = ui.calY, m = ui.calM, first = new Date(y, m, 1), days = new Date(y, m + 1, 0).getDate(), off = (first.getDay() + 6) % 7, today = dateKey(new Date());
    var cells = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(function (x) { return '<span aria-hidden="true">' + x + '</span>'; }).join('') + '<span aria-hidden="true"></span>';
    var total = Math.ceil((off + days) / 7) * 7;
    for (var i = 0; i < total; i++) {
      var n = i - off + 1;
      if (n < 1 || n > days) cells += '<span aria-hidden="true"></span>';
      else {
        var dt = new Date(y, m, n), k = dateKey(dt), c = byDay[k] || 0;
        cells += '<button type="button" class="wdd-cal-day' + (c ? ' has-events' : '') + (k === today ? ' is-today' : '') + (k === ui.day ? ' is-selected' : '') + '" data-day="' + k + '" aria-pressed="' + (k === ui.day) + '" aria-label="' + esc(dt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) + (c ? ', ' + c + ' ' + plural(c, 'change', 'changes') : '')) + '">' + n + '</button>';
      }
      if (i % 7 === 6) cells += '<span class="wdd-cal-wk" aria-hidden="true">W' + isoWeek(new Date(y, m, i - 6 - off + 1)) + '</span>';
    }
    return '<section class="wdd-cal" aria-label="Calendar"><div class="wdd-cal-head"><button type="button" class="wdd-cal-nav" data-cal="-1" aria-label="Previous month"><i class="fas fa-arrow-left" aria-hidden="true"></i></button><span class="wdd-cal-month" aria-live="polite">' + esc(first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })) + '</span><button type="button" class="wdd-cal-nav" data-cal="1" aria-label="Next month"><i class="fas fa-arrow-right" aria-hidden="true"></i></button></div><div class="wdd-cal-grid">' + cells + '</div>' +
      '<div class="wdd-cal-actions"><a class="wdd-btn" href="' + esc(route('/')) + '"><i class="fas fa-plus" aria-hidden="true"></i>Add a property</a></div><p class="wdd-cal-note">Dots mark days with changes in this view. Pick a day to filter the ledger.</p></section>';
  }
  function prefFor(pin) {
    var p = prefs.filter(function (x) { return x.pams_pin === pin; })[0];
    return p || { alert_score: true, alert_tax: true, alert_assessment: true, alert_deadline: true, paused: false };
  }
  function follow() {
    if (!properties.length) return '<section class="pulse-follow"><div class="wdd-timeline-head"><div><h2>Follow what matters</h2><p>Alerts for your properties</p></div></div><p class="wdd-feed-empty">Add a property to choose which changes to follow.</p></section>';
    if (!propFor(ui.prefPin)) ui.prefPin = ui.pin !== 'all' ? ui.pin : properties[0].pams_pin;
    var pref = prefFor(ui.prefPin);
    var opts = properties.map(function (p) { return '<option value="' + esc(p.pams_pin) + '"' + (p.pams_pin === ui.prefPin ? ' selected' : '') + '>' + esc(propName(p)) + '</option>'; }).join('');
    return '<section class="pulse-follow" aria-labelledby="pulse-follow-title"><div class="wdd-timeline-head"><div><h2 id="pulse-follow-title">Follow what matters</h2><p>Choose which changes alert you</p></div></div>' +
      '<label class="wdd-pill-select is-light pulse-follow-pick"><span class="wdd-sr">Property for alerts</span><select data-act="pref-pin">' + opts + '</select></label>' +
      '<div class="pulse-switches" data-pin="' + esc(ui.prefPin) + '">' + PREF_OPTS.map(function (o) {
        return '<label class="pulse-switch"><span><i class="fas ' + o[2] + '" aria-hidden="true"></i>' + o[1] + '</span><input type="checkbox" role="switch" data-pref="' + o[0] + '"' + (pref[o[0]] ? ' checked' : '') + (pref.paused ? ' disabled' : '') + '><i class="pulse-knob" aria-hidden="true"></i></label>';
      }).join('') +
      '<label class="pulse-switch is-pause"><span><i class="fas fa-pause" aria-hidden="true"></i>Pause all alerts</span><input type="checkbox" role="switch" data-pref="paused"' + (pref.paused ? ' checked' : '') + '><i class="pulse-knob" aria-hidden="true"></i></label></div>' +
      '<p class="pulse-saving" id="pulse-saving" aria-live="polite"></p></section>';
  }
  function paintSide() { setHTML('pulse-side', calendar() + follow()); }

  function paintAll() { paintHead(); paintCards(); paintLedger(); paintSide(); }

  /* ------------------------------------------------------------- actions */
  function loadTrend() {
    var pin = trendPin();
    if (!pin) { scoreHistory = []; paintCards(); return; }
    sb().from('score_observations').select('score,observed_at,observed_on').eq('pams_pin', pin).eq('marker_id', 'watchdog.score').order('observed_at', { ascending: true }).limit(500).then(function (r) {
      if (pin !== trendPin()) return;
      scoreHistory = (r && r.data) || [];
      paintCards();
    });
  }
  function savePrefs(box) {
    var pin = box.getAttribute('data-pin'), data = { user_id: user.id, pams_pin: pin, updated_at: new Date().toISOString() };
    box.querySelectorAll('[data-pref]').forEach(function (f) { data[f.getAttribute('data-pref')] = f.checked; });
    var note = $('pulse-saving'); if (note) note.textContent = 'Saving…';
    sb().from('property_alert_preferences').upsert(data, { onConflict: 'user_id,pams_pin' }).then(function (r) {
      var n = $('pulse-saving');
      if (r && r.error) { if (n) n.textContent = 'Could not save. Try again.'; return; }
      prefs = prefs.filter(function (x) { return x.pams_pin !== pin; }).concat([data]);
      box.querySelectorAll('[data-pref]:not([data-pref="paused"])').forEach(function (f) { f.disabled = !!data.paused; });
      if (n) { n.textContent = 'Saved'; setTimeout(function () { if (n.textContent === 'Saved') n.textContent = ''; }, 1600); }
    });
  }
  function readAll() {
    var ids = events.filter(function (e) { return !e.read_at; }).map(function (e) { return e.id; });
    if (!ids.length) return;
    sb().from('property_update_events').update({ read_at: new Date().toISOString() }).in('id', ids).then(function (r) {
      if (r && r.error) { toast('Could not mark changes read'); return; }
      var now = new Date().toISOString();
      events.forEach(function (e) { if (ids.indexOf(e.id) >= 0) e.read_at = now; });
      paintAll(); toast('Marked ' + ids.length + ' ' + plural(ids.length, 'change', 'changes') + ' read');
    });
  }

  function bind() {
    document.addEventListener('click', function (ev) {
      var t = ev.target; if (!t || !t.closest || !t.closest('#pulse-app')) return;
      var type = t.closest('[data-type]'); if (type) { ui.type = type.getAttribute('data-type'); ui.selected = ''; paintAll(); refocus('[data-type="' + ui.type + '"]'); return; }
      var row = t.closest('[data-event]'); if (row) { ui.selected = row.getAttribute('data-event'); paintLedger(); refocus('[data-event="' + ui.selected.replace(/["\\]/g, '\\$&') + '"]'); if (window.matchMedia && window.matchMedia('(max-width: 980px)').matches) { var d = $('pulse-detail'); if (d) d.scrollIntoView({ behavior: 'smooth', block: 'start' }); } return; }
      var day = t.closest('[data-day]'); if (day) { var k = day.getAttribute('data-day'); ui.day = ui.day === k ? '' : k; ui.selected = ''; paintLedger(); paintSide(); refocus('[data-day="' + k + '"]'); return; }
      var cal = t.closest('[data-cal]'); if (cal) { var m = ui.calM + Number(cal.getAttribute('data-cal')); ui.calY += Math.floor(m / 12); ui.calM = ((m % 12) + 12) % 12; paintSide(); refocus('[data-cal="' + cal.getAttribute('data-cal') + '"]'); return; }
      var act = t.closest('[data-act]'); if (!act || act.tagName === 'SELECT') return;
      var a = act.getAttribute('data-act');
      if (a === 'read-all') readAll();
      else if (a === 'list-all') { ui.all = !ui.all; paintLedger(); refocus('[data-act="list-all"]'); }
      else if (a === 'clear-day') { ui.day = ''; paintLedger(); paintSide(); refocus('#pulse-ledger-title'); }
    });
    document.addEventListener('change', function (ev) {
      var t = ev.target; if (!t || !t.closest || !t.closest('#pulse-app')) return;
      if (t.id === 'pulse-property') { ui.pin = t.value || 'all'; ui.selected = ''; ui.day = ''; if (ui.pin !== 'all') ui.prefPin = ui.pin; paintAll(); loadTrend(); return; }
      if (t.id === 'pulse-range') { ui.days = Number(t.value) || 0; ui.selected = ''; paintAll(); return; }
      if (t.getAttribute('data-act') === 'pref-pin') { ui.prefPin = t.value; paintSide(); refocus('[data-act="pref-pin"]'); return; }
      if (t.hasAttribute('data-pref')) { var box = t.closest('.pulse-switches'); if (box) savePrefs(box); }
    });
  }

  function init() {
    if (!window.supabase && !window.NJPTRSupabaseRuntime) return;
    sb().auth.getUser().then(function (r) {
      user = r && r.data && r.data.user;
      if (!user) throw Error('signed out');
      return Promise.all([
        sb().from('saved_properties').select('pams_pin,address,nickname,town,county').order('updated_at', { ascending: false }),
        sb().from('property_alert_preferences').select('*'),
        sb().from('property_update_events').select('*').order('occurred_at', { ascending: false }).limit(500)
      ]);
    }).then(function (v) {
      properties = (v[0] && v[0].data) || []; prefs = (v[1] && v[1].data) || []; events = (v[2] && v[2].data) || [];
      var q = new URLSearchParams(location.search).get('pin');
      if (q && propFor(q)) { ui.pin = q; ui.prefPin = q; }
      $('pulse-gate').hidden = true; $('pulse-app').hidden = false;
      bind(); paintAll(); loadTrend();
    }).catch(function () { $('pulse-gate').hidden = false; });
  }
  init();
})();
