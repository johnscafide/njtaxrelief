const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://uvkvaxljhhngydvlrzom.supabase.co';
const PUBLISHABLE_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const FEATURE = 'watchdog_intelligence';
const PLAN_RANK = { standard: 0, agent: 1, pro: 2, pro_plus: 3, teams: 4, developer: 5 };
const DAILY_LIMITS = { transcription: 40, speech: 60 };
const NARRATION_EVENTS = new Set(['narration_started', 'narration_completed', 'narration_stopped', 'narration_failed']);
const QUERY_LIFECYCLE_EVENTS = new Set(['query_submitted', 'query_converted']);
const VOICE_EVENTS = new Set([...NARRATION_EVENTS, ...QUERY_LIFECYCLE_EVENTS]);
const NARRATION_FORMATS = new Set(['quick', 'professional', 'evidence', 'changes']);
const TRANSCRIPTION_PROVIDERS = new Map([
  ['fish-audio/transcribe-1-free', 'fish_audio_via_vercel_ai_gateway'],
  ['browser_speech_recognition', 'browser_web_speech'],
]);

const clean = (value, max = 500) => String(value ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const bearer = (req) => {
  const header = String(req.headers.authorization || '');
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
};
const userHeaders = (token) => ({ apikey: PUBLISHABLE_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });
const adminHeaders = (extra = {}) => ({ apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', ...extra });
const normalizePlan = (value) => {
  const plan = clean(value || 'standard', 40).toLowerCase();
  return plan === 'pro+' ? 'pro_plus' : plan;
};

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

async function entitlement(token) {
  const data = await jsonFetch(`${SUPABASE_URL}/rest/v1/rpc/get_my_entitlement`, { method: 'POST', headers: userHeaders(token), body: '{}' });
  const row = Array.isArray(data) ? data[0] : data;
  return row && typeof row === 'object' ? row : {};
}

async function developerAccess(token) {
  try {
    const data = await jsonFetch(`${SUPABASE_URL}/rest/v1/rpc/is_watchdog_developer`, { method: 'POST', headers: userHeaders(token), body: '{}' });
    return data === true;
  } catch {
    return false;
  }
}

async function featureActive(userId) {
  const params = new URLSearchParams({ select: 'status,current_period_end', user_id: `eq.${userId}`, feature_key: `eq.${FEATURE}`, limit: '1' });
  try {
    const data = await jsonFetch(`${SUPABASE_URL}/rest/v1/account_feature_entitlements?${params.toString()}`, { headers: adminHeaders() });
    const row = Array.isArray(data) ? data[0] : data;
    const status = clean(row?.status, 40).toLowerCase();
    if (!row || !['active', 'trialing'].includes(status)) return false;
    const end = row.current_period_end ? Date.parse(row.current_period_end) : NaN;
    return !Number.isFinite(end) || end > Date.now();
  } catch { return false; }
}

async function usageCount(userId, eventType) {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const params = new URLSearchParams({ select: 'id', user_id: `eq.${userId}`, event_type: `eq.${eventType}`, created_at: `gte.${start.toISOString()}` });
  const response = await fetch(`${SUPABASE_URL}/rest/v1/intelligence_usage_events?${params.toString()}`, { headers: adminHeaders({ Prefer: 'count=exact', Range: '0-0' }) });
  if (!response.ok) return 0;
  const total = Number((response.headers.get('content-range') || '').split('/')[1]);
  return Number.isFinite(total) ? total : 0;
}

async function insertUsage(row) {
  return jsonFetch(`${SUPABASE_URL}/rest/v1/intelligence_usage_events`, {
    method: 'POST',
    headers: adminHeaders({ Prefer: 'return=minimal' }),
    body: JSON.stringify(row),
  });
}

function safeNarrationMetadata(input, packaging) {
  const value = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const requestedFormat = clean(value.format, 40).toLowerCase();
  const textChars = Number(value.text_chars);
  return {
    browser_native: true,
    raw_audio_persisted: false,
    source: 'rendered_governed_analyst_response',
    packaging,
    narration_format: NARRATION_FORMATS.has(requestedFormat) ? requestedFormat : null,
    narration_version: clean(value.narration_version, 80) || null,
    engine: clean(value.engine, 80) || 'browser_speech_synthesis',
    text_chars: Number.isFinite(textChars) ? Math.max(0, Math.min(2400, Math.round(textChars))) : null,
    surface: clean(value.surface, 100) || 'unknown',
  };
}

function safeQueryLifecycleMetadata(input, packaging) {
  const value = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const reviewedMs = Number(value.reviewed_ms);
  return {
    source: 'reviewed_voice_transcript',
    packaging,
    edited: value.edited === true,
    reviewed_ms: Number.isFinite(reviewedMs) ? Math.max(0, Math.min(600000, Math.round(reviewedMs))) : null,
    surface: clean(value.surface, 100) || 'unknown',
    raw_audio_persisted: false,
    transcript_content_persisted: false,
    prompt_content_persisted: false,
  };
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
  if (!SERVICE_KEY) return res.status(503).json({ error: 'Voice usage telemetry is unavailable.' });

  try {
    const token = bearer(req);
    const user = await verifyUser(token);
    if (!user?.id) return res.status(401).json({ error: 'Sign in required.' });

    const [access, developer] = await Promise.all([entitlement(token), developerAccess(token)]);
    const accountRole = clean(access?.account_role, 40).toLowerCase();
    const plan = developer || accountRole === 'developer' ? 'developer' : normalizePlan(access?.plan_tier || 'standard');
    const included = (PLAN_RANK[plan] ?? 0) >= PLAN_RANK.pro_plus;
    const addon = ['agent', 'pro'].includes(plan) ? await featureActive(user.id) : false;
    if (!(included || addon)) return res.status(403).json({ error: 'Voice Intelligence is not included with this account.' });

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const kind = clean(body.kind, 30).toLowerCase();
    const packaging = included ? 'included' : 'watchdog_intelligence_add_on';

    if (kind === 'event') {
      const event = clean(body.event, 40).toLowerCase();
      if (!VOICE_EVENTS.has(event)) return res.status(400).json({ error: 'Unsupported Voice event.' });
      const queryLifecycle = QUERY_LIFECYCLE_EVENTS.has(event);
      const requestedModel = clean(body.model, 100).toLowerCase();
      const provider = queryLifecycle ? (TRANSCRIPTION_PROVIDERS.get(requestedModel) || 'voice_input_review') : 'browser_web_speech';
      const model = queryLifecycle ? (TRANSCRIPTION_PROVIDERS.has(requestedModel) ? requestedModel : 'reviewed_voice_transcript') : 'browser_speech_synthesis';
      await insertUsage({
        user_id: user.id,
        plan_tier: plan,
        event_type: `voice_${event}`,
        provider,
        model,
        request_units: 0,
        input_tokens: 0,
        output_tokens: 0,
        latency_ms: 0,
        metadata: queryLifecycle ? safeQueryLifecycleMetadata(body.metadata, packaging) : safeNarrationMetadata(body.metadata, packaging),
      });
      return res.status(200).json({ ok: true, kind, event });
    }

    if (!['transcription', 'speech'].includes(kind)) return res.status(400).json({ error: 'Unsupported browser Voice usage type.' });
    const eventType = kind === 'speech' ? 'voice_speech' : 'voice_transcription';
    const used = await usageCount(user.id, eventType);
    const limit = DAILY_LIMITS[kind];
    if (used >= limit) return res.status(429).json({ error: 'Voice Intelligence daily usage limit reached.' });

    const narrationMetadata = kind === 'speech' ? safeNarrationMetadata(body.metadata, packaging) : null;
    await insertUsage({
      user_id: user.id,
      plan_tier: plan,
      event_type: eventType,
      provider: 'browser_web_speech',
      model: kind === 'speech' ? 'browser_speech_synthesis' : 'browser_speech_recognition',
      request_units: 1,
      input_tokens: 0,
      output_tokens: 0,
      latency_ms: 0,
      metadata: kind === 'speech' ? narrationMetadata : {
        browser_native: true,
        raw_audio_persisted: false,
        source: 'browser_voice_question',
        packaging,
      },
    });
    return res.status(200).json({ ok: true, kind, remaining: Math.max(0, limit - used - 1) });
  } catch (error) {
    const status = Number(error?.status) >= 400 && Number(error?.status) < 600 ? Number(error.status) : 500;
    console.error('[Watchdog Browser Voice Usage]', clean(error?.message || error, 500));
    return res.status(status).json({ error: clean(error?.message || 'Voice usage telemetry failed.', 500) });
  }
};
