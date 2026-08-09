import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const eventWeights: Record<string, number> = { appeal_deadline: 30, assessment_change: 27, tax_change: 25, permit_change: 23, deed_change: 22, evidence_change: 22, market_change: 20, municipal_change: 18 };
const clean = (v: unknown, n = 240) => String(v || "").replace(/[<>]/g, "").trim().slice(0, n);

function due(pref: any, now: Date) {
  const local = new Date(now.toLocaleString("en-US", { timeZone: pref.timezone || "America/New_York" }));
  if (local.getDay() !== Number(pref.weekday ?? 1) || local.getHours() !== Number(pref.local_hour ?? 8)) return false;
  return !pref.last_sent_at || now.getTime() - new Date(pref.last_sent_at).getTime() > 5 * 86400000;
}
function score(event: any) {
  const age = Math.max(0, (Date.now() - new Date(event.occurred_at).getTime()) / 86400000);
  return Math.min(100, (eventWeights[event.event_type] || 8) + (age <= 7 ? 25 : age <= 30 ? 20 : 12) + (event.source_url ? 25 : 17) + (event.severity === "action" ? 25 : 16));
}
function digestHtml(items: any[]) {
  return items.map((e, i) => `<tr><td style="padding:14px 10px;border-bottom:1px solid #e4e9ee;color:#0f8b8d;font-weight:800">${i + 1}</td><td style="padding:14px 10px;border-bottom:1px solid #e4e9ee"><b>${clean(e.title)}</b><br><span style="color:#65758a">${clean(e.summary, 360)}</span><br><small>${clean(e.property_address || e.pams_pin || "Saved property")} · ${new Date(e.occurred_at).toLocaleDateString("en-US")}</small></td><td style="padding:14px 10px;border-bottom:1px solid #e4e9ee;font-weight:800">${score(e)}</td></tr>`).join("");
}

Deno.serve(async request => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (!Deno.env.get("AGENT_DIGEST_CRON_SECRET") || request.headers.get("x-watchdog-cron-secret") !== Deno.env.get("AGENT_DIGEST_CRON_SECRET")) return new Response("Forbidden", { status: 403 });
  const publicKey = Deno.env.get("EMAILJS_PUBLIC_KEY") || "";
  const privateKey = Deno.env.get("EMAILJS_PRIVATE_KEY") || "";
  const serviceId = Deno.env.get("EMAILJS_SERVICE_ID") || "";
  const templateId = Deno.env.get("EMAILJS_AGENT_DIGEST_TEMPLATE_ID") || "";
  if (!publicKey || !privateKey || !serviceId || !templateId) return Response.json({ ok: false, reason: "Agent digest EmailJS secrets are incomplete" }, { status: 503 });
  const now = new Date();
  const { data: prefs, error } = await admin.from("agent_digest_preferences").select("*").eq("enabled", true);
  if (error) return Response.json({ ok: false, reason: error.message }, { status: 500 });
  const result = { sent: 0, skipped: 0, failed: 0 };
  for (const pref of prefs || []) {
    if (!due(pref, now)) { result.skipped++; continue; }
    const since = pref.last_sent_at || new Date(now.getTime() - 8 * 86400000).toISOString();
    const [{ data: items }, authResult, { data: farm }, { data: saved }] = await Promise.all([
      admin.from("property_update_events").select("id,pams_pin,event_type,severity,title,summary,source_url,occurred_at,payload").eq("user_id", pref.user_id).gte("occurred_at", since).order("occurred_at", { ascending: false }).limit(100),
      admin.auth.admin.getUserById(pref.user_id),
      admin.from("agent_farm_properties").select("pams_pin,address").eq("user_id", pref.user_id).limit(1000),
      admin.from("saved_properties").select("pams_pin,address").eq("user_id", pref.user_id).limit(1000)
    ]);
    const sphere = [...(farm || []), ...(saved || [])];
    const pins = new Set(sphere.map((x: any) => clean(x.pams_pin).toLowerCase()).filter(Boolean));
    const addresses = new Set(sphere.map((x: any) => clean(x.address).toLowerCase()).filter(Boolean));
    const grouped = new Map<string, any>();
    (items || []).filter((x: any) => {
      if (!eventWeights[x.event_type]) return false;
      const pin = clean(x.pams_pin || x.payload?.pams_pin).toLowerCase();
      const address = clean(x.payload?.property_address || x.payload?.address).toLowerCase();
      return (pin && pins.has(pin)) || (address && addresses.has(address));
    }).forEach((x: any) => {
      const address = x.payload?.property_address || x.payload?.address || x.pams_pin;
      const propertyKey = clean(x.pams_pin || address).toLowerCase();
      const key = `${propertyKey}:${x.event_type}`;
      const candidate = { ...x, property_address: address };
      const prior = grouped.get(key);
      if (!prior || score(candidate) > score(prior) || new Date(candidate.occurred_at) > new Date(prior.occurred_at)) grouped.set(key, candidate);
    });
    const uniqueProperties = new Set<string>();
    const top = [...grouped.values()].sort((a: any, b: any) => score(b) - score(a)).filter((x: any) => {
      const key = clean(x.pams_pin || x.property_address).toLowerCase();
      if (uniqueProperties.has(key)) return false;
      uniqueProperties.add(key);
      return true;
    }).slice(0, 10);
    const email = authResult.data.user?.email;
    if (!email || !top.length) { result.skipped++; continue; }
    const response = await fetch("https://api.emailjs.com/api/v1.0/email/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      service_id: serviceId, template_id: templateId, user_id: publicKey, accessToken: privateKey,
      template_params: { to_email: email, subject: `Your ${top.length} Watchdog property reasons this week`, opportunity_count: top.length, digest_rows: digestHtml(top), desk_url: "https://njpropertytaxrelief.com/property/agent-desk.html", compliance_note: "Property changes are not seller predictions. Review the source and your lawful contact basis before outreach." }
    }) });
    if (!response.ok) { result.failed++; continue; }
    await admin.from("agent_digest_preferences").update({ last_sent_at: now.toISOString(), updated_at: now.toISOString() }).eq("user_id", pref.user_id);
    result.sent++;
  }
  return Response.json({ ok: true, ...result });
});
