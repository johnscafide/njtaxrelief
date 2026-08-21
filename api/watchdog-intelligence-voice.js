const PROJECT_ID = process.env.VERCEL_PROJECT_ID || 'prj_WjkoYFzi04JigQOvvgWiXuC1lC8Q';
const TEAM_ID = process.env.VERCEL_TEAM_ID || 'team_NLnARgwzVf4nYuSMQ3jif2ld';

async function refreshGatewayIdentity() {
  if (process.env.AI_GATEWAY_API_KEY) return 'api_key';
  try {
    const { getVercelOidcToken } = await import('@vercel/oidc');
    const token = await getVercelOidcToken({ project: PROJECT_ID, team: TEAM_ID });
    if (token) {
      process.env.VERCEL_OIDC_TOKEN = token;
      return 'oidc_request_context';
    }
  } catch (error) {
    console.error('[Watchdog Intelligence Voice Auth]', String(error?.message || error || '').slice(0, 300));
  }
  delete process.env.VERCEL_OIDC_TOKEN;
  return 'unconfigured';
}

module.exports = async function handler(req, res) {
  const authPath = await refreshGatewayIdentity();
  res.setHeader('X-Watchdog-Voice-Provider-Auth', authPath);
  const corePath = require.resolve('./watchdog-intelligence-voice-core');
  delete require.cache[corePath];
  const core = require(corePath);
  return core(req, res);
};
