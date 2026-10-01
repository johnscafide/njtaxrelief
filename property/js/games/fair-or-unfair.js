/* Fair or Unfair: five real New Jersey sales next to their assessments.
   Call each one over-assessed, fair or under-assessed against the town's
   Chapter 123 common level range. Markup and copy live in
   /property/games/fair-or-unfair/index.html. Scoring matches
   api/_watchdog-games-engine.js: 20 points per right call. */
(function () {
  'use strict';
  var G = window.WatchdogGames;
  if (!G) return;

  var GAME = 'fair-or-unfair';
  var HOMES = 5;
  var SCALE_MAX = 150;
  var NAMES = { over: 'Over-assessed', fair: 'Fair', under: 'Under-assessed' };
  var WHY = {
    over: 'That is above the fair range, so the owner pays more than their share and may have grounds for an appeal.',
    fair: 'That is inside the fair range, so this assessment holds up.',
    under: 'That is below the fair range, so this owner pays less than their share and the rest of town makes up the difference.'
  };
  var PRAISE = ['Back to school', 'Warming up', 'Getting there', 'Solid eye', 'Sharp eye', 'Tax board material'];
  var money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  var $ = function (id) { return document.getElementById(id); };
  var puzzle, answers, state, viewing = 0, busy = false;

  function fill(field, value) {
    document.querySelectorAll('[data-f="' + field + '"]').forEach(function (node) { node.textContent = value; });
  }
  function pctText(v) { return (Math.round(v * 10) / 10).toFixed(1).replace(/\.0$/, '') + '%'; }
  function place(node, pct) { node.style.left = Math.max(0, Math.min(100, pct / SCALE_MAX * 100)) + '%'; }
  function right() { return state.picks.filter(function (p, i) { return p === answers[i].call; }).length; }

  function renderProgress() {
    var box = $('fu-progress');
    box.textContent = '';
    for (var i = 0; i < HOMES; i++) {
      var pick = state.picks[i];
      var li = G.el('li', pick == null ? '' : pick === answers[i].call ? 'is-right' : 'is-wrong');
      if (i === viewing) li.classList.add('is-current');
      var dot = G.el('button', 'fu-dot');
      dot.type = 'button';
      dot.setAttribute('data-home', String(i));
      dot.disabled = !(pick != null || i === state.picks.length);
      dot.setAttribute('aria-label', 'Home ' + (i + 1) + (pick == null ? '' : pick === answers[i].call ? ', right' : ', wrong'));
      if (i === viewing) dot.setAttribute('aria-current', 'true');
      li.appendChild(dot);
      box.appendChild(li);
    }
  }

  function renderHome(i, animate) {
    viewing = i;
    var h = puzzle.homes[i];
    var a = answers[i];
    var pick = state.picks[i];
    $('fu-count').textContent = 'Home ' + (i + 1) + ' of ' + HOMES;
    fill('town', h.town);
    fill('town-short', h.town.replace(/ (?:Township|Borough|City|Town|Village)$/, ''));
    fill('street', h.street);
    fill('county', h.county + ' County');
    fill('sold', 'Sold ' + h.sold.replace(/^(\w{3})\w*/, '$1'));
    fill('price', money.format(h.price));
    fill('assessed', money.format(h.assessed));
    fill('ratio', pctText(h.ratio));
    fill('range', pctText(h.lower) + ' to ' + pctText(h.upper));
    var band = $('fu-band');
    band.style.left = (h.lower / SCALE_MAX * 100) + '%';
    band.style.width = ((h.upper - h.lower) / SCALE_MAX * 100) + '%';
    place($('fu-avg'), h.ratio);
    var mark = $('fu-mark');
    var verdict = $('fu-verdict');
    var card = $('fu-card');
    card.classList.remove('is-right', 'is-wrong');
    if (pick != null) {
      mark.hidden = false;
      place(mark, a.pct);
      mark.className = 'fu-mark is-' + a.call;
      var ok = pick === a.call;
      card.classList.add(ok ? 'is-right' : 'is-wrong');
      verdict.hidden = false;
      $('fu-verdict-head').textContent = (ok ? 'Right. ' : 'Not quite. ') + NAMES[a.call] + '.';
      $('fu-verdict-text').textContent = 'Assessed at ' + pctText(a.pct) + ' of its sale price. ' + WHY[a.call];
    } else {
      mark.hidden = true;
      verdict.hidden = true;
    }
    if (animate) G.replay(card, 'is-in');
    var answered = pick != null;
    $('fu-choices').hidden = answered || state.done;
    $('fu-next-wrap').hidden = !answered || state.done;
    $('fu-next').textContent = state.picks.length >= HOMES ? 'See results' : 'Next home';
    document.querySelectorAll('[data-call]').forEach(function (b) { b.disabled = answered; });
    renderProgress();
    renderDone();
  }

  function call(choice) {
    if (busy || state.done || state.picks[viewing] != null || viewing !== state.picks.length) return;
    busy = true;
    state.picks.push(choice);
    var a = answers[viewing];
    var ok = choice === a.call;
    if (state.picks.length >= HOMES) {
      state.done = true;
      state.points = right() * 20;
      state.won = right() === HOMES;
      state.bucket = right();
      state.play = { picks: state.picks };
    }
    G.saveDay(GAME, puzzle.date, state);
    renderHome(viewing, false);
    $('gm-live').textContent = (ok ? 'Right. ' : 'Not quite. ') + NAMES[a.call] + '. Assessed at ' + pctText(a.pct) + ' of its sale price.';
    G.toast(ok ? 'Right call' : 'It was ' + NAMES[a.call].toLowerCase());
    busy = false;
    if (state.done) {
      $('fu-next-wrap').hidden = false;
      $('fu-next').textContent = 'See results';
      G.wait(1800).then(showResults);
    }
  }
  function next() {
    if (state.done && viewing >= HOMES - 1) { showResults(); return; }
    if (viewing < state.picks.length && viewing < HOMES - 1) renderHome(viewing + 1, true);
    else if (state.done) showResults();
  }

  function renderDone() {
    $('gm-done').hidden = !state.done;
    $('gm-dock').hidden = state.done;
    if (!state.done) return;
    var r = right();
    $('gm-done-answer').textContent = state.points + ' points';
    $('gm-results-title').textContent = PRAISE[r] + '.';
    $('gm-r-answer').textContent = r + ' of ' + HOMES + ' right';
    $('gm-r-sub').textContent = state.points + ' points. Tap a dot above the card to look back at any home.';
    var recap = $('gm-r-recap');
    recap.textContent = '';
    state.picks.forEach(function (p, i) { recap.appendChild(G.el('li', p === answers[i].call ? 'is-win' : 'is-miss')); });
    $('gm-next-wrap').hidden = puzzle.date !== G.today();
  }
  function shareText() {
    var lines = ['Watchdog Fair or Unfair No. ' + puzzle.number + ': ' + right() + '/' + HOMES];
    lines.push(state.picks.map(function (p, i) { return p === answers[i].call ? 'Right' : 'Miss'; }).join(', '));
    lines.push('https://www.watchdogindex.com/games/fair-or-unfair');
    return lines.join('\n');
  }
  function showResults() {
    G.renderStats(GAME, puzzle.date === G.today() ? state.bucket + 1 : null);
    G.openSheet('gm-results');
  }

  document.querySelectorAll('[data-call]').forEach(function (b) {
    b.addEventListener('click', function () { call(b.getAttribute('data-call')); });
  });
  $('fu-next').addEventListener('click', next);
  $('fu-progress').addEventListener('click', function (e) {
    var dot = e.target.closest('[data-home]');
    if (!dot || dot.disabled) return;
    renderHome(Number(dot.getAttribute('data-home')), true);
  });
  $('gm-share').addEventListener('click', function () { G.share(shareText()); });
  $('gm-done-btn').addEventListener('click', showResults);
  document.addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey || document.querySelector('dialog[open]') || !$('gm-splash').hidden) return;
    if (e.target && /^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(e.target.tagName)) return;
    var key = { o: 'over', f: 'fair', u: 'under' }[String(e.key).toLowerCase()];
    if (key) { call(key); e.preventDefault(); }
  });
  G.wireBar(GAME);

  G.loadPuzzle(GAME).then(function (p) {
    puzzle = p;
    answers = G.decodeData(p.k);
    if (!answers || answers.length !== HOMES) throw new Error('bad answer');
    var past = p.date !== G.today();
    $('gm-meta').textContent = (past ? 'Archive No. ' : 'No. ') + p.number + ' · ' + G.prettyDate(p.date).replace(/^(\w{3})\w*/, '$1');
    state = G.getDay(GAME, p.date) || { picks: [], done: false, won: false };
    G.wireArchive(p.date);
    G.countdown($('gm-next'));
    renderHome(state.done ? HOMES - 1 : Math.min(state.picks.length, HOMES - 1), false);
    var start = past || state.done ? Promise.resolve() : G.splash(p, state.picks.length > 0);
    return start.then(function () {
      if (state.done && !past && !seenThisVisit()) showResults();
    });
  }).catch(function () {
    $('gm-meta').textContent = 'Today\'s homes did not load. Refresh to try again.';
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
