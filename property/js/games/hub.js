/* /games hub: today's date and number, this device's progress on each game,
   the "your day" ring and a peek at today's leaderboard. */
(function () {
  'use strict';
  var G = window.WatchdogGames;
  if (!G) return;
  var B = window.WatchdogGamesBoard;
  var $ = function (id) { return document.getElementById(id); };
  var date = G.today();
  var count = new Intl.NumberFormat('en-US');

  var head = $('gh-date');
  if (head) head.textContent = G.prettyDate(date, true) + ' · No. ' + G.numberFor(date);

  var done = 0, points = 0, best = 0;
  G.GAMES.forEach(function (g) {
    var day = G.getDay(g.id, date);
    var s = G.stats(g.id);
    best = Math.max(best, s.current);
    var card = document.querySelector('[data-game-card="' + g.id + '"]');
    if (day && day.done) { done++; points += G.pointsOf(g.id, day); }
    if (!card) return;
    var status = card.querySelector('[data-card-status]');
    var play = card.querySelector('[data-card-play]');
    if (day && day.done) {
      card.classList.add('is-done');
      status.textContent = G.pointsOf(g.id, day) + ' points today';
      play.textContent = 'See results';
    } else if (day && ((day.guesses && day.guesses.length) || (day.orders && day.orders.length) || (day.picks && day.picks.length) || day.clues)) {
      status.textContent = 'In progress';
      play.textContent = 'Continue';
    }
    if (s.current > 1) status.textContent += ' · ' + s.current + ' day streak';
  });

  $('gh-done').textContent = String(done);
  $('gh-points').textContent = count.format(points);
  $('gh-streak').textContent = String(best);
  $('gh-ring').setAttribute('aria-label', done + ' of ' + G.GAMES.length + ' games played today');
  var fill = $('gh-ring-fill');
  var length = 2 * Math.PI * 52;
  fill.style.strokeDasharray = length.toFixed(1);
  fill.style.strokeDashoffset = (length * (1 - done / G.GAMES.length)).toFixed(1);
  var next = G.nextGame('');
  var start = $('gh-start');
  if (next) {
    start.href = '/games/' + next.id;
    start.textContent = done ? 'Next up: ' + next.name : 'Start with ' + next.name;
  } else {
    start.href = '/games/leaderboard';
    start.textContent = 'All done. See the leaderboard';
  }

  // Leaderboard peek: top five today across all games.
  if (!B) return;
  $('gh-board-signin').href = B.signInUrl('/games');
  $('gh-board-join').hidden = B.maybeSignedIn();
  B.api('GET', '?game=all&period=today').then(function (data) {
    var list = $('gh-board-list');
    var rows = (data && data.status === 200 && data.rows) ? data.rows.slice(0, 5) : [];
    $('gh-board-empty').hidden = rows.length > 0;
    if (data && data.status !== 200) $('gh-board-empty').textContent = 'The leaderboard is taking a break. Your games still count on this device.';
    rows.forEach(function (row) {
      var li = G.el('li', row.rank <= 3 ? 'is-top is-top-' + row.rank : '');
      li.appendChild(G.el('span', 'lb-rank', String(row.rank)));
      li.appendChild(G.el('span', 'lb-name', row.name));
      li.appendChild(G.el('span', 'lb-plays', row.plays + (row.plays === 1 ? ' game' : ' games')));
      li.appendChild(G.el('b', 'lb-points', count.format(row.points)));
      list.appendChild(li);
    });
  }, function () { $('gh-board-empty').hidden = false; });
})();
