import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const url = Deno.env.get("SUPABASE_URL") || "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

function origin(req: Request) {
  const value = req.headers.get("origin") || "";
  try {
    const host = new URL(value).hostname.toLowerCase();
    if (host === "njpropertytaxrelief.com" || host === "www.njpropertytaxrelief.com" || host === "localhost" || host === "127.0.0.1" || host.endsWith(".vercel.app")) return value;
  } catch {}
  return "https://njpropertytaxrelief.com";
}
function headers(req: Request) {
  return {
    "Access-Control-Allow-Origin": origin(req),
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "Vary": "Origin",
  };
}
function json(req: Request, status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: headers(req) });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: headers(req) });
  if (req.method !== "POST") return json(req, 405, { error: "POST required" });
  if (!url || !serviceKey) return json(req, 503, { error: "Usage service unavailable" });
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch {}
  const action = String(body.action || "");
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  if (action === "record") {
    const inserted = await admin.from("anchor_calculator_uses").insert({});
    if (inserted.error) return json(req, 500, { error: "Could not record calculator use" });
    return json(req, 200, { ok: true });
  }
  if (action === "count") {
    const since = new Date(Date.now() - 7 * 86400000).toISOString();
    const result = await admin.from("anchor_calculator_uses").select("id", { count: "exact", head: true }).gte("created_at", since);
    if (result.error) return json(req, 500, { error: "Could not count calculator uses" });
    return json(req, 200, { ok: true, count: result.count || 0 });
  }
  if (action === "social_proof") {
    const [usageResult, peopleResult, testimonialResult] = await Promise.all([
      admin.from("anchor_calculator_uses").select("id", { count: "exact", head: true }),
      admin.from("anchor_relief_profiles").select("user_id", { count: "exact", head: true }),
      admin
        .from("anchor_application_reviews")
        .select("rating,review_comment,submitted_at")
        .eq("public_comment_approved", true)
        .not("review_comment", "is", null)
        .order("submitted_at", { ascending: false })
        .limit(3),
    ]);
    if (usageResult.error) return json(req, 500, { error: "Could not count calculator uses" });
    if (peopleResult.error) return json(req, 500, { error: "Could not count application users" });
    if (testimonialResult.error) return json(req, 500, { error: "Could not load approved testimonials" });
    const testimonials = (testimonialResult.data || [])
      .map((row) => ({
        rating: Math.max(1, Math.min(5, Number(row.rating) || 0)),
        comment: String(row.review_comment || "").trim(),
        submitted_at: row.submitted_at || null,
      }))
      .filter((row) => row.comment.length > 0);
    return json(req, 200, {
      ok: true,
      people_count: peopleResult.count || 0,
      total_uses: usageResult.count || 0,
      people_count_source: "one-per-user relief profile",
      testimonials,
    });
  }
  return json(req, 400, { error: "Unknown action" });
});
