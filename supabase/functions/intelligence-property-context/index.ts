import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const ORIGINS = new Set([
  "https://njpropertytaxrelief.com",
  "https://www.njpropertytaxrelief.com",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);
const RANK: Record<string, number> = { standard: 0, agent: 1, pro: 2, pro_plus: 3, teams: 4, developer: 5 };

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
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors(req), "Content-Type": "application/json", "Cache-Control": "private, no-store" },
  });
}

function clean(v: unknown, max = 160) {
  return String(v ?? "").replace(/[<>]/g, "").trim().slice(0, max);
}

function env(jsonKey: string, legacy: string) {
  const raw = Deno.env.get(jsonKey) || "";
  if (raw) {
    try {
      const x = JSON.parse(raw);
      if (x?.default) return String(x.default);
    } catch {}
  }
  return Deno.env.get(legacy) || "";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return out(req, 405, { error: "POST required" });

  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return out(req, 401, { error: "Sign in required" });

  const url = Deno.env.get("SUPABASE_URL") || "";
  const publishable = env("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
  const secret = env("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !publishable || !secret) return out(req, 503, { error: "Intelligence service configuration incomplete" });

  const userClient = createClient(url, publishable, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData } = await userClient.auth.getUser();
  const user = authData?.user;
  if (!user) return out(req, 401, { error: "Session invalid" });

  let body: any = {};
  try { body = await req.json(); } catch { return out(req, 400, { error: "Invalid JSON" }); }
  const pins = [...new Set((Array.isArray(body?.pams_pins) ? body.pams_pins : []).map((x: unknown) => clean(x, 100)).filter(Boolean))].slice(0, 250);
  if (!pins.length) return out(req, 400, { error: "pams_pins is required" });

  const [{ data: ent }, { data: profile }] = await Promise.all([
    admin.from("account_entitlements").select("plan_tier").eq("user_id", user.id).maybeSingle(),
    admin.from("profiles").select("account_role").eq("id", user.id).maybeSingle(),
  ]);
  const plan = String(profile?.account_role || "") === "developer" ? "developer" : String(ent?.plan_tier || "standard");
  if ((RANK[plan] ?? 0) < RANK.pro) return out(req, 403, { error: "Pro plan required", minimum_plan: "pro" });

  const { data, error } = await admin
    .from("property_lookups")
    .select("pams_pin,address,town,county,prop_class,zip,block,lot,last_seen")
    .in("pams_pin", pins)
    .limit(250);
  if (error) return out(req, 503, { error: "Property context could not be resolved" });

  const contexts: Record<string, unknown> = {};
  for (const row of data || []) {
    const pin = clean(row.pams_pin, 100);
    if (!pin) continue;
    contexts[pin] = {
      municipality: clean(row.town, 140) || null,
      county: clean(row.county, 120) || null,
      property_class: clean(row.prop_class, 60) || null,
      zip: clean(row.zip, 20) || null,
      block: clean(row.block, 60) || null,
      lot: clean(row.lot, 60) || null,
      record_observed_at: row.last_seen || null,
    };
  }

  return out(req, 200, {
    ok: true,
    requested_count: pins.length,
    resolved_count: Object.keys(contexts).length,
    contexts,
  });
});
