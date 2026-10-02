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
  var KEY_FEED = 'wdh:feed:';
  var KEY_LAST = 'wdh:lastTown';
  var KEY_WX = 'wdh:wx:';
  var FEED_TIMEOUT = 9000;
  var WEATHER_API = '/api/watchdog-town-weather';
  var WX_ICONS = /^(?:sun|moon|cloud|cloud-sun|cloud-moon|cloud-rain|cloud-showers-heavy|cloud-bolt|snowflake|smog|wind)$/;
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
    places: [],
    requestId: 0,
    wxFor: ''
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
    return (d < 0.1 ? 'Under 0.1' : d.toFixed(1)) + ' mi away';
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

  /* "Coming up" lives in the left feed menu on wide desktops and in the right
     rail otherwise; CSS shows one copy. */
  function renderUpcoming() {
    var html = deadlines(new Date()).slice(0, 4).map(function (d) {
      return '<li><span class="wdh-date' + (d.soon ? ' is-soon' : '') + '"><span class="wdh-date-m">' + SHORT[d.date.getMonth()] + '</span><span class="wdh-date-d">' + d.date.getDate() + '</span></span>' +
        '<span><span class="wdh-up-t">' + esc(d.title) + '</span><span class="wdh-meta">' + (d.soon ? d.days + ' ' + plural(d.days, 'day', 'days') + ' left' : esc(shortDay(d.date))) + '</span></span></li>';
    }).join('');
    Array.prototype.forEach.call(document.querySelectorAll('[data-wdh-upcoming]'), function (host) { host.innerHTML = html; });
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
          state.places = rows.filter(function (r) { return r.address; }).slice(0, 5).map(function (r) {
            return { address: r.address, town: r.town || '', label: r.nickname || (r.kind === 'home' ? 'My home' : r.kind === 'watch' ? 'Watching' : 'Saved'), isHome: r.kind === 'home' };
          });
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
  /* "refresh" means a remembered copy is already on screen: keep it if the
     network is slow or fails, and swap in fresh data when it arrives. */
  function load(code, reason) {
    var id = ++state.requestId;
    var refreshing = reason === 'refresh' && !!state.feed;
    if (!refreshing) setLoading();
    var url = API + (code ? '?town=' + encodeURIComponent(code) : '');
    var controller = typeof window.AbortController === 'function' ? new window.AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, FEED_TIMEOUT) : 0;
    return fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json' }, signal: controller ? controller.signal : undefined })
      .then(function (r) { if (!r.ok) throw new Error('feed http ' + r.status); return r.json(); })
      .then(function (feed) {
        clearTimeout(timer);
        if (id !== state.requestId) return;
        state.feed = feed;
        var code = feed && feed.town ? feed.town.code : '';
        if (code && state.seenFor !== code) { state.seen = store(KEY_SEEN + code); state.seenFor = code; }
        render(reason);
        if (code) { store(KEY_FEED + code, { at: Date.now(), feed: feed }); store(KEY_LAST, code); }
      })
      .catch(function () {
        clearTimeout(timer);
        if (id !== state.requestId || refreshing) return;
        renderError();
      });
  }

  /* The last feed this browser saw for a town, if it is under 12 hours old. */
  function rememberedFeed(code) {
    var saved = code ? store(KEY_FEED + code) : null;
    return saved && saved.feed && saved.feed.town && saved.feed.town.code === code && Date.now() - saved.at < 12 * 3600 * 1000 ? saved.feed : null;
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

  /* The quiet line between the hero and the feed: the date on the left, the
     weather and "town (change)" on the right. */
  function renderWhere() {
    var now = new Date(), town = state.feed && state.feed.town;
    var date = $('wdh-where-date'), where = $('wdh-where-town'), change = $('wdh-town-change');
    if (date) date.textContent = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][now.getDay()] + ', ' + MONTHS[now.getMonth()] + ' ' + now.getDate();
    if (where) where.textContent = town ? town.name + ', ' + town.county + ' County' : 'New Jersey';
    if (change) change.setAttribute('aria-label', town ? 'Change town, now ' + town.name : 'Choose your town');
    if (town) loadWeather(town.code);
  }

  /* "Sunny 77°" from /api/watchdog-town-weather. It loads after the feed and never
     holds it up; a reading under 20 minutes old is reused, and one under 3
     hours old shows while a fresh one loads. */
  function renderWeather(wx) {
    var box = $('wdh-wx'), text = $('wdh-wx-text'), ico = $('wdh-wx-icon'), sep = $('wdh-where-sep');
    var ok = !!(wx && wx.text && isFinite(wx.temp));
    if (box) box.hidden = !ok;
    if (sep) sep.hidden = !ok;
    if (!ok || !text) return;
    if (ico) ico.className = 'fas fa-' + (WX_ICONS.test(wx.icon) ? wx.icon : 'cloud-sun');
    text.textContent = wx.text + ' ' + Math.round(wx.temp) + '\u00B0';
  }
  function loadWeather(code) {
    if (!code || state.wxFor === code) return;
    state.wxFor = code;
    var saved = store(KEY_WX + code);
    var age = saved && saved.wx ? Date.now() - saved.at : Infinity;
    renderWeather(age < 3 * 3600 * 1000 ? saved.wx : null);
    if (age < 20 * 60 * 1000) return;
    fetch(WEATHER_API + '?town=' + encodeURIComponent(code), { credentials: 'same-origin', headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (wx) {
        if (state.wxFor !== code || !wx || !wx.text) return;
        store(KEY_WX + code, { at: Date.now(), wx: wx });
        renderWeather(wx);
      })
      .catch(function () {});
  }

  function isNewSales() {
    var s = state.feed && state.feed.sales;
    return !!(s && s.available && state.seen && state.seen.sales && state.seen.sales !== s.batch.label);
  }
  function isNewPermits() {
    var p = state.feed && state.feed.permits;
    return !!(p && p.available && state.seen && state.seen.permits && state.seen.permits !== p.dataThrough);
  }

  /* Thin summary chips: a colored icon and "22 Home sales". The detail line
     ("Sold in May 2026") is the tooltip and part of the spoken label. */
  function tile(tab, tone, iconName, value, label, sub, isNew) {
    return '<button type="button" class="wdh-tile is-' + tone + '" data-go="' + tab + '" title="' + esc(sub) + '" aria-label="' + esc(value + ' ' + label + '. ' + sub) + '">' +
      '<span class="wdh-tile-ico" aria-hidden="true">' + icon(iconName) + '</span>' +
      '<span class="wdh-tile-text" aria-hidden="true"><span class="wdh-tile-num">' + esc(value) + '</span><span class="wdh-tile-label">' + esc(label) + '</span></span>' +
      (isNew ? '<span class="wdh-new" aria-hidden="true">New</span>' : '') + '</button>';
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
      ? tile('sales', 'sales', 'tag', count(s.batchCount), plural(s.batchCount, 'Home sale', 'Home sales'), 'Sold in ' + s.batch.label, isNewSales())
      : tile('sales', 'sales', 'tag', '-', 'Home sales', 'Sale records are loading slowly', false);
    html += p && p.available
      ? tile('permits', 'permits', 'helmet-safety', count(p.notableCount), plural(p.notableCount, 'Permit', 'Permits'), 'Larger permits filed ' + monthRange(p.window), isNewPermits())
      : tile('permits', 'permits', 'helmet-safety', '0', 'Permits', 'None in recent state data', false);
    html += t && t.available
      ? tile('town', 'tax', 'building-columns', t.rate.toFixed(3), 'Tax rate', t.year + ' rate' + (t.changePct != null ? ', ' + (t.changePct >= 0 ? 'up ' : 'down ') + pct(t.changePct) + ' from ' + t.priorYear : ''), false)
      : tile('town', 'tax', 'building-columns', '-', 'Tax rate', 'Not published for this town', false);
    html += tile('home', 'dates', 'calendar-day', String(soon.length), plural(soon.length, 'Deadline', 'Deadlines'), next ? 'Next: ' + dayLabel(next.date, false) + ', ' + next.title.replace(' due', '') : 'None in the next 45 days', false);
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
    if (type === 'new') return 'New ' + (item.useLabel || 'building') + ' at ' + where;
    if (type === 'addition') return (item.sqft ? count(item.sqft) + ' sq ft addition' : 'Addition') + ' at ' + where;
    if (type === 'demolition') return 'Demolition at ' + where;
    if (type === 'alteration') return (item.cost ? shortMoney(item.cost) + ' renovation' : 'Renovation') + ' at ' + where;
    return item.type + ' permit at ' + where;
  }
  function lowerFirst(text) { return String(text || '').replace(/^(\w)/, function (m) { return m.toLowerCase(); }); }
  function upperFirst(text) { return String(text || '').replace(/^(\w)/, function (m) { return m.toUpperCase(); }); }
  var SHORT_MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function shortDay(value) {
    var d = value instanceof Date ? value : parseDay(value);
    return d ? SHORT_MONTH[d.getMonth()] + ' ' + d.getDate() : '';
  }
  function signed(value) { var n = num(value); return n == null ? '' : (n >= 0 ? '+' : '−') + pct(n); }

  /* ---------- local reporters (stored hourly; served with the feed) ---------- */
  function newsSource(id) {
    var news = state.feed && state.feed.news;
    var list = news && news.sources ? news.sources : [];
    return list.filter(function (s) { return s.id === id; })[0] || { id: id, name: id, badge: '', site: '' };
  }
  function newsItems() {
    var news = state.feed && state.feed.news;
    return news && news.available && Array.isArray(news.items) ? news.items : [];
  }
  /* Same keys as api/_local-news.js: "303 white horse pike", "53 route 73". */
  var STREET_TYPES = { road: 'rd', rd: 'rd', pike: 'pike', avenue: 'ave', ave: 'ave', street: 'st', st: 'st', boulevard: 'blvd', blvd: 'blvd', drive: 'dr', dr: 'dr', lane: 'ln', ln: 'ln', highway: 'hwy', hwy: 'hwy', parkway: 'pkwy', pkwy: 'pkwy', way: 'way', court: 'ct', ct: 'ct', place: 'pl', pl: 'pl', circle: 'cir', cir: 'cir', terrace: 'ter', ter: 'ter' };
  function addressKey(address) {
    var text = String(address || '').trim();
    var m = text.match(/^(\d{1,5})\s+(?:(?:north|south|east|west|[nsew]\.?)\s+)?(?:route|rt\.?|rte\.?|state highway|us|u\.s\.)\s*(\d{1,3})\b/i);
    if (m) return m[1] + ' route ' + Number(m[2]);
    m = text.match(/^(\d{1,5})\s+(?:(?:north|south|east|west|[nsew]\.?)\s+)?(.+?)\s+(road|rd|pike|avenue|ave|street|st|boulevard|blvd|drive|dr|lane|ln|highway|hwy|parkway|pkwy|way|court|ct|place|pl|circle|cir|terrace|ter)\b\.?/i);
    if (!m) return '';
    var street = m[2].toLowerCase().replace(/[-/]/g, ' ').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
    return m[1] + ' ' + street + ' ' + (STREET_TYPES[m[3].toLowerCase().replace('.', '')] || m[3].toLowerCase());
  }
  function storyFor(permit, news) {
    var key = addressKey(permit.address);
    if (!key) return null;
    return news.filter(function (n) { return (n.addresses || []).indexOf(key) !== -1; })[0] || null;
  }

  /* ---------- Watchdog Intelligence Brief ---------- */
  function weekItems() {
    var feed = state.feed, out = [];
    if (!feed || !feed.town) return out;
    var s = feed.sales, p = feed.permits, t = feed.tax;
    if (s && s.available) {
      var w = s.window;
      out.push('<strong>' + count(s.batchCount) + ' ' + plural(s.batchCount, 'home sold', 'homes sold') + '</strong> in ' + esc(MONTHS[s.batch.month - 1]) + '.' +
        (w && w.median ? ' Median <strong>' + shortMoney(w.median) + '</strong>' + (w.changePct != null ? ', ' + (w.changePct >= 0 ? 'up ' : 'down ') + pct(w.changePct) + ' from last year.' : '.') : ''));
    }
    if (p && p.available && p.items && p.items.length) {
      var top = p.items[0];
      out.push('Biggest project: <strong>' + esc(lowerFirst(permitHeadline(top))) + '</strong>' + (top.cost ? ' (' + shortMoney(top.cost) + ')' : '') + '.');
    }
    var fresh = newsItems().filter(function (n) { return Date.now() - Date.parse(n.date) < 14 * 864e5; })[0];
    if (fresh) out.push('<strong>Local news:</strong> ' + esc(fresh.title) + ' <span class="wdh-week-src">' + esc(newsSource(fresh.source).name) + '</span>');
    var home = state.home;
    if (home && home.code === feed.town.code && home.tax) {
      var medianTax = feed.stats && feed.stats.available ? feed.stats.medianTax : null;
      var diff = medianTax ? (home.tax / medianTax - 1) * 100 : null;
      out.push('<strong>Your home:</strong> ' + money(home.tax) + ' tax last year' +
        (diff == null ? '.' : Math.abs(diff) < 1 ? ', about the town median.' : ', ' + pct(diff) + (diff > 0 ? ' above' : ' below') + ' the town median.'));
    }
    var next = deadlines(new Date())[0];
    var tax = t && t.available ? 'Tax rate <strong>' + t.rate.toFixed(3) + '</strong>' + (t.changePct != null ? ', ' + (t.changePct >= 0 ? 'up ' : 'down ') + pct(t.changePct) + '.' : '.') : '';
    if (tax || next) out.push(tax + (next ? (tax ? ' ' : '') + 'Next due: <strong>' + esc(next.title.replace(' due', '')) + ', ' + esc(shortDay(next.date)) + '</strong>.' : ''));
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
    // content-architecture: dynamic. Each sentence is computed from this town's feed data (sales, permits, tax rate, deadlines, local news).
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
    var dy = 0.0022, dx = dy * (480 / 360) / Math.max(0.45, Math.cos(item.lat * Math.PI / 180));
    var params = [
      'bbox=' + [item.lon - dx, item.lat - dy, item.lon + dx, item.lat + dy].join(','),
      'bboxSR=4326', 'imageSR=3857', 'size=480,360', 'format=jpg', 'transparent=false', 'f=image'
    ].join('&');
    return 'https://maps.nj.gov/arcgis/rest/services/Basemap/LtGray_NJ_WM/MapServer/export?' + params;
  }

  /* ---------- quick-read feed cards ----------
     Every card reads in a glance: one line for what, when and how far, a
     headline, one line of key facts and one picture. The headline opens the
     detail (the property overlay or the reporter's story) and the whole card
     is its tap target. Longer explanations live behind those taps. */
  /* Post-style header: badge, label, then when and how far. Phones stack the
     label over the details, like the author and time on a social post. */
  function metaRow(badge, label, parts, warn) {
    var sub = parts.filter(Boolean).map(function (part, i) { return (i ? '<span class="wdh-dot" aria-hidden="true">&middot;</span>' : '') + '<span class="wdh-meta">' + esc(part) + '</span>'; }).join('');
    return '<div class="wdh-krow wdh-post-head">' + badge + '<span class="wdh-post-text"><span class="wdh-kicker' + (warn ? ' is-warn' : '') + '">' + esc(label) + '</span>' +
      (sub ? '<span class="wdh-post-sub">' + sub + '</span>' : '') + '</span></div>';
  }
  function iconBadge(name, warn) { return '<span class="wdh-ico' + (warn ? ' is-warn' : '') + '">' + icon(name) + '</span>'; }
  function sourceBadge(src) { return '<span class="wdh-ico is-src" aria-hidden="true">' + esc(src.badge || String(src.name || '').charAt(0)) + '</span>'; }
  function openTitle(address, text) {
    if (!address) return esc(text);
    return '<button type="button" class="wdh-fc-link" data-open="' + esc(address) + '">' + esc(text) + '</button>';
  }
  function mapMedia(item, label) {
    var url = previewUrl(item);
    if (!url) return '';
    // content-architecture: dynamic. The map image and its label come from this record's coordinates and address.
    return '<div class="wdh-fc-media is-map"><img src="' + esc(url) + '" alt="Map of ' + esc(label) + '" loading="lazy" width="480" height="360" onerror="this.parentNode.remove()"><span class="wdh-fc-pin" aria-hidden="true"></span></div>';
  }
  function photoMedia(item, src) {
    var url = item.image || (item.video ? item.video.thumb : '');
    if (!url) return '';
    // content-architecture: dynamic. The reporter's own photo, alt text and credit for this story.
    return '<div class="wdh-fc-media is-photo"><img src="' + esc(url) + '" alt="' + esc(item.imageAlt || item.title) + '" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentNode.remove()">' +
      (item.video && !item.image ? '<span class="wdh-fc-play" aria-hidden="true">' + icon('play') + '</span>' : '') +
      '<span class="wdh-fc-credit">Photo: ' + esc(src.name) + '</span></div>';
  }
  function sourceLine(text, iconName) { return '<span class="wdh-src">' + icon(iconName || 'shield-halved') + '<span>' + esc(text) + '</span></span>'; }
  function shareButton(address, title, url) {
    if (!address && !url) return '';
    return '<button type="button" class="wdh-icon-btn wdh-share" data-share="' + esc(address || '') + '"' + (url ? ' data-share-url="' + esc(url) + '"' : '') + ' data-share-title="' + esc(title) + '" aria-label="Share ' + esc(title) + '">' + icon('share-nodes') + '</button>';
  }
  function feedCard(o) {
    var media = o.media || '';
    // content-architecture: dynamic. Layout shell for one feed item; every part is computed from that item's record.
    return '<article class="wdh-card wdh-feed-card wdh-fc' + (media ? (media.indexOf('is-photo') !== -1 ? ' has-photo' : ' has-map') : ' no-media') + (o.cls ? ' ' + o.cls : '') + '" data-tabs="' + o.tabs + '"' + (o.extraOnly ? ' data-feed-extra="1"' : '') + '>' +
      '<div class="wdh-fc-main">' + o.meta + '<h3 class="wdh-h3 wdh-fc-title">' + o.title + '</h3>' +
      (o.facts && o.facts.filter(Boolean).length ? '<p class="wdh-fc-facts">' + o.facts.filter(Boolean).map(function (f) { return '<span>' + f + '</span>'; }).join('') + '</p>' : '') +
      (o.note ? '<p class="wdh-fc-note">' + o.note + '</p>' : '') + '</div>' + media +
      (o.extra ? '<div class="wdh-fc-extra">' + o.extra + '</div>' : '') +
      '<div class="wdh-fc-foot">' + (o.source || '') + (o.actions || '') + '</div></article>';
  }

  function coverageRow(story) {
    var src = newsSource(story.source);
    // content-architecture: dynamic. A local reporter's story about this exact address, credited and linked.
    return '<a class="wdh-cov" href="' + esc(story.url) + '" target="_blank" rel="noopener">' +
      (story.image ? '<img src="' + esc(story.image) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">' : '') +
      '<span class="wdh-cov-text"><span class="wdh-cov-src">' + sourceBadge(src) + 'Also covered by ' + esc(src.name) + '</span><span class="wdh-cov-title">' + esc(story.title) + '</span></span>' +
      icon('arrow-up-right-from-square') + '</a>';
  }

  function permitCard(item, feed, story) {
    var where = item.address || blockLot(item.pin);
    var type = item.type;
    return feedCard({
      tabs: 'permits' + (story ? ' news' : ''),
      meta: metaRow(iconBadge('helmet-safety'), 'Building permit', ['Filed ' + shortDay(item.date), distanceText(item)]),
      title: openTitle(item.address, permitHeadline(item)),
      facts: [
        type !== 'New' && item.useLabel ? esc(upperFirst(item.useLabel)) : '',
        type !== 'Addition' && item.sqft ? count(item.sqft) + ' sq ft' : '',
        type !== 'Alteration' && item.cost ? shortMoney(item.cost) + ' est.' : '',
        item.related ? '+' + item.related + ' related' : ''
      ],
      media: mapMedia(item, where),
      extra: story ? coverageRow(story) : '',
      source: sourceLine('NJ permit record' + (feed.permits.publishedAt ? ', updated ' + shortDay(feed.permits.publishedAt) : '')),
      actions: shareButton(item.address, permitHeadline(item))
    });
  }

  function permitListCard(items, feed) {
    if (!items.length) return '';
    return feedCard({
      tabs: 'permits',
      meta: metaRow(iconBadge('list-check'), 'More permits', [monthRange(feed.permits.window)]),
      title: count(items.length) + ' more larger ' + plural(items.length, 'project', 'projects'),
      extra: '<ul class="wdh-rows">' + items.map(function (item) {
        var where = item.address || blockLot(item.pin);
        return '<li><span class="wdh-row-main"><span class="wdh-row-addr">' + esc(where) + '</span><span class="wdh-meta">' + esc(item.type === 'New' ? 'New ' + item.useLabel : item.type + ', ' + item.useLabel) + ' &middot; ' + esc(shortDay(item.date)) + '</span></span>' +
          '<span class="wdh-row-val">' + esc(item.cost ? shortMoney(item.cost) : '') + '</span>' +
          (item.address ? '<button type="button" class="wdh-row-open" data-open="' + esc(item.address) + '" aria-label="Open ' + esc(item.address) + '">' + icon('chevron-right') + '</button>' : '<span></span>') + '</li>';
      }).join('') + '</ul>',
      source: sourceLine(count(feed.permits.total) + ' permits of all sizes in this period')
    });
  }

  function saleCard(items, feed) {
    var s = feed.sales, top = items[0], w = s.window, rest = items.slice(1, 5);
    var vsMedian = '';
    if (top.ppsf && w && w.ppsfMedian) {
      var diff = (top.ppsf / w.ppsfMedian - 1) * 100;
      vsMedian = Math.abs(diff) < 1 ? 'at town median' : pct(diff) + (diff > 0 ? ' above' : ' below') + ' median';
    }
    return feedCard({
      tabs: 'sales',
      meta: metaRow(iconBadge('tag'), 'Home sale', [MONTHS[top.month - 1] + ' ' + top.year, distanceText(top)]),
      title: openTitle(top.address, top.address + ' sold for ' + money(top.price)),
      facts: [
        top.sqft ? count(top.sqft) + ' sq ft' : '',
        top.yearBuilt ? 'Built ' + top.yearBuilt : '',
        top.ppsf ? money(top.ppsf) + '/sq ft' + (vsMedian ? ' (' + esc(vsMedian) + ')' : '') : ''
      ],
      media: mapMedia(top, top.address),
      extra: rest.length ? '<details class="wdh-fc-more"><summary>' + rest.length + ' more ' + esc(MONTHS[s.batch.month - 1]) + ' ' + plural(rest.length, 'sale', 'sales') + icon('chevron-down') + '</summary><ul class="wdh-rows">' + rest.map(function (row) {
        return '<li><span class="wdh-row-main"><span class="wdh-row-addr">' + esc(row.address) + '</span><span class="wdh-meta">' +
          esc([row.sqft ? count(row.sqft) + ' sq ft' : '', row.yearBuilt ? 'built ' + row.yearBuilt : '', distanceText(row)].filter(Boolean).join(' · ')) + '</span></span>' +
          '<span class="wdh-row-val">' + money(row.price) + '</span>' +
          '<button type="button" class="wdh-row-open" data-open="' + esc(row.address) + '" aria-label="Open ' + esc(row.address) + '">' + icon('chevron-right') + '</button></li>';
      }).join('') + '</ul></details>' : '',
      source: sourceLine('NJ state sale record'),
      actions: shareButton(top.address, top.address + ' sold for ' + money(top.price))
    });
  }

  function newsCard(story, extraOnly) {
    var src = newsSource(story.source);
    return feedCard({
      tabs: 'news town',
      extraOnly: extraOnly,
      cls: 'wdh-news',
      meta: metaRow(sourceBadge(src), src.name, [shortDay(story.date), story.video ? 'Video' : '']),
      // content-architecture: dynamic. The reporter's own headline, linked to their story.
      title: '<a class="wdh-fc-link" href="' + esc(story.url) + '" target="_blank" rel="noopener">' + esc(story.title) + '</a>',
      media: photoMedia(story, src),
      source: sourceLine('Story by ' + src.name, 'newspaper'),
      actions: (story.video ? '<a class="wdh-fc-act" href="' + esc(story.video.url) + '" target="_blank" rel="noopener">' + icon('play') + 'Watch</a>' : '') +
        '<a class="wdh-fc-act" href="' + esc(story.url) + '" target="_blank" rel="noopener">Read ' + icon('arrow-up-right-from-square') + '</a>' +
        shareButton('', story.title, story.url)
    });
  }

  function deadlineCard() {
    var list = deadlines(new Date());
    var pas1 = list.filter(function (d) { return d.kind === 'pas1'; })[0];
    var tax = list.filter(function (d) { return d.kind === 'tax'; })[0];
    var lead = pas1 && pas1.days <= 60 ? pas1 : list[0];
    if (!lead) return '';
    var also = lead !== tax && tax && tax.days <= 60 ? tax.title.replace(' due', '') + ' due ' + shortDay(tax.date) : '';
    var cta = lead.kind === 'pas1' || lead.kind === 'tax'
      ? '<a class="wdh-fc-act" href="https://njpropertytaxrelief.com/anchor-estimator.html">Check what I qualify for ' + icon('arrow-right') + '</a>'
      : '<a class="wdh-fc-act" href="/property-tax-appeal.html">How appeals work ' + icon('arrow-right') + '</a>';
    return feedCard({
      tabs: 'home town',
      meta: metaRow(iconBadge('calendar-day', lead.soon), 'Deadline', [lead.days === 0 ? 'Today' : lead.days + ' ' + plural(lead.days, 'day', 'days') + ' left'], lead.soon),
      title: esc(lead.kind === 'pas1' ? 'File your PAS-1 by ' + shortDay(lead.date) : lead.title + ', ' + shortDay(lead.date)),
      facts: lead.kind === 'pas1' ? ['ANCHOR, Stay NJ and Senior Freeze', esc(also)] : [esc(lead.note), esc(also)],
      source: sourceLine('NJ Division of Taxation'),
      actions: cta
    });
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
      if (previous.assessed && current.assessed && previous.assessed !== current.assessed) changes.push('Assessment ' + money(previous.assessed) + ' → ' + money(current.assessed));
      if (previous.tax && current.tax && previous.tax !== current.tax) changes.push('Tax ' + money(previous.tax) + ' → ' + money(current.tax));
      if (previous.score != null && current.score != null && previous.score !== current.score) changes.push('Watchdog Score ' + previous.score + ' → ' + current.score);
    }
    return feedCard({
      tabs: 'home',
      meta: metaRow(iconBadge('house'), home.isHome ? 'Your home' : 'Your saved home', [home.address]),
      title: esc(changes.length ? 'Your home record changed' : previous ? 'No changes to your home' : 'Where your home stands'),
      facts: [
        home.score != null ? 'Watchdog Score ' + home.score : '',
        home.assessed ? 'Assessed ' + shortMoney(home.assessed) : '',
        home.tax ? 'Tax ' + money(home.tax) + (medianTax ? ' (town ' + money(medianTax) + ')' : '') : ''
      ],
      note: changes.length ? esc(changes.join(' · ')) : '',
      actions: '<a class="wdh-fc-act" href="/home">Open my home ' + icon('arrow-right') + '</a>'
    });
  }

  function chartSvg(series) {
    var pts = series.slice(-10);
    if (pts.length < 2) return '';
    var W = 600, H = 120, L = 44, R = 16, T = 18, B = 26;
    var vals = pts.map(function (p) { return p[1]; });
    var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
    var pad = Math.max((max - min) * 0.15, 0.05);
    var lo = min - pad, hi = max + pad;
    function x(i) { return L + i * (W - L - R) / (pts.length - 1); }
    function y(v) { return T + (hi - v) * (H - T - B) / (hi - lo); }
    var step = (hi - lo) / 2, grid = '';
    for (var g = 0; g <= 2; g += 1) {
      var gv = lo + step * g;
      grid += '<line class="wdh-c-grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(gv).toFixed(1) + '" y2="' + y(gv).toFixed(1) + '"></line>' +
        '<text class="wdh-c-axis" x="0" y="' + (y(gv) + 4).toFixed(1) + '">' + gv.toFixed(2) + '</text>';
    }
    var line = pts.map(function (p, i) { return x(i).toFixed(1) + ',' + y(p[1]).toFixed(1); }).join(' ');
    var last = pts.length - 1;
    var labels = '<text class="wdh-c-val wdh-c-end" x="' + (x(last) - 2).toFixed(1) + '" y="' + (y(vals[last]) - 10).toFixed(1) + '">' + vals[last].toFixed(3) + '</text>';
    var dots = '<circle class="wdh-c-pt" cx="' + x(last).toFixed(1) + '" cy="' + y(vals[last]).toFixed(1) + '" r="5"></circle>';
    var hits = pts.map(function (p, i) { return '<circle class="wdh-c-hit" cx="' + x(i).toFixed(1) + '" cy="' + y(p[1]).toFixed(1) + '" r="14"><title>' + p[0] + ': ' + p[1].toFixed(3) + '</title></circle>'; }).join('');
    var years = pts.map(function (p, i) {
      if (i !== 0 && i !== last && i % 3 !== 0) return '';
      return '<text class="wdh-c-axis wdh-c-mid" x="' + x(i).toFixed(1) + '" y="' + (H - 4) + '">' + p[0] + '</text>';
    }).join('');
    // content-architecture: dynamic. Screen-reader summary of the chart, built from the town's tax-rate series.
    var summary = 'General tax rate from ' + pts[0][0] + ' to ' + pts[last][0] + ': from ' + vals[0].toFixed(3) + ' to ' + vals[last].toFixed(3) + '.';
    return '<svg class="wdh-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(summary) + '">' + grid +
      '<polyline class="wdh-c-line" points="' + line + '"></polyline>' + dots + labels + hits + years + '</svg>';
  }

  function pulseCard(feed) {
    var s = feed.sales, t = feed.tax, f = feed.fairness;
    var price = s && s.available && s.window && s.window.changePct != null ? s.window.changePct : null;
    var facts = [];
    if (s && s.available && s.window && s.window.median) facts.push('Median ' + shortMoney(s.window.median) + (price != null ? ' (' + signed(price) + ')' : ''));
    if (s && s.available && s.window && s.window.ppsfMedian) facts.push(money(s.window.ppsfMedian) + '/sq ft');
    if (t && t.available) facts.push('Tax rate ' + t.rate.toFixed(3) + (t.changePct != null ? ' (' + signed(t.changePct) + ')' : ''));
    if (f && f.available) facts.push('Fairness: ' + esc(upperFirst(String(f.band).toLowerCase())));
    if (!facts.length) return '';
    var headline = price != null && t && t.available && t.changePct != null
      ? (Math.abs(price) < 3 ? 'Prices held steady.' : price > 0 ? 'Prices rose.' : 'Prices dipped.') + ' ' + (t.changePct > 0 ? 'Taxes kept climbing.' : t.changePct < 0 ? 'Taxes came down.' : 'Taxes held flat.')
      : 'How ' + feed.town.name + ' is trending';
    return feedCard({
      tabs: 'town sales',
      meta: metaRow(iconBadge('chart-line'), 'Town pulse', [feed.town.name]),
      title: esc(headline),
      facts: facts,
      extra: t && t.available && t.series && t.series.length > 2 ? chartSvg(t.series) : '',
      source: sourceLine('NJ sales, tax rates and assessment ratios'),
      actions: '<a class="wdh-fc-act" href="/town-compare">Compare towns ' + icon('arrow-right') + '</a>'
    });
  }

  function rulesCard(feed) {
    var rules = feed.rules;
    if (!rules || !rules.available || !rules.items.length) return '';
    var source = rules.items.map(function (r) { return r.sourceUrl; }).filter(Boolean)[0];
    var n = rules.items.length;
    return feedCard({
      tabs: 'town',
      meta: metaRow(iconBadge('building-columns'), 'Town rules', ['Selling a home']),
      title: esc('Selling? Plan for ' + (n === 1 ? 'one certificate' : n === 2 ? 'two certificates' : n + ' certificates')),
      extra: '<ul class="wdh-check">' + rules.items.map(function (r) { return '<li><span class="wdh-check-mark">' + icon('check') + '</span><span>' + esc(r.title) + '</span></li>'; }).join('') + '</ul>',
      source: sourceLine(feed.town.name + ' official rules'),
      actions: source ? '<a class="wdh-fc-act" href="' + esc(source) + '" target="_blank" rel="noopener">Source ' + icon('arrow-up-right-from-square') + '</a>' : ''
    });
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
      if (fact && text) { fact.textContent = 'Today: ' + text; fact.hidden = false; tile.classList.add('has-fact'); }
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
    /* A reporter's story about a permit's exact address rides on that permit
       card; the rest are their own cards (three in "For you", all in "News"). */
    var news = newsItems(), stories = {}, used = {};
    permits.forEach(function (p, i) { var story = storyFor(p, news); if (story && !used[story.id]) { stories[i] = story; used[story.id] = true; } });
    var loose = news.filter(function (n) { return !used[n.id]; });
    var take = function (i) { return loose[i] ? newsCard(loose[i], i > 2) : ''; };
    if (permits[0]) cards.push(permitCard(permits[0], feed, stories[0]));
    cards.push(take(0));
    if (sales.length) cards.push(saleCard(sales, feed));
    if (radiusEmpty) cards.push(emptyRadiusCard());
    cards.push(deadlineCard());
    cards.push(take(1));
    cards.push(homeCard(feed));
    cards.push(gamesCard());
    if (permits[1]) cards.push(permitCard(permits[1], feed, stories[1]));
    cards.push(take(2));
    cards.push(pulseCard(feed));
    permits.slice(2).forEach(function (p, i) { if (stories[i + 2]) cards.push(permitCard(p, feed, stories[i + 2])); });
    var rest = permits.slice(2).filter(function (p, i) { return !stories[i + 2]; });
    if (rest.length) cards.push(permitListCard(rest, feed));
    cards.push(rulesCard(feed));
    for (var n = 3; n < loose.length; n += 1) cards.push(take(n));
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
      var show = state.tab === 'all' ? card.getAttribute('data-feed-extra') !== '1' : tabs.indexOf('all') !== -1 || tabs.indexOf(state.tab) !== -1;
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
    Array.prototype.forEach.call(document.querySelectorAll('#wdh-tabs .wdh-tab, #wdh-feednav .wdh-nav-item'), function (b) {
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

  /* Wide desktop: the left menu and right rail stay put under the site header
     (and the sticky search bar when it shows) while only the feed scrolls. */
  var stickyFrame = 0;
  function syncStickyTop() {
    stickyFrame = 0;
    var top = 0;
    ['wd-nav', 'ssearch'].forEach(function (id) {
      var el = $(id);
      if (!el) return;
      var cs = window.getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || (cs.position !== 'fixed' && cs.position !== 'sticky')) return;
      var r = el.getBoundingClientRect();
      if (r.height > 0 && r.top <= 4 && r.bottom > top && r.bottom < 240) top = r.bottom;
    });
    root.style.setProperty('--wdh-sticky-top', Math.round(top + 16) + 'px');
  }
  function queueStickyTop() { if (!stickyFrame) stickyFrame = window.requestAnimationFrame(syncStickyTop); }
  window.addEventListener('scroll', queueStickyTop, { passive: true });
  window.addEventListener('resize', queueStickyTop);

  /* Left feed menu (wide desktop): the signed-in person's saved places. */
  function renderPlaces() {
    var list = $('wdh-places-list'), empty = $('wdh-places-empty');
    if (!list || !empty) return;
    var places = state.places || [];
    empty.hidden = places.length > 0;
    list.hidden = !places.length;
    list.innerHTML = places.map(function (p) {
      var full = p.address + (p.town ? ', ' + p.town : '');
      return '<li><button type="button" class="wdh-place" data-open="' + esc(full) + '"><span class="wdh-ico">' + icon(p.isHome ? 'house' : 'building') + '</span>' +
        '<span class="wdh-place-t"><span class="wdh-place-a">' + esc(p.address) + '</span><span class="wdh-meta">' + esc(p.label) + '</span></span></button></li>';
    }).join('');
  }

  function render(reason) {
    root.setAttribute('data-state', 'ready');
    root.removeAttribute('aria-busy');
    renderHero();
    renderTiles();
    renderWeek();
    renderCards();
    renderGlance();
    renderPlaces();
    renderRadius();
    renderMap();
    if (reason !== 'cache') rememberSeen();
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
  function share(address, title, button, external) {
    var town = townName();
    var url = external || window.location.origin + '/?address=' + encodeURIComponent(address + (town ? ', ' + town : '') + ', NJ');
    if (navigator.share) {
      navigator.share({ title: title, text: title + ' (Watchdog)', url: url }).catch(function () {});
      return;
    }
    var done = function () {
      if (!button) return;
      button.classList.add('is-done');
      button.setAttribute('aria-label', 'Link copied');
      setTimeout(function () { button.classList.remove('is-done'); button.setAttribute('aria-label', 'Share ' + title); }, 1800);
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
    if ((el = target.closest('[data-share]'))) { event.preventDefault(); share(el.getAttribute('data-share'), el.getAttribute('data-share-title'), el, el.getAttribute('data-share-url') || ''); return; }
    if ((el = target.closest('#wdh-tabs .wdh-tab, #wdh-feednav .wdh-nav-item'))) {
      state.tab = el.getAttribute('data-tab') || 'all';
      applyTab();
      /* From the left menu, jump back to the top of the feed. */
      if (el.classList.contains('wdh-nav-item')) { var top = $('wdh-cards'); if (top && top.getBoundingClientRect().top < 0) top.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      return;
    }
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
    syncStickyTop();
    renderWhere();
    renderUpcoming();
    /* Paint the remembered feed right away, then refresh it from the network. */
    var guess = initialTown() || store(KEY_LAST);
    var remembered = rememberedFeed(typeof guess === 'string' ? guess : '');
    if (remembered) {
      state.feed = remembered;
      state.seen = store(KEY_SEEN + remembered.town.code);
      state.seenFor = remembered.town.code;
      render('cache');
    }
    loadHome().then(function (home) {
      state.home = home;
      var code = initialTown();
      if (home && home.pin) state.homePrev = store(KEY_HOME + home.pin);
      var feedLoad = load(code, remembered && (!code || code === remembered.town.code) ? 'refresh' : 'boot');
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
