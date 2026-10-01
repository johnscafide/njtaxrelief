/* Watchdog Games leaderboard on the game pages and the /games hub.

   Playing never needs an account. Joining the leaderboard does: a free
   Watchdog account (the same sign-in as the rest of Watchdog, at /onboarding)
   plus a public nickname. When a signed-in player finishes today's puzzle,
   this sends the play (the guesses, not a score) to /api/watchdog-games-board,
   which replays it against the real puzzle and records the points.

   The Supabase client loads only when it is needed: when the results sheet
   opens, when a puzzle is finished, or on the leaderboard page. It shares the
   site's session (same project and storage key as supabase-runtime.js). */
(function () {
  'use strict';
  var G = window.WatchdogGames;
  if (!G) return;

  var PRODUCTION = { ref: 'uvkvaxljhhngydvlrzom', url: 'https://uvkvaxljhhngydvlrzom.supabase.co', key: 'sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa' };
  var STAGING = { ref: 'pxossnwmrygxlpxtstnl', url: 'https://pxossnwmrygxlpxtstnl.supabase.co', key: 'sb_publishable_2knfdj4MRsPEtQpPbQ54ew_S5KngOcl' };
  var SDK = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js';
  var host = String(location.hostname || '').toLowerCase();
  var preview = host === 'localhost' || host === '127.0.0.1' || /\.vercel\.app$/.test(host);
  var cleanHost = host === 'www.watchdogindex.com' || host === 'watchdogindex.com';
  var project = preview ? STAGING : PRODUCTION;
  var game = document.body.getAttribute('data-game') || '';
  var clientPromise = null;
  var profile = null; // { token, nickname } once known

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (window.supabase && window.supabase.createClient) return resolve();
      var s = document.createElement('script');
      s.src = src;
      s.async = true;
      var timer = setTimeout(function () { reject(new Error('sign-in script timed out')); }, 8000);
      s.onload = function () { clearTimeout(timer); resolve(); };
      s.onerror = function () { clearTimeout(timer); reject(new Error('sign-in script did not load')); };
      document.head.appendChild(s);
    });
  }
  function client() {
    if (!clientPromise) {
      clientPromise = loadScript(SDK).catch(function (error) { clientPromise = null; throw error; }).then(function () {
        return window.supabase.createClient(project.url, project.key, {
          auth: { storageKey: 'sb-' + project.ref + '-auth-token', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: 'pkce' }
        });
      });
    }
    return clientPromise;
  }
  function token() {
    return client().then(function (c) { return c.auth.getSession(); }).then(function (r) {
      var s = r && r.data && r.data.session;
      return s ? s.access_token : null;
    }).catch(function () { return null; });
  }
  // Is there a saved session at all? Checked without loading anything.
  function maybeSignedIn() {
    try { return Boolean(window.localStorage.getItem('sb-' + project.ref + '-auth-token')); } catch (e) { return false; }
  }

  function api(method, query, body, auth) {
    var headers = { Accept: 'application/json' };
    if (body) headers['Content-Type'] = 'application/json';
    if (auth) headers.Authorization = 'Bearer ' + auth;
    return fetch('/api/watchdog-games-board' + (query || ''), { method: method, headers: headers, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (data) { data.status = r.status; return data; }); });
  }

  function signInUrl(next) {
    var path = next || (location.pathname + location.search);
    return location.origin + (cleanHost ? '' : '/property') + '/onboarding/?next=' + encodeURIComponent(path);
  }
  function boardUrl(g) { return (cleanHost ? '' : '/property') + '/games/leaderboard' + (g ? '?game=' + encodeURIComponent(g) : ''); }

  // Who is this? { token, nickname } or { token: null }.
  function whoAmI() {
    if (profile) return Promise.resolve(profile);
    if (!maybeSignedIn()) return Promise.resolve({ token: null });
    return token().then(function (t) {
      if (!t) return { token: null };
      return api('GET', '?me=1', null, t).then(function (me) {
        profile = { token: me.status === 200 ? t : null, nickname: me.nickname || null };
        return profile;
      });
    });
  }

  function playFor(g, day) {
    if (day.play) return day.play;
    return { guesses: day.guesses };
  }

  // Send today's finished play once. Resolves with the server's answer.
  function submit(g, date) {
    var day = G.getDay(g, date);
    if (!day || !day.done || day.board || date !== G.today()) return Promise.resolve(null);
    return whoAmI().then(function (me) {
      if (!me.token || !me.nickname) return null;
      return api('POST', '', { action: 'score', game: g, date: date, play: playFor(g, day) }, me.token).then(function (r) {
        if (r.status === 200) {
          G.markDay(g, date, { board: { points: r.points, rank: r.rank, players: r.players } });
          return r;
        }
        if (r.status === 409 || r.status === 400) G.markDay(g, date, { board: { error: r.error || 'Not counted' } });
        return r;
      });
    });
  }

  // ---------- results sheet panel ----------
  function panel() { return document.getElementById('gm-board'); }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function heading(node) {
    node.appendChild(G.el('h3', '', 'Leaderboard'));
  }
  function link(text, href, cls) {
    var a = G.el('a', cls || 'wg-btn wg-btn-quiet', text);
    a.href = href;
    return a;
  }

  function renderSignedOut(node) {
    heading(node);
    node.appendChild(G.el('p', '', 'Sign in with your free Watchdog account to put your score on today\'s leaderboard. You can keep playing without one.'));
    var row = G.el('div', 'gm-board-actions');
    row.appendChild(link('Sign in to join', signInUrl(), 'wg-btn'));
    row.appendChild(link('See the leaderboard', boardUrl(game)));
    node.appendChild(row);
  }

  function renderJoin(node, me, after) {
    heading(node);
    node.appendChild(G.el('p', '', 'Pick the name other players will see. Only this name is shown, never your account details.'));
    var form = G.el('form', 'gm-board-join');
    var label = G.el('label', 'wg-sr', 'Leaderboard name');
    label.setAttribute('for', 'gm-board-name');
    var input = G.el('input');
    input.id = 'gm-board-name';
    input.maxLength = 20;
    input.autocomplete = 'nickname';
    input.placeholder = 'Your leaderboard name';
    var go = G.el('button', 'wg-btn', 'Join');
    go.type = 'submit';
    var msg = G.el('p', 'gm-board-msg');
    msg.setAttribute('aria-live', 'polite');
    form.appendChild(label);
    form.appendChild(input);
    form.appendChild(go);
    node.appendChild(form);
    node.appendChild(msg);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      go.disabled = true;
      msg.textContent = '';
      api('POST', '', { action: 'join', nickname: input.value }, me.token).then(function (r) {
        go.disabled = false;
        if (r.status !== 200) { msg.textContent = r.error || 'That did not work. Try again.'; return; }
        profile.nickname = r.nickname;
        after();
      }, function () { go.disabled = false; msg.textContent = 'That did not work. Try again.'; });
    });
  }

  function renderScore(node, me, date) {
    heading(node);
    var day = G.getDay(game, date);
    var p = G.el('p', 'gm-board-line');
    if (date !== G.today()) {
      p.textContent = 'Only today\'s puzzle counts for the leaderboard.';
    } else if (!day || !day.done) {
      p.textContent = 'Playing as ' + me.nickname + '. Finish today\'s puzzle to get on the board.';
    } else if (day.board && day.board.points != null) {
      p.appendChild(document.createTextNode('Playing as ' + me.nickname + '. '));
      p.appendChild(G.el('b', '', day.board.points + ' points'));
      if (day.board.rank) p.appendChild(document.createTextNode(', #' + day.board.rank + ' of ' + day.board.players + ' today.'));
    } else if (day.board && day.board.error) {
      p.textContent = day.board.error;
    } else {
      p.textContent = 'Adding your score...';
    }
    node.appendChild(p);
    var row = G.el('div', 'gm-board-actions');
    row.appendChild(link('See the leaderboard', boardUrl(game)));
    node.appendChild(row);
  }

  var rendering = false;
  function render() {
    var node = panel();
    if (!node || rendering) return;
    rendering = true;
    var date = (G.current && G.current.date) || G.today();
    node.hidden = false;
    if (!node.firstChild) {
      heading(node);
      node.appendChild(G.el('p', 'gm-board-line', 'Checking the leaderboard...'));
    }
    whoAmI().then(function (me) {
      clear(node);
      if (!me.token) return renderSignedOut(node);
      if (!me.nickname) {
        return renderJoin(node, me, function () {
          submit(game, date).then(function () { rendering = false; render(); });
        });
      }
      renderScore(node, me, date);
      var day = G.getDay(game, date);
      if (day && day.done && !day.board && date === G.today()) {
        return submit(game, date).then(function () { rendering = false; render(); });
      }
    }).catch(function () {
      clear(node);
      renderSignedOut(node);
    }).then(function () { rendering = false; });
  }

  document.addEventListener('wd-game:results', function (e) { if (e.detail && e.detail.game === game) render(); });
  document.addEventListener('wd-game:finished', function (e) {
    if (!e.detail || e.detail.date !== G.today()) return;
    submit(e.detail.game, e.detail.date).then(function () { if (panel() && !panel().hidden) { rendering = false; render(); } });
  });
  // Finished earlier (maybe before signing in) but not on the board yet.
  if (game && maybeSignedIn()) {
    var day = G.getDay(game, G.today());
    if (day && day.done && !day.board) submit(game, G.today());
  }

  window.WatchdogGamesBoard = { api: api, token: token, whoAmI: whoAmI, signInUrl: signInUrl, boardUrl: boardUrl, maybeSignedIn: maybeSignedIn, submit: submit };
})();
