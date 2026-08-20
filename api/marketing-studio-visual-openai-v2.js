const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://uvkvaxljhhngydvlrzom.supabase.co';
const PUBLISHABLE_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const OPENAI_KEY = process.env.OPENAI_API_KEY || '';
const IMAGE_MODEL = process.env.WATCHDOG_IMAGE_MODEL_OPENAI || 'gpt-image-2';
const BUCKET = 'marketing-intelligence-visuals';
const BRAND_BUCKET = 'marketing-brand-media';
const ENGINE_VERSION = 'watchdog-studio-visual-openai-v2';
const MAX_REFERENCE_IMAGES = 2;
const PLAN_RANK = { standard: 0, agent: 1, pro: 2, pro_plus: 3, teams: 4, developer: 5 };

function clean(v, n = 500) { return String(v ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n); }
function safe(v, max = 20000) { if (!v || typeof v !== 'object' || Array.isArray(v)) return {}; try { return JSON.stringify(v).length <= max ? v : {}; } catch { return {}; } }
function bearer(req) { const h = String(req.headers.authorization || ''); return h.startsWith('Bearer ') ? h.slice(7).trim() : ''; }
function allowed(plan, minimum) { return (PLAN_RANK[plan] ?? 0) >= (PLAN_RANK[minimum] ?? 99); }
function pathEncode(path) { return String(path || '').split('/').map(encodeURIComponent).join('/'); }
function sha256(value) { return require('node:crypto').createHash('sha256').update(value).digest('hex'); }
function userHeaders(token) { return { apikey: PUBLISHABLE_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }; }
function adminHeaders(extra = {}) { return { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', ...extra }; }
function storageAdminHeaders(extra = {}) { return { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, ...extra }; }

async function jsonFetch(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) {
    const raw = data && typeof data === 'object' ? (data?.error?.message || data.message || data.error_description || data.error || data.hint) : data;
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
  return jsonFetch(`${SUPABASE_URL}/rest/v1/${table}`, { method: 'POST', headers: adminHeaders({ Prefer: 'return=representation' }), body: JSON.stringify(row) });
}
async function adminPatch(table, query, row, representation = false) {
  return jsonFetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, { method: 'PATCH', headers: adminHeaders({ Prefer: representation ? 'return=representation' : 'return=minimal' }), body: JSON.stringify(row) });
}
async function verifyUser(token) {
  if (!token) return null;
  try { return await jsonFetch(`${SUPABASE_URL}/auth/v1/user`, { headers: userHeaders(token) }); } catch { return null; }
}
async function bootstrap(token) {
  return jsonFetch(`${SUPABASE_URL}/rest/v1/rpc/marketing_studio_bootstrap`, { method: 'POST', headers: userHeaders(token), body: '{}' });
}
async function brandBootstrap(token) {
  return jsonFetch(`${SUPABASE_URL}/rest/v1/rpc/marketing_brand_media_bootstrap`, { method: 'POST', headers: userHeaders(token), body: JSON.stringify({ p_brand_profile_id: null }) });
}
async function ownedCampaign(userId, campaignId) {
  const q = new URLSearchParams({ select: 'id,user_id,name,goal,profession,settings', id: `eq.${campaignId}`, user_id: `eq.${userId}`, limit: '1' });
  const rows = await adminSelect('marketing_campaigns', q);
  return Array.isArray(rows) ? rows[0] || null : null;
}
async function signedUrl(path, expiresIn = 3600) {
  if (!path) return null;
  try {
    const data = await jsonFetch(`${SUPABASE_URL}/storage/v1/object/sign/${BUCKET}/${pathEncode(path)}`, { method: 'POST', headers: adminHeaders(), body: JSON.stringify({ expiresIn }) });
    const raw = data?.signedURL || data?.signedUrl || null;
    if (!raw) return null;
    return /^https?:/i.test(raw) ? raw : `${SUPABASE_URL}/storage/v1${raw}`;
  } catch { return null; }
}
async function upload(path, bytes, mime) {
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${pathEncode(path)}`, { method: 'POST', headers: storageAdminHeaders({ 'Content-Type': mime, 'x-upsert': 'false', 'Cache-Control': '3600' }), body: bytes });
  if (!response.ok) throw new Error(`Visual storage upload failed (${response.status})`);
}
async function logEvent(userId, campaignId, eventType, payload) {
  try { await adminInsert('marketing_events', { user_id: userId, campaign_id: campaignId, event_type: eventType, source: 'watchdog_intelligence', payload }); } catch (_) { /* observability must not break generation */ }
}

function brandContext(media) {
  const brand = media?.brand && typeof media.brand === 'object' ? media.brand : null;
  const profile = brand?.profile && typeof brand.profile === 'object' ? brand.profile : {};
  return { brand, profile };
}
function selectedReferenceAssets(media) {
  const { brand, profile } = brandContext(media);
  const selection = profile?.asset_selection && typeof profile.asset_selection === 'object' ? profile.asset_selection : {};
  const ids = Array.isArray(selection.studio_reference_asset_ids) ? [...new Set(selection.studio_reference_asset_ids.map(String).filter(Boolean))] : [];
  if (ids.length > MAX_REFERENCE_IMAGES) { const e = new Error(`Studio supports up to ${MAX_REFERENCE_IMAGES} Brand & Media reference photos.`); e.status = 409; throw e; }
  if (!ids.length) return [];
  const assets = Array.isArray(media?.assets) ? media.assets : [];
  const map = new Map(assets.map(a => [String(a.id), a]));
  const refs = ids.map(id => map.get(id));
  const invalid = refs.some(a => !a || a.asset_type !== 'marketing_photo' || a.status === 'archived' || a.storage_bucket !== BRAND_BUCKET);
  if (invalid) { const e = new Error('A selected Studio Brand & Media reference is no longer active. Reselect your reference photos before generating.'); e.status = 409; throw e; }
  if (!brand?.id) { const e = new Error('The selected Studio references are not attached to an active Brand & Media profile.'); e.status = 409; throw e; }
  return refs;
}
async function downloadBrandAsset(asset) {
  if (!asset || asset.asset_type !== 'marketing_photo' || asset.storage_bucket !== BRAND_BUCKET) throw new Error('Invalid Studio reference asset.');
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(asset.mime_type)) throw new Error('Unsupported Studio reference image type.');
  if (Number(asset.file_size_bytes || 0) <= 0 || Number(asset.file_size_bytes) > 15728640) throw new Error('Studio reference image exceeds the 15 MB limit.');
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/${BRAND_BUCKET}/${pathEncode(asset.storage_path)}`, { headers: storageAdminHeaders() });
  if (!response.ok) { const e = new Error(`Studio reference media is unavailable (${response.status}). Reselect it before generating.`); e.status = 409; throw e; }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > 15728640) { const e = new Error('Studio reference media is empty or exceeds the 15 MB limit.'); e.status = 409; throw e; }
  return { id: String(asset.id), bytes, mime: asset.mime_type, name: clean(asset.original_name || `reference-${asset.id}`, 120).replace(/[^a-z0-9._-]+/gi, '-') || `reference-${asset.id}` };
}

