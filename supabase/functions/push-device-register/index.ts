import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

// Mobile push device registration (FCM).
// - The app calls this with its Supabase session (verify_jwt = true at the
//   gateway, getUser() here). No plan gate: any signed-in member may register.
// - Raw FCM tokens are credentials. They are written with the service key into
//   push_device_registrations, which browser roles cannot read, and are never
//   returned in any response. Only the sha256 hash is used for matching.
// - Android sends no Origin header. A missing Origin is accepted; a present
//   Origin must be on the allowlist (same rule and list as farm-workspace).
// - A member keeps at most MAX_ACTIVE_DEVICES active registrations; beyond
//   that the least recently seen are retired ('replaced') so a real member
//   with many phones is never locked out while a client-chosen
//   installation_id cannot grow the row count without bound.
// - Nothing here sends a push. Sending is the push-sender worker, and it stays
//   idle until push_settings.enabled is true.

type Obj = Record<string, any>;
const MAX_ACTIVE_DEVICES = 10;

const ORIGINS = new Set([
  "https://www.watchdogindex.com", "https://watchdogindex.com",
  "https://njpropertytaxrelief.com", "https://www.njpropertytaxrelief.com",
  "http://localhost:3000", "http://127.0.0.1:3000", "http://127.0.0.1:8765",
]);
const PLATFORMS = new Set(["android", "ios", "web"]);
const ACTIONS = new Set(["register", "heartbeat", "update", "unregister", "list"]);
// Columns that may leave the server. The token column is never in this list.
const SAFE_COLUMNS = "id,platform,device_label,app_version,alerts_enabled,digest_enabled,quiet_hours_start,quiet_hours_end,timezone,locale,created_at,last_seen_at,disabled_at";

