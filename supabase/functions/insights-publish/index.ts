// supabase/functions/insights-publish/index.ts
// Canonical Watchdog Insights publisher for https://www.watchdogindex.com/insights.
//
// Security model:
// - Supabase deployment MUST keep verify_jwt=true.
// - Browser callers must send the signed-in Watchdog user's access token.
// - The owner-held INSIGHTS_ADMIN_KEY is an additional write/read gate.
// - CORS is restricted to approved Watchdog / legacy coexistence origins.
// - Database writes continue through the service-role client only after both gates.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DEFAULT_ALLOWED_ORIGINS = [
  "https://www.watchdogindex.com",
  "https://watchdogindex.com",
  "https://njpropertytaxrelief.com",
  "https://www.njpropertytaxrelief.com",
];

function configuredOrigins(): Set<string> {
  const configured = [
    Deno.env.get("INSIGHTS_ALLOWED_ORIGINS") ?? "",
    Deno.env.get("ALLOWED_ORIGIN") ?? "",
  ]
    .join(",")
    .split(",")
    .map((value) => value.trim().replace(/\/$/, ""))
    .filter(Boolean);

  return new Set([...DEFAULT_ALLOWED_ORIGINS, ...configured]);
}

const ALLOWED_ORIGINS = configuredOrigins();

function requestOrigin(req: Request): string {
  return String(req.headers.get("origin") ?? "").trim().replace(/\/$/, "");
}

function originAllowed(req: Request): boolean {
  const origin = requestOrigin(req);
  return !origin || ALLOWED_ORIGINS.has(origin);
}

function corsHeaders(req: Request): Record<string, string> {
  const origin = requestOrigin(req);
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(req),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function requireSecret(name: string): string {
  const value = String(Deno.env.get(name) ?? "").trim();
  if (!value) throw new Error(`missing secret: ${name}`);
  return value;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function positiveInteger(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
}

const admin = createClient(
  requireSecret("SUPABASE_URL"),
  requireSecret("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

Deno.serve(async (req: Request) => {
  if (!originAllowed(req)) {
    return json(req, { ok: false, error: "Origin not allowed" }, 403);
  }

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }

  if (req.method !== "POST") {
    return json(req, { ok: false, error: "POST only" }, 405);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(req, { ok: false, error: "Bad request" }, 400);
  }

  try {
    const adminKey = requireSecret("INSIGHTS_ADMIN_KEY");
    if (stringValue(body.admin_key) !== adminKey) {
      return json(req, { ok: false, error: "Wrong admin password" }, 401);
    }

    const action = stringValue(body.action);

    if (action === "list") {
      const { data, error } = await admin
        .from("insights_articles")
        .select("id, slug, kicker, title, published, published_at, updated_at")
        .order("updated_at", { ascending: false });
      if (error) throw new Error(error.message);
      return json(req, { ok: true, articles: data ?? [] });
    }

    if (action === "get") {
      const id = stringValue(body.id);
      if (!id) return json(req, { ok: false, error: "Article id is required" }, 400);
      const { data, error } = await admin
        .from("insights_articles")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return json(req, { ok: false, error: "Article not found" }, 404);
      return json(req, { ok: true, article: data });
    }

    if (action === "save") {
      const title = stringValue(body.title);
      const kicker = stringValue(body.kicker);
      const dek = stringValue(body.dek);
      const bodyHtml = stringValue(body.body_html);
      if (!title || !kicker || !dek || !bodyHtml) {
        return json(req, { ok: false, error: "Title, kicker, dek and body are all required" }, 400);
      }

      const slug = body.slug ? slugify(String(body.slug)) : slugify(title);
      if (!slug) return json(req, { ok: false, error: "Could not build a slug from that title" }, 400);

      const faq = Array.isArray(body.faq)
        ? body.faq
            .map((item) => {
              if (!item || typeof item !== "object") return null;
              const value = item as Record<string, unknown>;
              const q = stringValue(value.q);
              const a = stringValue(value.a);
              return q && a ? { q, a } : null;
            })
            .filter(Boolean)
        : [];
      const publish = Boolean(body.published);
      const now = new Date().toISOString();
      const estimatedMinutes = Math.max(
        3,
        Math.round(bodyHtml.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length / 220),
      );

      const row: Record<string, unknown> = {
        slug,
        title,
        kicker,
        dek,
        hero_image_url: stringValue(body.hero_image_url) || null,
        hero_image_alt: stringValue(body.hero_image_alt) || null,
        body_html: bodyHtml,
        faq,
        meta_description: stringValue(body.meta_description) || dek,
        reading_minutes: positiveInteger(body.reading_minutes) ?? estimatedMinutes,
        author: stringValue(body.author) || "Watchdog Staff",
        published: publish,
        updated_at: now,
      };

      const id = stringValue(body.id);
      if (id) {
        const { data: existing, error: existingError } = await admin
          .from("insights_articles")
          .select("id, published_at")
          .eq("id", id)
          .maybeSingle();
        if (existingError) throw new Error(existingError.message);
        if (!existing) return json(req, { ok: false, error: "Article not found" }, 404);
        if (publish && !existing.published_at) row.published_at = now;

        const { error } = await admin.from("insights_articles").update(row).eq("id", id);
        if (error) throw new Error(error.message);
        return json(req, { ok: true, slug, published: publish });
      }

      if (publish) row.published_at = now;
      const { error } = await admin.from("insights_articles").insert(row);
      if (error) throw new Error(error.message);
      return json(req, { ok: true, slug, published: publish }, 201);
    }

    if (action === "delete") {
      const id = stringValue(body.id);
      if (!id) return json(req, { ok: false, error: "Article id is required" }, 400);
      const { error } = await admin.from("insights_articles").delete().eq("id", id);
      if (error) throw new Error(error.message);
      return json(req, { ok: true });
    }

    return json(req, { ok: false, error: "Unknown action" }, 400);
  } catch (error) {
    console.error("INSIGHTS_PUBLISH_ERROR", error);
    const detail = error instanceof Error ? error.message : String(error);
    return json(req, { ok: false, error: detail }, 500);
  }
});
