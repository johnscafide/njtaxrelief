import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Change = { id?: string; label?: string; agency?: string; url?: string; after?: { sha256_prefix_2mb?: string; etag?: string; last_modified?: string; stable_token?: string } };
type Observation = { id?: string; label?: string; agency?: string; url?: string; checked_at?: string; status?: number; stable_token?: string; etag?: string; last_modified?: string; content_length?: string; sha256_prefix_2mb?: string };
const url = Deno.env.get("SUPABASE_URL")!;
const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(url, serviceRole, { auth: { persistSession: false } });

function callerIsServiceRole(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return false;
  try {
    // The Supabase gateway verifies the JWT before this function runs. This
    // claim check narrows the function further to the service-role monitor.
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return payload.role === "service_role";
  } catch { return false; }
}

Deno.serve(async (request) => {
  if (request.method === "GET") {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return new Response("Sign in required", { status: 401 });
    const { data: userResult, error: userError } = await admin.auth.getUser(token);
    if (userError || !userResult.user) return new Response("Invalid session", { status: 401 });
    const { data: profile } = await admin.from("profiles").select("account_role").eq("id", userResult.user.id).maybeSingle();
    if (!profile || !["developer", "admin"].includes(profile.account_role)) return new Response("Developer access required", { status: 403 });
    const { data: runs, error: runError } = await admin.schema("watchdog_warehouse").from("source_monitor_runs")
      .select("id,checked_at,checked_count,confirmed_change_count,error_count,monitor_schema_version").order("checked_at", { ascending: false }).limit(90);
    if (runError) return Response.json({ error: runError.message }, { status: 500 });
    const latestRunIds = (runs || []).slice(0, 31).map((run: any) => run.id);
    const { data: observations, error: observationError } = latestRunIds.length
      ? await admin.schema("watchdog_warehouse").from("source_monitor_observations")
          .select("run_id,source_id,label,agency,http_status,stable_token,observed_at")
          .in("run_id", latestRunIds).order("observed_at", { ascending: false })
      : { data: [], error: null };
    if (observationError) return Response.json({ error: observationError.message }, { status: 500 });
    return Response.json({ runs: runs || [], observations: observations || [], retention: { source_health_days: 730, workflow_artifact_days: 90 } });
  }
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (!callerIsServiceRole(request)) return new Response("Trusted monitor required", { status: 403 });
  const body = await request.json().catch(() => ({}));
  const changes: Change[] = Array.isArray(body.changes) ? body.changes.slice(0, 40) : [];
  const observations: Observation[] = Array.isArray(body.observations) ? body.observations.slice(0, 80) : [];
  const errors = Array.isArray(body.errors) ? body.errors : [];
  // The monitor ledger is intentionally independent from customer messaging:
  // a healthy run with no updates is still valuable historic evidence.
  const { data: run, error: runError } = await admin.schema("watchdog_warehouse").from("source_monitor_runs").insert({
    checked_at: body.checked_at || new Date().toISOString(), checked_count: Number(body.checked || observations.length || 0),
    confirmed_change_count: changes.length, error_count: errors.length, monitor_schema_version: Number(body.schema_version || 1)
  }).select("id").single();
  if (runError) return Response.json({ error: runError.message }, { status: 500 });
  if (observations.length) {
    const { error: observationError } = await admin.schema("watchdog_warehouse").from("source_monitor_observations").insert(observations.filter((item) => item.id && item.url).map((item) => ({
      run_id: run.id, source_id: item.id, source_url: item.url, agency: item.agency || null, label: item.label || null,
      http_status: item.status || null, stable_token: item.stable_token || null, etag: item.etag || null,
      last_modified: item.last_modified || null, content_length: item.content_length || null,
      diagnostic_sha256_prefix: item.sha256_prefix_2mb || null, observed_at: item.checked_at || body.checked_at || new Date().toISOString()
    })));
    if (observationError) return Response.json({ error: observationError.message }, { status: 500 });
  }
  if (!changes.length) return Response.json({ delivered: 0, ignored: 0, monitor_run_id: run.id });
  const [{ data: properties, error: propertyError }, { data: preferences }, { data: profiles }] = await Promise.all([
    admin.from("saved_properties").select("user_id,pams_pin,address,town"),
    admin.from("property_alert_preferences").select("user_id,pams_pin,paused,alert_assessment"),
    admin.from("profiles").select("id,notify_reval")
  ]);
  if (propertyError) return Response.json({ error: propertyError.message }, { status: 500 });
  const prefByProperty = new Map((preferences || []).map((p: any) => [`${p.user_id}:${p.pams_pin}`, p]));
  const profileByUser = new Map((profiles || []).map((p: any) => [p.id, p]));
  const events: any[] = [];
  for (const change of changes) {
    // The monitor confirms changes using this stable publisher token. Do not
    // key customer events from a rendered-page hash because many NJ sites add
    // volatile request/session content to otherwise unchanged pages.
    const fingerprint = change.after?.stable_token || change.after?.etag || change.after?.last_modified;
    if (!change.id || !fingerprint) continue;
    for (const property of properties || []) {
      const preference = prefByProperty.get(`${property.user_id}:${property.pams_pin}`);
      const profile = profileByUser.get(property.user_id);
      if (preference?.paused || preference?.alert_assessment === false || (!preference && profile?.notify_reval === false)) continue;
      events.push({
        user_id: property.user_id, pams_pin: property.pams_pin,
        event_key: `source:${change.id}:${fingerprint}:${property.pams_pin}`,
        event_type: "source_refresh", severity: "watch",
        title: `NJ source update: ${change.label || change.id}`,
        summary: `${change.agency || "An official publisher"} changed a source used in this property’s research. Watchdog queued review before any property metric is updated.`,
        payload: { source_id: change.id, source_url: change.url || null, detected_at: body.checked_at || new Date().toISOString() }
      });
    }
  }
  for (let start = 0; start < events.length; start += 500) {
    const { error } = await admin.from("property_update_events").upsert(events.slice(start, start + 500), { onConflict: "user_id,event_key", ignoreDuplicates: true });
    if (error) return Response.json({ error: error.message, delivered: 0 }, { status: 500 });
  }
  return Response.json({ delivered: events.length, ignored: changes.length - events.length, monitor_run_id: run.id });
});
