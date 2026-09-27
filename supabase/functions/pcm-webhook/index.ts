import { createClient } from 'npm:@supabase/supabase-js@2.95.0';
import { childRef, pcmConfigured, pcmRequest } from '../_shared/pcm-v3.ts';

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

// PCM v3 webhook security (PCM docs + support email): headers pcmi-timestamp and
// pcmi-signature; signature = HMAC-SHA256 of "{pcmi-timestamp}.{raw body}" keyed
// with the subscription's Signature Secret from the PCM portal. The docs do not
// name the encoding, so hex and base64 are both accepted unless a format is pinned.
// PCM issues a separate secret per subscription (one subscription per event), so
// PCM_WEBHOOK_SIGNATURE_SECRET holds all of them, separated by commas, spaces or
// new lines. A delivery is valid if it matches any one of them.
const SIGNATURE_FORMATS = ['hmac-sha256-hex', 'hmac-sha256-base64'];

function contract() {
  const format = clean(Deno.env.get('PCM_WEBHOOK_SIGNATURE_FORMAT') || '', 60).toLowerCase();
  return {
    secrets: String(Deno.env.get('PCM_WEBHOOK_SIGNATURE_SECRET') || '').split(/[\s,;]+/).filter(Boolean),
    header: clean(Deno.env.get('PCM_WEBHOOK_SIGNATURE_HEADER') || 'pcmi-signature', 100).toLowerCase(),
    timestampHeader: 'pcmi-timestamp',
    formats: SIGNATURE_FORMATS.includes(format) ? [format] : SIGNATURE_FORMATS,
  };
}

// PCM sends PascalCase keys ({Event, Data:{Status, BatchID}}); older docs used
// camelCase. Read keys case-insensitively so both shapes resolve.
function get(obj: any, key: string) {
  if (!obj || typeof obj !== 'object') return undefined;
  if (key in obj) return obj[key];
  const lower = key.toLowerCase();
  const found = Object.keys(obj).find((k) => k.toLowerCase() === lower);
  return found === undefined ? undefined : obj[found];
}

function dataOf(payload: any) {
  const data = get(payload, 'data');
  return data && typeof data === 'object' ? data : payload;
}

function first(obj: any, keys: string[]) {
  for (const key of keys) {
    const value = get(obj, key);
    if (value !== undefined && value !== null && clean(value, 300)) return clean(value, 300);
  }
  return '';
}

function eventType(payload: any) {
  return first(payload, ['event', 'eventType', 'event_type', 'webhookType', 'webhook_type', 'type', 'name']) || 'pcm.webhook';
}

function providerStatus(payload: any) {
  return first(dataOf(payload), ['status', 'mailTrackingStatus', 'mail_tracking_status', 'trackingStatus', 'tracking_status']) ||
    first(payload, ['status']);
}

function providerEventKey(payload: any, rawHash: string) {
  const providerId = first(payload, ['eventId', 'event_id', 'webhookId', 'webhook_id', 'id']).slice(0, 100);
  // PCM can resend the same order/recipient webhook as tracking status changes.
  // Include the exact raw-body hash so a true replay is idempotent while a new
  // status payload is still processed even if PCM reuses an event identifier.
  return providerId ? `${providerId}:${rawHash}` : rawHash;
}

