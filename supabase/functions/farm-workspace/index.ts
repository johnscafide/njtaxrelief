import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

// Farm workspace enrichment for the agent farm list.
// - Last deed year comes from the public NJ Parcels and MOD-IV Composite. The
//   State currently leaves OWNER_NAME blank in that public service (Daniel's
//   Law), so owner_name is normally null. Watchdog passes through whatever the
//   State publishes and never tries to fill names in from elsewhere.
// - The owner mailing address is used only to answer "does the owner get mail
//   at this property?" (and, when it does, the property's postal city for
//   mailing labels). The mailing address itself is never returned.
// - CRM matches come only from the signed-in agent's own connected CRM and
//   only from verified property links. No email or phone is returned.
type Obj = Record<string, any>;
const GIS = "https://maps.nj.gov/arcgis/rest/services/Framework/Cadastral/MapServer/0/query";
const ORIGINS = new Set([
  "https://www.watchdogindex.com", "https://watchdogindex.com",
  "https://njpropertytaxrelief.com", "https://www.njpropertytaxrelief.com",
  "http://localhost:3000", "http://127.0.0.1:3000", "http://127.0.0.1:8765",
]);
const MAX_PINS = 250, BATCH = 125;

function allowOrigin(o: string) { return ORIGINS.has(o) || /^https:\/\/njtaxrelief(?:-git)?-[a-z0-9-]+-johnscafides-projects\.vercel\.app$/.test(o); }
function cors(req: Request) {
  const o = req.headers.get("origin") || "";
  return { "Access-Control-Allow-Origin": allowOrigin(o) ? o : "https://www.watchdogindex.com", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin" };
}
function out(req: Request, status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), { status, headers: { ...cors(req), "Content-Type": "application/json", "Cache-Control": "private, no-store" } });
}
function clean(v: unknown, max = 220) { return String(v ?? "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, max); }
function norm(v: unknown) {
  return clean(v, 200).toUpperCase()
    .replace(/\b(STREET)\b/g, "ST").replace(/\b(AVENUE)\b/g, "AVE").replace(/\b(ROAD)\b/g, "RD").replace(/\b(DRIVE)\b/g, "DR")
    .replace(/\b(COURT)\b/g, "CT").replace(/\b(LANE)\b/g, "LN").replace(/\b(PLACE)\b/g, "PL").replace(/\b(BOULEVARD)\b/g, "BLVD")
    .replace(/\b(TERRACE)\b/g, "TER").replace(/\b(CIRCLE)\b/g, "CIR").replace(/[^A-Z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}
function saleYear(v: any) { const s = String(v ?? "").trim(), d = s.replace(/\D/g, ""), now = new Date().getUTCFullYear(), ok = (y: number, m: number, day: number) => { if (y < 1800 || y > now || m < 1 || m > 12 || day < 1 || day > 31) return false; const x = new Date(Date.UTC(y, m - 1, day)); return x.getUTCFullYear() === y && x.getUTCMonth() === m - 1 && x.getUTCDate() === day; }; if (d.length === 6) { let yy = Number(d.slice(0, 2)), m = Number(d.slice(2, 4)), day = Number(d.slice(4, 6)), y = yy > 40 ? 1900 + yy : 2000 + yy; if (ok(y, m, day)) return y; m = Number(d.slice(0, 2)); day = Number(d.slice(2, 4)); yy = Number(d.slice(4, 6)); y = yy > 40 ? 1900 + yy : 2000 + yy; if (ok(y, m, day)) return y; return null; } if (d.length === 8) { let y = Number(d.slice(0, 4)), m = Number(d.slice(4, 6)), day = Number(d.slice(6, 8)); if (ok(y, m, day)) return y; m = Number(d.slice(0, 2)); day = Number(d.slice(2, 4)); y = Number(d.slice(4, 8)); if (ok(y, m, day)) return y; } const hit = s.match(/(19|20)\d{2}/), y = hit ? Number(hit[0]) : 0; return y >= 1800 && y <= now ? y : null; }
function ownerLabel(v: unknown) {
  const raw = clean(v, 160).replace(/\s+/g, " ");
  if (!raw || /^(REDACTED|CONFIDENTIAL|NOT AVAILABLE|N\/A|UNKNOWN)$/i.test(raw)) return null;
  return raw;
}

async function parcels(pins: string[]) {
  const byPin: Record<string, Obj> = {};
  for (let i = 0; i < pins.length; i += BATCH) {
    const batch = pins.slice(i, i + BATCH);
    const body = new URLSearchParams({ f: "json", where: `PAMS_PIN IN (${batch.map((x) => `'${x.replace(/'/g, "''")}'`).join(",")})`, outFields: "PAMS_PIN,PROP_LOC,ZIP5,OWNER_NAME,ST_ADDRESS,CITY_STATE,ZIP_CODE,DEED_DATE", returnGeometry: "false" });
    const r = await fetch(GIS, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", accept: "application/json" }, body });
    if (!r.ok) throw new Error("NJ parcel service did not respond.");
    const j = await r.json();
    if (j?.error) throw new Error("NJ parcel service returned an error.");
    for (const f of j.features || []) {
      const a = f.attributes || {}, pin = clean(a.PAMS_PIN, 120);
      if (!pin) continue;
      const mail = norm(a.ST_ADDRESS), site = norm(a.PROP_LOC);
      const mailZip = clean(a.ZIP_CODE, 10).slice(0, 5), siteZip = clean(a.ZIP5, 10).slice(0, 5);
      let mailsElsewhere: boolean | null = null;
      if (mail && site) mailsElsewhere = !(mail === site || mail.startsWith(site + " ") || site.startsWith(mail + " ")) || (!!mailZip && !!siteZip && mailZip !== siteZip);
      // The postal city is only taken from the tax-bill address when that address
      // is the property itself, so no other address is ever exposed.
      const cityState = mailsElsewhere === false ? clean(a.CITY_STATE, 60).replace(/[,\s]+N\.?J\.?$/i, "").trim() : "";
      byPin[pin] = { owner_name: ownerLabel(a.OWNER_NAME), last_deed_year: saleYear(a.DEED_DATE), owner_mails_elsewhere: mailsElsewhere, postal_city: cityState || null };
    }
  }
  return byPin;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return out(req, 405, { error: "Method not allowed" });
  const origin = req.headers.get("origin") || "";
  if (origin && !allowOrigin(origin)) return out(req, 403, { error: "Origin not allowed" });
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return out(req, 401, { error: "Sign in required", code: "AUTH_REQUIRED" });
  const url = Deno.env.get("SUPABASE_URL") || "", service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !service) return out(req, 503, { error: "Farm workspace is unavailable" });
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: u } = await admin.auth.getUser(token);
  const user = u?.user;
  if (!user) return out(req, 401, { error: "Sign in required", code: "AUTH_REQUIRED" });

  const { data: plan } = await admin.rpc("watchdog_effective_plan", { p_user_id: user.id });
  const { data: limits } = await admin.rpc("agent_plan_limits", { p_plan: plan || "standard" });
  if (Number(limits?.properties || 0) < 1) return out(req, 403, { error: "Farm tools require an Agent or professional plan.", code: "PLAN_REQUIRED" });

  let body: Obj = {};
  try { body = await req.json(); } catch { return out(req, 400, { error: "Invalid JSON" }); }
  const pins = [...new Set((Array.isArray(body.pams_pins) ? body.pams_pins : []).map((x: unknown) => clean(x, 120)).filter((x: string) => /^\d{4}_[A-Za-z0-9_.\-]+$/.test(x)))].slice(0, MAX_PINS) as string[];
  const wantOwners = body.owners !== false, wantCrm = body.crm !== false;

  const { data: q } = await admin.rpc("consume_municipal_quota", { p_user_id: user.id, p_endpoint: "farm-workspace", p_limit: Number(limits?.requests_5m || 20), p_rows: 0, p_delivery_id: crypto.randomUUID() });
  if (!q?.allowed) return out(req, 429, { error: "Data refresh limit reached. Try again after the usage window resets.", code: "AGENT_QUOTA_REQUESTS", reset_at: q?.reset_at });

  const result: Obj = { ok: true, plan: String(plan || "standard"), properties: {}, crm: { connections: [], matched: 0, pending_review: 0 } };
  if (wantOwners && pins.length) {
    try { result.properties = await parcels(pins); result.owner_source = "NJ Office of GIS Parcels and MOD-IV Composite (public tax records)"; }
    catch { result.owner_error = "Deed years and mailing details are unavailable right now. Try again shortly."; }
  }

  if (wantCrm) {
    const conns = await admin.from("integration_connections").select("id,provider,name,external_account_label,status").eq("user_id", user.id).eq("status", "active");
    const list = (conns.data || []).filter((c: Obj) => c.provider !== "webhook");
    const ids = list.map((c: Obj) => String(c.id));
    if (ids.length) {
      const sync = await admin.from("integration_provider_connections").select("connection_id,provider,sync_enabled,sync_status,last_success_at,last_sync_completed_at,records_synced_total,last_error").in("connection_id", ids);
      const syncBy = new Map((sync.data || []).map((s: Obj) => [String(s.connection_id), s]));
      result.crm.connections = list.map((c: Obj) => { const s: Obj = syncBy.get(String(c.id)) || {}; return { id: c.id, provider: clean(c.provider, 40), label: clean(c.external_account_label || c.name || c.provider, 120), sync_enabled: !!s.sync_enabled, sync_status: clean(s.sync_status, 40) || null, last_synced_at: s.last_success_at || s.last_sync_completed_at || null, records_synced: Number(s.records_synced_total || 0), has_error: !!s.last_error }; });
      if (pins.length) {
        const links = await admin.from("integration_crm_property_links").select("crm_context_id,pams_pin,status,link_method,connection_id").eq("user_id", user.id).in("connection_id", ids).in("pams_pin", pins).limit(1000);
        const verified = (links.data || []).filter((l: Obj) => l.status === "verified");
        result.crm.pending_review = (links.data || []).filter((l: Obj) => l.status !== "verified" && l.status !== "rejected").length;
        const ctxIds = [...new Set(verified.map((l: Obj) => String(l.crm_context_id)))];
        const ctx = ctxIds.length ? await admin.from("integration_crm_context").select("id,connection_id,contact_name,lead_stage,relationship,last_activity_at,source_updated_at,updated_at").eq("user_id", user.id).in("id", ctxIds) : { data: [] as Obj[] };
        const ctxBy = new Map((ctx.data || []).map((c: Obj) => [String(c.id), c]));
        const provBy = new Map(list.map((c: Obj) => [String(c.id), clean(c.provider, 40)]));
        const byPin: Record<string, Obj[]> = {};
        for (const l of verified) {
          const c: Obj | undefined = ctxBy.get(String(l.crm_context_id));
          if (!c) continue;
          (byPin[l.pams_pin] ||= []).push({ contact_name: clean(c.contact_name, 180) || null, lead_stage: clean(c.lead_stage, 100) || null, relationship: clean(c.relationship, 100) || null, last_activity_at: c.last_activity_at || null, crm_updated_at: c.source_updated_at || c.updated_at || null, provider: provBy.get(String(l.connection_id)) || "crm" });
        }
        result.crm.by_pin = byPin;
        result.crm.matched = Object.keys(byPin).length;
      }
    }
  }

  await admin.from("integration_audit_log").insert({ user_id: user.id, connection_id: null, action: "farm.workspace.read", actor: "user", details: { pin_count: pins.length, owners: wantOwners, crm: wantCrm, crm_matched: result.crm.matched || 0 } }).then(() => {}, () => {});
  result.privacy = { owner_mailing_address_returned: false, email_returned: false, phone_returned: false, protected_owner_names: "withheld_by_state_source" };
  return out(req, 200, result);
});
