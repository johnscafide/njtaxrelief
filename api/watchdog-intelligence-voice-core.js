const narration = require('../property/js/watchdog-intelligence-narration.js');
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://uvkvaxljhhngydvlrzom.supabase.co';
const PUBLISHABLE_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const GATEWAY_TOKEN = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN || '';
const VOICE_ENABLED = String(process.env.WATCHDOG_VOICE_ENABLED || 'true').toLowerCase() !== 'false';
const VOICE_ADDON_FEATURE = 'watchdog_intelligence';
const SPEECH_MODEL = 'fish-audio/s2.1-pro-free';
const TRANSCRIPTION_MODEL = 'fish-audio/transcribe-1-free';
const ENGINE_VERSION = 'watchdog-intelligence-voice-vnext-narration-1';
const MAX_AUDIO_BYTES = 2500000;
const DAILY_LIMITS = { voice_transcription: 40, voice_speech: 60 };
const PLAN_RANK = { standard: 0, agent: 1, pro: 2, pro_plus: 3, teams: 4, developer: 5 };

function clean(value, max = 1000) {
  return String(value ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}
function bearer(req) {
  const header = String(req.headers.authorization || '');
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}
function userHeaders(token) {
  return { apikey: PUBLISHABLE_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}
function adminHeaders(extra = {}) {
  return { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', ...extra };
}
function normalizePlan(value) {
  const plan = clean(value || 'standard', 40).toLowerCase();
  return plan === 'pro+' ? 'pro_plus' : plan;
}
function includedByPlan(plan) {
  return (PLAN_RANK[normalizePlan(plan)] ?? 0) >= PLAN_RANK.pro_plus;
}
function gatewayHeaders(model) {
  return {
    Authorization: `Bearer ${GATEWAY_TOKEN}`,
    'ai-model-id': model,
    'Content-Type': 'application/json',
  };
}
function base64Payload(value, max = 6000000) {
  const raw = String(value || '').trim();
  if (!raw || raw.length > max || !/^[A-Za-z0-9+/=\r\n]+$/.test(raw)) return '';
  return raw.replace(/[\r\n]/g, '');
}
async function jsonFetch(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) {
    const message = data && typeof data === 'object'
      ? (data?.error?.message || data.message || data.error_description || data.error || data.hint)
      : data;
    const error = new Error(clean(message || `Request failed (${response.status})`, 700));
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}
async function verifyUser(token) {
  if (!token) return null;
  try { return await jsonFetch(`${SUPABASE_URL}/auth/v1/user`, { headers: userHeaders(token) }); } catch { return null; }
}
async function entitlement(token) {
  const data = await jsonFetch(`${SUPABASE_URL}/rest/v1/rpc/get_my_entitlement`, {
    method: 'POST', headers: userHeaders(token), body: '{}',
  });
  const row = Array.isArray(data) ? data[0] : data;
  return row && typeof row === 'object' ? row : {};
}
async function developerAccess(token) {
  try {
    const data = await jsonFetch(`${SUPABASE_URL}/rest/v1/rpc/is_watchdog_developer`, {
      method: 'POST', headers: userHeaders(token), body: '{}',
    });
    return data === true;
  } catch (_) {
    return false;
  }
}
async function featureEntitlement(userId, featureKey) {
  const params = new URLSearchParams({
    select: 'status,current_period_end',
    user_id: `eq.${userId}`,
    feature_key: `eq.${featureKey}`,
    limit: '1',
  });
  try {
    const data = await jsonFetch(`${SUPABASE_URL}/rest/v1/account_feature_entitlements?${params.toString()}`, {
      headers: adminHeaders(),
    });
    const row = Array.isArray(data) ? data[0] : data;
    const status = clean(row?.status, 40).toLowerCase();
    if (!row || !['active', 'trialing'].includes(status)) return { active: false, status: status || 'inactive' };
    const periodEnd = row.current_period_end ? Date.parse(row.current_period_end) : NaN;
    if (Number.isFinite(periodEnd) && periodEnd <= Date.now()) return { active: false, status: 'expired' };
    return { active: true, status };
  } catch (_) {
    return { active: false, status: 'unavailable' };
  }
}
async function adminInsert(table, row) {
  return jsonFetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST', headers: adminHeaders({ Prefer: 'return=minimal' }), body: JSON.stringify(row),
  });
}
async function usageCount(userId, eventType) {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const params = new URLSearchParams({
    select: 'id', user_id: `eq.${userId}`, event_type: `eq.${eventType}`,
    created_at: `gte.${start.toISOString()}`,
  });
  const response = await fetch(`${SUPABASE_URL}/rest/v1/intelligence_usage_events?${params.toString()}`, {
    headers: adminHeaders({ Prefer: 'count=exact', Range: '0-0' }),
  });
  if (!response.ok) return 0;
  const range = response.headers.get('content-range') || '';
  const total = Number(range.split('/')[1]);
  return Number.isFinite(total) ? total : 0;
}
async function enforceDailyLimit(userId, eventType) {
  const limit = DAILY_LIMITS[eventType] || 0;
  if (!limit) return;
  const used = await usageCount(userId, eventType);
  if (used >= limit) {
    const error = new Error('Voice Intelligence pilot daily usage limit reached.');
    error.status = 429;
    throw error;
  }
}
async function logUsage({ userId, plan, eventType, model, latencyMs, metadata }) {
  if (!SERVICE_KEY) return;
  try {
    await adminInsert('intelligence_usage_events', {
      user_id: userId,
      plan_tier: plan,
      event_type: eventType,
      provider: 'fish_audio_via_vercel_ai_gateway',
      model,
      request_units: 1,
      input_tokens: 0,
      output_tokens: 0,
      latency_ms: Math.max(0, Math.round(Number(latencyMs || 0))),
      metadata,
    });
  } catch (_) { /* Usage telemetry must not expose or break a valid voice response. */ }
}
function decodeAudio(base64) {
  const value = String(base64 || '').replace(/^data:[^;]+;base64,/, '').trim();
  if (!value || value.length > Math.ceil(MAX_AUDIO_BYTES * 1.45)) {
    const error = new Error('Audio recording is empty or too large.');
    error.status = 413;
    throw error;
  }
  let bytes;
  try { bytes = Buffer.from(value, 'base64'); } catch { bytes = Buffer.alloc(0); }
  if (!bytes.length || bytes.length > MAX_AUDIO_BYTES) {
    const error = new Error('Audio recording is empty or too large.');
    error.status = 413;
    throw error;
  }
  return bytes;
}
function spokenBrief(brief, format) {
  try {
    return narration.formatBrief(brief, format);
  } catch (error) {
    error.status = 400;
    throw error;
  }
}
async function transcribeAudio(audio, mediaType) {
  const started = Date.now();
  const result = await jsonFetch('https://ai-gateway.vercel.sh/v4/ai/transcription-model', {
    method: 'POST',
    headers: gatewayHeaders(TRANSCRIPTION_MODEL),
    body: JSON.stringify({ audio: audio.toString('base64'), mediaType }),
  });
  return { result, latencyMs: Date.now() - started };
}
async function generateSpeech(text) {
  const started = Date.now();
  const result = await jsonFetch('https://ai-gateway.vercel.sh/v4/ai/speech-model', {
    method: 'POST',
    headers: gatewayHeaders(SPEECH_MODEL),
    body: JSON.stringify({ text, outputFormat: 'mp3' }),
  });
  return { result, latencyMs: Date.now() - started };
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');
  res.setHeader('Vary', 'Authorization');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  if (!SERVICE_KEY) return res.status(503).json({ error: 'Voice Intelligence server configuration is incomplete.' });

  try {
    const token = bearer(req);
    const user = await verifyUser(token);
    if (!user?.id) return res.status(401).json({ error: 'Sign in required.' });

    const [access, developer] = await Promise.all([entitlement(token), developerAccess(token)]);
    const plan = developer ? 'developer' : normalizePlan(access?.plan_tier || 'standard');
    const included = includedByPlan(plan);
    const addon = ['agent', 'pro'].includes(plan)
      ? await featureEntitlement(user.id, VOICE_ADDON_FEATURE)
      : { active: false, status: 'not_applicable' };
    const allowed = included || (['agent', 'pro'].includes(plan) && addon.active);
    const packaging = included ? 'included' : addon.active ? 'watchdog_intelligence_add_on' : 'watchdog_intelligence_add_on_required';
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const action = clean(body.action || 'status', 40);

    if (action === 'status') {
      return res.status(200).json({
        ok: true,
        engine_version: ENGINE_VERSION,
        narration_version: narration.VERSION,
        narration_formats: narration.FORMAT_ORDER,
        enabled: VOICE_ENABLED && Boolean(GATEWAY_TOKEN) && allowed,
        configured: Boolean(GATEWAY_TOKEN),
        rollout_enabled: VOICE_ENABLED,
        eligible: allowed,
        plan,
        packaging,
        addon_active: Boolean(addon.active),
        models: { transcription: TRANSCRIPTION_MODEL, speech: SPEECH_MODEL },
        raw_audio_persisted: false,
        offer_guard: 'free-model suffix; stops serving after provider promotion instead of auto-billing',
      });
    }

    if (!VOICE_ENABLED) return res.status(503).json({ error: 'Voice Intelligence is temporarily disabled.' });
    if (!allowed) return res.status(403).json({ error: 'Voice Intelligence requires Pro+ or Teams, or an active Watchdog Intelligence add-on for Agent or Pro.' });
    if (!GATEWAY_TOKEN) return res.status(503).json({ error: 'Voice Intelligence provider authentication is not configured.' });

    if (action === 'transcribe') {
      await enforceDailyLimit(user.id, 'voice_transcription');
      const mediaType = clean(body.media_type || 'audio/webm', 120).toLowerCase();
      if (!mediaType.startsWith('audio/')) return res.status(415).json({ error: 'Unsupported audio type.' });
      const audio = decodeAudio(body.audio_base64);
      const { result, latencyMs } = await transcribeAudio(audio, mediaType);
      const text = clean(result?.text, 1800);
      if (!text) return res.status(502).json({ error: 'The voice provider returned no transcript.' });
      await logUsage({
        userId: user.id,
        plan,
        eventType: 'voice_transcription',
        model: TRANSCRIPTION_MODEL,
        latencyMs,
        metadata: {
          media_type: mediaType,
          audio_bytes: audio.length,
          duration_seconds: Number(result?.durationInSeconds || 0) || null,
          transcript_chars: text.length,
          segment_count: Array.isArray(result?.segments) ? result.segments.length : 0,
          raw_audio_persisted: false,
          packaging,
        },
      });
      return res.status(200).json({ ok: true, text, duration_seconds: Number(result?.durationInSeconds || 0) || null, model: TRANSCRIPTION_MODEL });
    }

    if (action === 'speak') {
      await enforceDailyLimit(user.id, 'voice_speech');
      const rendered = spokenBrief(body.brief, clean(body.format || body?.brief?.format || 'quick', 40).toLowerCase());
      const { result, latencyMs } = await generateSpeech(rendered.text);
      const audio = base64Payload(result?.audio);
      if (!audio) return res.status(502).json({ error: 'The voice provider returned invalid or empty audio.' });
      const outputBytes = Math.floor(audio.length * 0.75);
      await logUsage({
        userId: user.id,
        plan,
        eventType: 'voice_speech',
        model: SPEECH_MODEL,
        latencyMs,
        metadata: {
          narration_format: rendered.format,
          narration_version: rendered.version,
          text_chars: rendered.text.length,
          output_bytes_estimate: outputBytes,
          raw_audio_persisted: false,
          source: rendered.source,
          packaging,
        },
      });
      return res.status(200).json({
        ok: true,
        audio_base64: audio,
        media_type: 'audio/mpeg',
        model: SPEECH_MODEL,
        narration_format: rendered.format,
        narration_version: rendered.version,
      });
    }

    return res.status(400).json({ error: 'Unsupported Voice Intelligence action.' });
  } catch (error) {
    const status = Number(error?.status) >= 400 && Number(error?.status) < 600 ? Number(error.status) : 500;
    console.error('[Watchdog Intelligence Voice]', clean(error?.message || error, 700));
    return res.status(status).json({ error: clean(error?.message || 'Voice Intelligence request failed.', 700) });
  }
};
