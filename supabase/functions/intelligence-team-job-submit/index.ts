import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const VERSION = "watchdog-team-job-submit-v1";
const ORIGINS = new Set([
  "https://njpropertytaxrelief.com",
  "https://www.njpropertytaxrelief.com",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);
const RANK: Record<string, number> = { standard: 0, agent: 1, pro: 2, pro_plus: 3, teams: 4, developer: 5 };
const MODELS = new Set(["assessment_anomaly", "property_change_priority"]);
type O = Record<string, any>;

function cors(req: Request) {
  const origin = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": ORIGINS.has(origin) ? origin : "https://njpropertytaxrelief.com",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
function out(req: Request, status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), { status, headers: { ...cors(req), "Content-Type": "application/json", "Cache-Control": "private, no-store" } });
}
const clean = (value: unknown, max = 300) => String(value ?? "").replace(/[<>]/g, "").trim().slice(0, max);
function namedEnv(jsonName: string, legacyName: string) {
  const raw = Deno.env.get(jsonName) || "";
  if (raw) {
    try { const parsed = JSON.parse(raw); if (parsed?.default) return String(parsed.default); } catch { /* fall through */ }
  }
  return Deno.env.get(legacyName) || "";
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as O).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}
async function hash(value: unknown) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(canonical(value))));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function rowsPaged(factory: () => any, maximum: number) {
  const rows: any[] = [];
  for (let start = 0; start < maximum; start += 1000) {
    const result = await factory().range(start, Math.min(start + 999, maximum - 1));
    if (result.error) throw result.error;
    rows.push(...(result.data || []));
    if ((result.data || []).length < 1000) break;
  }
  return rows;
}
async function resolve(admin: any, type: string, value: O, maximum: number) {
  if (type === "custom") {
    const pins = [...new Set((Array.isArray(value.pams_pins) ? value.pams_pins : []).map((item: unknown) => clean(item, 100)).filter(Boolean))];
    return { pins: pins.slice(0, maximum), manifest: { source: "custom", requested_count: pins.length } };
  }
  if (type === "municipality" || type === "county") {
    const field = type === "municipality" ? "town" : "county";
    const requested = clean(value.value || value[field], 120);
    if (!requested) throw new Error(`${type} value is required`);
    const rows = await rowsPaged(() => admin.from("property_lookups").select("pams_pin").eq(field, requested).order("pams_pin"), maximum + 1);
    const pins = [...new Set(rows.map((row: O) => clean(row.pams_pin, 100)).filter(Boolean))];
    return { pins: pins.slice(0, maximum), manifest: { source: "property_lookups", field, value: requested, source_count: pins.length } };
  }
  throw new Error("Shared Teams Intelligence supports municipality, county, or explicit governed property sets.");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return out(req, 405, { error: "POST required" });
  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return out(req, 401, { error: "Sign in required" });
  const url = Deno.env.get("SUPABASE_URL") || "";
  const publishable = namedEnv("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
  const secret = namedEnv("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !publishable || !secret) return out(req, 503, { error: "Teams job configuration incomplete" });
  const userClient = createClient(url, publishable, { global: { headers: { Authorization: auth } }, auth: { persistSession: false, autoRefreshToken: false } });
  const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData } = await userClient.auth.getUser();
  const user = authData?.user;
  if (!user) return out(req, 401, { error: "Session invalid" });
  let body: O = {};
  try { body = await req.json(); } catch { return out(req, 400, { error: "Invalid JSON" }); }

  const [{ data: entitlement }, { data: profile }] = await Promise.all([
    admin.from("account_entitlements").select("plan_tier").eq("user_id", user.id).maybeSingle(),
    admin.from("profiles").select("account_role").eq("id", user.id).maybeSingle(),
  ]);
  const plan = String(profile?.account_role || "") === "developer" ? "developer" : String(entitlement?.plan_tier || "standard");
  if ((RANK[plan] ?? 0) < RANK.teams) return out(req, 403, { error: "Teams plan required", minimum_plan: "teams" });

  const organizationId = clean(body.organization_id, 80);
  if (!organizationId) return out(req, 400, { error: "organization_id is required" });
  const [org, member] = await Promise.all([
    admin.from("watchdog_organizations").select("id,name,owner_user_id").eq("id", organizationId).maybeSingle(),
    admin.from("watchdog_organization_members").select("role").eq("organization_id", organizationId).eq("user_id", user.id).maybeSingle(),
  ]);
  if (!org.data) return out(req, 404, { error: "Teams Intelligence workspace not found" });
  const role = org.data.owner_user_id === user.id ? "owner" : member.data?.role || null;
  if (!role) return out(req, 404, { error: "Teams Intelligence workspace not found" });
  if (role === "viewer") return out(req, 403, { error: "Viewer role cannot schedule or run shared Intelligence" });

  const limitResult = await admin.from("intelligence_plan_limits").select("*").eq("plan_tier", plan).maybeSingle();
  const limits = limitResult.data;
  if (!limits) return out(req, 503, { error: "Teams Intelligence limits unavailable" });
  const scopeType = clean(body.scope_type || "municipality", 40);
  const scopeValue = body.scope_value && typeof body.scope_value === "object" ? body.scope_value : {};
  const modelKeys = [...new Set((Array.isArray(body.model_keys) ? body.model_keys : [body.model_key || "assessment_anomaly"]).map((item: unknown) => clean(item, 100)).filter(Boolean))];
  const unsupported = modelKeys.filter((key) => !MODELS.has(key));
  if (unsupported.length) return out(req, 409, { error: "Shared population worker does not support these models yet", unsupported_models: unsupported, supported_models: [...MODELS] });

  let resolved;
  try { resolved = await resolve(admin, scopeType, scopeValue, Number(limits.max_scope_properties) + 1); }
  catch (error) { return out(req, 409, { error: clean((error as any)?.message || error, 500) }); }
  if (resolved.pins.length > Number(limits.max_scope_properties)) return out(req, 409, { error: "Resolved shared scope exceeds the Teams property limit", resolved_count: resolved.pins.length, limit: limits.max_scope_properties });
  if (!resolved.pins.length) return out(req, 409, { error: "The requested shared scope resolved to no governed properties" });

  const scopeFingerprint = await hash({ organization_id: organizationId, scope_type: scopeType, scope_value: scopeValue, pams_pins: resolved.pins.slice().sort() });
  const scheduled = body.is_scheduled !== false;
  const cadence = scheduled ? clean(body.cadence || "daily", 20) : null;
  if (scheduled && !["daily", "weekly"].includes(cadence)) return out(req, 400, { error: "Shared schedules support daily or weekly cadence" });
  const nextRun = scheduled ? (body.next_run_at ? new Date(String(body.next_run_at)).toISOString() : new Date(Date.now() + (cadence === "weekly" ? 7 : 1) * 86400000).toISOString()) : null;
  let scopeId = clean(body.scope_id, 80);
  const scopePayload = {
    user_id: user.id, organization_id: organizationId, name: clean(body.name || `${org.data.name} ${scopeType} Intelligence`, 140),
    scope_type: scopeType, scope_value: { ...scopeValue, resolution_manifest: resolved.manifest }, model_keys: modelKeys,
    resolved_pams_pins: resolved.pins, scope_fingerprint: scopeFingerprint, is_scheduled: scheduled, cadence, next_run_at: nextRun, is_active: true, updated_at: new Date().toISOString(),
  };
  const scopeResult = scopeId
    ? await admin.from("intelligence_scopes").update(scopePayload).eq("id", scopeId).eq("organization_id", organizationId).select("*").single()
    : await admin.from("intelligence_scopes").insert(scopePayload).select("*").single();
  if (scopeResult.error || !scopeResult.data) return out(req, 503, { error: "Could not save shared Intelligence scope" });
  scopeId = String(scopeResult.data.id);

  const jobs = [];
  if (body.run_now !== false) {
    for (const modelKey of modelKeys) {
      const model = await admin.from("intelligence_models").select("model_key,version").eq("model_key", modelKey).maybeSingle();
      if (!model.data) continue;
      const idempotency = clean(body.idempotency_key, 180) || await hash({ user_id: user.id, organization_id: organizationId, scope_id: scopeId, model_key: modelKey, model_version: model.data.version, window: new Date().toISOString().slice(0, 13) });
      const created = await admin.from("intelligence_jobs").upsert({
        user_id: user.id, organization_id: organizationId, scope_id: scopeId, model_key: modelKey, model_version: model.data.version,
        scope_type: scopeType, scope_value: { ...scopeValue, resolution_manifest: resolved.manifest }, scope_fingerprint: scopeFingerprint,
        pams_pins: resolved.pins, idempotency_key: idempotency, trigger_type: "manual", status: "queued", candidate_count: resolved.pins.length,
        batch_size: Math.min(500, Math.max(100, Number(body.batch_size || 250))), updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,idempotency_key", ignoreDuplicates: true }).select("id,status,model_key,model_version,candidate_count,created_at").maybeSingle();
      let job = created.data;
      if (!job) {
        const existing = await admin.from("intelligence_jobs").select("id,status,model_key,model_version,candidate_count,created_at,result_run_id").eq("user_id", user.id).eq("idempotency_key", idempotency).maybeSingle();
        job = existing.data;
      }
      if (job) {
        jobs.push(job);
        if (created.data) await admin.from("intelligence_job_events").insert({ job_id: job.id, user_id: user.id, event_type: "queued", message: "Shared Teams Intelligence job queued.", payload: { organization_id: organizationId, scope_id: scopeId, model_key: modelKey, candidate_count: resolved.pins.length } });
      }
    }
  }

  return out(req, 200, {
    ok: true, version: VERSION, organization: { id: org.data.id, name: org.data.name, role },
    scope: { id: scopeId, name: scopeResult.data.name, is_scheduled: scheduled, cadence, next_run_at: nextRun },
    resolved_count: resolved.pins.length, jobs,
    warning: "Shared Teams Intelligence is organization-scoped. Members can read shared runs through explicit organization membership only.",
  });
});
