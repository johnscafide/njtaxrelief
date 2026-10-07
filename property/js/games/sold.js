/* Sold! Guess what a real New Jersey home sold for in six tries.
   Markup and copy live in /property/games/sold/index.html; this file fills
   in the day's numbers and runs the round: keypad entry, flip reveals, the
   price range meter, public record clues and the results sheet. */
(function () {
  'use strict';
  var G = window.WatchdogGames;
  if (!G) return;

  var GAME = 'sold';
  var WIN = 0.05;
  var CLOSE = 0.15;
  var MAX_DIGITS = 8;
  var PRAISE = ['Appraiser level', 'Sharp eye', 'Well priced', 'Solid read', 'Got there', 'Just made it'];
  var money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  var count = new Intl.NumberFormat('en-US');
  var $ = function (id) { return document.getElementById(id); };
  var rows = $('gm-rows');
  var puzzle, price, place, state, typed = '', busy = false, ready = false, homeChecked = false;

  function fill(field, value) {
    document.querySelectorAll('[data-f="' + field + '"]').forEach(function (node) { node.textContent = value; });
  }
  function short(n) {
    if (n >= 1e6) return '$' + (Math.round(n / 1e5) / 10).toString().replace(/\.0$/, '') + 'M';
    return '$' + Math.round(n / 1e3) + 'K';
  }
  function off(g) { return Math.abs(g - price) / price; }
  function pct(g) { return Math.round(off(g) * 100); }
  function kind(g) { return off(g) <= WIN ? 'win' : off(g) <= CLOSE ? 'close' : 'miss'; }

  // ---------- rows ----------
  function verdictNode(g) {
    var box = G.el('span', 'gm-row-r');
    if (kind(g) === 'win') {
      box.appendChild(G.icon('gm-ico-check'));
      box.appendChild(document.createTextNode(pct(g) < 1 ? 'Exact' : pct(g) + '% off'));
    } else {
      var arrow = G.icon('gm-ico-arrow');
      if (g > price) arrow.style.transform = 'rotate(180deg)';
      box.appendChild(arrow);
      box.appendChild(document.createTextNode(pct(g) + '% ' + (g < price ? 'low' : 'high')));
    }
    box.setAttribute('aria-label', kind(g) === 'win' ? 'Within ' + Math.max(1, pct(g)) + ' percent' : (g < price ? 'Too low by ' : 'Too high by ') + pct(g) + ' percent');
    return box;
  }

  function rowNode(i) {
    var row = $('gm-row-tpl').content.firstElementChild.cloneNode(true);
    row.querySelector('.gm-row-n').textContent = String(i + 1);
    var g = state.guesses[i];
    var value = row.querySelector('.gm-row-v');
    if (g != null) {
      row.classList.add('is-' + kind(g));
      value.textContent = money.format(g);
      row.replaceChild(verdictNode(g), row.querySelector('.gm-row-r'));
    } else if (i === state.guesses.length && !state.done) {
      row.classList.add('is-active');
      value.textContent = typed ? money.format(Number(typed)) : 'Type a price';
      value.classList.toggle('is-placeholder', !typed);
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
  function updateActive() {
    var row = rows.children[state.guesses.length];
    if (!row || state.done) return;
    var value = row.querySelector('.gm-row-v');
    value.textContent = typed ? money.format(Number(typed)) : 'Type a price';
    value.classList.toggle('is-placeholder', !typed);
  }

  // ---------- clues ----------
  function renderClues(newest) {
    var open = state.done ? 4 : Math.min(4, state.guesses.length);
    document.querySelectorAll('[data-clue]').forEach(function (div) {
      var n = Number(div.getAttribute('data-clue'));
      var on = n <= open;
      div.classList.toggle('is-open', on);
      div.querySelector('.gm-lock').hidden = on;
      div.querySelector('b').hidden = !on;
      if (n === newest && on) G.replay(div, 'is-new');
    });
  }

  // ---------- range meter ----------
  function renderRange() {
    var lows = state.guesses.filter(function (g) { return g < price && kind(g) !== 'win'; });
    var highs = state.guesses.filter(function (g) { return g > price && kind(g) !== 'win'; });
    var low = lows.length ? Math.max.apply(null, lows) : 0;
    var high = highs.length ? Math.min.apply(null, highs) : 0;
    var top = Math.max.apply(null, [1e6].concat(state.guesses, state.done ? [price] : []).map(function (v) { return v * 1.15; }));
    top = Math.ceil(top / 250000) * 250000;
    var win = $('gm-window');
    if (state.done) { low = price * 0.97; high = price * 1.03; }
    win.style.left = (low / top * 100) + '%';
    win.style.right = (high ? 100 - high / top * 100 : 0) + '%';
    var ticks = $('gm-ticks');
    ticks.textContent = '';
    state.guesses.forEach(function (g) {
      var t = G.el('span', 'gm-tick');
      t.style.left = Math.min(100, g / top * 100) + '%';
      ticks.appendChild(t);
    });
    $('gm-scale-max').textContent = short(top);
    var lowText = $('gm-range-low'), highText = $('gm-range-high');
    if (state.done) { lowText.textContent = 'Sold for'; highText.textContent = ''; highText.appendChild(G.el('b', '', money.format(price))); return; }
    if (!state.guesses.length) { lowText.textContent = 'Every guess narrows the range'; highText.textContent = ''; return; }
    lowText.textContent = '';
    highText.textContent = '';
    if (low) { lowText.appendChild(document.createTextNode('Above ')); lowText.appendChild(G.el('b', '', short(low))); }
    else lowText.textContent = 'Somewhere below';
    if (high) { highText.appendChild(document.createTextNode('Below ')); highText.appendChild(G.el('b', '', short(high))); }
    else highText.textContent = 'and up';
  }

  // ---------- finish ----------
  function shareText() {
    var lines = ['Watchdog Sold! No. ' + puzzle.number + ': ' + (state.won ? state.guesses.length : 'X') + '/' + G.MAX_GUESSES];
    state.guesses.forEach(function (g, i) {
      lines.push((i + 1) + '. ' + (kind(g) === 'win' ? 'Got it, ' + pct(g) + '% off' : pct(g) + '% ' + (g < price ? 'low' : 'high')));
    });
    lines.push('https://www.watchdogindex.com/games/sold');
    return lines.join('\n');
  }

  function titleCase(text) {
    return String(text).toLowerCase().replace(/(^|[\s-])([a-z])/g, function (m, a, b) { return a + b.toUpperCase(); });
  }

  function renderHome() {
    if (!place || !place.pin || homeChecked) return;
    homeChecked = true;
    var street = document.querySelector('.gm-street [data-f="street"]');
    var address = titleCase(place.address.split(',')[0]);
    street.textContent = address;
    function show(href) {
      var link = G.el('a', 'gm-street-link', address);
      link.href = href;
      street.textContent = '';
      street.appendChild(link);
      $('gm-r-home').href = href;
      $('gm-r-home').hidden = false;
    }
    var href = '/nj/property/' + encodeURIComponent(place.pin);
    fetch(href, { method: 'HEAD' }).then(function (r) {
      if (!r.ok) return;
      var origin = window.location.origin + '/';
      show(r.url && r.url.indexOf(origin) === 0 ? r.url.slice(origin.length - 1) : href);
    }).catch(function () { show(href); });
  }

  function renderDone() {
    var done = state.done;
    $('gm-done').hidden = !done;
    $('gm-dock').hidden = done;
    if (!done) return;
    renderHome();
    $('gm-done-answer').textContent = money.format(price);
    $('gm-results-title').textContent = state.won ? 'Nailed it.' : 'Not this time.';
    $('gm-r-answer').textContent = money.format(price);
    var best = state.guesses.reduce(function (a, g) { return off(g) < off(a) ? g : a; }, state.guesses[0]);
    $('gm-r-sub').textContent = state.won
      ? 'Solved in ' + state.guesses.length + ' of ' + G.MAX_GUESSES + '. ' + puzzle.home.town + ', sold ' + puzzle.home.sold + '.'
      : 'Your closest guess was ' + pct(best) + '% off. ' + puzzle.home.town + ', sold ' + puzzle.home.sold + '.';
    var recap = $('gm-r-recap');
    recap.textContent = '';
    for (var i = 0; i < G.MAX_GUESSES; i++) {
      var g = state.guesses[i];
      recap.appendChild(G.el('li', g == null ? '' : 'is-' + kind(g)));
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
    renderRange();
    renderDone();
  }

  // ---------- input ----------
  function press(key) {
    if (!ready || busy || state.done) return;
    if (key === 'enter') return submit();
    if (key === 'back') typed = typed.slice(0, -1);
    else if (/^\d+$/.test(key)) {
      if (!typed && /^0/.test(key)) return;
      typed = (typed + key).slice(0, MAX_DIGITS);
    }
    updateActive();
  }

  function submit() {
    var row = rows.children[state.guesses.length];
    var guess = Number(typed);
    if (!(guess >= 10000 && guess <= 20000000)) {
      G.replay(row, 'is-shake');
      G.toast(typed ? 'Try a price between $10,000 and $20 million' : 'Type a price first');
      return;
    }
    busy = true;
    typed = '';
    state.guesses.push(guess);
    state.won = kind(guess) === 'win';
    state.done = state.won || state.guesses.length >= G.MAX_GUESSES;
    G.saveDay(GAME, puzzle.date, state);
    var index = state.guesses.length - 1;
    render(index, state.done ? 0 : state.guesses.length);
    var k = kind(guess);
    var msg = k === 'win' ? PRAISE[index] : (k === 'close' ? 'Close. ' : '') + (guess < price ? 'Go higher' : 'Go lower');
    $('gm-live').textContent = money.format(guess) + '. ' + (k === 'win' ? 'Correct.' : (guess < price ? 'Too low by ' : 'Too high by ') + pct(guess) + ' percent.');
    G.wait(420).then(function () {
      if (state.done && !state.won) G.toast('It sold for ' + money.format(price), 2600);
      else G.toast(msg);
      if (!state.done) {
        var next = rows.children[state.guesses.length];
        if (next) next.scrollIntoView({ block: 'center', behavior: G.calm ? 'auto' : 'smooth' });
        busy = false;
        return;
      }
      if (state.won) Array.prototype.forEach.call(rows.children, function (r, i) { if (i === index) G.replay(r, 'is-bounce'); });
      return G.wait(1400).then(function () { busy = false; showResults(); });
    });
  }

  document.querySelectorAll('[data-key]').forEach(function (button) {
    button.addEventListener('click', function () { press(button.getAttribute('data-key')); });
  });
  document.addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (document.querySelector('dialog[open]') || !$('gm-splash').hidden) return;
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if (/^\d$/.test(e.key)) { press(e.key); e.preventDefault(); }
    else if (e.key === 'Backspace') { press('back'); e.preventDefault(); }
    else if (e.key === 'Enter' && !/^(BUTTON|A)$/.test(e.target.tagName)) { press('enter'); e.preventDefault(); }
  });
  $('gm-share').addEventListener('click', function () { G.share(shareText()); });
  $('gm-done-btn').addEventListener('click', showResults);
  G.wireBar(GAME);

  G.loadPuzzle(GAME).then(function (p) {
    puzzle = p;
    price = Number(G.decode(p.k));
    place = p.place ? G.decodeData(p.place) : null;
    if (!(price > 0)) throw new Error('bad answer');
    var h = p.home, hints = p.hints;
    fill('town', h.town);
    fill('county', h.county + ' County');
    fill('street', h.street);
    fill('sold', h.sold.replace(/^(\w{3})\w*/, '$1'));
    fill('kind', h.unit ? 'Condo' : 'House');
    fill('built', String(h.year_built));
    fill('sqft', count.format(h.sqft));
    fill('ppsf', hints.town_median_ppsf ? money.format(hints.town_median_ppsf) : 'n/a');
    fill('assessed', money.format(hints.assessed));
    fill('ratio', hints.town_ratio + '% (' + hints.ratio_year + ')');
    fill('equalized', money.format(Math.round(hints.assessed / (hints.town_ratio / 100) / 1000) * 1000));
    var past = p.date !== G.today();
    $('gm-meta').textContent = (past ? 'Archive No. ' : 'No. ') + p.number + ' \u00b7 ' + G.prettyDate(p.date).replace(/^(\w{3})\w*/, '$1');
    state = G.getDay(GAME, p.date) || { guesses: [], done: false, won: false };
    G.wireArchive(p.date);
    G.countdown($('gm-next'));
    render(-1, 0);
    var start = past || state.done ? Promise.resolve() : G.splash(p, state.guesses.length > 0);
    return start.then(function () {
      ready = true;
      if (state.done && !past && !sessionStorageSeen()) showResults();
    });
  }).catch(function () {
    $('gm-meta').textContent = 'Today\'s home did not load. Refresh to try again.';
  });

  // Open the results sheet once per visit for a finished puzzle, not on every reload.
  function sessionStorageSeen() {
    try {
      var key = 'wd-games:seen:' + GAME + ':' + puzzle.date;
      if (window.sessionStorage.getItem(key)) return true;
      window.sessionStorage.setItem(key, '1');
    } catch (e) { /* fine */ }
    return false;
  }
})();