function stylePrompt(campaign, briefRow, variant, preset, media, refs) {
  const art = safe(preset?.art_direction, 5000);
  const brief = safe(briefRow?.brief, 7000);
  const manifest = safe(briefRow?.input_manifest, 12000);
  const oldBrand = safe(manifest?.brand, 5000);
  const { profile } = brandContext(media);
  const brandName = clean(profile?.company || profile?.brokerage || profile?.display_name || profile?.name || oldBrand?.company || oldBrand?.brokerage || oldBrand?.display_name || oldBrand?.name || '', 120);
  const primary = /^#[0-9a-f]{6}$/i.test(String(profile?.primary_color || '')) ? String(profile.primary_color) : '';
  const secondary = /^#[0-9a-f]{6}$/i.test(String(profile?.secondary_color || '')) ? String(profile.secondary_color) : '';
  const neutral = ['light', 'warm', 'cool', 'dark'].includes(String(profile?.neutral_preference || '')) ? String(profile.neutral_preference) : '';
  const profession = clean(briefRow?.profession || campaign?.profession || 'real estate professional', 80);
  const goal = clean(briefRow?.goal || campaign?.goal || 'local property campaign', 100).replaceAll('_', ' ');
  const direction = clean(variant?.visual_prompt || variant?.visual_direction || brief?.visual_direction || 'premium local property visual', 1200);
  return [
    'Create a premium BACKGROUND ART ASSET for a professional direct-mail postcard campaign.',
    'The final postcard is landscape 6 x 8.5 inches. Watchdog Designs will control all mechanical print layout, bleed, safe zones, address blocks, barcode areas and postal indicia later.',
    'This is Watchdog preview art only. Make it a flexible hero/background crop with useful negative space for copy placed separately.',
    `Campaign profession: ${profession}.`,
    `Campaign objective: ${goal}.`,
    brandName ? `Governed brand context: ${brandName}. Do not draw, recreate or invent a logo.` : 'Brand context: professional and locally credible.',
    primary || secondary ? `Governed palette cues: ${[primary && `primary ${primary}`, secondary && `secondary ${secondary}`].filter(Boolean).join(', ')}. Use these as directional color cues, not literal swatches or text.` : '',
    neutral ? `Preferred neutral/background mood: ${neutral}.` : '',
    `Creative concept: ${direction}.`,
    `Style preset: ${clean(preset?.label || preset?.preset_key || 'Studio', 100)}.`,
    art?.mood ? `Mood: ${clean(art.mood, 300)}.` : '',
    art?.composition ? `Composition: ${clean(art.composition, 500)}.` : '',
    art?.texture ? `Texture/light: ${clean(art.texture, 300)}.` : '',
    refs.length ? `You are receiving ${refs.length} user-approved marketing reference image${refs.length === 1 ? '' : 's'}. Use them only as non-literal inspiration for palette, lighting, material feel and broad composition. Create new artwork. Do not reproduce or preserve an identifiable property, person, face, logo, sign, street address, readable text, house number or unique private detail from a reference image.` : '',
    'Hard requirements: no words, no typography, no letters, no numbers, no logos, no QR codes, no watermarks, no postal marks, no indicia, no barcodes, no readable house numbers, no identifiable street address, no identifiable people, no faces and no political signs.',
    'Do not depict or imply protected characteristics, demographic categories, distress, foreclosure, death, divorce, illness, financial hardship, seller motivation or a person’s likelihood to transact.',
    'Do not visualize guaranteed property value, tax savings, legal result, financing result, profit or response rate.',
    'For residential imagery, use a non-identifiable New Jersey or Northeast suburban home or streetscape atmosphere rather than a specific real property. For analytical concepts, use abstract parcel, map and property geometry without literal data values.',
    'Aim for sophisticated commercial-advertising quality, believable materials and lighting, restrained composition and enough negative space for professional postcard copy.'
  ].filter(Boolean).join('\n');
}

