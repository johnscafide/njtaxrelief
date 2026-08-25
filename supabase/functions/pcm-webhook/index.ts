import { createClient } from 'npm:@supabase/supabase-js@2.95.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function clean(value: unknown, max = 200) {
  return String(value ?? '').trim().replace(/[\u0000-\u001f]/g, '').slice(0, max);
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function bytesToBase64(bytes: Uint8Array) {
  let value = '';
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value);
}

function constantTimeEqual(a: string, b: string) {
  const aa = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  if (aa.length !== bb.length) return false;
  let difference = 0;
  for (let i = 0; i < aa.length; i += 1) difference |= aa[i] ^ bb[i];
  return difference === 0;
}

async function sha256Hex(text: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return bytesToHex(new Uint8Array(digest));
}

async function hmacSha256(secret: string, text: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text));
  return new Uint8Array(signature);
}

function normalizedProvidedSignature(raw: string) {
  return raw.trim().replace(/^sha256=/i, '');
}

function contract() {
  return {
    secret: Deno.env.get('PCM_WEBHOOK_SIGNATURE_SECRET') || '',
    header: clean(Deno.env.get('PCM_WEBHOOK_SIGNATURE_HEADER') || '', 100).toLowerCase(),
    format: clean(Deno.env.get('PCM_WEBHOOK_SIGNATURE_FORMAT') || '', 60).toLowerCase(),
  };
}

function first(obj: any, keys: string[]) {
  for (const key of keys) {
    const value = obj?.[key];
    if (value !== undefined && value !== null && clean(value, 300)) return clean(value, 300);
  }
  return '';
}

function eventType(payload: any) {
  return clean(
    payload?.eventType ??
      payload?.event_type ??
      payload?.webhookType ??
      payload?.webhook_type ??
      payload?.type ??
      payload?.event ??
      payload?.name ??
      'pcm.webhook',
    160,
  );
}

function providerStatus(payload: any) {
  const source = payload?.data && typeof payload.data === 'object' ? payload.data : payload;
  return clean(
    source?.status ??
      source?.mailTrackingStatus ??
      source?.mail_tracking_status ??
      source?.trackingStatus ??
      source?.tracking_status ??
      payload?.status,
    120,
  );
}

function providerEventKey(payload: any, rawHash: string) {
  const providerId = clean(
    payload?.eventId ??
      payload?.event_id ??
      payload?.webhookId ??
      payload?.webhook_id ??
      payload?.id,
    100,
  );
  // PCM can resend the same order/recipient webhook as tracking status changes.
  // Include the exact raw-body hash so a true replay is idempotent while a new
  // status payload is still processed even if PCM reuses an event identifier.
  return providerId ? `${providerId}:${rawHash}` : rawHash;
}

function ids(payload: any) {
  const source = payload?.data && typeof payload.data === 'object' ? payload.data : payload;
  return {
    order: first(source, ['orderID', 'orderId', 'order_id', 'order']),
    batch: first(source, ['batchID', 'batchId', 'batch_id', 'batch']),
    external: first(source, ['extRefNbr', 'externalReference', 'external_reference', 'externalRef', 'reference']),
    recipient: first(source, ['recipientID', 'recipientId', 'recipient_id', 'recipientExtRefNbr', 'recipient_ext_ref_nbr', 'recipientReference', 'recipient_reference']),
  };
}

function recipientEventKind(type: string) {
  const normalized = type.toLowerCase().replace(/[\s._-]+/g, ' ');
  if (/mail ?tracking/.test(normalized)) return 'mail_tracking';
  if (/qr.*scan|scan.*qr/.test(normalized)) return 'qr_scan';
  if (/order.*issue|issue.*order/.test(normalized)) return 'order_issue';
  return '';
}

function mappedOrderStatus(payload: any, type: string) {
  const raw = [type, providerStatus(payload), payload?.event, payload?.type]
    .map((value) => clean(value, 120).toLowerCase())
    .join(' ');

  if (/cancel/.test(raw)) return 'canceled';
  if (/fail|error|reject/.test(raw)) return 'failed';
  if (/\bpending\b/.test(raw)) return 'pending';
  if (/\bprocessing\b|\bprocess\b|print|production/.test(raw)) return 'processing';
  if (/\bmailing\b|\bmailed\b|postal|drop/.test(raw)) return 'mailed';
  if (/\bdelivered\b|\bdeliver\b/.test(raw)) return 'delivered';
  if (/complete|finished/.test(raw)) return 'completed';
  if (/submit|accept|created|order/.test(raw)) return 'submitted';
  return '';
}