function ids(payload: any) {
  const source = dataOf(payload);
  return {
    order: first(source, ['orderID', 'orderId', 'order_id', 'order']),
    batch: first(source, ['batchID', 'batchId', 'batch_id', 'batch']),
    external: first(source, ['extRefNbr', 'externalReference', 'external_reference', 'externalRef', 'reference']),
    recipient: first(source, ['recipientRecordID', 'recipientID', 'recipientId', 'recipient_id', 'recipientExtRefNbr', 'recipient_ext_ref_nbr', 'recipientReference', 'recipient_reference']),
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
  const raw = [type, providerStatus(payload)]
    .map((value) => clean(value, 120).toLowerCase())
    .join(' ');

  if (/cancel/.test(raw)) return 'canceled';
  // Pending/Failed Payment are billing holds on the PCM account, not a failed
  // print job. PCM auto-cancels unpaid batches later (BatchCanceled).
  if (/payment/.test(raw)) return 'pending';
  if (/undeliverable/.test(raw)) return 'failed';
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

// PCM does not print or bill invalid/undeliverable addresses. Once a batch is past
// address validation, count them and credit the agent what they paid for those
// cards. Credits are issued as a delta per batch, so repeats never double-credit.
async function creditUndeliverable(admin: any, job: any) {
  const batch = clean(job.response_summary?.batch_id, 60);
  if (!batch || job.response_summary?.api_version !== 'v3' || !pcmConfigured('live')) return null;
  const child = childRef(job.user_id);
  let undeliverable = 0;
  for (let page = 1, pages = 1; page <= pages && page <= 60; page += 1) {
    const { data } = await pcmRequest('live', child, 'GET', `/batch/${encodeURIComponent(batch)}/recipients?page=${page}&perPage=100`);
    const rows = Array.isArray(data?.results) ? data.results : [];
    undeliverable += rows.filter((r: any) => r?.undeliverable === true).length;
    pages = Math.max(1, Number(data?.totalPages || data?.pagination?.totalPages || 1));
  }
  if (!undeliverable) return { undeliverable: 0, credited: 0 };
  const prior = await admin.from('marketing_mail_credits').select('quantity').eq('provider_job_id', job.id);
  const already = (prior.data || []).reduce((sum: number, row: any) => sum + Number(row.quantity || 0), 0);
  const delta = undeliverable - already;
  if (delta <= 0) return { undeliverable, credited: 0 };
  const quote = job.quote_id
    ? (await admin.from('marketing_price_quotes').select('pricing_detail').eq('id', job.quote_id).maybeSingle()).data
    : null;
  const unit = Math.max(0, Math.trunc(Number(quote?.pricing_detail?.retail_unit_cents || 0)));
  if (!unit) return { undeliverable, credited: 0 };
  const issued = await admin.rpc('marketing_mail_credit_issue', {
    p_user_id: job.user_id,
    p_campaign_id: job.campaign_id,
    p_provider_job_id: job.id,
    p_source_reference: `pcm:batch:${batch}:undeliverable:${undeliverable}`,
    p_quantity: delta,
    p_amount_cents: delta * unit,
    p_reason: 'undeliverable_address',
  });
  if (issued.error) throw issued.error;
  return { undeliverable, credited: delta * unit };
}

Deno.serve(async (req) => {
  if (req.method === 'GET') {
    const current = contract();
    return json(200, {
      provider: 'pcm',
      receiver: 'ready',
      signature_contract_ready: current.secrets.length > 0,
      signature_secret_count: current.secrets.length,
      signature_header: current.header,
      timestamp_header: current.timestampHeader,
      signature_formats: current.formats,
      processing_mode: 'verified_inbox_with_recipient_safe_reconciliation',
      vendor_contract: {
        aggregate_order_statuses: ['pending', 'pending payment', 'failed payment', 'processing', 'mailing', 'delivered', 'undeliverable', 'batch canceled'],
        recipient_tracking_statuses: ['returned', 'delivered', 'redirected', 'en route'],
        retry_schedule_minutes: [1, 5, 10],
        exact_payload_duplicates_acknowledged: true,
        status_updates_processed_separately: true,
      },
    });
  }

  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  const current = contract();
  if (!current.secrets.length) {
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

  const timestamp = (req.headers.get(current.timestampHeader) || '').trim();
  const provided = normalizedProvidedSignature(providedRaw);
  // Documented form is "{timestamp}.{body}". The body-only form is accepted as a
  // fallback in case PCM omits the timestamp header; both need the shared secret.
  const signedInputs = timestamp ? [`${timestamp}.${raw}`, raw] : [raw];
  let verified = false;
  for (const secret of current.secrets) {
    for (const input of signedInputs) {
      const mac = await hmacSha256(secret, input);
      for (const format of current.formats) {
        const expected = format === 'hmac-sha256-base64' ? bytesToBase64(mac) : bytesToHex(mac);
        const candidate = format === 'hmac-sha256-hex' ? provided.toLowerCase() : provided;
        if (constantTimeEqual(expected, candidate)) verified = true;
      }
    }
  }
  if (!verified) {
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
      .select('id,user_id,campaign_id,quote_id,provider_job_id,status,response_summary')
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

    if (['processing', 'mailed', 'delivered', 'failed'].includes(aggregateStatus)) {
      try {
        const credit = await creditUndeliverable(admin, { ...matched, response_summary: update.response_summary });
        if (credit) update.response_summary.undeliverable_reconciliation = { ...credit, checked_at: now };
        if (credit) await admin.from('marketing_provider_jobs').update({ response_summary: update.response_summary }).eq('id', matched.id);
      } catch (error) {
        // Never make PCM retry a status webhook because the credit lookup failed.
        console.error('PCM_UNDELIVERABLE_CREDIT_ERROR', error instanceof Error ? error.message : error);
      }
    }

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
