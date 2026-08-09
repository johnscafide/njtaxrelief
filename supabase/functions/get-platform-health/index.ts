import { createClient } from 'npm:@supabase/supabase-js@2.55.0';

const cors = { 'Access-Control-Allow-Origin': 'https://njpropertytaxrelief.com', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const auth = req.headers.get('Authorization');
  if (!auth) return json({ error: 'Sign in required' }, 401);
  const url = Deno.env.get('SUPABASE_URL')!, anon = Deno.env.get('SUPABASE_ANON_KEY')!, service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const admin = createClient(url, service);
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: 'Sign in required' }, 401);
  const { data: profile } = await admin.from('profiles').select('account_role').eq('id', user.id).maybeSingle();
  if (profile?.account_role !== 'developer') return json({ error: 'Developer access required' }, 403);

  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  const [telemetry, incidents, billingEvents, billingAudit] = await Promise.all([
    admin.from('access_audit_log').select('event_type,resource_id,metadata,created_at').like('event_type', 'platform.%').gte('created_at', since).order('created_at', { ascending: false }).limit(100),
    admin.from('platform_incidents').select('id,title,severity,status,signal_type,route,event_count,last_seen_at,release').order('last_seen_at', { ascending: false }).limit(50),
    admin.from('billing_provider_events').select('event_type,occurred_at,result').eq('provider', 'paddle').order('occurred_at', { ascending: false }).limit(250),
    admin.from('access_audit_log').select('event_type,created_at,metadata').like('event_type', 'billing.%').order('created_at', { ascending: false }).limit(250)
  ]);
  if (telemetry.error) return json({ error: 'Reliability events could not be loaded' }, 500);
  if (incidents.error && incidents.error.code !== '42P01') return json({ error: 'Incidents could not be loaded' }, 500);

  const rows = telemetry.data || [], cutoff = Date.now() - 86400000;
  const counts: Record<string, number> = { last_24h: 0, last_7d: rows.length, client_errors: 0, slow_pages: 0, open_incidents: 0, critical_incidents: 0 };
  rows.forEach((row) => { if (new Date(row.created_at).getTime() >= cutoff) counts.last_24h++; if (row.event_type !== 'platform.slow_page') counts.client_errors++; else counts.slow_pages++; });
  (incidents.data || []).forEach((row) => { if (row.status !== 'resolved') { counts.open_incidents++; if (row.severity === 'critical') counts.critical_incidents++; } });

  const eventTypes = new Set((billingEvents.data || []).map((row) => row.event_type));
  const auditTypes = new Set((billingAudit.data || []).map((row) => row.event_type));
  const statuses = new Set((billingEvents.data || []).map((row) => row.result?.status).filter(Boolean));
  const environment = Deno.env.get('PADDLE_ENVIRONMENT') === 'production' ? 'production' : 'sandbox';
  const billing = {
    environment,
    checks: [
      { id: 'checkout', label: 'Authenticated checkout created', passed: auditTypes.has('billing.checkout_created') || eventTypes.has('transaction.completed') },
      { id: 'purchase', label: 'Signed purchase webhook processed', passed: eventTypes.has('transaction.completed') },
      { id: 'portal', label: 'Customer Portal opened', passed: auditTypes.has('billing.portal_opened') || auditTypes.has('billing.existing_subscription_redirected_to_portal') },
      { id: 'plan_change', label: 'Plan change webhook processed', passed: auditTypes.has('billing.subscription_plan_change_requested') && eventTypes.has('subscription.updated') },
      { id: 'cancel_resume', label: 'Cancellation or resume processed', passed: eventTypes.has('subscription.updated') },
      { id: 'past_due', label: 'Past-due behavior observed', passed: statuses.has('past_due') },
      { id: 'paused', label: 'Paused behavior observed', passed: eventTypes.has('subscription.paused') || statuses.has('paused') },
      { id: 'canceled', label: 'Cancellation completion observed', passed: eventTypes.has('subscription.canceled') || statuses.has('canceled') },
      { id: 'live_cycle', label: 'Live paid lifecycle completed', passed: environment === 'production' && eventTypes.has('transaction.completed') }
    ],
    latest_event_at: billingEvents.data?.[0]?.occurred_at || null
  };

  return json({
    generated_at: new Date().toISOString(), release: '0.42.0', counts,
    events: rows.slice(0, 50), incidents: incidents.data || [], billing
  });
});
