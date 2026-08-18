import { createClient } from 'npm:@supabase/supabase-js@2.55.0';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60, stale-while-revalidate=120' },
});

type IncidentRow = {
  severity: string | null;
  status: string | null;
  signal_type: string | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
  resolved_at: string | null;
};

const componentFor = (signal: string | null) => {
  const value = String(signal || '').toLowerCase();
  if (value.includes('auth') || value.includes('login') || value.includes('session')) return 'Account services';
  if (value.includes('source') || value.includes('data') || value.includes('property')) return 'Property data';
  if (value.includes('job') || value.includes('worker') || value.includes('notification')) return 'Background services';
  return 'Watchdog web app';
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'GET' && req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return json({ status: 'unknown', message: 'Status is temporarily unavailable' }, 503);

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const { data, error } = await admin
    .from('platform_incidents')
    .select('severity,status,signal_type,first_seen_at,last_seen_at,resolved_at')
    .gte('last_seen_at', since)
    .order('last_seen_at', { ascending: false })
    .limit(100);

  if (error && error.code !== '42P01' && error.code !== 'PGRST205') {
    console.error('public_status_incident_read_failed', { code: error.code });
    return json({ status: 'unknown', message: 'Status is temporarily unavailable' }, 503);
  }

  const rows = (data || []) as IncidentRow[];
  const active = rows.filter((row) => row.status !== 'resolved');
  const critical = active.filter((row) => String(row.severity).toLowerCase() === 'critical');
  const warnings = active.filter((row) => ['warning', 'warn', 'high'].includes(String(row.severity).toLowerCase()));
  const overall = critical.length ? 'major_outage' : warnings.length || active.length ? 'degraded' : 'operational';

  const componentNames = ['Watchdog web app', 'Account services', 'Property data', 'Background services'];
  const components = componentNames.map((name) => {
    const incidents = active.filter((row) => componentFor(row.signal_type) === name);
    const hasCritical = incidents.some((row) => String(row.severity).toLowerCase() === 'critical');
    return {
      name,
      status: hasCritical ? 'major_outage' : incidents.length ? 'degraded' : 'operational',
    };
  });

  const recentResolved = rows
    .filter((row) => row.status === 'resolved' && row.resolved_at)
    .slice(0, 5)
    .map((row) => ({
      component: componentFor(row.signal_type),
      resolved_at: row.resolved_at,
      first_seen_at: row.first_seen_at,
    }));

  return json({
    generated_at: new Date().toISOString(),
    status: overall,
    active_incident_count: active.length,
    components,
    recent_resolved: recentResolved,
  });
});
