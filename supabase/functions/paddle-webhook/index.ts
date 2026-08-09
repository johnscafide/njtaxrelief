import { createClient } from '@supabase/supabase-js';

const textEncoder = new TextEncoder();

function hex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verifyPaddleSignature(raw: string, header: string, secret: string) {
  const parts = header.split(';').map((part) => part.trim().split('='));
  const timestamp = parts.find((part) => part[0] === 'ts')?.[1];
  const signatures = parts.filter((part) => part[0] === 'h1').map((part) => part[1]);
  if (!timestamp || !signatures.length) return false;
  const ts = Number(timestamp);
  const tolerance = Number(Deno.env.get('PADDLE_WEBHOOK_TOLERANCE_SECONDS') || '5');
  if (!Number.isFinite(ts) || Math.abs(Math.floor(Date.now() / 1000) - ts) > tolerance) return false;
  const key = await crypto.subtle.importKey('raw', textEncoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = hex(await crypto.subtle.sign('HMAC', key, textEncoder.encode(`${timestamp}:${raw}`)));
  return signatures.some((signature) => safeEqual(signature.toLowerCase(), digest));
}

function planForPrice(priceId: string | undefined) {
  if (priceId && priceId === Deno.env.get('PADDLE_PRICE_PRO_PLUS')) return 'pro_plus';
  if (priceId && priceId === Deno.env.get('PADDLE_PRICE_PRO')) return 'pro';
  return null;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const secret = Deno.env.get('PADDLE_WEBHOOK_SECRET');
  const signature = req.headers.get('Paddle-Signature');
  if (!secret || !signature) return new Response('Webhook not configured', { status: 503 });
  const raw = await req.text();
  if (!(await verifyPaddleSignature(raw, signature, secret))) return new Response('Invalid Paddle signature', { status: 400 });

  let event: any;
  try { event = JSON.parse(raw); } catch { return new Response('Invalid JSON', { status: 400 }); }
  const eventId = String(event?.event_id || '');
  const eventType = String(event?.event_type || '');
  const occurredAt = event?.occurred_at || null;
  if (!eventId || !eventType) return new Response('Invalid Paddle event', { status: 400 });

  const service = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: prior } = await service.from('billing_provider_events').select('provider_event_id').eq('provider', 'paddle').eq('provider_event_id', eventId).maybeSingle();
  if (prior) return new Response('ok', { status: 200 });

  let result: Record<string, unknown> = { handled: false };
  if (eventType.startsWith('subscription.')) {
    const sub = event.data || {};
    const subscriptionId = String(sub.id || '');
    const customerId = String(sub.customer_id || '');
    // Current Checkout uses watchdog_user_id. Accept the earlier Sandbox field
    // as a migration fallback so an in-flight test subscription cannot become
    // orphaned while the billing contract is being cut over.
    const customUserId = sub?.custom_data?.watchdog_user_id
      ? String(sub.custom_data.watchdog_user_id)
      : sub?.custom_data?.supabase_user_id
        ? String(sub.custom_data.supabase_user_id)
        : null;
    const priceId = sub?.items?.[0]?.price?.id ? String(sub.items[0].price.id) : undefined;
    const plan = planForPrice(priceId);
    let userId = customUserId;
    if (!userId && subscriptionId) {
      const { data: mapped } = await service.from('account_entitlements').select('user_id').eq('provider', 'paddle').eq('provider_subscription_id', subscriptionId).maybeSingle();
      userId = mapped?.user_id || null;
    }
    if (!userId && customerId) {
      const { data: mapped } = await service.from('account_entitlements').select('user_id').eq('provider', 'paddle').eq('provider_customer_id', customerId).maybeSingle();
      userId = mapped?.user_id || null;
    }

    if (!userId || !plan) {
      result = { handled: false, warning: !userId ? 'unmapped subscription user' : 'unrecognized price', subscription_id: subscriptionId };
    } else {
      const { data: current } = await service.from('account_entitlements').select('provider_event_at').eq('user_id', userId).maybeSingle();
      const incomingTime = occurredAt ? new Date(occurredAt).getTime() : Date.now();
      const currentTime = current?.provider_event_at ? new Date(current.provider_event_at).getTime() : 0;
      if (currentTime && incomingTime < currentTime) {
        result = { handled: false, ignored: 'out_of_order', user_id: userId, subscription_id: subscriptionId };
      } else {
        const status = String(sub.status || 'none');
        const periodEnd = sub?.current_billing_period?.ends_at || sub?.next_billed_at || null;
        const cancelAtPeriodEnd = sub?.scheduled_change?.action === 'cancel';
        const { error } = await service.from('account_entitlements').upsert({
          user_id: userId, plan_tier: plan, subscription_status: status, provider: 'paddle',
          provider_customer_id: customerId || null, provider_subscription_id: subscriptionId || null,
          provider_price_id: priceId || null, current_period_end: periodEnd, cancel_at_period_end: cancelAtPeriodEnd,
          provider_event_at: occurredAt || new Date().toISOString(), source: 'paddle-webhook', updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });
        if (error) throw error;
        result = { handled: true, user_id: userId, subscription_id: subscriptionId, plan_tier: plan, status };
      }
    }
  } else if (eventType === 'transaction.completed') {
    result = { handled: true, audited_only: true, transaction_id: event?.data?.id || null };
  }

  const { error: ledgerError } = await service.from('billing_provider_events').insert({
    provider: 'paddle', provider_event_id: eventId, event_type: eventType, occurred_at: occurredAt, result
  });
  if (ledgerError && ledgerError.code !== '23505') throw ledgerError;
  return new Response('ok', { status: 200 });
});
