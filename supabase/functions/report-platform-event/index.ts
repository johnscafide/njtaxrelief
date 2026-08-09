import { createClient } from 'npm:@supabase/supabase-js@2.55.0';

const cors = { 'Access-Control-Allow-Origin': 'https://njpropertytaxrelief.com', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const allowed = new Set(['client_error', 'unhandled_rejection', 'resource_error', 'slow_page']);
const safe = (value: unknown, max: number) => String(value || '').replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[email]').replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '[id]').replace(/\b\d{8,}\b/g, '[number]').slice(0, max);

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
  const body = await req.json().catch(() => ({}));
  const type = String(body.type || '');
  if (!allowed.has(type)) return json({ error: 'Unsupported event type' }, 400);
  const route = safe(body.route, 180);
  if (!route.startsWith('/')) return json({ error: 'Invalid route' }, 400);
  const metadata = {
    message: safe(body.message, 240), source: safe(body.source, 80), release: safe(body.release, 32),
    line: Math.max(0, Math.min(Number(body.line) || 0, 1000000)), column: Math.max(0, Math.min(Number(body.column) || 0, 1000000)),
    duration_ms: Math.max(0, Math.min(Number(body.duration_ms) || 0, 120000)), viewport: body.viewport === 'mobile' ? 'mobile' : 'desktop'
  };
  const { error } = await admin.from('access_audit_log').insert({ user_id: user.id, event_type: `platform.${type}`, resource_type: 'route', resource_id: route, allowed: true, request_id: crypto.randomUUID(), metadata });
  if (error) return json({ error: 'Event could not be recorded' }, 500);
  return json({ accepted: true }, 202);
});
