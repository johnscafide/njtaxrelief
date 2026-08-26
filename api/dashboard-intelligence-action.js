const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://uvkvaxljhhngydvlrzom.supabase.co';
const PUBLISHABLE_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const ACTIONS = new Set(['reviewed', 'dismissed', 'assigned', 'unassigned', 'watch']);
const EVENT_MAP = { reviewed: 'reviewed', dismissed: 'dismissed', assigned: 'assigned', unassigned: 'unassigned', watch: 'watch_started' };

const clean = (value, max = 800) => String(value ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const bearer = (req) => {
  const header = String(req.headers.authorization || '');
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
};
const userHeaders = (token) => ({ apikey: PUBLISHABLE_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });
const adminHeaders = (extra = {}) => ({ apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', ...extra });

async function jsonFetch(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) {
    const message = data && typeof data === 'object' ? (data?.error?.message || data.message || data.error || data.hint) : data;
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

async function selectOne(table, params) {
  const query = new URLSearchParams(params);
  const data = await jsonFetch(`${SUPABASE_URL}/rest/v1/${table}?${query.toString()}`, { headers: adminHeaders() });
  return Array.isArray(data) ? data[0] || null : data || null;
}

async function insert(table, row) {
  return jsonFetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: adminHeaders({ Prefer: 'return=representation' }),
    body: JSON.stringify(row),
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');
  res.setHeader('Vary', 'Authorization');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  if (!SERVICE_KEY) return res.status(503).json({ error: 'Dashboard action service is unavailable.' });

  try {
    const token = bearer(req);
    const user = await verifyUser(token);
    if (!user?.id) return res.status(401).json({ error: 'Sign in required.' });

    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    const findingId = clean(body.finding_id, 80);
    const action = clean(body.action, 30).toLowerCase();
    if (!findingId) return res.status(400).json({ error: 'finding_id is required.' });
    if (!ACTIONS.has(action)) return res.status(400).json({ error: 'Unsupported dashboard action.' });

    const finding = await selectOne('intelligence_findings', {
      select: 'id,run_id,user_id,pams_pin,property_address,evidence,facts_hash,opportunity_type',
      id: `eq.${findingId}`,
      user_id: `eq.${user.id}`,
      limit: '1',
    });
    if (!finding) return res.status(404).json({ error: 'Finding not found.' });

    const run = await selectOne('intelligence_runs', {
      select: 'id,user_id,model_key,model_version',
      id: `eq.${finding.run_id}`,
      user_id: `eq.${user.id}`,
      limit: '1',
    });
    if (!run) return res.status(409).json({ error: 'Finding run lineage is unavailable.' });

    let artifactId = null;
    if (action === 'watch') {
      if (!finding.pams_pin) return res.status(400).json({ error: 'This finding is not tied to a property that can be watched.' });
      const existing = await selectOne('saved_properties', {
        select: 'id',
        user_id: `eq.${user.id}`,
        pams_pin: `eq.${finding.pams_pin}`,
        kind: 'eq.watch',
        limit: '1',
      });
      if (existing?.id) artifactId = existing.id;
      else {
        const created = await insert('saved_properties', {
          user_id: user.id,
          pams_pin: finding.pams_pin,
          address: clean(finding.property_address || finding.pams_pin, 300),
          kind: 'watch',
          notes: 'Added from Watchdog Dashboard finding review.',
        });
        const row = Array.isArray(created) ? created[0] : created;
        artifactId = row?.id || null;
      }
    }

    const metadata = {
      source: 'dashboard_command_center',
      action,
      opportunity_type: clean(finding.opportunity_type, 100) || null,
    };
    if (action === 'assigned') metadata.assigned_to_user_id = user.id;
    if (action === 'unassigned') metadata.unassigned_by_user_id = user.id;

    const createdOutcome = await insert('intelligence_outcome_events', {
      finding_id: finding.id,
      run_id: finding.run_id,
      user_id: user.id,
      event_type: EVENT_MAP[action],
      artifact_type: action === 'watch' ? 'watch' : null,
      artifact_id: artifactId ? String(artifactId) : null,
      model_key: clean(run.model_key, 120) || 'unknown',
      model_version: Number(run.model_version || 1),
      facts_hash: clean(finding.facts_hash, 120) || null,
      signal_snapshot: Array.isArray(finding.evidence) ? finding.evidence : [],
      assumption_snapshot: {},
      scenario_snapshot: {},
      metadata,
      outcome_key: `dashboard:${action}:${finding.id}:${Date.now()}`,
    });
    const outcome = Array.isArray(createdOutcome) ? createdOutcome[0] : createdOutcome;

    return res.status(200).json({
      ok: true,
      action,
      finding_id: finding.id,
      event_type: EVENT_MAP[action],
      outcome_id: outcome?.id || null,
      artifact_id: artifactId,
      assigned_to_me: action === 'assigned',
      dismissed: action === 'dismissed',
      watched: action === 'watch',
    });
  } catch (error) {
    const status = Number(error?.status) >= 400 && Number(error.status) < 600 ? Number(error.status) : 500;
    console.error('[Dashboard Intelligence Action]', clean(error?.message || error, 500));
    return res.status(status).json({ error: clean(error?.message || 'Dashboard action failed.', 500) });
  }
};
