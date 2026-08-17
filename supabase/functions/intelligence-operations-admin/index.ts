import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const VERSION = "watchdog-intelligence-operations-v1";
type O = Record<string, any>;
const clean = (value: unknown, max = 300) => String(value ?? "").replace(/[<>]/g, "").trim().slice(0, max);
function namedEnv(jsonName: string, legacyName: string) {
  const raw = Deno.env.get(jsonName) || "";
  if (raw) {
    try { const parsed = JSON.parse(raw); if (parsed?.default) return String(parsed.default); } catch { /* fall through */ }
  }
  return Deno.env.get(legacyName) || "";
}
function percentile(values: number[], q: number) {
  if (!values.length) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[index];
}
function avg(values: number[]) { return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null; }

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "POST required" }), { status: 405, headers: { "Content-Type": "application/json" } });
  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return new Response(JSON.stringify({ error: "Sign in required" }), { status: 401, headers: { "Content-Type": "application/json" } });
  const url = Deno.env.get("SUPABASE_URL") || "";
  const publishable = namedEnv("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
  const secret = namedEnv("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !publishable || !secret) return new Response(JSON.stringify({ error: "Operations configuration incomplete" }), { status: 503, headers: { "Content-Type": "application/json" } });
  const userClient = createClient(url, publishable, { global: { headers: { Authorization: auth } }, auth: { persistSession: false, autoRefreshToken: false } });
  const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData } = await userClient.auth.getUser();
  const user = authData?.user;
  if (!user) return new Response(JSON.stringify({ error: "Session invalid" }), { status: 401, headers: { "Content-Type": "application/json" } });
  const profile = await admin.from("profiles").select("account_role").eq("id", user.id).maybeSingle();
  if (String(profile.data?.account_role || "") !== "developer") return new Response(JSON.stringify({ error: "Developer access required" }), { status: 403, headers: { "Content-Type": "application/json" } });

  const since = new Date(Date.now() - 86400000).toISOString();
  const [models, modelVersions, jobs, runs, findings, usage, scopes, cache, calibration] = await Promise.all([
    admin.from("intelligence_models").select("model_key,label,objective,minimum_plan,version,status,calibration_state,updated_at").order("model_key"),
    admin.from("intelligence_model_versions").select("model_key,version,status,calibration_state,minimum_plan,created_at").order("model_key").order("version", { ascending: false }).limit(100),
    admin.from("intelligence_jobs").select("id,model_key,model_version,status,candidate_count,processed_count,finding_count,retry_count,created_at,started_at,completed_at,error_code,error_message,metrics").gte("created_at", since).order("created_at", { ascending: false }).limit(1000),
    admin.from("intelligence_runs").select("id,model_key,model_version,status,candidate_count,finding_count,engine_version,started_at,completed_at,error_code").gte("created_at", since).order("created_at", { ascending: false }).limit(1000),
    admin.from("intelligence_findings").select("id,run_id,score,confidence,evidence_coverage,created_at").gte("created_at", since).limit(5000),
    admin.from("intelligence_usage_events").select("event_type,provider,model,request_units,input_tokens,output_tokens,latency_ms,metadata,created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(5000),
    admin.from("intelligence_scopes").select("id,is_active,is_scheduled,cadence,next_run_at,last_run_at,model_keys,updated_at").eq("is_active", true).limit(1000),
    admin.from("intelligence_run_cache").select("cache_key,model_key,model_version,hit_count,last_hit_at,expires_at,created_at").gt("expires_at", new Date().toISOString()).limit(5000),
    admin.from("intelligence_calibration_rollups").select("*").order("created_at", { ascending: false }).limit(100),
  ]);

  const jobRows = jobs.data || [];
  const runRows = runs.data || [];
  const findingRows = findings.data || [];
  const usageRows = usage.data || [];
  const durations = jobRows.map((job: O) => job.started_at && job.completed_at ? new Date(job.completed_at).getTime() - new Date(job.started_at).getTime() : null).filter((value: any) => Number.isFinite(value) && value >= 0) as number[];
  const latencies = usageRows.map((row: O) => Number(row.latency_ms)).filter((value: number) => Number.isFinite(value) && value >= 0);
  const inputTokens = usageRows.reduce((sum: number, row: O) => sum + Number(row.input_tokens || 0), 0);
  const outputTokens = usageRows.reduce((sum: number, row: O) => sum + Number(row.output_tokens || 0), 0);
  const failures = jobRows.filter((job: O) => job.status === "failed").length;
  const cacheHits = jobRows.filter((job: O) => job.status === "cache_hit").length;
  const stale = jobRows.filter((job: O) => job.status === "running" && job.started_at && Date.now() - new Date(job.started_at).getTime() > 10 * 60 * 1000).length;
  const scheduledRows = (scopes.data || []).filter((scope: O) => scope.is_scheduled);
  const due = scheduledRows.filter((scope: O) => scope.next_run_at && new Date(scope.next_run_at).getTime() <= Date.now()).length;

  const response = {
    ok: true,
    version: VERSION,
    window: { hours: 24, since },
    models: models.data || [],
    model_versions: modelVersions.data || [],
    calibration: calibration.error ? { status: "not_available", rows: [] } : { status: "available", rows: calibration.data || [] },
    jobs: {
      total: jobRows.length,
      queued: jobRows.filter((job: O) => job.status === "queued").length,
      running: jobRows.filter((job: O) => job.status === "running").length,
      partial: jobRows.filter((job: O) => job.status === "partial").length,
      complete: jobRows.filter((job: O) => job.status === "complete").length,
      cache_hit: cacheHits,
      failed: failures,
      stale_running: stale,
      failure_rate: jobRows.length ? failures / jobRows.length : 0,
      cache_hit_rate: jobRows.length ? cacheHits / jobRows.length : 0,
      average_completion_ms: avg(durations),
      p95_completion_ms: percentile(durations, 0.95),
      recent: jobRows.slice(0, 40),
    },
    runs: { total: runRows.length, complete: runRows.filter((run: O) => run.status === "complete").length, failed: runRows.filter((run: O) => run.status === "failed").length },
    findings: {
      total: findingRows.length,
      average_score: avg(findingRows.map((finding: O) => Number(finding.score)).filter(Number.isFinite)),
      average_confidence: avg(findingRows.map((finding: O) => Number(finding.confidence)).filter(Number.isFinite)),
      average_evidence_coverage: avg(findingRows.map((finding: O) => Number(finding.evidence_coverage)).filter(Number.isFinite)),
    },
    provider: {
      requests: usageRows.filter((row: O) => row.event_type === "analyst_request").length,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      p95_latency_ms: percentile(latencies, 0.95),
      cost_status: "not_recorded",
      estimated_cost_cents: null,
      note: "Cost is not inferred without a versioned provider pricing record. Token usage is recorded exactly when the provider returns it.",
    },
    schedules: { active: scheduledRows.length, due, total_scopes: (scopes.data || []).length },
    cache: { active_entries: (cache.data || []).length, total_hits: (cache.data || []).reduce((sum: number, row: O) => sum + Number(row.hit_count || 0), 0) },
  };
  return new Response(JSON.stringify(response), { headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" } });
});
