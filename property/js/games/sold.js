/* Sold! Guess what a real New Jersey home sold for in six tries.
   Markup and copy live in /property/games/sold/index.html; this file only
   fills in the day's numbers and runs the round. */
(function () {
  'use strict';
  var G = window.WatchdogGames;
  if (!G) return;

  var GAME = 'sold';
  var WIN = 0.05;
  var CLOSE = 0.15;
  var money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  var count = new Intl.NumberFormat('en-US');
  var $ = function (id) { return document.getElementById(id); };
  var form = $('wg-form');
  var input = $('wg-input');
  var submit = $('wg-submit');
  var note = $('wg-form-note');
  var list = $('wg-guesses');
  var puzzle, price, state;
  var showStats = G.wireStats(GAME);

  function fill(field, value) {
    document.querySelectorAll('[data-f="' + field + '"]').forEach(function (node) { node.textContent = value; });
  }

  function parseGuess(raw) {
    var text = String(raw || '').toLowerCase().replace(/[$,\s]/g, '');
    var m = text.match(/^(\d+(?:\.\d+)?)(k|m)?$/);
    if (!m) return NaN;
    var n = parseFloat(m[1]);
    if (m[2] === 'k') n *= 1e3;
    if (m[2] === 'm') n *= 1e6;
    return Math.round(n);
  }

  function off(guess) { return Math.abs(guess - price) / price; }
  function pct(guess) { return Math.round(off(guess) * 100); }
  function verdict(guess) {
    if (off(guess) <= WIN) return pct(guess) < 1 ? 'Got it, under 1% off' : 'Got it, ' + pct(guess) + '% off';
    return (guess < price ? 'Too low by ' : 'Too high by ') + pct(guess) + '%';
  }

  function renderGuesses() {
    list.textContent = '';
    for (var i = 0; i < G.MAX_GUESSES; i++) {
      var guess = state.guesses[i];
      var row = G.el('li', 'wg-guess');
      row.appendChild(G.el('span', 'wg-guess-n', String(i + 1)));
      if (guess == null) {
        row.className += ' is-empty';
        row.appendChild(G.el('span', 'wg-guess-v', ''));
        row.appendChild(G.el('span', 'wg-guess-r', ''));
      } else {
        if (off(guess) <= WIN) row.className += ' is-win';
        else if (off(guess) <= CLOSE) row.className += ' is-close';
        row.appendChild(G.el('span', 'wg-guess-v', money.format(guess)));
        row.appendChild(G.el('span', 'wg-guess-r', verdict(guess)));
      }
      list.appendChild(row);
    }
  }

  function renderHints() {
    var open = state.done ? 4 : Math.min(4, state.guesses.length);
    document.querySelectorAll('[data-hint]').forEach(function (li) {
      var n = Number(li.getAttribute('data-hint'));
      var on = n <= open;
      li.classList.toggle('is-open', on);
      li.querySelector('.wg-lock').hidden = on;
      li.querySelector('.wg-open').hidden = !on;
    });
  }

  function shareText() {
    var lines = ['Watchdog Sold! #' + puzzle.number + ': ' + (state.won ? state.guesses.length : 'X') + '/' + G.MAX_GUESSES];
    state.guesses.forEach(function (g, i) {
      lines.push((i + 1) + '. ' + (off(g) <= WIN ? 'Got it (' + pct(g) + '% off)' : pct(g) + '% ' + (g < price ? 'low' : 'high')));
    });
    lines.push('https://www.watchdogindex.com/games/sold');
    return lines.join('\n');
  }

  function renderResult() {
    var done = state.done;
    $('wg-result').hidden = !done;
    $('wg-learn').hidden = !done;
    input.disabled = submit.disabled = done;
    form.hidden = done;
    if (!done) return;
    var best = state.guesses.reduce(function (a, g) { return off(g) < off(a) ? g : a; }, state.guesses[0]);
    $('wg-result-kicker').textContent = state.won ? 'Solved' : 'Out of guesses';
    $('wg-answer').textContent = 'Sold for ' + money.format(price);
    $('wg-result-line').textContent = state.won
      ? 'You got it in ' + state.guesses.length + ' of ' + G.MAX_GUESSES + ' guesses.'
      : 'Your closest guess was ' + pct(best) + '% off.';
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
    var guess = parseGuess(input.value);
    if (!(guess >= 10000 && guess <= 20000000)) {
      note.textContent = 'Enter a price like 450000, 450k or 1.2m.';
      return;
    }
    note.textContent = '';
    state.guesses.push(guess);
    state.won = off(guess) <= WIN;
    state.done = state.won || state.guesses.length >= G.MAX_GUESSES;
    G.saveDay(GAME, puzzle.date, state);
    input.value = '';
    render();
    if (state.done) {
      $('wg-result').scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (puzzle.date === G.today()) setTimeout(function () { showStats(state.won ? state.guesses.length : null); }, 900);
    } else {
      input.focus();
    }
  });

  $('wg-share').addEventListener('click', function () { G.share(shareText()); });

  G.loadPuzzle(GAME).then(function (p) {
    puzzle = p;
    price = Number(G.decode(p.k));
    if (!(price > 0)) throw new Error('bad answer');
    var h = p.home;
    var hints = p.hints;
    fill('town', h.town + ', ' + h.county + ' County');
    fill('street', h.street);
    fill('sold', h.sold);
    fill('kind', h.unit ? 'Condo or unit' : 'House');
    fill('built', String(h.year_built));
    fill('sqft', count.format(h.sqft) + ' sq ft');
    fill('ppsf', hints.town_median_ppsf ? money.format(hints.town_median_ppsf) : 'n/a');
    fill('sales', count.format(hints.town_sales || 0));
    fill('assessed', money.format(hints.assessed));
    fill('ratio', hints.town_ratio + '%');
    fill('ratio-year', String(hints.ratio_year));
    fill('equalized', money.format(Math.round(hints.assessed / (hints.town_ratio / 100) / 1000) * 1000));
    var past = p.date !== G.today();
    $('wg-meta').textContent = (past ? 'Past puzzle #' : 'Puzzle #') + p.number + ', ' + G.prettyDate(p.date);
    state = G.getDay(GAME, p.date) || { guesses: [], done: false, won: false };
    input.disabled = submit.disabled = state.done;
    G.wireArchive(p.date);
    G.countdown($('wg-next'));
    render();
  }).catch(function () {
    $('wg-meta').textContent = 'Today\'s home did not load. Refresh to try again.';
  });
})();
