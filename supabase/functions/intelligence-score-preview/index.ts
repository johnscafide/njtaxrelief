import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const ENGINE_VERSION = "watchdog-intelligence-preview-v1";
const ALLOWED_ORIGINS = new Set([
  "https://njpropertytaxrelief.com",
  "https://www.njpropertytaxrelief.com",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);
const PLAN_RANK: Record<string, number> = { standard: 0, agent: 1, pro: 2, pro_plus: 3, teams: 4, developer: 5 };
const SCOPE_TYPES = new Set(["property", "saved", "farm", "workbench_view", "municipality", "county", "custom"]);

type SignalDef = { id: string; role?: string; weight?: number };
type Feature = {
  score?: number;
  value?: unknown;
  status?: string;
  source_key?: string;
  source_url?: string;
  observed_at?: string;
  explanation?: string;
};
type Candidate = { pams_pin?: string; address?: string; features?: Record<string, Feature> };

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
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors(req), "Content-Type": "application/json", "Cache-Control": "private, no-store" },
  });
}
function clean(value: unknown, max = 240) {
  return String(value ?? "").replace(/[<>]/g, "").trim().slice(0, max);
}
function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}
function round(value: number, places = 2) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
function numeric(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function namedEnv(jsonName: string, legacyName: string) {
  const raw = Deno.env.get(jsonName) || "";
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.default) return String(parsed.default);
    } catch (_) {
      // Fall through to the legacy key while Watchdog completes the key migration.
    }
  }
  return Deno.env.get(legacyName) || "";
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)]));
  }
  return value;
}
async function sha256(value: unknown) {
  const data = new TextEncoder().encode(JSON.stringify(canonical(value)));
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function isAvailable(feature: Feature | undefined) {
  if (!feature) return false;
  if (feature.status && feature.status !== "available") return false;
  return numeric(feature.score) !== null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return json(req, 405, { error: "POST required" });

  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return json(req, 401, { error: "Sign in required" });

  const url = Deno.env.get("SUPABASE_URL") || "";
  const publishable = namedEnv("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
  const secret = namedEnv("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !publishable || !secret) return json(req, 503, { error: "Intelligence service configuration incomplete" });

  const userClient = createClient(url, publishable, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  const user = authData?.user;
  if (authError || !user) return json(req, 401, { error: "Session invalid" });

  let body: any;
  try {
    body = await req.json();
  } catch (_) {
    return json(req, 400, { error: "Invalid JSON" });
  }

  const modelKey = clean(body?.model_key, 100);
  const scopeType = clean(body?.scope_type || "custom", 40);
  const scopeValue = body?.scope_value && typeof body.scope_value === "object" ? body.scope_value : {};
  const requestedPrompt = clean(body?.requested_prompt, 1200) || null;
  const requestedLimit = Math.max(1, Math.min(Number(body?.limit || 50), 100));
  const candidates = (Array.isArray(body?.candidates) ? body.candidates : []).slice(0, 250) as Candidate[];
  if (!modelKey) return json(req, 400, { error: "model_key is required" });
  if (!SCOPE_TYPES.has(scopeType)) return json(req, 400, { error: "Unsupported scope_type" });
  if (!candidates.length) return json(req, 400, { error: "At least one candidate is required" });

  const [{ data: entitlement }, { data: profile }, { data: model, error: modelError }] = await Promise.all([
    admin.from("account_entitlements").select("plan_tier,billing_tier,subscription_status").eq("user_id", user.id).maybeSingle(),
    admin.from("profiles").select("account_role").eq("id", user.id).maybeSingle(),
    admin.from("intelligence_models").select("model_key,label,objective,minimum_plan,version,status,calibration_state,signal_config,profession_scope").eq("model_key", modelKey).maybeSingle(),
  ]);
  if (modelError || !model) return json(req, 404, { error: "Intelligence model not found" });
  if (!["preview", "live"].includes(String(model.status))) return json(req, 409, { error: "Intelligence model is not runnable" });

  const plan = String(profile?.account_role || "") === "developer" ? "developer" : String(entitlement?.plan_tier || "standard");
  if ((PLAN_RANK[plan] ?? 0) < (PLAN_RANK[String(model.minimum_plan)] ?? 99)) {
    return json(req, 403, { error: `${model.minimum_plan} plan required`, minimum_plan: model.minimum_plan });
  }

  const config = model.signal_config && typeof model.signal_config === "object" ? model.signal_config : {};
  const signals = (Array.isArray(config.signals) ? config.signals : [])
    .map((signal: any) => ({ id: clean(signal?.id, 140), role: clean(signal?.role || "score", 30), weight: Number(signal?.weight ?? 0) }))
    .filter((signal: SignalDef) => signal.id) as SignalDef[];
  const scoreSignals = signals.filter((signal) => signal.role !== "confidence" && Number(signal.weight) > 0);
  const confidenceSignals = signals.filter((signal) => signal.role === "confidence");
  if (!scoreSignals.length) return json(req, 409, { error: "Model has no deterministic score configuration" });

  const configuredWeight = scoreSignals.reduce((sum, signal) => sum + Number(signal.weight || 0), 0);
  const minimumCoverage = clamp(Number(config.minimum_evidence_coverage ?? 0));
  const recommendedActions = Array.isArray(config.recommended_actions) ? config.recommended_actions.map((x: unknown) => clean(x, 80)).filter(Boolean) : ["review_evidence"];

  const runInsert = await admin.from("intelligence_runs").insert({
    user_id: user.id,
    model_key: model.model_key,
    model_version: model.version,
    scope_type: scopeType,
    scope_value: scopeValue,
    requested_prompt: requestedPrompt,
    status: "running",
    candidate_count: candidates.length,
    engine_version: ENGINE_VERSION,
    started_at: new Date().toISOString(),
  }).select("id").single();
  if (runInsert.error || !runInsert.data?.id) return json(req, 503, { error: "Could not start Intelligence run" });
  const runId = String(runInsert.data.id);

  try {
    const scored: any[] = [];
    for (const candidate of candidates) {
      const features = candidate?.features && typeof candidate.features === "object" ? candidate.features : {};
      let weightedScore = 0;
      let availableWeight = 0;
      const evidence: any[] = [];
      const missingEvidence: any[] = [];
      const contributions: any[] = [];

      for (const signal of scoreSignals) {
        const feature = features[signal.id];
        if (!isAvailable(feature)) {
          missingEvidence.push({ signal_id: signal.id, role: signal.role || "score", weight: signal.weight, reason: clean(feature?.status || "missing", 80) });
          continue;
        }
        const featureScore = clamp(Number(feature!.score));
        const weight = Number(signal.weight || 0);
        const contribution = featureScore * weight;
        availableWeight += weight;
        weightedScore += contribution;
        const item = {
          signal_id: signal.id,
          role: signal.role || "score",
          score: round(featureScore),
          weight: round(weight, 4),
          contribution: round(contribution),
          value: feature?.value ?? null,
          source_key: clean(feature?.source_key, 140) || null,
          source_url: clean(feature?.source_url, 600) || null,
          observed_at: clean(feature?.observed_at, 80) || null,
          explanation: clean(feature?.explanation, 500) || null,
        };
        evidence.push(item);
        contributions.push(item);
      }

      for (const signal of confidenceSignals) {
        const feature = features[signal.id];
        if (!isAvailable(feature)) {
          missingEvidence.push({ signal_id: signal.id, role: "confidence", reason: clean(feature?.status || "missing", 80) });
          continue;
        }
        evidence.push({
          signal_id: signal.id,
          role: "confidence",
          score: round(clamp(Number(feature!.score))),
          value: feature?.value ?? null,
          source_key: clean(feature?.source_key, 140) || null,
          source_url: clean(feature?.source_url, 600) || null,
          observed_at: clean(feature?.observed_at, 80) || null,
          explanation: clean(feature?.explanation, 500) || null,
        });
      }

      if (availableWeight <= 0) continue;
      const score = clamp(weightedScore / availableWeight);
      const evidenceCoverage = configuredWeight > 0 ? clamp((availableWeight / configuredWeight) * 100) : 0;
      const confidenceValues = confidenceSignals.map((signal) => features[signal.id]).filter(isAvailable).map((feature) => clamp(Number(feature!.score)));
      const confidenceSignalMean = confidenceValues.length ? confidenceValues.reduce((a, b) => a + b, 0) / confidenceValues.length : null;
      let confidence = confidenceSignalMean === null ? evidenceCoverage : evidenceCoverage * 0.7 + confidenceSignalMean * 0.3;
      const limitedEvidence = evidenceCoverage < minimumCoverage;
      if (limitedEvidence) confidence = Math.min(confidence, 49);
      confidence = clamp(confidence);

      const factPayload = {
        model_key: model.model_key,
        model_version: model.version,
        candidate: { pams_pin: clean(candidate?.pams_pin, 100) || null, address: clean(candidate?.address, 300) || null },
        evidence: evidence.map((item) => ({ signal_id: item.signal_id, score: item.score, value: item.value, source_key: item.source_key, observed_at: item.observed_at })),
        missing_evidence: missingEvidence,
      };
      const factsHash = await sha256(factPayload);
      const whyNow = contributions.sort((a, b) => b.contribution - a.contribution).slice(0, 3).map((item) => ({
        signal_id: item.signal_id,
        score: item.score,
        weight: item.weight,
        contribution: item.contribution,
        value: item.value,
        explanation: item.explanation,
      }));

      scored.push({
        user_id: user.id,
        pams_pin: clean(candidate?.pams_pin, 100) || null,
        property_address: clean(candidate?.address, 300) || null,
        opportunity_type: String(model.objective || model.model_key),
        score: round(score),
        confidence: round(confidence),
        evidence_coverage: round(evidenceCoverage),
        potential_impact: {},
        why_now: whyNow,
        evidence,
        missing_evidence: missingEvidence,
        recommended_actions: recommendedActions,
        narrative: null,
        narrative_status: "not_requested",
        facts_hash: factsHash,
        limited_evidence: limitedEvidence,
      });
    }

    scored.sort((a, b) => b.score - a.score || b.confidence - a.confidence || String(a.pams_pin || a.property_address || "").localeCompare(String(b.pams_pin || b.property_address || "")));
    const findings = scored.slice(0, requestedLimit).map((item, index) => ({
      run_id: runId,
      user_id: item.user_id,
      pams_pin: item.pams_pin,
      property_address: item.property_address,
      opportunity_type: item.opportunity_type,
      rank: index + 1,
      score: item.score,
      confidence: item.confidence,
      evidence_coverage: item.evidence_coverage,
      potential_impact: item.potential_impact,
      why_now: item.why_now,
      evidence: item.evidence,
      missing_evidence: item.missing_evidence,
      recommended_actions: item.recommended_actions,
      narrative: item.narrative,
      narrative_status: item.narrative_status,
      facts_hash: item.facts_hash,
    }));

    if (findings.length) {
      const insertFindings = await admin.from("intelligence_findings").insert(findings);
      if (insertFindings.error) throw insertFindings.error;
    }
    const runFactsHash = await sha256({ model_key: model.model_key, model_version: model.version, scope_type: scopeType, scope_value: scopeValue, candidate_hashes: scored.map((item) => item.facts_hash) });
    await admin.from("intelligence_runs").update({
      status: "complete",
      finding_count: findings.length,
      facts_hash: runFactsHash,
      completed_at: new Date().toISOString(),
    }).eq("id", runId);

    return json(req, 200, {
      ok: true,
      run_id: runId,
      engine_version: ENGINE_VERSION,
      model: {
        key: model.model_key,
        label: model.label,
        version: model.version,
        status: model.status,
        calibration_state: model.calibration_state,
        validated: model.calibration_state === "calibrated" && model.status === "live",
      },
      candidate_count: candidates.length,
      scored_count: scored.length,
      finding_count: findings.length,
      minimum_evidence_coverage: minimumCoverage,
      findings: findings.map((finding, index) => ({
        ...finding,
        limited_evidence: scored[index]?.limited_evidence ?? false,
      })),
      warning: model.calibration_state === "calibrated" ? null : "Preview model: deterministic output is not yet calibrated or predictive.",
    });
  } catch (error) {
    await admin.from("intelligence_runs").update({
      status: "failed",
      error_code: "preview_score_failed",
      completed_at: new Date().toISOString(),
    }).eq("id", runId);
    console.error("intelligence-score-preview", error);
    return json(req, 500, { error: "Intelligence preview run failed", run_id: runId });
  }
});
