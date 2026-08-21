module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  let helperToken = '';
  let helperError = '';
  try {
    const { getVercelOidcToken } = await import('@vercel/oidc');
    helperToken = await getVercelOidcToken({
      project: 'prj_WjkoYFzi04JigQOvvgWiXuC1lC8Q',
      team: 'team_NLnARgwzVf4nYuSMQ3jif2ld',
    }) || '';
  } catch (error) {
    helperError = String(error?.message || error || '').slice(0, 180);
  }
  return res.status(200).json({
    ok: true,
    ai_gateway_api_key_present: Boolean(process.env.AI_GATEWAY_API_KEY),
    vercel_oidc_token_env_present: Boolean(process.env.VERCEL_OIDC_TOKEN),
    vercel_oidc_helper_token_present: Boolean(helperToken),
    vercel_oidc_helper_error: helperError || null,
    watchdog_voice_enabled: String(process.env.WATCHDOG_VOICE_ENABLED || 'true').toLowerCase() !== 'false',
    supabase_service_role_present: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
  });
};
