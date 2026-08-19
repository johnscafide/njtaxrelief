/* Watchdog Dashboard · screenshot-matched 2027 application */
(function () {
  'use strict';

  var SUPABASE_URL = 'https://uvkvaxljhhngydvlrzom.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa';
  var LAYOUT_KEY = 'watchdog_exact_v1';
  var root = document.getElementById('wd4-root');
  if (!root || !window.supabase) return;

  var client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
      storageKey: 'sb-uvkvaxljhhngydvlrzom-auth-token'
    }
  });

  var map = null;
  var toastTimer = null;
  var weatherToken = 0;
  var saveTimer = null;
  var state = {
    user: null,
    properties: [],
    scores: [],
    scoreHistory: [],
    changes: [],
    snapshots: [],
    weather: null,
    weatherProperty: null,
    selectedCounty: 'ALL',
    order: [
      'map','score','value','tax','opportunities','changes','monitored',
      'scoretrend','taxvalue','municipality','weather','activity',
      'summary-total','summary-opportunity','summary-monitor','summary-risk','summary-gap','summary-verified'
    ],
    hidden: []
  };

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>\"]/g, function (c) {
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c];
    });
  }
  function num(value) { var n = Number(value); return Number.isFinite(n) ? n : 0; }
  function valid(value) { var n = Number(value); return Number.isFinite(n) ? n : null; }
  function sum(values) { return values.reduce(function (a, b) { return a + num(b); }, 0); }
  function avg(values) { var list = values.map(valid).filter(function (v) { return v != null; }); return list.length ? sum(list) / list.length : 0; }
  function money(value) {
    var n = num(value), a = Math.abs(n);
    if (a >= 1000000000) return '$' + (n / 1000000000).toFixed(2).replace(/\.00$/, '') + 'B';
    if (a >= 1000000) return '$' + (n / 1000000).toFixed(a >= 10000000 ? 1 : 2).replace(/\.00$/, '').replace(/\.0$/, '') + 'M';
    if (a >= 1000) return '$' + Math.round(n).toLocaleString();
    return '$' + Math.round(n).toLocaleString();
  }
  function compact(value) { return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(num(value)); }
  function pct(value, digits) { return num(value).toFixed(digits == null ? 1 : digits).replace(/\.0$/, '') + '%'; }
  function dateShort(value) { var d = new Date(value); return Number.isFinite(d.getTime()) ? d.toLocaleDateString('en-US', { month:'short', day:'numeric' }) : '—'; }
  function isoDaysAgo(days) { return new Date(Date.now() - days * 86400000).toISOString(); }
  function pretty(value) { return String(value || 'Update').replace(/[._-]/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); }); }
  function unique(list) { return Array.from(new Set(list.filter(Boolean))); }
  function propertyByPin(pin) { return state.properties.find(function (p) { return p.pams_pin === pin; }) || null; }

  function filteredProperties() {
    if (state.selectedCounty === 'ALL') return state.properties.slice();
    return state.properties.filter(function (p) { return String(p.county || '').toUpperCase() === state.selectedCounty; });
  }
  function pinsFor(props) { return new Set(props.map(function (p) { return p.pams_pin; }).filter(Boolean)); }
  function filteredChanges(props) { var pins = pinsFor(props); return state.changes.filter(function (r) { return pins.has(r.pams_pin); }); }
  function filteredSnapshots(props) { var pins = pinsFor(props); return state.snapshots.filter(function (r) { return pins.has(r.pams_pin); }); }

  function scoreMap() {
    var out = {};
    state.scores.forEach(function (r) {
      if (r.pams_pin && valid(r.watchdog_score) != null) out[r.pams_pin] = {
        score: num(r.watchdog_score), peer: valid(r.peer_median), peerCount: num(r.peer_count), town: r.town
      };
    });
    state.scoreHistory.forEach(function (r) {
      if (!r.pams_pin || valid(r.score) == null) return;
      if (!out[r.pams_pin]) out[r.pams_pin] = { score: num(r.score), peer:null, peerCount:0, town:'' };
    });
    return out;
  }

  function scoreRows(props) {
    var mapScores = scoreMap();
    return props.map(function (p) {
      var s = mapScores[p.pams_pin];
      return s ? { property:p, score:s.score, peer:s.peer, peerCount:s.peerCount, town:s.town || p.town } : null;
    }).filter(Boolean);
  }

  function categoryFor(property, scoreInfo) {
    if (property.has_appeal_case) return 'opportunity';
    if (!scoreInfo) return 'neutral';
    if (scoreInfo.score < 45) return 'risk';
    if (scoreInfo.score < 65) return 'monitor';
    return 'neutral';
  }

  function portfolioStats(props) {
    var scores = scoreRows(props);
    var valueProps = props.filter(function (p) { return num(p.watchdog_value) > 0; });
    var assessedProps = props.filter(function (p) { return num(p.assessed) > 0; });
    var matched = props.filter(function (p) { return num(p.watchdog_value) > 0 && num(p.assessed) > 0; });
    var changes = filteredChanges(props);
    var cutoff30 = Date.now() - 30 * 86400000;
    var changes30 = changes.filter(function (r) { var t = new Date(r.occurred_at).getTime(); return Number.isFinite(t) && t >= cutoff30; });
    var peerVals = scores.map(function (r) { return r.peer; }).filter(function (v) { return v != null; });
    var sm = scoreMap(), opportunity = 0, monitor = 0, risk = 0;
    props.forEach(function (p) {
      var c = categoryFor(p, sm[p.pams_pin]);
      if (c === 'opportunity') opportunity += 1;
      else if (c === 'monitor') monitor += 1;
      else if (c === 'risk') risk += 1;
    });
    var value = sum(valueProps.map(function (p) { return p.watchdog_value; }));
    var assessed = sum(assessedProps.map(function (p) { return p.assessed; }));
    var gap = sum(matched.map(function (p) { return num(p.watchdog_value) - num(p.assessed); }));
    var verified = props.filter(function (p) { return !!p.verified; }).length;
    return {
      count: props.length,
      scores: scores,
      score: scores.length ? avg(scores.map(function (r) { return r.score; })) : 0,
      peer: peerVals.length ? avg(peerVals) : 0,
      value: value,
      assessed: assessed,
      tax: sum(props.map(function (p) { return p.last_year_tax; })),
      opportunity: opportunity,
      monitor: monitor,
      risk: risk,
      changes30: changes30.length,
      gap: gap,
      gapCount: matched.length,
      verified: verified,
      coverage: props.length ? Math.round(((scores.length + valueProps.length + assessedProps.length + props.filter(function (p) { return num(p.last_year_tax) > 0; }).length) / (props.length * 4)) * 100) : 0
    };
  }

  function dedupeScoreHistory(props) {
    var pins = pinsFor(props), byKey = {};
    state.scoreHistory.forEach(function (r) {
      if (!pins.has(r.pams_pin) || valid(r.score) == null) return;
      var d = new Date(r.observed_at);
      if (!Number.isFinite(d.getTime())) return;
      var day = d.toISOString().slice(0, 10), key = day + '|' + r.pams_pin;
      var stamp = d.getTime();
      if (!byKey[key] || stamp >= byKey[key].stamp) byKey[key] = { day:day, pin:r.pams_pin, value:num(r.score), stamp:stamp };
    });
    var grouped = {};
    Object.keys(byKey).forEach(function (key) {
      var row = byKey[key];
      if (!grouped[row.day]) grouped[row.day] = [];
      grouped[row.day].push(row.value);
    });
    return Object.keys(grouped).sort().map(function (day) {
      return { label: dateShort(day + 'T12:00:00'), value: avg(grouped[day]), date: day };
    });
  }

  function snapshotSeries(props, field) {
    var rows = filteredSnapshots(props), byDatePin = {};
    rows.forEach(function (r) {
      var d = new Date(r.captured_at); if (!Number.isFinite(d.getTime())) return;
      var payload = r.payload || {}, v = valid(payload[field]); if (v == null) return;
      var day = d.toISOString().slice(0,10), key = day + '|' + r.pams_pin;
      byDatePin[key] = { day:day, pin:r.pams_pin, value:v, stamp:d.getTime() };
    });
    var grouped = {};
    Object.keys(byDatePin).forEach(function (key) {
      var r = byDatePin[key]; if (!grouped[r.day]) grouped[r.day] = [];
      grouped[r.day].push(r.value);
    });
    return Object.keys(grouped).sort().map(function (day) { return { label:dateShort(day + 'T12:00:00'), value:sum(grouped[day]), count:grouped[day].length, date:day }; });
  }

  function changeBars(props, days) {
    var changes = filteredChanges(props), out = [], now = new Date();
    for (var i = days - 1; i >= 0; i--) {
      var start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i), end = new Date(start.getTime() + 86400000);
      out.push(changes.filter(function (r) { var t = new Date(r.occurred_at).getTime(); return t >= start.getTime() && t < end.getTime(); }).length);
    }
    return out;
  }

  function opportunitySeries(props) {
    var flagged = new Set(props.filter(function (p) { return !!p.has_appeal_case; }).map(function (p) { return p.pams_pin; }));
    if (!flagged.size) return [];
    var changes = state.changes.filter(function (r) { return flagged.has(r.pams_pin); }), out = [], now = Date.now();
    for (var i = 7; i >= 0; i--) {
      var end = now - i * 7 * 86400000, start = end - 7 * 86400000;
      out.push(changes.filter(function (r) { var t = new Date(r.occurred_at).getTime(); return t >= start && t < end; }).length);
    }
    return out;
  }

  function normalized(values, width, height, pad) {
    var min = Math.min.apply(null, values), max = Math.max.apply(null, values), range = max - min || 1;
    return values.map(function (v, i) {
      var x = pad + (values.length === 1 ? (width - pad * 2) / 2 : i * (width - pad * 2) / (values.length - 1));
      var y = height - pad - ((v - min) / range) * (height - pad * 2);
      return [x,y];
    });
  }
  function path(points) { return points.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(2) + ',' + p[1].toFixed(2); }).join(' '); }
  function miniChart(values, tone) {
    if (!values || values.length < 2) return '';
    var pts = normalized(values, 180, 40, 3), d = path(pts), area = d + ' L' + pts[pts.length-1][0].toFixed(2) + ',40 L' + pts[0][0].toFixed(2) + ',40 Z';
    return '<div class="wd4-mini-chart ' + tone + '"><svg viewBox="0 0 180 40" preserveAspectRatio="none" aria-hidden="true"><path class="area" d="' + area + '"></path><path class="line" d="' + d + '"></path></svg></div>';
  }
  function barsSpark(values) {
    if (!values || !values.length) return '';
    var max = Math.max.apply(null, values) || 1;
    return '<div class="wd4-bars-spark">' + values.map(function (v) { return '<i style="height:' + Math.max(8, v / max * 100).toFixed(1) + '%"></i>'; }).join('') + '</div>';
  }

  function lineChart(series, benchmark) {
    if (!series || series.length < 2) return '<div style="height:210px;display:grid;place-items:center;color:#8995a6;font-size:10px">History is building</div>';
    var width = 320, height = 180, padL = 28, padR = 9, padT = 14, padB = 23;
    var values = series.map(function (p) { return p.value; });
    var min = Math.min.apply(null, values.concat(benchmark && benchmark.length ? benchmark.map(function (p) { return p.value; }) : []));
    var max = Math.max.apply(null, values.concat(benchmark && benchmark.length ? benchmark.map(function (p) { return p.value; }) : []));
    if (min === max) { min -= 5; max += 5; }
    var x = function (i) { return padL + i * (width - padL - padR) / Math.max(1, series.length - 1); };
    var y = function (v) { return padT + (max - v) * (height - padT - padB) / (max - min); };
    var points = series.map(function (p,i) { return [x(i),y(p.value)]; });
    var grids = '', labels = '';
    for (var g=0; g<5; g++) {
      var gy = padT + g * (height - padT - padB) / 4, gv = max - g * (max - min) / 4;
      grids += '<line class="grid" x1="' + padL + '" y1="' + gy.toFixed(1) + '" x2="' + (width-padR) + '" y2="' + gy.toFixed(1) + '"></line><text x="2" y="' + (gy+3).toFixed(1) + '">' + Math.round(gv) + '</text>';
    }
    var every = Math.max(1, Math.ceil(series.length / 6));
    series.forEach(function (p,i) { if (i % every === 0 || i === series.length - 1) labels += '<text x="' + x(i).toFixed(1) + '" y="174" text-anchor="middle">' + esc(p.label) + '</text>'; });
    var area = path(points) + ' L' + points[points.length-1][0].toFixed(2) + ',' + (height-padB) + ' L' + points[0][0].toFixed(2) + ',' + (height-padB) + ' Z';
    var second = '';
    if (benchmark && benchmark.length === series.length) {
      var bp = benchmark.map(function (p,i) { return [x(i),y(p.value)]; });
      second = '<path class="line purple" d="' + path(bp) + '"></path>';
    }
    return '<div class="wd4-line-chart"><svg viewBox="0 0 320 180" preserveAspectRatio="none" role="img" aria-label="Score trend">' + grids + '<path class="area-blue" d="' + area + '"></path><path class="line blue" d="' + path(points) + '"></path>' + second + points.map(function (p) { return '<circle class="blue" cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="2.3"></circle>'; }).join('') + labels + '</svg></div>';
  }

  function dualChart(valueSeries, taxSeries) {
    var dates = unique(valueSeries.map(function (p) { return p.date; }).concat(taxSeries.map(function (p) { return p.date; }))).sort();
    if (dates.length < 2) return '<div style="height:220px;display:grid;place-items:center;color:#8995a6;font-size:10px">Snapshot history is building</div>';
    var vm = {}, tm = {}; valueSeries.forEach(function (p) { vm[p.date] = p.value; }); taxSeries.forEach(function (p) { tm[p.date] = p.value; });
    var lastV = null, lastT = null;
    var rows = dates.map(function (d) { if (vm[d] != null) lastV = vm[d]; if (tm[d] != null) lastT = tm[d]; return { date:d, label:dateShort(d+'T12:00:00'), value:lastV, tax:lastT }; }).filter(function (r) { return r.value != null || r.tax != null; });
    var width=320,height=180,padL=32,padR=32,padT=14,padB=23;
    var values=rows.map(function(r){return r.value||0;}), taxes=rows.map(function(r){return r.tax||0;});
    var maxV=Math.max.apply(null,values)||1,maxT=Math.max.apply(null,taxes)||1;
    var x=function(i){return padL+i*(width-padL-padR)/Math.max(1,rows.length-1);};
    var pv=rows.map(function(r,i){return[x(i),padT+(maxV-(r.value||0))*(height-padT-padB)/maxV];});
    var pt=rows.map(function(r,i){return[x(i),padT+(maxT-(r.tax||0))*(height-padT-padB)/maxT];});
    var grids='',labels=''; for(var g=0;g<4;g++){var gy=padT+g*(height-padT-padB)/3;grids+='<line class="grid" x1="'+padL+'" y1="'+gy.toFixed(1)+'" x2="'+(width-padR)+'" y2="'+gy.toFixed(1)+'"></line><text x="2" y="'+(gy+3).toFixed(1)+'">'+esc(money(maxV*(1-g/3)))+'</text><text x="318" y="'+(gy+3).toFixed(1)+'" text-anchor="end">'+esc(money(maxT*(1-g/3)))+'</text>';}
    rows.forEach(function(r,i){labels+='<text x="'+x(i).toFixed(1)+'" y="174" text-anchor="middle">'+esc(r.label)+'</text>';});
    var areaV=path(pv)+' L'+pv[pv.length-1][0].toFixed(1)+','+(height-padB)+' L'+pv[0][0].toFixed(1)+','+(height-padB)+' Z';
    var areaT=path(pt)+' L'+pt[pt.length-1][0].toFixed(1)+','+(height-padB)+' L'+pt[0][0].toFixed(1)+','+(height-padB)+' Z';
    return '<div class="wd4-line-chart"><svg viewBox="0 0 320 180" preserveAspectRatio="none" role="img" aria-label="Tax versus value movement">'+grids+'<path class="area-blue" d="'+areaV+'"></path><path class="area-green" d="'+areaT+'"></path><path class="line blue" d="'+path(pv)+'"></path><path class="line green" d="'+path(pt)+'"></path>'+labels+'</svg></div>';
  }

  function trendPill(delta, suffix) {
    if (!Number.isFinite(delta) || Math.abs(delta) < .01) return '<span class="wd4-trend-pill neutral">Stable</span>';
    var up = delta >= 0;
    return '<span class="wd4-trend-pill ' + (up ? 'up' : 'down') + '"><i class="fas fa-arrow-' + (up ? 'up' : 'down') + '"></i>&nbsp;' + Math.abs(delta).toFixed(1) + (suffix || '%') + '</span>';
  }

  function card(id, cls, inner) {
    if (state.hidden.indexOf(id) >= 0) return '';
    return '<section class="wd4-card ' + cls + '" data-card-id="' + id + '">' + inner + '</section>';
  }
  function dragButton(id) { return '<button class="wd4-card-menu" type="button" data-drag-handle="' + id + '" aria-label="Move widget"><i class="fas fa-ellipsis-vertical"></i></button>'; }

  function mapCard(props, stats) {
    return card('map','wd4-map-card',
      '<div class="wd4-map-head"><button class="wd4-map-handle" type="button" data-drag-handle="map" aria-label="Move map"><i class="fas fa-grip-vertical"></i></button><span class="wd4-map-title">Property Map Overview</span></div>' +
      '<div class="wd4-map" id="wd4-map"></div>' +
      '<div class="wd4-map-legend"><div><i class="blue"></i><span>All Properties</span><b>' + stats.count.toLocaleString() + '</b></div><div><i class="green"></i><span>High Opportunity</span><b>' + stats.opportunity.toLocaleString() + '</b></div><div><i class="orange"></i><span>Monitor</span><b>' + stats.monitor.toLocaleString() + '</b></div><div><i class="red"></i><span>High Risk</span><b>' + stats.risk.toLocaleString() + '</b></div></div>'
    );
  }

  function scoreCard(props, stats) {
    var series = dedupeScoreHistory(props), delta = series.length > 1 ? series[series.length-1].value - series[0].value : 0;
    var score = stats.scores.length ? Math.round(stats.score) : null;
    var label = score == null ? 'Waiting' : score >= 80 ? 'Excellent' : score >= 65 ? 'Very Good' : score >= 50 ? 'Typical' : 'Needs Review';
    return card('score','wd4-kpi',dragButton('score') + '<div class="wd4-kpi-head"><span class="wd4-card-title">Watchdog Score <i class="fas fa-circle-info" title="Average current score across saved properties"></i></span></div><div class="wd4-kpi-value-row"><strong class="wd4-kpi-value">' + (score == null ? '—' : score) + '</strong><span class="wd4-kpi-status">' + label + '</span>' + trendPill(delta,' pts') + '</div><div class="wd4-scorebar"><i style="left:' + Math.max(1,Math.min(99,score == null ? 50 : score)) + '%"></i></div><div class="wd4-score-meta"><span>Portfolio Avg<b>' + (score == null ? '—' : score) + '</b></span><span>Town Avg<b>' + (stats.peer ? Math.round(stats.peer) : '—') + '</b></span></div>');
  }

  function genericKpi(id, title, value, pill, chartHtml, foot) {
    return card(id,'wd4-kpi',dragButton(id) + '<div class="wd4-kpi-head"><span class="wd4-card-title">' + esc(title) + ' <i class="fas fa-circle-info"></i></span></div><div class="wd4-kpi-value-row"><strong class="wd4-kpi-value">' + esc(value) + '</strong>' + (pill || '') + '</div>' + (chartHtml || '') + '<span class="wd4-kpi-foot">' + esc(foot || '') + '</span>');
  }

  function topCards(props, stats) {
    var values = snapshotSeries(props,'watchdog_value'), taxes = snapshotSeries(props,'last_year_tax');
    var vDelta = values.length > 1 && values[0].value ? (values[values.length-1].value - values[0].value) / values[0].value * 100 : 0;
    var tDelta = taxes.length > 1 && taxes[0].value ? (taxes[taxes.length-1].value - taxes[0].value) / taxes[0].value * 100 : 0;
    var oppSeries = opportunitySeries(props), changes = changeBars(props,18);
    var valueCard = genericKpi('value','Total Property Value',money(stats.value),trendPill(vDelta,'%'),miniChart(values.map(function(p){return p.value;}),'blue'),'recorded property snapshots');
    var taxCard = genericKpi('tax','Annual Tax Load',money(stats.tax),trendPill(tDelta,'%'),miniChart(taxes.map(function(p){return p.value;}),'red'),'latest recorded annual tax');
    var oppCard = card('opportunities','wd4-kpi',dragButton('opportunities') + '<div class="wd4-kpi-head"><span class="wd4-card-title">Appeals / Opportunities <i class="fas fa-circle-info"></i></span></div><div class="wd4-kpi-value-row"><strong class="wd4-kpi-value">' + stats.opportunity + '</strong><span class="wd4-kpi-status">' + (stats.opportunity ? 'Active' : 'Clear') + '</span></div>' + miniChart(oppSeries,'green') + '<span class="wd4-kpi-foot">flagged saved properties</span>');
    var changeCard = card('changes','wd4-kpi',dragButton('changes') + '<div class="wd4-kpi-head"><span class="wd4-card-title">Change Activity <i class="fas fa-circle-info"></i></span></div><div class="wd4-kpi-value-row"><strong class="wd4-kpi-value">' + stats.changes30 + '</strong></div>' + barsSpark(changes) + '<span class="wd4-kpi-foot">last 30 days</span>');
    var monitored = card('monitored','wd4-kpi',dragButton('monitored') + '<div class="wd4-kpi-head"><span class="wd4-card-title">Properties Monitored <i class="fas fa-circle-info"></i></span></div><div class="wd4-kpi-value-row"><strong class="wd4-kpi-value">' + stats.count.toLocaleString() + '</strong><span class="wd4-trend-pill neutral">' + stats.coverage + '%</span></div><div class="wd4-progress"><i style="width:' + stats.coverage + '%"></i></div><span class="wd4-kpi-foot">core portfolio coverage</span>');
    return [scoreCard(props,stats),valueCard,taxCard,oppCard,changeCard,monitored];
  }

  function scoreTrendCard(props, stats) {
    var series = dedupeScoreHistory(props), current = series.length ? series[series.length-1].value : stats.score, delta = series.length > 1 ? current - series[0].value : 0;
    var benchmark = stats.peer ? series.map(function (p) { return { label:p.label, value:stats.peer }; }) : null;
    return card('scoretrend','wd4-chart-card wd4-score-trend',dragButton('scoretrend') + '<div class="wd4-chart-head"><span class="wd4-card-title">Score Trend <i class="fas fa-circle-info"></i></span><select class="wd4-select-small" aria-label="Score trend timeframe"><option>All history</option></select></div><div class="wd4-chart-stat"><strong>' + (series.length ? Math.round(current) : '—') + '</strong><span class="' + (delta >= 0 ? 'up' : 'down') + '">' + (delta >= 0 ? '↑ ' : '↓ ') + Math.abs(delta).toFixed(1) + ' pts</span></div>' + lineChart(series,benchmark) + '<div class="wd4-chart-legend"><span><i class="blue"></i>Portfolio</span>' + (stats.peer ? '<span><i class="purple"></i>Town benchmark</span>' : '') + '</div>');
  }

  function taxValueCard(props) {
    var values = snapshotSeries(props,'watchdog_value'), taxes = snapshotSeries(props,'last_year_tax');
    return card('taxvalue','wd4-chart-card wd4-tax-value',dragButton('taxvalue') + '<div class="wd4-chart-head"><span class="wd4-card-title">Tax vs Value <i class="fas fa-circle-info"></i></span><select class="wd4-select-small"><option>Recorded history</option></select></div><div class="wd4-chart-legend" style="margin-top:17px"><span><i class="blue"></i>Property Value</span><span><i class="green"></i>Tax Amount</span></div>' + dualChart(values,taxes));
  }

  function municipalityRows(props) {
    var sm = scoreMap(), groups = {};
    props.forEach(function (p) {
      var town = String(p.town || 'Unknown').trim(); if (!groups[town]) groups[town] = { town:town, props:[], scores:[], tax:0 };
      groups[town].props.push(p); groups[town].tax += num(p.last_year_tax); if (sm[p.pams_pin]) groups[town].scores.push(sm[p.pams_pin].score);
    });
    return Object.keys(groups).map(function (k) { var g=groups[k]; return { town:g.town, score:g.scores.length?avg(g.scores):null, count:g.props.length, tax:g.tax }; }).sort(function (a,b) { return b.tax - a.tax; }).slice(0,10);
  }

  function municipalityCard(props) {
    var rows = municipalityRows(props);
    return card('municipality','wd4-chart-card wd4-municipality',dragButton('municipality') + '<div class="wd4-chart-head"><span class="wd4-card-title">By Municipality <i class="fas fa-circle-info"></i></span><select class="wd4-select-small"><option>Top 10</option></select></div><table class="wd4-muni-table"><thead><tr><th style="width:38%">Municipality</th><th style="width:24%">Score</th><th style="width:16%">Properties</th><th>Tax Load</th></tr></thead><tbody>' + (rows.length ? rows.map(function (r) { var s = r.score == null ? null : Math.round(r.score); return '<tr><td title="' + esc(r.town) + '">' + esc(r.town) + '</td><td><span class="wd4-score-cell">' + (s == null ? '—' : s) + '<i><b style="width:' + (s == null ? 0 : s) + '%"></b></i></span></td><td>' + r.count + '</td><td>' + esc(money(r.tax)) + '</td></tr>'; }).join('') : '<tr><td colspan="4">No municipality data</td></tr>') + '</tbody></table>');
  }

  function weatherIcon(text) {
    var t=String(text||'').toLowerCase(); if(t.indexOf('thunder')>=0)return'fa-cloud-bolt'; if(t.indexOf('snow')>=0)return'fa-snowflake'; if(t.indexOf('rain')>=0||t.indexOf('shower')>=0)return'fa-cloud-rain'; if(t.indexOf('cloud')>=0)return'fa-cloud-sun'; if(t.indexOf('clear')>=0||t.indexOf('sun')>=0)return'fa-sun'; return'fa-cloud-sun';
  }

  function weatherCard() {
    var p=state.weatherProperty,w=state.weather;
    if(!p||!w||!w.current) return card('weather','wd4-chart-card wd4-weather-card',dragButton('weather') + '<div class="wd4-chart-head"><span class="wd4-card-title">Local Conditions <i class="fas fa-circle-info"></i></span></div><div style="height:255px;display:grid;place-items:center;color:#8491a3;font-size:10px">Weather is loading</div>');
    var c=w.current, forecast=(w.daily||[]).slice(0,4);
    return card('weather','wd4-chart-card wd4-weather-card',dragButton('weather') + '<div class="wd4-chart-head"><span class="wd4-card-title">Local Conditions <i class="fas fa-circle-info"></i></span></div><div class="wd4-weather-location">' + esc(p.town || p.address || 'Saved property') + '</div><div class="wd4-weather-main"><i class="fas ' + weatherIcon(c.shortForecast) + '"></i><div class="wd4-weather-temp"><strong>' + esc(c.temperature) + '°' + esc(c.temperatureUnit || 'F') + '</strong><span>' + esc(c.shortForecast || 'Forecast') + '</span></div></div><div class="wd4-weather-meta"><div><span>Humidity</span><b>' + esc(c.relativeHumidity && c.relativeHumidity.value != null ? Math.round(c.relativeHumidity.value) + '%' : '—') + '</b></div><div><span>Wind</span><b>' + esc(c.windSpeed || '—') + '</b></div><div><span>Rain Chance</span><b>' + esc(c.probabilityOfPrecipitation && c.probabilityOfPrecipitation.value != null ? c.probabilityOfPrecipitation.value + '%' : '—') + '</b></div></div><div class="wd4-forecast">' + forecast.map(function (f) { return '<div><span>' + esc(new Date(f.startTime).toLocaleDateString('en-US',{weekday:'short'}).toUpperCase()) + '</span><i class="fas ' + weatherIcon(f.shortForecast) + '"></i><b>' + esc(f.temperature) + '° ' + esc(f.temperatureUnit || 'F') + '</b></div>'; }).join('') + '</div>');
  }

  function formatDelta(row) {
    if (valid(row.delta_numeric) == null || num(row.delta_numeric) === 0) return { text:'New', cls:'new' };
    var v=num(row.delta_numeric), marker=String(row.marker_id||row.event_type||'').toLowerCase();
    if (marker.indexOf('rate')>=0 || marker.indexOf('pct')>=0 || marker.indexOf('percent')>=0) return { text:(v>=0?'+':'')+v.toFixed(1)+'%', cls:v>=0?'up':'down' };
    if (marker.indexOf('tax')>=0 || marker.indexOf('value')>=0 || marker.indexOf('assessment')>=0) return { text:(v>=0?'+':'-')+money(Math.abs(v)), cls:v>=0?'up':'down' };
    return { text:(v>=0?'+':'')+compact(v), cls:v>=0?'up':'down' };
  }

  function activityCard(props) {
    var pins=pinsFor(props), rows=state.changes.filter(function(r){return pins.has(r.pams_pin);}).sort(function(a,b){return new Date(b.occurred_at)-new Date(a.occurred_at);}).slice(0,8);
    var html = '<div class="wd4-activity-row head"><span>Property / Project</span><span>Type</span><span>Change</span><span>Date</span></div>' + rows.map(function (r) { var p=propertyByPin(r.pams_pin), d=formatDelta(r); return '<div class="wd4-activity-row"><div class="wd4-activity-property"><i class="wd4-thumb fas fa-house"></i><span title="' + esc(p && p.address || r.pams_pin) + '">' + esc(p && p.address || r.pams_pin || 'Property') + '</span></div><span>' + esc(pretty(r.event_type || r.title || r.marker_id)) + '</span><span class="wd4-change ' + d.cls + '">' + esc(d.text) + '</span><span>' + esc(dateShort(r.occurred_at)) + '</span></div>'; }).join('');
    if (!rows.length) html += '<div style="height:220px;display:grid;place-items:center;color:#8995a6;font-size:10px">No recent activity</div>';
    return card('activity','wd4-chart-card wd4-activity',dragButton('activity') + '<div class="wd4-chart-head"><span class="wd4-card-title">Recent Activity <i class="fas fa-circle-info"></i></span><a class="wd4-activity-link" href="/property/pulse">View all</a></div><div class="wd4-activity-list">' + html + '</div>');
  }

  function summaryCard(id,title,value,meta,small,icon,tone,metaCls) {
    return card(id,'wd4-summary','<div class="wd4-summary-icon ' + tone + '"><i class="fas ' + icon + '"></i></div><div class="wd4-summary-copy"><span>' + esc(title) + '</span><strong>' + esc(value) + '</strong></div><div class="wd4-summary-meta"><b class="' + (metaCls||'') + '">' + esc(meta) + '</b><small>' + esc(small) + '</small></div>');
  }
  function summaryCards(stats) {
    var total=stats.count||1;
    return [
      summaryCard('summary-total','Total Properties',stats.count.toLocaleString(),stats.count?'100%':'0%','Active Portfolio','fa-house','blue'),
      summaryCard('summary-opportunity','High Opportunity',stats.opportunity.toLocaleString(),pct(stats.opportunity/total*100),'vs total','fa-arrow-trend-up','green','up'),
      summaryCard('summary-monitor','Monitor',stats.monitor.toLocaleString(),pct(stats.monitor/total*100),'vs total','fa-eye','orange'),
      summaryCard('summary-risk','High Risk',stats.risk.toLocaleString(),pct(stats.risk/total*100),'vs total','fa-shield-halved','red','down'),
      summaryCard('summary-gap','Value Gap',money(stats.gap),stats.gapCount+' matched','Value - assessment','fa-dollar-sign','purple',stats.gap>=0?'up':'down'),
      summaryCard('summary-verified','Verified Records',stats.verified.toLocaleString(),pct(stats.verified/total*100),'saved properties','fa-circle-check','blue',stats.verified===stats.count?'up':'')
    ];
  }

  function brandMarkup() {
    return '<a class="wd4-brand" href="/property/dashboard"><span class="wd4-brand-mark"><i class="fas fa-dog"></i></span><span class="wd4-brand-copy"><strong>Watchdog</strong><small>PROPERTY INTELLIGENCE</small></span></a>';
  }
  function userName() {
    var m=state.user && state.user.user_metadata || {}, name=m.full_name || m.name || state.user.email || 'there';
    return String(name).split(/\s+/)[0];
  }
  function avatarMarkup() {
    var m=state.user && state.user.user_metadata || {}, src=m.avatar_url || m.picture || '';
    if(src) return '<img class="wd4-avatar" src="' + esc(src) + '" alt="Account">';
    var n=userName().slice(0,2).toUpperCase(); return '<span class="wd4-avatar">' + esc(n) + '</span>';
  }
  function dateMarkup() {
    var now=new Date(); return '<div class="wd4-date-chip"><i class="far fa-calendar-days"></i><div><strong>' + esc(now.toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})) + '</strong><span>' + esc(now.toLocaleDateString('en-US',{weekday:'long'})) + '</span></div></div>';
  }
  function topWeatherMarkup() {
    var c=state.weather&&state.weather.current;
    return '<button class="wd4-weather-chip" type="button" data-action="weather-jump"><i class="fas ' + weatherIcon(c&&c.shortForecast) + ' wd4-weather-icon"></i><div><strong>' + (c?esc(c.temperature)+'°'+esc(c.temperatureUnit||'F'):'Weather') + '</strong><span>' + esc(c&&c.shortForecast||'Local conditions') + '</span></div><i class="fas fa-chevron-down"></i></button>';
  }
  function countyOptions() {
    var counties=unique(state.properties.map(function(p){return String(p.county||'').trim().toUpperCase();})).sort();
    return '<option value="ALL">All Counties</option>' + counties.map(function(c){return '<option value="'+esc(c)+'"'+(state.selectedCounty===c?' selected':'')+'>'+esc(c.replace(/\b\w/g,function(x){return x.toUpperCase();}).toLowerCase().replace(/\b\w/g,function(x){return x.toUpperCase();}))+'</option>';}).join('');
  }

  function navMarkup() {
    return '<aside class="wd4-nav" id="wd4-nav"><button class="wd4-nav-backdrop" type="button" data-action="nav-close" aria-label="Close menu"></button><div class="wd4-nav-panel"><div class="wd4-nav-head">' + brandMarkup() + '<button class="wd4-nav-close" type="button" data-action="nav-close"><i class="fas fa-xmark"></i></button></div><nav class="wd4-nav-links"><a class="active" href="/property/dashboard"><i class="fas fa-table-columns"></i>Dashboard</a><a href="/property/home"><i class="fas fa-heart"></i>Home / Watchlist</a><a href="/property/pulse"><i class="fas fa-wave-square"></i>Change Intelligence</a><a href="/property/agent-desk"><i class="fas fa-bullseye"></i>Agent Control</a><a href="/property/data-center"><i class="fas fa-database"></i>Data Center</a><a href="/property/pro"><i class="fas fa-briefcase"></i>Professional Hub</a><a href="/property/account"><i class="fas fa-user-gear"></i>Account</a></nav><div class="wd4-nav-foot"><button type="button" data-action="signout"><i class="fas fa-arrow-right-from-bracket"></i>&nbsp; Sign out</button></div></div></aside>';
  }

  function widgetPopMarkup() {
    var ids=['map','score','value','tax','opportunities','changes','monitored','scoretrend','taxvalue','municipality','weather','activity'];
    var names={map:'Property Map Overview',score:'Watchdog Score',value:'Total Property Value',tax:'Annual Tax Load',opportunities:'Appeals / Opportunities',changes:'Change Activity',monitored:'Properties Monitored',scoretrend:'Score Trend',taxvalue:'Tax vs Value',municipality:'By Municipality',weather:'Local Conditions',activity:'Recent Activity'};
    return '<aside class="wd4-widget-pop" id="wd4-widget-pop"><h3>Dashboard widgets</h3><p>Show or hide the screenshot layout. Drag any card by its dot menu to reposition it.</p>' + ids.map(function(id){var hidden=state.hidden.indexOf(id)>=0;return '<div class="wd4-widget-option"><span>'+esc(names[id])+'</span><button type="button" data-widget-toggle="'+id+'">'+(hidden?'Add':'Hide')+'</button></div>';}).join('') + '</aside>';
  }

  function render() {
    var props=filteredProperties(), stats=portfolioStats(props), cards=[];
    var cardMap={};
    cardMap.map=mapCard(props,stats); topCards(props,stats).forEach(function(html){var id=(html.match(/data-card-id="([^"]+)/)||[])[1];if(id)cardMap[id]=html;});
    cardMap.scoretrend=scoreTrendCard(props,stats); cardMap.taxvalue=taxValueCard(props); cardMap.municipality=municipalityCard(props); cardMap.weather=weatherCard(); cardMap.activity=activityCard(props);
    summaryCards(stats).forEach(function(html){var id=(html.match(/data-card-id="([^"]+)/)||[])[1];if(id)cardMap[id]=html;});
    state.order.forEach(function(id){if(cardMap[id])cards.push(cardMap[id]);});
    Object.keys(cardMap).forEach(function(id){if(state.order.indexOf(id)<0)cards.push(cardMap[id]);});

    var unread=filteredChanges(props).filter(function(r){return !r.read_at;}).length;
    root.innerHTML='<div class="wd4-app"><header class="wd4-topbar"><div class="wd4-top-left"><button class="wd4-menu-btn" type="button" data-action="nav-open" aria-label="Open navigation"><i class="fas fa-bars"></i></button>'+brandMarkup()+'</div><div class="wd4-top-right">'+dateMarkup()+topWeatherMarkup()+'<button class="wd4-icon-btn" type="button" data-action="activity-jump" aria-label="Recent alerts"><i class="far fa-bell"></i>'+(unread?'<span class="wd4-badge">'+Math.min(99,unread)+'</span>':'')+'</button><button class="wd4-user" type="button" data-action="account">'+avatarMarkup()+'<i class="fas fa-chevron-down"></i></button></div></header><section class="wd4-welcome"><div class="wd4-welcome-copy"><h1>Welcome back, '+esc(userName())+' <span>👋</span></h1><select class="wd4-filter-select" id="wd4-county">'+countyOptions()+'</select></div><div class="wd4-page-actions"><button class="wd4-add-btn" type="button" data-action="widgets"><i class="fas fa-plus"></i><span>Add Widget</span></button><button class="wd4-grid-btn" type="button" data-action="layout" aria-label="Arrange dashboard"><i class="fas fa-table-cells-large"></i></button><button class="wd4-export-btn" type="button" data-action="export"><i class="fas fa-download"></i><span>Export</span></button></div></section><main class="wd4-canvas"><div class="wd4-grid" id="wd4-grid">'+cards.join('')+'</div></main>'+navMarkup()+widgetPopMarkup()+'<div class="wd4-toast" id="wd4-toast"></div></div>';
    root.hidden=false; document.body.classList.add('wd4-mounted');
    wire(); initMap(props); enableDrag();
  }

  function initMap(props) {
    if(map){try{map.remove();}catch(_){}map=null;}
    var el=document.getElementById('wd4-map'); if(!el||!window.L)return;
    var geo=props.filter(function(p){return valid(p.lat)!=null&&valid(p.lon)!=null;});
    map=L.map(el,{zoomControl:false,attributionControl:true,scrollWheelZoom:true});
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap &copy; CARTO'}).addTo(map);
    L.control.zoom({position:'topright'}).addTo(map);
    var sm=scoreMap(),bounds=[];
    geo.forEach(function(p){var cat=categoryFor(p,sm[p.pams_pin]),cls=cat==='opportunity'?'good':cat==='monitor'?'monitor':cat==='risk'?'risk':'neutral';var icon=L.divIcon({className:'',html:'<div class="wd4-map-marker '+cls+'"></div>',iconSize:[17,17],iconAnchor:[8,8]});var marker=L.marker([num(p.lat),num(p.lon)],{icon:icon}).addTo(map);marker.bindTooltip('<b>'+esc(p.address||'Property')+'</b><br>'+esc(p.town||'')+(sm[p.pams_pin]?'<br>Watchdog Score '+Math.round(sm[p.pams_pin].score):''));bounds.push([num(p.lat),num(p.lon)]);});
    if(bounds.length===1)map.setView(bounds[0],14);else if(bounds.length>1)map.fitBounds(bounds,{padding:[35,35],maxZoom:13});else map.setView([40.0583,-74.4057],8);
    setTimeout(function(){if(map)map.invalidateSize();},80);
  }

  function wire() {
    var county=document.getElementById('wd4-county');if(county)county.addEventListener('change',function(){state.selectedCounty=county.value;state.weather=null;state.weatherProperty=null;render();fetchWeather().then(render);});
    document.querySelectorAll('[data-action]').forEach(function(n){n.addEventListener('click',function(e){var a=n.getAttribute('data-action');if(a==='nav-open')toggleNav(true);else if(a==='nav-close')toggleNav(false);else if(a==='widgets')toggleWidgets();else if(a==='layout'){document.body.classList.toggle('wd4-layout-mode');showToast(document.body.classList.contains('wd4-layout-mode')?'Drag cards by the dot handle':'Layout saved');}else if(a==='export')exportCsv();else if(a==='account')location.href='/property/account';else if(a==='signout')client.auth.signOut().then(function(){location.href='/property/';});else if(a==='weather-jump'){var w=document.querySelector('[data-card-id="weather"]');if(w)w.scrollIntoView({behavior:'smooth',block:'center'});}else if(a==='activity-jump'){var r=document.querySelector('[data-card-id="activity"]');if(r)r.scrollIntoView({behavior:'smooth',block:'center'});}});});
    document.querySelectorAll('[data-widget-toggle]').forEach(function(btn){btn.addEventListener('click',function(){var id=btn.getAttribute('data-widget-toggle'),i=state.hidden.indexOf(id);if(i>=0)state.hidden.splice(i,1);else state.hidden.push(id);saveLayout();render();var p=document.getElementById('wd4-widget-pop');if(p)p.classList.add('open');});});
    document.addEventListener('keydown',escapeHandler,{once:true});
  }
  function escapeHandler(e){if(e.key==='Escape'){toggleNav(false);var p=document.getElementById('wd4-widget-pop');if(p)p.classList.remove('open');}document.addEventListener('keydown',escapeHandler,{once:true});}
  function toggleNav(open){var n=document.getElementById('wd4-nav');if(n)n.classList.toggle('open',!!open);}
  function toggleWidgets(){var p=document.getElementById('wd4-widget-pop');if(p)p.classList.toggle('open');}
  function showToast(text){var t=document.getElementById('wd4-toast');if(!t)return;t.textContent=text;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(function(){t.classList.remove('show');},1800);}

  function enableDrag() {
    var grid=document.getElementById('wd4-grid');if(!grid)return;var dragging=null;
    grid.querySelectorAll('[data-drag-handle]').forEach(function(handle){handle.addEventListener('pointerdown',function(){var c=handle.closest('[data-card-id]');if(c)c.setAttribute('draggable','true');});handle.addEventListener('pointerup',function(){var c=handle.closest('[data-card-id]');if(c&&!c.classList.contains('wd4-dragging'))c.setAttribute('draggable','false');});});
    grid.addEventListener('dragstart',function(e){var c=e.target.closest('[data-card-id]');if(!c||c.getAttribute('draggable')!=='true'){e.preventDefault();return;}dragging=c;c.classList.add('wd4-dragging');if(e.dataTransfer){e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',c.getAttribute('data-card-id'));}});
    grid.addEventListener('dragover',function(e){if(!dragging)return;e.preventDefault();var target=e.target.closest('[data-card-id]');grid.querySelectorAll('.wd4-drop').forEach(function(x){x.classList.remove('wd4-drop');});if(!target||target===dragging)return;target.classList.add('wd4-drop');var r=target.getBoundingClientRect(),before=e.clientY<r.top+r.height/2;if(Math.abs(e.clientY-(r.top+r.height/2))<r.height*.3)before=e.clientX<r.left+r.width/2;grid.insertBefore(dragging,before?target:target.nextSibling);});
    grid.addEventListener('drop',function(e){if(dragging)e.preventDefault();captureOrder();saveLayout();});
    grid.addEventListener('dragend',function(){if(dragging){dragging.classList.remove('wd4-dragging');dragging.setAttribute('draggable','false');}grid.querySelectorAll('.wd4-drop').forEach(function(x){x.classList.remove('wd4-drop');});dragging=null;captureOrder();saveLayout();showToast('Dashboard layout saved');});
  }
  function captureOrder(){var grid=document.getElementById('wd4-grid');if(!grid)return;state.order=Array.from(grid.querySelectorAll(':scope > [data-card-id]')).map(function(n){return n.getAttribute('data-card-id');});}

  function exportCsv() {
    var props=filteredProperties(), stats=portfolioStats(props), lines=[['Metric','Value'],['Properties',stats.count],['Watchdog Score',stats.score?stats.score.toFixed(1):''],['Total Property Value',stats.value],['Annual Tax Load',stats.tax],['Potential Appeals',stats.opportunity],['30-Day Changes',stats.changes30],['Value / Assessment Gap',stats.gap],[],['Address','Municipality','County','Assessment','Annual Tax','Watchdog Value','Watchdog Score']];
    var sm=scoreMap();props.forEach(function(p){lines.push([p.address||'',p.town||'',p.county||'',p.assessed||'',p.last_year_tax||'',p.watchdog_value||'',sm[p.pams_pin]?sm[p.pams_pin].score:'']);});
    var csv=lines.map(function(row){return row.map(function(v){return '"'+String(v==null?'':v).replace(/"/g,'""')+'"';}).join(',');}).join('\n');
    var blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='watchdog-portfolio-dashboard.csv';document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url);},1000);
  }

  function readLayout() {
    if(!state.user)return Promise.resolve();
    return client.from('dashboard_layout_preferences').select('layout').eq('user_id',state.user.id).maybeSingle().then(function(res){var all=res&&res.data&&res.data.layout||{},saved=all&&all[LAYOUT_KEY];if(saved){if(Array.isArray(saved.order)){var known=state.order.slice(),incoming=saved.order.filter(function(id){return known.indexOf(id)>=0;});state.order=incoming.concat(known.filter(function(id){return incoming.indexOf(id)<0;}));}if(Array.isArray(saved.hidden))state.hidden=saved.hidden.filter(function(id){return state.order.indexOf(id)>=0;});}}).catch(function(){});
  }
  function saveLayout() {
    clearTimeout(saveTimer);saveTimer=setTimeout(function(){if(!state.user)return;client.from('dashboard_layout_preferences').select('layout').eq('user_id',state.user.id).maybeSingle().then(function(res){var all=res&&res.data&&res.data.layout&&typeof res.data.layout==='object'?res.data.layout:{};all[LAYOUT_KEY]={order:state.order,hidden:state.hidden,updated_at:new Date().toISOString()};return client.from('dashboard_layout_preferences').upsert({user_id:state.user.id,layout:all,updated_at:new Date().toISOString()},{onConflict:'user_id'});}).catch(function(){});},450);
  }

  function fetchData() {
    return client.from('saved_properties').select('id,pams_pin,kind,address,town,county,zip,assessed,last_year_tax,effective_rate,watchdog_value,has_appeal_case,updated_at,created_at,lat,lon,verified').order('created_at',{ascending:false}).then(function(res){state.properties=res&&res.data||[];var pins=unique(state.properties.map(function(p){return p.pams_pin;}));if(!pins.length)return[];return Promise.allSettled([
      client.from('public_watchdog_score_cache').select('pams_pin,watchdog_score,town,county,peer_count,peer_median,computed_at').in('pams_pin',pins),
      client.from('score_observations').select('pams_pin,marker_id,score,observed_at,model_version').in('pams_pin',pins).in('marker_id',['watchdog.score','watchdog.watchdog_score']).order('observed_at',{ascending:true}).limit(2500),
      client.from('property_update_events').select('pams_pin,event_type,severity,title,occurred_at,delta_numeric,marker_id,old_value,new_value,read_at').in('pams_pin',pins).gte('occurred_at',isoDaysAgo(120)).order('occurred_at',{ascending:false}).limit(3000),
      client.from('property_record_snapshots').select('pams_pin,captured_at,payload').in('pams_pin',pins).order('captured_at',{ascending:true}).limit(3000)
    ]);}).then(function(parts){if(!Array.isArray(parts))return;state.scores=settled(parts[0]);state.scoreHistory=settled(parts[1]);state.changes=settled(parts[2]);state.snapshots=settled(parts[3]);});
  }
  function settled(part){return part&&part.status==='fulfilled'&&part.value&&!part.value.error&&Array.isArray(part.value.data)?part.value.data:[];}

  function weatherTarget() {
    var props=filteredProperties().filter(function(p){return valid(p.lat)!=null&&valid(p.lon)!=null;});
    return props.find(function(p){return p.kind==='home';})||props[0]||null;
  }
  function fetchJson(url) {
    var controller=typeof AbortController!=='undefined'?new AbortController():null,timer=controller?setTimeout(function(){controller.abort();},7500):null;
    return fetch(url,{headers:{Accept:'application/geo+json'},signal:controller?controller.signal:undefined}).then(function(r){if(!r.ok)throw new Error('weather '+r.status);return r.json();}).finally(function(){if(timer)clearTimeout(timer);});
  }
  function fetchWeather() {
    var target=weatherTarget();state.weatherProperty=target;if(!target){state.weather=null;return Promise.resolve();}
    var token=++weatherToken,lat=num(target.lat).toFixed(4),lon=num(target.lon).toFixed(4);
    return fetchJson('https://api.weather.gov/points/'+lat+','+lon).then(function(point){if(token!==weatherToken)return;var p=point&&point.properties||{};return Promise.allSettled([p.forecastHourly?fetchJson(p.forecastHourly):Promise.resolve(null),p.forecast?fetchJson(p.forecast):Promise.resolve(null)]);}).then(function(parts){if(!parts||token!==weatherToken)return;var hourly=parts[0]&&parts[0].status==='fulfilled'?parts[0].value:null,daily=parts[1]&&parts[1].status==='fulfilled'?parts[1].value:null;var hours=hourly&&hourly.properties&&hourly.properties.periods||[],days=daily&&daily.properties&&daily.properties.periods||[];state.weather={current:hours[0]||days[0]||null,hourly:hours.slice(0,8),daily:days.filter(function(d){return d.isDaytime!==false;}).slice(0,5),updated:new Date().toISOString()};}).catch(function(){state.weather=null;});
  }

  function boot() {
    client.auth.getSession().then(function(res){var session=res&&res.data&&res.data.session;if(!session||!session.user){location.replace('/property/');return;}state.user=session.user;return Promise.all([readLayout(),fetchData()]).then(function(){render();return fetchWeather();}).then(function(){render();});}).catch(function(){location.replace('/property/');});
  }

  boot();
})();

export {};
