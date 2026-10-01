/* Lineup: put five New Jersey towns in order by one public number. Four tries.
   Markup and copy live in /property/games/lineup/index.html; the day's towns
   and metric come from /api/watchdog-games. Towns in the right spot lock
   after each check. Scoring matches api/_watchdog-games-engine.js. */
(function () {
  'use strict';
  var G = window.WatchdogGames;
  if (!G) return;

  var GAME = 'lineup';
  var TRIES = 4;
  var POINTS = [100, 75, 50, 25];
  var PRAISE = ['Perfect order', 'Sharp', 'Got it sorted', 'Just made it'];
  var $ = function (id) { return document.getElementById(id); };
  var list = $('lu-list');
  var puzzle, answer, names = {}, state, busy = false;

  function feedback(order) {
    return order.map(function (code, i) {
      var at = answer.order.indexOf(code);
      return at === i ? 2 : Math.abs(at - i) === 1 ? 1 : 0;
    });
  }
  function locked() {
    var last = state.orders[state.orders.length - 1];
    if (!last) return [false, false, false, false, false];
    return feedback(last).map(function (f) { return f === 2; });
  }

  // ---------- render ----------
  function render(revealed) {
    var lock = state.done ? [true, true, true, true, true] : locked();
    var last = state.orders[state.orders.length - 1];
    var marks = last && !state.done ? feedback(state.current) : null;
    list.textContent = '';
    list.classList.toggle('is-done', state.done);
    state.current.forEach(function (code, i) {
      var li = $('lu-item-tpl').content.firstElementChild.cloneNode(true);
      li.setAttribute('data-code', code);
      li.querySelector('.lu-rank').textContent = String(i + 1);
      li.querySelector('.lu-name').textContent = names[code];
      var value = li.querySelector('.lu-value');
      if (state.done) {
        value.textContent = answer.values[code];
        var right = answer.order[i] === code;
        li.classList.add(right ? 'is-right' : 'is-wrong');
      } else if (lock[i]) {
        li.classList.add('is-right', 'is-locked');
      } else if (marks && last.indexOf(code) === i) {
        li.classList.add(marks[i] === 1 ? 'is-near' : 'is-far');
      }
      if (revealed) li.classList.add('is-reveal');
      li.style.animationDelay = revealed ? (i * 90) + 'ms' : '';
      var up = li.querySelector('.lu-up'), down = li.querySelector('.lu-down');
      var movable = !state.done && !lock[i];
      up.disabled = !movable || nextFree(i, -1) < 0;
      down.disabled = !movable || nextFree(i, 1) < 0;
      if (!movable) li.querySelector('.lu-grip').hidden = true;
      up.setAttribute('aria-label', 'Move ' + names[code] + ' up');
      down.setAttribute('aria-label', 'Move ' + names[code] + ' down');
      up.addEventListener('click', function () { move(i, -1); });
      down.addEventListener('click', function () { move(i, 1); });
      if (movable) wireDrag(li, i);
      list.appendChild(li);
    });
    renderTries();
    renderDone();
  }

  function renderTries() {
    var box = $('lu-tries');
    box.textContent = '';
    for (var t = 0; t < TRIES; t++) {
      var order = state.orders[t];
      var li = G.el('li', order ? 'is-used' : '');
      if (order) {
        feedback(order).forEach(function (f) { li.appendChild(G.el('span', f === 2 ? 'is-right' : f === 1 ? 'is-near' : 'is-far')); });
      }
      box.appendChild(li);
    }
    var left = TRIES - state.orders.length;
    $('lu-tries-text').textContent = state.done ? (state.won ? 'Solved in ' + state.orders.length : 'Out of tries') : left + (left === 1 ? ' try left' : ' tries left');
  }

  // Nearest unlocked slot from i in direction dir, or -1.
  function nextFree(i, dir) {
    var lock = locked();
    for (var j = i + dir; j >= 0 && j < state.current.length; j += dir) if (!lock[j]) return j;
    return -1;
  }
  function move(i, dir) {
    if (state.done || busy) return;
    var j = nextFree(i, dir);
    if (j < 0) return;
    var c = state.current;
    var tmp = c[i]; c[i] = c[j]; c[j] = tmp;
    G.saveDay(GAME, puzzle.date, state);
    render(false);
    var moved = list.children[j];
    if (moved) { var btn = moved.querySelector(dir < 0 ? '.lu-up' : '.lu-down'); (btn && !btn.disabled ? btn : moved.querySelector('button:not([disabled])') || moved).focus(); }
  }

  // Drag with pointer events: anywhere on the card with a mouse, by the handle on touch.
  function wireDrag(li, index) {
    var startY = 0, dragging = false, pointer = null, at = index;
    li.addEventListener('pointerdown', function (e) {
      if (e.target.closest('button') || busy || state.done) return;
      // Touch drags start on the handle so the rest of the card still scrolls the page.
      if (e.pointerType !== 'mouse' && !e.target.closest('.lu-grip')) return;
      pointer = e.pointerId;
      startY = e.clientY;
      dragging = false;
      li.setPointerCapture(pointer);
    });
    li.addEventListener('pointermove', function (e) {
      if (pointer !== e.pointerId) return;
      var dy = e.clientY - startY;
      if (!dragging && Math.abs(dy) < 6) return;
      dragging = true;
      li.classList.add('is-dragging');
      var step = li.offsetHeight + 8;
      if (dy > step / 2) {
        var down = nextFree(at, 1);
        if (down >= 0) { swapDom(at, down); startY += step * (down - at); at = down; dy = e.clientY - startY; }
      } else if (dy < -step / 2) {
        var up = nextFree(at, -1);
        if (up >= 0) { swapDom(at, up); startY -= step * (at - up); at = up; dy = e.clientY - startY; }
      }
      li.style.transform = 'translateY(' + Math.max(-step, Math.min(step, dy)) + 'px)';
    });
    function end(e) {
      if (pointer !== e.pointerId) return;
      pointer = null;
      li.classList.remove('is-dragging');
      li.style.transform = '';
      if (dragging) { G.saveDay(GAME, puzzle.date, state); render(false); }
    }
    li.addEventListener('pointerup', end);
    li.addEventListener('pointercancel', end);
  }
  function swapDom(i, j) {
    var c = state.current;
    var tmp = c[i]; c[i] = c[j]; c[j] = tmp;
    var a = list.children[i], b = list.children[j];
    if (!a || !b) return;
    var after = b.nextSibling === a ? b : b.nextSibling;
    list.insertBefore(b, a);
    list.insertBefore(a, after);
    Array.prototype.forEach.call(list.children, function (node, n) { node.querySelector('.lu-rank').textContent = String(n + 1); });
  }

  // ---------- check ----------
  function check() {
    if (state.done || busy) return;
    var last = state.orders[state.orders.length - 1];
    if (last && last.join() === state.current.join()) { G.toast('Move something first'); G.replay(list, 'is-shake'); return; }
    busy = true;
    state.orders.push(state.current.slice());
    var marks = feedback(state.current);
    var right = marks.filter(function (f) { return f === 2; }).length;
    state.won = right === 5;
    state.done = state.won || state.orders.length >= TRIES;
    if (state.done) {
      state.points = state.won ? POINTS[state.orders.length - 1] : 0;
      state.bucket = state.won ? state.orders.length - 1 : -1;
      state.play = { orders: state.orders };
    }
    G.saveDay(GAME, puzzle.date, state);
    render(true);
    $('gm-live').textContent = right + ' of 5 in the right spot.';
    G.wait(650).then(function () {
      if (state.won) G.toast(PRAISE[state.orders.length - 1]);
      else if (state.done) G.toast('Here is the right order', 2400);
      else G.toast(right === 0 ? 'None in place yet' : right + ' in the right spot');
      busy = false;
      if (state.done) return G.wait(1300).then(showResults);
    });
  }

  // ---------- finish ----------
  function renderDone() {
    $('gm-done').hidden = !state.done;
    $('gm-dock').hidden = state.done;
    if (!state.done) return;
    $('gm-done-answer').textContent = state.won ? 'Solved in ' + state.orders.length : 'Out of tries';
    $('gm-results-title').textContent = state.won ? PRAISE[state.orders.length - 1] + '.' : 'Not this time.';
    $('gm-r-sub').textContent = puzzle.metric.label + ', ' + puzzle.county + ' County. ' + (state.won ? 'Solved in ' + state.orders.length + ' of ' + TRIES + ' tries.' : 'Here is the right order.');
    var final = $('lu-final');
    final.textContent = '';
    answer.order.forEach(function (code) {
      var li = G.el('li');
      li.appendChild(G.el('span', '', names[code]));
      li.appendChild(G.el('b', '', answer.values[code]));
      final.appendChild(li);
    });
    $('gm-next-wrap').hidden = puzzle.date !== G.today();
  }
  function shareText() {
    var lines = ['Watchdog Lineup No. ' + puzzle.number + ': ' + (state.won ? state.orders.length : 'X') + '/' + TRIES, puzzle.metric.label + ', ' + puzzle.county + ' County'];
    state.orders.forEach(function (o, i) {
      var right = feedback(o).filter(function (f) { return f === 2; }).length;
      lines.push('Try ' + (i + 1) + ': ' + right + ' of 5 in place');
    });
    lines.push('https://www.watchdogindex.com/games/lineup');
    return lines.join('\n');
  }
  function showResults() {
    G.renderStats(GAME, state.won && puzzle.date === G.today() ? state.orders.length : null);
    G.openSheet('gm-results');
  }

  $('lu-check').addEventListener('click', check);
  $('gm-share').addEventListener('click', function () { G.share(shareText()); });
  $('gm-done-btn').addEventListener('click', showResults);
  G.wireBar(GAME);

  G.loadPuzzle(GAME).then(function (p) {
    puzzle = p;
    answer = G.decodeData(p.k);
    if (!answer || !answer.order) throw new Error('bad answer');
    p.towns.forEach(function (t) { names[t.c] = t.n; });
    $('lu-county').textContent = p.county + ' County';
    $('lu-metric').textContent = p.metric.label;
    $('lu-unit').textContent = p.metric.unit;
    $('lu-note').textContent = p.metric.note;
    $('lu-learn').href = p.metric.learn;
    var past = p.date !== G.today();
    $('gm-meta').textContent = (past ? 'Archive No. ' : 'No. ') + p.number + ' · ' + G.prettyDate(p.date).replace(/^(\w{3})\w*/, '$1');
    state = G.getDay(GAME, p.date) || { orders: [], current: p.towns.map(function (t) { return t.c; }), done: false, won: false };
    G.wireArchive(p.date);
    G.countdown($('gm-next'));
    render(false);
    var start = past || state.done ? Promise.resolve() : G.splash(p, state.orders.length > 0);
    return start.then(function () {
      if (state.done && !past && !seenThisVisit()) showResults();
    });
  }).catch(function () {
    $('gm-meta').textContent = 'Today\'s lineup did not load. Refresh to try again.';
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
