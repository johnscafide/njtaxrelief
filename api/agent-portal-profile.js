const crypto = require('crypto');

const AUTOMATION_UA = /\b(?:curl|wget|python-requests|scrapy|go-http-client|libwww-perl|httpclient)\b/i;
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$/;
const BUDGETS = [
  { bucket: 'agent_portal_profile_minute', seconds: 60, limit: 30 },
  { bucket: 'agent_portal_profile_hour', seconds: 3600, limit: 180 }
];

function backend() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('security backend unavailable');
  return { url, key };
}

function clientHash(req, key) {
  const forwarded = String(req.headers && req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  if (!forwarded) return '';
  return crypto.createHmac('sha256', key).update(forwarded).digest('hex');
}

async function rpc(name, body, config) {
  const response = await fetch(`${config.url}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`${name} http ${response.status}`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function recordEvent(config, type, hash, slug, automationHint, detail = {}) {
  try {
    await rpc('record_public_request_security_event', {
      p_event_type: type,
      p_client_hash: hash || null,
      p_route: '/api/agent-portal-profile',
      p_scope: slug || null,
      p_automation_hint: Boolean(automationHint),
      p_detail: detail
    }, config);
  } catch (err) {
    console.error('agent-portal-profile security-event', err && err.message || err);
  }
}

async function gate(req, slug, automationHint) {
  const config = backend();
  const hash = clientHash(req, config.key);
  if (!hash) throw new Error('client identity unavailable');

  if (automationHint) {
    await recordEvent(config, 'automation_client_blocked', hash, slug, true);
    return { allowed: false, automation: true };
  }

  const checks = [];
  for (const budget of BUDGETS) {
    const rows = await rpc('consume_public_request_budget', {
      p_client_hash: hash,
      p_bucket: budget.bucket,
      p_window_seconds: budget.seconds,
      p_limit: budget.limit
    }, config);
    checks.push({ budget, row: Array.isArray(rows) ? rows[0] || {} : rows || {} });
  }

  const blocked = checks.filter((item) => item.row.allowed !== true);
  if (blocked.length) {
    await recordEvent(config, 'rate_limited', hash, slug, false);
    const reset = Math.max(...blocked.map((item) => Date.parse(item.row.reset_at) || Date.now() + 60000));
    return { allowed: false, retryAfter: Math.max(1, Math.ceil((reset - Date.now()) / 1000)) };
  }

  return { allowed: true, config, hash };
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=900');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const slug = String(req.query && req.query.slug || '').trim().toLowerCase().slice(0, 40);
  const automationHint = AUTOMATION_UA.test(String(req.headers && req.headers['user-agent'] || ''));

  let access;
  try {
    access = await gate(req, slug || 'unknown', automationHint);
  } catch (err) {
    console.error('agent-portal-profile rate-limit', err && err.message || err);
    res.setHeader('Retry-After', '60');
    return res.status(503).json({ error: 'Agent portal is temporarily unavailable.' });
  }

  if (access.automation) {
    console.warn('agent-portal-profile', JSON.stringify({ event: 'automation_client_blocked' }));
    return res.status(403).json({ error: 'Automated extraction is not supported on this endpoint.' });
  }
  if (!access.allowed) {
    console.warn('agent-portal-profile', JSON.stringify({ event: 'rate_limited' }));
    res.setHeader('Retry-After', String(access.retryAfter || 60));
    return res.status(429).json({ error: 'Request limit exceeded. Please retry later.' });
  }

  if (!SLUG_RE.test(slug)) {
    console.warn('agent-portal-profile', JSON.stringify({ event: 'invalid_scope', slug_length: slug.length }));
    await recordEvent(access.config, 'invalid_scope', access.hash, slug || 'unknown', false, { slug_length: slug.length });
    return res.status(400).json({ error: 'A valid agent portal slug is required.' });
  }

  try {
    const profile = await rpc('get_public_agent_portal_profile', { p_slug: slug }, access.config);
    if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
      return res.status(404).json({ available: false });
    }
    try {
      await rpc('record_agent_portal_view', { p_slug: slug }, access.config);
    } catch (analyticsErr) {
      console.error('agent-portal-profile analytics', analyticsErr && analyticsErr.message || analyticsErr);
    }
    return res.status(200).json({ available: true, profile });
  } catch (err) {
    console.error('agent-portal-profile', err && err.message || err);
    return res.status(500).json({ error: 'Agent portal is temporarily unavailable.' });
  }
};
