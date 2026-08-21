module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  return res.status(200).json({
    ok: true,
    ai_gateway_api_key_present: Boolean(process.env.AI_GATEWAY_API_KEY),
    vercel_oidc_token_present: Boolean(process.env.VERCEL_OIDC_TOKEN),
    watchdog_voice_enabled: String(process.env.WATCHDOG_VOICE_ENABLED || 'true').toLowerCase() !== 'false',
    supabase_service_role_present: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
  });
};
