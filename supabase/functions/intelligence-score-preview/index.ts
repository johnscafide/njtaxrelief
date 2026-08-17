import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const ENGINE_VERSION = "watchdog-intelligence-preview-v2";
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
  normalization?: {
    feature_version?: number;
    transform_type?: string;
    direction?: string;
    detail?: Record<string, unknown>;
  } | null;
  cohort?: Record<string, unknown> | null;
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
      // Fall through to legacy keys while the platform key migration is completed.
    }
  }
  return Deno.env.get(legacyName) || "";
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonical(v)]),
    );
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
function safeObject(value: unknown, maxBytes = 8000): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  try {
    const text = JSON.stringify(value);
    if (text.length > maxBytes) return {};
    return value as Record<string, unknown>;
  } catch (_) {
    return {};
  }
}
function provenance(feature: Feature | undefined) {
  const normalization = feature?.normalization && typeof feature.normalization === "object"
    ? {
        feature_version: numeric(feature.normalization.feature_version),
        transform_type: clean(feature.normalization.transform_type, 100) || null,
        direction: clean(feature.normalization.direction, 80) || null,
        detail: safeObject(feature.normalization.detail, 4000),
      }
    : null;
  const cohort = feature?.cohort && typeof feature.cohort === "object"
    ? safeObject(feature.cohort, 6000)
    : null;
  return { normalization, cohort };
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

  if (Array.isArray(body?.candidates)) {
    return json(req, 400, { error: "Direct candidate scoring is disabled. A trusted evidence_batch_id is required." });
  }

  const evidenceBatchId = clean(body?.evidence_batch_id, 80);
  const requestedLimit = Math.max(1, Math.min(Number(body?.limit || 50), 100));
  if (!evidenceBatchId) return json(req, 400, { error: "evidence_batch_id is required" });

  const { data: batch, error: batchError } = await admin
    .from("intelligence_evidence_batches")
    .select("id,user_id,model_key,model_version,source_kind,source_manifest,normalization_manifest,cohort_manifest,candidates,facts_hash,candidate_count,expires_at,consumed_at")
    .eq("id", evidenceBatchId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (batchError || !batch) return json(req, 404, { error: "Trusted evidence batch not found" });
  if (batch.consumed_at) return json(req, 409, { error: "Trusted evidence batch has already been consumed" });
  if (new Date(String(batch.expires_at)).getTime() <= Date.now()) return json(req, 409, { error: "Trusted evidence batch expired" });

  const candidates = (Array.isArray(batch.candidates) ? batch.candidates : []).slice(0, 250) as Candidate[];
  if (!candidates.length || Number(batch.candidate_count || 0) !== candidates.length) {
    return json(req, 409, { error: "Trusted evidence batch candidate manifest is invalid" });
  }

  const batchPayload = {
    model_key: batch.model_key,
    model_version: batch.model_version,
    source_kind: batch.source_kind,
    source_manifest: batch.source_manifest || {},
    normalization_manifest: batch.normalization_manifest || {},
    cohort_manifest: batch.cohort_manifest || {},
    candidates,
  };
  const recomputedBatchHash = await sha256(batchPayload);
  if (recomputedBatchHash !== String(batch.facts_hash || "")) {
    return json(req, 409, { error: "Trusted evidence batch failed integrity verification" });
  }

  const [{ data: entitlement }, { data: profile }, { data: model, error: modelError }] = await Promise.all([
    admin.from("account_entitlements").select("plan_tier,billing_tier,subscription_status").eq("user_id", user.id).maybeSingle(),
    admin.from("profiles").select("account_role").eq("id", user.id).maybeSingle(),
    admin.from("intelligence_model_versions")
      .select("model_key,label,objective,minimum_plan,version,status,calibration_state,signal_config,profession_scope")
      .eq("model_key", batch.model_key)
      .eq("version", batch.model_version)
      .maybeSingle(),
  ]);
  if (modelError || !model) return json(req, 404, { error: "Intelligence model version not found" });
  if (!["preview", "live"].includes(String(model.status))) return json(req, 409, { error: "Intelligence model version is not runnable" });

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
  const recommendedActions = Array.isArray(config.recommended_actions)
    ? config.recommended_actions.map((x: unknown) => clean(x, 80)).filter(Boolean)
    : ["review_evidence"];

  const sourceManifest = safeObject(batch.source_manifest, 50000);
  const normalizationManifest = safeObject(batch.normalization_manifest, 50000);
  const cohortManifest = safeObject(batch.cohort_manifest, 50000);
  const sourceScopeType = clean(sourceManifest.scope_type || body?.scope_type || "custom", 40);
  const scopeType = SCOPE_TYPES.has(sourceScopeType) ? sourceScopeType : "custom";
  const scopeValue = safeObject(sourceManifest.scope_value || body?.scope_value, 20000);
  const requestedPrompt = clean(body?.requested_prompt, 1200) || null;

  const runInsert = await admin.from("intelligence_runs").insert({
    user_id: user.id,
    model_key: model.model_key,
    model_version: model.version,
    evidence_batch_id: batch.id,
    scope_type: scopeType,
    scope_value: scopeValue,
    requested_prompt: requestedPrompt,
    status: "running",
    candidate_count: candidates.length,
    engine_version: ENGINE_VERSION,
    normalization_manifest: normalizationManifest,
    cohort_manifest: cohortManifest,
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
          const p = provenance(feature);
          missingEvidence.push({
            signal_id: signal.id,
            role: signal.role || "score",
            weight: signal.weight,
            reason: clean(feature?.status || "missing", 80),
            normalization: p.normalization,
            cohort: p.cohort,
          });
          continue;
        }
        const featureScore = clamp(Number(feature!.score));
        const weight = Number(signal.weight || 0);
        const contribution = featureScore * weight;
        availableWeight += weight;
        weightedScore += contribution;
        const p = provenance(feature);
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
          normalization: p.normalization,
          cohort: p.cohort,
        };
        evidence.push(item);
        contributions.push(item);
      }

      for (const signal of confidenceSignals) {
        const feature = features[signal.id];
        if (!isAvailable(feature)) {
          const p = provenance(feature);
          missingEvidence.push({
            signal_id: signal.id,
            role: "confidence",
            reason: clean(feature?.status || "missing", 80),
            normalization: p.normalization,
            cohort: p.cohort,
          });
          continue;
        }
        const p = provenance(feature);
        evidence.push({
          signal_id: signal.id,
          role: "confidence",
          score: round(clamp(Number(feature!.score))),
          value: feature?.value ?? null,
          source_key: clean(feature?.source_key, 140) || null,
          source_url: clean(feature?.source_url, 600) || null,
          observed_at: clean(feature?.observed_at, 80) || null,
          explanation: clean(feature?.explanation, 500) || null,
          normalization: p.normalization,
          cohort: p.cohort,
        });
      }

      if (availableWeight <= 0) continue;
      const score = clamp(weightedScore / availableWeight);
      const evidenceCoverage = configuredWeight > 0 ? clamp((availableWeight / configuredWeight) * 100) : 0;
      const confidenceValues = confidenceSignals
        .map((signal) => features[signal.id])
        .filter(isAvailable)
        .map((feature) => clamp(Number(feature!.score)));
      const confidenceSignalMean = confidenceValues.length
        ? confidenceValues.reduce((a, b) => a + b, 0) / confidenceValues.length
        : null;
      let confidence = confidenceSignalMean === null
        ? evidenceCoverage
        : evidenceCoverage * 0.7 + confidenceSignalMean * 0.3;
      const limitedEvidence = evidenceCoverage < minimumCoverage;
      if (limitedEvidence) confidence = Math.min(confidence, 49);
      confidence = clamp(confidence);

      const factPayload = {
        model_key: model.model_key,
        model_version: model.version,
        evidence_batch_hash: batch.facts_hash,
        candidate: {
          pams_pin: clean(candidate?.pams_pin, 100) || null,
          address: clean(candidate?.address, 300) || null,
        },
        evidence: evidence.map((item) => ({
          signal_id: item.signal_id,
          score: item.score,
          value: item.value,
          source_key: item.source_key,
          observed_at: item.observed_at,
          normalization: item.normalization,
          cohort: item.cohort,
        })),
        missing_evidence: missingEvidence,
      };
      const factsHash = await sha256(factPayload);
      const whyNow = contributions
        .sort((a, b) => b.contribution - a.contribution)
        .slice(0, 3)
        .map((item) => ({
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

    scored.sort((a, b) =>
      b.score - a.score ||
      b.confidence - a.confidence ||
      String(a.pams_pin || a.property_address || "").localeCompare(String(b.pams_pin || b.property_address || ""))
    );

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

    const runFactsHash = await sha256({
      model_key: model.model_key,
      model_version: model.version,
      evidence_batch_hash: batch.facts_hash,
      scope_type: scopeType,
      scope_value: scopeValue,
      candidate_hashes: scored.map((item) => item.facts_hash),
    });

    const completedAt = new Date().toISOString();
    const [runUpdate, batchUpdate] = await Promise.all([
      admin.from("intelligence_runs").update({
        status: "complete",
        finding_count: findings.length,
        facts_hash: runFactsHash,
        completed_at: completedAt,
      }).eq("id", runId),
      admin.from("intelligence_evidence_batches").update({ consumed_at: completedAt }).eq("id", batch.id).is("consumed_at", null),
    ]);
    if (runUpdate.error) throw runUpdate.error;
    if (batchUpdate.error) throw batchUpdate.error;

    return json(req, 200, {
      ok: true,
      run_id: runId,
      evidence_batch_id: batch.id,
      evidence_batch_hash: batch.facts_hash,
      engine_version: ENGINE_VERSION,
      model: {
        key: model.model_key,
        label: model.label,
        version: model.version,
        status: model.status,
        calibration_state: model.calibration_state,
        validated: model.calibration_state === "calibrated" && model.status === "live",
      },
      source_kind: batch.source_kind,
      candidate_count: candidates.length,
      scored_count: scored.length,
      finding_count: findings.length,
      minimum_evidence_coverage: minimumCoverage,
      findings: findings.map((finding, index) => ({
        ...finding,
        limited_evidence: scored[index]?.limited_evidence ?? false,
      })),
      warning: model.calibration_state === "calibrated"
        ? null
        : "Preview model: deterministic output is not yet calibrated or predictive.",
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
