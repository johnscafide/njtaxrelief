/* /games/leaderboard: today's and this week's top players, by game or overall.
   Copy lives in /property/games/leaderboard/index.html. Reading the board is
   public; joining it needs a free Watchdog account and a nickname
   (games-board.js handles sign-in and the API). */
(function () {
  'use strict';
  var G = window.WatchdogGames;
  var B = window.WatchdogGamesBoard;
  if (!G || !B) return;

  var $ = function (id) { return document.getElementById(id); };
  var params = new URLSearchParams(location.search);
  var game = params.get('game') || 'all';
  var period = params.get('period') === 'week' ? 'week' : 'today';
  var me = { token: null, nickname: null };
  var count = new Intl.NumberFormat('en-US');
  var offline = $('lb-range').getAttribute('data-offline');

  if (!G.GAMES.some(function (g) { return g.id === game; })) game = 'all';
  $('lb-game').value = game;

  function prettyRange(from, to) {
    if (from === to) return G.prettyDate(to, true);
    return G.prettyDate(from).replace(/, \d{4}$/, '') + ' to ' + G.prettyDate(to);
  }

  function renderMe() {
    var box = $('lb-me');
    box.textContent = '';
    if (!me.token) {
      box.appendChild(G.el('p', 'lb-me-text', 'Sign in with your free Watchdog account to put your scores on the board.'));
      var a = G.el('a', 'wg-btn', 'Sign in to join');
      a.href = B.signInUrl();
      box.appendChild(a);
      return;
    }
    if (!me.nickname) {
      box.appendChild(G.el('p', 'lb-me-text', 'You\'re signed in. Pick the name other players will see.'));
      var form = G.el('form', 'gm-board-join');
      var input = G.el('input');
      input.id = 'lb-name';
      input.maxLength = 20;
      input.placeholder = 'Your leaderboard name';
      input.setAttribute('aria-label', 'Leaderboard name');
      var go = G.el('button', 'wg-btn', 'Join');
      go.type = 'submit';
      var msg = G.el('p', 'gm-board-msg');
      form.appendChild(input);
      form.appendChild(go);
      box.appendChild(form);
      box.appendChild(msg);
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        go.disabled = true;
        B.api('POST', '', { action: 'join', nickname: input.value }, me.token).then(function (r) {
          go.disabled = false;
          if (r.status !== 200) { msg.textContent = r.error || 'That did not work. Try again.'; return; }
          me.nickname = r.nickname;
          // Count anything already finished today.
          Promise.all(G.GAMES.map(function (g) { return B.submit(g.id, G.today()); })).then(load);
          renderMe();
        });
      });
      return;
    }
    var line = G.el('p', 'lb-me-text');
    line.appendChild(document.createTextNode('Playing as '));
    line.appendChild(G.el('b', '', me.nickname));
    line.appendChild(document.createTextNode('.'));
    box.appendChild(line);
  }

  function renderBoard(data) {
    var list = $('lb-table');
    list.textContent = '';
    $('lb-range').textContent = (data.from ? prettyRange(data.from, data.to) : '') + (data.players ? ' · ' + count.format(data.players) + ' player' + (data.players === 1 ? '' : 's') : '');
    $('lb-empty').hidden = Boolean(data.rows && data.rows.length);
    (data.rows || []).forEach(function (row, i) {
      var prev = data.rows[i - 1];
      if (prev && row.me && row.rank > prev.rank + 1 && !prev.me) list.appendChild(G.el('li', 'lb-gap', '...'));
      var li = G.el('li', row.me ? 'is-me' : '');
      if (row.rank <= 3) li.classList.add('is-top', 'is-top-' + row.rank);
      li.appendChild(G.el('span', 'lb-rank', String(row.rank)));
      li.appendChild(G.el('span', 'lb-name', row.name + (row.me ? ' (you)' : '')));
      li.appendChild(G.el('span', 'lb-plays', row.plays + (row.plays === 1 ? ' game' : ' games')));
      li.appendChild(G.el('b', 'lb-points', count.format(row.points)));
      list.appendChild(li);
    });
  }

  function load() {
    var url = '?game=' + encodeURIComponent(game) + '&period=' + period;
    $('lb-range').textContent = 'Loading...';
    return B.api('GET', url, null, me.token && me.nickname ? me.token : null).then(function (data) {
      if (data.status !== 200) { $('lb-range').textContent = data.error || offline; $('lb-table').textContent = ''; return; }
      renderBoard(data);
    }, function () { $('lb-range').textContent = offline; });
  }

  function setUrl() {
    var q = new URLSearchParams();
    if (game !== 'all') q.set('game', game);
    if (period !== 'today') q.set('period', period);
    history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q.toString() : ''));
  }

  document.querySelectorAll('[data-period]').forEach(function (b) {
    b.setAttribute('aria-pressed', b.getAttribute('data-period') === period ? 'true' : 'false');
    b.addEventListener('click', function () {
      period = b.getAttribute('data-period');
      document.querySelectorAll('[data-period]').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
      setUrl();
      load();
    });
  });
  $('lb-game').addEventListener('change', function () { game = this.value; setUrl(); load(); });

  B.whoAmI().then(function (who) {
    me = who || me;
    renderMe();
    load();
  }, function () { renderMe(); load(); });
})();
