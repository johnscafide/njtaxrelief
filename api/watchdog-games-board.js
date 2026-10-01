// Watchdog Games leaderboard: /api/watchdog-games-board
//
//   GET  ?game=all|<game>&period=today|week     public board; with a Bearer
//                                                token it also returns your row
//   GET  ?me=1                                   your nickname (signed in)
//   POST {action:'join', nickname}               pick or change your nickname
//   POST {action:'score', game, date, play}      record a finished daily puzzle
//
// Playing never needs an account. The board does: every write checks the
// player's Watchdog (Supabase) access token, and scores are never taken from
// the browser. The page sends the play itself (its guesses) and this function
// replays it against the real puzzle in api/_watchdog-games-engine.js. Only
// today's puzzle counts, and only the first finished play per day.
//
// Storage: public.watchdog_game_players and public.watchdog_game_scores,
// service role only (supabase/migrations/20261001200000_watchdog_games_leaderboard.sql).
const crypto = require('crypto');
const engine = require('./_watchdog-games-engine.js');

const ALLOWED_HOSTS = new Set(['www.watchdogindex.com', 'watchdogindex.com']);
const AUTOMATION_UA = /\b(?:curl|wget|python-requests|scrapy|go-http-client|libwww-perl|httpclient)\b/i;
const BUDGETS = [
  { bucket: 'games_board_minute', seconds: 60, limit: 30 },
  { bucket: 'games_board_day', seconds: 86400, limit: 400 }
];
const NICKNAME = /^[A-Za-z0-9][A-Za-z0-9 ._'-]{1,18}[A-Za-z0-9.]$/;
const RESERVED = /\b(?:watchdog|admin|administrator|moderator|official|staff|support|njpropertytaxrelief)\b/i;
const BLOCKED = /(?:fuck|shit|cunt|bitch|nigg|fag|slut|whore|dick|cock|pussy|bastard|rape|nazi|hitler|kkk|porn|penis|vagina|retard)/i;

function backend() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('backend unavailable');
  return { url, key };
}
function headers(c, extra) { return Object.assign({ apikey: c.key, Authorization: `Bearer ${c.key}`, Accept: 'application/json' }, extra || {}); }
function requestHost(req) { return String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim().toLowerCase().replace(/:\d+$/, ''); }
function allowedHost(host) { return ALLOWED_HOSTS.has(host) || host.endsWith('.vercel.app') || host === 'localhost' || host === '127.0.0.1'; }
function sameOrigin(req, host) {
  const origin = String(req.headers.origin || '');
  if (!origin) return true;
  try { return new URL(origin).hostname.toLowerCase() === host; } catch (_) { return false; }
}
function bearer(req) { return String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim(); }

