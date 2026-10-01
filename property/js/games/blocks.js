/* Blocks: sort sixteen tiles into four groups of four. Four mistakes allowed.
   Markup and copy live in /property/games/blocks/index.html; the day's board
   comes from /api/watchdog-games, which only serves boards with exactly one
   solution. Scoring matches api/_watchdog-games-engine.js. */
(function () {
  'use strict';
  var G = window.WatchdogGames;
  if (!G) return;

  var GAME = 'blocks';
  var MISTAKES = 4;
  var PRAISE = ['Flawless', 'Sharp', 'Solid', 'Phew'];
  var $ = function (id) { return document.getElementById(id); };
  var grid = $('bk-grid');
  var puzzle, groups, tierOf = {}, state, selected = [], busy = false;

  function key(tiles) { return tiles.slice().sort().join('|'); }
  // Tiles travel in capitals; show them in normal case, keeping acronyms.
  var ACRONYM = /^(?:PMI|APR|LTV|DTI|ARM|HELOC|CFO|NJ|PILOT|FHA|VA|USDA|SR|PAS)$/;
  var SMALL = /^(?:to|of|and|the|in|a|on)$/;
  function show(tile) {
    return String(tile).split(/(\s+|-)/).map(function (w, i) {
      if (!/[A-Z]/.test(w) || ACRONYM.test(w.replace(/[^A-Z]/g, ''))) return w;
      var lower = w.toLowerCase();
      if (i > 0 && SMALL.test(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    }).join('');
  }
  // Shrink, then as a last resort break, any single word too wide for its tile.
  function fitTiles() {
    Array.prototype.forEach.call(grid.children, function (b) {
      b.classList.remove('is-tight', 'is-break');
      if (b.scrollWidth > b.clientWidth + 1) b.classList.add('is-tight');
      if (b.scrollWidth > b.clientWidth + 1) b.classList.add('is-break');
    });
  }
  function groupOf(tile) {
    for (var i = 0; i < groups.length; i++) if (groups[i].tiles.indexOf(tile) > -1) return i;
    return -1;
  }
  function remaining() {
    return state.order.filter(function (t) { return state.found.indexOf(groupOf(t)) < 0; });
  }
  function shuffleList(list) {
    var out = list.slice();
    for (var i = out.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = out[i]; out[i] = out[j]; out[j] = t; }
    return out;
  }

  // ---------- render ----------
  function renderSolved(newest) {
    var box = $('bk-solved');
    box.textContent = '';
    state.found.forEach(function (g) {
      var grp = groups[g];
      var row = G.el('div', 'bk-group bk-tier-' + grp.tier);
      row.appendChild(G.el('b', '', grp.label));
      row.appendChild(G.el('span', '', grp.tiles.map(show).join(', ')));
      if (g === newest) G.replay(row, 'is-in');
      box.appendChild(row);
    });
  }
  function renderGrid() {
    grid.textContent = '';
    remaining().forEach(function (tile) {
      var b = G.el('button', 'bk-tile', show(tile));
      b.type = 'button';
      b.setAttribute('data-tile', tile);
      if (tile.length > 12) b.classList.add('is-xlong');
      else if (tile.length > 8) b.classList.add('is-long');
      var on = selected.indexOf(tile) > -1;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.disabled = state.done;
      b.addEventListener('click', function () { toggle(tile); });
      grid.appendChild(b);
    });
    grid.hidden = state.done && !remaining().length;
    if (window.requestAnimationFrame) window.requestAnimationFrame(fitTiles); else fitTiles();
  }
  function renderLives() {
    var box = $('bk-lives');
    box.textContent = '';
    for (var i = 0; i < MISTAKES; i++) box.appendChild(G.el('li', i < MISTAKES - state.mistakes ? '' : 'is-used'));
  }
  function renderButtons() {
    $('bk-submit').disabled = selected.length !== 4 || busy || state.done;
    $('bk-clear').disabled = !selected.length || state.done;
    $('bk-shuffle').disabled = state.done;
  }
  function render(newest) {
    renderSolved(newest);
    renderGrid();
    renderLives();
    renderButtons();
    renderDone();
  }

  function toggle(tile) {
    if (busy || state.done) return;
    var at = selected.indexOf(tile);
    if (at > -1) selected.splice(at, 1);
    else if (selected.length < 4) selected.push(tile);
    else { G.toast('Four at a time'); return; }
    Array.prototype.forEach.call(grid.children, function (b) { b.setAttribute('aria-pressed', selected.indexOf(b.getAttribute('data-tile')) > -1 ? 'true' : 'false'); });
    renderButtons();
  }

  // ---------- submit ----------
  function submit() {
    if (busy || state.done || selected.length !== 4) return;
    var k = key(selected);
    if (state.guesses.some(function (g) { return key(g) === k; })) { G.toast('Already guessed'); return; }
    busy = true;
    state.guesses.push(selected.slice());
    var hit = -1, best = 0;
    groups.forEach(function (g, i) {
      if (state.found.indexOf(i) > -1) return;
      var n = selected.filter(function (t) { return g.tiles.indexOf(t) > -1; }).length;
      if (n === 4) hit = i;
      best = Math.max(best, n);
    });
    var picked = Array.prototype.filter.call(grid.children, function (b) { return selected.indexOf(b.getAttribute('data-tile')) > -1; });
    picked.forEach(function (b, i) { b.style.animationDelay = (i * 70) + 'ms'; G.replay(b, 'is-hop'); });
    G.wait(520).then(function () {
      if (hit > -1) {
        state.found.push(hit);
        selected = [];
        $('gm-live').textContent = 'Correct: ' + groups[hit].label + '.';
        if (state.found.length === 4) finish(true);
        G.saveDay(GAME, puzzle.date, state);
        render(hit);
        if (!state.done) G.toast(['Nice', 'Got one', 'Keep going'][state.found.length - 1] || 'Nice');
      } else {
        state.mistakes++;
        picked.forEach(function (b) { b.style.animationDelay = ''; G.replay(b, 'is-shake'); });
        var msg = best === 3 ? 'One away' : 'Not a group';
        $('gm-live').textContent = msg + '. ' + (MISTAKES - state.mistakes) + ' mistakes left.';
        if (state.mistakes >= MISTAKES) finish(false);
        G.saveDay(GAME, puzzle.date, state);
        renderLives();
        G.toast(msg);
        if (state.done) {
          selected = [];
          return revealRest().then(function () { busy = false; renderButtons(); return G.wait(900).then(showResults); });
        }
      }
      busy = false;
      renderButtons();
      if (state.done) return G.wait(1200).then(showResults);
    });
  }
  function finish(won) {
    state.done = true;
    state.won = won;
    state.points = won ? 100 - 20 * state.mistakes : 10 * state.found.length;
    state.bucket = won ? state.mistakes : -1;
    state.play = { guesses: state.guesses };
  }
  // After a loss, slide the missing groups in one at a time.
  function revealRest() {
    var missing = groups.map(function (g, i) { return i; }).filter(function (i) { return state.found.indexOf(i) < 0; });
    state.revealed = missing;
    var step = function () {
      if (!missing.length) return Promise.resolve();
      var g = missing.shift();
      state.found.push(g);
      render(g);
      return G.wait(500).then(step);
    };
    return step().then(function () {
      state.found = state.found.filter(function (g) { return state.revealed.indexOf(g) < 0; });
      G.saveDay(GAME, puzzle.date, state);
      renderAllGroups();
    });
  }
  // Finished board: every group in tier order, solved or shown.
  function renderAllGroups() {
    var box = $('bk-solved');
    box.textContent = '';
    var order = state.found.concat((state.revealed || []).filter(function (g) { return state.found.indexOf(g) < 0; }));
    groups.forEach(function (g, i) { if (order.indexOf(i) < 0) order.push(i); });
    order.forEach(function (i) {
      var grp = groups[i];
      var row = G.el('div', 'bk-group bk-tier-' + grp.tier + (state.found.indexOf(i) < 0 ? ' is-missed' : ''));
      row.appendChild(G.el('b', '', grp.label));
      row.appendChild(G.el('span', '', grp.tiles.map(show).join(', ')));
      box.appendChild(row);
    });
    grid.hidden = true;
  }

  // ---------- finish ----------
  function renderDone() {
    $('gm-done').hidden = !state.done;
    $('gm-dock').hidden = state.done;
    document.querySelector('.bk-lives').hidden = state.done;
    if (!state.done) return;
    if (!busy) renderAllGroups();
    $('gm-done-answer').textContent = state.points + ' points';
    $('gm-results-title').textContent = state.won ? PRAISE[state.mistakes] + '.' : 'Not this time.';
    $('gm-r-sub').textContent = state.won
      ? 'Solved with ' + (state.mistakes ? state.mistakes + ' mistake' + (state.mistakes > 1 ? 's' : '') : 'no mistakes') + '. ' + state.points + ' points.'
      : 'You found ' + state.found.length + ' of 4 groups. ' + state.points + ' points.';
    var recap = $('bk-recap');
    recap.textContent = '';
    state.guesses.forEach(function (g) {
      var li = G.el('li');
      g.forEach(function (t) { li.appendChild(G.el('span', 'bk-tier-' + groups[groupOf(t)].tier)); });
      recap.appendChild(li);
    });
    var learn = $('bk-learn');
    learn.textContent = '';
    groups.forEach(function (g) {
      var li = G.el('li', 'bk-tier-' + g.tier);
      li.appendChild(G.el('b', '', g.label));
      li.appendChild(G.el('span', '', g.tiles.map(show).join(', ')));
      if (g.learn) {
        var a = G.el('a', '', /^\/glossary\//.test(g.learn) ? 'Read the glossary' : 'Compare these towns');
        a.href = g.learn;
        li.appendChild(a);
      }
      learn.appendChild(li);
    });
    $('gm-next-wrap').hidden = puzzle.date !== G.today();
  }
  function shareText() {
    var names = ['Gold', 'Teal', 'Blue', 'Navy'];
    var lines = ['Watchdog Blocks No. ' + puzzle.number + ': ' + (state.won ? 'solved' : state.found.length + '/4 groups') + ', ' + state.mistakes + ' mistake' + (state.mistakes === 1 ? '' : 's')];
    state.guesses.forEach(function (g) {
      lines.push(g.map(function (t) { return names[groups[groupOf(t)].tier - 1]; }).join(' '));
    });
    lines.push('https://www.watchdogindex.com/games/blocks');
    return lines.join('\n');
  }
  function showResults() {
    G.renderStats(GAME, state.won && puzzle.date === G.today() ? state.mistakes + 1 : null);
    G.openSheet('gm-results');
  }

  // Fonts can arrive after the first layout, and phones rotate.
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitTiles);
  window.addEventListener('resize', fitTiles);

  $('bk-submit').addEventListener('click', submit);
  $('bk-clear').addEventListener('click', function () { selected = []; renderGrid(); renderButtons(); });
  $('bk-shuffle').addEventListener('click', function () {
    var rest = shuffleList(remaining());
    var solved = state.order.filter(function (t) { return state.found.indexOf(groupOf(t)) > -1; });
    state.order = solved.concat(rest);
    G.saveDay(GAME, puzzle.date, state);
    renderGrid();
  });
  $('gm-share').addEventListener('click', function () { G.share(shareText()); });
  $('gm-done-btn').addEventListener('click', showResults);
  G.wireBar(GAME);

  G.loadPuzzle(GAME).then(function (p) {
    puzzle = p;
    groups = G.decodeData(p.k);
    if (!groups || groups.length !== 4) throw new Error('bad answer');
    var past = p.date !== G.today();
    $('gm-meta').textContent = (past ? 'Archive No. ' : 'No. ') + p.number + ' · ' + G.prettyDate(p.date).replace(/^(\w{3})\w*/, '$1');
    state = G.getDay(GAME, p.date) || { guesses: [], found: [], mistakes: 0, order: p.tiles.slice(), done: false, won: false };
    G.wireArchive(p.date);
    G.countdown($('gm-next'));
    render(-1);
    var start = past || state.done ? Promise.resolve() : G.splash(p, state.guesses.length > 0);
    return start.then(function () {
      if (state.done && !past && !seenThisVisit()) showResults();
    });
  }).catch(function () {
    $('gm-meta').textContent = 'Today\'s board did not load. Refresh to try again.';
  });

  function seenThisVisit() {
    try {
      var key = 'wd-games:seen:' + GAME + ':' + puzzle.date;
      if (window.sessionStorage.getItem(key)) return true;
      window.sessionStorage.setItem(key, '1');
    } catch (e) { /* fine */ }
    return false;
  }
})();
