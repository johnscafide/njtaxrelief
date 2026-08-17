import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const VERSION = "watchdog-learning-v2";
const ORIGINS = new Set([
  "https://njpropertytaxrelief.com",
  "https://www.njpropertytaxrelief.com",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);
const PLAN_RANK: Record<string, number> = {
  standard: 0, agent: 1, pro: 2, pro_plus: 3, teams: 4, developer: 5,
};
const OUTCOMES = new Set(["reviewed", "useful", "not_relevant", "contacted", "appointment", "client", "under_contract", "closed", "dismissed"]);
const EVENT_WEIGHT: Record<string, number> = {
  useful: 0.5,
  contacted: 0.6,
  appointment: 1.0,
  client: 1.25,
  under_contract: 1.5,
  closed: 2.0,
  not_relevant: -1.0,
  dismissed: -1.0,
};
const MINIMUM_DISTINCT_FINDINGS = 8;

type AnyObject = Record<string, any>;

function cors(req: Request) {
  const origin = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": ORIGINS.has(origin) ? origin : "https://njpropertytaxrelief.com",
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
function clean(value: unknown, max = 300) {
  return String(value ?? "").replace(/[<>]/g, "").trim().slice(0, max);
}
function numeric(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function namedEnv(jsonName: string, legacyName: string) {
  const raw = Deno.env.get(jsonName) || "";
  if (raw) {
    try { const parsed = JSON.parse(raw); if (parsed?.default) return String(parsed.default); } catch { /* fall through */ }
  }
  return Deno.env.get(legacyName) || "";
}
function validateAssumptions(value: AnyObject) {
  const source = value && typeof value === "object" ? value : {};
  const transaction = numeric(source.estimated_transaction_value_cents);
  const rate = numeric(source.fee_rate_percent);
  const probability = numeric(source.conversion_probability_percent);
  const cost = numeric(source.cost_cents);
  const fixed = numeric(source.fixed_value_cents);
  if (transaction !== null && (transaction < 0 || transaction > 100000000000)) throw new Error("Estimated transaction value is outside the supported range.");
  if (rate !== null && (rate < 0 || rate > 100)) throw new Error("Fee or value rate must be between 0 and 100 percent.");
  if (probability !== null && (probability < 0 || probability > 100)) throw new Error("Conversion probability must be between 0 and 100 percent.");
  if (cost !== null && (cost < 0 || cost > 10000000000)) throw new Error("Cost assumption is outside the supported range.");
  if (fixed !== null && (fixed < 0 || fixed > 100000000000)) throw new Error("Fixed opportunity value is outside the supported range.");
  return {
    estimated_transaction_value_cents: transaction,
    fee_rate_percent: rate,
    conversion_probability_percent: probability,
    cost_cents: cost,
    fixed_value_cents: fixed,
  };
}
function scenario(assumptions: AnyObject) {
  const transaction = numeric(assumptions?.estimated_transaction_value_cents);
  const rate = numeric(assumptions?.fee_rate_percent);
  const probability = numeric(assumptions?.conversion_probability_percent);
  const cost = Math.max(0, numeric(assumptions?.cost_cents) || 0);
  const fixed = numeric(assumptions?.fixed_value_cents);
  let gross: number | null = null;
  if (fixed !== null) gross = Math.max(0, fixed);
  else if (transaction !== null && rate !== null) gross = Math.max(0, transaction * (rate / 100));
  const raw = gross === null ? null : Math.max(0, Math.round(gross - cost));
  const adjusted = raw === null || probability === null ? null : Math.max(0, Math.round(raw * (probability / 100)));
  return {
    gross_value_cents: gross === null ? null : Math.round(gross),
    raw_scenario_value_cents: raw,
    probability_adjusted_value_cents: adjusted,
    calculation_version: "opportunity-value-v1",
    labels: {
      estimated_transaction_value: "User assumption",
      fee_rate: "User assumption",
      conversion_probability: "User assumption",
      cost: "User assumption",
      watchdog_score: "Governed finding",
      scenario_value: "Scenario math, not predicted revenue",
    },
  };
}
function signalIds(finding: AnyObject) {
  return [...new Set((Array.isArray(finding?.evidence) ? finding.evidence : []).map((item: AnyObject) => clean(item?.signal_id, 140)).filter(Boolean))];
}

async function rebuildProfile(admin: any, userId: string, profession: string, objective: string) {
  const existing = await admin.from("intelligence_preference_profiles").select("reset_at").eq("user_id", userId).eq("profession", profession).eq("objective", objective).maybeSingle();
  const resetAt = existing.data?.reset_at || null;
  let query = admin.from("intelligence_outcome_events").select("finding_id,event_type,signal_snapshot,metadata,occurred_at").eq("user_id", userId).order("occurred_at", { ascending: true }).limit(1000);
  if (resetAt) query = query.gt("occurred_at", resetAt);
  const { data, error } = await query;
  if (error) throw error;

  const grouped = new Map<string, { weight: number; signals: string[] }>();
  for (const row of data || []) {
    if (String(row?.metadata?.profession || "general") !== profession) continue;
    if (String(row?.metadata?.objective || "general") !== objective) continue;
    const weight = EVENT_WEIGHT[String(row.event_type)] || 0;
    if (!weight) continue;
    const key = String(row.finding_id || "");
    if (!key) continue;
    const current = grouped.get(key) || { weight: 0, signals: [] };
    current.weight = Math.max(-2, Math.min(2, current.weight + weight));
    current.signals = [...new Set([...current.signals, ...(Array.isArray(row.signal_snapshot) ? row.signal_snapshot.map((item: AnyObject) => clean(item?.signal_id, 140)).filter(Boolean) : [])])];
    grouped.set(key, current);
  }

  const totals: Record<string, { n: number; sum: number }> = {};
  let positive = 0;
  let negative = 0;
  for (const example of grouped.values()) {
    if (example.weight > 0) positive += 1;
    if (example.weight < 0) negative += 1;
    for (const id of example.signals) {
      totals[id] = totals[id] || { n: 0, sum: 0 };
      totals[id].n += 1;
      totals[id].sum += example.weight;
    }
  }
  const sampleSize = grouped.size;
  const learnedWeights: Record<string, number> = {};
  if (sampleSize >= MINIMUM_DISTINCT_FINDINGS) {
    for (const [id, total] of Object.entries(totals)) {
      if (total.n < 3) continue;
      const average = total.sum / total.n;
      learnedWeights[id] = Math.max(0.85, Math.min(1.15, Math.round((1 + average * 0.08) * 1000) / 1000));
    }
  }
  const status = sampleSize >= MINIMUM_DISTINCT_FINDINGS ? "active" : sampleSize ? "learning" : (resetAt ? "reset" : "cold_start");
  const payload = {
    user_id: userId,
    profession,
    objective,
    status,
    sample_size: sampleSize,
    positive_count: positive,
    negative_count: negative,
    default_weights: { default_multiplier: 1 },
    learned_weights: learnedWeights,
    minimum_evidence: MINIMUM_DISTINCT_FINDINGS,
    reset_at: resetAt,
    last_rebuilt_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const saved = await admin.from("intelligence_preference_profiles").upsert(payload, { onConflict: "user_id,profession,objective" });
  if (saved.error) throw saved.error;
  return payload;
}
function personalizedPriority(finding: AnyObject, profile: AnyObject) {
  if (!profile || profile.status !== "active") {
    return {
      score: Number(finding.score || 0),
      personalized: false,
      reason: `Transparent default: ${Number(profile?.sample_size || 0)} of ${Number(profile?.minimum_evidence || MINIMUM_DISTINCT_FINDINGS)} distinct finding examples recorded.`,
    };
  }
  const weights = profile.learned_weights || {};
  const matched = signalIds(finding).map((id) => numeric(weights[id])).filter((value): value is number => value !== null);
  const multiplier = matched.length ? matched.reduce((a, b) => a + b, 0) / matched.length : 1;
  return {
    score: Math.max(0, Math.min(100, Math.round(Number(finding.score || 0) * multiplier * 10) / 10)),
    personalized: matched.length > 0,
    multiplier: Math.round(multiplier * 1000) / 1000,
    reason: matched.length ? `Attention priority adjusted from ${matched.length} learned governed-signal preference${matched.length === 1 ? "" : "s"}.` : "No learned preference matched this finding. The governed score remains the attention priority.",
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return json(req, 405, { error: "POST required" });
  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return json(req, 401, { error: "Sign in required" });

  const url = Deno.env.get("SUPABASE_URL") || "";
  const publishable = namedEnv("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
  const secret = namedEnv("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !publishable || !secret) return json(req, 503, { error: "Learning service configuration incomplete" });
  const userClient = createClient(url, publishable, { global: { headers: { Authorization: auth } }, auth: { persistSession: false, autoRefreshToken: false } });
  const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData } = await userClient.auth.getUser();
  const user = authData?.user;
  if (!user) return json(req, 401, { error: "Session invalid" });

  let body: AnyObject = {};
  try { body = await req.json(); } catch { return json(req, 400, { error: "Invalid JSON" }); }
  const [{ data: entitlement }, { data: profile }] = await Promise.all([
    admin.from("account_entitlements").select("plan_tier,profession").eq("user_id", user.id).maybeSingle(),
    admin.from("profiles").select("account_role").eq("id", user.id).maybeSingle(),
  ]);
  const plan = String(profile?.account_role || "") === "developer" ? "developer" : String(entitlement?.plan_tier || "standard");
  if ((PLAN_RANK[plan] ?? 0) < PLAN_RANK.pro) return json(req, 403, { error: "Pro plan required", minimum_plan: "pro" });

  const action = clean(body.action || "state", 40);
  const profession = clean(body.profession || entitlement?.profession || "general", 80) || "general";
  const objective = clean(body.objective || "general", 120) || "general";

  if (action === "save_assumptions") {
    let assumptions: AnyObject;
    try { assumptions = validateAssumptions(body.assumptions); } catch (error) { return json(req, 400, { error: clean((error as any)?.message || error, 300) }); }
    const saved = await admin.from("intelligence_assumptions").upsert({ user_id: user.id, objective, profession, assumptions, updated_at: new Date().toISOString() }, { onConflict: "user_id,objective" }).select("user_id,objective,profession,assumptions,updated_at").single();
    if (saved.error) return json(req, 503, { error: "Could not save scenario assumptions" });
    return json(req, 200, { ok: true, assumptions: saved.data, scenario: scenario(assumptions), warning: "Scenario math is user-controlled. It is not predicted or guaranteed revenue." });
  }

  if (action === "reset_profile") {
    const now = new Date().toISOString();
    const payload = { user_id: user.id, profession, objective, status: "reset", sample_size: 0, positive_count: 0, negative_count: 0, default_weights: { default_multiplier: 1 }, learned_weights: {}, minimum_evidence: MINIMUM_DISTINCT_FINDINGS, reset_at: now, last_rebuilt_at: now, updated_at: now };
    const saved = await admin.from("intelligence_preference_profiles").upsert(payload, { onConflict: "user_id,profession,objective" });
    if (saved.error) return json(req, 503, { error: "Could not reset the learned attention profile" });
    return json(req, 200, { ok: true, profile: payload, warning: "Reset starts a new learning window. Historical findings and outcomes remain unchanged for auditability." });
  }

  if (action === "record") {
    const findingId = clean(body.finding_id, 80);
    const eventType = clean(body.event_type, 40);
    if (!findingId || !OUTCOMES.has(eventType)) return json(req, 400, { error: "A valid finding_id and feedback or outcome event_type are required" });
    const findingQuery = await admin.from("intelligence_findings").select("id,run_id,user_id,pams_pin,property_address,opportunity_type,score,confidence,evidence_coverage,evidence,facts_hash,created_at").eq("id", findingId).eq("user_id", user.id).maybeSingle();
    const finding = findingQuery.data;
    if (findingQuery.error || !finding) return json(req, 404, { error: "Owned Intelligence finding not found" });
    const [assumptionQuery, runQuery, existingFeedback] = await Promise.all([
      admin.from("intelligence_assumptions").select("assumptions").eq("user_id", user.id).eq("objective", objective).maybeSingle(),
      admin.from("intelligence_runs").select("model_key,model_version").eq("id", finding.run_id).eq("user_id", user.id).maybeSingle(),
      admin.from("intelligence_feedback").select("feedback,outcome").eq("finding_id", finding.id).eq("user_id", user.id).maybeSingle(),
    ]);
    const assumptions = assumptionQuery.data?.assumptions || {};
    const currentScenario = scenario(assumptions);
    const lineage = {
      model_key: runQuery.data?.model_key || finding.opportunity_type || "unknown",
      model_version: Number(runQuery.data?.model_version || 1),
      signals: Array.isArray(finding.evidence) ? finding.evidence : [],
    };
    const feedbackPayload: AnyObject = {
      finding_id: finding.id,
      user_id: user.id,
      feedback: existingFeedback.data?.feedback || null,
      outcome: existingFeedback.data?.outcome || null,
      reason_code: clean(body.reason_code, 80) || null,
      notes: clean(body.notes, 500) || null,
      model_key: lineage.model_key,
      model_version: lineage.model_version,
      facts_hash: finding.facts_hash,
      signal_snapshot: lineage.signals,
      assumption_snapshot: assumptions,
      updated_at: new Date().toISOString(),
    };
    if (eventType === "useful" || eventType === "not_relevant") feedbackPayload.feedback = eventType;
    else feedbackPayload.outcome = eventType;
    const feedbackSaved = await admin.from("intelligence_feedback").upsert(feedbackPayload, { onConflict: "finding_id,user_id" });
    if (feedbackSaved.error) return json(req, 503, { error: "Could not save Intelligence feedback" });

    const event = await admin.from("intelligence_outcome_events").insert({
      finding_id: finding.id,
      run_id: finding.run_id,
      user_id: user.id,
      event_type: eventType,
      reason_code: clean(body.reason_code, 80) || null,
      notes: clean(body.notes, 500) || null,
      revenue_cents: numeric(body.revenue_cents),
      model_key: lineage.model_key,
      model_version: lineage.model_version,
      facts_hash: finding.facts_hash,
      signal_snapshot: lineage.signals,
      assumption_snapshot: assumptions,
      scenario_snapshot: currentScenario,
      metadata: { source: "intelligence_learning", profession, objective, version: VERSION },
    }).select("id").single();
    if (event.error) return json(req, 503, { error: "Could not record Intelligence outcome" });
    const rebuilt = await rebuildProfile(admin, user.id, profession, objective);
    return json(req, 200, { ok: true, event_id: event.data.id, profile: rebuilt, scenario: currentScenario, warning: "Feedback changes future attention ranking only. It never rewrites source facts, governed metrics, or historical findings." });
  }

  if (action === "value") {
    const findingId = clean(body.finding_id, 80);
    const findingQuery = await admin.from("intelligence_findings").select("id,user_id,pams_pin,property_address,score,confidence,evidence_coverage,facts_hash").eq("id", findingId).eq("user_id", user.id).maybeSingle();
    const finding = findingQuery.data;
    if (findingQuery.error || !finding) return json(req, 404, { error: "Owned Intelligence finding not found" });
    const assumptionQuery = await admin.from("intelligence_assumptions").select("assumptions,profession").eq("user_id", user.id).eq("objective", objective).maybeSingle();
    const assumptions = assumptionQuery.data?.assumptions || {};
    const currentScenario = scenario(assumptions);
    if (currentScenario.raw_scenario_value_cents === null) return json(req, 409, { error: "Save a transaction value plus fee or rate, or a fixed opportunity value, before calculating Opportunity Value.", scenario: currentScenario });
    if (currentScenario.probability_adjusted_value_cents === null) return json(req, 409, { error: "Enter your own conversion probability before saving a probability-adjusted Opportunity Value snapshot.", scenario: currentScenario });
    const inserted = await admin.from("intelligence_value_snapshots").insert({
      finding_id: finding.id,
      user_id: user.id,
      objective,
      profession,
      factual_context: { pams_pin: finding.pams_pin, property_address: finding.property_address, watchdog_score: finding.score, confidence: finding.confidence, evidence_coverage: finding.evidence_coverage, facts_hash: finding.facts_hash },
      assumption_snapshot: assumptions,
      raw_scenario_value_cents: currentScenario.raw_scenario_value_cents,
      probability_adjusted_value_cents: currentScenario.probability_adjusted_value_cents,
      calculation_version: currentScenario.calculation_version,
    }).select("id").single();
    if (inserted.error) return json(req, 503, { error: "Could not save Opportunity Value snapshot" });
    return json(req, 200, { ok: true, snapshot_id: inserted.data.id, factual_context: { watchdog_score: finding.score, confidence: finding.confidence, evidence_coverage: finding.evidence_coverage }, assumptions, scenario: currentScenario, warning: "Opportunity Value is scenario math under your assumptions. It is not predicted or guaranteed revenue." });
  }

  const assumptionQuery = await admin.from("intelligence_assumptions").select("objective,profession,assumptions,updated_at").eq("user_id", user.id).eq("objective", objective).maybeSingle();
  let profileQuery = await admin.from("intelligence_preference_profiles").select("user_id,profession,objective,status,sample_size,positive_count,negative_count,default_weights,learned_weights,minimum_evidence,reset_at,last_rebuilt_at,updated_at").eq("user_id", user.id).eq("profession", profession).eq("objective", objective).maybeSingle();
  if (!profileQuery.data) profileQuery = { ...profileQuery, data: await rebuildProfile(admin, user.id, profession, objective) } as any;
  const requestedIds = Array.isArray(body.finding_ids) ? body.finding_ids.map((x: unknown) => clean(x, 80)).filter(Boolean).slice(0, 100) : [];
  let findingQuery = admin.from("intelligence_findings").select("id,run_id,pams_pin,property_address,opportunity_type,score,confidence,evidence_coverage,evidence,facts_hash,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(requestedIds.length ? 100 : 30);
  if (requestedIds.length) findingQuery = findingQuery.in("id", requestedIds);
  const findingsResult = await findingQuery;
  const assumptions = assumptionQuery.data?.assumptions || {};
  const currentScenario = scenario(assumptions);
  const findings = (findingsResult.data || []).map((finding: AnyObject) => ({
    ...finding,
    personalized_priority: personalizedPriority(finding, profileQuery.data),
    scenario: currentScenario,
  })).sort((a: AnyObject, b: AnyObject) => Number(b.personalized_priority.score) - Number(a.personalized_priority.score) || Number(b.score) - Number(a.score));

  return json(req, 200, {
    ok: true,
    version: VERSION,
    plan,
    profession,
    objective,
    assumptions: assumptionQuery.data || { objective, profession, assumptions: {} },
    profile: profileQuery.data,
    findings,
    warning: "Personalization only reorders attention priority. Watchdog scores, source facts, derived metrics, and historical findings remain unchanged.",
  });
});
