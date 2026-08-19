import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const ENGINE = "watchdog-closing-fresh-holdout-seed-v1";
const ORIGINS = new Set([
  "https://njpropertytaxrelief.com",
  "https://www.njpropertytaxrelief.com",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);
const clean = (v: unknown, n = 180) => String(v ?? "").replace(/[<>]/g, "").trim().slice(0, n);
const numeric = (v: unknown) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const clamp = (v: number, a = 0, b = 100) => Math.max(a, Math.min(b, v));
const round = (v: number, d = 2) => Number(v.toFixed(d));
const cors = (r: Request) => ({
  "Access-Control-Allow-Origin": ORIGINS.has(r.headers.get("origin") || "") ? (r.headers.get("origin") || "") : "https://njpropertytaxrelief.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
});
const out = (r: Request, s: number, p: unknown) => new Response(JSON.stringify(p), {
  status: s,
  headers: { ...cors(r), "Content-Type": "application/json", "Cache-Control": "private, no-store" },
});
const env = (jsonName: string, legacyName: string) => {
  const raw = Deno.env.get(jsonName) || "";
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.default) return String(parsed.default);
    } catch {}
  }
  return Deno.env.get(legacyName) || "";
};
function transform(def: any, raw: unknown) {
  const cfg = def?.config || {}, type = String(def?.transform_type || "");
  if (type === "identity_0_100") { const n = numeric(raw); return n === null ? null : clamp(n); }
  if (type === "inverse_0_100") { const n = numeric(raw); return n === null ? null : clamp(100 - clamp(n)); }
  if (type === "count_cap") { const n = numeric(raw), cap = Math.max(Number(cfg.cap || 1), 1); return n === null ? null : clamp(Math.max(0, n) / cap * 100); }
  if (type === "categorical_map") { const key = clean(raw, 80).toLowerCase(), n = numeric(cfg[key]); return n === null ? null : clamp(n); }
  if (type === "recency_decay") {
    const d = new Date(String(raw || ""));
    if (!Number.isFinite(d.getTime()) || d.getTime() > Date.now() + 300000) return null;
    const days = Math.max(0, (Date.now() - d.getTime()) / 86400000);
    const points = Array.isArray(cfg.breakpoints) ? cfg.breakpoints.slice().sort((a: any, b: any) => Number(a.days) - Number(b.days)) : [];
    const hit = points.find((p: any) => days <= Number(p.days));
    return clamp(Number(hit ? hit.score : (cfg.older_score ?? 0)));
  }
  if (type === "distance_from_target") {
    const n = numeric(raw);
    if (n === null) return null;
    const target = Number(cfg.target ?? 0), delta = Math.max(Number(cfg.full_attention_delta || 1), 0.000001);
    return clamp(Math.abs(n - target) / delta * 100);
  }
  return null;
}
function stableRank(v: string) {
  let h = 2166136261;
  for (let i = 0; i < v.length; i++) { h ^= v.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function pickDiverse(pool: any[], count: number, seed: string) {
  const sorted = pool.slice().sort((a, b) => stableRank(seed + "|" + a.pin) - stableRank(seed + "|" + b.pin));
  const picked: any[] = [], seenCounties = new Set<string>();
  for (const row of sorted) {
    const county = clean(row.county || "UNKNOWN", 80);
    if (seenCounties.has(county)) continue;
    picked.push(row); seenCounties.add(county);
    if (picked.length >= count) return picked;
  }
  const pickedPins = new Set(picked.map(x => x.pin));
  for (const row of sorted) {
    if (pickedPins.has(row.pin)) continue;
    picked.push(row);
    if (picked.length >= count) break;
  }
  return picked;
}
async function sha256(v: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(v));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return out(req, 405, { error: "POST required" });

  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return out(req, 401, { error: "Sign in required" });
  const url = Deno.env.get("SUPABASE_URL") || "";
  const pub = env("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
  const secret = env("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !pub || !secret) return out(req, 503, { error: "Holdout seeder configuration incomplete" });

  const uc = createClient(url, pub, { global: { headers: { Authorization: auth } }, auth: { persistSession: false, autoRefreshToken: false } });
  const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: who } = await uc.auth.getUser();
  const user = who?.user;
  if (!user) return out(req, 401, { error: "Session invalid" });
  const { data: profile } = await admin.from("profiles").select("account_role").eq("id", user.id).maybeSingle();
  if (String(profile?.account_role || "") !== "developer") return out(req, 403, { error: "Developer access required" });

  let body: any = {};
  try { body = await req.json(); } catch { return out(req, 400, { error: "Invalid JSON" }); }
  const setId = clean(body?.calibration_set_id, 80);
  const sampleSize = Math.min(200, Math.max(25, Math.trunc(Number(body?.sample_size || 126))));
  const holdoutSize = Math.min(60, Math.max(25, Math.trunc(Number(body?.holdout_size || 35))));
  const threshold = clamp(Number(body?.priority_threshold ?? 45));
  if (!setId) return out(req, 400, { error: "calibration_set_id is required" });

  const [{ data: set, error: setError }, { data: model, error: modelError }, { data: current, error: currentError }] = await Promise.all([
    admin.from("intelligence_calibration_sets").select("*").eq("id", setId).maybeSingle(),
    admin.from("intelligence_model_versions").select("model_key,version,status,calibration_state,signal_config,minimum_plan").eq("model_key", "closing_review").eq("version", 3).maybeSingle(),
    admin.from("intelligence_models").select("model_key,version,status,calibration_state").eq("model_key", "closing_review").maybeSingle(),
  ]);
  if (setError || !set) return out(req, 404, { error: "Calibration set not found" });
  if (modelError || currentError || !model || !current) return out(req, 404, { error: "Closing model contract unavailable" });
  if (set.model_key !== "closing_review" || Number(set.model_version) !== 3) return out(req, 409, { error: "Seeder is restricted to Closing Review v3" });
  if (String(model.status) !== "draft" || Number(current.version) === 3) return out(req, 409, { error: "Closing v3 must remain a non-current draft" });
  if (!["draft", "reviewing"].includes(String(set.status))) return out(req, 409, { error: "Calibration set is not seedable" });

  const { count: existingCount, error: existingError } = await admin.from("intelligence_calibration_cases").select("*", { count: "exact", head: true }).eq("calibration_set_id", setId);
  if (existingError) return out(req, 503, { error: "Could not inspect calibration set" });
  if ((existingCount || 0) > 0) return out(req, 409, { error: "Calibration set already contains cases; seeding is one-time only" });

  const signals = Array.isArray(model.signal_config?.signals) ? model.signal_config.signals : [];
  const featureKeys = [...new Set(signals.map((s: any) => clean(s?.id, 140)).filter(Boolean))];
  const { data: defRows, error: defError } = await admin.from("intelligence_feature_versions")
    .select("feature_key,version,source_key,transform_type,config,status,explanation")
    .in("feature_key", featureKeys).in("status", ["draft", "preview", "live"]).order("version", { ascending: false });
  if (defError) return out(req, 503, { error: "Feature registry unavailable" });
  const defs = new Map<string, any>();
  for (const d of defRows || []) if (!defs.has(String(d.feature_key))) defs.set(String(d.feature_key), d);
  if (featureKeys.some(k => !defs.has(k))) return out(req, 409, { error: "Draft feature registry incomplete" });

  const sourceKeys = [...new Set(featureKeys.map(k => clean(defs.get(k)?.source_key, 140)).filter(Boolean))];
  const { data: formulaRows, error: formulaError } = await admin.from("derived_formula_registry")
    .select("marker_id,status").in("marker_id", sourceKeys).eq("status", "live");
  if (formulaError) return out(req, 503, { error: "Formula registry unavailable" });
  const derivedSet = new Set((formulaRows || []).map((x: any) => String(x.marker_id)));
  const derivedKeys = sourceKeys.filter(k => derivedSet.has(k));
  const rawKeys = sourceKeys.filter(k => !derivedSet.has(k));

  const { data: batches, error: batchError } = await admin.from("intelligence_evidence_batches")
    .select("candidates").eq("user_id", user.id).eq("model_key", "closing_review").eq("model_version", Number(current.version))
    .order("created_at", { ascending: false }).limit(100);
  if (batchError) return out(req, 503, { error: "Baseline evidence pool unavailable" });
  const pins: string[] = [], seen = new Set<string>();
  for (const b of batches || []) {
    for (const c of Array.isArray(b.candidates) ? b.candidates : []) {
      const pin = clean(c?.pams_pin, 100);
      if (pin && !seen.has(pin)) { seen.add(pin); pins.push(pin); if (pins.length >= sampleSize) break; }
    }
    if (pins.length >= sampleSize) break;
  }
  if (pins.length < 25) return out(req, 409, { error: "Not enough owner-scoped baseline properties", sample_count: pins.length });

  const derivedPromise = derivedKeys.length ? fetch(`${url}/functions/v1/workbench-derived`, {
    method: "POST", headers: { Authorization: auth, apikey: pub, "Content-Type": "application/json" },
    body: JSON.stringify({ pams_pins: pins, marker_ids: derivedKeys }),
  }) : Promise.resolve(null);
  const rawPromise = rawKeys.length ? fetch(`${url}/functions/v1/workbench-hydrate`, {
    method: "POST", headers: { Authorization: auth, apikey: pub, "Content-Type": "application/json" },
    body: JSON.stringify({ pams_pins: pins, marker_ids: rawKeys }),
  }) : Promise.resolve(null);
  const [dr, hr] = await Promise.all([derivedPromise, rawPromise]);
  const derived = dr ? await dr.json().catch(() => ({})) : {};
  const hydrated = hr ? await hr.json().catch(() => ({})) : {};
  if (dr && !dr.ok) return out(req, dr.status, { error: "Draft derived evidence resolution failed", detail: clean(derived?.error, 240) || null });
  if (hr && !hr.ok) return out(req, hr.status, { error: "Draft raw evidence resolution failed", detail: clean(hydrated?.error, 240) || null });

  const records = new Map<string, any>();
  for (const r of [...(Array.isArray(hydrated?.records) ? hydrated.records : []), ...(Array.isArray(derived?.records) ? derived.records : [])]) {
    const pin = clean(r?.pams_pin, 100);
    if (pin && !records.has(pin)) records.set(pin, r);
  }

  const scoreDefs = signals.filter((s: any) => String(s?.role) !== "confidence" && Number(s?.weight) > 0);
  const confidenceDefs = signals.filter((s: any) => String(s?.role) === "confidence");
  const totalWeight = scoreDefs.reduce((a: number, s: any) => a + Number(s.weight), 0);
  const minimumCoverage = clamp(Number(model.signal_config?.minimum_evidence_coverage ?? 0));
  const rows: any[] = [];

  for (const pin of pins) {
    const raw: Record<string, unknown> = {}, rawMeta: Record<string, any> = {};
    for (const sk of sourceKeys) {
      const source = derivedSet.has(sk) ? derived : hydrated;
      const value = source?.markers?.[pin]?.[sk];
      if (value !== undefined && value !== null && value !== "") raw[sk] = value;
      rawMeta[sk] = source?.meta?.[pin]?.[sk] || null;
    }
    const features: Record<string, number | null> = {};
    for (const key of featureKeys) {
      const def = defs.get(key), sourceKey = String(def.source_key);
      features[key] = transform(def, raw[sourceKey]);
    }
    let weighted = 0, availableWeight = 0;
    const evidence: any[] = [], missing: any[] = [], contributions: any[] = [];
    for (const s of scoreDefs) {
      const id = String(s.id), def = defs.get(id), sourceKey = String(def.source_key), score = numeric(features[id]), meta = rawMeta[sourceKey] || {};
      if (score === null) {
        missing.push({ signal_id: id, role: "score", reason: clean(meta?.status || "missing", 80), source_key: sourceKey, explanation: def?.explanation || null });
        continue;
      }
      availableWeight += Number(s.weight); weighted += score * Number(s.weight);
      const item = {
        signal_id: id, role: "score", score: round(score), weight: Number(s.weight),
        contribution: round(score * Number(s.weight)), value: raw[sourceKey] ?? null,
        source_key: sourceKey, explanation: def?.explanation || meta?.source || null,
        observed_at: meta?.observed_at || meta?.checked_at || null, lineage: meta,
      };
      evidence.push(item); contributions.push(item);
    }
    for (const s of confidenceDefs) {
      const id = String(s.id), def = defs.get(id), sourceKey = String(def.source_key), score = numeric(features[id]), meta = rawMeta[sourceKey] || {};
      if (score === null) missing.push({ signal_id: id, role: "confidence", reason: clean(meta?.status || "missing", 80), source_key: sourceKey, explanation: def?.explanation || null });
      else evidence.push({ signal_id: id, role: "confidence", score: round(score), value: raw[sourceKey] ?? null, source_key: sourceKey, explanation: def?.explanation || meta?.source || null, observed_at: meta?.observed_at || meta?.checked_at || null, lineage: meta });
    }
    const coverage = totalWeight ? availableWeight / totalWeight * 100 : 0;
    if (availableWeight <= 0 || coverage < minimumCoverage) continue;
    const score = clamp(weighted / availableWeight);
    const cv = confidenceDefs.map((s: any) => numeric(features[String(s.id)])).filter((x: any) => x !== null) as number[];
    const confidenceMean = cv.length ? cv.reduce((a, b) => a + b, 0) / cv.length : null;
    const confidence = clamp(confidenceMean === null ? coverage : coverage * .7 + confidenceMean * .3);
    const rec = records.get(pin) || {};
    const county = clean(rec?.county || "UNKNOWN", 80);
    const address = clean(rec?.address || rec?.property_address || "", 300) || null;
    const vector = featureKeys.map(k => { const v = numeric(features[k]); return v === null ? "x" : round(v, 2); }).join("|");
    const whyNow = contributions.slice().sort((a, b) => b.contribution - a.contribution).slice(0, 3)
      .map(x => ({ signal_id: x.signal_id, score: x.score, weight: x.weight, contribution: x.contribution, value: x.value, source_key: x.source_key, explanation: x.explanation }));
    rows.push({ pin, county, address, score, confidence, coverage, features, vector, evidence, missing, whyNow, predicted: score >= threshold ? "review_priority" : "not_priority" });
  }

  const scoreValues = rows.map(r => round(r.score, 4));
  const distinctScores = new Set(scoreValues).size;
  const vectors = new Set(rows.map(r => r.vector)).size;
  const positives = rows.filter(r => r.predicted === "review_priority");
  const negatives = rows.filter(r => r.predicted === "not_priority");
  const featureHealth = featureKeys.map(key => {
    const vals = rows.map(r => numeric(r.features[key])).filter((x: any) => x !== null) as number[];
    return { feature_key: key, available: vals.length, available_rate: rows.length ? vals.length / rows.length : 0, distinct_scores: new Set(vals.map(v => round(v, 4))).size };
  });
  const variableScoreFeatures = featureHealth.filter(x => scoreDefs.some((s: any) => String(s.id) === x.feature_key) && x.available_rate >= .5 && x.distinct_scores >= 2).length;
  const policy = model.signal_config?.holdout_policy || {};
  const minVectors = Number(policy.minimum_unique_feature_vectors || 8);
  const blockers: string[] = [];
  if (pins.length < 25) blockers.push(`sample:${pins.length}<25`);
  if (rows.length < 25) blockers.push(`scorable:${rows.length}<25`);
  if (distinctScores < 8) blockers.push(`distinct_scores:${distinctScores}<8`);
  if (vectors < minVectors) blockers.push(`unique_feature_vectors:${vectors}<${minVectors}`);
  if (positives.length < Number(policy.minimum_positive_cases || 5)) blockers.push(`threshold_positive_candidates:${positives.length}<${Number(policy.minimum_positive_cases || 5)}`);
  if (negatives.length < Number(policy.minimum_negative_cases || 5)) blockers.push(`threshold_negative_candidates:${negatives.length}<${Number(policy.minimum_negative_cases || 5)}`);
  if (variableScoreFeatures < 2) blockers.push(`variable_score_features:${variableScoreFeatures}<2`);
  if (blockers.length) return out(req, 409, { error: "Structural gate failed; holdout was not seeded", blockers, sample: { requested: pins.length, scorable: rows.length }, threshold: { value: threshold, positive: positives.length, negative: negatives.length } });

  const desiredPos = Math.max(Number(policy.minimum_positive_cases || 5), Math.round(holdoutSize * positives.length / rows.length));
  const posCount = Math.min(desiredPos, positives.length, holdoutSize - Number(policy.minimum_negative_cases || 5));
  const negCount = holdoutSize - posCount;
  if (negCount > negatives.length) return out(req, 409, { error: "Source pool cannot support requested representative holdout size" });
  const seed = `closing-v3-fresh-holdout|${threshold}|${holdoutSize}|2026-08-19`;
  const selected = [...pickDiverse(positives, posCount, seed + "|P"), ...pickDiverse(negatives, negCount, seed + "|N")]
    .sort((a, b) => stableRank(seed + "|" + a.pin) - stableRank(seed + "|" + b.pin));

  const caseRows = [];
  for (const row of selected) {
    const factsHash = await sha256({ model_key: "closing_review", model_version: 3, pams_pin: row.pin, score: round(row.score), evidence: row.evidence, missing_evidence: row.missing });
    caseRows.push({
      calibration_set_id: setId,
      case_key: row.pin,
      pams_pin: row.pin,
      property_address: row.address,
      expected_class: "unreviewed",
      evidence_snapshot: {
        score: round(row.score),
        confidence: round(row.confidence),
        evidence_coverage: round(row.coverage),
        why_now: row.whyNow,
        evidence: row.evidence,
        missing_evidence: row.missing,
        facts_hash: factsHash,
        holdout_selection: { threshold, source_pool_scorable: rows.length, source_pool_positive: positives.length, source_pool_negative: negatives.length },
      },
      source_notes: "Fresh statewide Closing Review v3 holdout. Selected only after the non-persisting structural gate passed. Predictions remain hidden until the independent human label is saved. Closing v2 labels are not reused.",
    });
  }
  const caseInsert = await admin.from("intelligence_calibration_cases").insert(caseRows).select("id,case_key");
  if (caseInsert.error) return out(req, 500, { error: "Calibration case seed failed", detail: clean(caseInsert.error.message, 300) });
  const caseMap = new Map((caseInsert.data || []).map((x: any) => [String(x.case_key), x.id]));
  const reviewRows = selected.map(row => ({
    calibration_case_id: caseMap.get(row.pin),
    model_key: "closing_review",
    model_version: 3,
    actual_score: round(row.score),
    actual_confidence: round(row.confidence),
    evidence_coverage: round(row.coverage),
    predicted_class: row.predicted,
    review_outcome: "needs_review",
    review_notes: null,
    reviewer_user_id: null,
    reviewed_at: null,
  }));
  const reviewInsert = await admin.from("intelligence_calibration_reviews").insert(reviewRows);
  if (reviewInsert.error) {
    await admin.from("intelligence_calibration_cases").delete().eq("calibration_set_id", setId);
    return out(req, 500, { error: "Calibration result seed failed; inserted cases were rolled back", detail: clean(reviewInsert.error.message, 300) });
  }

  const selectedCounties = new Set(selected.map(x => x.county)).size;
  const manifest = {
    ...(set.source_manifest || {}),
    fresh_holdout_required: true,
    do_not_reuse_prior_calibration_cases: true,
    structural_shadow_passed: true,
    structural_engine: "watchdog-model-shadow-evaluate-v3",
    priority_threshold: threshold,
    source_pool: {
      requested: pins.length, scorable: rows.length, insufficient_evidence: pins.length - rows.length,
      distinct_scores: distinctScores, unique_feature_vectors: vectors, variable_score_features: variableScoreFeatures,
      predicted_priority: positives.length, predicted_not_priority: negatives.length,
    },
    holdout: {
      size: selected.length, predicted_priority: posCount, predicted_not_priority: negCount,
      selected_counties: selectedCounties,
      selection: "deterministic county-diverse hash sampling preserving source-pool predicted prevalence",
      reviewer_blind_to_prediction_until_save: true,
    },
  };
  const setUpdate = await admin.from("intelligence_calibration_sets").update({
    status: "reviewing",
    minimum_reviewed_cases: selected.length,
    source_manifest: manifest,
  }).eq("id", setId);
  if (setUpdate.error) return out(req, 500, { error: "Holdout seeded but calibration manifest update failed; manual reconciliation required" });

  return out(req, 200, {
    ok: true,
    engine: ENGINE,
    calibration_set_id: setId,
    model: { model_key: "closing_review", model_version: 3, status: "draft", current_customer_version: Number(current.version) },
    threshold: { value: threshold, source_priority: positives.length, source_not_priority: negatives.length },
    source_pool: { requested: pins.length, scorable: rows.length, distinct_scores: distinctScores, unique_feature_vectors: vectors, variable_score_features: variableScoreFeatures },
    holdout: { size: selected.length, predicted_priority: posCount, predicted_not_priority: negCount, selected_counties: selectedCounties },
    safety: { predictions_hidden_until_human_label_saved: true, reused_prior_labels: false, model_pointer_changed: false, calibration_state_changed: false, promotion_action_available: false },
  });
});