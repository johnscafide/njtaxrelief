// Watchdog Games daily puzzles: GET /api/watchdog-games?game=<id>&date=YYYY-MM-DD
//
// Games: sold, town-shapes, pin-drop, lineup, fair-or-unfair, blocks. One
// puzzle per game per day, the same for everyone. Only today's and past
// puzzles are served, so the archive works but nobody can read ahead. The
// puzzles themselves are built in api/_watchdog-games-engine.js.
const engine = require('./_watchdog-games-engine.js');

module.exports = function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const query = req.query || {};
  const game = String(query.game || '').toLowerCase();
  const today = engine.todayInNewJersey();
  const date = String(query.date || today);
  if (!engine.GAME_IDS.includes(game)) return res.status(400).json({ error: 'Unknown game.' });
  if (!engine.validDate(date)) return res.status(400).json({ error: 'Use a date like 2026-10-01.' });
  if (date < engine.LAUNCH_DATE || date > today) {
    return res.status(404).json({ error: 'No puzzle for that day.', today, launch: engine.LAUNCH_DATE });
  }
  try {
    const puzzle = Object.assign({}, engine.puzzleFor(game, date), { today });
    res.setHeader('Cache-Control', date === today
      ? 'public, max-age=120, s-maxage=600, stale-while-revalidate=600'
      : 'public, max-age=86400, s-maxage=604800');
    if (req.method === 'HEAD') return res.status(200).end();
    return res.status(200).json(puzzle);
  } catch (error) {
    console.error('watchdog-games', game, date, error && error.message || error);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({ error: 'Today\'s puzzle is not available right now.' });
  }
};

module.exports._internals = engine._internals;
