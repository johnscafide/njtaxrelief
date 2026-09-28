import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const service = SUPABASE_URL && SERVICE_KEY
  ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

function allowedOrigin(origin: string) {
  if (!origin) return "https://njpropertytaxrelief.com";
  try {
    const url = new URL(origin);
    if (url.protocol !== "https:") return "https://njpropertytaxrelief.com";
    if (["watchdogindex.com", "www.watchdogindex.com", "njpropertytaxrelief.com", "www.njpropertytaxrelief.com", "njtaxrelief.vercel.app"].includes(url.hostname)) return origin;
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

function hex(bytes: ArrayBuffer | Uint8Array) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256(value: string) {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return hex(bytes);
}

async function fingerprint(req: Request) {
  const ip = (req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "unknown").split(",")[0].trim();
  const ua = req.headers.get("user-agent") || "unknown";
  return sha256(`${ip}|${ua}`);
}

// Backoffice sessions go only to signed-in Watchdog accounts listed in
// public.backoffice_operators. The operator row decides the actor label; the
// request body cannot choose it.
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);
  if (!service) return json(req, { error: "Backoffice session service is unavailable." }, 500);

  const auth = req.headers.get("authorization") || "";
  const accessToken = (auth.match(/^Bearer\s+(.+)$/i) || [])[1] || "";
  if (!accessToken) return json(req, { error: "Sign in to Watchdog to open Backoffice.", sign_in_required: true }, 401);
  const fp = await fingerprint(req);

  const { data: userData, error: userError } = await service.auth.getUser(accessToken);
  const user = userData?.user;
  if (userError || !user) return json(req, { error: "Sign in to Watchdog to open Backoffice.", sign_in_required: true }, 401);

  const operator = await service.from("backoffice_operators").select("actor_label").eq("user_id", user.id).maybeSingle();
  if (operator.error) return json(req, { error: "Backoffice access could not be checked." }, 503);
  if (!operator.data) {
    await service.from("backoffice_auth_events").insert({
      actor_label: null,
      event_type: "login.denied",
      success: false,
      request_fingerprint: fp,
      metadata: { method: "watchdog-account", user_id: user.id },
    });
    return json(req, { error: "This Watchdog account does not have Backoffice access.", access_denied: true }, 403);
  }
  const actor = operator.data.actor_label === "wife" ? "wife" : "john";

  const token = randomToken();
  const tokenHash = await sha256(token);
  const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();

  const inserted = await service.from("backoffice_sessions").insert({
    token_hash: tokenHash,
    actor_label: actor,
    expires_at: expiresAt,
    request_fingerprint: fp,
  }).select("id,actor_label,expires_at").single();

  if (inserted.error) return json(req, { error: "Could not create Backoffice session." }, 500);

  await service.from("backoffice_auth_events").insert({
    actor_label: actor,
    event_type: "login.succeeded",
    success: true,
    request_fingerprint: fp,
    metadata: { method: "watchdog-account", user_id: user.id },
  });

  return json(req, {
    ok: true,
    token,
    actor,
    expires_at: inserted.data.expires_at,
  });
});
