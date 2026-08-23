import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_ORIGINS = new Set([
  'https://watchdogindex.com',
  'https://www.watchdogindex.com',
  'https://njpropertytaxrelief.com',
  'https://www.njpropertytaxrelief.com',
]);
const DOCS_URL = 'https://docs.pcmintegrations.com/docs/directmail-api/92547af449aa8-direct-mail-api-v3';
const MAX_RECIPIENTS = 5000;

function cors(req: Request) {
  const origin = req.headers.get('origin') || '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : 'https://www.watchdogindex.com',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Cache-Control': 'private, no-store',
    Vary: 'Origin',
  };
}

function reply(req: Request, status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors(req), 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function clean(value: unknown, max = 180) {
  return String(value ?? '').trim().replace(/[\u0000-\u001f]/g, '').slice(0, max);
}

function cleanZip(value: unknown) {
  const digits = String(value ?? '').replace(/[^0-9]/g, '');
  return digits.length >= 5 ? digits.slice(0, 5) : '';
}

function normalizeState(value: unknown) {
  const state = clean(value || 'NJ', 2).toUpperCase();
  return /^[A-Z]{2}$/.test(state) ? state : '';
}

function normalizeRecipient(raw: Record<string, unknown>, index: number) {
  const address = clean(raw.address ?? raw.address1, 140);
  const city = clean(raw.city ?? raw.town ?? raw.municipality, 80);
  const state = normalizeState(raw.state ?? 'NJ');
  const zipCode = cleanZip(raw.zipCode ?? raw.zip);
  const propertyKey = clean(raw.property_key ?? raw.pams_pin ?? raw.extRefNbr ?? address, 160);
  return {
    address,
    address2: clean(raw.address2, 80),
    city,
    state,
    zipCode,
    propertyKey,
    extRefNbr: propertyKey || `watchdog-${index + 1}`,
  };
}

function validateRecipient(recipient: ReturnType<typeof normalizeRecipient>) {
  const missing: string[] = [];
  if (recipient.address.length < 3) missing.push('address');
  if (recipient.city.length < 2) missing.push('city');
  if (!recipient.state) missing.push('state');
  if (!/^\d{5}$/.test(recipient.zipCode)) missing.push('zip');
  return missing;
}

function dedupeRecipients(input: Record<string, unknown>[]) {
  const seen = new Set<string>();
  const valid: ReturnType<typeof normalizeRecipient>[] = [];
  const invalid: Array<{ index: number; property_key: string; missing: string[] }> = [];
  let duplicates = 0;

  input.slice(0, MAX_RECIPIENTS).forEach((raw, index) => {
    const recipient = normalizeRecipient(raw, index);
    const missing = validateRecipient(recipient);
    if (missing.length) {
      invalid.push({ index, property_key: recipient.propertyKey, missing });
      return;
    }
    const key = `${recipient.address}|${recipient.address2}|${recipient.city}|${recipient.state}|${recipient.zipCode}`.toLowerCase();
    if (seen.has(key)) {
      duplicates += 1;
      return;
    }
    seen.add(key);
    valid.push(recipient);
  });

  return { valid, invalid, duplicates, truncated: input.length > MAX_RECIPIENTS };
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function pricingEstimate(recipientCount: number) {
  const rawCents = Number(Deno.env.get('PCM_PER_PIECE_ESTIMATE_CENTS') || '0');
  if (!Number.isFinite(rawCents) || rawCents <= 0) return null;
  return Number((recipientCount * Math.round(rawCents) / 100).toFixed(2));
}

function providerConfigured() {
  const token = clean(Deno.env.get('PCM_ACCESS_TOKEN'), 4000);
  const key = clean(Deno.env.get('PCM_SANDBOX_API_KEY') || Deno.env.get('PCM_API_KEY'), 1000);
  const secret = clean(Deno.env.get('PCM_SANDBOX_API_SECRET') || Deno.env.get('PCM_API_SECRET'), 2000);
  return Boolean(token || (key && secret));
}

function orderView(row: any) {
  return {
    id: row.id,
    campaign_id: row.campaign_id,
    provider_order_id: row.provider_order_id,
    provider_batch_id: row.provider_batch_id,
    external_reference: row.external_reference,
    status: row.status,
    design_id: row.design_id,
    mail_class: row.mail_class,
    mail_size: row.mail_size,
    recipient_count: row.recipient_count,
    validated_recipient_count: row.validated_recipient_count,
    failed_recipient_count: row.failed_recipient_count,
    estimated_cost: row.estimated_cost,
    final_cost: row.final_cost,
    currency: row.currency,
    scheduled_for: row.scheduled_for,
    submitted_at: row.submitted_at,
    completed_at: row.completed_at,
    last_error: row.last_error,
    created_at: row.created_at,
    updated_at: row.updated_at,
    provider_summary: row.provider_summary || {},
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  if (req.method !== 'POST') return reply(req, 405, { error: 'Method not allowed' });

  const origin = req.headers.get('origin') || '';
  if (origin && !ALLOWED_ORIGINS.has(origin)) return reply(req, 403, { error: 'Origin not allowed' });

  const authorization = req.headers.get('authorization') || '';
  if (!authorization.startsWith('Bearer ')) return reply(req, 401, { error: 'Sign in required' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) return reply(req, 401, { error: 'Session could not be verified' });
  const user = authData.user;

  const { data: usageData, error: usageError } = await userClient.rpc('get_agent_usage');
  if (usageError) return reply(req, 403, { error: 'Data Workbench access could not be verified' });
  const plan = clean(usageData?.plan || 'standard', 30);
  if (!['agent', 'pro', 'pro_plus', 'teams', 'developer'].includes(plan)) {
    return reply(req, 403, { error: 'Data Workbench plan required' });
  }

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return reply(req, 400, { error: 'Invalid JSON' });
  }
  const action = clean(body.action, 40);

  async function ownedOrder(id: string) {
    const { data, error } = await admin
      .from('pcm_direct_mail_orders')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle();
    return error || !data ? null : data;
  }

  async function event(
    orderId: string,
    eventType: string,
    providerStatus = '',
    message = '',
    payload: Record<string, unknown> = {},
  ) {
    await admin.from('pcm_direct_mail_events').insert({
      order_id: orderId,
      user_id: user.id,
      event_type: clean(eventType, 80),
      provider_status: clean(providerStatus, 80) || null,
      message: clean(message, 1000) || null,
      payload,
    });
  }

  if (action === 'status') {
    return reply(req, 200, {
      provider: 'pcm',
      configured: providerConfigured(),
      auth_verified: false,
      auth_check_skipped: true,
      docs_url: DOCS_URL,
      plan,
      max_recipients_per_order: MAX_RECIPIENTS,
      capabilities: {
        local_address_validation: true,
        approved_design_id: true,
        standard_mail: true,
        first_class_mail: true,
        order_submission: false,
        legacy_direct_submit_disabled: true,
        saved_order_readback: true,
        draft_maintenance: true,
        csv_fallback: true,
        owner_demographic_profiling: false,
      },
      authoritative_paid_fulfillment: 'marketing-direct-mail-fulfill',
      production_boundary: 'quote + payment + PCM proof + approved creative + service-role fulfillment',
    });
  }

  if (action === 'order.list') {
    const limit = Math.min(Math.max(Number(body.limit || 12), 1), 50);
    const { data, error } = await admin
      .from('pcm_direct_mail_orders')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) return reply(req, 503, { error: 'Direct mail orders could not be loaded' });
    return reply(req, 200, { orders: (data || []).map(orderView) });
  }

  if (action === 'order.get') {
    const id = clean(body.order_id, 80);
    const order = await ownedOrder(id);
    if (!order) return reply(req, 404, { error: 'Direct mail order not found' });
    const { data: events } = await admin
      .from('pcm_direct_mail_events')
      .select('event_type,provider_status,message,payload,created_at')
      .eq('order_id', id)
      .order('created_at', { ascending: false })
      .limit(50);
    return reply(req, 200, { order: orderView(order), events: events || [] });
  }

  if (action === 'draft.create') {
    const name = clean(body.name || `PCM Postcard ${new Date().toISOString().slice(0, 10)}`, 140);
    const requestKey = clean(body.request_key || crypto.randomUUID(), 160);
    const mailClass = body.mail_class === 'FirstClass' ? 'FirstClass' : 'Standard';
    const designId = clean(body.design_id, 80) || null;
    const rawRecipients = Array.isArray(body.recipients) ? body.recipients : [];
    if (!rawRecipients.length) return reply(req, 400, { error: 'Choose at least one mailing address' });

    const normalized = dedupeRecipients(rawRecipients);
    if (!normalized.valid.length) {
      return reply(req, 400, {
        error: 'No valid mailing addresses were found',
        invalid: normalized.invalid.slice(0, 50),
      });
    }

    const fingerprint = await sha256(JSON.stringify({
      mailClass,
      designId,
      recipients: normalized.valid,
    }));
    const { data: existing } = await admin
      .from('pcm_direct_mail_orders')
      .select('*')
      .eq('user_id', user.id)
      .eq('request_key', requestKey)
      .maybeSingle();
    if (existing) {
      if (existing.request_fingerprint !== fingerprint) {
        return reply(req, 409, { error: 'This request key was already used for different recipient data' });
      }
      return reply(req, 200, {
        order: orderView(existing),
        validation: {
          valid: normalized.valid.length,
          invalid: normalized.invalid,
          duplicates: normalized.duplicates,
          truncated: normalized.truncated,
        },
        idempotent_replay: true,
      });
    }

    const propertyKeys = normalized.valid.map((recipient) => recipient.propertyKey).filter(Boolean);
    const campaign = await admin
      .from('data_workbench_campaigns')
      .insert({
        user_id: user.id,
        name,
        campaign_type: 'direct_mail',
        property_keys: propertyKeys,
        settings: {
          provider: 'pcm',
          design_id: designId,
          mail_class: mailClass,
          recipient_count: normalized.valid.length,
          privacy_model: 'property_address_only',
          recipient_label: 'Current Resident',
          paid_submission_path: 'marketing_studio_only',
        },
        status: 'draft',
      })
      .select('id')
      .single();
    if (campaign.error) return reply(req, 503, { error: 'Direct mail campaign could not be created' });

    const externalReference = `WD-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${crypto.randomUUID().slice(0, 8)}`;
    const estimatedCost = pricingEstimate(normalized.valid.length);
    const inserted = await admin
      .from('pcm_direct_mail_orders')
      .insert({
        user_id: user.id,
        campaign_id: campaign.data.id,
        external_reference: externalReference,
        status: designId ? 'ready' : 'draft',
        design_id: designId,
        mail_class: mailClass,
        recipient_count: normalized.valid.length,
        validated_recipient_count: normalized.valid.length,
        failed_recipient_count: normalized.invalid.length,
        recipient_snapshot: normalized.valid,
        request_key: requestKey,
        request_fingerprint: fingerprint,
        estimated_cost: estimatedCost,
        provider_summary: {
          local_validation: true,
          duplicates_removed: normalized.duplicates,
          truncated: normalized.truncated,
          legacy_direct_submit_disabled: true,
        },
      })
      .select('*')
      .single();
    if (inserted.error) {
      await admin.from('data_workbench_campaigns').delete().eq('id', campaign.data.id).eq('user_id', user.id);
      return reply(req, 503, { error: 'Direct mail draft could not be saved' });
    }

    await event(
      inserted.data.id,
      'draft_created',
      inserted.data.status,
      `${normalized.valid.length} mailing addresses prepared`,
      { invalid_count: normalized.invalid.length, duplicates_removed: normalized.duplicates },
    );
    return reply(req, 201, {
      order: orderView(inserted.data),
      validation: {
        valid: normalized.valid.length,
        invalid: normalized.invalid.slice(0, 50),
        duplicates: normalized.duplicates,
        truncated: normalized.truncated,
      },
    });
  }

  if (action === 'draft.update') {
    const id = clean(body.order_id, 80);
    const order = await ownedOrder(id);
    if (!order) return reply(req, 404, { error: 'Direct mail order not found' });
    if (!['draft', 'ready', 'failed'].includes(order.status)) {
      return reply(req, 409, { error: 'This order can no longer be edited' });
    }

    const designId = clean(body.design_id ?? order.design_id, 80) || null;
    const mailClass = body.mail_class === 'FirstClass'
      ? 'FirstClass'
      : body.mail_class === 'Standard'
        ? 'Standard'
        : order.mail_class;
    const nextStatus = designId ? 'ready' : 'draft';
    const estimatedCost = pricingEstimate(Number(order.recipient_count || 0)) ?? order.estimated_cost;
    const updated = await admin
      .from('pcm_direct_mail_orders')
      .update({
        design_id: designId,
        mail_class: mailClass,
        status: nextStatus,
        estimated_cost: estimatedCost,
        last_error: null,
        provider_summary: {
          ...(order.provider_summary || {}),
          legacy_direct_submit_disabled: true,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('user_id', user.id)
      .select('*')
      .single();
    if (updated.error) return reply(req, 503, { error: 'Direct mail draft could not be updated' });

    if (order.campaign_id) {
      await admin
        .from('data_workbench_campaigns')
        .update({
          settings: {
            provider: 'pcm',
            design_id: designId,
            mail_class: mailClass,
            recipient_count: order.recipient_count,
            privacy_model: 'property_address_only',
            recipient_label: 'Current Resident',
            paid_submission_path: 'marketing_studio_only',
          },
          status: nextStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', order.campaign_id)
        .eq('user_id', user.id);
    }

    await event(id, 'draft_updated', nextStatus, 'Design or mail class updated');
    return reply(req, 200, { order: orderView(updated.data) });
  }

  if (action === 'order.submit') {
    return reply(req, 409, {
      error: 'Legacy browser-triggered PCM submission is disabled. Use Marketing Studio authoritative quote, payment, PCM proof approval, and service-role fulfillment.',
      code: 'LEGACY_PCM_DIRECT_SUBMIT_DISABLED',
      provider_mutation_called: false,
      live_send_enabled: false,
      required_path: 'marketing-direct-mail-fulfill',
    });
  }

  return reply(req, 400, { error: 'Unknown action' });
});
