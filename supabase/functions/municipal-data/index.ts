import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const allowedOrigins = new Set([
  'https://njpropertytaxrelief.com',
  'https://www.njpropertytaxrelief.com'
]);

function cors(req: Request) {
  const origin = req.headers.get('origin') || '';
  return {
    'Access-Control-Allow-Origin': allowedOrigins.has(origin) ? origin : 'https://njpropertytaxrelief.com',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin'
  };
}

function response(req: Request, status: number, payload: Record<string, unknown>, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors(req), ...extra, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store' }
  });
}

function clean(value: unknown, max = 80) {
  return String(value || '').trim().replace(/[\u0000-\u001f]/g, '').slice(0, max);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  if (req.method !== 'POST') return response(req, 405, { error: 'Method not allowed' });
  const origin = req.headers.get('origin') || '';
  if (origin && !allowedOrigins.has(origin)) return response(req, 403, { error: 'Origin not allowed' });

  const url = Deno.env.get('SUPABASE_URL') || '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const authorization = req.headers.get('authorization') || '';
  if (!authorization.startsWith('Bearer ')) return response(req, 401, { error: 'Sign in required' });

  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) return response(req, 401, { error: 'Session could not be verified' });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch (_) { return response(req, 400, { error: 'Invalid JSON' }); }
  const scopeType = clean(body.scope_type, 20).toLowerCase();
  const scopeValue = clean(body.scope_value);
  const propertyClasses = Array.isArray(body.property_classes)
    ? body.property_classes.map((item) => clean(item, 4)).filter((item) => /^[0-9A-Z.]{1,4}$/.test(item)).slice(0, 8)
    : [];
  if (!['municipality', 'county', 'zip'].includes(scopeType) || scopeValue.length < 2) {
    return response(req, 400, { error: 'Choose a valid municipality, county or ZIP territory' });
  }

  const { data: entitlement } = await admin.from('account_entitlements')
    .select('plan_tier,subscription_status').eq('user_id', authData.user.id).maybeSingle();
  const { data: profile } = await admin.from('profiles').select('account_role').eq('id', authData.user.id).maybeSingle();
  const developer = profile?.account_role === 'developer';
  const paidStatus = ['active', 'trialing', 'past_due', 'cancel_scheduled'].includes(String(entitlement?.subscription_status || ''));
  const effective = developer ? 'developer' : paidStatus ? String(entitlement?.plan_tier || 'standard') : 'standard';
  const limits: Record<string, { requests: number; rows: number }> = {
    standard: { requests: 20, rows: 25 }, pro: { requests: 120, rows: 250 }, pro_plus: { requests: 300, rows: 1000 }, developer: { requests: 1000, rows: 1000 }
  };
  const tier = limits[effective] ? effective : 'standard';
  const requestedRows = Math.max(1, Math.min(Number(body.limit) || limits[tier].rows, limits[tier].rows));
  const deliveryId = crypto.randomUUID();
  const { data: quota, error: quotaError } = await admin.rpc('consume_municipal_quota', {
    p_user_id: authData.user.id, p_endpoint: 'municipal-data', p_limit: limits[tier].requests,
    p_rows: 0, p_delivery_id: deliveryId
  });
  if (quotaError) return response(req, 503, { error: 'Delivery quota could not be checked' });
  if (!quota?.allowed) return response(req, 429, { error: 'Request limit reached. Try again after the five-minute window.', reset_at: quota.reset_at }, {
    'X-RateLimit-Limit': String(quota.limit), 'X-RateLimit-Remaining': '0',
    'Retry-After': String(Math.max(1, Math.ceil((Date.parse(String(quota.reset_at || '')) - Date.now()) / 1000) || 300))
  });

  let query = admin.from('property_lookups').select(
    'pams_pin,address,town,county,zip,block,lot,qualifier,prop_class,year_built,acres,dwelling_units,building_desc,land_value,improvement_value,assessed_value,last_year_tax,effective_rate,last_sale_price,last_sale_year,last_seen'
  );
  if (scopeType === 'municipality') query = query.ilike('town', scopeValue);
  if (scopeType === 'county') query = query.ilike('county', scopeValue);
  if (scopeType === 'zip') query = query.eq('zip', scopeValue.replace(/\D/g, '').slice(0, 5));
  if (propertyClasses.length) query = query.in('prop_class', propertyClasses);
  const { data: rows, error: dataError } = await query.order('last_seen', { ascending: false }).limit(requestedRows);
  if (dataError) return response(req, 503, { error: 'Municipal records are temporarily unavailable' });

  await admin.rpc('record_municipal_delivery', {
    p_user_id: authData.user.id, p_delivery_id: deliveryId, p_rows: (rows || []).length
  });

  return response(req, 200, {
    delivery_id: deliveryId,
    scope: { type: scopeType, value: scopeValue },
    plan: tier,
    count: (rows || []).length,
    records: rows || [],
    source: 'Watchdog normalized NJ public-record warehouse',
    limitation: 'Property records are research context, not owner identity, title evidence, an appraisal, or a prediction of intent.'
  }, {
    'X-RateLimit-Limit': String(quota.limit),
    'X-RateLimit-Remaining': String(quota.remaining),
    'X-Watchdog-Delivery': deliveryId
  });
});