async function parseOpenAIImageResponse(response, fallbackMessage) {
  const text = await response.text();
  let data = {};
  try { data = JSON.parse(text); } catch { data = {}; }
  if (!response.ok) { const message = clean(data?.error?.message || data?.error || `${fallbackMessage} (${response.status})`, 700); const error = new Error(message); error.status = response.status; throw error; }
  const encoded = data?.data?.[0]?.b64_json;
  if (!encoded) throw new Error('OpenAI returned no generated image.');
  return { bytes: Buffer.from(encoded, 'base64'), response: data };
}
async function generateOpenAIImage(prompt, referenceAssets) {
  if (!OPENAI_KEY) throw new Error('OPENAI_API_KEY is not configured in the production deployment.');
  if (!referenceAssets.length) {
    const response = await fetch('https://api.openai.com/v1/images/generations', { method: 'POST', headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: IMAGE_MODEL, prompt, n: 1, size: '1536x1024', quality: 'medium', output_format: 'png' }) });
    return { ...(await parseOpenAIImageResponse(response, 'OpenAI image generation failed')), mode: 'text_generation' };
  }
  const downloaded = await Promise.all(referenceAssets.map(downloadBrandAsset));
  const form = new FormData();
  form.append('model', IMAGE_MODEL);
  form.append('prompt', prompt);
  form.append('size', '1536x1024');
  form.append('quality', 'medium');
  form.append('output_format', 'png');
  for (const ref of downloaded) form.append('image[]', new Blob([ref.bytes], { type: ref.mime }), ref.name);
  const response = await fetch('https://api.openai.com/v1/images/edits', { method: 'POST', headers: { Authorization: `Bearer ${OPENAI_KEY}` }, body: form });
  return { ...(await parseOpenAIImageResponse(response, 'OpenAI reference-image generation failed')), mode: 'brand_reference_edit' };
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

    if (action === 'status') return res.status(200).json({ ok: true, engine_version: ENGINE_VERSION, configured: Boolean(OPENAI_KEY), provider: 'openai_direct', image_model: IMAGE_MODEL, bucket: BUCKET, brand_media_reference_support: true, max_brand_reference_images: MAX_REFERENCE_IMAGES, production_boundary: 'preview_only_until_pcm_mapping_and_proof' });
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

    const media = await brandBootstrap(token);
    const referenceAssets = selectedReferenceAssets(media);
    const { brand, profile } = brandContext(media);
    const prompt = stylePrompt(campaign, briefRow, variant, preset, media, referenceAssets);
    const referenceIds = referenceAssets.map(a => String(a.id));
    const brandFingerprint = { brand_profile_id: brand?.id || null, brand_updated_at: brand?.updated_at || null, primary_color: /^#[0-9a-f]{6}$/i.test(String(profile?.primary_color || '')) ? profile.primary_color : null, secondary_color: /^#[0-9a-f]{6}$/i.test(String(profile?.secondary_color || '')) ? profile.secondary_color : null, neutral_preference: ['light', 'warm', 'cool', 'dark'].includes(String(profile?.neutral_preference || '')) ? profile.neutral_preference : null, reference_asset_ids: referenceIds };
    const promptHash = sha256(JSON.stringify({ prompt, brand: brandFingerprint }));
    const baseMetadata = { engine_version: ENGINE_VERSION, creative_tier: 'studio', mechanical_spec_owner: 'pcm', runtime: 'openai_direct', brand_profile_id: brand?.id || null, brand_updated_at: brand?.updated_at || null, brand_reference_asset_ids: referenceIds, brand_reference_count: referenceIds.length };

    const pendingRows = await adminInsert('marketing_intelligence_visual_assets', { user_id: user.id, campaign_id: campaignId, brief_id: briefRow.id, variant_index: variantIndex, style_preset_key: styleKey, asset_kind: 'generated_preview', status: 'generating', production_status: 'preview_only', provider: 'openai', model: IMAGE_MODEL, prompt, prompt_hash: promptHash, metadata: baseMetadata });
    const pending = Array.isArray(pendingRows) ? pendingRows[0] : null;
    if (!pending?.id) throw new Error('Visual generation could not be started.');

    try {
      const generated = await generateOpenAIImage(prompt, referenceAssets);
      const path = `${user.id}/${campaignId}/${briefRow.id}/${variantIndex}/${require('node:crypto').randomUUID()}.png`;
      await upload(path, generated.bytes, 'image/png');
      const doneMetadata = { ...baseMetadata, generation_mode: generated.mode, openai_model: IMAGE_MODEL, usage: safe(generated.response?.usage, 5000), size: '1536x1024', quality: 'medium', brand_context: brandFingerprint };
      const doneRows = await adminPatch('marketing_intelligence_visual_assets', `id=eq.${encodeURIComponent(pending.id)}&user_id=eq.${encodeURIComponent(user.id)}`, { status: 'generated', storage_path: path, mime_type: 'image/png', width: 1536, height: 1024, bytes: generated.bytes.length, metadata: doneMetadata, updated_at: new Date().toISOString() }, true);
      const done = Array.isArray(doneRows) ? doneRows[0] : null;
      await logEvent(user.id, campaignId, 'creative.studio_visual_generated', { asset_id: pending.id, brief_id: briefRow.id, variant_index: variantIndex, style_preset_key: styleKey, provider: 'openai', model: IMAGE_MODEL, production_status: 'preview_only', generation_mode: generated.mode, brand_profile_id: brand?.id || null, brand_reference_asset_ids: referenceIds, brand_reference_count: referenceIds.length });
      return res.status(200).json({ ok: true, asset: { ...done, signed_url: await signedUrl(path) }, brand_media: { profile_id: brand?.id || null, reference_count: referenceIds.length, reference_asset_ids: referenceIds }, production_boundary: 'Watchdog preview only. Watchdog Designs mapping and provider proof are still required before production.' });
    } catch (error) {
      await adminPatch('marketing_intelligence_visual_assets', `id=eq.${encodeURIComponent(pending.id)}&user_id=eq.${encodeURIComponent(user.id)}`, { status: 'failed', metadata: { ...baseMetadata, error: clean(error?.message || error, 700) }, updated_at: new Date().toISOString() });
      throw error;
    }
  } catch (error) {
    const status = Number(error?.status) >= 400 && Number(error?.status) < 600 ? Number(error.status) : 500;
    console.error('[Watchdog Studio Visual v2]', clean(error?.message || error, 700));
    return res.status(status).json({ error: clean(error?.message || 'Studio visual generation failed.', 700) });
  }
};
