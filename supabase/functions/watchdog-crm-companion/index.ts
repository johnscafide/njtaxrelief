import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const WEB_ORIGINS = new Set([
  "https://watchdogindex.com",
  "https://www.watchdogindex.com",
  "https://njpropertytaxrelief.com",
  "https://www.njpropertytaxrelief.com",
  "http://localhost:3000",
  "http://127.0.0.1:3000"
]);
const PAID_PLANS = new Set(["agent", "pro", "pro_plus", "teams", "developer"]);
const PAID_STATUSES = new Set(["active", "trialing", "past_due"]);
const EVENT_NAMES = new Set([
  "session_connected", "session_status", "session_expired", "session_disconnected",
  "extension_opened", "boldtrail_contact_detected", "boldtrail_contact_missing",
  "lookup_started", "lookup_succeeded", "lookup_no_match", "lookup_ambiguous",
  "field_previewed", "crm_write_started", "crm_write_succeeded", "crm_write_failed"
]);
const EXTENSION_ORIGIN = /^chrome-extension:\/\/[a-p]{32}$/i;
const SAFE_META_KEYS = new Set(["adapter", "field_mode", "candidate_count", "source_count", "reason", "browser"]);

function namedEnv(jsonName: string, legacyName: string) {
  const raw = Deno.env.get(jsonName) || "";
  if (raw) {
    try { const parsed = JSON.parse(raw); if (parsed?.default) return String(parsed.default); } catch (_) {}
  }
  return Deno.env.get(legacyName) || "";
}
function clean(value: unknown, max = 160) {
  return String(value ?? "").replace(/[\u0000-\u001f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}
function normalizePlan(value: unknown) {
  const plan = clean(value, 30).toLowerCase().replace("pro+", "pro_plus");
  return PAID_PLANS.has(plan) ? plan : "standard";
}
function isUuid(value: unknown) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}
function allowedOrigin(origin: string) {
  return WEB_ORIGINS.has(origin) || EXTENSION_ORIGIN.test(origin) || /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin);
}
function cors(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allow = allowedOrigin(origin) ? origin : "https://watchdogindex.com";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-watchdog-extension-token, x-watchdog-extension-version",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "7200",
    "Vary": "Origin"
  };
}
function reply(req: Request, status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), { status, headers: { ...cors(req), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, no-store" } });
}
async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function safeMetadata(input: unknown) {
  const out: Record<string, string | number | boolean> = {};
  if (!input || typeof input !== "object" || Array.isArray(input)) return out;
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!SAFE_META_KEYS.has(key)) continue;
    if (typeof value === "number" && Number.isFinite(value)) out[key] = Math.max(-100000, Math.min(100000, value));
    else if (typeof value === "boolean") out[key] = value;
    else out[key] = clean(value, 80);
  }
  return out;
}
function normalizeAddress(value: unknown) {
  let text = clean(value, 220).toUpperCase();
  text = text.replace(/\b(APT|UNIT|SUITE|STE|#)\s*[A-Z0-9-]+\b/g, " ");
  text = text.replace(/\bNEW JERSEY\b|\bNJ\b/g, " ").replace(/\b\d{5}(?:-\d{4})?\b/g, " ");
  text = text.replace(/[^A-Z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  const replacements: Record<string, string> = { STREET: "ST", ROAD: "RD", AVENUE: "AVE", BOULEVARD: "BLVD", DRIVE: "DR", LANE: "LN", COURT: "CT", CIRCLE: "CIR", PLACE: "PL", PARKWAY: "PKWY", HIGHWAY: "HWY", TERRACE: "TER" };
  return text.split(" ").map((token) => replacements[token] || token).join(" ");
}
function tokenSet(value: string) { return new Set(normalizeAddress(value).split(" ").filter(Boolean)); }
function addressScore(input: string, candidate: string) {
  const a = tokenSet(input), b = tokenSet(candidate);
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const token of a) if (b.has(token)) inter++;
  const union = new Set([...a, ...b]).size || 1;
  let score = inter / union;
  const inNum = normalizeAddress(input).match(/^\d+[A-Z]?\b/)?.[0] || "";
  const canNum = normalizeAddress(candidate).match(/^\d+[A-Z]?\b/)?.[0] || "";
  if (inNum && canNum) score += inNum === canNum ? 0.25 : -0.35;
  return Math.max(0, Math.min(1, score));
}
function parseZip(value: unknown) { const match = clean(value, 20).match(/\b(\d{5})(?:-\d{4})?\b/); return match ? match[1] : ""; }
function houseNumber(value: unknown) { return normalizeAddress(value).match(/^(\d+[A-Z]?)\b/)?.[1] || ""; }
function publicCandidate(row: Record<string, unknown>, confidence: number) {
  return { address: clean(row.address, 160), town: clean(row.town || row.city, 80), county: clean(row.county, 80), zip: clean(row.zip, 10), confidence: Math.round(confidence * 100) / 100 };
}
async function currentAccess(admin: any, userId: string) {
  const [{ data: ent }, { data: profile }] = await Promise.all([
    admin.from("account_entitlements").select("plan_tier,billing_tier,subscription_status").eq("user_id", userId).maybeSingle(),
    admin.from("profiles").select("account_role").eq("id", userId).maybeSingle()
  ]);
  const developer = String(profile?.account_role || "") === "developer";
  if (developer) return { allowed: true, plan: "developer", status: "active" };
  const plan = normalizePlan(ent?.billing_tier || ent?.plan_tier);
  const status = clean(ent?.subscription_status, 30).toLowerCase();
  return { allowed: PAID_PLANS.has(plan) && PAID_STATUSES.has(status), plan, status };
}
async function logEvent(admin: any, session: any, eventName: string, extras: Record<string, unknown> = {}) {
  if (!EVENT_NAMES.has(eventName) || !session?.user_id) return;
  const fieldsCount = Number(extras.fields_count);
  await admin.from("watchdog_extension_events").insert({
    user_id: session.user_id, session_id: session.id || null, event_name: eventName,
    extension_version: clean(extras.extension_version || session.extension_version, 30) || null,
    plan_tier: clean(session.plan_tier, 30) || null, crm_surface: "boldtrail",
    match_status: clean(extras.match_status, 30) || null,
    fields_count: Number.isFinite(fieldsCount) ? Math.max(0, Math.min(50, Math.round(fieldsCount))) : null,
    metadata: safeMetadata(extras.metadata)
  });
}
async function resolveSession(req: Request, admin: any) {
  const raw = clean(req.headers.get("x-watchdog-extension-token"), 200);
  if (raw.length < 32) return { error: "not_connected", status: 401 };
  const hash = await sha256(raw);
  const { data: session, error } = await admin.from("watchdog_extension_sessions").select("*").eq("token_hash", hash).maybeSingle();
  if (error || !session || session.revoked_at) return { error: "not_connected", status: 401 };
  if (Date.parse(String(session.expires_at || "")) <= Date.now()) { await logEvent(admin, session, "session_expired"); return { error: "session_expired", status: 401 }; }
  const access = await currentAccess(admin, session.user_id);
  if (!access.allowed) return { error: "paid_plan_required", status: 403, plan: access.plan };
  await admin.from("watchdog_extension_sessions").update({ last_used_at: new Date().toISOString(), plan_tier: access.plan }).eq("id", session.id);
  session.plan_tier = access.plan;
  return { session, access };
}
async function findProperty(admin: any, input: Record<string, unknown>) {
  const address = clean(input.address, 220);
  const city = clean(input.city, 80);
  const zip = parseZip(input.zip || address);
  const number = houseNumber(address);
  if (!address || !number) return { kind: "no_match", candidates: [] };
  let query = admin.from("property_lookups").select("pams_pin,address,city,town,county,zip,block,lot,qualifier,prop_class,year_built,acres,building_desc,land_value,improvement_value,assessed_value,last_year_tax,effective_rate,last_sale_price,last_sale_year,last_seen");
  if (zip) query = query.eq("zip", zip);
  query = query.ilike("address", `${number}%`).limit(zip ? 80 : 160);
  const { data, error } = await query;
  if (error) throw error;
  const scored = (data || []).map((row: Record<string, unknown>) => {
    let score = addressScore(address, String(row.address || ""));
    if (city) {
      const inputCity = city.toUpperCase(), rowCity = String(row.city || row.town || "").toUpperCase();
      if (rowCity && inputCity && rowCity === inputCity) score = Math.min(1, score + 0.08);
    }
    if (zip && String(row.zip || "") === zip) score = Math.min(1, score + 0.08);
    return { row, score };
  }).sort((a: any, b: any) => b.score - a.score);
  const best = scored[0];
  if (!best || best.score < 0.58) return { kind: "no_match", candidates: scored.slice(0, 3).map((x: any) => publicCandidate(x.row, x.score)) };
  if (scored[1] && scored[1].score >= 0.62 && (best.score - scored[1].score) < 0.08) return { kind: "ambiguous", candidates: scored.slice(0, 4).map((x: any) => publicCandidate(x.row, x.score)) };
  const row = best.row;
  const { data: snapshots } = await admin.from("property_record_snapshots").select("source_kind,source_url,source_recorded_at,captured_at").eq("pams_pin", row.pams_pin).order("captured_at", { ascending: false }).limit(8);
  const seen = new Set<string>();
  const sources = (snapshots || []).filter((source: any) => {
    const key = `${source.source_kind || ""}|${source.source_url || ""}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  }).slice(0, 5).map((source: any) => ({ kind: clean(source.source_kind, 80), url: /^https?:\/\//i.test(String(source.source_url || "")) ? String(source.source_url).slice(0, 900) : "", recorded_at: source.source_recorded_at || null, captured_at: source.captured_at || null }));
  return {
    kind: "match", confidence: Math.round(best.score * 100) / 100,
    facts: {
      address: clean(row.address, 160), municipality: clean(row.town || row.city, 80), county: clean(row.county, 80), zip: clean(row.zip, 10),
      block: clean(row.block, 40), lot: clean(row.lot, 40), qualifier: clean(row.qualifier, 40), property_class: clean(row.prop_class, 20),
      year_built: row.year_built ?? null, acres: row.acres ?? null, building_description: clean(row.building_desc, 160),
      land_value: row.land_value ?? null, improvement_value: row.improvement_value ?? null, assessed_value: row.assessed_value ?? null,
      annual_property_tax: row.last_year_tax ?? null, effective_tax_rate: row.effective_rate ?? null,
      last_sale_price: row.last_sale_price ?? null, last_sale_year: row.last_sale_year ?? null, last_verified: row.last_seen ?? null
    }, sources,
    source_summary: "Watchdog normalized New Jersey public-record warehouse",
    limitation: "Research context only. Watchdog does not infer ownership, seller intent, motivation, demographics, title status, or appraisal conclusions."
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return reply(req, 405, { error: "method_not_allowed" });
  const origin = req.headers.get("origin") || "";
  if (origin && !allowedOrigin(origin)) return reply(req, 403, { error: "origin_not_allowed" });
  const url = Deno.env.get("SUPABASE_URL") || "";
  const publicKey = namedEnv("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
  const secretKey = namedEnv("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !publicKey || !secretKey) return reply(req, 503, { error: "service_unavailable" });
  const admin = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch (_) { return reply(req, 400, { error: "invalid_json" }); }
  const action = clean(body.action, 60);
  const version = clean(body.extension_version || req.headers.get("x-watchdog-extension-version"), 30);

  if (action === "pair.approve") {
    if (!WEB_ORIGINS.has(origin) && !/^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin)) return reply(req, 403, { error: "web_origin_required" });
    const auth = req.headers.get("authorization") || "";
    if (!auth.startsWith("Bearer ")) return reply(req, 401, { error: "sign_in_required" });
    const verified = await admin.auth.getUser(auth.slice(7).trim());
    const user = verified.data?.user;
    if (!user) return reply(req, 401, { error: "session_invalid" });
    const access = await currentAccess(admin, user.id);
    if (!access.allowed) return reply(req, 403, { error: "paid_plan_required", plan: access.plan });
    const deviceId = clean(body.device_id, 80), challenge = clean(body.challenge, 80).toLowerCase();
    if (!isUuid(deviceId) || !/^[0-9a-f]{64}$/.test(challenge)) return reply(req, 400, { error: "invalid_pairing_request" });
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const upsert = await admin.from("watchdog_extension_pairings").upsert({ device_id: deviceId, user_id: user.id, challenge_sha256: challenge, plan_tier: access.plan, extension_version: version || null, expires_at: expiresAt, approved_at: new Date().toISOString(), claimed_at: null }, { onConflict: "device_id" });
    if (upsert.error) return reply(req, 503, { error: "pairing_unavailable" });
    return reply(req, 200, { ok: true, plan: access.plan, expires_at: expiresAt });
  }

  if (action === "pair.claim") {
    const deviceId = clean(body.device_id, 80), deviceSecret = clean(body.device_secret, 200);
    if (!isUuid(deviceId) || deviceSecret.length < 32) return reply(req, 400, { error: "invalid_pairing_request" });
    const { data: pairing } = await admin.from("watchdog_extension_pairings").select("*").eq("device_id", deviceId).maybeSingle();
    if (!pairing || pairing.claimed_at || Date.parse(String(pairing.expires_at || "")) <= Date.now()) return reply(req, 409, { error: "pairing_not_ready" });
    if (await sha256(deviceSecret) !== pairing.challenge_sha256) return reply(req, 403, { error: "pairing_secret_invalid" });
    const access = await currentAccess(admin, pairing.user_id);
    if (!access.allowed) return reply(req, 403, { error: "paid_plan_required", plan: access.plan });
    const rawToken = randomToken(), tokenHash = await sha256(rawToken), expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const browser = clean(body.browser, 30);
    const created = await admin.from("watchdog_extension_sessions").insert({ user_id: pairing.user_id, token_hash: tokenHash, plan_tier: access.plan, extension_version: version || pairing.extension_version || null, browser_family: browser || null, expires_at: expiresAt }).select("*").single();
    if (created.error || !created.data) return reply(req, 503, { error: "session_unavailable" });
    await admin.from("watchdog_extension_pairings").update({ claimed_at: new Date().toISOString() }).eq("device_id", deviceId);
    await logEvent(admin, created.data, "session_connected", { extension_version: version, metadata: { browser } });
    return reply(req, 200, { ok: true, token: rawToken, plan: access.plan, expires_at: expiresAt });
  }

  const resolved: any = await resolveSession(req, admin);
  if (!resolved.session) return reply(req, resolved.status || 401, { error: resolved.error || "not_connected", plan: resolved.plan || null });
  const session = resolved.session;
  if (action === "session.status") { await logEvent(admin, session, "session_status", { extension_version: version }); return reply(req, 200, { ok: true, connected: true, plan: session.plan_tier, expires_at: session.expires_at }); }
  if (action === "session.disconnect") { await logEvent(admin, session, "session_disconnected", { extension_version: version }); await admin.from("watchdog_extension_sessions").update({ revoked_at: new Date().toISOString() }).eq("id", session.id); return reply(req, 200, { ok: true }); }
  if (action === "track") {
    const eventName = clean(body.event_name, 60);
    if (!EVENT_NAMES.has(eventName)) return reply(req, 400, { error: "invalid_event" });
    await logEvent(admin, session, eventName, { extension_version: version, match_status: clean(body.match_status, 30), fields_count: body.fields_count, metadata: body.metadata });
    return reply(req, 202, { ok: true });
  }
  if (action === "lookup") {
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const usage = await admin.from("watchdog_extension_events").select("id", { count: "exact", head: true }).eq("session_id", session.id).eq("event_name", "lookup_started").gte("occurred_at", since);
    if ((usage.count || 0) >= 200) return reply(req, 429, { error: "lookup_rate_limited" });
    await logEvent(admin, session, "lookup_started", { extension_version: version });
    try {
      const result: any = await findProperty(admin, body.contact && typeof body.contact === "object" ? body.contact as Record<string, unknown> : {});
      if (result.kind === "match") { await logEvent(admin, session, "lookup_succeeded", { extension_version: version, match_status: "match", metadata: { source_count: result.sources?.length || 0 } }); return reply(req, 200, result); }
      if (result.kind === "ambiguous") { await logEvent(admin, session, "lookup_ambiguous", { extension_version: version, match_status: "ambiguous", metadata: { candidate_count: result.candidates?.length || 0 } }); return reply(req, 200, result); }
      await logEvent(admin, session, "lookup_no_match", { extension_version: version, match_status: "no_match", metadata: { candidate_count: result.candidates?.length || 0 } });
      return reply(req, 200, result);
    } catch (error) { console.error("CRM companion lookup failed", error); return reply(req, 503, { error: "lookup_unavailable" }); }
  }
  return reply(req, 400, { error: "unknown_action" });
});
