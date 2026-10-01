/* Watchdog Games shared runtime: puzzle dates, saved progress, streaks,
   splash screen, help and results sheets, toasts, sharing and the
   next-puzzle countdown. Every game script in /property/js/games/ and the
   /games hub use it; games-board.js adds the signed-in leaderboard.

   Progress lives in this browser only (localStorage, wrapped so private
   windows and blocked storage still play). A day's puzzle counts toward the
   streak only when it was played on that day; archive plays are kept but
   never change streaks. */
(function () {
  'use strict';

  var LAUNCH = '2026-10-01';
  var ZONE = 'America/New_York';
  var MAX_GUESSES = 6;
  var KEY = 'wd-games:v1:';
  var DAY = 86400000;
  var calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Every game, in hub order. streak: 'win' counts days won in a row, 'play'
  // counts days played in a row (games scored in points). dist: the buckets
  // the stats sheet charts.
  var GAMES = [
    { id: 'pin-drop', name: 'Pin Drop', streak: 'play', avg: true, dist: ['0-19', '20-39', '40-59', '60-79', '80-100'] },
    { id: 'sold', name: 'Sold!', streak: 'win', dist: ['1', '2', '3', '4', '5', '6'] },
    { id: 'blocks', name: 'Blocks', streak: 'win', dist: ['0', '1', '2', '3'] },
    { id: 'town-shapes', name: 'Town Shapes', streak: 'win', dist: ['1', '2', '3', '4', '5', '6'] },
    { id: 'lineup', name: 'Lineup', streak: 'win', dist: ['1', '2', '3', '4'] },
    { id: 'fair-or-unfair', name: 'Fair or Unfair', streak: 'play', avg: true, dist: ['0', '1', '2', '3', '4', '5'] }
  ];
  var SIX_TRY_POINTS = [100, 85, 70, 55, 40, 25];
  function config(game) { return GAMES.filter(function (g) { return g.id === game; })[0] || GAMES[1]; }
  // Points (0-100) for a finished day, the same scale the leaderboard uses.
  function pointsOf(game, day) {
    if (!day || !day.done) return 0;
    if (typeof day.points === 'number') return day.points;
    if (game === 'sold' || game === 'town-shapes') return day.won ? SIX_TRY_POINTS[day.guesses.length - 1] || 0 : 0;
    return 0;
  }
  // Which stats bucket a finished day lands in (0-based), or -1.
  function bucketOf(game, day) {
    if (typeof day.bucket === 'number') return day.bucket;
    if ((game === 'sold' || game === 'town-shapes') && day.won) return day.guesses.length - 1;
    return -1;
  }

  function dateIn(zone, when) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(when || new Date());
  }
  function today() { return dateIn(ZONE); }
  function addDays(date, n) { return new Date(Date.parse(date + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10); }
  function numberFor(date) { return Math.round((Date.parse(date + 'T00:00:00Z') - Date.parse(LAUNCH + 'T00:00:00Z')) / DAY) + 1; }
  function prettyDate(date, withDay) {
    var opts = { timeZone: 'UTC', month: 'long', day: 'numeric', year: 'numeric' };
    if (withDay) opts.weekday = 'long';
    return new Intl.DateTimeFormat('en-US', opts).format(new Date(date + 'T00:00:00Z'));
  }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, calm ? 0 : ms); }); }

  // ---------- saved progress ----------
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
    if (record.done && !prev.done) {
      setTimeout(function () {
        document.dispatchEvent(new CustomEvent('wd-game:finished', { detail: { game: game, date: date } }));
      }, 0);
    }
    return record;
  }
  function markDay(game, date, fields) {
    var data = read(game);
    if (!data.days[date]) return;
    Object.keys(fields).forEach(function (k) { data.days[date][k] = fields[k]; });
    write(game, data);
  }

  function stats(game) {
    var cfg = config(game);
    var days = read(game).days;
    var live = Object.keys(days).filter(function (d) { return days[d].done && days[d].live; }).sort();
    var counts = function (d) { return cfg.streak === 'play' ? true : days[d].won; };
    var wins = live.filter(function (d) { return days[d].won; });
    var dist = cfg.dist.map(function () { return 0; });
    live.forEach(function (d) { var b = bucketOf(game, days[d]); if (b >= 0 && b < dist.length) dist[b]++; });
    var max = 0, run = 0, prev = null;
    live.forEach(function (d) {
      if (counts(d)) { run = prev && addDays(prev, 1) === d && counts(prev) ? run + 1 : 1; max = Math.max(max, run); }
      else run = 0;
      prev = d;
    });
    var current = 0;
    var cursor = days[today()] && days[today()].done ? today() : addDays(today(), -1);
    while (days[cursor] && days[cursor].done && days[cursor].live && counts(cursor)) { current++; cursor = addDays(cursor, -1); }
    var total = live.reduce(function (sum, d) { return sum + pointsOf(game, days[d]); }, 0);
    return {
      played: live.length,
      wins: wins.length,
      pct: live.length ? Math.round(wins.length / live.length * 100) : 0,
      avg: live.length ? Math.round(total / live.length) : 0,
      current: current,
      max: max,
      dist: dist
    };
  }

  // The API sends answers reversed and base64 encoded (a spoiler guard only).
  function decode(k) {
    try { return window.atob(k).split('.')[0].split('').reverse().join(''); } catch (e) { return ''; }
  }

  // Structured answers: reversed ASCII JSON, base64 encoded.
  function decodeData(k) {
    try { return JSON.parse(window.atob(k).split('').reverse().join('')); } catch (e) { return null; }
  }

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }
  function icon(id) {
    var tpl = document.getElementById(id);
    return tpl ? tpl.content.firstElementChild.cloneNode(true) : null;
  }
  function replay(node, cls) {
    if (!node || calm) return;
    node.classList.remove(cls);
    void node.offsetWidth;
    node.classList.add(cls);
  }

  var toastTimer;
  function toast(message, ms) {
    var node = document.getElementById('gm-toast');
    if (!node) return;
    node.textContent = message;
    node.hidden = false;
    replay(node, 'is-in');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { node.hidden = true; }, ms || 1800);
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
  var countdownStarted = false;
  function countdown(node) {
    if (!node || countdownStarted) return;
    countdownStarted = true;
    var tick = function () {
      var s = secondsToMidnight();
      var pad = function (n) { return String(n).padStart(2, '0'); };
      node.textContent = pad(Math.floor(s / 3600)) + ':' + pad(Math.floor(s % 3600 / 60)) + ':' + pad(s % 60);
    };
    tick();
    setInterval(tick, 1000);
  }

  // ---------- sheets (help, results) ----------
  function openSheet(id) {
    var d = document.getElementById(id);
    if (!d) return;
    if (typeof d.showModal === 'function') { if (!d.open) d.showModal(); } else d.setAttribute('open', '');
  }
  function closeSheet(d) { if (d.close) d.close(); else d.removeAttribute('open'); }
  document.querySelectorAll('.gm-sheet').forEach(function (d) {
    var close = d.querySelector('.gm-close');
    if (close) close.addEventListener('click', function () { closeSheet(d); });
    d.addEventListener('click', function (e) { if (e.target === d) closeSheet(d); });
  });

  // highlight: the 1-based bucket today's result landed in, if any.
  function renderStats(game, highlight) {
    var cfg = config(game);
    var s = stats(game);
    var set = function (id, v) { var n = document.getElementById(id); if (n) n.textContent = String(v); };
    set('gm-stat-played', s.played);
    set('gm-stat-pct', cfg.avg ? s.avg : s.pct);
    set('gm-stat-pct-label', cfg.avg ? 'Avg score' : 'Win %');
    set('gm-stat-streak', s.current);
    set('gm-stat-max', s.max);
    var list = document.getElementById('gm-dist');
    if (list) {
      list.textContent = '';
      var top = Math.max.apply(null, s.dist.concat([1]));
      s.dist.forEach(function (count, i) {
        var li = el('li', highlight === i + 1 ? 'is-today' : '');
        li.appendChild(el('b', '', cfg.dist[i]));
        var bar = el('span', '', String(count));
        bar.style.width = Math.max(8, Math.round(count / top * 100)) + '%';
        li.appendChild(bar);
        list.appendChild(li);
      });
      list.classList.toggle('is-wide', cfg.dist[0].length > 2);
    }
    wireNextGame(game);
    document.dispatchEvent(new CustomEvent('wd-game:results', { detail: { game: game } }));
  }

  // "Up next" on the results sheet: the first game not finished today.
  function nextGame(game) {
    var d = today();
    var open = GAMES.filter(function (g) { var day = getDay(g.id, d); return g.id !== game && !(day && day.done); });
    return open[0] || null;
  }
  function wireNextGame(game) {
    var link = document.getElementById('gm-next-game');
    if (!link) return;
    var next = nextGame(game);
    if (next) {
      link.href = '/games/' + next.id;
      link.textContent = 'Play ' + next.name;
    } else {
      link.href = '/games';
      link.textContent = 'All games';
    }
  }

  // ---------- splash ----------
  // Shown on a fresh visit to today's puzzle. Resolves when the player taps Play.
  function splash(puzzle, inProgress) {
    var node = document.getElementById('gm-splash');
    if (!node) return Promise.resolve();
    document.getElementById('gm-splash-date').textContent = prettyDate(puzzle.date, true);
    document.getElementById('gm-splash-no').textContent = 'No. ' + puzzle.number;
    var play = document.getElementById('gm-play');
    if (inProgress) play.textContent = 'Continue';
    node.hidden = false;
    document.documentElement.style.overflow = 'hidden';
    document.getElementById('gm-splash-help').addEventListener('click', function () { openSheet('gm-help'); });
    return new Promise(function (resolve) {
      play.addEventListener('click', function () {
        node.hidden = true;
        document.documentElement.style.overflow = '';
        resolve();
      }, { once: true });
    });
  }

  // Archive picker: any day from launch through today.
  function wireArchive(current) {
    var input = document.getElementById('gm-archive-date');
    var form = document.getElementById('gm-archive');
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
      if (r.ok) return r.json().then(function (p) { window.WatchdogGames.current = p; return p; });
      if (r.status === 404 && date) { window.location.search = ''; }
      throw new Error('puzzle ' + r.status);
    });
  }

  // Wire the app bar buttons every game page shares.
  function wireBar(game) {
    var help = document.getElementById('gm-help-btn');
    var statsBtn = document.getElementById('gm-stats-btn');
    if (help) help.addEventListener('click', function () { openSheet('gm-help'); });
    if (statsBtn) statsBtn.addEventListener('click', function () { renderStats(game); openSheet('gm-results'); });
  }

  window.WatchdogGames = {
    GAMES: GAMES,
    config: config,
    pointsOf: pointsOf,
    nextGame: nextGame,
    markDay: markDay,
    LAUNCH: LAUNCH,
    MAX_GUESSES: MAX_GUESSES,
    calm: calm,
    today: today,
    numberFor: numberFor,
    prettyDate: prettyDate,
    wait: wait,
    getDay: getDay,
    saveDay: saveDay,
    stats: stats,
    renderStats: renderStats,
    decode: decode,
    decodeData: decodeData,
    el: el,
    icon: icon,
    replay: replay,
    toast: toast,
    share: share,
    countdown: countdown,
    openSheet: openSheet,
    splash: splash,
    wireBar: wireBar,
    wireArchive: wireArchive,
    loadPuzzle: loadPuzzle
  };
})();
