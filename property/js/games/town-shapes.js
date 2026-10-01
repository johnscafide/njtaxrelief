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
  var SPAN_MILES = 170; // roughly Cape May Point to High Point
  var MAX_SUGGEST = 8;
  var PRAISE = ['Local legend', 'Map reader', 'Well traveled', 'Right on', 'Found it', 'Just made it'];
  var number = new Intl.NumberFormat('en-US');
  var $ = function (id) { return document.getElementById(id); };
  var form = $('gm-form');
  var input = $('gm-input');
  var submit = $('gm-submit');
  var rows = $('gm-rows');
  var suggest = $('gm-suggest');
  var towns = [], byCode = {}, matches = [], active = -1, picked = null;
  var puzzle, answer, state, busy = false;

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
  function bearing(from, to) {
    var r = Math.PI / 180;
    var y = Math.sin((to.lon - from.lon) * r) * Math.cos(to.lat * r);
    var x = Math.cos(from.lat * r) * Math.sin(to.lat * r) - Math.sin(from.lat * r) * Math.cos(to.lat * r) * Math.cos((to.lon - from.lon) * r);
    return (Math.atan2(y, x) / r + 360) % 360;
  }
  var POINTS = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
  function feedback(code) {
    if (code === answer.c) return { win: true, close: false, d: 0, pct: 100 };
    var guess = byCode[code];
    var d = Math.max(1, Math.round(miles(guess, answer)));
    return { win: false, close: d <= CLOSE_MILES, d: d, deg: bearing(guess, answer), pct: Math.max(0, Math.round((1 - d / SPAN_MILES) * 100)) };
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
      li.id = 'gm-opt-' + i;
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
  function rowNode(i) {
    var row = $('gm-row-tpl').content.firstElementChild.cloneNode(true);
    row.querySelector('.gm-row-n').textContent = String(i + 1);
    var code = state.guesses[i];
    if (code == null) {
      if (i === state.guesses.length && !state.done) row.classList.add('is-next');
      return row;
    }
    var t = byCode[code], f = feedback(code);
    row.classList.add(f.win ? 'is-win' : f.close ? 'is-close' : 'is-miss');
    var v = row.querySelector('.gm-row-v');
    v.textContent = t.n;
    v.appendChild(G.el('small', '', t.k + ' County'));
    var parts = row.querySelectorAll('.gm-row-r');
    if (f.win) {
      parts[0].textContent = 'Got it';
      parts[1].appendChild(G.icon('gm-ico-check'));
      parts[1].setAttribute('aria-label', 'Correct');
    } else {
      parts[0].textContent = f.d + ' mi';
      var arrow = G.icon('gm-ico-arrow');
      arrow.style.transform = 'rotate(' + Math.round(f.deg) + 'deg)';
      parts[1].appendChild(arrow);
      parts[1].appendChild(document.createTextNode(f.pct + '%'));
      parts[1].setAttribute('aria-label', f.d + ' miles, head ' + POINTS[Math.round(f.deg / 45) % 8] + ', ' + f.pct + ' percent close');
    }
    return row;
  }

  function renderRows(revealIndex) {
    rows.textContent = '';
    for (var i = 0; i < G.MAX_GUESSES; i++) {
      var row = rowNode(i);
      if (i === revealIndex) row.classList.add('is-reveal');
      rows.appendChild(row);
    }
  }

  function renderClues(newest) {
    var open = state.done ? 5 : Math.min(5, state.guesses.length);
    document.querySelectorAll('[data-clue]').forEach(function (chip) {
      var n = Number(chip.getAttribute('data-clue'));
      var on = n <= open;
      chip.classList.toggle('is-open', on);
      var b = chip.querySelector('b');
      b.textContent = on ? b.getAttribute('data-value') : '?';
      if (n === newest && on) G.replay(chip, 'is-new');
    });
  }

  function shareText() {
    var lines = ['Watchdog Town Shapes No. ' + puzzle.number + ': ' + (state.won ? state.guesses.length : 'X') + '/' + G.MAX_GUESSES];
    state.guesses.forEach(function (c, i) {
      var f = feedback(c);
      lines.push((i + 1) + '. ' + (f.win ? 'Got it' : f.d + ' mi, ' + f.pct + '% close'));
    });
    lines.push('https://www.watchdogindex.com/games/town-shapes');
    return lines.join('\n');
  }

  function renderDone() {
    var done = state.done;
    $('gm-done').hidden = !done;
    $('gm-dock').hidden = done;
    $('gm-map').classList.toggle('is-done', done);
    $('gm-map-label').hidden = !done;
    input.disabled = submit.disabled = done;
    if (!done) return;
    $('gm-map-label').textContent = answer.n;
    $('gm-done-answer').textContent = answer.n;
    $('gm-outline').parentNode.setAttribute('aria-label', 'Outline of ' + answer.n);
    $('gm-results-title').textContent = state.won ? 'You found it.' : 'Not this time.';
    $('gm-r-answer').textContent = answer.n;
    var facts = answer.k + ' County. ' + number.format(answer.pop) + ' people.';
    if (state.won) $('gm-r-sub').textContent = 'Solved in ' + state.guesses.length + ' of ' + G.MAX_GUESSES + '. ' + facts;
    else {
      var best = Math.min.apply(null, state.guesses.map(function (c) { return miles(byCode[c], answer); }));
      $('gm-r-sub').textContent = 'Closest guess: ' + Math.max(1, Math.round(best)) + ' miles away. ' + facts;
    }
    var recap = $('gm-r-recap');
    recap.textContent = '';
    for (var i = 0; i < G.MAX_GUESSES; i++) {
      var c = state.guesses[i];
      var f = c == null ? null : feedback(c);
      recap.appendChild(G.el('li', !f ? '' : f.win ? 'is-win' : f.close ? 'is-close' : 'is-miss'));
    }
    $('gm-next-wrap').hidden = puzzle.date !== G.today();
  }

  function showResults() {
    G.renderStats(GAME, state.won && puzzle.date === G.today() ? state.guesses.length : null);
    G.openSheet('gm-results');
  }

  function render(revealIndex, newestClue) {
    renderRows(revealIndex);
    renderClues(newestClue);
    renderDone();
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!puzzle || state.done || busy) return;
    var t = resolveTyped();
    var activeRow = rows.children[state.guesses.length];
    if (!t) { G.replay(activeRow, 'is-shake'); G.toast(input.value ? 'Pick a town from the list' : 'Type a town first'); return; }
    if (state.guesses.indexOf(t.c) > -1) { G.replay(activeRow, 'is-shake'); G.toast('Already guessed'); return; }
    busy = true;
    state.guesses.push(t.c);
    state.won = t.c === answer.c;
    state.done = state.won || state.guesses.length >= G.MAX_GUESSES;
    G.saveDay(GAME, puzzle.date, state);
    input.value = '';
    picked = null;
    closeSuggest();
    var index = state.guesses.length - 1;
    render(index, state.done ? 0 : state.guesses.length);
    var f = feedback(t.c);
    $('gm-live').textContent = t.n + '. ' + (f.win ? 'Correct.' : f.d + ' miles away. Head ' + POINTS[Math.round(f.deg / 45) % 8] + '.');
    G.wait(420).then(function () {
      if (state.done && !state.won) G.toast('It was ' + answer.n, 2600);
      else G.toast(f.win ? PRAISE[index] : f.close ? 'So close' : 'Head ' + POINTS[Math.round(f.deg / 45) % 8]);
      if (!state.done) { busy = false; input.focus(); return; }
      if (state.won) G.replay(rows.children[index], 'is-bounce');
      return G.wait(1400).then(function () { busy = false; showResults(); });
    });
  });

  $('gm-share').addEventListener('click', function () { G.share(shareText()); });
  $('gm-done-btn').addEventListener('click', showResults);
  G.wireBar(GAME);

  Promise.all([
    G.loadPuzzle(GAME),
    fetch('/property/data/games/towns.json').then(function (r) { if (!r.ok) throw new Error('towns ' + r.status); return r.json(); })
  ]).then(function (res) {
    puzzle = res[0];
    towns = res[1].towns.map(function (t) { t.fold = fold(t.n); byCode[t.c] = t; return t; });
    answer = byCode[G.decode(puzzle.k)];
    if (!answer) throw new Error('bad answer');
    var hints = puzzle.hints;
    $('gm-outline').setAttribute('d', puzzle.path);
    var values = {
      type: hints.type,
      county: hints.county,
      population: number.format(hints.population),
      rate: hints.tax_rate == null ? 'n/a' : '$' + hints.tax_rate.toFixed(2),
      letter: hints.first_letter
    };
    Object.keys(values).forEach(function (k) { document.querySelector('[data-f="' + k + '"]').setAttribute('data-value', values[k]); });
    var past = puzzle.date !== G.today();
    $('gm-meta').textContent = (past ? 'Archive No. ' : 'No. ') + puzzle.number + ' · ' + G.prettyDate(puzzle.date);
    state = G.getDay(GAME, puzzle.date) || { guesses: [], done: false, won: false };
    state.guesses = state.guesses.filter(function (c) { return byCode[c]; });
    input.disabled = submit.disabled = state.done;
    G.wireArchive(puzzle.date);
    G.countdown($('gm-next'));
    render(-1, 0);
    var start = past || state.done ? Promise.resolve() : G.splash(puzzle, state.guesses.length > 0);
    return start.then(function () {
      if (state.done && !past && !seenThisVisit()) showResults();
      else if (!state.done && window.matchMedia('(pointer: fine)').matches) input.focus();
    });
  }).catch(function () {
    $('gm-meta').textContent = 'Today\'s town did not load. Refresh to try again.';
  });

  // Open the results sheet once per visit for a finished puzzle, not on every reload.
  function seenThisVisit() {
    try {
      var key = 'wd-games:seen:' + GAME + ':' + puzzle.date;
      if (window.sessionStorage.getItem(key)) return true;
      window.sessionStorage.setItem(key, '1');
    } catch (e) { /* fine */ }
    return false;
  }
})();
