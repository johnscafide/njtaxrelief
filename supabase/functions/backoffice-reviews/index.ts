import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";

const service = SUPABASE_URL && SERVICE_KEY
  ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

function allowedOrigin(req: Request) {
  const value = req.headers.get("origin") || "";
  try {
    const host = new URL(value).hostname.toLowerCase();
    if (
      host === "watchdogindex.com" ||
      host === "www.watchdogindex.com" ||
      host === "localhost" ||
      host === "127.0.0.1" ||
      host.endsWith(".vercel.app")
    ) return value;
  } catch {}
  return "https://www.watchdogindex.com";
}

function headers(req: Request) {
  return {
    "Access-Control-Allow-Origin": allowedOrigin(req),
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "private, no-store, max-age=0",
    "Vary": "Origin",
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: headers(req) });
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function safeReview(row: Record<string, unknown>) {
  return {
    id: row.id,
    rating: Math.max(1, Math.min(5, Number(row.rating) || 0)),
    comment: text(row.review_comment),
    approved: row.public_comment_approved === true,
    approved_at: row.public_comment_approved_at || null,
    submitted_at: row.submitted_at || null,
    updated_at: row.updated_at || null,
  };
}

async function requireDeveloper(req: Request) {
  if (!service || !SUPABASE_URL || !ANON_KEY) {
    throw Object.assign(new Error("Review moderation service is unavailable."), { status: 503 });
  }
  const auth = req.headers.get("authorization") || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) throw Object.assign(new Error("Developer sign-in is required."), { status: 401 });
  const token = match[1];
  const userResult = await service.auth.getUser(token);
  if (userResult.error || !userResult.data.user) {
    throw Object.assign(new Error("Developer sign-in is required."), { status: 401 });
  }
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const dev = await userClient.rpc("is_watchdog_developer");
  if (dev.error || dev.data !== true) {
    throw Object.assign(new Error("Developer access is required."), { status: 403 });
  }
  return userResult.data.user;
}

async function pendingCount() {
  if (!service) return 0;
  const result = await service
    .from("anchor_application_reviews")
    .select("id", { count: "exact", head: true })
    .eq("public_comment_approved", false)
    .not("review_comment", "is", null);
  if (result.error) throw result.error;
  return result.count || 0;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: headers(req) });
  if (req.method !== "POST") return json(req, { error: "POST required" }, 405);
  if (!service) return json(req, { error: "Review moderation service is unavailable." }, 503);

  try {
    await requireDeveloper(req);
    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch {}
    const action = text(body.action || "list").toLowerCase();

    if (action === "count") {
      return json(req, { ok: true, pending_count: await pendingCount() });
    }

    if (action === "list") {
      const [pending, approved] = await Promise.all([
        service
          .from("anchor_application_reviews")
          .select("id,rating,review_comment,public_comment_approved,public_comment_approved_at,submitted_at,updated_at")
          .eq("public_comment_approved", false)
          .not("review_comment", "is", null)
          .order("submitted_at", { ascending: false })
          .limit(100),
        service
          .from("anchor_application_reviews")
          .select("id,rating,review_comment,public_comment_approved,public_comment_approved_at,submitted_at,updated_at")
          .eq("public_comment_approved", true)
          .not("review_comment", "is", null)
          .order("public_comment_approved_at", { ascending: false })
          .limit(100),
      ]);
      if (pending.error) throw pending.error;
      if (approved.error) throw approved.error;
      const pendingRows = (pending.data || []).map((row) => safeReview(row));
      const approvedRows = (approved.data || []).map((row) => safeReview(row));
      return json(req, {
        ok: true,
        pending_count: pendingRows.length,
        pending: pendingRows,
        approved: approvedRows,
      });
    }

    if (action === "approve" || action === "unpublish") {
      const reviewId = text(body.review_id);
      if (!isUuid(reviewId)) return json(req, { error: "A valid review_id is required." }, 422);
      const patch = action === "approve"
        ? { public_comment_approved: true, public_comment_approved_at: new Date().toISOString() }
        : { public_comment_approved: false, public_comment_approved_at: null };
      const updated = await service
        .from("anchor_application_reviews")
        .update(patch)
        .eq("id", reviewId)
        .select("id,rating,review_comment,public_comment_approved,public_comment_approved_at,submitted_at,updated_at")
        .single();
      if (updated.error) throw updated.error;
      return json(req, {
        ok: true,
        review: safeReview(updated.data),
        pending_count: await pendingCount(),
      });
    }

    return json(req, { error: "Unknown action" }, 400);
  } catch (error) {
    const status = Number((error as { status?: number })?.status) || 500;
    const message = error instanceof Error ? error.message : "Review moderation request failed.";
    console.error("backoffice-reviews", message);
    return json(req, { error: message }, status);
  }
});
