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
  const { data, error } = await admin.from('access_audit_log').select('event_type,resource_id,metadata,created_at').like('event_type', 'platform.%').gte('created_at', since).order('created_at', { ascending: false }).limit(100);
  if (error) return json({ error: 'Reliability events could not be loaded' }, 500);
  const rows = data || [], cutoff = Date.now() - 86400000;
  const counts: Record<string, number> = { last_24h: 0, last_7d: rows.length, client_errors: 0, slow_pages: 0 };
  rows.forEach((row) => { if (new Date(row.created_at).getTime() >= cutoff) counts.last_24h++; if (row.event_type !== 'platform.slow_page') counts.client_errors++; else counts.slow_pages++; });
  return json({ generated_at: new Date().toISOString(), release: '0.41.0', counts, events: rows.slice(0, 50) });
});
