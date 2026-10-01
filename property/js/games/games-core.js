/* Watchdog Games shared runtime: puzzle dates, saved progress, streaks,
   stats dialog, sharing and the next-puzzle countdown. Each game script
   (sold.js, town-shapes.js) and the /games hub use it.

   Progress lives in this browser only (localStorage, wrapped so private
   windows and blocked storage still play). A day's puzzle counts toward the
   streak only when it was finished on that day; archive plays are kept but
   never change streaks. */
(function () {
  'use strict';

  var LAUNCH = '2026-10-01';
  var ZONE = 'America/New_York';
  var MAX_GUESSES = 6;
  var KEY = 'wd-games:v1:';
  var DAY = 86400000;

  function dateIn(zone, when) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(when || new Date());
  }
  function today() { return dateIn(ZONE); }
  function addDays(date, n) { return new Date(Date.parse(date + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10); }
  function numberFor(date) { return Math.round((Date.parse(date + 'T00:00:00Z') - Date.parse(LAUNCH + 'T00:00:00Z')) / DAY) + 1; }
  function prettyDate(date) {
    return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(date + 'T00:00:00Z'));
  }

  function read(game) {
    try {
      var raw = window.localStorage.getItem(KEY + game);
      var data = raw ? JSON.parse(raw) : null;
      return data && data.days ? data : { days: {} };
    } catch (e) { return { days: {} }; }
  }
  function write(game, data) {
    try { window.localStorage.setItem(KEY + game, JSON.stringify(data)); } catch (e) { /* storage blocked: play on */ }
  }
  function getDay(game, date) { return read(game).days[date] || null; }
  function saveDay(game, date, record) {
    var data = read(game);
    var prev = data.days[date] || {};
    // "live" means the player worked on this puzzle on its own day.
    record.live = Boolean(prev.live || date === today());
    data.days[date] = record;
    write(game, data);
    return record;
  }

  function stats(game) {
    var days = read(game).days;
    var live = Object.keys(days).filter(function (d) { return days[d].done && days[d].live; }).sort();
    var wins = live.filter(function (d) { return days[d].won; });
    var dist = [0, 0, 0, 0, 0, 0];
    wins.forEach(function (d) { var n = days[d].guesses.length; if (n >= 1 && n <= MAX_GUESSES) dist[n - 1]++; });
    var max = 0, run = 0, prev = null;
    live.forEach(function (d) {
      if (days[d].won) { run = prev && addDays(prev, 1) === d && days[prev].won ? run + 1 : 1; max = Math.max(max, run); }
      else run = 0;
      prev = d;
    });
    var current = 0;
    var cursor = days[today()] && days[today()].done ? today() : addDays(today(), -1);
    while (days[cursor] && days[cursor].live && days[cursor].won) { current++; cursor = addDays(cursor, -1); }
    return { played: live.length, wins: wins.length, pct: live.length ? Math.round(wins.length / live.length * 100) : 0, current: current, max: max, dist: dist };
  }

  // The API sends answers reversed and base64 encoded (a spoiler guard only).
  function decode(k) {
    try { return window.atob(k).split('.')[0].split('').reverse().join(''); } catch (e) { return ''; }
  }

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  var toastTimer;
  function toast(message) {
    var node = document.getElementById('wg-toast');
    if (!node) return;
    node.textContent = message;
    node.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { node.hidden = true; }, 2400);
  }

  function share(text) {
    if (navigator.share && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) {
      navigator.share({ text: text }).catch(function () {});
      return;
    }
    var done = function () { toast('Copied. Paste it anywhere.'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
    } else { fallbackCopy(text); done(); }
  }
  function fallbackCopy(text) {
    var area = el('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    try { document.execCommand('copy'); } catch (e) { /* nothing else to try */ }
    area.remove();
  }

  function secondsToMidnight() {
    var parts = {};
    new Intl.DateTimeFormat('en-US', { timeZone: ZONE, hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(new Date()).forEach(function (p) { parts[p.type] = Number(p.value); });
    return Math.max(0, 86400 - ((parts.hour % 24) * 3600 + parts.minute * 60 + parts.second));
  }
  function countdown(node) {
    if (!node) return;
    var tick = function () {
      var s = secondsToMidnight();
      var pad = function (n) { return String(n).padStart(2, '0'); };
      node.textContent = pad(Math.floor(s / 3600)) + ':' + pad(Math.floor(s % 3600 / 60)) + ':' + pad(s % 60);
    };
    tick();
    setInterval(tick, 1000);
  }

  function renderStats(game, highlight) {
    var s = stats(game);
    var set = function (id, v) { var n = document.getElementById(id); if (n) n.textContent = String(v); };
    set('wg-stat-played', s.played);
    set('wg-stat-pct', s.pct);
    set('wg-stat-streak', s.current);
    set('wg-stat-max', s.max);
    var list = document.getElementById('wg-dist');
    if (!list) return;
    list.textContent = '';
    var top = Math.max.apply(null, s.dist.concat([1]));
    s.dist.forEach(function (count, i) {
      var li = el('li', highlight === i + 1 ? 'is-today' : '');
      li.appendChild(el('b', '', String(i + 1)));
      var bar = el('span', '', String(count));
      bar.style.width = Math.max(8, Math.round(count / top * 100)) + '%';
      li.appendChild(bar);
      list.appendChild(li);
    });
  }

  function wireStats(game) {
    var dialog = document.getElementById('wg-stats-dialog');
    var open = document.getElementById('wg-open-stats');
    if (!dialog || !open) return function () {};
    var show = function (highlight) {
      renderStats(game, highlight);
      if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
    };
    open.addEventListener('click', function () { show(); });
    dialog.querySelector('.wg-close').addEventListener('click', function () { dialog.close ? dialog.close() : dialog.removeAttribute('open'); });
    dialog.addEventListener('click', function (e) { if (e.target === dialog && dialog.close) dialog.close(); });
    return show;
  }

  // Archive picker: any day from launch through today.
  function wireArchive(current) {
    var input = document.getElementById('wg-archive-date');
    var form = document.getElementById('wg-archive');
    if (!input || !form) return;
    input.min = LAUNCH;
    input.max = today();
    input.value = current;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = input.value;
      if (!v || v < LAUNCH || v > today()) return;
      window.location.search = v === today() ? '' : '?date=' + v;
    });
  }

  function requestedDate() {
    var v = new URLSearchParams(window.location.search).get('date') || '';
    return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '';
  }

  function loadPuzzle(game) {
    var date = requestedDate();
    var url = '/api/watchdog-games?game=' + encodeURIComponent(game) + (date ? '&date=' + date : '');
    return fetch(url, { headers: { Accept: 'application/json' } }).then(function (r) {
      if (r.ok) return r.json();
      if (r.status === 404 && date) { window.location.search = ''; }
      throw new Error('puzzle ' + r.status);
    });
  }

  window.WatchdogGames = {
    LAUNCH: LAUNCH,
    MAX_GUESSES: MAX_GUESSES,
    today: today,
    numberFor: numberFor,
    prettyDate: prettyDate,
    getDay: getDay,
    saveDay: saveDay,
    stats: stats,
    decode: decode,
    el: el,
    toast: toast,
    share: share,
    countdown: countdown,
    wireStats: wireStats,
    wireArchive: wireArchive,
    loadPuzzle: loadPuzzle
  };
})();
