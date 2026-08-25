import { createClient } from 'npm:@supabase/supabase-js@2.95.0';

const URL = Deno.env.get('SUPABASE_URL')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ORIGINS = new Set([
  'https://watchdogindex.com',
  'https://www.watchdogindex.com',
  'https://njpropertytaxrelief.com',
  'https://www.njpropertytaxrelief.com',
]);

function clean(value: unknown, max = 180) {
  return String(value ?? '').trim().replace(/[\u0000-\u001f]/g, '').slice(0, max);
}

function cors(req: Request) {
  const origin = req.headers.get('origin') || '';
  return {
    'Access-Control-Allow-Origin': ORIGINS.has(origin) ? origin : 'https://www.watchdogindex.com',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Cache-Control': 'private, no-store',
    'Vary': 'Origin',
  };
}

function reply(req: Request, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(req), 'Content-Type': 'application/json; charset=utf-8' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  if (req.method !== 'POST') return reply(req, 405, { error: 'Method not allowed' });

  const origin = req.headers.get('origin') || '';
  if (origin && !ORIGINS.has(origin)) return reply(req, 403, { error: 'Origin not allowed' });

  const auth = req.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return reply(req, 401, { error: 'Sign in required' });

  const userClient = createClient(URL, ANON, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return reply(req, 401, { error: 'Session could not be verified' });

  const access = await userClient.rpc('marketing_studio_bootstrap');
  if (access.error) return reply(req, 403, { error: 'Marketing Studio access required' });

  let body: any = {};
  try { body = await req.json(); } catch { /* normalized below */ }
  const providerJobId = clean(body?.provider_job_id, 80);
  if (!providerJobId) return reply(req, 400, { error: 'provider_job_id is required' });

  const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
  const jobResult = await admin
    .from('marketing_provider_jobs')
    .select('id,user_id,campaign_id,provider_key,status,provider_job_id,response_summary,updated_at')
    .eq('id', providerJobId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (jobResult.error || !jobResult.data) return reply(req, 404, { error: 'Direct Mail provider job not found' });
  const job: any = jobResult.data;
  if (job.provider_key !== 'pcm') {
    return reply(req, 409, { error: 'This cancellation boundary is PCM-only', code: 'PCM_CANCEL_PROVIDER_REQUIRED' });
  }

  const rawProviderStatus = clean(job.response_summary?.provider_order_status, 80).toLowerCase();
  const normalizedWebhookStatus = clean(job.response_summary?.last_webhook_status, 80).toLowerCase();
  const verifiedWebhookAt = clean(job.response_summary?.last_webhook_at, 100);
  const latestVerifiedPending = rawProviderStatus === 'pending'
    && normalizedWebhookStatus === 'pending'
    && Boolean(verifiedWebhookAt);

  if (!latestVerifiedPending) {
    return reply(req, 409, {
      error: 'PCM cancellation is unavailable unless the latest verified aggregate provider status is exactly pending.',
      code: 'PCM_CANCEL_LATEST_PENDING_REQUIRED',
      cancellation_submitted: false,
      provider_mutation_called: false,
      current_provider_status: rawProviderStatus || null,
    });
  }

  // PCM confirmed cancellation semantics and supplied the current documentation,
  // but Watchdog has not mechanically certified the exact direct HTTP path/auth/body
  // contract in this environment. Do not infer it from a documentation slug or a
  // third-party normalized connector. This endpoint intentionally stops here.
  return reply(req, 503, {
    error: 'PCM direct cancellation wire contract is not certified yet.',
    code: 'PCM_CANCEL_CONTRACT_PENDING',
    cancellation_submitted: false,
    provider_mutation_called: false,
    latest_verified_provider_status: 'pending',
  });
});
