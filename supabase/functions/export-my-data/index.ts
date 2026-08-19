import { createClient } from 'npm:@supabase/supabase-js@2.55.0';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200, extraHeaders: Record<string, string> = {}) => new Response(JSON.stringify(body, null, 2), {
  status,
  headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store, max-age=0', ...extraHeaders },
});

type ExportSpec = { key: string; table: string; column?: string };

const userTables: ExportSpec[] = [
  { key: 'profile', table: 'profiles', column: 'id' },
  { key: 'professional_preferences', table: 'professional_preferences' },
  { key: 'saved_properties', table: 'saved_properties' },
  { key: 'professional_cases', table: 'professional_cases' },
  { key: 'professional_reports', table: 'professional_reports' },
  { key: 'professional_report_versions', table: 'professional_report_versions' },
  { key: 'data_workbench_views', table: 'data_workbench_views' },
  { key: 'data_workbench_campaigns', table: 'data_workbench_campaigns' },
  { key: 'agent_dynamic_lists', table: 'agent_dynamic_lists' },
  { key: 'agent_dynamic_list_properties', table: 'agent_dynamic_list_properties' },
  { key: 'marketing_campaigns', table: 'marketing_campaigns' },
  { key: 'marketing_audiences', table: 'marketing_audiences' },
  { key: 'organization_memberships', table: 'organization_members' },
  { key: 'support_requests', table: 'support_requests' },
  { key: 'intelligence_analyst_messages', table: 'intelligence_analyst_messages' },
  { key: 'intelligence_analyst_sessions', table: 'intelligence_analyst_sessions' },
  { key: 'intelligence_assumptions', table: 'intelligence_assumptions' },
  { key: 'intelligence_daily_digests', table: 'intelligence_daily_digests' },
  { key: 'intelligence_feedback', table: 'intelligence_feedback' },
  { key: 'intelligence_findings', table: 'intelligence_findings' },
  { key: 'intelligence_jobs', table: 'intelligence_jobs' },
  { key: 'intelligence_outcome_events', table: 'intelligence_outcome_events' },
  { key: 'intelligence_preference_profiles', table: 'intelligence_preference_profiles' },
  { key: 'intelligence_runs', table: 'intelligence_runs' },
  { key: 'intelligence_scopes', table: 'intelligence_scopes' },
  { key: 'intelligence_usage_events', table: 'intelligence_usage_events' },
  { key: 'intelligence_value_snapshots', table: 'intelligence_value_snapshots' },
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authorization = req.headers.get('Authorization');
  if (!authorization) return json({ error: 'Sign in required' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceKey) return json({ error: 'Export service unavailable' }, 503);

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) return json({ error: 'Sign in required' }, 401);

  const exported: Record<string, unknown> = {};
  const skipped: Array<{ table: string; reason: string }> = [];

  for (const spec of userTables) {
    const column = spec.column || 'user_id';
    const { data, error } = await admin.from(spec.table).select('*').eq(column, user.id).limit(10000);
    if (error) {
      if (error.code === '42P01' || error.code === 'PGRST205') {
        skipped.push({ table: spec.table, reason: 'not_present_in_this_release' });
        continue;
      }
      console.error('customer_export_table_failed', { table: spec.table, code: error.code, user_id: user.id });
      return json({ error: 'Export could not be completed', table: spec.table }, 500);
    }
    exported[spec.key] = data || [];
  }

  const { data: ownedOrganizations, error: ownedOrgError } = await admin
    .from('organizations').select('*').eq('owner_user_id', user.id).limit(1000);
  if (!ownedOrgError) exported.organizations_owned = ownedOrganizations || [];
  else if (ownedOrgError.code !== '42P01' && ownedOrgError.code !== 'PGRST205') {
    return json({ error: 'Export could not be completed', table: 'organizations' }, 500);
  }

  const identity = {
    id: user.id,
    email: user.email,
    created_at: user.created_at,
    last_sign_in_at: user.last_sign_in_at,
    providers: Array.from(new Set((user.identities || []).map((identity) => identity.provider).filter(Boolean))),
  };

  const generatedAt = new Date().toISOString();
  const filename = `watchdog-data-export-${generatedAt.slice(0, 10)}.json`;
  return json({
    schema_version: 1,
    generated_at: generatedAt,
    account: identity,
    data: exported,
    skipped_optional_tables: skipped,
    note: 'This export contains Watchdog account and workspace data associated with the signed-in user. Source property records that Watchdog obtains from public agencies remain governed by their source terms and are not duplicated as a raw statewide dataset.',
  }, 200, { 'Content-Disposition': `attachment; filename="${filename}"` });
});