function recipientMarketingEvent(kind: string) {
  if (kind === 'mail_tracking') return 'direct_mail.recipient_tracking';
  if (kind === 'qr_scan') return 'direct_mail.qr_scan';
  if (kind === 'order_issue') return 'direct_mail.recipient_issue';
  return 'direct_mail.recipient_event';
}

Deno.serve(async (req) => {
  if (req.method === 'GET') {
    const current = contract();
    return json(200, {
      provider: 'pcm',
      receiver: 'ready',
      signature_contract_ready: Boolean(
        current.secret &&
          current.header &&
          ['hmac-sha256-hex', 'hmac-sha256-base64'].includes(current.format),
      ),
      signature_header_configured: Boolean(current.header),
      signature_format: current.format || null,
      processing_mode: 'verified_inbox_with_recipient_safe_reconciliation',
      vendor_contract: {
        aggregate_order_statuses: ['pending', 'processing', 'mailing', 'delivered'],
        recipient_tracking_statuses: ['returned', 'delivered', 'redirected', 'en route'],
        retry_schedule_minutes: [1, 5, 10],
        exact_payload_duplicates_acknowledged: true,
        status_updates_processed_separately: true,
      },
    });
  }

  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  const current = contract();
  if (
    !current.secret ||
    !current.header ||
    !['hmac-sha256-hex', 'hmac-sha256-base64'].includes(current.format)
  ) {
    return json(503, {
      error: 'PCM webhook signature contract is not configured yet',
      code: 'PCM_WEBHOOK_SIGNATURE_CONTRACT_PENDING',
    });
  }

  const providedRaw = req.headers.get(current.header) || '';
  if (!providedRaw) {
    return json(401, {
      error: 'Missing PCM webhook signature',
      code: 'PCM_WEBHOOK_SIGNATURE_MISSING',
    });
  }

  const raw = await req.text();
  if (!raw) return json(400, { error: 'Empty webhook body' });

  const mac = await hmacSha256(current.secret, raw);
  const expected = current.format === 'hmac-sha256-base64' ? bytesToBase64(mac) : bytesToHex(mac);
  const provided = normalizedProvidedSignature(providedRaw);
  if (!constantTimeEqual(expected, provided)) {
    return json(401, {
      error: 'Invalid PCM webhook signature',
      code: 'PCM_WEBHOOK_SIGNATURE_INVALID',
    });
  }

  let payload: any;
  try {
    payload = JSON.parse(raw);
  } catch {
    return json(400, { error: 'Webhook body must be JSON' });
  }

  const rawHash = await sha256Hex(raw);
  const key = providerEventKey(payload, rawHash);
  const type = eventType(payload);
  const rawProviderStatus = providerStatus(payload);
  const providerIds = ids(payload);
  const recipientKind = recipientEventKind(type);
  const aggregateStatus = recipientKind ? '' : mappedOrderStatus(payload, type);
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  const existing = await admin
    .from('marketing_provider_webhook_events')
    .select('id,status')
    .eq('provider_key', 'pcm')
    .eq('event_key', key)
    .maybeSingle();

  if (existing.data) {
    return json(200, {
      accepted: true,
      duplicate: true,
      event_key: key,
      status: existing.data.status,
    });
  }

  const saved = await admin
    .from('marketing_provider_webhook_events')
    .insert({
      provider_key: 'pcm',
      event_key: key,
      event_type: type,
      signature_verified: true,
      payload,
      raw_body_sha256: rawHash,
      status: 'received',
    })
    .select('id')
    .single();

  if (saved.error) {
    // Handle concurrent retries against the unique(provider_key,event_key)
    // inbox constraint as an idempotent success instead of causing PCM to
    // retry the same delivery again.
    if (saved.error.code === '23505') {
      return json(200, {
        accepted: true,
        duplicate: true,
        event_key: key,
        status: 'received',
      });
    }
    console.error('PCM_WEBHOOK_INBOX_ERROR', saved.error);
    return json(503, { error: 'Webhook inbox unavailable' });
  }

  let matched: any = null;
  if (providerIds.order || providerIds.batch) {
    const jobs = await admin
      .from('marketing_provider_jobs')
      .select('id,user_id,campaign_id,provider_job_id,status,response_summary')
      .eq('provider_key', 'pcm')
      .order('created_at', { ascending: false })
      .limit(250);

    matched = (jobs.data || []).find((job: any) => {
      const candidates = [
        job.provider_job_id,
        job.response_summary?.order_id,
        job.response_summary?.batch_id,
      ].filter(Boolean).map(String);
      return (
        (providerIds.order && candidates.includes(String(providerIds.order))) ||
        (providerIds.batch && candidates.includes(String(providerIds.batch)))
      );
    }) || null;
  }

  // PCM confirmed that Mail Tracking, QR Scan, and Order Issues webhooks can be recipient-level.
  // A recipient-level "delivered" event must never mark the whole campaign delivered.
  if (matched && recipientKind) {
    const now = new Date().toISOString();
    await admin
      .from('marketing_provider_jobs')
      .update({
        response_summary: {
          ...(matched.response_summary || {}),
          last_recipient_webhook_event: type,
          last_recipient_webhook_kind: recipientKind,
          last_recipient_provider_status: rawProviderStatus || null,
          last_recipient_webhook_at: now,
        },
        updated_at: now,
      })
      .eq('id', matched.id);

    await admin.from('marketing_events').insert({
      user_id: matched.user_id,
      campaign_id: matched.campaign_id,
      provider_job_id: matched.id,
      event_type: recipientMarketingEvent(recipientKind),
      source: 'pcm',
      payload: {
        provider_event_type: type,
        provider_status: rawProviderStatus || null,
        order_id: providerIds.order || null,
        batch_id: providerIds.batch || null,
        recipient_reference: providerIds.recipient || providerIds.external || null,
      },
    });

    await admin
      .from('marketing_provider_webhook_events')
      .update({
        status: 'mapped',
        provider_job_id: matched.id,
        campaign_id: matched.campaign_id,
        processed_at: now,
      })
      .eq('id', saved.data.id);

    return json(200, {
      accepted: true,
      event_key: key,
      status: 'mapped',
      scope: 'recipient',
      kind: recipientKind,
      job_id: matched.id,
      provider_status: rawProviderStatus || null,
      aggregate_status_changed: false,
    });
  }

  if (matched && aggregateStatus) {
    const now = new Date().toISOString();
    const final = ['delivered', 'completed', 'failed', 'canceled'].includes(aggregateStatus);
    const update: any = {
      status: aggregateStatus,
      updated_at: now,
      response_summary: {
        ...(matched.response_summary || {}),
        last_webhook_event: type,
        last_webhook_status: aggregateStatus,
        provider_order_status: rawProviderStatus || null,
        last_webhook_at: now,
        order_id: providerIds.order || matched.response_summary?.order_id || null,
        batch_id: providerIds.batch || matched.response_summary?.batch_id || null,
      },
    };
    if (final) update.completed_at = now;

    await admin.from('marketing_provider_jobs').update(update).eq('id', matched.id);

    const campaignStatus = aggregateStatus === 'failed'
      ? 'launch_failed'
      : aggregateStatus === 'canceled'
        ? 'canceled'
        : ['delivered', 'completed'].includes(aggregateStatus)
          ? 'completed'
          : 'live';

    await admin
      .from('marketing_campaigns')
      .update({ status: campaignStatus, updated_at: now })
      .eq('id', matched.campaign_id)
      .eq('user_id', matched.user_id);

    await admin.from('marketing_events').insert({
      user_id: matched.user_id,
      campaign_id: matched.campaign_id,
      provider_job_id: matched.id,
      event_type: 'direct_mail.provider_status',
      source: 'pcm',
      payload: {
        provider_event_type: type,
        status: aggregateStatus,
        provider_status: rawProviderStatus || null,
        order_id: providerIds.order || null,
        batch_id: providerIds.batch || null,
      },
    });

    await admin
      .from('marketing_provider_webhook_events')
      .update({
        status: 'mapped',
        provider_job_id: matched.id,
        campaign_id: matched.campaign_id,
        processed_at: now,
      })
      .eq('id', saved.data.id);

    return json(200, {
      accepted: true,
      event_key: key,
      status: 'mapped',
      scope: 'order',
      job_id: matched.id,
      provider_status: rawProviderStatus || null,
      normalized_status: aggregateStatus,
    });
  }

  await admin
    .from('marketing_provider_webhook_events')
    .update({ status: 'received_unmapped' })
    .eq('id', saved.data.id);

  return json(202, {
    accepted: true,
    event_key: key,
    status: 'received_unmapped',
    provider_ids: providerIds,
    provider_status: rawProviderStatus || null,
    recipient_event_kind: recipientKind || null,
    mapped_status: aggregateStatus || null,
  });
});
