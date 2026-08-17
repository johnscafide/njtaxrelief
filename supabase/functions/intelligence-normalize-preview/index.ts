import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const ENGINE_VERSION = "watchdog-intelligence-normalize-preview-v1";
const ALLOWED_ORIGINS = new Set([
  "https://njpropertytaxrelief.com",
  "https://www.njpropertytaxrelief.com",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);
const PLAN_RANK: Record<string, number> = { standard: 0, agent: 1, pro: 2, pro_plus: 3, teams: 4, developer: 5 };

type Candidate = {
  pams_pin?: string;
  address?: string;
  raw?: Record<string, unknown>;
  cohorts?: Record<string, unknown[]>;
  source_meta?: Record<string, { source_key?: string; source_url?: string; observed_at?: string; explanation?: string }>;
};

function cors(req: Request) {
  const origin = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "https://njpropertytaxrelief.com",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
function json(req: Request, status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), { status, headers: { ...cors(req), "Content-Type": "application/json", "Cache-Control": "private, no-store" } });
}
function clean(value: unknown, max = 300) { return String(value ?? "").replace(/[<>]/g, "").trim().slice(0, max); }
function numeric(value: unknown) { const n = Number(value); return Number.isFinite(n) ? n : null; }
function clamp(value: number, min = 0, max = 100) { return Math.max(min, Math.min(max, value)); }
function round(value: number, places = 2) { const f = 10 ** places; return Math.round(value * f) / f; }
function namedEnv(jsonName: string, legacyName: string) {
  const raw = Deno.env.get(jsonName) || "";
  if (raw) { try { const parsed = JSON.parse(raw); if (parsed?.default) return String(parsed.default); } catch (_) {} }
  return Deno.env.get(legacyName) || "";
}
function quantile(sorted: number[], q: number) {
  if (!sorted.length) return null;
  const p = clamp(q, 0, 1) * (sorted.length - 1);
  const lo = Math.floor(p), hi = Math.ceil(p);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (p - lo);
}
function percentileMidrank(values: number[], raw: number, lowQ = 0, highQ = 1) {
  const sorted = values.slice().sort((a, b) => a - b);
  const lo = quantile(sorted, lowQ) ?? sorted[0];
  const hi = quantile(sorted, highQ) ?? sorted[sorted.length - 1];
  const x = Math.max(lo, Math.min(hi, raw));
  let lower = 0, equal = 0;
  for (const v of sorted) { const w = Math.max(lo, Math.min(hi, v)); if (w < x) lower++; else if (w === x) equal++; }
  return { score: clamp(((lower + equal * 0.5) / sorted.length) * 100), low: lo, high: hi, sample_size: sorted.length };
}
function transform(def: any, rawValue: unknown, cohortValues: unknown[], cohortDef: any) {
  const cfg = def.config || {};
  if (def.status === "draft") return { status: "definition_draft", score: null, detail: {} };
  if (def.transform_type === "identity_0_100") {
    const n = numeric(rawValue); return n === null ? { status: "missing", score: null, detail: {} } : { status: "available", score: clamp(n), detail: {} };
  }
  if (def.transform_type === "inverse_0_100") {
    const n = numeric(rawValue); return n === null ? { status: "missing", score: null, detail: {} } : { status: "available", score: clamp(100 - clamp(n)), detail: {} };
  }
  if (def.transform_type === "count_cap") {
    const n = numeric(rawValue), cap = Math.max(Number(cfg.cap || 1), 1); return n === null ? { status: "missing", score: null, detail: {} } : { status: "available", score: clamp((Math.max(n, 0) / cap) * 100), detail: { cap } };
  }
  if (def.transform_type === "distance_from_target") {
    const n = numeric(rawValue), target = Number(cfg.target ?? 0), delta = Math.max(Number(cfg.full_attention_delta || 1), 0.000001); return n === null ? { status: "missing", score: null, detail: {} } : { status: "available", score: clamp((Math.abs(n - target) / delta) * 100), detail: { target, full_attention_delta: delta } };
  }
  if (def.transform_type === "categorical_map") {
    const key = clean(rawValue, 80).toLowerCase(); const mapped = numeric(cfg[key]); return mapped === null ? { status: key ? "unmapped_category" : "missing", score: null, detail: { category: key || null } } : { status: "available", score: clamp(mapped), detail: { category: key } };
  }
  if (def.transform_type === "recency_decay") {
    const time = new Date(String(rawValue || "")); if (!Number.isFinite(time.getTime())) return { status: "missing", score: null, detail: {} };
    const days = Math.max(0, (Date.now() - time.getTime()) / 86400000);
    const points = Array.isArray(cfg.breakpoints) ? cfg.breakpoints.slice().sort((a: any, b: any) => Number(a.days) - Number(b.days)) : [];
    const point = points.find((p: any) => days <= Number(p.days));
    const score = point ? Number(point.score) : Number(cfg.older_score ?? 0);
    return { status: "available", score: clamp(score), detail: { age_days: round(days, 1) } };
  }
  if (def.transform_type === "cohort_percentile_high") {
    const n = numeric(rawValue); if (n === null) return { status: "missing", score: null, detail: {} };
    const values = (Array.isArray(cohortValues) ? cohortValues : []).map(numeric).filter((x): x is number => x !== null);
    const minimum = Number(cohortDef?.minimum_sample_size || 12);
    if (values.length < minimum) return { status: "cohort_insufficient", score: null, detail: { sample_size: values.length, minimum_sample_size: minimum } };
    const result = percentileMidrank(values, n, Number(cfg.winsorize_low ?? 0), Number(cfg.winsorize_high ?? 1));
    return { status: "available", score: result.score, detail: { sample_size: result.sample_size, winsorized_low: result.low, winsorized_high: result.high, cohort_key: def.cohort_key, cohort_version: def.cohort_version } };
  }
  return { status: "unsupported_transform", score: null, detail: { transform_type: def.transform_type } };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return json(req, 405, { error: "POST required" });
  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return json(req, 401, { error: "Sign in required" });

  const url = Deno.env.get("SUPABASE_URL") || "";
  const publishable = namedEnv("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
  const secret = namedEnv("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
  const userClient = createClient(url, publishable, { global: { headers: { Authorization: auth } }, auth: { persistSession: false, autoRefreshToken: false } });
  const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData } = await userClient.auth.getUser();
  const user = authData?.user;
  if (!user) return json(req, 401, { error: "Session invalid" });

  let body: any; try { body = await req.json(); } catch (_) { return json(req, 400, { error: "Invalid JSON" }); }
  const candidates = (Array.isArray(body?.candidates) ? body.candidates : []).slice(0, 250) as Candidate[];
  const requested = [...new Set((Array.isArray(body?.feature_keys) ? body.feature_keys : []).map((x: unknown) => clean(x, 140)).filter(Boolean))].slice(0, 80);
  if (!candidates.length || !requested.length) return json(req, 400, { error: "candidates and feature_keys are required" });

  const [{ data: entitlement }, { data: profile }] = await Promise.all([
    admin.from("account_entitlements").select("plan_tier").eq("user_id", user.id).maybeSingle(),
    admin.from("profiles").select("account_role").eq("id", user.id).maybeSingle(),
  ]);
  const plan = String(profile?.account_role || "") === "developer" ? "developer" : String(entitlement?.plan_tier || "standard");
  if ((PLAN_RANK[plan] ?? 0) < PLAN_RANK.pro) return json(req, 403, { error: "Pro plan required" });

  const { data: allDefs, error: defError } = await admin.from("intelligence_feature_versions").select("feature_key,version,source_key,label,transform_type,cohort_key,cohort_version,config,direction,status,explanation").in("feature_key", requested).in("status", ["preview", "live", "draft"]).order("version", { ascending: false });
  if (defError) return json(req, 503, { error: "Normalization registry unavailable" });
  const defs = new Map<string, any>();
  for (const def of allDefs || []) if (!defs.has(String(def.feature_key))) defs.set(String(def.feature_key), def);

  const cohortKeys = [...new Set([...defs.values()].map((d: any) => d.cohort_key).filter(Boolean))];
  let cohortRows: any[] = [];
  if (cohortKeys.length) {
    const r = await admin.from("intelligence_cohort_versions").select("cohort_key,version,label,description,dimensions,minimum_sample_size,fallback_chain,status").in("cohort_key", cohortKeys);
    if (r.error) return json(req, 503, { error: "Cohort registry unavailable" });
    cohortRows = r.data || [];
  }
  const cohortMap = new Map(cohortRows.map((c: any) => [`${c.cohort_key}:${c.version}`, c]));

  const normalizationManifest: Record<string, unknown> = {};
  const cohortManifest: Record<string, unknown> = {};
  for (const [key, def] of defs) {
    normalizationManifest[key] = { version: def.version, source_key: def.source_key, transform_type: def.transform_type, status: def.status, direction: def.direction };
    if (def.cohort_key) {
      const c = cohortMap.get(`${def.cohort_key}:${def.cohort_version}`);
      if (c) cohortManifest[def.cohort_key] = { version: c.version, dimensions: c.dimensions, minimum_sample_size: c.minimum_sample_size, fallback_chain: c.fallback_chain };
    }
  }

  const output = candidates.map((candidate) => {
    const raw = candidate.raw && typeof candidate.raw === "object" ? candidate.raw : {};
    const cohorts = candidate.cohorts && typeof candidate.cohorts === "object" ? candidate.cohorts : {};
    const sourceMeta = candidate.source_meta && typeof candidate.source_meta === "object" ? candidate.source_meta : {};
    const features: Record<string, unknown> = {};
    for (const featureKey of requested) {
      const def = defs.get(featureKey);
      if (!def) { features[featureKey] = { status: "definition_missing", score: null }; continue; }
      const sourceKey = String(def.source_key);
      const rawValue = raw[sourceKey];
      const cohortDef = def.cohort_key ? cohortMap.get(`${def.cohort_key}:${def.cohort_version}`) : null;
      const result = transform(def, rawValue, cohorts[featureKey] || cohorts[sourceKey] || [], cohortDef);
      const meta = sourceMeta[sourceKey] || sourceMeta[featureKey] || {};
      features[featureKey] = {
        status: result.status,
        score: result.score === null ? null : round(result.score),
        value: rawValue ?? null,
        source_key: clean(meta.source_key || sourceKey, 140),
        source_url: clean(meta.source_url, 600) || null,
        observed_at: clean(meta.observed_at, 80) || null,
        explanation: clean(meta.explanation || def.explanation, 600),
        normalization: { feature_version: def.version, transform_type: def.transform_type, direction: def.direction, detail: result.detail },
        cohort: def.cohort_key ? { cohort_key: def.cohort_key, cohort_version: def.cohort_version, ...(result.detail || {}) } : null,
      };
    }
    return { pams_pin: clean(candidate.pams_pin, 100) || null, address: clean(candidate.address, 300) || null, features };
  });

  return json(req, 200, {
    ok: true,
    engine_version: ENGINE_VERSION,
    plan,
    feature_count: requested.length,
    candidate_count: output.length,
    normalization_manifest: normalizationManifest,
    cohort_manifest: cohortManifest,
    candidates: output,
    warning: "Preview normalization only. Feature/model calibration is not complete.",
  });
});
