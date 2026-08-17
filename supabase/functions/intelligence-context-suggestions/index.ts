import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const ENGINE = "watchdog-context-intelligence-v1";
const CONTRACT_VERSION = "watchdog-context-suggestions-v1";
const RANK: Record<string, number> = { standard: 0, agent: 1, pro: 2, pro_plus: 3, teams: 4, developer: 5 };
const MODEL_DEFS = [
  { key: "assessment_anomaly", label: "Assessment Anomaly", minimum_plan: "pro", fn: "intelligence-assessment-run-preview" },
  { key: "closing_review", label: "Closing Review", minimum_plan: "pro_plus", fn: "intelligence-closing-run-preview" },
  { key: "property_change_priority", label: "Change Intelligence", minimum_plan: "pro_plus", fn: "intelligence-change-run-preview" },
] as const;

function clean(value: unknown, max = 400) {
  return String(value ?? "").replace(/[<>]/g, "").trim().slice(0, max);
}

function env(jsonName: string, legacyName: string) {
  const raw = Deno.env.get(jsonName) || "";
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.default) return String(parsed.default);
    } catch (_) {}
  }
  return Deno.env.get(legacyName) || "";
}

function originFor(req: Request) {
  const origin = req.headers.get("origin") || "";
  if (origin === "https://njpropertytaxrelief.com" || origin === "https://www.njpropertytaxrelief.com") return origin;
  if (origin === "http://localhost:3000" || origin === "http://127.0.0.1:3000") return origin;
  if (/^https:\/\/njtaxrelief(?:-git)?-[a-z0-9-]+-johnscafides-projects\.vercel\.app$/i.test(origin)) return origin;
  return "https://njpropertytaxrelief.com";
}

