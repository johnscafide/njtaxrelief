const API_BASE = process.env.WATCHDOG_API_BASE || 'https://uvkvaxljhhngydvlrzom.supabase.co/functions/v1/integration-zapier-api';
const PUBLISHABLE_KEY = process.env.WATCHDOG_PUBLISHABLE_KEY || '';

const headers = (bundle) => {
  if (!PUBLISHABLE_KEY) throw new Error('WATCHDOG_PUBLISHABLE_KEY is not configured for this Zapier app version.');
  return {
    Authorization: `Bearer ${bundle.authData.access_token}`,
    apikey: PUBLISHABLE_KEY,
    'Content-Type': 'application/json',
  };
};

const request = async (z, bundle, path, options = {}) => {
  const response = await z.request({
    url: `${API_BASE}${path}`,
    method: options.method || 'GET',
    headers: { ...headers(bundle), ...(options.headers || {}) },
    body: options.body,
    params: options.params,
  });
  response.throwForStatus();
  return response.data;
};

module.exports = { API_BASE, request };
