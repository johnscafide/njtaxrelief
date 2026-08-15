import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";

const service = SUPABASE_URL && SERVICE_KEY
  ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

function allowedOrigin(origin: string) {
  if (!origin) return "https://njpropertytaxrelief.com";
  try {
    const url = new URL(origin);
    if (url.protocol !== "https:") return "https://njpropertytaxrelief.com";
    if (["njpropertytaxrelief.com", "www.njpropertytaxrelief.com", "njtaxrelief.vercel.app"].includes(url.hostname)) return origin;
    if (url.hostname.endsWith(".vercel.app")) return origin;
  } catch {
    // fall through
  }
  return "https://njpropertytaxrelief.com";
}

function cors(req: Request) {
  return {
    "Access-Control-Allow-Origin": allowedOrigin(req.headers.get("origin") || ""),
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(req), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

async function isDeveloper(accessToken: string) {
  if (!service || !SUPABASE_URL || !ANON_KEY || !accessToken) return false;
  const user = await service.auth.getUser(accessToken);
  if (user.error || !user.data.user) return false;
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const result = await userClient.rpc("is_watchdog_developer");
  return !result.error && result.data === true;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);
  if (!service) return json(req, { error: "Backoffice recovery service is unavailable." }, 500);

  const auth = req.headers.get("authorization") || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  const accessToken = match?.[1] || "";
  if (!(await isDeveloper(accessToken))) {
    return json(req, { error: "A signed-in Watchdog developer account is required to reset the Backoffice key." }, 403);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(req, { error: "Invalid JSON" }, 400);
  }

  const key = typeof body.key === "string" ? body.key.trim() : "";
  if (key.length < 14) return json(req, { error: "Use at least 14 characters for the new Backoffice key." }, 422);
  if (key.length > 200) return json(req, { error: "The Backoffice key is too long." }, 422);

  const set = await service.rpc("backoffice_set_secret", {
    p_name: "backoffice_shared_access_key",
    p_value: key,
    p_description: "Shared password for /property/backoffice/",
  });
  if (set.error) return json(req, { error: "Could not update the Backoffice key." }, 500);

  const now = new Date().toISOString();
  await service.from("backoffice_sessions").update({ revoked_at: now }).is("revoked_at", null);
  await service.from("backoffice_auth_events").insert({
    actor_label: "developer-recovery",
    event_type: "access_key.recovered",
    success: true,
    metadata: { method: "watchdog-developer-session" },
  });

  return json(req, { ok: true, sessions_revoked: true });
});
