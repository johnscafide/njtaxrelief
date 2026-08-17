/* Watchdog Dashboard Workspace · 2027 data center */
(function () {
  'use strict';

  if (window.__WATCHDOG_DASHBOARD_WORKSPACE__) return;
  window.__WATCHDOG_DASHBOARD_WORKSPACE__ = true;
  if (!document.body || document.body.getAttribute('data-sidebar-page') !== 'dashboard') return;

  var SUPABASE_URL = 'https://uvkvaxljhhngydvlrzom.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa';
  var STORAGE_KEY = 'watchdogDashboardLayoutV3';
  var client = null;
  var sessionUser = null;
  var started = false;
  var saveTimer = null;
  var weatherRequest = 0;
  var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var model = {
    properties: [], scores: [], scoreHistory: [], propertyScores: [], townScores: [],
    changes: [], snapshots: [], weather: null, alerts: [], weatherProperty: null
  };

  var META = {
    'avg-score': { type: 'metric', title: 'Watchdog Score', icon: 'fa-dog', desc: 'Current average Watchdog tax-position score across scored saved properties.' },
    'portfolio-value': { type: 'metric', title: 'Watchdog Value', icon: 'fa-house-circle-check', desc: 'Combined Watchdog market-value estimate across saved properties with a value.' },
    'assessed-total': { type: 'metric', title: 'Total Assessment', icon: 'fa-landmark', desc: 'Combined current assessed value across saved properties.' },
    'tax-load': { type: 'metric', title: 'Annual Tax Load', icon: 'fa-receipt', desc: 'Combined latest annual property tax across saved properties.' },
    'value-gap': { type: 'metric', title: 'Value / Assessment Gap', icon: 'fa-arrows-left-right-to-line', desc: 'Combined Watchdog value minus combined assessment where both values exist.' },
    'effective-burden': { type: 'metric', title: 'Portfolio Tax Burden', icon: 'fa-percent', desc: 'Annual property tax divided by Watchdog value across properties with both values.' },
    'appeal-cases': { type: 'metric', title: 'Potential Appeals', icon: 'fa-scale-balanced', desc: 'Saved properties currently carrying a Watchdog appeal opportunity flag.' },
    'recent-changes': { type: 'metric', title: '30-Day Changes', icon: 'fa-wave-square', desc: 'Recorded score, assessment, tax, permit, deed, market, municipal and source events.' },
    'score-movement': { type: 'widget', title: 'Score Movement', icon: 'fa-chart-line', desc: 'Average Watchdog Score observations over time for this saved portfolio.' },
    'score-vs-town': { type: 'widget', title: 'Score vs Town Benchmark', icon: 'fa-ranking-star', desc: 'Each saved property score compared with the peer median stored for its municipality.' },
    'value-gap-chart': { type: 'widget', title: 'Value vs Assessment', icon: 'fa-chart-column', desc: 'Current Watchdog value compared with assessed value for saved properties with both values.' },
    'tax-by-town': { type: 'widget', title: 'Tax Load by Municipality', icon: 'fa-building-columns', desc: 'Current annual property tax grouped by municipality.' },
    'effective-rate': { type: 'widget', title: 'Effective Rate by Municipality', icon: 'fa-percent', desc: 'Average recorded effective tax rate for saved properties in each municipality.' },
    'assessment-profile': { type: 'widget', title: 'Assessment Profile', icon: 'fa-chart-simple', desc: 'Largest current assessed values in the saved portfolio.' },
    'score-distribution': { type: 'widget', title: 'Score Distribution', icon: 'fa-chart-pie', desc: 'Current scored properties grouped into Watchdog Score bands.' },
    'change-activity': { type: 'widget', title: 'Change Activity', icon: 'fa-clock-rotate-left', desc: 'Recorded portfolio changes during the last four weeks.' },
    'event-severity': { type: 'widget', title: 'Signal Severity', icon: 'fa-triangle-exclamation', desc: 'Recent portfolio events grouped by severity as recorded in Watchdog.' },
    'county-concentration': { type: 'widget', title: 'County Concentration', icon: 'fa-map-location-dot', desc: 'Saved property count and annual tax exposure grouped by county.' },
    'data-coverage': { type: 'widget', title: 'Data Coverage', icon: 'fa-database', desc: 'How complete the saved portfolio is for core Watchdog fields and scoring.' },
    'data-freshness': { type: 'widget', title: 'Data Freshness', icon: 'fa-arrows-rotate', desc: 'How recently saved properties, score cache records and observed events were updated.' },
    'weather': { type: 'widget', title: 'Property Weather', icon: 'fa-cloud-sun', desc: 'National Weather Service forecast and active weather alerts at the primary saved property.' },
    'top-movers': { type: 'widget', title: 'Largest Recorded Movements', icon: 'fa-arrow-trend-up', desc: 'Largest numeric changes recorded for this portfolio during the last 90 days.' },
    'snapshot-movement': { type: 'widget', title: 'Recorded Value Movement', icon: 'fa-timeline', desc: 'Assessment, tax and Watchdog value movement reconstructed from property record snapshots.' }
  };

  var DEFAULT_LAYOUT = {
    version: 3,
    canvas: [
      'avg-score','portfolio-value','assessed-total','tax-load','value-gap','effective-burden','appeal-cases','recent-changes',
      'score-movement','score-vs-town','score-distribution','value-gap-chart','tax-by-town','effective-rate',
      'change-activity','weather','data-coverage','data-freshness','county-concentration','event-severity',
      'assessment-profile','top-movers','snapshot-movement'
    ],
    sizes: {
      'avg-score':'medium','portfolio-value':'medium','assessed-total':'medium','tax-load':'medium',
      'value-gap':'medium','effective-burden':'medium','appeal-cases':'medium','recent-changes':'medium',
      'score-movement':'wide','score-vs-town':'medium','score-distribution':'compact','value-gap-chart':'wide',
      'tax-by-town':'medium','effective-rate':'medium','change-activity':'wide','weather':'medium',
      'data-coverage':'compact','data-freshness':'compact','county-concentration':'medium','event-severity':'compact',
      'assessment-profile':'wide','top-movers':'wide','snapshot-movement':'wide'
    },
    hidden: [],
    motion: true,
    density: 'dense'
  };

  var layout = clone(DEFAULT_LAYOUT);

  function clone(obj) { return JSON.parse(JSON.stringify(obj)); }
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>\"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function num(value) { value = +value; return Number.isFinite(value) ? value : 0; }
  function validNum(value) { var n = +value; return Number.isFinite(n) ? n : null; }
  function sum(values) { return values.reduce(function (a, b) { var n = validNum(b); return a + (n == null ? 0 : n); }, 0); }
  function avg(values) { var v = values.map(validNum).filter(function (n) { return n != null; }); return v.length ? sum(v) / v.length : 0; }
  function money(value) {
    var n = num(value), abs = Math.abs(n);
    if (abs >= 1000000000) return '$' + (n / 1000000000).toFixed(2).replace(/\.00$/, '') + 'B';
    if (abs >= 1000000) return '$' + (n / 1000000).toFixed(abs >= 10000000 ? 1 : 2).replace(/\.00$/, '').replace(/\.0$/, '') + 'M';
    return '$' + Math.round(n).toLocaleString();
  }
  function compactNumber(value) { return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(num(value)); }
  function percent(value, digits) { return num(value).toFixed(digits == null ? 2 : digits).replace(/\.00$/, '').replace(/\.0$/, '') + '%'; }
  function dayLabel(date) { return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
  function monthLabel(date) { return date.toLocaleDateString('en-US', { month: 'short' }); }
  function unique(list) { return Array.from(new Set(list.filter(Boolean))); }
  function isoDaysAgo(days) { return new Date(Date.now() - days * 86400000).toISOString(); }
  function timeAgo(value) {
    var t = new Date(value).getTime(); if (!Number.isFinite(t)) return 'No timestamp';
    var diff = Math.max(0, Date.now() - t), hours = diff / 3600000;
    if (hours < 1) return Math.max(1, Math.round(diff / 60000)) + 'm ago';
    if (hours < 48) return Math.round(hours) + 'h ago';
    return Math.round(hours / 24) + 'd ago';
  }
  function prettyType(value) { return String(value || 'other').replace(/[_-]/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); }); }
  function shorten(value, max) { var s = String(value || ''); return s.length > max ? s.slice(0, max - 1) + '…' : s; }
  function cssEscape(value) { if (window.CSS && CSS.escape) return CSS.escape(value); return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&'); }

  function loadCss() {
    if (document.getElementById('watchdog-dashboard-workspace-css')) return;
    var link = document.createElement('link');
    link.id = 'watchdog-dashboard-workspace-css';
    link.rel = 'stylesheet';
    link.href = '/property/css/dashboard/dashboard-workspace.css';
    document.head.appendChild(link);
  }

  function initClient() {
    if (client) return true;
    if (!window.supabase || !window.supabase.createClient) return false;
    client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce', storageKey: 'sb-uvkvaxljhhngydvlrzom-auth-token' }
    });
    return true;
  }

  function getSession() {
    if (!initClient()) return Promise.resolve(null);
    return client.auth.getSession().then(function (res) { return res && res.data ? res.data.session : null; }).catch(function () { return null; });
  }

  function mergeLayout(candidate) {
    var next = clone(DEFAULT_LAYOUT), c = candidate && typeof candidate === 'object' ? candidate : {};
    var legacy = [];
    if (Array.isArray(c.canvas)) legacy = c.canvas;
    else legacy = (Array.isArray(c.metrics) ? c.metrics : []).concat(Array.isArray(c.analytics) ? c.analytics : []);
    legacy = legacy.filter(function (id) { return !!META[id]; });
    next.canvas = legacy.concat(DEFAULT_LAYOUT.canvas.filter(function (id) { return legacy.indexOf(id) < 0; }));
    if (c.sizes && typeof c.sizes === 'object') Object.keys(c.sizes).forEach(function (id) {
      if (META[id] && ['compact','medium','wide','full'].indexOf(c.sizes[id]) >= 0) next.sizes[id] = c.sizes[id];
    });
    next.hidden = Array.isArray(c.hidden) ? c.hidden.filter(function (id) { return !!META[id]; }) : [];
    next.motion = c.motion !== false;
    next.density = c.density === 'roomy' ? 'roomy' : 'dense';
    return next;
  }

  function localLayout() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch (_) { return null; } }
  function saveLocal() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(layout)); } catch (_) {} }
  function readRemoteLayout() {
    if (!client || !sessionUser) return Promise.resolve(null);
    return client.from('dashboard_layout_preferences').select('layout').eq('user_id', sessionUser.id).maybeSingle().then(function (res) {
      return res && !res.error && res.data && res.data.layout ? res.data.layout : null;
    }).catch(function () { return null; });
  }
  function scheduleSave() {
    saveLocal(); clearTimeout(saveTimer); paintSync('Saving');
    saveTimer = setTimeout(function () {
      if (!client || !sessionUser) { paintSync('Local'); return; }
      client.from('dashboard_layout_preferences').upsert({ user_id: sessionUser.id, layout: layout, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
        .then(function (res) { paintSync(res && res.error ? 'Local' : 'Synced'); })
        .catch(function () { paintSync('Local'); });
    }, 500);
  }
  function paintSync(label) { document.querySelectorAll('[data-wdv3-sync]').forEach(function (n) { n.textContent = label || 'Synced'; }); }

  function fetchData() {
    if (!sessionUser || !client) return Promise.resolve();
    return client.from('saved_properties')
      .select('id,pams_pin,kind,address,town,county,zip,assessed,last_year_tax,effective_rate,watchdog_value,has_appeal_case,updated_at,created_at,lat,lon,verified')
      .order('created_at', { ascending: false })
      .then(function (res) {
        model.properties = res && res.data ? res.data : [];
        var pins = unique(model.properties.map(function (r) { return r.pams_pin; }));
        if (!pins.length) return [];
        var towns = unique(model.properties.map(function (r) { return r.town; }));
        return Promise.allSettled([
          client.from('public_watchdog_score_cache').select('pams_pin,watchdog_score,town,county,peer_count,peer_median,assessed_value,computed_at').in('pams_pin', pins),
          client.from('score_observations').select('pams_pin,marker_id,score,observed_on,observed_at,evidence_coverage').in('pams_pin', pins).in('marker_id', ['watchdog.score','watchdog.watchdog_score']).order('observed_at', { ascending: true }).limit(2000),
          client.from('property_watchdog_scores').select('pams_pin,watchdog_score,town,county,observed_on,observed_at').in('pams_pin', pins).order('observed_at', { ascending: true }).limit(3000),
          towns.length ? client.from('town_watchdog_scores').select('town,county,avg_watchdog_score,scored_properties,score_as_of').in('town', towns) : Promise.resolve({ data: [] }),
          client.from('property_update_events').select('pams_pin,event_type,severity,title,occurred_at,delta_numeric,marker_id,old_value,new_value,read_at').in('pams_pin', pins).gte('occurred_at', isoDaysAgo(120)).order('occurred_at', { ascending: true }).limit(3000),
          client.from('property_record_snapshots').select('pams_pin,captured_at,payload').in('pams_pin', pins).order('captured_at', { ascending: true }).limit(3000)
        ]);
      }).then(function (parts) {
        if (!Array.isArray(parts)) return;
        model.scores = settledData(parts[0]);
        model.scoreHistory = settledData(parts[1]);
        model.propertyScores = settledData(parts[2]);
        model.townScores = settledData(parts[3]);
        model.changes = settledData(parts[4]);
        model.snapshots = settledData(parts[5]);
        return fetchWeather(false);
      });
  }
  function settledData(part) { return part && part.status === 'fulfilled' && part.value && !part.value.error && Array.isArray(part.value.data) ? part.value.data : []; }

  function primaryWeatherProperty() {
    var geo = model.properties.filter(function (r) { return validNum(r.lat) != null && validNum(r.lon) != null; });
    return geo.find(function (r) { return r.kind === 'home'; }) || geo[0] || null;
  }
  function fetchJson(url) {
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, 8000) : null;
    return fetch(url, { headers: { Accept: 'application/geo+json' }, signal: controller ? controller.signal : undefined })
      .then(function (r) { if (!r.ok) throw new Error('Weather request ' + r.status); return r.json(); })
      .finally(function () { if (timer) clearTimeout(timer); });
  }
  function fetchWeather(force) {
    var property = primaryWeatherProperty();
    if (!property) { model.weather = null; model.alerts = []; model.weatherProperty = null; return Promise.resolve(); }
    if (!force && model.weather && model.weatherProperty && model.weatherProperty.pams_pin === property.pams_pin) return Promise.resolve();
    var requestId = ++weatherRequest;
    var lat = num(property.lat).toFixed(4), lon = num(property.lon).toFixed(4);
    model.weatherProperty = property;
    return fetchJson('https://api.weather.gov/points/' + lat + ',' + lon).then(function (point) {
      if (requestId !== weatherRequest) return;
      var props = point && point.properties || {};
      var hourly = props.forecastHourly, forecast = props.forecast;
      return Promise.allSettled([
        hourly ? fetchJson(hourly) : Promise.resolve(null),
        forecast ? fetchJson(forecast) : Promise.resolve(null),
        fetchJson('https://api.weather.gov/alerts/active?point=' + lat + ',' + lon)
      ]);
    }).then(function (parts) {
      if (!parts || requestId !== weatherRequest) return;
      var hourly = parts[0] && parts[0].status === 'fulfilled' ? parts[0].value : null;
      var forecast = parts[1] && parts[1].status === 'fulfilled' ? parts[1].value : null;
      var alerts = parts[2] && parts[2].status === 'fulfilled' ? parts[2].value : null;
      var hourlyPeriods = hourly && hourly.properties && hourly.properties.periods || [];
      var dailyPeriods = forecast && forecast.properties && forecast.properties.periods || [];
      model.weather = { current: hourlyPeriods[0] || null, hourly: hourlyPeriods.slice(0, 8), daily: dailyPeriods.slice(0, 6), updated: new Date().toISOString() };
      model.alerts = alerts && Array.isArray(alerts.features) ? alerts.features : [];
    }).catch(function () { model.weather = null; model.alerts = []; });
  }

  function currentScoreRows() {
    var map = {};
    model.scores.forEach(function (r) { if (r.pams_pin && validNum(r.watchdog_score) != null) map[r.pams_pin] = { score: num(r.watchdog_score), peer: validNum(r.peer_median), peerCount: num(r.peer_count), town: r.town, computedAt: r.computed_at }; });
    if (!Object.keys(map).length) model.propertyScores.forEach(function (r) {
      if (r.pams_pin && validNum(r.watchdog_score) != null) map[r.pams_pin] = { score: num(r.watchdog_score), peer: null, peerCount: 0, town: r.town, computedAt: r.observed_at };
    });
    if (!Object.keys(map).length) model.scoreHistory.forEach(function (r) {
      if (r.pams_pin && validNum(r.score) != null) map[r.pams_pin] = { score: num(r.score), peer: null, peerCount: 0, computedAt: r.observed_at };
    });
    return Object.keys(map).map(function (pin) { return { pin: pin, score: map[pin].score, peer: map[pin].peer, peerCount: map[pin].peerCount, town: map[pin].town, computedAt: map[pin].computedAt }; });
  }

  function scoreSeries() {
    var rows = model.propertyScores.length ? model.propertyScores : model.scoreHistory;
    var grouped = {};
    rows.forEach(function (r) {
      var d = new Date(r.observed_at || r.observed_on); if (!Number.isFinite(d.getTime())) return;
      var key = d.toISOString().slice(0, 10);
      if (!grouped[key]) grouped[key] = { date: new Date(key + 'T12:00:00'), vals: [] };
      grouped[key].vals.push(num(r.watchdog_score != null ? r.watchdog_score : r.score));
    });
    var daily = Object.keys(grouped).sort().map(function (key) { return { date: grouped[key].date, value: avg(grouped[key].vals) }; });
    if (daily.length > 18) daily = daily.slice(-18);
    return daily.map(function (p) { return { label: dayLabel(p.date), value: p.value }; });
  }

  function recentChanges(days) {
    var cutoff = Date.now() - days * 86400000;
    return model.changes.filter(function (r) { var t = new Date(r.occurred_at).getTime(); return Number.isFinite(t) && t >= cutoff; });
  }
  function weeklyChangeSeries() {
    var now = new Date(), out = [];
    for (var i = 5; i >= 0; i--) {
      var end = new Date(now.getTime() - i * 7 * 86400000), start = new Date(end.getTime() - 7 * 86400000);
      out.push({ label: dayLabel(start), value: model.changes.filter(function (r) { var t = new Date(r.occurred_at).getTime(); return t >= start.getTime() && t < end.getTime(); }).length });
    }
    return out;
  }
  function groupProperties(field, valueField, reducer) {
    var groups = {};
    model.properties.forEach(function (r) {
      var key = String(r[field] || 'Unknown').trim() || 'Unknown'; if (!groups[key]) groups[key] = [];
      var v = validNum(r[valueField]); if (v != null) groups[key].push(v);
    });
    return Object.keys(groups).map(function (key) {
      return { label: key, value: reducer === 'avg' ? avg(groups[key]) : sum(groups[key]), count: groups[key].length };
    }).sort(function (a, b) { return b.value - a.value; });
  }
  function propertyByPin(pin) { return model.properties.find(function (r) { return r.pams_pin === pin; }) || null; }

  function portfolioStats() {
    var scored = currentScoreRows();
    var withValue = model.properties.filter(function (r) { return validNum(r.watchdog_value) != null && num(r.watchdog_value) > 0; });
    var withAssessment = model.properties.filter(function (r) { return validNum(r.assessed) != null && num(r.assessed) > 0; });
    var matched = model.properties.filter(function (r) { return num(r.watchdog_value) > 0 && num(r.assessed) > 0; });
    var value = sum(withValue.map(function (r) { return r.watchdog_value; }));
    var assessed = sum(withAssessment.map(function (r) { return r.assessed; }));
    var matchedValue = sum(matched.map(function (r) { return r.watchdog_value; }));
    var matchedAssessed = sum(matched.map(function (r) { return r.assessed; }));
    var tax = sum(model.properties.map(function (r) { return r.last_year_tax; }));
    var matchedTax = sum(model.properties.filter(function (r) { return num(r.watchdog_value) > 0; }).map(function (r) { return r.last_year_tax; }));
    return {
      score: scored.length ? avg(scored.map(function (r) { return r.score; })) : 0,
      scored: scored.length, value: value, valueCount: withValue.length, assessed: assessed, assessedCount: withAssessment.length,
      tax: tax, gap: matchedValue - matchedAssessed, gapCount: matched.length,
      burden: matchedValue ? matchedTax / matchedValue * 100 : 0,
      appeals: model.properties.filter(function (r) { return !!r.has_appeal_case; }).length,
      changes30: recentChanges(30).length
    };
  }

  function metricMarkup(id, delay) {
    var s = portfolioStats(), value = '—', sub = '', tone = '', spark = '';
    if (id === 'avg-score') { value = s.scored ? Math.round(s.score) : '—'; sub = s.scored + ' of ' + model.properties.length + ' saved properties scored'; tone = s.score >= 65 ? 'good' : s.score && s.score < 45 ? 'bad' : ''; spark = sparkline(scoreSeries().map(function (p) { return p.value; }), 'blue'); }
    else if (id === 'portfolio-value') { value = money(s.value); sub = s.valueCount + ' properties with Watchdog value'; }
    else if (id === 'assessed-total') { value = money(s.assessed); sub = s.assessedCount + ' properties with assessments'; }
    else if (id === 'tax-load') { value = money(s.tax); sub = 'Latest annual tax across saved properties'; }
    else if (id === 'value-gap') { value = s.gapCount ? money(s.gap) : '—'; sub = s.gapCount + ' properties with value + assessment'; tone = s.gap > 0 ? 'good' : s.gap < 0 ? 'warn' : ''; }
    else if (id === 'effective-burden') { value = s.burden ? percent(s.burden, 2) : '—'; sub = 'Tax divided by Watchdog value'; tone = s.burden > 3 ? 'bad' : s.burden && s.burden < 2 ? 'good' : ''; }
    else if (id === 'appeal-cases') { value = String(s.appeals); sub = s.appeals ? 'Properties flagged for appeal review' : 'No current saved-property flags'; tone = s.appeals ? 'warn' : 'good'; }
    else if (id === 'recent-changes') { value = String(s.changes30); sub = 'Recorded portfolio events in 30 days'; spark = sparkline(weeklyChangeSeries().map(function (p) { return p.value; }), 'teal'); }
    return cardShell(id, delay,
      '<div class="wdv3-metric-head"><span>' + esc(META[id].title) + '</span><i class="fas ' + META[id].icon + '"></i></div>' +
      '<strong class="wdv3-metric-value">' + value + '</strong><div class="wdv3-metric-sub ' + tone + '">' + esc(sub) + '</div>' + spark
    );
  }

  function widgetMarkup(id, delay) {
    var body = '';
    if (id === 'score-movement') body = scoreMovementWidget();
    else if (id === 'score-vs-town') body = scoreVsTownWidget();
    else if (id === 'value-gap-chart') body = valueGapWidget();
    else if (id === 'tax-by-town') body = rankedWidget(groupProperties('town','last_year_tax','sum').slice(0,8), money, 'Largest municipal tax load');
    else if (id === 'effective-rate') body = barWidget(groupProperties('town','effective_rate','avg').filter(function (r) { return r.value > 0; }).slice(0,8), function (v) { return percent(v, 2); }, 'Average saved-property rate');
    else if (id === 'assessment-profile') body = assessmentWidget();
    else if (id === 'score-distribution') body = scoreDistributionWidget();
    else if (id === 'change-activity') body = changeActivityWidget();
    else if (id === 'event-severity') body = severityWidget();
    else if (id === 'county-concentration') body = countyWidget();
    else if (id === 'data-coverage') body = coverageWidget();
    else if (id === 'data-freshness') body = freshnessWidget();
    else if (id === 'weather') body = weatherWidget();
    else if (id === 'top-movers') body = moversWidget();
    else if (id === 'snapshot-movement') body = snapshotWidget();
    return cardShell(id, delay, '<div class="wdv3-widget-head"><div><span>' + esc(META[id].title) + '</span><p>' + esc(META[id].desc) + '</p></div><i class="fas ' + META[id].icon + '"></i></div>' + body);
  }

  function cardShell(id, delay, inner) {
    var hidden = layout.hidden.indexOf(id) >= 0, size = layout.sizes[id] || 'medium';
    return '<article class="wdv3-card ' + META[id].type + '" data-widget-id="' + esc(id) + '" data-size="' + esc(size) + '" draggable="false" style="--delay:' + delay + 'ms"' + (hidden ? ' hidden' : '') + '>' +
      '<button class="wdv3-drag" type="button" aria-label="Move ' + esc(META[id].title) + '"><i class="fas fa-grip"></i></button>' + inner + sizeControls(id, size) + '</article>';
  }
  function sizeControls(id, size) {
    var opts = META[id].type === 'metric' ? [['compact','S'],['medium','M'],['wide','W']] : [['compact','S'],['medium','M'],['wide','W'],['full','Full']];
    return '<div class="wdv3-size-controls">' + opts.map(function (o) { return '<button type="button" data-widget-size="' + o[0] + '" data-for="' + esc(id) + '" class="' + (size === o[0] ? 'on' : '') + '">' + o[1] + '</button>'; }).join('') + '</div>';
  }

  function sparkline(values, tone) {
    if (!values || values.length < 2) return '';
    var pts = normalizedPoints(values, 100, 25, 2);
    return '<svg class="wdv3-spark ' + tone + '" viewBox="0 0 100 25" preserveAspectRatio="none" aria-hidden="true"><path d="' + pathFor(pts) + '"></path></svg>';
  }
  function normalizedPoints(values, width, height, pad) {
    var min = Math.min.apply(null, values), max = Math.max.apply(null, values), range = max - min || 1;
    return values.map(function (value, i) {
      return [pad + (values.length === 1 ? (width - 2 * pad) / 2 : i * (width - 2 * pad) / (values.length - 1)), height - pad - ((value - min) / range) * (height - 2 * pad)];
    });
  }
  function pathFor(points) { return points.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(2) + ',' + p[1].toFixed(2); }).join(' '); }
  function lineChart(series, tone, aria) {
    if (!series || series.length < 2) return '';
    var values = series.map(function (p) { return num(p.value); }), pts = normalizedPoints(values, 320, 126, 16);
    var area = pathFor(pts) + ' L' + pts[pts.length - 1][0].toFixed(2) + ',126 L' + pts[0][0].toFixed(2) + ',126 Z';
    var every = Math.max(1, Math.ceil(series.length / 6));
    var labels = series.map(function (p, i) { return (i % every === 0 || i === series.length - 1) ? '<text x="' + pts[i][0].toFixed(2) + '" y="151" text-anchor="middle">' + esc(p.label) + '</text>' : ''; }).join('');
    return '<div class="wdv3-chart"><svg viewBox="0 0 320 158" preserveAspectRatio="none" role="img" aria-label="' + esc(aria || 'trend') + '">' +
      [24,54,84,114].map(function (y) { return '<line class="grid" x1="10" y1="' + y + '" x2="312" y2="' + y + '"></line>'; }).join('') +
      '<path class="area ' + tone + '" d="' + area + '"></path><path class="line ' + tone + '" d="' + pathFor(pts) + '"></path>' +
      pts.map(function (p) { return '<circle class="point ' + tone + '" cx="' + p[0].toFixed(2) + '" cy="' + p[1].toFixed(2) + '" r="2.5"></circle>'; }).join('') + labels + '</svg></div>';
  }
  function emptyState(icon, title, text) { return '<div class="wdv3-empty"><i class="fas ' + icon + '"></i><b>' + esc(title) + '</b><span>' + esc(text) + '</span></div>'; }

  function scoreMovementWidget() {
    var series = scoreSeries(), current = currentScoreRows();
    if (series.length < 2) return '<div class="wdv3-big-number">' + (current.length ? Math.round(avg(current.map(function (r) { return r.score; }))) : '—') + '</div><div class="wdv3-caption">Current portfolio average</div>' + emptyState('fa-chart-line','History is building','Watchdog will draw this trend as additional score observations arrive.');
    var delta = series[series.length - 1].value - series[0].value;
    return '<div class="wdv3-inline-stat"><strong>' + Math.round(series[series.length - 1].value) + '</strong><span class="' + (delta >= 0 ? 'up' : 'down') + '">' + (delta >= 0 ? '+' : '') + delta.toFixed(1) + ' pts</span></div>' + lineChart(series,'blue','Watchdog Score movement') + '<div class="wdv3-legend"><span><i class="blue"></i>Portfolio average</span></div>';
  }
  function scoreVsTownWidget() {
    var rows = currentScoreRows().filter(function (r) { return r.peer != null; }).map(function (r) { var p = propertyByPin(r.pin); return { label: p ? p.address : r.pin, value: r.score - r.peer, score: r.score, peer: r.peer }; }).sort(function (a,b) { return b.value - a.value; }).slice(0,8);
    if (!rows.length) return emptyState('fa-ranking-star','Benchmark data is building','Town peer medians will appear here as Watchdog score-cache coverage expands.');
    var max = Math.max.apply(null, rows.map(function (r) { return Math.abs(r.value); })) || 1;
    return '<div class="wdv3-benchmark">' + rows.map(function (r) {
      var pct = Math.min(100, Math.abs(r.value) / max * 100), good = r.value >= 0;
      return '<div class="wdv3-bench-row"><span title="' + esc(r.label) + '">' + esc(shorten(r.label,22)) + '</span><div class="wdv3-bench-track"><i class="' + (good ? 'pos' : 'neg') + '" style="width:' + pct.toFixed(1) + '%"></i></div><b class="' + (good ? 'pos' : 'neg') + '">' + (r.value >= 0 ? '+' : '') + r.value.toFixed(1) + '</b></div>';
    }).join('') + '</div><div class="wdv3-caption">Difference versus municipal peer median</div>';
  }
  function valueGapWidget() {
    var rows = model.properties.filter(function (r) { return num(r.watchdog_value) > 0 && num(r.assessed) > 0; }).map(function (r) { return { label: r.address || r.pams_pin, value: num(r.watchdog_value), assessed: num(r.assessed), gap: num(r.watchdog_value) - num(r.assessed) }; }).sort(function (a,b) { return Math.abs(b.gap) - Math.abs(a.gap); }).slice(0,8);
    if (!rows.length) return emptyState('fa-chart-column','No matched values yet','This needs both a Watchdog value and current assessment on the same saved property.');
    var max = Math.max.apply(null, rows.map(function (r) { return Math.max(r.value, r.assessed); })) || 1;
    return '<div class="wdv3-compare-list">' + rows.map(function (r) { return '<div class="wdv3-compare-row"><span title="' + esc(r.label) + '">' + esc(shorten(r.label,21)) + '</span><div><i class="value" style="width:' + (r.value/max*100).toFixed(1) + '%"></i><i class="assessed" style="width:' + (r.assessed/max*100).toFixed(1) + '%"></i></div><b>' + money(r.gap) + '</b></div>'; }).join('') + '</div><div class="wdv3-legend"><span><i class="blue"></i>Watchdog value</span><span><i class="teal"></i>Assessment</span></div>';
  }
  function rankedWidget(items, formatter, caption) {
    if (!items.length) return emptyState('fa-chart-simple','No comparable values yet','This widget activates as saved-property records gain the required data.');
    var max = Math.max.apply(null, items.map(function (r) { return r.value; })) || 1;
    return '<div class="wdv3-inline-stat"><strong>' + formatter(items[0].value) + '</strong><span>' + esc(caption) + '</span></div><div class="wdv3-rank-list">' + items.map(function (r) { return '<div class="wdv3-rank-row"><span title="' + esc(r.label) + '">' + esc(shorten(r.label,21)) + '</span><div><i style="width:' + Math.max(4,r.value/max*100).toFixed(1) + '%"></i></div><b>' + esc(formatter(r.value)) + '</b></div>'; }).join('') + '</div>';
  }
  function barWidget(items, formatter, caption) {
    if (!items.length) return emptyState('fa-chart-column','No rate data yet','This view uses effective tax rates attached to saved property records.');
    var max = Math.max.apply(null, items.map(function (r) { return r.value; })) || 1;
    return '<div class="wdv3-inline-stat"><strong>' + formatter(avg(items.map(function (r) { return r.value; }))) + '</strong><span>' + esc(caption) + '</span></div><div class="wdv3-bars">' + items.map(function (r) { return '<div><span title="' + esc(r.label) + '">' + esc(shorten(r.label,10)) + '</span><i><b style="height:' + Math.max(7,r.value/max*100).toFixed(1) + '%"></b></i><em>' + esc(formatter(r.value)) + '</em></div>'; }).join('') + '</div>';
  }
  function assessmentWidget() {
    var rows = model.properties.map(function (r) { return { label:r.address || r.pams_pin, value:num(r.assessed) }; }).filter(function (r) { return r.value > 0; }).sort(function (a,b) { return b.value-a.value; }).slice(0,10);
    return rankedWidget(rows,money,'Largest current assessment');
  }
  function scoreDistributionWidget() {
    var scores = currentScoreRows().map(function (r) { return r.score; });
    if (!scores.length) return emptyState('fa-chart-pie','No score distribution yet','Watchdog Score coverage is required before this distribution can be drawn.');
    var buckets = [
      {label:'80–100',count:scores.filter(function(s){return s>=80;}).length,color:'#168f5c'},
      {label:'65–79',count:scores.filter(function(s){return s>=65&&s<80;}).length,color:'#078486'},
      {label:'45–64',count:scores.filter(function(s){return s>=45&&s<65;}).length,color:'#d88718'},
      {label:'0–44',count:scores.filter(function(s){return s<45;}).length,color:'#d84b52'}
    ];
    var total=scores.length,r=47,c=2*Math.PI*r,offset=0;
    var circles=buckets.map(function(b){var dash=b.count/total*c,gap=c-dash,node='<circle cx="70" cy="70" r="'+r+'" stroke="'+b.color+'" stroke-dasharray="'+dash.toFixed(2)+' '+gap.toFixed(2)+'" stroke-dashoffset="'+(-offset).toFixed(2)+'"></circle>';offset+=dash;return node;}).join('');
    return '<div class="wdv3-donut-wrap"><svg class="wdv3-donut" viewBox="0 0 140 140"><circle class="track" cx="70" cy="70" r="'+r+'"></circle>'+circles+'<text x="70" y="69">'+total+'</text><text class="sub" x="70" y="85">scored</text></svg><div class="wdv3-donut-legend">'+buckets.map(function(b){return '<div><i style="background:'+b.color+'"></i><span>'+b.label+'</span><b>'+b.count+'</b></div>';}).join('')+'</div></div>';
  }
  function changeActivityWidget() {
    var series=weeklyChangeSeries(), changes=recentChanges(42);
    if (!changes.length) return emptyState('fa-clock-rotate-left','No recent change events','No recorded portfolio changes were found during the last six weeks.');
    var types={};changes.forEach(function(r){var k=r.event_type||'other';types[k]=(types[k]||0)+1;});
    var leaders=Object.keys(types).sort(function(a,b){return types[b]-types[a];}).slice(0,4);
    return '<div class="wdv3-inline-stat"><strong>'+changes.length+'</strong><span>events · six weeks</span></div>'+lineChart(series,'teal','recent change activity')+'<div class="wdv3-legend">'+leaders.map(function(k,i){return '<span><i class="'+['blue','teal','amber','purple'][i]+'"></i>'+esc(prettyType(k))+': '+types[k]+'</span>';}).join('')+'</div>';
  }
  function severityWidget() {
    var rows=recentChanges(90),counts={critical:0,high:0,medium:0,low:0,other:0};
    rows.forEach(function(r){var k=String(r.severity||'other').toLowerCase(); if(!counts.hasOwnProperty(k))k='other'; counts[k]+=1;});
    var total=rows.length;if(!total)return emptyState('fa-triangle-exclamation','No severity events yet','This fills as Watchdog records material portfolio changes.');
    return '<div class="wdv3-severity">'+['critical','high','medium','low','other'].map(function(k){return '<div><span>'+prettyType(k)+'</span><i><b class="'+k+'" style="width:'+(counts[k]/total*100).toFixed(1)+'%"></b></i><strong>'+counts[k]+'</strong></div>';}).join('')+'</div><div class="wdv3-caption">'+total+' events in 90 days</div>';
  }
  function countyWidget() {
    var counts={},tax={};model.properties.forEach(function(r){var k=r.county||'Unknown';counts[k]=(counts[k]||0)+1;tax[k]=(tax[k]||0)+num(r.last_year_tax);});
    var rows=Object.keys(counts).map(function(k){return{label:k,value:tax[k],count:counts[k]};}).sort(function(a,b){return b.count-a.count;});
    if(!rows.length)return emptyState('fa-map-location-dot','No county data','Saved properties need county values for concentration analysis.');
    var max=Math.max.apply(null,rows.map(function(r){return r.count;}))||1;
    return '<div class="wdv3-county-list">'+rows.slice(0,8).map(function(r){return '<div><span>'+esc(r.label)+'</span><i><b style="width:'+(r.count/max*100).toFixed(1)+'%"></b></i><strong>'+r.count+'</strong><em>'+money(r.value)+'</em></div>';}).join('')+'</div>';
  }
  function coverageWidget() {
    var total=model.properties.length||1,scores=currentScoreRows().length;
    var metrics=[
      ['Score',scores],['Assessment',model.properties.filter(function(r){return num(r.assessed)>0;}).length],['Tax',model.properties.filter(function(r){return num(r.last_year_tax)>0;}).length],
      ['Watchdog value',model.properties.filter(function(r){return num(r.watchdog_value)>0;}).length],['Geolocation',model.properties.filter(function(r){return validNum(r.lat)!=null&&validNum(r.lon)!=null;}).length],['Verified',model.properties.filter(function(r){return !!r.verified;}).length]
    ];
    var overall=avg(metrics.map(function(m){return m[1]/total*100;}));
    return '<div class="wdv3-inline-stat"><strong>'+Math.round(overall)+'%</strong><span>core data completeness</span></div><div class="wdv3-coverage">'+metrics.map(function(m){var p=m[1]/total*100;return '<div><span>'+m[0]+'</span><i><b style="width:'+p.toFixed(1)+'%"></b></i><strong>'+m[1]+'/'+total+'</strong></div>';}).join('')+'</div>';
  }
  function freshnessWidget() {
    var propDates=model.properties.map(function(r){return r.updated_at;}).filter(Boolean), scoreDates=currentScoreRows().map(function(r){return r.computedAt;}).filter(Boolean), eventDates=model.changes.map(function(r){return r.occurred_at;}).filter(Boolean);
    function newest(list){return list.length?new Date(Math.max.apply(null,list.map(function(v){return new Date(v).getTime()||0;}))).toISOString():null;}
    var items=[['Property records',newest(propDates)],['Score cache',newest(scoreDates)],['Change events',newest(eventDates)],['Weather',model.weather&&model.weather.updated]];
    return '<div class="wdv3-freshness">'+items.map(function(x){return '<div><span>'+x[0]+'</span><strong>'+esc(x[1]?timeAgo(x[1]):'Waiting')+'</strong><i class="'+(x[1]&&Date.now()-new Date(x[1]).getTime()<7*86400000?'fresh':'')+'"></i></div>';}).join('')+'</div>';
  }
  function weatherIcon(text) {
    var t=String(text||'').toLowerCase(); if(t.indexOf('thunder')>=0)return'fa-cloud-bolt'; if(t.indexOf('snow')>=0)return'fa-snowflake'; if(t.indexOf('rain')>=0||t.indexOf('shower')>=0)return'fa-cloud-rain'; if(t.indexOf('cloud')>=0)return'fa-cloud'; if(t.indexOf('sun')>=0||t.indexOf('clear')>=0)return'fa-sun'; return'fa-cloud-sun';
  }
  function weatherWidget() {
    var p=model.weatherProperty,w=model.weather;
    if(!p)return emptyState('fa-location-dot','No geocoded property','Add coordinates to a saved property to activate National Weather Service intelligence.');
    if(!w||!w.current)return emptyState('fa-cloud-sun','Weather unavailable','The National Weather Service forecast could not be loaded for '+(p.address||'this property')+'.');
    var c=w.current, alerts=model.alerts||[];
    return '<div class="wdv3-weather-top"><div><span>'+esc(shorten(p.address||p.town,30))+'</span><strong>'+esc(c.temperature)+'°'+esc(c.temperatureUnit||'F')+'</strong><em>'+esc(c.shortForecast||'Forecast')+'</em></div><i class="fas '+weatherIcon(c.shortForecast)+'"></i></div>'+
      '<div class="wdv3-weather-meta"><span><i class="fas fa-droplet"></i>'+esc(c.probabilityOfPrecipitation&&c.probabilityOfPrecipitation.value!=null?c.probabilityOfPrecipitation.value+'%':'—')+'</span><span><i class="fas fa-wind"></i>'+esc(c.windSpeed||'—')+'</span><span class="'+(alerts.length?'alert':'')+'"><i class="fas fa-triangle-exclamation"></i>'+alerts.length+' active alert'+(alerts.length===1?'':'s')+'</span></div>'+
      '<div class="wdv3-hourly">'+w.hourly.slice(1,7).map(function(h){var d=new Date(h.startTime);return '<div><span>'+d.toLocaleTimeString('en-US',{hour:'numeric'})+'</span><i class="fas '+weatherIcon(h.shortForecast)+'"></i><b>'+h.temperature+'°</b></div>';}).join('')+'</div>'+
      (alerts.length?'<div class="wdv3-weather-alert"><b>'+esc(alerts[0].properties&&alerts[0].properties.event||'Weather alert')+'</b><span>'+esc(shorten(alerts[0].properties&&alerts[0].properties.headline||'',100))+'</span></div>':'')+
      '<div class="wdv3-source">National Weather Service · '+esc(timeAgo(w.updated))+'</div>';
  }
  function moversWidget() {
    var rows=recentChanges(90).filter(function(r){return validNum(r.delta_numeric)!=null&&num(r.delta_numeric)!==0;}).map(function(r){var p=propertyByPin(r.pams_pin);return{label:p?p.address:r.pams_pin,delta:num(r.delta_numeric),marker:r.marker_id||r.event_type||'change',date:r.occurred_at};}).sort(function(a,b){return Math.abs(b.delta)-Math.abs(a.delta);}).slice(0,10);
    if(!rows.length)return emptyState('fa-arrow-trend-up','No numeric movements yet','This ranks material numeric deltas as Watchdog detects them.');
    var max=Math.max.apply(null,rows.map(function(r){return Math.abs(r.delta);}))||1;
    return '<div class="wdv3-movers">'+rows.map(function(r){var positive=r.delta>=0;return '<div><span title="'+esc(r.label)+'">'+esc(shorten(r.label,23))+'<small>'+esc(prettyType(r.marker))+'</small></span><i><b class="'+(positive?'pos':'neg')+'" style="width:'+Math.max(4,Math.abs(r.delta)/max*100).toFixed(1)+'%"></b></i><strong class="'+(positive?'pos':'neg')+'">'+(positive?'+':'')+compactNumber(r.delta)+'</strong></div>';}).join('')+'</div>';
  }
  function snapshotSeries() {
    var groups={};model.snapshots.forEach(function(r){var d=new Date(r.captured_at);if(!Number.isFinite(d.getTime()))return;var key=d.toISOString().slice(0,10),p=r.payload||{};if(!groups[key])groups[key]={date:new Date(key+'T12:00:00'),assessed:[],tax:[],value:[]};if(validNum(p.assessed)!=null)groups[key].assessed.push(num(p.assessed));if(validNum(p.last_year_tax)!=null)groups[key].tax.push(num(p.last_year_tax));if(validNum(p.watchdog_value)!=null)groups[key].value.push(num(p.watchdog_value));});
    return Object.keys(groups).sort().map(function(k){var g=groups[k];return{label:dayLabel(g.date),assessed:sum(g.assessed),tax:sum(g.tax),value:sum(g.value)};}).slice(-16);
  }
  function snapshotWidget() {
    var series=snapshotSeries();if(series.length<2)return emptyState('fa-timeline','Snapshot history is building','This chart activates when the same saved properties have multiple trusted record snapshots.');
    var assessed=series.map(function(p){return{label:p.label,value:p.assessed};}).filter(function(p){return p.value>0;});
    var value=series.map(function(p){return{label:p.label,value:p.value};}).filter(function(p){return p.value>0;});
    if(assessed.length<2&&value.length<2)return emptyState('fa-timeline','No repeated numeric snapshots yet','Snapshots exist, but repeated assessment/value fields are not yet available.');
    return '<div class="wdv3-dual-trend">'+(assessed.length>=2?'<div><span>Assessment movement</span>'+lineChart(assessed,'teal','assessment snapshot movement')+'</div>':'')+(value.length>=2?'<div><span>Watchdog value movement</span>'+lineChart(value,'blue','Watchdog value snapshot movement')+'</div>':'')+'</div>';
  }

  function workspaceMarkup() {
    var cards=layout.canvas.map(function(id,i){return META[id].type==='metric'?metricMarkup(id,i*28):widgetMarkup(id,i*28);}).join('');
    var updated=newestTimestamp();
    return '<section id="wd-dashboard-workspace" class="wdv3-shell" data-density="'+esc(layout.density)+'" aria-label="Portfolio intelligence data center">'+
      '<header class="wdv3-command-head"><div><span class="wdv3-kicker"><i></i>LIVE PROPERTY INTELLIGENCE</span><h2>Portfolio Data Center</h2><p>Dense, movable intelligence built from saved property records, Watchdog observations, portfolio changes and live public data.</p></div>'+
      '<div class="wdv3-head-meta"><span><b>'+model.properties.length+'</b> properties</span><span><b>'+currentScoreRows().length+'</b> scored</span><span><b>'+recentChanges(30).length+'</b> changes</span><span><i class="fas fa-clock"></i>'+esc(updated?timeAgo(updated):'waiting')+'</span></div></header>'+
      '<div class="wdv3-grid" data-widget-zone="canvas">'+cards+'</div>'+
      '<footer class="wdv3-data-foot"><span><i class="fas fa-database"></i>Watchdog portfolio dataset</span><span><i class="fas fa-cloud-check"></i><b data-wdv3-sync>Synced</b></span><button type="button" data-wdv3-action="customize"><i class="fas fa-sliders"></i>Customize canvas</button></footer>'+
      '</section>';
  }
  function newestTimestamp() {
    var dates=[];model.properties.forEach(function(r){if(r.updated_at)dates.push(r.updated_at);});currentScoreRows().forEach(function(r){if(r.computedAt)dates.push(r.computedAt);});model.changes.forEach(function(r){if(r.occurred_at)dates.push(r.occurred_at);});
    if(!dates.length)return null;return new Date(Math.max.apply(null,dates.map(function(v){return new Date(v).getTime()||0;}))).toISOString();
  }

  function toolbarMarkup() {
    return '<div class="wdv3-dock" id="wdv3-dock"><button class="wdv3-dock-trigger" type="button" data-wdv3-action="dock" aria-label="Open dashboard toolbar" aria-expanded="false"><i class="fas fa-grid-2"></i></button><div class="wdv3-dock-actions">'+
      '<button type="button" data-wdv3-action="nav" title="Navigation"><i class="fas fa-bars"></i><span>Menu</span></button>'+
      '<button type="button" data-wdv3-action="customize" title="Customize canvas"><i class="fas fa-sliders"></i><span>Customize</span></button>'+
      '<button type="button" data-wdv3-action="density" title="Toggle density"><i class="fas fa-table-cells"></i><span>Density</span></button>'+
      '<button type="button" data-wdv3-action="refresh" title="Refresh data"><i class="fas fa-arrows-rotate"></i><span>Refresh</span></button>'+
      '<a href="/property/" title="Add property"><i class="fas fa-plus"></i><span>Add</span></a></div></div>'+
      '<button class="wdv3-nav-backdrop" type="button" data-wdv3-action="nav-close" aria-label="Close navigation"></button>';
  }
  function customPanelMarkup() {
    return '<aside class="wdv3-custom-panel" id="wdv3-custom-panel" aria-hidden="true"><div class="wdv3-custom-sheet" role="dialog" aria-modal="false" aria-labelledby="wdv3-custom-title">'+
      '<header><div><span>WORKSPACE CONTROLS</span><h3 id="wdv3-custom-title">Customize data center</h3><p>Drag any visible card across the canvas. The dense grid backfills open spaces automatically and your layout follows your account.</p></div><button type="button" data-wdv3-action="custom-close" aria-label="Close"><i class="fas fa-xmark"></i></button></header>'+
      '<section><h4>Canvas</h4><div class="wdv3-setting-row"><i class="fas fa-table-cells"></i><div><b>Dense Tetris layout</b><small>Pack available gaps aggressively.</small></div><label class="wdv3-switch"><input type="checkbox" id="wdv3-density"'+(layout.density==='dense'?' checked':'')+'><span></span></label></div>'+
      '<div class="wdv3-setting-row"><i class="fas fa-wand-magic-sparkles"></i><div><b>Motion</b><small>Animate data entrances and statistical movement.</small></div><label class="wdv3-switch"><input type="checkbox" id="wdv3-motion"'+(layout.motion?' checked':'')+'><span></span></label></div></section>'+
      '<section><h4>Visible intelligence</h4>'+layout.canvas.map(function(id){var visible=layout.hidden.indexOf(id)<0;return '<div class="wdv3-setting-row"><i class="fas '+META[id].icon+'"></i><div><b>'+esc(META[id].title)+'</b><small>'+esc(META[id].desc)+'</small></div><label class="wdv3-switch"><input type="checkbox" data-widget-visible="'+esc(id)+'"'+(visible?' checked':'')+'><span></span></label></div>';}).join('')+'</section>'+
      '<footer><button type="button" class="wdv3-btn" data-wdv3-action="reset">Reset layout</button><button type="button" class="wdv3-btn primary" data-wdv3-action="custom-close">Done</button></footer></div></aside>';
  }

  function mount() {
    var brief=document.getElementById('db-brief');if(!brief||!brief.parentNode||!model.properties.length)return false;
    ['wd-dashboard-workspace','wdv3-dock','wdv3-custom-panel'].forEach(function(id){var old=document.getElementById(id);if(old)old.remove();});
    var oldBackdrop=document.querySelector('.wdv3-nav-backdrop');if(oldBackdrop)oldBackdrop.remove();
    var holder=document.createElement('div');holder.innerHTML=workspaceMarkup();brief.insertAdjacentElement('afterend',holder.firstElementChild);
    var dock=document.createElement('div');dock.innerHTML=toolbarMarkup();while(dock.firstChild)document.body.appendChild(dock.firstChild);
    var custom=document.createElement('div');custom.innerHTML=customPanelMarkup();document.body.appendChild(custom.firstElementChild);
    document.body.classList.add('wdv3-ready');document.body.classList.toggle('wdv3-no-motion',!layout.motion||reducedMotion);document.body.classList.toggle('wdv3-roomy',layout.density==='roomy');
    wireInteractions();syncViewVisibility();return true;
  }

  function syncViewVisibility() { var ws=document.getElementById('wd-dashboard-workspace');if(!ws)return;var standard=document.querySelector('.vw[data-v="simple"]');ws.hidden=!!(standard&&!standard.classList.contains('on')); }
  function openCustomize() { document.body.classList.add('wdv3-customizing');var p=document.getElementById('wdv3-custom-panel');if(p){p.classList.add('open');p.setAttribute('aria-hidden','false');}document.querySelectorAll('.wdv3-card').forEach(function(c){c.setAttribute('draggable','true');}); }
  function closeCustomize() { document.body.classList.remove('wdv3-customizing');var p=document.getElementById('wdv3-custom-panel');if(p){p.classList.remove('open');p.setAttribute('aria-hidden','true');}document.querySelectorAll('.wdv3-card').forEach(function(c){c.setAttribute('draggable','false');c.classList.remove('drop-target');});captureOrder();scheduleSave(); }
  function toggleDock(force) { var dock=document.getElementById('wdv3-dock');if(!dock)return;var open=typeof force==='boolean'?force:!dock.classList.contains('open');dock.classList.toggle('open',open);var b=dock.querySelector('.wdv3-dock-trigger');if(b)b.setAttribute('aria-expanded',open?'true':'false'); }
  function toggleNav(open) { document.body.classList.toggle('wdv3-nav-open',!!open);if(open)toggleDock(false); }

  function wireInteractions() {
    document.querySelectorAll('[data-wdv3-action]').forEach(function(node){node.addEventListener('click',function(){var a=node.getAttribute('data-wdv3-action');if(a==='dock')toggleDock();else if(a==='nav')toggleNav(true);else if(a==='nav-close')toggleNav(false);else if(a==='customize')openCustomize();else if(a==='custom-close')closeCustomize();else if(a==='density'){layout.density=layout.density==='dense'?'roomy':'dense';document.body.classList.toggle('wdv3-roomy',layout.density==='roomy');var ws=document.getElementById('wd-dashboard-workspace');if(ws)ws.setAttribute('data-density',layout.density);scheduleSave();}else if(a==='refresh'){node.classList.add('spinning');fetchData().then(function(){mount();}).finally(function(){node.classList.remove('spinning');});}else if(a==='reset'){layout=clone(DEFAULT_LAYOUT);mount();scheduleSave();openCustomize();}});});
    var motion=document.getElementById('wdv3-motion');if(motion)motion.addEventListener('change',function(){layout.motion=!!motion.checked;document.body.classList.toggle('wdv3-no-motion',!layout.motion||reducedMotion);scheduleSave();});
    var density=document.getElementById('wdv3-density');if(density)density.addEventListener('change',function(){layout.density=density.checked?'dense':'roomy';document.body.classList.toggle('wdv3-roomy',layout.density==='roomy');var ws=document.getElementById('wd-dashboard-workspace');if(ws)ws.setAttribute('data-density',layout.density);scheduleSave();});
    document.querySelectorAll('[data-widget-visible]').forEach(function(input){input.addEventListener('change',function(){var id=input.getAttribute('data-widget-visible'),i=layout.hidden.indexOf(id);if(input.checked&&i>=0)layout.hidden.splice(i,1);if(!input.checked&&i<0)layout.hidden.push(id);var card=document.querySelector('[data-widget-id="'+cssEscape(id)+'"]');if(card)card.hidden=!input.checked;scheduleSave();});});
    document.querySelectorAll('[data-widget-size]').forEach(function(button){button.addEventListener('click',function(){var id=button.getAttribute('data-for'),size=button.getAttribute('data-widget-size');layout.sizes[id]=size;var card=document.querySelector('[data-widget-id="'+cssEscape(id)+'"]');if(card){card.setAttribute('data-size',size);card.querySelectorAll('[data-widget-size]').forEach(function(b){b.classList.toggle('on',b===button);});}scheduleSave();});});
    var grid=document.querySelector('[data-widget-zone="canvas"]');if(grid)enableDrag(grid);
  }

  function enableDrag(grid) {
    var dragging=null;
    grid.addEventListener('dragstart',function(e){if(!document.body.classList.contains('wdv3-customizing')){e.preventDefault();return;}var c=e.target.closest('[data-widget-id]');if(!c||c.parentNode!==grid)return;dragging=c;c.classList.add('dragging');if(e.dataTransfer){e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',c.getAttribute('data-widget-id'));}});
    grid.addEventListener('dragover',function(e){if(!dragging)return;e.preventDefault();var target=e.target.closest('[data-widget-id]');grid.querySelectorAll('.drop-target').forEach(function(n){n.classList.remove('drop-target');});if(!target||target===dragging||target.parentNode!==grid)return;target.classList.add('drop-target');var r=target.getBoundingClientRect(),before=e.clientY<r.top+r.height/2;if(Math.abs(e.clientY-(r.top+r.height/2))<r.height*.25)before=e.clientX<r.left+r.width/2;grid.insertBefore(dragging,before?target:target.nextSibling);});
    grid.addEventListener('drop',function(e){if(dragging)e.preventDefault();captureOrder();scheduleSave();});
    grid.addEventListener('dragend',function(){if(dragging)dragging.classList.remove('dragging');grid.querySelectorAll('.drop-target').forEach(function(n){n.classList.remove('drop-target');});dragging=null;captureOrder();scheduleSave();});
  }
  function captureOrder() { var grid=document.querySelector('[data-widget-zone="canvas"]');if(grid)layout.canvas=Array.from(grid.querySelectorAll(':scope > [data-widget-id]')).map(function(n){return n.getAttribute('data-widget-id');}); }

  function observeDashboard() {
    var brief=document.getElementById('db-brief');if(brief&&!brief.__wdv3Observed){brief.__wdv3Observed=true;var queued=false;new MutationObserver(function(){if(queued)return;queued=true;requestAnimationFrame(function(){queued=false;if(model.properties.length&&!document.getElementById('wd-dashboard-workspace'))mount();syncViewVisibility();});}).observe(brief,{childList:true,subtree:false});}
    document.addEventListener('click',function(e){if(e.target.closest('.vw[data-v]'))setTimeout(syncViewVisibility,20);if(!e.target.closest('#wdv3-dock'))toggleDock(false);if(document.body.classList.contains('wdv3-nav-open')&&!e.target.closest('.db-sidebar')&&!e.target.closest('[data-wdv3-action="nav"]'))toggleNav(false);});
    document.addEventListener('keydown',function(e){if(e.key==='Escape'){toggleNav(false);toggleDock(false);closeCustomize();}});
  }

  function bootForSession(session) {
    if(!session||!session.user)return;if(started&&sessionUser&&sessionUser.id===session.user.id)return;started=true;sessionUser=session.user;
    Promise.all([readRemoteLayout(),fetchData()]).then(function(parts){layout=mergeLayout(parts[0]||localLayout());mount();observeDashboard();}).catch(function(err){console.warn('Dashboard data center could not initialize:',err);layout=mergeLayout(localLayout());mount();observeDashboard();});
  }
  function start() {
    loadCss();getSession().then(function(session){if(session)bootForSession(session);if(client)client.auth.onAuthStateChange(function(event,next){if(next&&next.user)bootForSession(next);if(event==='SIGNED_OUT'){sessionUser=null;started=false;document.body.classList.remove('wdv3-ready','wdv3-customizing','wdv3-nav-open');['wd-dashboard-workspace','wdv3-dock','wdv3-custom-panel'].forEach(function(id){var n=document.getElementById(id);if(n)n.remove();});}});});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();

export {};
