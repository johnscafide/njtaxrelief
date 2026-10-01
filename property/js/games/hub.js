/* /games hub: show today's puzzle number and this device's progress on each card. */
(function () {
  'use strict';
  var G = window.WatchdogGames;
  if (!G) return;
  var date = G.today();
  var n = G.numberFor(date);
  document.querySelectorAll('[data-game-card]').forEach(function (card) {
    var game = card.getAttribute('data-game-card');
    var day = G.getDay(game, date);
    var streak = G.stats(game).current;
    var status = card.querySelector('[data-card-status]');
    card.querySelector('[data-card-number]').textContent = 'Puzzle #' + n;
    if (day && day.done) status.textContent = day.won ? 'Solved in ' + day.guesses.length : 'Missed today';
    else if (day && day.guesses.length) status.textContent = 'Keep going';
    if (streak > 1) status.textContent += ', streak ' + streak;
  });
})();
