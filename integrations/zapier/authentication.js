const { request } = require('./lib/api');

const AUTH_BASE = process.env.WATCHDOG_AUTH_BASE || 'https://uvkvaxljhhngydvlrzom.supabase.co/auth/v1/oauth';

const getAccessToken = async (z, bundle) => {
  const response = await z.request({
    url: `${AUTH_BASE}/token`,
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: {
      grant_type: 'authorization_code',
      code: bundle.inputData.code,
      client_id: process.env.CLIENT_ID,
      client_secret: process.env.CLIENT_SECRET,
      redirect_uri: bundle.inputData.redirect_uri,
      code_verifier: bundle.inputData.code_verifier,
    },
  });
  response.throwForStatus();
  return response.data;
};

const refreshAccessToken = async (z, bundle) => {
  const response = await z.request({
    url: `${AUTH_BASE}/token`,
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: {
      grant_type: 'refresh_token',
      refresh_token: bundle.authData.refresh_token,
      client_id: process.env.CLIENT_ID,
      client_secret: process.env.CLIENT_SECRET,
    },
  });
  response.throwForStatus();
  return response.data;
};

const test = async (z, bundle) => request(z, bundle, '/me');

module.exports = {
  type: 'oauth2',
  test,
  connectionLabel: '{{email}}',
  oauth2Config: {
    authorizeUrl: {
      url: `${AUTH_BASE}/authorize`,
      params: {
        client_id: '{{process.env.CLIENT_ID}}',
        redirect_uri: '{{bundle.inputData.redirect_uri}}',
        response_type: 'code',
        state: '{{bundle.inputData.state}}',
        scope: 'email',
      },
    },
    getAccessToken,
    refreshAccessToken,
    autoRefresh: true,
    enablePkce: true,
  },
};