function cors(req: Request) {
  return {
    "Access-Control-Allow-Origin": originFor(req),
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

function modelFor(key: string) {
  return MODEL_DEFS.find((model) => model.key === key) || null;
}

function attentionBand(finding: any) {
  const score = Number(finding?.score || 0);
  const confidence = Number(finding?.confidence || 0);
  const evidence = Number(finding?.evidence_coverage || 0);
  if (finding?.limited_evidence || evidence < 50 || confidence < 50) return "watch";
  if (score >= 80 && confidence >= 65) return "act_now";
  if (score >= 65) return "this_week";
  return "watch";
}

function actionSet(modelKey: string) {
  const base = ["open_property", "why_watchdog", "watch_property"];
  if (modelKey === "closing_review") return [...base, "create_case", "create_report"];
  if (modelKey === "property_change_priority") return [...base, "create_case"];
  return [...base, "create_case", "create_report"];
}

function firstWhy(finding: any) {
  const why = Array.isArray(finding?.why_now) ? finding.why_now : [];
  const explicit = why.find((item: any) => clean(item?.explanation, 500));
  if (explicit) return clean(explicit.explanation, 500);
  const evidence = Array.isArray(finding?.evidence) ? finding.evidence : [];
  const evidenceExplanation = evidence.find((item: any) => clean(item?.explanation, 500));
  return evidenceExplanation ? clean(evidenceExplanation.explanation, 500) : "Governed evidence produced a Watchdog review finding for this property.";
}

function normalizeFinding(model: any, finding: any, surface: string) {
  const score = Number(finding?.score || 0);
  const confidence = Number(finding?.confidence || 0);
  const evidenceCoverage = Number(finding?.evidence_coverage || 0);
  const band = attentionBand(finding);
  return {
    suggestion_id: `${model.key}:${clean(finding?.facts_hash || finding?.id || finding?.pams_pin || crypto.randomUUID(), 180)}`,
    contract_version: CONTRACT_VERSION,
    surface,
    model_key: model.key,
    model_label: model.label,
    model_version: finding?.model_version || null,
    pams_pin: clean(finding?.pams_pin, 120) || null,
    property_address: clean(finding?.property_address || finding?.address, 300) || null,
    score,
    confidence,
    evidence_coverage: evidenceCoverage,
    limited_evidence: Boolean(finding?.limited_evidence),
    attention_band: band,
    why_now: firstWhy(finding),
    why_now_items: Array.isArray(finding?.why_now) ? finding.why_now : [],
    evidence: Array.isArray(finding?.evidence) ? finding.evidence : [],
    missing_evidence: Array.isArray(finding?.missing_evidence) ? finding.missing_evidence : [],
    property_context: finding?.property_context && typeof finding.property_context === "object" ? finding.property_context : {},
    facts_hash: finding?.facts_hash || null,
    actions: actionSet(model.key),
  };
}

async function callRunner(args: {
  url: string;
  publishable: string;
  auth: string;
  model: any;
  scopeType: string;
  scopeValue: Record<string, unknown>;
  pins: string[];
  limit: number;
}) {
  const body: Record<string, unknown> = {
    model_key: args.model.key,
    scope_type: args.scopeType,
    scope_value: args.scopeValue,
    limit: args.limit,
  };
  if (args.scopeType !== "farm") body.pams_pins = args.pins;

  try {
    const response = await fetch(`${args.url}/functions/v1/${args.model.fn}`, {
      method: "POST",
      headers: {
        Authorization: args.auth,
        apikey: args.publishable,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        model_key: args.model.key,
        status: response.status,
        error: clean(data?.error || data?.detail || `Model runner returned ${response.status}`, 500),
      };
    }
    return { ok: true, model_key: args.model.key, data };
  } catch (error) {
    if (error instanceof Deno.errors.RateLimitError) {
      return {
        ok: false,
        model_key: args.model.key,
        status: 429,
        retry_after_ms: error.retryAfterMs,
        error: "Context Intelligence is temporarily rate limited. Retry shortly.",
      };
    }
    return { ok: false, model_key: args.model.key, status: 503, error: clean(error?.message || "Model runner unavailable", 500) };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return out(req, 405, { error: "POST required" });

  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return out(req, 401, { error: "Sign in required" });

  const url = Deno.env.get("SUPABASE_URL") || "";
  const publishable = env("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
  const secret = env("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !publishable || !secret) return out(req, 503, { error: "Context Intelligence configuration incomplete" });

  const userClient = createClient(url, publishable, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authUser } = await userClient.auth.getUser();
  const user = authUser?.user;
  if (!user) return out(req, 401, { error: "Session invalid" });

  let body: any = {};
  try {
    body = await req.json();
  } catch (_) {
    return out(req, 400, { error: "Invalid JSON" });
  }

  const surface = clean(body?.surface || "unknown", 80) || "unknown";
  const scopeType = clean(body?.scope_type || "custom", 40) || "custom";
  if (!["property", "custom", "farm"].includes(scopeType)) return out(req, 400, { error: "Unsupported context scope" });

  const pins = [...new Set((Array.isArray(body?.pams_pins) ? body.pams_pins : []).map((value: unknown) => clean(value, 120)).filter(Boolean))].slice(0, 100);
  if (scopeType !== "farm" && !pins.length) return out(req, 409, { error: "Context resolved to no governed properties" });

  const [{ data: entitlement }, { data: profile }] = await Promise.all([
    admin.from("account_entitlements").select("plan_tier,subscription_status").eq("user_id", user.id).maybeSingle(),
    admin.from("profiles").select("account_role").eq("id", user.id).maybeSingle(),
  ]);

  const isDeveloper = String(profile?.account_role || "") === "developer";
  const plan = isDeveloper ? "developer" : clean(entitlement?.plan_tier || "standard", 40) || "standard";
  const requested = [...new Set((Array.isArray(body?.models) ? body.models : []).map((value: unknown) => clean(value, 80)).filter(Boolean))];
  const eligible = MODEL_DEFS.filter((model) => {
    if (requested.length && !requested.includes(model.key)) return false;
    return (RANK[plan] ?? 0) >= (RANK[model.minimum_plan] ?? 99);
  });

  if (!eligible.length) {
    return out(req, 200, {
      engine_version: ENGINE,
      contract_version: CONTRACT_VERSION,
      surface,
      plan,
      scope: { type: scopeType, property_count: scopeType === "farm" ? null : pins.length },
      suggestions: [],
      summary: { total: 0, act_now: 0, this_week: 0, watch: 0, adequate_evidence: 0 },
      upgrade: { minimum_plan: "pro", message: "Pro Intelligence is required for proactive property suggestions." },
    });
  }

  const scopeValue = {
    source: "context_intelligence",
    surface,
    context_key: clean(body?.context_key || "", 160) || null,
  };
  const limit = Math.max(1, Math.min(Number(body?.limit || 20), 50));
  const results = await Promise.all(eligible.map((model) => callRunner({ url, publishable, auth, model, scopeType, scopeValue, pins, limit })));

  const suggestions: any[] = [];
  const modelStatus: any[] = [];
  for (const result of results) {
    const model = modelFor(result.model_key);
    if (!model) continue;
    if (!result.ok) {
      modelStatus.push({ model_key: model.key, ok: false, status: result.status, error: result.error, retry_after_ms: result.retry_after_ms || null });
      continue;
    }
    const findings = Array.isArray(result.data?.findings) ? result.data.findings : [];
    for (const finding of findings) suggestions.push(normalizeFinding(model, finding, surface));
    modelStatus.push({
      model_key: model.key,
      ok: true,
      finding_count: findings.length,
      model: result.data?.model || null,
      pipeline_engine: result.data?.pipeline_engine || result.data?.engine_version || null,
    });
  }

  suggestions.sort((a, b) => {
    const evidenceA = a.limited_evidence ? 0 : 1;
    const evidenceB = b.limited_evidence ? 0 : 1;
    if (evidenceA !== evidenceB) return evidenceB - evidenceA;
    if (a.score !== b.score) return b.score - a.score;
    if (a.confidence !== b.confidence) return b.confidence - a.confidence;
    return b.evidence_coverage - a.evidence_coverage;
  });

  const trimmed = suggestions.slice(0, limit);
  const summary = {
    total: trimmed.length,
    act_now: trimmed.filter((item) => item.attention_band === "act_now").length,
    this_week: trimmed.filter((item) => item.attention_band === "this_week").length,
    watch: trimmed.filter((item) => item.attention_band === "watch").length,
    adequate_evidence: trimmed.filter((item) => !item.limited_evidence && Number(item.evidence_coverage || 0) >= 50).length,
  };

  const allRateLimited = results.length > 0 && results.every((item) => !item.ok && item.status === 429);
  if (allRateLimited) {
    const retry = Math.max(...results.map((item: any) => Number(item.retry_after_ms || 0)));
    return out(req, 429, { error: "Context Intelligence is temporarily busy", retry_after_ms: retry || null, engine_version: ENGINE });
  }

  return out(req, 200, {
    engine_version: ENGINE,
    contract_version: CONTRACT_VERSION,
    surface,
    plan,
    scope: { type: scopeType, property_count: scopeType === "farm" ? null : pins.length },
    eligible_models: eligible.map((model) => ({ key: model.key, label: model.label, minimum_plan: model.minimum_plan })),
    model_status: modelStatus,
    summary,
    suggestions: trimmed,
  });
});
