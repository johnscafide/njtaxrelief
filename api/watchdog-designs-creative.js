const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://uvkvaxljhhngydvlrzom.supabase.co';
const PUBLISHABLE_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa';

function clean(v, n = 500) { return String(v ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n); }
function bearer(req) { const h = String(req.headers.authorization || ''); return h.startsWith('Bearer ') ? h.slice(7).trim() : ''; }
function userHeaders(token) { return { apikey: PUBLISHABLE_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }; }
async function jsonFetch(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) {
    const message = data && typeof data === 'object' ? (data.message || data.error_description || data.error || data.hint || data.details) : data;
    const error = new Error(clean(message || `Request failed (${response.status})`, 500));
    error.status = response.status;
    throw error;
  }
  return data;
}
async function verifyUser(token) {
  if (!token) return null;
  try { return await jsonFetch(`${SUPABASE_URL}/auth/v1/user`, { headers: userHeaders(token) }); } catch { return null; }
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');
  res.setHeader('Vary', 'Authorization');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Method not allowed.' }); }

  try {
    const token = bearer(req);
    const user = await verifyUser(token);
    if (!user?.id) return res.status(401).json({ error: 'Sign in required.' });
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const action = clean(body.action || '', 50);
    const campaignId = clean(body.campaign_id || '', 80);
    if (!campaignId) return res.status(400).json({ error: 'campaign_id is required.' });

    if (action === 'approve_active') {
      const result = await jsonFetch(`${SUPABASE_URL}/rest/v1/rpc/marketing_approve_active_studio_creative`, {
        method: 'POST', headers: userHeaders(token), body: JSON.stringify({ p_campaign_id: campaignId })
      });
      return res.status(200).json({ ok: true, brand: 'Watchdog Designs', result });
    }

    if (action === 'handoff_state') {
      const result = await jsonFetch(`${SUPABASE_URL}/rest/v1/rpc/marketing_pcm_studio_handoff_state`, {
        method: 'POST', headers: userHeaders(token), body: JSON.stringify({ p_campaign_id: campaignId })
      });
      return res.status(200).json({ ok: true, brand: 'Watchdog Designs', result });
    }

    if (action === 'prepare_handoff') {
      const result = await jsonFetch(`${SUPABASE_URL}/rest/v1/rpc/marketing_prepare_pcm_studio_handoff`, {
        method: 'POST', headers: userHeaders(token), body: JSON.stringify({ p_campaign_id: campaignId })
      });
      return res.status(200).json({ ok: true, brand: 'Watchdog Designs', result });
    }

    return res.status(400).json({ error: 'Unsupported Watchdog Designs action.' });
  } catch (error) {
    console.error('watchdog-designs-creative failure', error && error.message ? error.message : 'unknown');
    const status = Number(error?.status || 0);
    return res.status(status >= 400 && status < 500 ? status : 502).json({ error: clean(error?.message || 'Watchdog Designs is temporarily unavailable.', 500) });
  }
};
