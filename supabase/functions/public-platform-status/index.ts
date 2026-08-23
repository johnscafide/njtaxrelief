import { createClient } from 'npm:@supabase/supabase-js@2.55.0';

const CANONICAL_SITE = 'https://www.watchdogindex.com';
const PRODUCTION_ORIGINS = new Set([
  'https://www.watchdogindex.com',
  'https://watchdogindex.com',
  'https://njpropertytaxrelief.com',
  'https://www.njpropertytaxrelief.com'
]);
const ACTIVE_WINDOW_MS = 30 * 60 * 1000;
const HISTORY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

function allowedOrigin(req: Request) {
  const origin = req.headers.get('origin') || '';
  if (PRODUCTION_ORIGINS.has(origin)) return origin;
  try {
    const host = new URL(origin).hostname.toLowerCase();
    if (host.endsWith('.vercel.app') || host === 'localhost' || host === '127.0.0.1') return origin;
  } catch (_) {}
  return CANONICAL_SITE;
}

function cors(req: Request) {
  return {
    'Access-Control-Allow-Origin': allowedOrigin(req),
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Vary': 'Origin'
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors(req),
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=30, stale-while-revalidate=60'
    }
  });
}

type IncidentRow = {
  severity: string | null;
  status: string | null;
  signal_type: string | null;
  last_seen_at: string | null;
  resolved_at: string | null;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  if (req.method !== 'GET') return json(req, { error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    return json(req, {
      generated_at: new Date().toISOString(),
      status: 'unknown',
      components: [],
      recent_resolved: []
    }, 503);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const now = Date.now();
  const historySince = new Date(now - HISTORY_WINDOW_MS).toISOString();
  const activeSince = now - ACTIVE_WINDOW_MS;
  const { data, error } = await admin
    .from('platform_incidents')
    .select('severity,status,signal_type,last_seen_at,resolved_at')
    .gte('last_seen_at', historySince)
    .order('last_seen_at', { ascending: false })
    .limit(100);

  if (error && error.code !== '42P01' && error.code !== 'PGRST205') {
    console.error('public_status_incident_read_failed', { code: error.code });
    return json(req, {
      generated_at: new Date().toISOString(),
      status: 'unknown',
      components: [],
      recent_resolved: []
    }, 503);
  }

  const rows = (data || []) as IncidentRow[];
  // Incident rows are daily aggregation buckets and are not automatically closed
  // when signals stop. Only a recently observed unresolved signal represents
  // current public service health; older rows remain internal historical evidence.
  const active = rows.filter((row) => {
    if (row.status === 'resolved' || !row.last_seen_at) return false;
    const seen = new Date(row.last_seen_at).getTime();
    return Number.isFinite(seen) && seen >= activeSince;
  });
  const hasCritical = active.some((row) => String(row.severity || '').toLowerCase() === 'critical');
  const overall = hasCritical ? 'major_outage' : active.length ? 'degraded' : 'operational';

  const recentResolved = rows
    .filter((row) => row.status === 'resolved' && row.resolved_at)
    .sort((a, b) => new Date(b.resolved_at || 0).getTime() - new Date(a.resolved_at || 0).getTime())
    .slice(0, 5)
    .map((row) => ({ component: 'Watchdog web app', resolved_at: row.resolved_at }));

  return json(req, {
    generated_at: new Date().toISOString(),
    status: overall,
    components: [{ name: 'Watchdog web app', status: overall }],
    recent_resolved: recentResolved
  });
});
