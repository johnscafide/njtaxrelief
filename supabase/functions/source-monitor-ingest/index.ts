import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

type Change = { id?: string; label?: string; agency?: string; url?: string; after?: { sha256_prefix_2mb?: string; etag?: string; last_modified?: string } };
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
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (!callerIsServiceRole(request)) return new Response("Trusted monitor required", { status: 403 });
  const body = await request.json().catch(() => ({}));
  const changes: Change[] = Array.isArray(body.changes) ? body.changes.slice(0, 40) : [];
  if (!changes.length) return Response.json({ delivered: 0, ignored: 0 });
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
    const fingerprint = change.after?.sha256_prefix_2mb || change.after?.etag || change.after?.last_modified;
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
        source_url: change.url || null, minimum_plan: "standard",
        payload: { source_id: change.id, source_url: change.url || null, detected_at: body.checked_at || new Date().toISOString(), review_required: true }
      });
    }
  }
  for (let start = 0; start < events.length; start += 500) {
    const { error } = await admin.from("property_update_events").upsert(events.slice(start, start + 500), { onConflict: "user_id,event_key", ignoreDuplicates: true });
    if (error) return Response.json({ error: error.message, delivered: 0 }, { status: 500 });
  }
  return Response.json({ delivered: events.length, ignored: changes.length - events.length });
});
