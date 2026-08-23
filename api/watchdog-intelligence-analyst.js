const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://uvkvaxljhhngydvlrzom.supabase.co';
const PUBLISHABLE_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa';

const clean = (value, max = 1000) => String(value ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');
  res.setHeader('Vary', 'Authorization');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });

  const authorization = String(req.headers.authorization || '');
  if (!authorization.startsWith('Bearer ')) return res.status(401).json({ error: 'Sign in required' });

  const input = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  const body = {
    prompt: clean(input.prompt, 1800),
    session_id: clean(input.session_id, 80) || null,
    context: input.context && typeof input.context === 'object' && !Array.isArray(input.context) ? input.context : {},
  };
  if (!body.prompt) return res.status(400).json({ error: 'prompt is required' });

  try {
    const upstream = await fetch(`${SUPABASE_URL}/functions/v1/intelligence-analyst`, {
      method: 'POST',
      headers: {
        apikey: PUBLISHABLE_KEY,
        Authorization: authorization,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json; charset=utf-8');
    return res.send(text);
  } catch (error) {
    return res.status(502).json({ error: clean(error && error.message || 'Watchdog Analyst transport unavailable.', 500) });
  }
};
