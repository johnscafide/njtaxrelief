const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://uvkvaxljhhngydvlrzom.supabase.co';
const PUBLISHABLE_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const OPENAI_KEY = process.env.OPENAI_API_KEY || '';
const IMAGE_MODEL = process.env.WATCHDOG_IMAGE_MODEL_OPENAI || 'gpt-image-2';
const BUCKET = 'marketing-intelligence-visuals';
const ENGINE_VERSION = 'watchdog-studio-visual-openai-v1';
const PLAN_RANK = { standard: 0, agent: 1, pro: 2, pro_plus: 3, teams: 4, developer: 5 };

function clean(v, n = 500) { return String(v ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n); }
function safe(v, max = 20000) { if (!v || typeof v !== 'object' || Array.isArray(v)) return {}; try { return JSON.stringify(v).length <= max ? v : {}; } catch { return {}; } }
function bearer(req) { const h = String(req.headers.authorization || ''); return h.startsWith('Bearer ') ? h.slice(7).trim() : ''; }
function allowed(plan, minimum) { return (PLAN_RANK[plan] ?? 0) >= (PLAN_RANK[minimum] ?? 99); }
function pathEncode(path) { return String(path || '').split('/').map(encodeURIComponent).join('/'); }
function sha256(value) { return require('node:crypto').createHash('sha256').update(value).digest('hex'); }
function userHeaders(token) { return { apikey: PUBLISHABLE_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }; }
function adminHeaders(extra = {}) { return { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', ...extra }; }

async function jsonFetch(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) {
    const raw = data && typeof data === 'object'
      ? (data?.error?.message || data.message || data.error_description || data.error || data.hint)
      : data;
    const error = new Error(clean(raw || `Request failed (${response.status})`, 700));
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}
async function adminSelect(table, params) {
  const q = params instanceof URLSearchParams ? params : new URLSearchParams(params || {});
  return jsonFetch(`${SUPABASE_URL}/rest/v1/${table}?${q.toString()}`, { headers: adminHeaders({ Accept: 'application/json' }) });
}
async function adminInsert(table, row) {
  return jsonFetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST', headers: adminHeaders({ Prefer: 'return=representation' }), body: JSON.stringify(row)
  });
}
async function adminPatch(table, query, row, representation = false) {
  return jsonFetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    method: 'PATCH', headers: adminHeaders({ Prefer: representation ? 'return=representation' : 'return=minimal' }), body: JSON.stringify(row)
  });
}
async function verifyUser(token) {
  if (!token) return null;
  try { return await jsonFetch(`${SUPABASE_URL}/auth/v1/user`, { headers: userHeaders(token) }); } catch { return null; }
}
async function bootstrap(token) {
  return jsonFetch(`${SUPABASE_URL}/rest/v1/rpc/marketing_studio_bootstrap`, { method: 'POST', headers: userHeaders(token), body: '{}' });
}
async function ownedCampaign(userId, campaignId) {
  const q = new URLSearchParams({ select: 'id,user_id,name,goal,profession,settings', id: `eq.${campaignId}`, user_id: `eq.${userId}`, limit: '1' });
  const rows = await adminSelect('marketing_campaigns', q);
  return Array.isArray(rows) ? rows[0] || null : null;
}
async function signedUrl(path, expiresIn = 3600) {
  if (!path) return null;
  try {
    const data = await jsonFetch(`${SUPABASE_URL}/storage/v1/object/sign/${BUCKET}/${pathEncode(path)}`, {
      method: 'POST', headers: adminHeaders(), body: JSON.stringify({ expiresIn })
    });
    const raw = data?.signedURL || data?.signedUrl || null;
    if (!raw) return null;
    return /^https?:/i.test(raw) ? raw : `${SUPABASE_URL}/storage/v1${raw}`;
  } catch { return null; }
}
async function upload(path, bytes, mime) {
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${pathEncode(path)}`, {
    method: 'POST', headers: adminHeaders({ 'Content-Type': mime, 'x-upsert': 'false', 'Cache-Control': '3600' }), body: bytes
  });
  if (!response.ok) throw new Error(`Visual storage upload failed (${response.status})`);
}
async function logEvent(userId, campaignId, eventType, payload) {
  try {
    await adminInsert('marketing_events', { user_id: userId, campaign_id: campaignId, event_type: eventType, source: 'watchdog_intelligence', payload });
  } catch (_) { /* observability must not break generation */ }
}

function stylePrompt(campaign, briefRow, variant, preset) {
  const art = safe(preset?.art_direction, 5000);
  const brief = safe(briefRow?.brief, 7000);
  const manifest = safe(briefRow?.input_manifest, 12000);
  const brand = safe(manifest?.brand, 5000);
  const brandName = clean(brand?.company || brand?.brokerage || brand?.display_name || brand?.name || '', 120);
  const profession = clean(briefRow?.profession || campaign?.profession || 'real estate professional', 80);
  const goal = clean(briefRow?.goal || campaign?.goal || 'local property campaign', 100).replaceAll('_', ' ');
  const direction = clean(variant?.visual_prompt || variant?.visual_direction || brief?.visual_direction || 'premium local property visual', 1200);
  return [
    'Create a premium BACKGROUND ART ASSET for a professional direct-mail postcard campaign.',
    'The final postcard is landscape 6 x 8.5 inches. PCM will control all mechanical print layout, bleed, safe zones, address blocks, barcode areas and postal indicia later.',
    'This is Watchdog preview art only. Make it a flexible hero/background crop with useful negative space for copy placed separately.',
    `Campaign profession: ${profession}.`,
    `Campaign objective: ${goal}.`,
    brandName ? `Brand context: ${brandName}. Do not draw or invent a logo.` : 'Brand context: professional and locally credible.',
    `Creative concept: ${direction}.`,
    `Style preset: ${clean(preset?.label || preset?.preset_key || 'Studio', 100)}.`,
    art?.mood ? `Mood: ${clean(art.mood, 300)}.` : '',
    art?.composition ? `Composition: ${clean(art.composition, 500)}.` : '',
    art?.texture ? `Texture/light: ${clean(art.texture, 300)}.` : '',
    'Hard requirements: no words, no typography, no letters, no numbers, no logos, no QR codes, no watermarks, no postal marks, no indicia, no barcodes, no readable house numbers, no identifiable street address, no identifiable people, no faces and no political signs.',
    'Do not depict or imply protected characteristics, demographic categories, distress, foreclosure, death, divorce, illness, financial hardship, seller motivation or a person’s likelihood to transact.',
    'Do not visualize guaranteed property value, tax savings, legal result, financing result, profit or response rate.',
    'For residential imagery, use a non-identifiable New Jersey or Northeast suburban home or streetscape atmosphere rather than a specific real property. For analytical concepts, use abstract parcel, map, and property geometry without literal data values.',
    'Aim for sophisticated commercial-advertising quality, believable materials and lighting, restrained composition and enough negative space for professional postcard copy.'
  ].filter(Boolean).join('\n');
}

async function generateOpenAIImage(prompt) {
  if (!OPENAI_KEY) throw new Error('OPENAI_API_KEY is not configured in the production deployment.');
  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: IMAGE_MODEL, prompt, n: 1, size: '1536x1024', quality: 'medium', output_format: 'png' })
  });
  const text = await response.text();
  let data = {};
  try { data = JSON.parse(text); } catch { data = {}; }
  if (!response.ok) {
    const message = clean(data?.error?.message || data?.error || `OpenAI image generation failed (${response.status})`, 700);
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  const encoded = data?.data?.[0]?.b64_json;
  if (!encoded) throw new Error('OpenAI returned no generated image.');
  return { bytes: Buffer.from(encoded, 'base64'), response: data };
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');
  res.setHeader('Vary', 'Authorization');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Method not allowed.' }); }
  if (!SERVICE_KEY) return res.status(503).json({ error: 'Visual Engine server configuration is incomplete.' });

  try {
    const token = bearer(req);
    const user = await verifyUser(token);
    if (!user?.id) return res.status(401).json({ error: 'Sign in required.' });
    const access = await bootstrap(token);
    const plan = clean(access?.plan || 'standard', 30);
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const action = clean(body.action || 'status', 40);

    if (action === 'status') return res.status(200).json({
      ok: true,
      engine_version: ENGINE_VERSION,
      configured: Boolean(OPENAI_KEY),
      provider: 'openai_direct',
      image_model: IMAGE_MODEL,
      bucket: BUCKET,
      production_boundary: 'preview_only_until_pcm_mapping_and_proof'
    });

    if (action !== 'generate') return res.status(400).json({ error: 'Unsupported action for direct OpenAI visual runtime.' });
    if (!OPENAI_KEY) return res.status(503).json({ error: 'OPENAI_API_KEY is not configured in the production deployment.' });

    const campaignId = clean(body.campaign_id, 80);
    if (!campaignId) return res.status(400).json({ error: 'campaign_id is required.' });
    const campaign = await ownedCampaign(user.id, campaignId);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found.' });

    const briefId = clean(body.brief_id, 80);
    const bq = new URLSearchParams({ select: '*', user_id: `eq.${user.id}`, campaign_id: `eq.${campaignId}`, order: 'created_at.desc', limit: '1' });
    if (briefId) { bq.delete('order'); bq.set('id', `eq.${briefId}`); }
    const briefRows = await adminSelect('marketing_intelligence_creative_briefs', bq);
    const briefRow = Array.isArray(briefRows) ? briefRows[0] : null;
    if (!briefRow) return res.status(409).json({ error: 'Generate a Watchdog creative brief first.' });
    if (briefRow.creative_tier !== 'studio') return res.status(403).json({ error: 'Generated preview art is available with Studio creative.' });

    const tq = new URLSearchParams({ select: 'minimum_plan,image_generation_eligible,active', tier_key: 'eq.studio', limit: '1' });
    const tierRows = await adminSelect('marketing_creative_service_tiers', tq);
    const tier = Array.isArray(tierRows) ? tierRows[0] : null;
    if (!tier?.active || !tier.image_generation_eligible) return res.status(503).json({ error: 'Studio visual generation is disabled.' });
    if (!allowed(plan, clean(tier.minimum_plan || 'pro', 30))) return res.status(403).json({ error: `Studio creative requires ${tier.minimum_plan || 'pro'} or higher.` });

    const variants = Array.isArray(briefRow.variants) ? briefRow.variants : [];
    const variantIndex = Math.max(0, Math.min(Number(body.variant_index ?? 0), 9));
    const variant = variants[variantIndex];
    if (!variant) return res.status(400).json({ error: 'Creative variant not found.' });

    const styleKey = clean(body.style_preset_key || 'architectural_gallery', 80);
    const pq = new URLSearchParams({ select: '*', preset_key: `eq.${styleKey}`, active: 'eq.true', limit: '1' });
    const presetRows = await adminSelect('marketing_visual_style_presets', pq);
    const preset = Array.isArray(presetRows) ? presetRows[0] : null;
    if (!preset || preset.minimum_tier !== 'studio') return res.status(400).json({ error: 'Choose a Studio visual style for generated preview art.' });

    const countQ = new URLSearchParams({ select: 'id,variant_index,status', user_id: `eq.${user.id}`, brief_id: `eq.${briefRow.id}`, status: 'neq.failed', limit: '30' });
    const prior = await adminSelect('marketing_intelligence_visual_assets', countQ);
    const activeRows = Array.isArray(prior) ? prior : [];
    const maxBrief = plan === 'developer' ? 25 : 8;
    const maxVariant = plan === 'developer' ? 8 : 2;
    if (activeRows.length >= maxBrief) return res.status(429).json({ error: `Studio preview limit reached for this creative brief (${maxBrief}).` });
    if (activeRows.filter(x => Number(x.variant_index) === variantIndex).length >= maxVariant) return res.status(429).json({ error: `Studio preview limit reached for this concept (${maxVariant}).` });

    const prompt = stylePrompt(campaign, briefRow, variant, preset);
    const promptHash = sha256(prompt);
    const pendingRows = await adminInsert('marketing_intelligence_visual_assets', {
      user_id: user.id,
      campaign_id: campaignId,
      brief_id: briefRow.id,
      variant_index: variantIndex,
      style_preset_key: styleKey,
      asset_kind: 'generated_preview',
      status: 'generating',
      production_status: 'preview_only',
      provider: 'openai',
      model: IMAGE_MODEL,
      prompt,
      prompt_hash: promptHash,
      metadata: { engine_version: ENGINE_VERSION, creative_tier: 'studio', mechanical_spec_owner: 'pcm', runtime: 'openai_direct' }
    });
    const pending = Array.isArray(pendingRows) ? pendingRows[0] : null;
    if (!pending?.id) throw new Error('Visual generation could not be started.');

    try {
      const generated = await generateOpenAIImage(prompt);
      const path = `${user.id}/${campaignId}/${briefRow.id}/${variantIndex}/${require('node:crypto').randomUUID()}.png`;
      await upload(path, generated.bytes, 'image/png');
      const doneRows = await adminPatch('marketing_intelligence_visual_assets', `id=eq.${encodeURIComponent(pending.id)}&user_id=eq.${encodeURIComponent(user.id)}`, {
        status: 'generated',
        storage_path: path,
        mime_type: 'image/png',
        width: 1536,
        height: 1024,
        bytes: generated.bytes.length,
        metadata: {
          engine_version: ENGINE_VERSION,
          creative_tier: 'studio',
          mechanical_spec_owner: 'pcm',
          runtime: 'openai_direct',
          openai_model: IMAGE_MODEL,
          usage: safe(generated.response?.usage, 5000),
          size: '1536x1024',
          quality: 'medium'
        },
        updated_at: new Date().toISOString()
      }, true);
      const done = Array.isArray(doneRows) ? doneRows[0] : null;
      await logEvent(user.id, campaignId, 'creative.studio_visual_generated', {
        asset_id: pending.id,
        brief_id: briefRow.id,
        variant_index: variantIndex,
        style_preset_key: styleKey,
        provider: 'openai',
        model: IMAGE_MODEL,
        production_status: 'preview_only'
      });
      return res.status(200).json({
        ok: true,
        asset: { ...done, signed_url: await signedUrl(path) },
        production_boundary: 'Watchdog preview only. PCM mapping and provider proof are still required before production.'
      });
    } catch (error) {
      await adminPatch('marketing_intelligence_visual_assets', `id=eq.${encodeURIComponent(pending.id)}&user_id=eq.${encodeURIComponent(user.id)}`, {
        status: 'failed',
        metadata: { engine_version: ENGINE_VERSION, runtime: 'openai_direct', error: clean(error?.message || error, 700) },
        updated_at: new Date().toISOString()
      });
      throw error;
    }
  } catch (error) {
    console.error('marketing-studio-visual-openai failure', error && error.message ? error.message : 'unknown');
    const status = Number(error?.status || 0);
    return res.status(status >= 400 && status < 500 ? status : 502).json({ error: clean(error?.message || 'Studio Visual Engine is temporarily unavailable.', 700) });
  }
};
