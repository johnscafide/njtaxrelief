/* Town Shapes: name the New Jersey town from its outline in six tries.
   Markup and copy live in /property/games/town-shapes/index.html. The guess
   list and distances come from /property/data/games/towns.json; the day's
   outline comes from /api/watchdog-games. */
(function () {
  'use strict';
  var G = window.WatchdogGames;
  if (!G) return;

  var GAME = 'town-shapes';
  var CLOSE_MILES = 10;
  var MAX_SUGGEST = 8;
  var POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  var number = new Intl.NumberFormat('en-US');
  var $ = function (id) { return document.getElementById(id); };
  var form = $('wg-form');
  var input = $('wg-input');
  var submit = $('wg-submit');
  var note = $('wg-form-note');
  var list = $('wg-guesses');
  var suggest = $('wg-suggest');
  var towns = [], byCode = {}, matches = [], active = -1, picked = null;
  var puzzle, answer, state;
  var showStats = G.wireStats(GAME);

  function fill(field, value) {
    document.querySelectorAll('[data-f="' + field + '"]').forEach(function (node) { node.textContent = value; });
  }
  function fold(text) { return String(text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); }
  function label(t) { return t.n + ', ' + t.k + ' County'; }

  function miles(a, b) {
    var r = Math.PI / 180;
    var dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 3958.8 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }
  function direction(from, to) {
    var r = Math.PI / 180;
    var y = Math.sin((to.lon - from.lon) * r) * Math.cos(to.lat * r);
    var x = Math.cos(from.lat * r) * Math.sin(to.lat * r) - Math.sin(from.lat * r) * Math.cos(to.lat * r) * Math.cos((to.lon - from.lon) * r);
    var deg = (Math.atan2(y, x) / r + 360) % 360;
    return POINTS[Math.round(deg / 45) % 8];
  }
  function feedback(code) {
    if (code === answer.c) return { text: 'Got it', win: true, close: false, short: 'Got it' };
    var guess = byCode[code];
    var d = Math.max(1, Math.round(miles(guess, answer)));
    var where = d + ' mi ' + direction(guess, answer);
    var same = guess.k === answer.k ? ', same county' : '';
    return { text: where + same, win: false, close: d <= CLOSE_MILES, short: where };
  }

  // ---------- suggestions ----------
  function closeSuggest() {
    suggest.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    active = -1;
  }
  function choose(t) {
    picked = t;
    input.value = label(t);
    closeSuggest();
  }
  function highlight(i) {
    active = i;
    Array.prototype.forEach.call(suggest.children, function (li, n) { li.setAttribute('aria-selected', n === i ? 'true' : 'false'); });
    if (i >= 0 && suggest.children[i]) {
      input.setAttribute('aria-activedescendant', suggest.children[i].id);
      suggest.children[i].scrollIntoView({ block: 'nearest' });
    }
  }
  function updateSuggest() {
    picked = null;
    var q = fold(input.value);
    suggest.textContent = '';
    if (!q) { closeSuggest(); return; }
    var guessed = {};
    state.guesses.forEach(function (c) { guessed[c] = true; });
    var starts = [], contains = [];
    towns.forEach(function (t) {
      if (guessed[t.c]) return;
      var name = t.fold;
      if (name.indexOf(q) === 0 || name.replace(/^(city|town|township|borough|village) of /, '').indexOf(q) === 0) starts.push(t);
      else if (name.indexOf(' ' + q) > -1 || (q.length > 2 && name.indexOf(q) > -1)) contains.push(t);
    });
    matches = starts.concat(contains).slice(0, MAX_SUGGEST);
    if (!matches.length) { closeSuggest(); return; }
    matches.forEach(function (t, i) {
      var li = G.el('li', '', t.n);
      li.id = 'wg-opt-' + i;
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', 'false');
      li.appendChild(G.el('span', '', t.k));
      li.addEventListener('mousedown', function (e) { e.preventDefault(); choose(t); input.focus(); });
      suggest.appendChild(li);
    });
    suggest.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    highlight(0);
  }
  // Close the list shortly after the field loses focus, but never let that
  // timer close a list opened by typing that started after focus came back.
  var blurTimer;
  input.addEventListener('input', function () { clearTimeout(blurTimer); updateSuggest(); });
  input.addEventListener('focus', function () { clearTimeout(blurTimer); });
  input.addEventListener('blur', function () { blurTimer = setTimeout(closeSuggest, 120); });
  input.addEventListener('keydown', function (e) {
    if (suggest.hidden) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); highlight(Math.min(matches.length - 1, active + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); highlight(Math.max(0, active - 1)); }
    else if (e.key === 'Escape') { closeSuggest(); }
    else if (e.key === 'Enter' && active >= 0 && matches[active]) { e.preventDefault(); choose(matches[active]); }
  });

  function resolveTyped() {
    if (picked) return picked;
    var q = fold(input.value);
    var exact = towns.filter(function (t) { return t.fold === q || fold(label(t)) === q; });
    return exact.length === 1 ? exact[0] : null;
  }

  // ---------- render ----------
  function renderGuesses() {
    list.textContent = '';
    for (var i = 0; i < G.MAX_GUESSES; i++) {
      var code = state.guesses[i];
      var row = G.el('li', 'wg-guess');
      row.appendChild(G.el('span', 'wg-guess-n', String(i + 1)));
      if (code == null) {
        row.className += ' is-empty';
        row.appendChild(G.el('span', 'wg-guess-v', ''));
        row.appendChild(G.el('span', 'wg-guess-r', ''));
      } else {
        var f = feedback(code);
        if (f.win) row.className += ' is-win';
        else if (f.close) row.className += ' is-close';
        row.appendChild(G.el('span', 'wg-guess-v', label(byCode[code])));
        row.appendChild(G.el('span', 'wg-guess-r', f.text));
      }
      list.appendChild(row);
    }
  }

  function renderHints() {
    var open = state.done ? 5 : Math.min(5, state.guesses.length);
    document.querySelectorAll('[data-hint]').forEach(function (li) {
      var on = Number(li.getAttribute('data-hint')) <= open;
      li.classList.toggle('is-open', on);
      li.querySelector('.wg-lock').hidden = on;
      li.querySelector('.wg-open').hidden = !on;
    });
  }

  function shareText() {
    var lines = ['Watchdog Town Shapes #' + puzzle.number + ': ' + (state.won ? state.guesses.length : 'X') + '/' + G.MAX_GUESSES];
    state.guesses.forEach(function (c, i) { lines.push((i + 1) + '. ' + feedback(c).short); });
    lines.push('https://www.watchdogindex.com/games/town-shapes');
    return lines.join('\n');
  }

  function renderResult() {
    var done = state.done;
    $('wg-result').hidden = !done;
    $('wg-learn').hidden = !done;
    $('wg-shape-box').classList.toggle('is-done', done);
    input.disabled = submit.disabled = done;
    form.hidden = done;
    if (!done) return;
    $('wg-result-kicker').textContent = state.won ? 'Solved' : 'Out of guesses';
    $('wg-answer').textContent = 'It was ' + label(answer) + '.';
    $('wg-shape').setAttribute('aria-label', 'Outline of ' + answer.n);
    if (state.won) {
      $('wg-result-line').textContent = 'You got it in ' + state.guesses.length + ' of ' + G.MAX_GUESSES + ' guesses.';
    } else {
      var best = Math.min.apply(null, state.guesses.map(function (c) { return miles(byCode[c], answer); }));
      $('wg-result-line').textContent = 'Your closest guess was ' + Math.max(1, Math.round(best)) + ' miles away.';
    }
    $('wg-next-wrap').hidden = puzzle.date !== G.today();
  }

  function render() {
    renderGuesses();
    renderHints();
    renderResult();
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!puzzle || state.done) return;
    var t = resolveTyped();
    if (!t) { note.textContent = 'Pick a town from the list.'; return; }
    if (state.guesses.indexOf(t.c) > -1) { note.textContent = 'You already guessed that one.'; return; }
    note.textContent = '';
    state.guesses.push(t.c);
    state.won = t.c === answer.c;
    state.done = state.won || state.guesses.length >= G.MAX_GUESSES;
    G.saveDay(GAME, puzzle.date, state);
    input.value = '';
    picked = null;
    closeSuggest();
    render();
    if (state.done) {
      $('wg-result').scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (puzzle.date === G.today()) setTimeout(function () { showStats(state.won ? state.guesses.length : null); }, 900);
    } else {
      input.focus();
    }
  });

  $('wg-share').addEventListener('click', function () { G.share(shareText()); });

  Promise.all([
    G.loadPuzzle(GAME),
    fetch('/property/data/games/towns.json').then(function (r) { if (!r.ok) throw new Error('towns ' + r.status); return r.json(); })
  ]).then(function (res) {
    puzzle = res[0];
    towns = res[1].towns.map(function (t) { t.fold = fold(t.n); byCode[t.c] = t; return t; });
    answer = byCode[G.decode(puzzle.k)];
    if (!answer) throw new Error('bad answer');
    var hints = puzzle.hints;
    $('wg-shape').setAttribute('viewBox', puzzle.view_box);
    $('wg-shape').querySelector('path').setAttribute('d', puzzle.path);
    fill('type', hints.type.toLowerCase());
    fill('county', hints.county);
    fill('population', number.format(hints.population));
    fill('sq', String(hints.sq_miles));
    fill('rate-year', String(hints.rate_year));
    fill('rate', hints.tax_rate == null ? 'not on file' : '$' + hints.tax_rate.toFixed(3));
    fill('letter', hints.first_letter);
    var past = puzzle.date !== G.today();
    $('wg-meta').textContent = (past ? 'Past puzzle #' : 'Puzzle #') + puzzle.number + ', ' + G.prettyDate(puzzle.date);
    state = G.getDay(GAME, puzzle.date) || { guesses: [], done: false, won: false };
    state.guesses = state.guesses.filter(function (c) { return byCode[c]; });
    input.disabled = submit.disabled = state.done;
    G.wireArchive(puzzle.date);
    G.countdown($('wg-next'));
    render();
  }).catch(function () {
    $('wg-meta').textContent = 'Today\'s town did not load. Refresh to try again.';
  });
})();
