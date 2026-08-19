const SUPABASE_URL = 'https://uvkvaxljhhngydvlrzom.supabase.co';
const SUPABASE_KEY = 'sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa';

function bearer(req) {
  const header = String(req.headers.authorization || '');
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

function headers(token) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
}

async function verifyDeveloper(token) {
  if (!token) return false;
  const authHeaders = headers(token);
  const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: authHeaders });
  if (!userResponse.ok) return false;
  const developerResponse = await fetch(`${SUPABASE_URL}/rest/v1/rpc/is_watchdog_developer`, {
    method: 'POST',
    headers: authHeaders,
    body: '{}'
  });
  if (!developerResponse.ok) return false;
  return (await developerResponse.json()) === true;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');
  res.setHeader('Vary', 'Authorization');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  try {
    const token = bearer(req);
    if (!(await verifyDeveloper(token))) return res.status(404).json({ error: 'Not found.' });

    const rawDate = String((req.query && req.query.date) || '').trim();
    if (rawDate && !/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
      return res.status(400).json({ error: 'Invalid recap date.' });
    }

    const select = rawDate
      ? 'recap_date,headline,executive_summary,completed,in_progress,started,remaining,todo,systems,source_notes,updated_at'
      : 'recap_date,headline,executive_summary,systems,updated_at';
    const params = new URLSearchParams({ select, order: 'recap_date.desc', limit: rawDate ? '1' : '180' });
    if (rawDate) params.set('recap_date', `eq.${rawDate}`);

    const response = await fetch(`${SUPABASE_URL}/rest/v1/watchdog_daily_recaps?${params.toString()}`, {
      headers: headers(token)
    });
    if (!response.ok) throw new Error(`recap query failed: ${response.status}`);
    const rows = await response.json();
    if (rawDate && (!Array.isArray(rows) || !rows.length)) return res.status(404).json({ error: 'Recap not found.' });
    return res.status(200).json({ rows });
  } catch (error) {
    console.error('watchdog-recaps failure', error && error.message ? error.message : 'unknown');
    return res.status(503).json({ error: 'Watchdog recap is temporarily unavailable.' });
  }
};
