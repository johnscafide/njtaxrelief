import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DEFAULT_SITE = "https://njpropertytaxrelief.com";
const PRODUCTION_HOSTS = new Set([
  "njpropertytaxrelief.com",
  "www.njpropertytaxrelief.com",
  "watchdogindex.com",
  "www.watchdogindex.com"
]);

function allowedOrigin(req: Request) {
  const origin = req.headers.get("origin") || "";
  try {
    const host = new URL(origin).hostname.toLowerCase();
    if (
      PRODUCTION_HOSTS.has(host) ||
      host === "localhost" ||
      host === "127.0.0.1" ||
      host.endsWith(".vercel.app")
    ) return origin;
  } catch (_) {}
  return DEFAULT_SITE;
}

function requestSite(req: Request) {
  const origin = req.headers.get("origin") || "";
  try {
    const url = new URL(origin);
    if (url.protocol === "https:" && PRODUCTION_HOSTS.has(url.hostname.toLowerCase())) {
      return `${url.protocol}//${url.host}`;
    }
  } catch (_) {}
  return String(Deno.env.get("PUBLIC_SITE_URL") || DEFAULT_SITE).replace(/\/$/, "");
}

function cors(req: Request) {
  return {
    "access-control-allow-origin": allowedOrigin(req),
    "access-control-allow-headers": "authorization, apikey, content-type",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "content-type": "application/json",
    "cache-control": "no-store",
    "vary": "Origin"
  };
}

const enc = new TextEncoder();

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: cors(req) });
}

async function hash(value: string) {
  const raw = await crypto.subtle.digest("SHA-256", enc.encode(value));
  return Array.from(new Uint8Array(raw)).map(x => x.toString(16).padStart(2, "0")).join("");
}

function token() {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...b)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });

  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !service) return json(req, { error: "Service unavailable" }, 503);

  const admin = createClient(url, service, { auth: { persistSession: false } });

  try {
    if (req.method === "GET") {
      const raw = new URL(req.url).searchParams.get("token") || "";
      if (raw.length < 32) return json(req, { error: "Report unavailable" }, 404);

      const h = await hash(raw);
      const { data: share } = await admin
        .from("professional_report_shares")
        .select("id,version_id,expires_at,revoked_at,view_count")
        .eq("token_hash", h)
        .maybeSingle();
      if (!share || share.revoked_at || new Date(share.expires_at) <= new Date()) {
        return json(req, { error: "Report unavailable" }, 404);
      }

      const { data: v, error } = await admin
        .from("professional_report_versions")
        .select("version_no,content,source_manifest,created_at")
        .eq("id", share.version_id)
        .single();
      if (error || !v) return json(req, { error: "Report unavailable" }, 404);

      await admin
        .from("professional_report_shares")
        .update({ view_count: (share.view_count || 0) + 1 })
        .eq("id", share.id);
      return json(req, { ...v, expires_at: share.expires_at });
    }

    if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

    const auth = req.headers.get("authorization") || "";
    const jwt = auth.replace(/^Bearer\s+/i, "");
    if (!jwt) return json(req, { error: "Authentication required" }, 401);

    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false }
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json(req, { error: "Authentication required" }, 401);

    const body = await req.json();
    const days = Math.max(1, Math.min(30, Number(body.days) || 14));
    const { data: v } = await userClient
      .from("professional_report_versions")
      .select("id,report_id")
      .eq("id", body.version_id)
      .eq("report_id", body.report_id)
      .maybeSingle();
    if (!v) return json(req, { error: "Report version not found" }, 404);

    const raw = token();
    const expires = new Date(Date.now() + days * 86400000).toISOString();
    const { error } = await userClient.from("professional_report_shares").insert({
      report_id: v.report_id,
      version_id: v.id,
      user_id: user.id,
      token_hash: await hash(raw),
      expires_at: expires
    });
    if (error) throw error;

    const site = requestSite(req);
    return json(req, {
      url: `${site}/property/report?token=${encodeURIComponent(raw)}`,
      expires_at: expires
    }, 201);
  } catch (e) {
    console.error(e);
    return json(req, { error: "Request could not be completed" }, 500);
  }
});
