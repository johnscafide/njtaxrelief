/* Watchdog home feed (the reimagined Watchdog home page).
   Reads /api/watchdog-home-feed for one town and renders the summary tiles,
   the Watchdog Intelligence Brief, the feed cards, the map and the rail.
   The property search, the overlay, both menus and the footer are owned by
   lookup.js and the shared navigation runtimes; this file never touches them,
   it only calls plLookup() when someone opens a property from a card. */
(function () {
  'use strict';
  if (window.__WATCHDOG_HOME_FEED__) return;
  window.__WATCHDOG_HOME_FEED__ = true;

  var root = document.getElementById('wdh');
  if (!root) return;

  var API = '/api/watchdog-home-feed';
  var TOWNS_URL = '/property/data/home-feed-towns.json';
  var PAS1_DEADLINE = '2026-11-02';
  var KEY_TOWN = 'wdh:town';
  var KEY_SEEN = 'wdh:seen:';
  var KEY_HOME = 'wdh:home:';
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var SHORT = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

  var state = {
    tab: 'all',
    radius: 'town',
    feed: null,
    home: null,
    user: null,
    towns: null,
    townsPromise: null,
    map: null,
    mapLayer: null,
    seen: null,
    seenFor: '',
    seenSaved: {},
    homePrev: null,
    games: null,
    gamesPromise: null,
    briefOpen: false,
    requestId: 0
  };

  /* ---------- small helpers ---------- */
  function $(id) { return document.getElementById(id); }
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function num(value) { var n = Number(value); return Number.isFinite(n) ? n : null; }
  function money(value) { var n = num(value); return n == null ? '' : '$' + Math.round(n).toLocaleString('en-US'); }
  function shortMoney(value) {
    var n = num(value);
    if (n == null) return '';
    if (n >= 1e6) return '$' + (Math.round(n / 1e4) / 100).toString().replace(/\.0+$|(\.\d)0$/, '$1') + 'M';
    if (n >= 1e4) return '$' + Math.round(n / 1e3) + 'K';
    return money(n);
  }
  function count(value) { var n = num(value); return n == null ? '' : Math.round(n).toLocaleString('en-US'); }
  function pct(value) { var n = num(value); return n == null ? '' : Math.abs(n).toFixed(1).replace(/\.0$/, '') + '%'; }
  function plural(n, one, many) { return n === 1 ? one : many; }
  function parseDay(value) {
    if (!value) return null;
    var m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
  }
  function dayLabel(value, withYear) {
    var d = value instanceof Date ? value : parseDay(value);
    if (!d) return '';
    return MONTHS[d.getMonth()] + ' ' + d.getDate() + (withYear === false ? '' : ', ' + d.getFullYear());
  }
  function monthYear(value) {
    var d = value instanceof Date ? value : parseDay(value);
    return d ? MONTHS[d.getMonth()] + ' ' + d.getFullYear() : '';
  }
  function store(key, value) {
    try {
      if (value === undefined) {
        var raw = window.localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
      }
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (_error) {}
    return null;
  }
  function miles(a, b) {
    if (!a || !b || a.lat == null || b.lat == null) return null;
    var r = 3958.8, toRad = Math.PI / 180;
    var dLat = (b.lat - a.lat) * toRad, dLon = (b.lon - a.lon) * toRad;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * r * Math.asin(Math.sqrt(h));
  }
  function distanceText(item) {
    var d = state.home ? miles(state.home, item) : null;
    if (d == null) return '';
    return (d < 0.1 ? 'Under 0.1' : d.toFixed(1)) + ' mi from your home';
  }
  function icon(name) { return '<i class="fas fa-' + name + '" aria-hidden="true"></i>'; }
  /* Static cards live as <template>s in the page so their copy stays in HTML. */
  function tpl(id) { var t = document.getElementById(id); return t ? t.innerHTML : ''; }
  function blockLot(pin) {
    var parts = String(pin || '').split('_');
    return parts.length >= 3 ? 'Block ' + parts[1] + ', Lot ' + parts[2] : 'this parcel';
  }
  function townName() { return state.feed && state.feed.town ? state.feed.town.name : ''; }

  /* ---------- deadlines (statewide calendar) ---------- */
  function deadlines(now) {
    var list = [];
    var y = now.getFullYear();
    [y, y + 1].forEach(function (year) {
      [[1, 1], [4, 1], [7, 1], [10, 1]].forEach(function (md) {
        var q = { 1: 'Q1', 4: 'Q2', 7: 'Q3', 10: 'Q4' }[md[0]];
        list.push({ date: new Date(year, md[0], md[1]), title: q + ' property tax due', note: 'Many towns allow a 10-day grace period.', kind: 'tax' });
      });
      list.push({ date: new Date(year, 1, 1), title: 'Assessment notices arrive', note: 'Check yours for errors when it comes.', kind: 'notice' });
      list.push({ date: new Date(year, 3, 1), title: 'Tax appeal deadline', note: 'May 1 in towns with a revaluation.', kind: 'appeal' });
    });
    var pas1 = parseDay(PAS1_DEADLINE);
    if (pas1) list.push({ date: pas1, title: 'PAS-1 deadline', note: 'ANCHOR, Stay NJ and Senior Freeze in one form.', kind: 'pas1' });
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return list.filter(function (d) { return d.date >= today; })
      .sort(function (a, b) { return a.date - b.date; })
      .map(function (d) {
        d.days = Math.round((d.date - today) / 864e5);
        d.soon = d.days <= 45;
        return d;
      });
  }

  function renderUpcoming() {
    var host = $('wdh-upcoming');
    if (!host) return;
    host.innerHTML = deadlines(new Date()).slice(0, 4).map(function (d) {
      return '<li><span class="wdh-date' + (d.soon ? ' is-soon' : '') + '"><span class="wdh-date-m">' + SHORT[d.date.getMonth()] + '</span><span class="wdh-date-d">' + d.date.getDate() + '</span></span>' +
        '<span><span class="wdh-up-t">' + esc(d.title) + '</span><span class="wdh-meta">' + esc(d.note) + (d.soon ? ' ' + d.days + ' ' + plural(d.days, 'day', 'days') + ' left.' : '') + '</span></span></li>';
    }).join('');
  }

  /* ---------- auth + saved home ---------- */
  function client() {
    try {
      if (window.NJPTRSupabaseRuntime && typeof window.NJPTRSupabaseRuntime.createClient === 'function') {
        return window.NJPTRSupabaseRuntime.createClient();
      }
    } catch (_error) {}
    return null;
  }
  function withTimeout(promise, ms) {
    return Promise.race([promise, new Promise(function (resolve) { setTimeout(function () { resolve(null); }, ms); })]);
  }
  function firstName(user) {
    var meta = (user && user.user_metadata) || {};
    var raw = meta.first_name || meta.given_name || meta.full_name || meta.name || '';
    var first = String(raw).trim().split(/\s+/)[0] || '';
    return /^[A-Za-z][A-Za-z'.-]{0,30}$/.test(first) ? first.charAt(0).toUpperCase() + first.slice(1) : '';
  }
  function loadHome() {
    var sb = client();
    if (!sb || !sb.auth || typeof sb.auth.getSession !== 'function') return Promise.resolve(null);
    return withTimeout(sb.auth.getSession(), 3000).then(function (result) {
      var session = result && result.data && result.data.session;
      if (!session || !session.user) return null;
      state.user = session.user;
      return withTimeout(sb.from('saved_properties')
        .select('pams_pin,address,town,county,assessed,last_year_tax,lat,lon,kind,nickname,verified,created_at')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: true })
        .limit(25), 3500).then(function (res) {
          var rows = res && Array.isArray(res.data) ? res.data : [];
          if (!rows.length) return null;
          var home = rows.filter(function (r) { return r.kind === 'home'; })[0] || rows[0];
          var pin = String(home.pams_pin || '');
          var lat = num(home.lat), lon = num(home.lon);
          return {
            pin: pin,
            code: /^\d{4}_/.test(pin) ? pin.slice(0, 4) : '',
            address: home.address || '',
            town: home.town || '',
            assessed: num(home.assessed),
            tax: num(home.last_year_tax),
            lat: lat != null && lat > 38.8 && lat < 41.4 ? lat : null,
            lon: lon != null && lon < -73.8 && lon > -75.7 ? lon : null,
            isHome: home.kind === 'home',
            score: null
          };
        });
    }).catch(function () { return null; });
  }
  function loadScore(home) {
    var bridge = window.WatchdogPublicScoreOnDemand;
    if (!home || !home.pin || !bridge || typeof bridge.scoreRows !== 'function') return Promise.resolve(null);
    return withTimeout(bridge.scoreRows([{ pams_pin: home.pin }]).then(function (rows) {
      var row = rows && rows[home.pin];
      var score = row ? num(row.watchdog_score != null ? row.watchdog_score : row.score) : null;
      return score != null ? Math.round(score) : null;
    }).catch(function () { return null; }), 6000);
  }

  /* ---------- towns (picker) ---------- */
  function loadTowns() {
    if (state.townsPromise) return state.townsPromise;
    state.townsPromise = fetch(TOWNS_URL, { credentials: 'same-origin' })
      .then(function (r) { if (!r.ok) throw new Error('towns'); return r.json(); })
      .then(function (body) {
        var towns = body && body.towns ? body.towns : {};
        state.towns = Object.keys(towns).map(function (code) {
          var t = towns[code];
          return { code: code, name: t.n, county: t.c, lat: t.lat, lon: t.lon, key: (t.n + ' ' + t.c).toLowerCase() };
        }).sort(function (a, b) { return a.name.localeCompare(b.name); });
        return state.towns;
      })
      .catch(function () { state.townsPromise = null; return []; });
    return state.townsPromise;
  }

  var pickerReturnFocus = null;
  function openPicker() {
    var picker = $('wdh-picker');
    if (!picker) return;
    pickerReturnFocus = document.activeElement;
    picker.hidden = false;
    document.documentElement.classList.add('wdh-picker-open');
    var input = $('wdh-picker-q');
    if (input) { input.value = ''; setTimeout(function () { input.focus(); }, 30); }
    loadTowns().then(function () { filterPicker(''); });
  }
  function closePicker() {
    var picker = $('wdh-picker');
    if (!picker || picker.hidden) return;
    picker.hidden = true;
    document.documentElement.classList.remove('wdh-picker-open');
    if (pickerReturnFocus && typeof pickerReturnFocus.focus === 'function') pickerReturnFocus.focus();
  }
  function filterPicker(query) {
    var list = $('wdh-picker-list');
    if (!list) return;
    var q = String(query || '').trim().toLowerCase();
    var towns = state.towns || [];
    var hits = q ? towns.filter(function (t) { return t.key.indexOf(q) !== -1; }) : towns;
    if (!towns.length) {
      list.innerHTML = '<li class="wdh-picker-empty">Towns are still loading.</li>';
      return;
    }
    if (!hits.length) {
      list.innerHTML = '<li class="wdh-picker-empty">No New Jersey town matches "' + esc(query) + '".</li>';
      return;
    }
    list.innerHTML = hits.slice(0, 60).map(function (t) {
      return '<li><button type="button" class="wdh-picker-item" data-town="' + esc(t.code) + '"><span>' + esc(t.name) + '</span><small>' + esc(t.county) + ' County</small></button></li>';
    }).join('') + (hits.length > 60 ? '<li class="wdh-picker-empty">Keep typing to narrow ' + hits.length + ' towns.</li>' : '');
  }
  /* Nearest town centroid to a device position, or null when outside New Jersey. */
  function nearestTown(pos) {
    return loadTowns().then(function (towns) {
      var here = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      var best = null, bestD = Infinity;
      towns.forEach(function (t) {
        var d = miles(here, t);
        if (d != null && d < bestD) { bestD = d; best = t; }
      });
      /* 12 miles covers the edge of New Jersey's largest townships from their center. */
      return best && bestD < 12 ? best : null;
    });
  }
  function locateTown() {
    var button = $('wdh-picker-locate');
    if (!navigator.geolocation) { if (button) button.textContent = 'Location is not available in this browser'; return; }
    if (button) button.disabled = true;
    navigator.geolocation.getCurrentPosition(function (pos) {
      nearestTown(pos).then(function (best) {
        if (button) button.disabled = false;
        if (best) { chooseTown(best.code); closePicker(); }
        else if (button) button.innerHTML = icon('location-crosshairs') + 'You seem to be outside New Jersey';
      });
    }, function () {
      if (button) { button.disabled = false; button.innerHTML = icon('location-crosshairs') + 'Location permission was not granted'; }
    }, { timeout: 8000, maximumAge: 600000 });
  }
  /* Phones show only a pin for the town: tapping it uses the phone's location.
     If location is off, denied or outside New Jersey, the town list opens instead. */
  function locateFromPin() {
    var pin = $('wdh-where-pin');
    if (!navigator.geolocation) { openPicker(); return; }
    if (pin) { pin.classList.add('is-busy'); pin.setAttribute('aria-busy', 'true'); }
    var done = function () { if (pin) { pin.classList.remove('is-busy'); pin.removeAttribute('aria-busy'); } };
    navigator.geolocation.getCurrentPosition(function (pos) {
      nearestTown(pos).then(function (best) {
        done();
        if (!best) { openPicker(); return; }
        if (pin) pin.classList.add('is-located');
        if (!state.feed || !state.feed.town || state.feed.town.code !== best.code) chooseTown(best.code);
      });
    }, function () { done(); openPicker(); }, { timeout: 10000, maximumAge: 300000 });
  }
  function chooseTown(code) {
    store(KEY_TOWN, code);
    load(code, 'choice');
  }

  /* ---------- feed fetch ---------- */
  function setLoading() {
    root.setAttribute('data-state', 'loading');
    root.setAttribute('aria-busy', 'true');
  }
  function load(code, reason) {
    var id = ++state.requestId;
    setLoading();
    var url = API + (code ? '?town=' + encodeURIComponent(code) : '');
    return fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json' } })
      .then(function (r) { if (!r.ok) throw new Error('feed http ' + r.status); return r.json(); })
      .then(function (feed) {
        if (id !== state.requestId) return;
        state.feed = feed;
        var code = feed && feed.town ? feed.town.code : '';
        if (code && state.seenFor !== code) { state.seen = store(KEY_SEEN + code); state.seenFor = code; }
        render(reason);
      })
      .catch(function () {
        if (id !== state.requestId) return;
        renderError();
      });
  }

  /* ---------- rendering ---------- */
  function greeting() {
    var h = new Date().getHours();
    var part = h < 5 ? 'Good evening' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
    var name = firstName(state.user);
    return part + (name ? ', ' + name : '') + '.';
  }

  function renderHero() {
    var feed = state.feed, town = feed && feed.town;
    var title = $('wdh-hero-title'), sub = $('wdh-hero-sub');
    if (title) title.textContent = state.user ? greeting() : town ? "What's happening in " + town.name : "What's happening around your home";
    /* The intro line only helps before a town is picked; with a town the feed speaks for itself. */
    if (sub) sub.hidden = !!town;
    renderWhere();
  }

  /* The quiet "date · town (change)" line between the hero and the feed. */
  function renderWhere() {
    var now = new Date(), town = state.feed && state.feed.town;
    var date = $('wdh-where-date'), sep = $('wdh-where-sep'), where = $('wdh-where-town'), change = $('wdh-town-change');
    if (date) date.textContent = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][now.getDay()] + ', ' + MONTHS[now.getMonth()] + ' ' + now.getDate();
    if (sep) sep.hidden = false;
    if (where) where.textContent = town ? town.name + ', ' + town.county + ' County' : 'New Jersey';
    if (change) change.setAttribute('aria-label', town ? 'Change town, now ' + town.name : 'Choose your town');
  }

  function isNewSales() {
    var s = state.feed && state.feed.sales;
    return !!(s && s.available && state.seen && state.seen.sales && state.seen.sales !== s.batch.label);
  }
  function isNewPermits() {
    var p = state.feed && state.feed.permits;
    return !!(p && p.available && state.seen && state.seen.permits && state.seen.permits !== p.dataThrough);
  }

  function tile(tab, iconName, value, label, sub, isNew, warn) {
    return '<button type="button" class="wdh-tile" data-go="' + tab + '">' +
      '<span class="wdh-tile-top"><span class="wdh-ico' + (warn ? ' is-warn' : '') + '">' + icon(iconName) + '</span>' + (isNew ? '<span class="wdh-new">New</span>' : '') + '</span>' +
      '<span class="wdh-tile-num">' + esc(value) + '</span>' +
      '<span class="wdh-tile-label">' + esc(label) + '</span>' +
      '<span class="wdh-meta">' + esc(sub) + '</span></button>';
  }

  function renderTiles() {
    var host = $('wdh-tiles'), feed = state.feed;
    if (!host) return;
    if (!feed || !feed.town) { host.hidden = true; return; }
    host.hidden = false;
    var s = feed.sales, p = feed.permits, t = feed.tax;
    var soon = deadlines(new Date()).filter(function (d) { return d.days <= 45; });
    var next = deadlines(new Date())[0];
    var html = '';
    html += s && s.available
      ? tile('sales', 'tag', count(s.batchCount), plural(s.batchCount, 'Home sale', 'Home sales'), 'Sold in ' + s.batch.label, isNewSales())
      : tile('sales', 'tag', '-', 'Home sales', 'Sale records are loading slowly', false);
    html += p && p.available
      ? tile('permits', 'helmet-safety', count(p.notableCount), plural(p.notableCount, 'Larger permit', 'Larger permits'), 'Filed ' + monthRange(p.window), isNewPermits())
      : tile('permits', 'helmet-safety', '0', 'Larger permits', 'None in recent state data', false);
    html += t && t.available
      ? tile('town', 'building-columns', t.rate.toFixed(3), t.year + ' tax rate', t.changePct != null ? (t.changePct >= 0 ? 'Up ' : 'Down ') + pct(t.changePct) + ' from ' + t.priorYear : 'Per $100 of assessed value', false)
      : tile('town', 'building-columns', '-', 'Tax rate', 'Not published for this town', false);
    html += tile('home', 'calendar-day', String(soon.length), plural(soon.length, 'Deadline', 'Deadlines'), next ? 'Next: ' + dayLabel(next.date, false) + ', ' + next.title.replace(' due', '') : 'In the next 45 days', false, soon.length > 0);
    host.innerHTML = html;
  }

  function monthRange(win) {
    if (!win) return '';
    var a = parseDay(win.from), b = parseDay(win.to);
    if (!a || !b) return '';
    if (a.getFullYear() === b.getFullYear()) {
      return a.getMonth() === b.getMonth() ? MONTHS[b.getMonth()] + ' ' + b.getFullYear() : MONTHS[a.getMonth()] + ' to ' + MONTHS[b.getMonth()] + ' ' + b.getFullYear();
    }
    return monthYear(a) + ' to ' + monthYear(b);
  }

  function permitHeadline(item) {
    var where = item.address || blockLot(item.pin);
    var type = String(item.type || '').toLowerCase();
    if (type === 'new') {
      if (item.useLabel === 'home') return 'New home planned at ' + where;
      return 'New ' + item.useLabel + ' planned at ' + where;
    }
    if (type === 'addition') return (item.sqft ? count(item.sqft) + ' sq ft addition' : 'Addition') + ' planned at ' + where;
    if (type === 'demolition') return 'Demolition permit at ' + where;
    if (type === 'alteration') return (item.cost ? shortMoney(item.cost) + ' renovation' : 'Renovation') + ' at ' + where;
    return item.type + ' permit at ' + where;
  }

  function weekItems() {
    var feed = state.feed, out = [];
    if (!feed || !feed.town) return out;
    var town = feed.town, s = feed.sales, p = feed.permits, t = feed.tax;
    if (s && s.available) {
      var w = s.window, line = '<strong>' + count(s.batchCount) + ' ' + plural(s.batchCount, 'home sold', 'homes sold') + '</strong> in ' + esc(town.name) + ' in ' + esc(MONTHS[s.batch.month - 1]) + ', according to the latest state records.';
      if (w && w.median) {
        line += ' The ' + esc(w.label) + ' median was <strong>' + money(w.median) + '</strong>';
        line += w.changePct != null ? ', ' + pct(w.changePct) + ' ' + (w.changePct >= 0 ? 'higher' : 'lower') + ' than a year earlier.' : '.';
      }
      out.push(line);
    }
    if (p && p.available && p.items && p.items.length) {
      var top = p.items[0];
      out.push('The largest recent project: <strong>' + esc(permitHeadline(top).replace(/^(\w)/, function (m) { return m.toLowerCase(); })) + '</strong>' +
        (top.cost ? ', with an estimated cost of ' + money(top.cost) : '') + '.');
    }
    var home = state.home;
    if (home && home.code === town.code && (home.assessed || home.tax)) {
      var medianTax = feed.stats && feed.stats.available ? feed.stats.medianTax : null;
      var text = '<strong>Your home:</strong> ';
      if (home.tax) {
        text += 'last year\'s tax was ' + money(home.tax);
        if (medianTax) {
          var diff = (home.tax / medianTax - 1) * 100;
          text += ', ' + (Math.abs(diff) < 1 ? 'about the same as' : pct(diff) + ' ' + (diff > 0 ? 'above' : 'below')) + ' the town median of ' + money(medianTax);
        }
        text += '.';
      } else {
        text += 'assessed at ' + money(home.assessed) + '.';
      }
      out.push(text);
    }
    var next = deadlines(new Date())[0];
    var tax = t && t.available ? 'The ' + t.year + ' tax rate is ' + t.rate.toFixed(3) + (t.changePct != null ? ', ' + (t.changePct >= 0 ? 'up ' : 'down ') + pct(t.changePct) + ' from ' + t.priorYear : '') + '. ' : '';
    if (tax || next) out.push(tax + (next ? 'Next deadline: <strong>' + esc(next.title) + '</strong> on ' + esc(dayLabel(next.date, false)) + '.' : ''));
    return out;
  }

  function renderWeek() {
    var host = $('wdh-week'), list = $('wdh-week-list');
    if (!host || !list) return;
    var items = weekItems();
    if (!items.length) { host.hidden = true; return; }
    host.hidden = false;
    var meta = $('wdh-week-meta');
    if (meta) meta.textContent = townName() + ' in 30 seconds';
    /* Phones show the first point and a "Show more" toggle; wider screens show everything. */
    var more = $('wdh-week-more');
    if (more) {
      more.hidden = items.length < 2;
      more.setAttribute('aria-expanded', state.briefOpen ? 'true' : 'false');
      host.classList.toggle('is-open', !!state.briefOpen);
    }
    // content-architecture: dynamic. Each sentence is computed from this town's feed data (sales, permits, tax rate, deadlines).
    list.innerHTML = items.map(function (html, i) { return '<li><span class="wdh-num" aria-hidden="true">' + (i + 1) + '</span><span>' + html + '</span></li>'; }).join('');
    var listen = $('wdh-listen');
    if (listen) listen.hidden = !('speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function');
  }

  function speakWeek() {
    if (!('speechSynthesis' in window)) return;
    var synth = window.speechSynthesis;
    var btn = $('wdh-listen');
    if (synth.speaking) { synth.cancel(); if (btn) btn.querySelector('span').textContent = 'Listen'; return; }
    var text = Array.prototype.map.call(document.querySelectorAll('#wdh-week-list li > span:last-child'), function (n) { return n.textContent; }).join(' ');
    var u = new window.SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    u.onend = function () { if (btn) btn.querySelector('span').textContent = 'Listen'; };
    if (btn) btn.querySelector('span').textContent = 'Stop';
    synth.speak(u);
  }

  /* Visible within the selected radius (only when we know where home is). */
  function inRadius(item) {
    if (state.radius === 'town' || !state.home || state.home.lat == null) return true;
    var d = miles(state.home, item);
    return d != null && d <= Number(state.radius);
  }

  /* Address-centered NJOGIS light map, the site's standard property preview.
     free-imagery-grid-runtime.js swaps NJ aerial thumbnails for this map
     everywhere, so the feed asks for the map directly. */
  function previewUrl(item) {
    if (!item || item.lat == null || item.lon == null) return '';
    var dy = 0.0022, dx = dy * (480 / 330) / Math.max(0.45, Math.cos(item.lat * Math.PI / 180));
    var params = [
      'bbox=' + [item.lon - dx, item.lat - dy, item.lon + dx, item.lat + dy].join(','),
      'bboxSR=4326', 'imageSR=3857', 'size=480,330', 'format=jpg', 'transparent=false', 'f=image'
    ].join('&');
    return 'https://maps.nj.gov/arcgis/rest/services/Basemap/LtGray_NJ_WM/MapServer/export?' + params;
  }

  function thumb(item, label) {
    var url = previewUrl(item);
    if (!url) return '';
    // content-architecture: dynamic. The map image, its label and position come from this record's coordinates.
    return '<div class="wdh-thumb"><img src="' + esc(url) + '" alt="Map of ' + esc(label) + '" loading="lazy" width="480" height="330" onerror="this.parentNode.remove()"><span class="wdh-thumb-pin" aria-hidden="true"></span><span class="wdh-thumb-credit">NJOGIS map</span></div>';
  }

  function kicker(iconName, label, extra, warn) {
    return '<div class="wdh-krow"><span class="wdh-ico' + (warn ? ' is-warn' : '') + '">' + icon(iconName) + '</span><span class="wdh-kicker' + (warn ? ' is-warn' : '') + '">' + esc(label) + '</span>' +
      (extra ? '<span class="wdh-dot" aria-hidden="true">&middot;</span><span class="wdh-meta">' + esc(extra) + '</span>' : '') + '</div>';
  }

  function openButton(address, label) {
    if (!address) return '';
    return '<button type="button" class="wdh-btn wdh-btn-secondary" data-open="' + esc(address) + '">' + icon('magnifying-glass-location') + esc(label || 'Open property') + '</button>';
  }
  function shareButton(address, title) {
    if (!address) return '';
    return '<button type="button" class="wdh-icon-btn wdh-share" data-share="' + esc(address) + '" data-share-title="' + esc(title) + '" aria-label="Share ' + esc(address) + '">' + icon('share-nodes') + '</button>';
  }

  function permitCard(item, feed) {
    var p = feed.permits, headline = permitHeadline(item);
    var dist = distanceText(item);
    var subject = item.propertyLabel === 'vacant land' ? 'vacant lot' : (item.propertyLabel || item.useLabel || 'property');
    var typeWord = item.type === 'New' ? 'new construction' : String(item.type || 'construction').toLowerCase();
    var facts = [
      ['Work', item.type === 'New' ? 'New construction' : item.type],
      ['Use', item.useLabel ? item.useLabel.charAt(0).toUpperCase() + item.useLabel.slice(1) : ''],
      ['Size', item.sqft ? count(item.sqft) + ' sq ft' : ''],
      ['Est. cost', item.cost ? shortMoney(item.cost) : ''],
      ['Filed', dayLabel(item.date)]
    ].filter(function (f) { return f[1]; }).slice(0, 4);
    var permitThumb = thumb(item, item.address || headline);
    return '<article class="wdh-card wdh-feed-card" data-tabs="permits">' +
      '<div class="wdh-card-row' + (permitThumb ? '' : ' is-solo') + '"><div class="wdh-card-main">' +
      kicker('helmet-safety', 'Building permit', dist || ('Filed ' + dayLabel(item.date, false))) +
      '<h3 class="wdh-h3">' + esc(headline) + '</h3>' +
      '<p class="wdh-body">' + esc(feed.town.name) + ' issued ' + (/^[aeiou]/i.test(typeWord) ? 'an ' : 'a ') + esc(typeWord) + ' permit for this ' + esc(subject) + ' on ' + esc(dayLabel(item.date)) + '.' +
      (item.cost ? ' Estimated construction cost: ' + money(item.cost) + '.' : '') + (item.related ? ' ' + item.related + ' related ' + plural(item.related, 'permit was', 'permits were') + ' filed the same day.' : '') + '</p>' +
      '</div>' + permitThumb + '</div>' +
      '<dl class="wdh-facts">' + facts.map(function (f) { return '<div><dt>' + esc(f[0]) + '</dt><dd>' + esc(f[1]) + '</dd></div>'; }).join('') + '</dl>' +
      '<p class="wdh-source">' + icon('shield-halved') + '<span><strong>Verified record.</strong> NJ DCA construction permits, matched to the county tax list.' +
      (p.publishedAt ? ' State data updated ' + esc(dayLabel(p.publishedAt)) + '.' : '') + ' Permit costs are the estimates filed with the town.</span></p>' +
      '<div class="wdh-actions">' + openButton(item.address, 'Open property') + shareButton(item.address, headline) + '</div>' +
      '</article>';
  }

  function permitListCard(items, feed) {
    if (!items.length) return '';
    return '<article class="wdh-card wdh-feed-card" data-tabs="permits">' +
      kicker('list-check', 'More permits', monthRange(feed.permits.window)) +
      '<h3 class="wdh-h3">Other larger projects in ' + esc(feed.town.name) + '</h3>' +
      '<ul class="wdh-rows">' + items.map(function (item) {
        var where = item.address || blockLot(item.pin);
        return '<li><span class="wdh-row-main"><span class="wdh-row-addr">' + esc(where) + '</span><span class="wdh-meta">' + esc(item.type === 'New' ? 'New construction' : item.type) + ' &middot; ' + esc(item.useLabel) + ' &middot; ' + esc(dayLabel(item.date, false)) + '</span></span>' +
          '<span class="wdh-row-val">' + esc(item.cost ? shortMoney(item.cost) : '') + '</span>' +
          (item.address ? '<button type="button" class="wdh-row-open" data-open="' + esc(item.address) + '" aria-label="Open ' + esc(item.address) + '">' + icon('chevron-right') + '</button>' : '<span></span>') + '</li>';
      }).join('') + '</ul>' +
      '<p class="wdh-meta wdh-note">' + count(feed.permits.total) + ' permits of all sizes were filed in ' + esc(feed.town.name) + ' in this period. Most are small jobs like water heaters, roofs and decks.</p>' +
      '</article>';
  }

  function saleCard(items, feed) {
    var s = feed.sales, top = items[0], w = s.window;
    var dist = distanceText(top);
    var facts = [
      ['Size', top.sqft ? count(top.sqft) + ' sq ft' : ''],
      ['Built', top.yearBuilt ? String(top.yearBuilt) : ''],
      ['Per sq ft', top.ppsf ? money(top.ppsf) : ''],
      ['Assessed', top.assessed ? money(top.assessed) : '']
    ].filter(function (f) { return f[1]; });
    var callout = '';
    if (top.ppsf && w && w.ppsfMedian) {
      var diff = (top.ppsf / w.ppsfMedian - 1) * 100;
      callout = '<p class="wdh-callout">' + icon('chart-line') + '<span>At ' + money(top.ppsf) + ' per sq ft, it sold ' +
        (Math.abs(diff) < 1 ? '<strong>right at</strong>' : '<strong>' + pct(diff) + ' ' + (diff > 0 ? 'above' : 'below') + '</strong>') +
        ' the town median of ' + money(w.ppsfMedian) + ' for ' + esc(w.label) + '.</span></p>';
    }
    var rest = items.slice(1, 5);
    var saleThumb = thumb(top, top.address);
    return '<article class="wdh-card wdh-feed-card" data-tabs="sales">' +
      '<div class="wdh-card-row' + (saleThumb ? '' : ' is-solo') + '"><div class="wdh-card-main">' +
      kicker('tag', 'Home sale', dist) +
      '<h3 class="wdh-h3">' + esc(top.address) + ' sold for ' + money(top.price) + '</h3>' +
      '<p class="wdh-meta wdh-when">Sold in ' + esc(MONTHS[top.month - 1] + ' ' + top.year) + ' &middot; New Jersey state sale record</p>' +
      callout + '</div>' + saleThumb + '</div>' +
      (facts.length ? '<dl class="wdh-facts">' + facts.map(function (f) { return '<div><dt>' + esc(f[0]) + '</dt><dd>' + esc(f[1]) + '</dd></div>'; }).join('') + '</dl>' : '') +
      (rest.length ? '<div class="wdh-more"><h4 class="wdh-h4">More ' + esc(MONTHS[s.batch.month - 1]) + ' sales in ' + esc(feed.town.name) + '</h4><ul class="wdh-rows">' + rest.map(function (row) {
        return '<li><span class="wdh-row-main"><span class="wdh-row-addr">' + esc(row.address) + '</span><span class="wdh-meta">' +
          esc([row.sqft ? count(row.sqft) + ' sq ft' : '', row.yearBuilt ? 'built ' + row.yearBuilt : '', distanceText(row)].filter(Boolean).join(' · ')) + '</span></span>' +
          '<span class="wdh-row-val">' + money(row.price) + '</span>' +
          '<button type="button" class="wdh-row-open" data-open="' + esc(row.address) + '" aria-label="Open ' + esc(row.address) + '">' + icon('chevron-right') + '</button></li>';
      }).join('') + '</ul></div>' : '') +
      '<p class="wdh-source">' + icon('shield-halved') + '<span><strong>Verified record.</strong> NJ Division of Taxation SR1A sales file. Only sales the state marks usable are shown. ' +
      count(s.batchCount) + ' ' + plural(s.batchCount, 'sale', 'sales') + ' were recorded for ' + esc(s.batch.label) + '.</span></p>' +
      '<div class="wdh-actions">' + openButton(top.address, 'Open property') +
      (feed.town.townPage ? '<a class="wdh-btn wdh-btn-ghost" href="' + esc(feed.town.townPage) + '">' + esc(feed.town.name) + ' report</a>' : '') +
      shareButton(top.address, top.address + ' sold for ' + money(top.price)) + '</div>' +
      '</article>';
  }

  function deadlineCard() {
    var list = deadlines(new Date());
    var pas1 = list.filter(function (d) { return d.kind === 'pas1'; })[0];
    var tax = list.filter(function (d) { return d.kind === 'tax'; })[0];
    var lead = pas1 && pas1.days <= 60 ? pas1 : list[0];
    if (!lead) return '';
    var body = lead.kind === 'pas1'
      ? 'One form covers ANCHOR, Stay NJ and the Senior Freeze. Homeowners can get up to $1,500 from ANCHOR, and seniors up to $6,500 with Stay NJ.'
      : lead.note;
    var also = lead !== tax && tax && tax.days <= 60 ? '<p class="wdh-callout">' + icon('clock') + '<span>Also due: your ' + esc(tax.title.replace(' due', '').toLowerCase().replace('q', 'Q')) + ' payment, <strong>' + esc(dayLabel(tax.date, false)) + '</strong>.</span></p>' : '';
    return '<article class="wdh-card wdh-feed-card" data-tabs="home town">' +
      kicker('calendar-day', 'Deadline', lead.days === 0 ? 'Today' : lead.days + ' ' + plural(lead.days, 'day', 'days') + ' left', lead.soon) +
      '<h3 class="wdh-h3">' + esc(lead.kind === 'pas1' ? 'File your PAS-1 by ' + dayLabel(lead.date, false) : lead.title + ' on ' + dayLabel(lead.date, false)) + '</h3>' +
      '<p class="wdh-body">' + esc(body) + '</p>' + also +
      '<div class="wdh-actions">' +
      (lead.kind === 'pas1' || lead.kind === 'tax' ? '<a class="wdh-btn wdh-btn-primary" href="https://njpropertytaxrelief.com/anchor-estimator.html">Check what I qualify for</a>' : '') +
      (lead.kind === 'appeal' || lead.kind === 'notice' ? '<a class="wdh-btn wdh-btn-primary" href="/property-tax-appeal.html">How NJ appeals work</a>' : '') +
      '</div><p class="wdh-source"><span>Source: NJ Division of Taxation</span></p></article>';
  }

  function homeCard(feed) {
    var home = state.home;
    if (!state.user) return tpl('wdh-tpl-claim-out');
    if (!home) return tpl('wdh-tpl-claim-in');
    var medianTax = feed.stats && feed.stats.available && home.code === feed.town.code ? feed.stats.medianTax : null;
    var previous = state.homePrev;
    var current = { assessed: home.assessed, tax: home.tax, score: home.score };
    var changes = [];
    if (previous) {
      if (previous.assessed && current.assessed && previous.assessed !== current.assessed) changes.push('assessment ' + money(previous.assessed) + ' to ' + money(current.assessed));
      if (previous.tax && current.tax && previous.tax !== current.tax) changes.push('tax ' + money(previous.tax) + ' to ' + money(current.tax));
      if (previous.score != null && current.score != null && previous.score !== current.score) changes.push('Watchdog Score ' + previous.score + ' to ' + current.score);
    }
    var headline = !previous ? 'Here is where your home stands' : changes.length ? 'Your home record changed' : 'Quiet week for your home. Nothing changed.';
    var body = !previous ? 'We will flag it here when your assessment, tax record or Watchdog Score changes.'
      : changes.length ? 'Since your last visit: ' + changes.join('; ') + '.' : '';
    var stats = [];
    if (home.score != null) stats.push(['Watchdog Score', String(home.score), '']);
    if (home.assessed) stats.push(['Assessment', money(home.assessed), '']);
    if (home.tax) stats.push(['Last year\'s tax', money(home.tax), medianTax ? 'Town median ' + money(medianTax) : '']);
    var bars = '';
    if (home.tax && medianTax) {
      var max = Math.max(home.tax, medianTax);
      bars = '<figure class="wdh-bars"><figcaption class="wdh-h4">Your tax compared with the town</figcaption>' +
        '<div class="wdh-bar-row"><span>Your home</span><span class="wdh-bar-track"><span class="wdh-bar is-home" style="width:' + Math.round(home.tax / max * 100) + '%"></span></span><b>' + money(home.tax) + '</b></div>' +
        '<div class="wdh-bar-row"><span>Town median</span><span class="wdh-bar-track"><span class="wdh-bar is-town" style="width:' + Math.round(medianTax / max * 100) + '%"></span></span><b>' + money(medianTax) + '</b></div></figure>';
    }
    return '<article class="wdh-card wdh-feed-card" data-tabs="home">' +
      kicker('house', home.isHome ? 'Your home' : 'Your saved home', home.address) +
      '<h3 class="wdh-h3">' + esc(headline) + '</h3>' + (body ? '<p class="wdh-body">' + esc(body) + '</p>' : '') +
      (stats.length ? '<div class="wdh-stats">' + stats.map(function (s) { return '<div class="wdh-stat"><p class="wdh-stat-l">' + esc(s[0]) + '</p><p class="wdh-stat-v">' + esc(s[1]) + '</p>' + (s[2] ? '<p class="wdh-meta">' + esc(s[2]) + '</p>' : '') + '</div>'; }).join('') + '</div>' : '') +
      bars +
      (home.score != null ? '<p class="wdh-meta wdh-note">The Watchdog Score, powered by the ROBUST Framework.</p>' : '') +
      '<div class="wdh-actions"><a class="wdh-btn wdh-btn-primary" href="/home">Open my property home</a>' + openButton(home.address + (home.town ? ', ' + home.town : ''), 'Check my appeal odds') + '</div></article>';
  }

  function chartSvg(series) {
    var pts = series.slice(-10);
    if (pts.length < 2) return '';
    var W = 600, H = 160, L = 44, R = 16, T = 22, B = 30;
    var vals = pts.map(function (p) { return p[1]; });
    var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
    var pad = Math.max((max - min) * 0.15, 0.05);
    var lo = min - pad, hi = max + pad;
    function x(i) { return L + i * (W - L - R) / (pts.length - 1); }
    function y(v) { return T + (hi - v) * (H - T - B) / (hi - lo); }
    var step = (hi - lo) / 3, grid = '';
    for (var g = 0; g <= 3; g += 1) {
      var gv = lo + step * g;
      grid += '<line class="wdh-c-grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(gv).toFixed(1) + '" y2="' + y(gv).toFixed(1) + '"></line>' +
        '<text class="wdh-c-axis" x="0" y="' + (y(gv) + 4).toFixed(1) + '">' + gv.toFixed(2) + '</text>';
    }
    var line = pts.map(function (p, i) { return x(i).toFixed(1) + ',' + y(p[1]).toFixed(1); }).join(' ');
    var minIdx = vals.indexOf(min), last = pts.length - 1;
    var labels = '<text class="wdh-c-val" x="' + (x(0) + 6).toFixed(1) + '" y="' + (y(vals[0]) - 9).toFixed(1) + '">' + vals[0].toFixed(3) + '</text>' +
      '<text class="wdh-c-val wdh-c-end" x="' + (x(last) - 2).toFixed(1) + '" y="' + (y(vals[last]) - 10).toFixed(1) + '">' + vals[last].toFixed(3) + '</text>';
    if (minIdx !== 0 && minIdx !== last) labels += '<text class="wdh-c-val wdh-c-mid" x="' + x(minIdx).toFixed(1) + '" y="' + (y(min) + 18).toFixed(1) + '">' + min.toFixed(3) + '</text>';
    var dots = '<circle class="wdh-c-pt" cx="' + x(0).toFixed(1) + '" cy="' + y(vals[0]).toFixed(1) + '" r="5"></circle>' +
      '<circle class="wdh-c-pt" cx="' + x(last).toFixed(1) + '" cy="' + y(vals[last]).toFixed(1) + '" r="5"></circle>';
    var hits = pts.map(function (p, i) { return '<circle class="wdh-c-hit" cx="' + x(i).toFixed(1) + '" cy="' + y(p[1]).toFixed(1) + '" r="14"><title>' + p[0] + ': ' + p[1].toFixed(3) + '</title></circle>'; }).join('');
    var years = pts.map(function (p, i) {
      if (i !== 0 && i !== last && i % 2 !== 0) return '';
      return '<text class="wdh-c-axis wdh-c-mid" x="' + x(i).toFixed(1) + '" y="' + (H - 6) + '">' + p[0] + '</text>';
    }).join('');
    // content-architecture: dynamic. Screen-reader summary of the chart, built from the town's tax-rate series.
    var summary = 'General tax rate from ' + pts[0][0] + ' to ' + pts[last][0] + ': from ' + vals[0].toFixed(3) + ' to ' + vals[last].toFixed(3) + (minIdx !== 0 && minIdx !== last ? ', with a low of ' + min.toFixed(3) + ' in ' + pts[minIdx][0] : '') + '.';
    return '<svg class="wdh-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(summary) + '">' + grid +
      '<polyline class="wdh-c-line" points="' + line + '"></polyline>' + dots + labels + hits + years + '</svg>';
  }

  function pulseCard(feed) {
    var s = feed.sales, t = feed.tax, f = feed.fairness, r = feed.ratio;
    var stats = [];
    if (s && s.available && s.window && s.window.median) {
      stats.push(['Median sale, ' + s.window.label.replace(/ \d{4}$/, ''), money(s.window.median),
        (s.window.changePct != null ? pct(s.window.changePct) + ' ' + (s.window.changePct >= 0 ? 'higher' : 'lower') + ' than a year earlier · ' : '') + count(s.window.count) + ' sales']);
      if (s.window.ppsfMedian) stats.push(['Price per sq ft', money(s.window.ppsfMedian), 'Median, ' + s.window.label]);
    }
    if (t && t.available) stats.push([t.year + ' tax rate', t.rate.toFixed(3), t.changePct != null ? pct(t.changePct) + ' ' + (t.changePct >= 0 ? 'higher' : 'lower') + ' than ' + t.priorYear : 'Per $100 of assessed value']);
    if (!stats.length) return '';
    var headline;
    var price = s && s.available && s.window && s.window.changePct != null ? s.window.changePct : null;
    if (price != null && t && t.available && t.changePct != null) {
      headline = (Math.abs(price) < 3 ? 'Prices held steady' : price > 0 ? 'Prices rose' : 'Prices dipped') + ' this spring. The tax rate ' + (t.changePct > 0 ? 'kept climbing.' : t.changePct < 0 ? 'came down.' : 'held flat.');
    } else {
      headline = 'How ' + feed.town.name + ' is trending';
    }
    var fair = '';
    if (f && f.available) {
      var band = String(f.band).toLowerCase();
      var phrase = band === 'excellent' || band === 'good' ? 'Assessments here are fairly consistent.' : band === 'fair' || band === 'moderate' ? 'Assessments here are somewhat uneven.' : 'Assessments here are uneven.';
      fair = '<p class="wdh-callout">' + icon('scale-balanced') + '<span>' + phrase + ' Watchdog rates the town\'s assessment uniformity as <strong>' + esc(band.charAt(0).toUpperCase() + band.slice(1)) + '</strong>' + (f.year ? ' for ' + f.year : '') + '.' +
        (r && r.available ? ' Homes are assessed at about ' + Math.round(r.average) + '% of market value on average (2026 state ratio).' : '') + '</span></p>';
    }
    return '<article class="wdh-card wdh-feed-card" data-tabs="town sales">' +
      kicker('chart-line', 'Town pulse', feed.town.name) +
      '<h3 class="wdh-h3">' + esc(headline) + '</h3>' +
      '<div class="wdh-stats">' + stats.map(function (st) { return '<div class="wdh-stat"><p class="wdh-stat-l">' + esc(st[0]) + '</p><p class="wdh-stat-v">' + esc(st[1]) + '</p><p class="wdh-meta">' + esc(st[2]) + '</p></div>'; }).join('') + '</div>' +
      (t && t.available && t.series && t.series.length > 2 ? '<figure class="wdh-fig"><figcaption class="wdh-h4">General tax rate, ' + t.series.slice(-10)[0][0] + ' to ' + t.year + '</figcaption><p class="wdh-meta">Dollars per $100 of assessed value. Hover a point to see its value.</p>' + chartSvg(t.series) + '</figure>' : '') +
      fair +
      '<p class="wdh-source"><span>Sources: NJ Division of Taxation SR1A sales, general tax rates, assessment ratios and coefficient of dispersion.</span></p>' +
      '<div class="wdh-actions"><a class="wdh-btn wdh-btn-secondary" href="/town-compare">Compare with nearby towns</a><a class="wdh-btn wdh-btn-ghost" href="/fairness">How fairness is rated</a></div></article>';
  }

  function rulesCard(feed) {
    var rules = feed.rules;
    if (!rules || !rules.available || !rules.items.length) return '';
    var verified = rules.items.map(function (r) { return r.verifiedAt; }).filter(Boolean).sort().pop();
    var source = rules.items.map(function (r) { return r.sourceUrl; }).filter(Boolean)[0];
    return '<article class="wdh-card wdh-feed-card" data-tabs="town">' +
      kicker('building-columns', 'Town rules', 'Official source') +
      '<h3 class="wdh-h3">Selling in ' + esc(feed.town.name) + '? Plan for ' + (rules.items.length === 1 ? 'this certificate' : rules.items.length === 2 ? 'two certificates' : 'these certificates') + '.</h3>' +
      '<p class="wdh-body">Before closing, the town requires the items below.' + (verified ? ' Watchdog re-checked the town\'s rules on ' + esc(dayLabel(verified)) + '.' : '') + '</p>' +
      '<ul class="wdh-check">' + rules.items.map(function (r) { return '<li><span class="wdh-check-mark">' + icon('check') + '</span><span>' + esc(r.title) + '</span><span class="wdh-tag">Required</span></li>'; }).join('') + '</ul>' +
      '<p class="wdh-source">' + icon('shield-halved') + '<span><strong>Official source.</strong> ' + esc(feed.town.name) + ', ' + esc(feed.town.county) + ' County.' + (source ? ' <a href="' + esc(source) + '" target="_blank" rel="noopener">View source</a>' : '') + '</span></p></article>';
  }

  function gamesCard() { return tpl('wdh-tpl-games'); }

  /* Games card: this browser's progress (the same localStorage the games use)
     and a one-line peek at today's real puzzle from /api/watchdog-games. */
  var GAME_IDS = ['pin-drop', 'sold', 'blocks', 'town-shapes', 'lineup', 'fair-or-unfair'];
  var GAME_LAUNCH = '2026-10-01';
  var SIX_TRY_POINTS = [100, 85, 70, 55, 40, 25];
  function gamesToday() {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    } catch (_error) {
      var d = new Date();
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }
  }
  function gameDay(id, date) {
    var data = store('wd-games:v1:' + id);
    return data && data.days ? data.days[date] || null : null;
  }
  function gamePoints(id, day) {
    if (typeof day.points === 'number') return day.points;
    if ((id === 'sold' || id === 'town-shapes') && day.won && day.guesses) return SIX_TRY_POINTS[day.guesses.length - 1] || 0;
    return 0;
  }
  function gameStarted(day) {
    return !!(day && ((day.guesses && day.guesses.length) || (day.orders && day.orders.length) || (day.picks && day.picks.length) || day.clues));
  }
  function gameFact(id, puzzle) {
    if (!puzzle) return '';
    var h = puzzle.home || {};
    if (id === 'sold') return [h.sqft ? count(h.sqft) + ' sq ft' : '', h.year_built ? 'built ' + h.year_built : '', h.town || ''].filter(Boolean).join(' · ');
    if (id === 'pin-drop') {
      var price = puzzle.free && puzzle.free.price;
      return [price ? shortMoney(price) + ' ' + String(h.kind || 'home').toLowerCase() : '', h.year_built ? 'built ' + h.year_built : ''].filter(Boolean).join(' · ');
    }
    if (id === 'fair-or-unfair' && Array.isArray(puzzle.homes) && puzzle.homes.length) {
      var counties = puzzle.homes.map(function (x) { return x.county; }).filter(function (c, i, all) { return c && all.indexOf(c) === i; });
      return puzzle.homes.length + ' homes · ' + (counties.length === 1 ? counties[0] + ' County' : counties.length + ' counties');
    }
    return '';
  }
  function loadGamePeeks() {
    if (state.gamesPromise) return state.gamesPromise;
    var date = gamesToday();
    state.gamesPromise = Promise.all(['sold', 'pin-drop', 'fair-or-unfair'].map(function (id) {
      return fetch('/api/watchdog-games?game=' + id + '&date=' + date, { credentials: 'same-origin' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (puzzle) { return [id, puzzle]; }, function () { return [id, null]; });
    })).then(function (pairs) {
      state.games = {};
      pairs.forEach(function (p) { state.games[p[0]] = p[1]; });
      return state.games;
    });
    return state.gamesPromise;
  }
  function hydrateGames() {
    var card = document.querySelector('#wdh-cards .wdh-games-card');
    if (!card) return;
    var date = gamesToday();
    var played = 0;
    GAME_IDS.forEach(function (id) { var d = gameDay(id, date); if (d && d.done) played += 1; });
    var number = Math.round((Date.parse(date + 'T00:00:00Z') - Date.parse(GAME_LAUNCH + 'T00:00:00Z')) / 864e5) + 1;
    var dayEl = card.querySelector('[data-games-day]');
    if (dayEl && number > 0) dayEl.textContent = 'Puzzle No. ' + number;
    var head = card.querySelector('[data-games-head]');
    if (head && played) head.textContent = played === GAME_IDS.length ? 'All 6 done today. See where you rank.' : "You've played " + played + ' of 6 today';
    Array.prototype.forEach.call(card.querySelectorAll('[data-game]'), function (tile) {
      var id = tile.getAttribute('data-game');
      var day = gameDay(id, date);
      var status = tile.querySelector('[data-game-status]'), go = tile.querySelector('[data-game-go]'), done = tile.querySelector('[data-game-done]');
      if (day && day.done) {
        tile.classList.add('is-done');
        if (done) done.hidden = false;
        if (status) status.textContent = gamePoints(id, day) + ' points today';
        if (go) go.textContent = 'See results';
      } else if (gameStarted(day)) {
        if (status) status.textContent = 'In progress';
        if (go) go.textContent = 'Continue';
      }
      var fact = tile.querySelector('[data-game-fact]');
      var text = state.games ? gameFact(id, state.games[id]) : '';
      if (fact && text) { fact.textContent = 'Today: ' + text; fact.hidden = false; }
    });
    if (!state.games) loadGamePeeks().then(function () { if (state.games) hydrateGames(); });
  }

  function pickTownCard() { return tpl('wdh-tpl-pick'); }

  function caughtUp() { return tpl('wdh-tpl-caught'); }

  function emptyRadiusCard() {
    return '<div class="wdh-card wdh-feed-card wdh-empty" data-tabs="all"><p class="wdh-body">Nothing within ' + esc(state.radius) + ' ' + plural(Number(state.radius), 'mile', 'miles') + ' of your home in the latest records. Try a wider distance.</p></div>';
  }

  function buildCards() {
    var feed = state.feed, cards = [];
    if (!feed || !feed.town) {
      cards.push(pickTownCard());
      cards.push(deadlineCard());
      cards.push(homeCard({ stats: null, town: {} }));
      cards.push(gamesCard());
      return cards.filter(Boolean);
    }
    var permits = feed.permits && feed.permits.available ? feed.permits.items.filter(inRadius) : [];
    var sales = feed.sales && feed.sales.available ? feed.sales.items.filter(inRadius) : [];
    var radiusEmpty = state.radius !== 'town' && !permits.length && !sales.length;
    if (permits[0]) cards.push(permitCard(permits[0], feed));
    if (sales.length) cards.push(saleCard(sales, feed));
    if (radiusEmpty) cards.push(emptyRadiusCard());
    cards.push(deadlineCard());
    cards.push(homeCard(feed));
    cards.push(gamesCard());
    if (permits[1]) cards.push(permitCard(permits[1], feed));
    cards.push(pulseCard(feed));
    if (permits.length > 2) cards.push(permitListCard(permits.slice(2), feed));
    cards.push(rulesCard(feed));
    if (feed.sales && feed.sales.available === false && feed.sales.reason === 'withheld') {
      cards.push(tpl('wdh-tpl-withheld'));
    }
    return cards.filter(Boolean);
  }

  function renderCards() {
    var host = $('wdh-cards');
    if (!host) return;
    host.innerHTML = buildCards().join('') + caughtUp();
    applyTab();
    hydrateGames();
  }

  function applyTab() {
    var host = $('wdh-cards');
    if (!host) return;
    /* On phones the Brief sits inside the feed, so CSS hides it outside "For you". */
    root.setAttribute('data-tab', state.tab);
    var shown = 0;
    Array.prototype.forEach.call(host.children, function (card) {
      var tabs = String(card.getAttribute('data-tabs') || '').split(/\s+/);
      var show = state.tab === 'all' || tabs.indexOf('all') !== -1 || tabs.indexOf(state.tab) !== -1;
      card.hidden = !show;
      if (show && !card.classList.contains('wdh-caught')) shown += 1;
    });
    var empty = host.querySelector('.wdh-tab-empty');
    if (empty) empty.remove();
    if (!shown) {
      var div = document.createElement('div');
      div.className = 'wdh-card wdh-feed-card wdh-empty wdh-tab-empty';
      div.innerHTML = '<p class="wdh-body">Nothing in this part of the feed yet for ' + esc(townName() || 'your town') + '.</p>';
      host.insertBefore(div, host.firstChild);
    }
    Array.prototype.forEach.call(document.querySelectorAll('#wdh-tabs .wdh-tab'), function (b) {
      var on = b.getAttribute('data-tab') === state.tab;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function renderGlance() {
    var card = $('wdh-glance-card'), feed = state.feed;
    if (!card) return;
    if (!feed || !feed.town) { card.hidden = true; return; }
    var t = feed.town, rows = [];
    if (feed.stats && feed.stats.available) {
      if (feed.stats.homes) rows.push(['Homes', count(feed.stats.homes)]);
      if (feed.stats.medianTax) rows.push(['Median home tax', money(feed.stats.medianTax)]);
      if (feed.stats.medianAssessed) rows.push(['Median assessment', money(feed.stats.medianAssessed)]);
    }
    if (feed.tax && feed.tax.available) rows.push([feed.tax.year + ' tax rate', feed.tax.rate.toFixed(3)]);
    if (feed.ratio && feed.ratio.available) rows.push(['2026 assessment ratio', feed.ratio.average.toFixed(1) + '%']);
    if (feed.fairness && feed.fairness.available) rows.push(['Assessment fairness', String(feed.fairness.band).charAt(0).toUpperCase() + String(feed.fairness.band).slice(1)]);
    if (t.population) rows.push(['Population (2020)', count(t.population)]);
    $('wdh-glance-title').textContent = t.name;
    $('wdh-glance-county').textContent = t.county + ' County';
    $('wdh-glance').innerHTML = rows.map(function (r) { return '<div><dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd></div>'; }).join('');
    var link = $('wdh-glance-link');
    if (link) { link.href = t.townPage || '/towns/'; link.textContent = 'Open the ' + t.name + ' report'; }
    card.hidden = false;
  }

  /* ---------- map ---------- */
  function markerIcon(kind) {
    return window.L.divIcon({ className: 'wdh-mk-wrap', html: '<span class="wdh-mk wdh-mk-' + kind + '"></span>', iconSize: [18, 18], iconAnchor: [9, 9], popupAnchor: [0, -8] });
  }

  /* Quick facts for one map pin. The same card shows on hover (no button)
     and in the tap/click popup (with "Open property"). */
  function pinCard(kind, item, withButton) {
    var label, title, value, facts, address = '';
    if (kind === 'sale') {
      label = 'Home sale · ' + MONTHS[item.month - 1] + ' ' + item.year;
      title = item.address;
      value = money(item.price);
      facts = [item.sqft ? count(item.sqft) + ' sq ft' : '', item.yearBuilt ? 'Built ' + item.yearBuilt : '', item.ppsf ? money(item.ppsf) + '/sq ft' : ''];
      address = item.address;
    } else if (kind === 'permit') {
      label = 'Building permit · ' + dayLabel(item.date, false);
      title = item.address || blockLot(item.pin);
      value = item.cost ? 'Est. ' + shortMoney(item.cost) : '';
      facts = [item.type === 'New' ? 'New ' + (item.useLabel || 'building') : item.type, item.sqft ? count(item.sqft) + ' sq ft' : ''];
      address = item.address || '';
    } else {
      label = 'Your home';
      title = item.address || '';
      value = item.assessed ? money(item.assessed) + ' assessed' : '';
      facts = [item.tax ? money(item.tax) + ' tax last year' : ''];
    }
    var dist = kind !== 'home' ? distanceText(item) : '';
    // content-architecture: dynamic. Every value below comes from this pin's sale, permit or saved-home record.
    return '<div class="wdh-pin">' +
      '<span class="wdh-pin-main"><span class="wdh-pin-k wdh-pin-k-' + kind + '">' + esc(label) + '</span>' +
      '<b class="wdh-pin-t">' + esc(title) + '</b>' +
      (value ? '<span class="wdh-pin-v">' + esc(value) + '</span>' : '') +
      '<span class="wdh-pin-f">' + esc(facts.filter(Boolean).join(' · ')) + '</span>' +
      (dist ? '<span class="wdh-pin-f">' + esc(dist) + '</span>' : '') + '</span>' +
      (withButton && address ? '<button type="button" class="wdh-pop-open" data-open="' + esc(address) + '">Open property</button>' : '') +
      '</div>';
  }
  /* The hover card lives on <body>, not inside the small map, so it is never
     clipped by the map edge. Pointer devices get it on hover; keyboard users
     get it on focus. Tapping or clicking a pin still opens the popup. */
  var canHover = !!(window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches);
  var hoverEl = null;
  function showHover(marker, html) {
    var anchor = marker.getElement();
    if (!anchor || marker.isPopupOpen()) return;
    if (!hoverEl) {
      hoverEl = document.createElement('div');
      hoverEl.className = 'wdh-hover';
      hoverEl.setAttribute('aria-hidden', 'true');
      document.body.appendChild(hoverEl);
    }
    hoverEl.innerHTML = html;
    hoverEl.hidden = false;
    var r = anchor.getBoundingClientRect(), w = hoverEl.offsetWidth, h = hoverEl.offsetHeight;
    var left = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 8));
    var top = r.top - h - 10, below = top < 72;
    if (below) top = r.bottom + 10;
    hoverEl.style.left = Math.round(left) + 'px';
    hoverEl.style.top = Math.round(top) + 'px';
    hoverEl.classList.toggle('is-below', below);
  }
  function hideHover() { if (hoverEl) hoverEl.hidden = true; }
  window.addEventListener('scroll', hideHover, { passive: true });
  function pinMarker(kind, item, latlng, options, name) {
    var marker = window.L.marker(latlng, options);
    var hover = pinCard(kind, item, false);
    marker.bindPopup(pinCard(kind, item, true), { className: 'wdh-popup', maxWidth: 300, minWidth: 240 });
    marker.on('popupopen', hideHover);
    if (canHover) {
      marker.on('mouseover', function () { showHover(marker, hover); });
      marker.on('mouseout', hideHover);
    }
    marker.on('add', function () {
      var el = marker.getElement();
      if (!el) return;
      el.setAttribute('aria-label', name);
      el.addEventListener('focus', function () { showHover(marker, hover); });
      el.addEventListener('blur', hideHover);
    });
    return marker;
  }
  function renderMap() {
    var card = $('wdh-map-card'), feed = state.feed, L = window.L;
    if (!card) return;
    if (!feed || !feed.town || !L || typeof L.map !== 'function') { card.hidden = true; return; }
    var sales = feed.sales && feed.sales.available ? feed.sales.items.filter(function (i) { return i.lat != null && inRadius(i); }) : [];
    var permits = feed.permits && feed.permits.available ? feed.permits.items.filter(function (i) { return i.lat != null && inRadius(i); }) : [];
    var hasHome = !!(state.home && state.home.lat != null && state.home.code === feed.town.code);
    if (!sales.length && !permits.length && feed.town.lat == null) { card.hidden = true; return; }
    card.hidden = false;
    $('wdh-map-title').textContent = hasHome ? 'Around your home' : 'Around ' + feed.town.name;
    $('wdh-legend-sales').textContent = String(sales.length);
    $('wdh-legend-permits').textContent = String(permits.length);
    $('wdh-legend-home').hidden = !hasHome;
    $('wdh-radius').hidden = !hasHome;
    $('wdh-map-count').textContent = '';
    try {
      if (!state.map) {
        state.map = L.map('wdh-map', { scrollWheelZoom: false, zoomControl: true, attributionControl: true });
        state.map.on('movestart zoomstart', hideHover);
        /* Esri light gray canvas, same tile host as the site's aerial layer
           (the CARTO raster URLs used elsewhere now require an API key). */
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
          maxZoom: 16, attribution: 'Tiles &copy; Esri, HERE, Garmin, &copy; OpenStreetMap contributors'
        }).addTo(state.map);
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}', {
          maxZoom: 16, pane: 'shadowPane'
        }).addTo(state.map);
      }
      if (state.mapLayer) state.map.removeLayer(state.mapLayer);
      var group = L.featureGroup();
      /* No marker "title": the hover card replaces the browser's plain tooltip. */
      sales.forEach(function (i) {
        pinMarker('sale', i, [i.lat, i.lon], { icon: markerIcon('sale'), keyboard: true }, 'Home sale: ' + i.address).addTo(group);
      });
      permits.forEach(function (i) {
        pinMarker('permit', i, [i.lat, i.lon], { icon: markerIcon('permit'), keyboard: true }, 'Building permit: ' + (i.address || blockLot(i.pin))).addTo(group);
      });
      if (hasHome) {
        pinMarker('home', state.home, [state.home.lat, state.home.lon], { icon: markerIcon('home'), keyboard: true, zIndexOffset: 500 }, 'Your home').addTo(group);
      }
      group.addTo(state.map);
      state.mapLayer = group;
      setTimeout(function () {
        state.map.invalidateSize();
        if (group.getLayers().length > 1) state.map.fitBounds(group.getBounds().pad(0.18), { maxZoom: 15 });
        else if (group.getLayers().length === 1) state.map.setView(group.getLayers()[0].getLatLng(), 15);
        else state.map.setView([feed.town.lat, feed.town.lon], 13);
      }, 40);
    } catch (_error) {
      card.hidden = true;
    }
  }

  function renderRadius() {
    Array.prototype.forEach.call(document.querySelectorAll('#wdh-radius .wdh-chip'), function (b) {
      var on = b.getAttribute('data-radius') === state.radius;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function render() {
    root.setAttribute('data-state', 'ready');
    root.removeAttribute('aria-busy');
    renderHero();
    renderTiles();
    renderWeek();
    renderCards();
    renderGlance();
    renderRadius();
    renderMap();
    rememberSeen();
  }

  function renderError() {
    root.setAttribute('data-state', 'error');
    root.removeAttribute('aria-busy');
    var tiles = $('wdh-tiles');
    if (tiles) tiles.hidden = true;
    var host = $('wdh-cards');
    if (host) {
      host.innerHTML = tpl('wdh-tpl-error') + gamesCard();
      hydrateGames();
    }
  }

  function rememberSeen() {
    var feed = state.feed;
    if (!feed || !feed.town || state.seenSaved[feed.town.code]) return;
    state.seenSaved[feed.town.code] = true;
    var next = {
      sales: feed.sales && feed.sales.available ? feed.sales.batch.label : (state.seen && state.seen.sales) || null,
      permits: feed.permits && feed.permits.available ? feed.permits.dataThrough : (state.seen && state.seen.permits) || null
    };
    store(KEY_SEEN + feed.town.code, next);
  }

  /* ---------- actions ---------- */
  function openProperty(address) {
    var input = $('pl-addr');
    if (!input || typeof window.plLookup !== 'function') { window.location.href = '/?address=' + encodeURIComponent(address); return; }
    var town = townName();
    var full = /,\s*NJ\b/i.test(address) ? address : address + (town && address.indexOf(',') === -1 ? ', ' + town : '') + ', NJ';
    input.value = full;
    window.plLookup();
  }
  function share(address, title, button) {
    var town = townName();
    var url = window.location.origin + '/?address=' + encodeURIComponent(address + (town ? ', ' + town : '') + ', NJ');
    if (navigator.share) {
      navigator.share({ title: title, text: title + ' (Watchdog)', url: url }).catch(function () {});
      return;
    }
    var done = function () {
      if (!button) return;
      button.classList.add('is-done');
      button.setAttribute('aria-label', 'Link copied');
      setTimeout(function () { button.classList.remove('is-done'); button.setAttribute('aria-label', 'Share ' + address); }, 1800);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, function () {});
  }
  function focusSearch() {
    var input = $('pl-addr');
    if (!input) return;
    input.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(function () { input.focus({ preventScroll: true }); }, 250);
  }

  document.addEventListener('click', function (event) {
    var target = event.target && event.target.closest ? event.target : null;
    if (!target) return;
    var el;
    if ((el = target.closest('[data-open]'))) { event.preventDefault(); openProperty(el.getAttribute('data-open')); return; }
    if ((el = target.closest('[data-share]'))) { event.preventDefault(); share(el.getAttribute('data-share'), el.getAttribute('data-share-title'), el); return; }
    if ((el = target.closest('#wdh-tabs .wdh-tab'))) { state.tab = el.getAttribute('data-tab') || 'all'; applyTab(); return; }
    if ((el = target.closest('#wdh-tiles .wdh-tile'))) {
      state.tab = el.getAttribute('data-go') || 'all';
      applyTab();
      var feedHead = $('wdh-feed-title');
      if (feedHead) feedHead.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if ((el = target.closest('#wdh-radius .wdh-chip'))) { state.radius = el.getAttribute('data-radius') || 'town'; renderRadius(); renderCards(); renderMap(); return; }
    if (target.closest('#wdh-town-change') || target.closest('[data-pick-town]')) { openPicker(); return; }
    if (target.closest('[data-wdh-close]')) { closePicker(); return; }
    if ((el = target.closest('[data-town]'))) { chooseTown(el.getAttribute('data-town')); closePicker(); return; }
    if (target.closest('#wdh-picker-locate')) { locateTown(); return; }
    if (target.closest('[data-focus-search]')) { focusSearch(); return; }
    if (target.closest('[data-signin]')) { if (typeof window.plSignInPrompt === 'function') window.plSignInPrompt(); else if (window.WatchdogPublicNav) window.WatchdogPublicNav.open('profile'); return; }
    if (target.closest('[data-retry]')) { load(state.feed && state.feed.town ? state.feed.town.code : initialTown(), 'retry'); return; }
    if (target.closest('#wdh-where-pin')) { locateFromPin(); return; }
    if ((el = target.closest('#wdh-week-more'))) {
      state.briefOpen = !state.briefOpen;
      el.setAttribute('aria-expanded', state.briefOpen ? 'true' : 'false');
      var week = $('wdh-week');
      if (week) week.classList.toggle('is-open', state.briefOpen);
      return;
    }
    if (target.closest('#wdh-listen')) { speakWeek(); }
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') closePicker();
  });
  var pickerInput = $('wdh-picker-q');
  if (pickerInput) pickerInput.addEventListener('input', function () { filterPicker(pickerInput.value); });
  document.addEventListener('keydown', function (event) {
    var picker = $('wdh-picker');
    if (!picker || picker.hidden || event.key !== 'Tab') return;
    var focusables = picker.querySelectorAll('button:not([disabled]), input');
    if (!focusables.length) return;
    var first = focusables[0], last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });

  /* ---------- boot ---------- */
  function initialTown() {
    var param = '';
    try { param = String(new URLSearchParams(window.location.search).get('town') || '').replace(/\D/g, '').slice(0, 4); } catch (_error) {}
    if (param.length === 4) return param;
    if (state.home && state.home.code) return state.home.code;
    var saved = store(KEY_TOWN);
    return typeof saved === 'string' && /^\d{4}$/.test(saved) ? saved : '';
  }

  function boot() {
    renderWhere();
    renderUpcoming();
    loadHome().then(function (home) {
      state.home = home;
      var code = initialTown();
      if (home && home.pin) state.homePrev = store(KEY_HOME + home.pin);
      var feedLoad = load(code, 'boot');
      var scoreLoad = home ? loadScore(home).then(function (score) {
        if (score == null || !state.home) return;
        state.home.score = score;
        if (state.feed && root.getAttribute('data-state') === 'ready') renderCards();
      }) : Promise.resolve();
      return Promise.all([feedLoad, scoreLoad]);
    }).then(function () {
      if (state.home && state.home.pin) {
        store(KEY_HOME + state.home.pin, { assessed: state.home.assessed, tax: state.home.tax, score: state.home.score });
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
