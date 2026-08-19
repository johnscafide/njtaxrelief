const API_BASE = process.env.WATCHDOG_ZAPIER_API_BASE || 'https://uvkvaxljhhngydvlrzom.supabase.co/functions/v1/zapier-api';

const addAuth = (request, z, bundle) => {
  request.headers = request.headers || {};
  request.headers['X-Watchdog-Key'] = bundle.authData.apiKey;
  request.headers['Content-Type'] = 'application/json';
  return request;
};

const api = async (z, bundle, action, data = {}) => {
  const response = await z.request({
    url: API_BASE,
    method: 'POST',
    body: { action, ...data },
  });
  return response.data;
};

module.exports = { API_BASE, addAuth, api };
