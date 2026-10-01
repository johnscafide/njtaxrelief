/* /games hub: today's date and number, plus this device's progress on each game. */
(function () {
  'use strict';
  var G = window.WatchdogGames;
  if (!G) return;
  var date = G.today();
  var head = document.getElementById('gh-date');
  if (head) head.textContent = G.prettyDate(date, true) + ' · No. ' + G.numberFor(date);
  document.querySelectorAll('[data-game-card]').forEach(function (card) {
    var game = card.getAttribute('data-game-card');
    var day = G.getDay(game, date);
    var streak = G.stats(game).current;
    var status = card.querySelector('[data-card-status]');
    var play = card.querySelector('[data-card-play]');
    if (day && day.done) {
      status.textContent = day.won ? 'Solved in ' + day.guesses.length + ' today' : 'Missed today';
      play.textContent = 'See results';
    } else if (day && day.guesses.length) {
      status.textContent = day.guesses.length + ' of ' + G.MAX_GUESSES + ' guesses used';
      play.textContent = 'Continue';
    }
    if (streak > 1) status.textContent += ' · ' + streak + ' day streak';
  });
})();
