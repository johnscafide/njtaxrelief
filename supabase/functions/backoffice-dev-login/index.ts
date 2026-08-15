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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);
  if (!service) return json(req, { error: "Backoffice session service is unavailable." }, 500);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* body optional */ }
  const actorRaw = typeof body.actor === "string" ? body.actor.trim().toLowerCase() : "john";
  const actor = ["john", "wife"].includes(actorRaw) ? actorRaw : "john";

  const token = randomToken();
  const tokenHash = await sha256(token);
  const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
  const fp = await fingerprint(req);

  const inserted = await service.from("backoffice_sessions").insert({
    token_hash: tokenHash,
    actor_label: actor,
    expires_at: expiresAt,
    request_fingerprint: fp,
  }).select("id,actor_label,expires_at").single();

  if (inserted.error) return json(req, { error: "Could not create Backoffice session." }, 500);

  await service.from("backoffice_auth_events").insert({
    actor_label: actor,
    event_type: "open_access.succeeded",
    success: true,
    request_fingerprint: fp,
    metadata: { method: "temporary-open-access", authentication_required: false },
  });

  return json(req, {
    ok: true,
    token,
    actor,
    expires_at: inserted.data.expires_at,
    authentication_required: false,
  });
});
