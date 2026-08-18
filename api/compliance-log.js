const complianceLog = require('./_compliance-data');

const SUPABASE_URL = 'https://uvkvaxljhhngydvlrzom.supabase.co';
const SUPABASE_KEY = 'sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa';

function bearer(req) {
  const header = String(req.headers.authorization || '');
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

async function verifyDeveloper(token) {
  if (!token) return false;
  const headers = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers });
  if (!userResponse.ok) return false;

  const developerResponse = await fetch(`${SUPABASE_URL}/rest/v1/rpc/is_watchdog_developer`, {
    method: 'POST',
    headers,
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
    const allowed = await verifyDeveloper(bearer(req));
    if (!allowed) return res.status(404).json({ error: 'Not found.' });
    return res.status(200).json(complianceLog);
  } catch (error) {
    console.error('compliance-log auth failure', error && error.message ? error.message : 'unknown');
    return res.status(503).json({ error: 'Compliance evidence is temporarily unavailable.' });
  }
};
