import { createClient } from '@supabase/supabase-js';

const service = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const encoder = new TextEncoder();
const planForPrice = (price?: string | null) => price && price === Deno.env.get('PADDLE_PRICE_PRO_PLUS') ? 'pro_plus' : price && price === Deno.env.get('PADDLE_PRICE_PRO') ? 'pro' : null;

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function signatureIsValid(raw: string, header: string, secret: string) {
  const fields = header.split(';').map((part) => part.split('=', 2));
  const timestamp = fields.find(([key]) => key === 'ts')?.[1] || '';
  const signatures = fields.filter(([key]) => key === 'h1').map(([, value]) => value);
  const seconds = Number(timestamp);
  if (!timestamp || !Number.isFinite(seconds) || Math.abs(Date.now() / 1000 - seconds) > 300 || !signatures.length) return false;
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}:${raw}`)));
  const expected = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return signatures.some((value) => safeEqual(expected, value));
}

type PaddleSubscription = {
  id: string;
  status?: string;
  customer_id?: string;
  custom_data?: Record<string, unknown> | null;
  items?: Array<{ price?: { id?: string } }>;
  current_billing_period?: { ends_at?: string | null } | null;
  scheduled_change?: { action?: string } | null;
};

async function syncSubscription(sub: PaddleSubscription, occurredAt: string | null) {
  const userId = typeof sub.custom_data?.supabase_user_id === 'string' ? sub.custom_data.supabase_user_id : null;
  if (!userId) return { skipped: 'missing supabase_user_id' };
  const priceId = sub.items?.[0]?.price?.id || null;
  const plan = planForPrice(priceId);
  const { data: current } = await service.from('account_entitlements').select('provider,provider_event_at').eq('user_id', userId).maybeSingle();
  if (current?.provider === 'paddle' && current.provider_event_at && occurredAt && new Date(current.provider_event_at) > new Date(occurredAt)) {
    return { skipped: 'stale event', user_id: userId };
  }

  const paddleStatus = ['trialing','active','past_due','paused','canceled'].includes(sub.status || '') ? sub.status : 'none';
  const recognized = Boolean(plan);
  const update = {
    user_id: userId,
    plan_tier: recognized ? plan : 'standard',
    subscription_status: recognized ? paddleStatus : 'none',
    provider: 'paddle',
    provider_customer_id: sub.customer_id || null,
    provider_subscription_id: sub.id,
    provider_price_id: priceId,
    provider_event_at: occurredAt,
    current_period_end: sub.current_billing_period?.ends_at || null,
    cancel_at_period_end: sub.scheduled_change?.action === 'cancel',
    source: recognized ? 'paddle-webhook' : 'paddle-webhook-unrecognized-price',
    updated_at: new Date().toISOString()
  };
  const { error } = await service.from('account_entitlements').upsert(update, { onConflict: 'user_id' });
  if (error) throw error;
  return { user_id: userId, plan_tier: update.plan_tier, status: update.subscription_status, recognized_price: recognized };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const secret = Deno.env.get('PADDLE_WEBHOOK_SECRET');
  if (!secret) return new Response('Billing webhook is not configured', { status: 503 });
  const signature = req.headers.get('paddle-signature');
  if (!signature) return new Response('Missing Paddle signature', { status: 400 });
  const raw = await req.text();
  if (!(await signatureIsValid(raw, signature, secret))) return new Response('Invalid Paddle webhook', { status: 400 });

  let event: Record<string, any>;
  try { event = JSON.parse(raw); } catch (_) { return new Response('Invalid JSON', { status: 400 }); }
  const eventId = typeof event.event_id === 'string' ? event.event_id : null;
  const eventType = typeof event.event_type === 'string' ? event.event_type : '';
  const occurredAt = typeof event.occurred_at === 'string' ? event.occurred_at : null;
  if (!eventId) return new Response('Missing event ID', { status: 400 });

  const { data: prior } = await service.from('billing_provider_events').select('provider_event_id').eq('provider', 'paddle').eq('provider_event_id', eventId).maybeSingle();
  if (prior) return new Response('Already processed', { status: 200 });

  let result: Record<string, unknown> = { ignored: true };
  if (eventType.startsWith('subscription.')) result = await syncSubscription(event.data as PaddleSubscription, occurredAt);
  const { error } = await service.from('billing_provider_events').insert({ provider: 'paddle', provider_event_id: eventId, event_type: eventType, occurred_at: occurredAt, result });
  if (error && error.code !== '23505') return new Response('Could not record webhook', { status: 500 });
  return new Response('ok', { status: 200 });
});