async function rest(c, method, pathAndQuery, body, extra) {
  const r = await fetch(`${c.url}/rest/v1/${pathAndQuery}`, {
    method,
    headers: headers(c, Object.assign(body ? { 'Content-Type': 'application/json' } : {}, extra || {})),
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await r.text();
  return { ok: r.ok, status: r.status, data: text ? JSON.parse(text) : null };
}
async function currentUser(c, token) {
  if (!token || token.length > 4096) return null;
  const r = await fetch(`${c.url}/auth/v1/user`, { headers: { apikey: c.key, Authorization: `Bearer ${token}` } });
  if (!r.ok) return null;
  const user = await r.json();
  return user && user.id ? user : null;
}
async function withinBudget(c, userId) {
  const hash = crypto.createHash('sha256').update('games-board|' + userId).digest('hex');
  for (const b of BUDGETS) {
    const r = await rest(c, 'POST', 'rpc/consume_public_request_budget', { p_client_hash: hash, p_bucket: b.bucket, p_window_seconds: b.seconds, p_limit: b.limit });
    const row = Array.isArray(r.data) ? r.data[0] || {} : r.data || {};
    if (!r.ok || row.allowed !== true) return false;
  }
  return true;
}
async function nicknameFor(c, userId) {
  const r = await rest(c, 'GET', `watchdog_game_players?user_id=eq.${encodeURIComponent(userId)}&select=nickname`);
  return r.ok && r.data && r.data[0] ? r.data[0].nickname : null;
}

function weekStart(date) {
  const d = new Date(date + 'T00:00:00Z');
  const back = (d.getUTCDay() + 6) % 7; // Monday
  return new Date(d.getTime() - back * 86400000).toISOString().slice(0, 10);
}
async function board(c, game, period, userId) {
  const today = engine.todayInNewJersey();
  const from = period === 'week' ? weekStart(today) : today;
  const r = await rest(c, 'POST', 'rpc/watchdog_game_board', { p_game: game, p_from: from, p_to: today, p_user: userId || null, p_limit: 25 });
  if (!r.ok) throw new Error('board http ' + r.status);
  const rows = (r.data || []).map((row) => ({ rank: Number(row.rank), name: row.nickname, points: Number(row.points), plays: Number(row.plays), me: Boolean(row.is_me) }));
  return { game, period, from, to: today, players: rows.length ? Number(r.data[0].players) : 0, rows, me: rows.find((x) => x.me) || null };
}

function cleanNickname(value) {
  const name = String(value || '').replace(/\s+/g, ' ').trim();
  if (!NICKNAME.test(name) || !/[A-Za-z]/.test(name)) return { error: 'Use 3 to 20 letters, numbers, spaces, periods, dashes or apostrophes.' };
  if (RESERVED.test(name) || BLOCKED.test(name.replace(/[^A-Za-z]/g, ''))) return { error: 'Please pick a different name.' };
  return { name };
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 16384) throw new Error('body too large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  const host = requestHost(req);
  if (!allowedHost(host) || !sameOrigin(req, host)) return res.status(403).json({ error: 'Not allowed.' });
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  let c;
  try { c = backend(); } catch (_) { return res.status(503).json({ error: 'The leaderboard is not available right now.' }); }
  const token = bearer(req);

  try {
    if (req.method === 'GET') {
      const query = req.query || {};
      const user = token ? await currentUser(c, token) : null;
      if (query.me) {
        res.setHeader('Cache-Control', 'no-store');
        if (!user) return res.status(401).json({ error: 'Sign in to join the leaderboard.' });
        return res.status(200).json({ signed_in: true, nickname: await nicknameFor(c, user.id) });
      }
      const game = String(query.game || 'all');
      const period = query.period === 'week' ? 'week' : 'today';
      if (game !== 'all' && !engine.GAME_IDS.includes(game)) return res.status(400).json({ error: 'Unknown game.' });
      const out = await board(c, game, period, user && user.id);
      res.setHeader('Cache-Control', user ? 'private, no-store' : 'public, max-age=30, s-maxage=60, stale-while-revalidate=120');
      return res.status(200).json(Object.assign(out, { signed_in: Boolean(user) }));
    }

    res.setHeader('Cache-Control', 'no-store');
    if (AUTOMATION_UA.test(String(req.headers['user-agent'] || ''))) return res.status(403).json({ error: 'Not allowed.' });
    const user = await currentUser(c, token);
    if (!user) return res.status(401).json({ error: 'Sign in to join the leaderboard.' });
    if (!(await withinBudget(c, user.id))) return res.status(429).json({ error: 'Too many requests. Try again in a minute.' });
    let body;
    try { body = await readBody(req); } catch (_) { return res.status(400).json({ error: 'Bad request.' }); }

    if (body.action === 'join') {
      const nick = cleanNickname(body.nickname);
      if (nick.error) return res.status(400).json({ error: nick.error });
      const r = await rest(c, 'POST', 'watchdog_game_players?on_conflict=user_id', { user_id: user.id, nickname: nick.name, updated_at: new Date().toISOString() }, { Prefer: 'resolution=merge-duplicates,return=minimal' });
      if (r.status === 409) return res.status(409).json({ error: 'That name is taken. Try another.' });
      if (!r.ok) throw new Error('join http ' + r.status);
      return res.status(200).json({ nickname: nick.name });
    }

    if (body.action === 'score') {
      const game = String(body.game || '');
      const date = String(body.date || '');
      const today = engine.todayInNewJersey();
      if (!engine.GAME_IDS.includes(game)) return res.status(400).json({ error: 'Unknown game.' });
      if (date !== today) return res.status(409).json({ error: 'Only today\'s puzzle counts for the leaderboard.' });
      const nickname = await nicknameFor(c, user.id);
      if (!nickname) return res.status(409).json({ error: 'Pick a leaderboard name first.', need_nickname: true });
      let result;
      try { result = engine.scorePlay(game, date, body.play); } catch (_) { return res.status(400).json({ error: 'That play could not be checked.' }); }
      const ins = await rest(c, 'POST', 'watchdog_game_scores?on_conflict=user_id,game,puzzle_date', {
        user_id: user.id, game, puzzle_date: date, points: result.points, solved: result.solved, detail: result.detail
      }, { Prefer: 'resolution=ignore-duplicates,return=minimal' });
      if (!ins.ok) throw new Error('score http ' + ins.status);
      const saved = await rest(c, 'GET', `watchdog_game_scores?user_id=eq.${encodeURIComponent(user.id)}&game=eq.${encodeURIComponent(game)}&puzzle_date=eq.${date}&select=points,solved`);
      const row = saved.ok && saved.data && saved.data[0] ? saved.data[0] : { points: result.points, solved: result.solved };
      const today_board = await board(c, game, 'today', user.id);
      return res.status(200).json({ nickname, points: row.points, solved: row.solved, rank: today_board.me && today_board.me.rank, players: today_board.players });
    }

    return res.status(400).json({ error: 'Unknown action.' });
  } catch (error) {
    console.error('watchdog-games-board', error && error.message || error);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({ error: 'The leaderboard is not available right now.' });
  }
};

module.exports._internals = { cleanNickname, weekStart };