function allowOrigin(o: string) {
  return ORIGINS.has(o) || /^https:\/\/njtaxrelief(?:-git)?-[a-z0-9-]+-johnscafides-projects\.vercel\.app$/.test(o);
}
function cors(req: Request) {
  const o = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": allowOrigin(o) ? o : "https://www.watchdogindex.com",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
function reply(req: Request, status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors(req), "Content-Type": "application/json", "Cache-Control": "private, no-store" },
  });
}
function namedEnv(jsonName: string, legacyName: string) {
  const raw = Deno.env.get(jsonName) || "";
  if (raw) { try { const x = JSON.parse(raw); if (x?.default) return String(x.default); } catch { /* fall through */ } }
  return Deno.env.get(legacyName) || "";
}
function clean(v: unknown, max = 160) {
  return String(v ?? "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, max);
}
async function sha256(v: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v));
  return Array.from(new Uint8Array(d)).map((x) => x.toString(16).padStart(2, "0")).join("");
}
function validTimezone(v: unknown) {
  const tz = clean(v, 64);
  if (!tz) return "";
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return tz; } catch { return ""; }
}
function hour(v: unknown): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= 23 ? n : undefined;
}
function bool(v: unknown): boolean | undefined {
  if (typeof v === "boolean") return v;
  if (v === "true" || v === 1 || v === "1") return true;
  if (v === "false" || v === 0 || v === "0") return false;
  return undefined;
}
// Preference and metadata fields the app may set on register/heartbeat/update.
function preferencePatch(body: Obj) {
  const patch: Obj = {};
  if (body.app_version !== undefined) patch.app_version = clean(body.app_version, 40) || null;
  if (body.device_label !== undefined) patch.device_label = clean(body.device_label, 80) || null;
  if (body.locale !== undefined) patch.locale = clean(body.locale, 35) || null;
  if (body.timezone !== undefined) { const tz = validTimezone(body.timezone); if (tz) patch.timezone = tz; }
  const qs = hour(body.quiet_hours_start), qe = hour(body.quiet_hours_end);
  if (qs !== undefined) patch.quiet_hours_start = qs;
  if (qe !== undefined) patch.quiet_hours_end = qe;
  const alerts = bool(body.alerts_enabled), digest = bool(body.digest_enabled);
  if (alerts !== undefined) patch.alerts_enabled = alerts;
  if (digest !== undefined) patch.digest_enabled = digest;
  return patch;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return reply(req, 405, { error: "method_not_allowed" });

  const origin = req.headers.get("origin") || "";
  if (origin && !allowOrigin(origin)) return reply(req, 403, { error: "origin_not_allowed" });

  const url = Deno.env.get("SUPABASE_URL") || "";
  const secret = namedEnv("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !secret) return reply(req, 503, { error: "service_unavailable" });

  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return reply(req, 401, { error: "sign_in_required" });
  const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const verified = await admin.auth.getUser(auth.slice(7).trim());
  const user = verified.data?.user;
  if (verified.error || !user) return reply(req, 401, { error: "session_invalid" });

  let body: Obj = {};
  try { body = await req.json(); } catch { return reply(req, 400, { error: "invalid_json" }); }
  if (!body || typeof body !== "object") return reply(req, 400, { error: "invalid_json" });
  const action = clean(body.action, 40);
  if (!ACTIONS.has(action)) return reply(req, 400, { error: "unknown_action" });

  const audit = async (kind: string, details: Obj = {}) => {
    try { await admin.from("integration_audit_log").insert({ user_id: user.id, action: kind, actor: "user", details }); } catch { /* audit must not fail the request */ }
  };
  const now = () => new Date().toISOString();

  if (action === "list") {
    const { data, error } = await admin.from("push_device_registrations").select(SAFE_COLUMNS)
      .eq("user_id", user.id).order("created_at", { ascending: false });
    if (error) return reply(req, 500, { error: "registration_failed" });
    return reply(req, 200, { ok: true, registrations: data || [] });
  }

  const installationId = clean(body.installation_id, 128);
  if (installationId.length < 8) return reply(req, 400, { error: "installation_id_required" });

  if (action === "unregister") {
    const reason = clean(body.reason, 20) === "signed_out" ? "signed_out" : "unregistered";
    const { data } = await admin.from("push_device_registrations")
      .update({ disabled_at: now(), disabled_reason: reason, updated_at: now() })
      .eq("user_id", user.id).eq("installation_id", installationId).is("disabled_at", null)
      .select("id,platform");
    for (const row of data || []) await audit("push.device.unregistered", { registration_id: row.id, platform: row.platform, reason });
    // Idempotent: the same answer whether or not a row existed.
    return reply(req, 200, { ok: true });
  }

  if (action === "update") {
    const patch = preferencePatch(body);
    patch.updated_at = now();
    const { data, error } = await admin.from("push_device_registrations").update(patch)
      .eq("user_id", user.id).eq("installation_id", installationId)
      .select(SAFE_COLUMNS).maybeSingle();
    if (error) return reply(req, 500, { error: "registration_failed" });
    if (!data) return reply(req, 404, { error: "registration_not_found" });
    await audit("push.device.updated", { registration_id: data.id, fields: Object.keys(patch).filter((k) => k !== "updated_at") });
    return reply(req, 200, { ok: true, registration: data });
  }

  // register / heartbeat
  const token = String(body.token ?? "").trim();
  if (token.length < 32 || token.length > 4096 || /[\s\u0000-\u001f]/.test(token)) return reply(req, 400, { error: "token_required" });
  const platform = clean(body.platform, 12).toLowerCase();
  const { data: existing } = await admin.from("push_device_registrations").select("id,platform")
    .eq("user_id", user.id).eq("installation_id", installationId).maybeSingle();
  if (platform && !PLATFORMS.has(platform)) return reply(req, 400, { error: "platform_invalid" });
  if (!platform && !(action === "heartbeat" && existing?.platform)) return reply(req, 400, { error: "platform_invalid" });

  const tokenHash = await sha256(token);
  // The same token under another row means this device re-signed in as a
  // different user (or a reinstall). Retire the old row first so the token
  // stays unique among active registrations.
  const { data: others } = await admin.from("push_device_registrations").select("id,user_id,installation_id")
    .eq("token_hash", tokenHash).is("disabled_at", null);
  for (const other of others || []) {
    if (other.user_id === user.id && other.installation_id === installationId) continue;
    await admin.from("push_device_registrations")
      .update({ disabled_at: now(), disabled_reason: "replaced", updated_at: now() })
      .eq("id", other.id);
  }

  const record: Obj = {
    user_id: user.id,
    installation_id: installationId,
    provider: "fcm",
    platform: platform || existing?.platform,
    token,
    token_hash: tokenHash,
    last_seen_at: now(),
    updated_at: now(),
    disabled_at: null,
    disabled_reason: null,
    ...preferencePatch(body),
  };
  const saved = await admin.from("push_device_registrations")
    .upsert(record, { onConflict: "user_id,installation_id" })
    .select(SAFE_COLUMNS).single();
  if (saved.error || !saved.data) return reply(req, 500, { error: "registration_failed" });

  // Cap active devices per member: keep the most recently seen, retire the rest.
  const { data: active } = await admin.from("push_device_registrations").select("id")
    .eq("user_id", user.id).is("disabled_at", null)
    .order("last_seen_at", { ascending: false }).order("created_at", { ascending: false });
  const overflow = (active || []).slice(MAX_ACTIVE_DEVICES).map((r) => r.id).filter((id) => id !== saved.data.id);
  if (overflow.length) {
    await admin.from("push_device_registrations")
      .update({ disabled_at: now(), disabled_reason: "replaced", updated_at: now() })
      .in("id", overflow);
  }

  if (!existing || action === "register") {
    await audit("push.device.registered", { registration_id: saved.data.id, platform: saved.data.platform, app_version: saved.data.app_version, replaced: (others || []).length, retired: overflow.length });
  }
  return reply(req, action === "register" ? 201 : 200, { ok: true, registration: saved.data });
});
