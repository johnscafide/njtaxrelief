/* Watchdog Dashboard Workspace · meaningful analytics + persistent customization */
(function () {
  'use strict';

  if (window.__WATCHDOG_DASHBOARD_WORKSPACE__) return;
  window.__WATCHDOG_DASHBOARD_WORKSPACE__ = true;
  if (!document.body || document.body.getAttribute('data-sidebar-page') !== 'dashboard') return;

  var SUPABASE_URL = 'https://uvkvaxljhhngydvlrzom.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa';
  var STORAGE_KEY = 'watchdogDashboardLayoutV2';
  var client = null;
  var sessionUser = null;
  var model = { properties: [], scores: [], scoreHistory: [], changes: [], snapshots: [] };
  var layout = null;
  var saveTimer = null;
  var started = false;
  var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var META = {
    'avg-score': { zone: 'metrics', title: 'Average Watchdog Score', icon: 'fa-dog', desc: 'Current tax-position score across scored saved properties.' },
    'tax-load': { zone: 'metrics', title: 'Annual Property Tax', icon: 'fa-receipt', desc: 'Combined last recorded annual tax for saved properties.' },
    'appeal-cases': { zone: 'metrics', title: 'Potential Appeal Cases', icon: 'fa-scale-balanced', desc: 'Saved properties currently flagged by Watchdog as having a potential appeal case.' },
    'recent-changes': { zone: 'metrics', title: 'Changes in 30 Days', icon: 'fa-wave-square', desc: 'Recorded score, assessment, tax, permit, deed, market, municipal and source changes.' },
    'score-movement': { zone: 'analytics', title: 'Score Movement', icon: 'fa-chart-line', desc: 'Average Watchdog Score observations over time for this saved portfolio.' },
    'tax-by-town': { zone: 'analytics', title: 'Tax Load by Municipality', icon: 'fa-building-columns', desc: 'Current annual property tax grouped by municipality.' },
    'effective-rate': { zone: 'analytics', title: 'Effective Tax Rate by Municipality', icon: 'fa-percent', desc: 'Average recorded effective tax rate for saved properties in each municipality.' },
    'assessment-profile': { zone: 'analytics', title: 'Assessment Profile', icon: 'fa-chart-simple', desc: 'Largest current assessed values in the saved portfolio.' },
    'score-distribution': { zone: 'analytics', title: 'Score Distribution', icon: 'fa-chart-pie', desc: 'Current scored properties grouped into Watchdog Score bands.' },
    'change-activity': { zone: 'analytics', title: 'Recent Change Activity', icon: 'fa-clock-rotate-left', desc: 'Recorded changes across the saved portfolio during the last 28 days.' }
  };

  var DEFAULT_LAYOUT = {
    metrics: ['avg-score', 'tax-load', 'appeal-cases', 'recent-changes'],
    analytics: ['score-movement', 'tax-by-town', 'effective-rate', 'assessment-profile', 'score-distribution', 'change-activity'],
    sizes: {
      'avg-score': 'medium', 'tax-load': 'medium', 'appeal-cases': 'medium', 'recent-changes': 'medium',
      'score-movement': 'wide', 'tax-by-town': 'medium', 'effective-rate': 'medium',
      'assessment-profile': 'wide', 'score-distribution': 'medium', 'change-activity': 'medium'
    },
    hidden: [],
    motion: true
  };

  function clone(obj) { return JSON.parse(JSON.stringify(obj)); }
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>\"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function num(value) { value = +value; return Number.isFinite(value) ? value : 0; }
  function money(value) {
    var n = num(value), abs = Math.abs(n);
    if (abs >= 1000000) return '$' + (n / 1000000).toFixed(abs >= 10000000 ? 1 : 2).replace(/\.0+$/, '') + 'M';
    if (abs >= 1000) return '$' + Math.round(n).toLocaleString();
    return '$' + Math.round(n).toLocaleString();
  }
  function percent(value) { return num(value).toFixed(2).replace(/\.00$/, '') + '%'; }
  function avg(values) {
    var usable = values.map(num).filter(function (v) { return Number.isFinite(v); });
    return usable.length ? usable.reduce(function (a, b) { return a + b; }, 0) / usable.length : 0;
  }
  function sum(values) { return values.reduce(function (a, b) { return a + num(b); }, 0); }
  function isoDaysAgo(days) { return new Date(Date.now() - days * 86400000).toISOString(); }
  function monthLabel(date) { return date.toLocaleDateString('en-US', { month: 'short' }); }
  function dayLabel(date) { return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
  function unique(list) { return Array.from(new Set(list.filter(Boolean))); }

  function loadCss() {
    if (document.getElementById('watchdog-dashboard-workspace-css')) return;
    var link = document.createElement('link');
    link.id = 'watchdog-dashboard-workspace-css';
    link.rel = 'stylesheet';
    link.href = '/property/css/dashboard/dashboard-workspace.css';
    document.head.appendChild(link);
  }

  function collapseSidebarByDefault() {
    if (window.matchMedia && window.matchMedia('(max-width: 760px)').matches) return;
    try { localStorage.removeItem('watchdogSidebarExpanded'); } catch (_) {}
    document.body.classList.remove('db-sidebar-expanded');
    var toggle = document.getElementById('db-sidebar-toggle');
    if (toggle) {
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'Expand navigation');
      var icon = toggle.querySelector('i');
      var label = toggle.querySelector('span');
      if (icon) icon.className = 'fas fa-angles-right';
      if (label) label.textContent = 'Expand navigation';
    }
  }

  function mergeLayout(candidate) {
    var next = clone(DEFAULT_LAYOUT), c = candidate && typeof candidate === 'object' ? candidate : {};
    ['metrics', 'analytics'].forEach(function (zone) {
      var known = DEFAULT_LAYOUT[zone];
      var incoming = Array.isArray(c[zone]) ? c[zone].filter(function (id) { return known.indexOf(id) >= 0; }) : [];
      next[zone] = incoming.concat(known.filter(function (id) { return incoming.indexOf(id) < 0; }));
    });
    if (c.sizes && typeof c.sizes === 'object') {
      Object.keys(c.sizes).forEach(function (id) {
        if (!META[id]) return;
        var size = c.sizes[id];
        if (['compact', 'medium', 'wide', 'full'].indexOf(size) >= 0) next.sizes[id] = size;
      });
    }
    next.hidden = Array.isArray(c.hidden) ? c.hidden.filter(function (id) { return !!META[id]; }) : [];
    next.motion = c.motion !== false;
    return next;
  }

  function localLayout() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch (_) { return null; }
  }

  function saveLocal() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(layout)); } catch (_) {}
  }

  function scheduleSave() {
    saveLocal();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      if (!client || !sessionUser) return;
      client.from('dashboard_layout_preferences').upsert({
        user_id: sessionUser.id,
        layout: layout,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' }).then(function (res) {
        if (res && res.error) console.warn('Dashboard layout could not sync:', res.error.message || res.error);
        paintSync(res && res.error ? 'Local' : 'Synced');
      }).catch(function () { paintSync('Local'); });
    }, 550);
  }

  function paintSync(label) {
    var node = document.querySelector('.wdv2-sync span');
    if (node) node.textContent = label || 'Synced';
  }

  function readRemoteLayout() {
    if (!client || !sessionUser) return Promise.resolve(null);
    return client.from('dashboard_layout_preferences').select('layout').eq('user_id', sessionUser.id).maybeSingle().then(function (res) {
      if (res && !res.error && res.data && res.data.layout) return res.data.layout;
      return null;
    }).catch(function () { return null; });
  }

  function initClient() {
    if (client) return true;
    if (!window.supabase || !window.supabase.createClient) return false;
    client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
        storageKey: 'sb-uvkvaxljhhngydvlrzom-auth-token'
      }
    });
    return true;
  }

  function getSession() {
    if (!initClient()) return Promise.resolve(null);
    return client.auth.getSession().then(function (res) {
      return res && res.data ? res.data.session : null;
    }).catch(function () { return null; });
  }

  function fetchData() {
    if (!sessionUser || !client) return Promise.resolve();
    return client.from('saved_properties')
      .select('id,pams_pin,address,town,county,zip,assessed,last_year_tax,effective_rate,watchdog_value,has_appeal_case,updated_at')
      .order('created_at', { ascending: false })
      .then(function (propRes) {
        model.properties = propRes && propRes.data ? propRes.data : [];
        var pins = unique(model.properties.map(function (r) { return r.pams_pin; }));
        if (!pins.length) return [];
        return Promise.allSettled([
          client.from('public_watchdog_score_cache').select('pams_pin,watchdog_score,town,county,computed_at').in('pams_pin', pins),
          client.from('score_observations').select('pams_pin,marker_id,score,observed_on,observed_at,evidence_coverage').in('pams_pin', pins).in('marker_id', ['watchdog.score', 'watchdog.watchdog_score']).order('observed_at', { ascending: true }).limit(1000),
          client.from('property_update_events').select('pams_pin,event_type,severity,occurred_at,delta_numeric,marker_id').in('pams_pin', pins).gte('occurred_at', isoDaysAgo(90)).order('occurred_at', { ascending: true }).limit(1000),
          client.from('property_record_snapshots').select('pams_pin,captured_at,payload').in('pams_pin', pins).order('captured_at', { ascending: true }).limit(1000)
        ]);
      }).then(function (results) {
        if (!Array.isArray(results)) return;
        model.scores = valueData(results[0]);
        model.scoreHistory = valueData(results[1]);
        model.changes = valueData(results[2]);
        model.snapshots = valueData(results[3]);
      });
  }

  function valueData(settled) {
    if (!settled || settled.status !== 'fulfilled') return [];
    var value = settled.value;
    return value && !value.error && Array.isArray(value.data) ? value.data : [];
  }

  function currentScoreRows() {
    var byPin = {};
    model.scores.forEach(function (r) { if (r.pams_pin && r.watchdog_score != null) byPin[r.pams_pin] = num(r.watchdog_score); });
    if (!Object.keys(byPin).length) {
      model.scoreHistory.forEach(function (r) {
        if (r.pams_pin && r.score != null) byPin[r.pams_pin] = num(r.score);
      });
    }
    return Object.keys(byPin).map(function (pin) { return { pin: pin, score: byPin[pin] }; });
  }

  function scoreSeries() {
    var grouped = {};
    model.scoreHistory.forEach(function (r) {
      var d = new Date(r.observed_at || r.observed_on);
      if (!Number.isFinite(d.getTime())) return;
      var key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      if (!grouped[key]) grouped[key] = { date: new Date(d.getFullYear(), d.getMonth(), 1), values: [] };
      grouped[key].values.push(num(r.score));
    });
    return Object.keys(grouped).sort().map(function (key) {
      return { label: monthLabel(grouped[key].date), value: avg(grouped[key].values) };
    }).slice(-12);
  }

  function recentChanges(days) {
    var cutoff = Date.now() - days * 86400000;
    return model.changes.filter(function (r) {
      var t = new Date(r.occurred_at).getTime();
      return Number.isFinite(t) && t >= cutoff;
    });
  }

  function weeklyChangeSeries() {
    var now = new Date(), out = [];
    for (var i = 3; i >= 0; i--) {
      var end = new Date(now.getTime() - i * 7 * 86400000);
      var start = new Date(end.getTime() - 7 * 86400000);
      var count = model.changes.filter(function (r) {
        var t = new Date(r.occurred_at).getTime();
        return t >= start.getTime() && t < end.getTime();
      }).length;
      out.push({ label: dayLabel(start), value: count });
    }
    return out;
  }

  function groupProperties(field, valueField, reducer) {
    var groups = {};
    model.properties.forEach(function (r) {
      var key = String(r[field] || 'Unknown').trim() || 'Unknown';
      if (!groups[key]) groups[key] = [];
      groups[key].push(num(r[valueField]));
    });
    return Object.keys(groups).map(function (key) {
      var values = groups[key];
      return { label: key, value: reducer === 'avg' ? avg(values) : sum(values), count: values.length };
    }).sort(function (a, b) { return b.value - a.value; });
  }

  function metricMarkup(id, delay) {
    var scores = currentScoreRows(), scoreAvg = scores.length ? avg(scores.map(function (r) { return r.score; })) : 0;
    var taxTotal = sum(model.properties.map(function (r) { return r.last_year_tax; }));
    var appeals = model.properties.filter(function (r) { return !!r.has_appeal_case; }).length;
    var changes30 = recentChanges(30).length;
    var scoreTrend = scoreSeries();
    var weekly = weeklyChangeSeries();
    var value = '', sub = '', cls = '', spark = '';

    if (id === 'avg-score') {
      value = scores.length ? Math.round(scoreAvg) : '—';
      sub = scores.length + ' of ' + model.properties.length + ' saved properties scored';
      cls = scoreAvg >= 65 ? 'good' : scoreAvg && scoreAvg < 45 ? 'bad' : '';
      spark = scoreTrend.length > 1 ? sparkline(scoreTrend.map(function (p) { return p.value; }), 'blue') : '';
    } else if (id === 'tax-load') {
      value = money(taxTotal);
      sub = 'Last recorded annual tax across saved properties';
    } else if (id === 'appeal-cases') {
      value = String(appeals);
      sub = appeals ? 'Flagged for closer appeal review' : 'No saved property is currently flagged';
      cls = appeals ? 'warn' : 'good';
    } else if (id === 'recent-changes') {
      value = String(changes30);
      sub = 'Recorded portfolio events in the last 30 days';
      cls = changes30 ? '' : 'good';
      spark = sparkline(weekly.map(function (p) { return p.value; }), 'blue');
    }

    return cardShell(id, 'metric', delay,
      '<div class="wdv2-metric-top"><span class="wdv2-metric-label">' + esc(META[id].title) + '<i class="fas fa-circle-info" title="' + esc(META[id].desc) + '"></i></span></div>' +
      '<div class="wdv2-metric-value">' + value + '</div>' +
      '<div class="wdv2-metric-sub ' + cls + '">' + esc(sub) + '</div>' + spark
    );
  }

  function widgetMarkup(id, delay) {
    var content = '';
    if (id === 'score-movement') content = scoreMovementWidget();
    else if (id === 'tax-by-town') content = rankedWidget(groupProperties('town', 'last_year_tax', 'sum').slice(0, 7), money, 'Annual tax');
    else if (id === 'effective-rate') content = barWidget(groupProperties('town', 'effective_rate', 'avg').filter(function (r) { return r.value > 0; }).slice(0, 7), percent, 'Average rate');
    else if (id === 'assessment-profile') {
      var assessed = model.properties.map(function (r) { return { label: r.address || r.pams_pin || 'Property', value: num(r.assessed) }; })
        .filter(function (r) { return r.value > 0; }).sort(function (a, b) { return b.value - a.value; }).slice(0, 7);
      content = rankedWidget(assessed, money, 'Assessed value');
    } else if (id === 'score-distribution') content = scoreDistributionWidget();
    else if (id === 'change-activity') content = changeActivityWidget();

    return cardShell(id, 'widget', delay,
      '<div class="wdv2-widget-head"><div><h3>' + esc(META[id].title) + '<i class="fas fa-circle-info" title="' + esc(META[id].desc) + '"></i></h3><p>' + esc(META[id].desc) + '</p></div></div>' + content
    );
  }

  function cardShell(id, kind, delay, inner) {
    var hidden = layout.hidden.indexOf(id) >= 0;
    var size = layout.sizes[id] || 'medium';
    return '<article class="wdv2-' + kind + '" data-widget-id="' + esc(id) + '" data-size="' + esc(size) + '" draggable="false" style="--delay:' + delay + 'ms"' + (hidden ? ' hidden' : '') + '>' +
      '<button class="wdv2-drag-handle" type="button" aria-label="Move ' + esc(META[id].title) + '"><i class="fas fa-grip"></i></button>' +
      inner + sizeControls(id, size) + '</article>';
  }

  function sizeControls(id, size) {
    var options = META[id].zone === 'metrics' ? [['medium','M'],['wide','W'],['full','Full']] : [['compact','S'],['medium','M'],['wide','W'],['full','Full']];
    return '<div class="wdv2-size-controls" aria-label="Widget width">' + options.map(function (o) {
      return '<button type="button" data-widget-size="' + o[0] + '" data-for="' + esc(id) + '" class="' + (size === o[0] ? 'on' : '') + '">' + o[1] + '</button>';
    }).join('') + '</div>';
  }

  function sparkline(values, tone) {
    if (!values || values.length < 2) return '';
    var pts = normalizedPoints(values, 100, 28, 2);
    return '<svg class="wdv2-spark ' + tone + '" viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true"><path d="' + pathFor(pts) + '"></path></svg>';
  }

  function normalizedPoints(values, width, height, pad) {
    var min = Math.min.apply(null, values), max = Math.max.apply(null, values), range = max - min || 1;
    return values.map(function (value, i) {
      var x = pad + (values.length === 1 ? (width - pad * 2) / 2 : i * (width - pad * 2) / (values.length - 1));
      var y = height - pad - ((value - min) / range) * (height - pad * 2);
      return [x, y];
    });
  }

  function pathFor(points) {
    return points.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(2) + ',' + p[1].toFixed(2); }).join(' ');
  }

  function scoreMovementWidget() {
    var series = scoreSeries();
    var current = currentScoreRows();
    if (series.length < 2) {
      return '<div class="wdv2-widget-value">' + (current.length ? Math.round(avg(current.map(function (r) { return r.score; }))) : '—') + '</div>' +
        '<div class="wdv2-widget-note">Current portfolio average</div>' +
        emptyState('fa-chart-line', 'History is still building', 'This chart begins moving as trusted Watchdog Score observations accumulate over time.');
    }
    return '<div class="wdv2-widget-value">' + Math.round(series[series.length - 1].value) + '</div>' +
      '<div class="wdv2-widget-note">Latest monthly portfolio average</div>' + lineChart(series, 'score') +
      '<div class="wdv2-legend"><span><i class="blue"></i>Average Watchdog Score</span></div>';
  }

  function lineChart(series, type) {
    if (!series.length) return '';
    var values = series.map(function (p) { return num(p.value); });
    var pts = normalizedPoints(values, 320, 130, 15);
    var area = pathFor(pts) + ' L' + pts[pts.length - 1][0].toFixed(2) + ',125 L' + pts[0][0].toFixed(2) + ',125 Z';
    var labelEvery = Math.max(1, Math.ceil(series.length / 6));
    var labels = series.map(function (p, i) {
      if (i % labelEvery !== 0 && i !== series.length - 1) return '';
      return '<text class="wdv2-axis-label" x="' + pts[i][0].toFixed(2) + '" y="148" text-anchor="middle">' + esc(p.label) + '</text>';
    }).join('');
    var grids = [25,55,85,115].map(function (y) { return '<line class="wdv2-gridline" x1="12" y1="' + y + '" x2="310" y2="' + y + '"></line>'; }).join('');
    return '<div class="wdv2-chart"><svg viewBox="0 0 320 155" preserveAspectRatio="none" role="img" aria-label="' + esc(type) + ' trend">' +
      grids + '<path class="wdv2-line-area" d="' + area + '"></path><path class="wdv2-line-main" d="' + pathFor(pts) + '"></path>' +
      pts.map(function (p) { return '<circle class="wdv2-point" cx="' + p[0].toFixed(2) + '" cy="' + p[1].toFixed(2) + '" r="2.6"></circle>'; }).join('') + labels + '</svg></div>';
  }

  function rankedWidget(items, formatter, valueLabel) {
    if (!items.length) return emptyState('fa-chart-simple', 'No comparable values yet', 'This view appears as saved-property records gain the required values.');
    var max = Math.max.apply(null, items.map(function (r) { return r.value; })) || 1;
    return '<div class="wdv2-widget-value">' + formatter(items[0].value) + '</div><div class="wdv2-widget-note">Largest ' + esc(valueLabel.toLowerCase()) + '</div>' +
      '<div class="wdv2-rank-list">' + items.map(function (r) {
        var width = Math.max(4, r.value / max * 100);
        return '<div class="wdv2-rank-row"><span title="' + esc(r.label) + '">' + esc(shorten(r.label, 23)) + '</span><div class="wdv2-rank-track"><i style="width:' + width.toFixed(1) + '%"></i></div><b>' + esc(formatter(r.value)) + '</b></div>';
      }).join('') + '</div>';
  }

  function barWidget(items, formatter, valueLabel) {
    if (!items.length) return emptyState('fa-chart-column', 'No rate data yet', 'This view uses the effective tax rates stored with saved property records.');
    var values = items.map(function (r) { return r.value; });
    var max = Math.max.apply(null, values) || 1;
    var barW = Math.min(28, 220 / items.length), gap = 280 / items.length;
    var bars = items.map(function (r, i) {
      var h = Math.max(5, r.value / max * 105), x = 22 + i * gap;
      return '<rect class="wdv2-bar teal" x="' + x.toFixed(1) + '" y="' + (120 - h).toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="4"><title>' + esc(r.label + ': ' + formatter(r.value)) + '</title></rect>' +
        '<text class="wdv2-axis-label" x="' + (x + barW / 2).toFixed(1) + '" y="143" text-anchor="middle">' + esc(shorten(r.label, 8)) + '</text>';
    }).join('');
    return '<div class="wdv2-widget-value">' + formatter(avg(values)) + '</div><div class="wdv2-widget-note">' + esc(valueLabel) + ' across displayed municipalities</div>' +
      '<div class="wdv2-chart"><svg viewBox="0 0 320 150" preserveAspectRatio="none" role="img" aria-label="' + esc(META['effective-rate'].title) + '">' +
      [20,45,70,95,120].map(function (y) { return '<line class="wdv2-gridline" x1="14" y1="' + y + '" x2="310" y2="' + y + '"></line>'; }).join('') + bars + '</svg></div>';
  }

  function scoreDistributionWidget() {
    var scores = currentScoreRows().map(function (r) { return r.score; });
    if (!scores.length) return emptyState('fa-chart-pie', 'No score distribution yet', 'Watchdog Score coverage is required before this portfolio distribution can be drawn.');
    var buckets = [
      { label: '80–100', count: scores.filter(function (s) { return s >= 80; }).length, cls: 'green' },
      { label: '65–79', count: scores.filter(function (s) { return s >= 65 && s < 80; }).length, cls: 'teal' },
      { label: '45–64', count: scores.filter(function (s) { return s >= 45 && s < 65; }).length, cls: 'amber' },
      { label: '0–44', count: scores.filter(function (s) { return s < 45; }).length, cls: 'red' }
    ];
    var total = scores.length, radius = 48, circumference = 2 * Math.PI * radius, offset = 0;
    var colors = { green: '#1b9a61', teal: '#078486', amber: '#d88718', red: '#d84b52' };
    var circles = buckets.map(function (b) {
      var portion = b.count / total, dash = portion * circumference, gap = circumference - dash;
      var node = '<circle class="seg" cx="70" cy="70" r="' + radius + '" stroke="' + colors[b.cls] + '" stroke-dasharray="' + dash.toFixed(2) + ' ' + gap.toFixed(2) + '" stroke-dashoffset="' + (-offset).toFixed(2) + '"></circle>';
      offset += dash; return node;
    }).join('');
    return '<div class="wdv2-donut-wrap"><svg class="wdv2-donut" viewBox="0 0 140 140" role="img" aria-label="Watchdog Score distribution"><circle class="track" cx="70" cy="70" r="' + radius + '"></circle>' + circles + '<text x="70" y="70">' + total + '</text><text class="sub" x="70" y="86">scored</text></svg>' +
      '<div class="wdv2-donut-legend">' + buckets.map(function (b) { return '<div><i style="background:' + colors[b.cls] + '"></i><span>' + b.label + '</span><b>' + b.count + '</b></div>'; }).join('') + '</div></div>';
  }

  function changeActivityWidget() {
    var series = weeklyChangeSeries(), changes28 = recentChanges(28);
    if (!changes28.length) return emptyState('fa-clock-rotate-left', 'No recent change events', 'No recorded portfolio changes were found during the last 28 days.');
    var types = {};
    changes28.forEach(function (r) { var k = r.event_type || 'other'; types[k] = (types[k] || 0) + 1; });
    var leaders = Object.keys(types).sort(function (a,b) { return types[b] - types[a]; }).slice(0,3);
    return '<div class="wdv2-widget-value">' + changes28.length + '</div><div class="wdv2-widget-note">Recorded changes in the last 28 days</div>' + lineChart(series, 'recent change activity') +
      '<div class="wdv2-legend">' + leaders.map(function (k, i) { return '<span><i class="' + ['blue','teal','amber'][i] + '"></i>' + esc(prettyType(k)) + ': ' + types[k] + '</span>'; }).join('') + '</div>';
  }

  function emptyState(icon, title, text) {
    return '<div class="wdv2-empty"><i class="fas ' + icon + '"></i><b>' + esc(title) + '</b><span>' + esc(text) + '</span></div>';
  }

  function shorten(value, max) {
    var s = String(value || '');
    return s.length > max ? s.slice(0, Math.max(1, max - 1)) + '…' : s;
  }
  function prettyType(value) {
    return String(value || 'other').replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  function workspaceMarkup() {
    var metricCards = layout.metrics.map(function (id, i) { return metricMarkup(id, i * 55); }).join('');
    var chartCards = layout.analytics.map(function (id, i) { return widgetMarkup(id, 180 + i * 55); }).join('');
    return '<section id="wd-dashboard-workspace" aria-label="Portfolio intelligence analytics">' +
      '<div class="wdv2-section-shell">' +
        '<div class="wdv2-section-head"><div class="wdv2-section-title"><span class="wdv2-section-kicker">Live portfolio intelligence</span><h2>Portfolio analytics</h2><p>Every number below is calculated from your saved Watchdog records and trusted observations. No decorative sample data.</p></div>' +
        '<div class="wdv2-section-actions"><span class="wdv2-sync"><i class="fas fa-cloud-check"></i><span>Synced</span></span><button class="wdv2-btn" type="button" id="wdv2-customize"><i class="fas fa-sliders"></i>Customize dashboard</button></div></div>' +
        '<div class="wdv2-metrics-grid" data-widget-zone="metrics">' + metricCards + '</div>' +
        '<div class="wdv2-widget-grid" data-widget-zone="analytics">' + chartCards + '</div>' +
      '</div></section>' + customPanelMarkup();
  }

  function customPanelMarkup() {
    return '<aside class="wdv2-custom-panel" id="wdv2-custom-panel" aria-hidden="true"><div class="wdv2-custom-sheet" role="dialog" aria-modal="false" aria-labelledby="wdv2-custom-title">' +
      '<div class="wdv2-custom-sheet-head"><div><h3 id="wdv2-custom-title">Customize dashboard</h3><p>Drag visible widgets directly on the dashboard. Choose widths here or on each card. Your layout follows your account.</p></div><button class="wdv2-custom-close" type="button" data-wdv2-close aria-label="Close customization"><i class="fas fa-xmark"></i></button></div>' +
      customGroup('metrics', 'Key metrics') + customGroup('analytics', 'Analytics') +
      '<div class="wdv2-custom-group"><h4>Motion</h4><div class="wdv2-custom-item"><i class="fas fa-wand-magic-sparkles"></i><div><b>Dashboard motion</b><small>Chart drawing, card entrance and motion feedback.</small></div><label class="wdv2-switch"><input type="checkbox" id="wdv2-motion"' + (layout.motion ? ' checked' : '') + '><span></span></label></div></div>' +
      '<div class="wdv2-custom-actions"><button class="wdv2-btn" type="button" id="wdv2-reset">Reset layout</button><button class="wdv2-btn primary" type="button" data-wdv2-close>Done</button></div>' +
      '</div></aside>';
  }

  function customGroup(zone, title) {
    return '<div class="wdv2-custom-group"><h4>' + esc(title) + '</h4>' + layout[zone].map(function (id) {
      var visible = layout.hidden.indexOf(id) < 0;
      return '<div class="wdv2-custom-item" data-custom-id="' + esc(id) + '"><i class="fas ' + META[id].icon + '"></i><div><b>' + esc(META[id].title) + '</b><small>' + esc(META[id].desc) + '</small></div><label class="wdv2-switch"><input type="checkbox" data-widget-visible="' + esc(id) + '"' + (visible ? ' checked' : '') + '><span></span></label></div>';
    }).join('') + '</div>';
  }

  function mount() {
    var brief = document.getElementById('db-brief');
    if (!brief || !brief.parentNode) return false;
    var old = document.getElementById('wd-dashboard-workspace');
    var panel = document.getElementById('wdv2-custom-panel');
    if (old) old.remove();
    if (panel) panel.remove();
    if (!model.properties.length) return false;
    var holder = document.createElement('div');
    holder.innerHTML = workspaceMarkup();
    var workspace = holder.firstElementChild;
    var custom = holder.lastElementChild;
    brief.insertAdjacentElement('afterend', workspace);
    document.body.appendChild(custom);
    document.body.classList.add('wdv2-ready');
    if (!layout.motion || reducedMotion) document.body.classList.add('wdv2-no-motion'); else document.body.classList.remove('wdv2-no-motion');
    wireInteractions();
    syncViewVisibility();
    return true;
  }

  function syncViewVisibility() {
    var workspace = document.getElementById('wd-dashboard-workspace');
    if (!workspace) return;
    var standard = document.querySelector('.vw[data-v="simple"]');
    workspace.hidden = !!(standard && !standard.classList.contains('on'));
  }

  function wireInteractions() {
    var customize = document.getElementById('wdv2-customize');
    if (customize) customize.addEventListener('click', openCustomize);
    document.querySelectorAll('[data-wdv2-close]').forEach(function (button) { button.addEventListener('click', closeCustomize); });
    var reset = document.getElementById('wdv2-reset');
    if (reset) reset.addEventListener('click', function () {
      layout = clone(DEFAULT_LAYOUT); mount(); scheduleSave(); openCustomize();
    });
    var motion = document.getElementById('wdv2-motion');
    if (motion) motion.addEventListener('change', function () {
      layout.motion = !!motion.checked;
      document.body.classList.toggle('wdv2-no-motion', !layout.motion || reducedMotion);
      scheduleSave();
    });
    document.querySelectorAll('[data-widget-visible]').forEach(function (input) {
      input.addEventListener('change', function () {
        var id = input.getAttribute('data-widget-visible');
        var index = layout.hidden.indexOf(id);
        if (input.checked && index >= 0) layout.hidden.splice(index, 1);
        if (!input.checked && index < 0) layout.hidden.push(id);
        var card = document.querySelector('[data-widget-id="' + cssEscape(id) + '"]');
        if (card) card.hidden = !input.checked;
        scheduleSave();
      });
    });
    document.querySelectorAll('[data-widget-size]').forEach(function (button) {
      button.addEventListener('click', function () {
        var id = button.getAttribute('data-for'), size = button.getAttribute('data-widget-size');
        layout.sizes[id] = size;
        var card = document.querySelector('[data-widget-id="' + cssEscape(id) + '"]');
        if (card) {
          card.setAttribute('data-size', size);
          card.querySelectorAll('[data-widget-size]').forEach(function (b) { b.classList.toggle('on', b === button); });
        }
        scheduleSave();
      });
    });
    document.querySelectorAll('[data-widget-zone]').forEach(enableDragZone);
  }

  function cssEscape(value) {
    if (window.CSS && CSS.escape) return CSS.escape(value);
    return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  }

  function openCustomize() {
    document.body.classList.add('wdv2-customizing');
    var panel = document.getElementById('wdv2-custom-panel');
    if (panel) { panel.classList.add('open'); panel.setAttribute('aria-hidden', 'false'); }
    document.querySelectorAll('[data-widget-id]').forEach(function (card) { card.setAttribute('draggable', 'true'); });
  }
  function closeCustomize() {
    document.body.classList.remove('wdv2-customizing');
    var panel = document.getElementById('wdv2-custom-panel');
    if (panel) { panel.classList.remove('open'); panel.setAttribute('aria-hidden', 'true'); }
    document.querySelectorAll('[data-widget-id]').forEach(function (card) { card.setAttribute('draggable', 'false'); card.classList.remove('wdv2-drop-target'); });
    captureOrder(); scheduleSave();
  }

  function enableDragZone(zone) {
    var dragging = null;
    zone.addEventListener('dragstart', function (event) {
      if (!document.body.classList.contains('wdv2-customizing')) { event.preventDefault(); return; }
      var card = event.target.closest('[data-widget-id]');
      if (!card || card.parentNode !== zone) return;
      dragging = card;
      card.classList.add('wdv2-dragging');
      if (event.dataTransfer) { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', card.getAttribute('data-widget-id')); }
    });
    zone.addEventListener('dragover', function (event) {
      if (!dragging) return;
      event.preventDefault();
      var target = event.target.closest('[data-widget-id]');
      zone.querySelectorAll('.wdv2-drop-target').forEach(function (n) { n.classList.remove('wdv2-drop-target'); });
      if (!target || target === dragging || target.parentNode !== zone) return;
      target.classList.add('wdv2-drop-target');
      var rect = target.getBoundingClientRect();
      var before = event.clientY < rect.top + rect.height / 2 || (Math.abs(event.clientY - (rect.top + rect.height / 2)) < rect.height * .25 && event.clientX < rect.left + rect.width / 2);
      zone.insertBefore(dragging, before ? target : target.nextSibling);
    });
    zone.addEventListener('drop', function (event) { if (dragging) event.preventDefault(); captureOrder(); scheduleSave(); });
    zone.addEventListener('dragend', function () {
      if (dragging) dragging.classList.remove('wdv2-dragging');
      zone.querySelectorAll('.wdv2-drop-target').forEach(function (n) { n.classList.remove('wdv2-drop-target'); });
      dragging = null; captureOrder(); scheduleSave();
    });
  }

  function captureOrder() {
    ['metrics', 'analytics'].forEach(function (zoneName) {
      var zone = document.querySelector('[data-widget-zone="' + zoneName + '"]');
      if (!zone) return;
      layout[zoneName] = Array.from(zone.querySelectorAll(':scope > [data-widget-id]')).map(function (n) { return n.getAttribute('data-widget-id'); });
    });
  }

  function bootForSession(session) {
    if (!session || !session.user) return;
    if (started && sessionUser && sessionUser.id === session.user.id) return;
    started = true; sessionUser = session.user;
    collapseSidebarByDefault();
    Promise.all([readRemoteLayout(), fetchData()]).then(function (parts) {
      layout = mergeLayout(parts[0] || localLayout());
      mount();
      observeDashboard();
    }).catch(function (err) {
      console.warn('Dashboard workspace could not initialize:', err);
      layout = mergeLayout(localLayout());
      mount(); observeDashboard();
    });
  }

  function observeDashboard() {
    var brief = document.getElementById('db-brief');
    if (brief && !brief.__wdv2Observed) {
      brief.__wdv2Observed = true;
      var scheduled = false;
      new MutationObserver(function () {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(function () {
          scheduled = false;
          if (model.properties.length && !document.getElementById('wd-dashboard-workspace')) mount();
          syncViewVisibility();
        });
      }).observe(brief, { childList: true, subtree: false });
    }
    document.addEventListener('click', function (event) {
      if (event.target.closest('.vw[data-v]')) setTimeout(syncViewVisibility, 10);
    });
    document.addEventListener('njptr:sidemenu-ready', function () { collapseSidebarByDefault(); }, { once: true });
  }

  function bootForSession(session) {
    if (!session || !session.user) return;
    if (started && sessionUser && sessionUser.id === session.user.id) return;
    started = true; sessionUser = session.user;
    collapseSidebarByDefault();
    Promise.all([readRemoteLayout(), fetchData()]).then(function (parts) {
      layout = mergeLayout(parts[0] || localLayout());
      mount();
      observeDashboard();
    }).catch(function (err) {
      console.warn('Dashboard workspace could not initialize:', err);
      layout = mergeLayout(localLayout());
      mount(); observeDashboard();
    });
  }

  function start() {
    loadCss();
    collapseSidebarByDefault();
    getSession().then(function (session) {
      if (session) bootForSession(session);
      if (client) client.auth.onAuthStateChange(function (event, next) {
        if (next && next.user) bootForSession(next);
        if (event === 'SIGNED_OUT') {
          sessionUser = null; started = false;
          document.body.classList.remove('wdv2-ready', 'wdv2-customizing');
          var ws = document.getElementById('wd-dashboard-workspace'); if (ws) ws.remove();
          var cp = document.getElementById('wdv2-custom-panel'); if (cp) cp.remove();
        }
      });
    });
    setTimeout(collapseSidebarByDefault, 80);
    setTimeout(collapseSidebarByDefault, 450);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();

export {};
