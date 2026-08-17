import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const VERSION = "watchdog-population-worker-v3-governed-assessment-features";
const NJ_SOURCE = "https://www.nj.gov/treasury/taxation/lpt/statdata.shtml";
type O = Record<string, any>;

const clean = (v: unknown, n = 500) => String(v ?? "").replace(/[<>]/g, "").trim().slice(0, n);
const clamp = (v: number, min = 0, max = 100) => Math.max(min, Math.min(max, v));
const round = (v: number, p = 2) => Math.round(v * 10 ** p) / 10 ** p;
const numeric = (v: unknown) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
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

function canon(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.entries(v as O).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, canon(x)]));
  }
  return v;
}

async function hash(v: unknown) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(canon(v))));
  return [...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

function quantile(sorted: number[], q: number) {
  if (!sorted.length) return null;
  const p = clamp(q, 0, 1) * (sorted.length - 1);
  const lo = Math.floor(p);
  const hi = Math.ceil(p);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (p - lo);
}

function percentileMidrank(values: number[], raw: number, lowQ = 0, highQ = 1) {
  const sorted = values.slice().sort((a, b) => a - b);
  if (!sorted.length) return null;
  const lo = quantile(sorted, lowQ) ?? sorted[0];
  const hi = quantile(sorted, highQ) ?? sorted[sorted.length - 1];
  const x = Math.max(lo, Math.min(hi, raw));
  let lower = 0;
  let equal = 0;
  for (const value of sorted) {
    const winsorized = Math.max(lo, Math.min(hi, value));
    if (winsorized < x) lower++;
    else if (winsorized === x) equal++;
  }
  return {
    score: clamp(((lower + equal * 0.5) / sorted.length) * 100),
    low: lo,
    high: hi,
    sample_size: sorted.length,
  };
}

function storyCoverage(row: O) {
  const fields = [
    row.pams_pin, row.address, row.town, row.county, row.zip, row.block, row.lot,
    row.prop_class, row.assessed_value, row.last_year_tax, row.last_sale_price, row.last_sale_year,
  ];
  return round(fields.filter((v) => v !== null && v !== undefined && v !== "").length / fields.length * 100);
}

function rawFromProperty(sourceKey: string, row: O) {
  const assessed = numeric(row.assessed_value);
  const tax = numeric(row.last_year_tax);
  const sale = numeric(row.last_sale_price);
  const saleYear = numeric(row.last_sale_year);
  const age = saleYear === null ? null : new Date().getUTCFullYear() - saleYear;
  if (sourceKey === "watchdog.assessment_to_sale_ratio") {
    return assessed !== null && sale !== null && sale > 0 ? assessed / sale : null;
  }
  if (sourceKey === "watchdog.years_since_last_sale") return age;
  if (sourceKey === "watchdog.tax_to_assessment_rate") {
    return assessed !== null && assessed > 0 && tax !== null ? tax / assessed * 100 : null;
  }
  if (sourceKey === "watchdog.source_authority_coverage") return storyCoverage(row);
  return null;
}

async function loadAssessmentPolicy(admin: any, model: O) {
  const signals = Array.isArray(model?.signal_config?.signals) ? model.signal_config.signals : [];
  const featureKeys: string[] = [...new Set<string>(signals.map((s: O) => clean(s?.id, 140)).filter(Boolean) as string[])];
  if (!featureKeys.length) throw new Error("Assessment model has no governed feature contract");

  const defsResult = await admin
    .from("intelligence_feature_versions")
    .select("feature_key,version,source_key,transform_type,cohort_key,cohort_version,config,direction,status,explanation")
    .in("feature_key", featureKeys)
    .in("status", ["preview", "live", "draft"])
    .order("version", { ascending: false });
  if (defsResult.error) throw defsResult.error;
  const defs = new Map<string, O>();
  for (const def of defsResult.data || []) if (!defs.has(String(def.feature_key))) defs.set(String(def.feature_key), def);
  for (const key of featureKeys) if (!defs.has(key)) throw new Error(`Governed feature definition missing: ${key}`);

  const cohortKeys: string[] = [...new Set<string>([...defs.values()].map((d: O) => clean(d.cohort_key, 140)).filter(Boolean) as string[])];
  const cohortDefs = new Map<string, O>();
  if (cohortKeys.length) {
    const cohortResult = await admin
      .from("intelligence_cohort_versions")
      .select("cohort_key,version,dimensions,minimum_sample_size,fallback_chain,status")
      .in("cohort_key", cohortKeys)
      .in("status", ["preview", "live"]);
    if (cohortResult.error) throw cohortResult.error;
    for (const row of cohortResult.data || []) cohortDefs.set(`${row.cohort_key}:${row.version}`, row);
  }

  return { featureKeys, defs, cohortDefs };
}

async function cohortValuesForFeature(
  admin: any,
  def: O,
  row: O,
  cohortDefs: Map<string, O>,
  cache: Map<string, { values: number[]; resolution: O }>,
) {
  if (!def?.cohort_key) return { values: [], resolution: null };
  const cohortDef = cohortDefs.get(`${def.cohort_key}:${def.cohort_version}`);
  if (!cohortDef) return { values: [], resolution: { status: "definition_missing" } };
  const scopes = [String(def.cohort_key), ...(Array.isArray(cohortDef.fallback_chain) ? cohortDef.fallback_chain : [])]
    .map((x: unknown) => clean(x, 80)).filter(Boolean);
  const minimum = Number(cohortDef.minimum_sample_size || 12);

  for (const scope of scopes) {
    const key = [def.feature_key, scope, row.town || "", row.county || "", row.prop_class || ""].join("|");
    const prior = cache.get(key);
    if (prior && prior.values.length >= minimum) return prior;

    let query = admin
      .from("property_lookups")
      .select("pams_pin,town,county,prop_class,assessed_value,last_year_tax,last_sale_price,last_sale_year")
      .limit(5000);
    if (scope === "municipality_property_class") query = query.eq("town", row.town).eq("prop_class", row.prop_class);
    else if (scope === "municipality") query = query.eq("town", row.town);
    else if (scope === "county_property_class") query = query.eq("county", row.county).eq("prop_class", row.prop_class);
    else if (scope === "county") query = query.eq("county", row.county);
    else continue;

    const result = await query;
    if (result.error) continue;
    const pairs = (result.data || [])
      .map((peer: O) => ({ pams_pin: String(peer.pams_pin), value: rawFromProperty(String(def.source_key), peer) }))
      .filter((pair: O) => numeric(pair.value) !== null)
      .map((pair: O) => ({ pams_pin: pair.pams_pin, value: Number(pair.value) }));
    const values = pairs.map((pair: O) => pair.value);
    const resolution = {
      status: values.length >= minimum ? "resolved" : "insufficient",
      requested_cohort: def.cohort_key,
      resolved_scope: scope,
      sample_size: values.length,
      minimum_sample_size: minimum,
    };
    const payload = { values, resolution };
    cache.set(key, payload);
    if (values.length >= minimum) return payload;
  }
  return { values: [], resolution: { status: "insufficient", minimum_sample_size: minimum } };
}

function transformFeature(def: O, rawValue: unknown, rawMap: O, cohortValues: number[], cohortDef: O | null) {
  const cfg = def.config || {};
  if (def.status === "draft") return { status: "definition_draft", score: null, detail: {} };

  const guardKey = clean(cfg.guard_source_key, 140);
  if (guardKey) {
    const guardValue = numeric(rawMap[guardKey]);
    if (guardValue === null) {
      return { status: "guard_missing", score: null, detail: { guard_source_key: guardKey, reason: clean(cfg.guard_reason, 240) || "Guard evidence is missing" } };
    }
    const guardMin = numeric(cfg.guard_min);
    const guardMax = numeric(cfg.guard_max);
    if ((guardMin !== null && guardValue < guardMin) || (guardMax !== null && guardValue > guardMax)) {
      return {
        status: "guard_failed",
        score: null,
        detail: { guard_source_key: guardKey, guard_value: guardValue, guard_min: guardMin, guard_max: guardMax, reason: clean(cfg.guard_reason, 240) || "Feature guard failed" },
      };
    }
  }

  if (def.transform_type === "identity_0_100") {
    const n = numeric(rawValue);
    return n === null ? { status: "missing", score: null, detail: {} } : { status: "available", score: clamp(n), detail: {} };
  }
  if (def.transform_type === "distance_from_target") {
    const n = numeric(rawValue);
    if (n === null) return { status: "missing", score: null, detail: {} };
    const target = Number(cfg.target ?? 0);
    const delta = Math.max(Number(cfg.full_attention_delta || 1), 0.000001);
    return { status: "available", score: clamp(Math.abs(n - target) / delta * 100), detail: { target, full_attention_delta: delta } };
  }
  if (def.transform_type === "numeric_decay") {
    const n = numeric(rawValue);
    if (n === null) return { status: "missing", score: null, detail: {} };
    const points = Array.isArray(cfg.breakpoints) ? cfg.breakpoints.slice().sort((a: O, b: O) => Number(a.max) - Number(b.max)) : [];
    const point = points.find((p: O) => n <= Number(p.max));
    const score = point ? Number(point.score) : Number(cfg.older_score ?? 0);
    return { status: "available", score: clamp(score), detail: { numeric_value: n, matched_max: point ? Number(point.max) : null } };
  }
  if (def.transform_type === "cohort_percentile_high") {
    const n = numeric(rawValue);
    if (n === null) return { status: "missing", score: null, detail: {} };
    const minimum = Number(cohortDef?.minimum_sample_size || 12);
    if (cohortValues.length < minimum) {
      return { status: "cohort_insufficient", score: null, detail: { sample_size: cohortValues.length, minimum_sample_size: minimum } };
    }
    const result = percentileMidrank(cohortValues, n, Number(cfg.winsorize_low ?? 0), Number(cfg.winsorize_high ?? 1));
    if (!result) return { status: "cohort_insufficient", score: null, detail: { sample_size: 0, minimum_sample_size: minimum } };
    return {
      status: "available",
      score: result.score,
      detail: { sample_size: result.sample_size, winsorized_low: result.low, winsorized_high: result.high, cohort_key: def.cohort_key, cohort_version: def.cohort_version },
    };
  }
  return { status: "unsupported_transform", score: null, detail: { transform_type: def.transform_type } };
}

async function latestSourceCoverage(admin: any, pins: string[]) {
  const map = new Map<string, { score: number; observed_at: string | null; model_version: string | null }>();
  for (let i = 0; i < pins.length; i += 500) {
    const result = await admin.from("score_observations")
      .select("pams_pin,score,observed_at,model_version")
      .eq("marker_id", "watchdog.source_authority_coverage")
      .in("pams_pin", pins.slice(i, i + 500))
      .order("observed_at", { ascending: false });
    if (result.error) throw result.error;
    for (const row of result.data || []) {
      const pin = String(row.pams_pin || "");
      if (!pin || map.has(pin)) continue;
      const score = numeric(row.score);
      if (score !== null) map.set(pin, { score, observed_at: row.observed_at || null, model_version: row.model_version || null });
    }
  }
  return map;
}

async function assessmentFeatures(
  admin: any,
  row: O,
  policy: { featureKeys: string[]; defs: Map<string, O>; cohortDefs: Map<string, O> },
  cohortCache: Map<string, { values: number[]; resolution: O }>,
  sourceCoverage: Map<string, { score: number; observed_at: string | null; model_version: string | null }>,
  fallbackObservedAt: string,
) {
  const rawMap: O = {};
  const sourceKeys = new Set<string>();
  for (const def of policy.defs.values()) {
    sourceKeys.add(String(def.source_key));
    if (def?.config?.guard_source_key) sourceKeys.add(String(def.config.guard_source_key));
  }
  for (const key of sourceKeys) rawMap[key] = rawFromProperty(key, row);
  const coverageObservation = sourceCoverage.get(String(row.pams_pin));
  if (sourceKeys.has("watchdog.source_authority_coverage") && coverageObservation) {
    rawMap["watchdog.source_authority_coverage"] = coverageObservation.score;
  }

  const features: O = {};
  for (const featureKey of policy.featureKeys) {
    const def = policy.defs.get(featureKey)!;
    let cohortValues: number[] = [];
    let resolution: O | null = null;
    const cohortDef = def.cohort_key ? policy.cohortDefs.get(`${def.cohort_key}:${def.cohort_version}`) || null : null;
    if (def.cohort_key) {
      const cohort = await cohortValuesForFeature(admin, def, row, policy.cohortDefs, cohortCache);
      cohortValues = cohort.values;
      resolution = cohort.resolution;
    }
    const transformed = transformFeature(def, rawMap[String(def.source_key)], rawMap, cohortValues, cohortDef);
    features[featureKey] = {
      status: transformed.status,
      score: transformed.score,
      value: rawMap[String(def.source_key)] ?? null,
      source_key: String(def.source_key),
      source_url: NJ_SOURCE,
      observed_at: featureKey === "watchdog.source_authority_coverage" && coverageObservation?.observed_at
        ? coverageObservation.observed_at
        : row.last_seen || fallbackObservedAt,
      explanation: def.explanation || null,
      normalization: {
        transform_type: def.transform_type,
        feature_version: def.version,
        ...transformed.detail,
      },
      cohort: resolution || null,
      lineage: {
        provider_kind: "derived_governed",
        feature_key: featureKey,
        feature_version: def.version,
        source_key: def.source_key,
        observation_model_version: featureKey === "watchdog.source_authority_coverage" ? coverageObservation?.model_version || null : null,
      },
    };
  }
  return features;
}

function scoreFinding(model: O, row: O, features: O, context: O) {
  const signals = Array.isArray(model?.signal_config?.signals) ? model.signal_config.signals : [];
  const scored = signals.filter((s: O) => s.role !== "confidence" && Number(s.weight) > 0);
  const confidenceSignals = signals.filter((s: O) => s.role === "confidence");
  const totalWeight = scored.reduce((sum: number, s: O) => sum + Number(s.weight), 0);
  let weighted = 0;
  let availableWeight = 0;
  const evidence: O[] = [];
  const missing: O[] = [];
  const contributions: O[] = [];

  for (const signal of scored) {
    const feature = features[signal.id];
    if (!feature || feature.score === null || feature.score === undefined) {
      missing.push({ signal_id: signal.id, role: "score", weight: signal.weight, reason: clean(feature?.status || "missing", 100), normalization: feature?.normalization || null });
      continue;
    }
    const score = clamp(Number(feature.score));
    const contribution = score * Number(signal.weight);
    weighted += contribution;
    availableWeight += Number(signal.weight);
    const item = {
      signal_id: signal.id, role: "score", score: round(score), weight: Number(signal.weight), contribution: round(contribution),
      value: feature.value ?? null, source_key: feature.source_key || signal.id, source_url: feature.source_url || null,
      observed_at: feature.observed_at || null, explanation: feature.explanation || null, normalization: feature.normalization || null,
      cohort: feature.cohort || null, lineage: feature.lineage || null,
    };
    evidence.push(item);
    contributions.push(item);
  }

  for (const signal of confidenceSignals) {
    const feature = features[signal.id];
    if (!feature || feature.score === null || feature.score === undefined) {
      missing.push({ signal_id: signal.id, role: "confidence", reason: clean(feature?.status || "missing", 100), normalization: feature?.normalization || null });
      continue;
    }
    evidence.push({
      signal_id: signal.id, role: "confidence", score: round(clamp(Number(feature.score))), value: feature.value ?? null,
      source_key: feature.source_key || signal.id, source_url: feature.source_url || null, observed_at: feature.observed_at || null,
      explanation: feature.explanation || null, normalization: feature.normalization || null, cohort: feature.cohort || null, lineage: feature.lineage || null,
    });
  }

  if (availableWeight <= 0) return null;
  const score = clamp(weighted / availableWeight);
  const coverage = totalWeight ? clamp(availableWeight / totalWeight * 100) : 0;
  const confidenceValues = confidenceSignals
    .map((s: O) => features[s.id])
    .filter((f: O) => f && f.score !== null && f.score !== undefined)
    .map((f: O) => clamp(Number(f.score)));
  const confidenceMean = confidenceValues.length ? confidenceValues.reduce((a: number, b: number) => a + b, 0) / confidenceValues.length : null;
  const minimumCoverage = Number(model?.signal_config?.minimum_evidence_coverage || 0);
  let confidence = confidenceMean === null ? coverage : coverage * 0.7 + confidenceMean * 0.3;
  const limited = coverage < minimumCoverage;
  if (limited) confidence = Math.min(confidence, 49);
  const why = contributions.sort((a, b) => b.contribution - a.contribution).slice(0, 3)
    .map((x) => ({ signal_id: x.signal_id, score: x.score, weight: x.weight, contribution: x.contribution, value: x.value, explanation: x.explanation }));

  return {
    pams_pin: row.pams_pin,
    property_address: row.address || null,
    property_context: { municipality: row.town || null, county: row.county || null, property_class: row.prop_class || null },
    opportunity_type: model.objective || model.model_key,
    score: round(score),
    confidence: round(clamp(confidence)),
    evidence_coverage: round(coverage),
    potential_impact: {},
    why_now: why,
    evidence,
    missing_evidence: missing,
    recommended_actions: Array.isArray(model?.signal_config?.recommended_actions) ? model.signal_config.recommended_actions : [],
    narrative: null,
    narrative_status: "not_requested",
    limited_evidence: limited,
    context,
  };
}

async function propertyRows(admin: any, pins: string[]) {
  const rows: O[] = [];
  for (let i = 0; i < pins.length; i += 500) {
    const result = await admin
      .from("property_lookups")
      .select("pams_pin,address,town,county,zip,block,lot,prop_class,assessed_value,last_year_tax,last_sale_price,last_sale_year,last_seen,history")
      .in("pams_pin", pins.slice(i, i + 500));
    if (result.error) throw result.error;
    rows.push(...(result.data || []));
  }
  return rows;
}

function changeFeatures(anchor: O, count30: number) {
  const material: Record<string, number> = { low: 30, high: 85, info: 10, medium: 60, critical: 100 };
  const types: Record<string, number> = { tax_change: 82, deed_change: 72, market_change: 62, permit_change: 76, appeal_deadline: 100, evidence_change: 70, municipal_change: 55, assessment_change: 90 };
  const days = Math.max(0, (Date.now() - new Date(anchor.occurred_at).getTime()) / 86400000);
  const recency = days <= 7 ? 100 : days <= 30 ? 80 : days <= 90 ? 55 : days <= 180 ? 30 : days <= 365 ? 15 : 5;
  const severity = String(anchor.severity || "").toLowerCase();
  const eventType = String(anchor.event_type || "");
  return {
    "event.materiality": { status: material[severity] === undefined ? "unmapped_category" : "available", score: material[severity] ?? null, value: anchor.severity, source_key: "event.materiality", source_url: anchor.source_url || null, observed_at: anchor.occurred_at, explanation: anchor.title || anchor.summary || null, normalization: { transform_type: "categorical_map" } },
    "event.recency": { status: "available", score: recency, value: anchor.occurred_at, source_key: "event.occurred_at", source_url: anchor.source_url || null, observed_at: anchor.occurred_at, explanation: anchor.title || null, normalization: { transform_type: "recency_decay" } },
    "event.type_priority": { status: types[eventType] === undefined ? "unmapped_category" : "available", score: types[eventType] ?? null, value: anchor.event_type, source_key: "event.type_priority", source_url: anchor.source_url || null, observed_at: anchor.occurred_at, explanation: anchor.title || null, normalization: { transform_type: "categorical_map" } },
    "event.change_count_30d": { status: "available", score: clamp(count30 / 5 * 100), value: count30, source_key: "event.change_count_30d", source_url: anchor.source_url || null, observed_at: anchor.occurred_at, explanation: "Number of governed property-change events observed in the last 30 days.", normalization: { transform_type: "count_cap", cap: 5 } },
    "watchdog.property_story_confidence": { status: "missing", score: null },
  };
}

async function factsFingerprint(admin: any, job: O) {
  if (job.model_key === "property_change_priority") {
    const since = new Date(Date.now() - 90 * 86400000).toISOString();
    const parts: O[] = [];
    for (let i = 0; i < job.pams_pins.length; i += 500) {
      const result = await admin.from("property_update_events")
        .select("pams_pin,event_key,event_type,severity,occurred_at,marker_id,old_value,new_value,delta_numeric,source_url")
        .eq("user_id", job.user_id).in("pams_pin", job.pams_pins.slice(i, i + 500)).gte("occurred_at", since).order("occurred_at", { ascending: true });
      if (result.error) throw result.error;
      parts.push(...(result.data || []));
    }
    return hash({ model_key: job.model_key, model_version: job.model_version, events: parts });
  }
  const rows = await propertyRows(admin, job.pams_pins);
  return hash({ model_key: job.model_key, model_version: job.model_version, properties: rows.map((r) => [r.pams_pin, r.assessed_value, r.last_year_tax, r.last_sale_price, r.last_sale_year, r.last_seen]) });
}

async function advanceScope(admin: any, job: O, runId: string, facts: string, digestId: string | null) {
  if (!job.scope_id) return;
  const result = await admin.from("intelligence_scopes").select("cadence,is_scheduled,last_run_manifest").eq("id", job.scope_id).maybeSingle();
  if (!result.data) return;
  const manifest = result.data.last_run_manifest || {};
  manifest[job.model_key] = { run_id: runId, facts_fingerprint: facts, completed_at: new Date().toISOString(), digest_id: digestId };
  const days = result.data.cadence === "weekly" ? 7 : 1;
  await admin.from("intelligence_scopes").update({
    last_run_at: new Date().toISOString(),
    last_run_manifest: manifest,
    next_run_at: result.data.is_scheduled ? new Date(Date.now() + days * 86400000).toISOString() : null,
    updated_at: new Date().toISOString(),
  }).eq("id", job.scope_id);
}

async function noChangeDigest(admin: any, job: O, runId: string, facts: string) {
  if (!job.scope_id) return null;
  const scope = await admin.from("intelligence_scopes").select("last_run_manifest").eq("id", job.scope_id).maybeSingle();
  const priorRun = scope.data?.last_run_manifest?.[job.model_key]?.run_id || runId;
  const current = await admin.from("intelligence_findings").select("pams_pin,score,confidence,evidence_coverage")
    .eq("run_id", runId).eq("user_id", job.user_id).order("score", { ascending: false }).limit(20);
  const digest = await admin.from("intelligence_daily_digests").upsert({
    user_id: job.user_id,
    organization_id: job.organization_id || null,
    scope_id: job.scope_id,
    model_key: job.model_key,
    prior_run_id: priorRun,
    current_run_id: runId,
    digest_date: new Date().toISOString().slice(0, 10),
    new_findings: [], strengthened_findings: [], weakened_findings: [], removed_findings: [], evidence_changes: [],
    recommended_queue: current.data || [],
    summary: { new_count: 0, strengthened_count: 0, weakened_count: 0, removed_count: 0, evidence_change_count: 0, material_change_count: 0, cache_hit: true, generated_by: VERSION },
  }, { onConflict: "user_id,scope_id,model_key,digest_date" }).select("id").single();
  const id = digest.data?.id || null;
  await advanceScope(admin, job, runId, facts, id);
  return id;
}

async function finalize(admin: any, job: O, runId: string, cacheKey: string, facts: string, retention: number) {
  const result = await admin.from("intelligence_findings")
    .select("id,pams_pin,score,confidence,evidence_coverage,missing_evidence,facts_hash,created_at")
    .eq("run_id", runId).eq("user_id", job.user_id).order("score", { ascending: false }).limit(5000);
  if (result.error) throw result.error;
  const findings = result.data || [];
  for (let start = 0; start < findings.length; start += 200) {
    await Promise.all(findings.slice(start, start + 200).map((f: O, index: number) => admin.from("intelligence_findings").update({ rank: start + index + 1 }).eq("id", f.id)));
  }
  const runHash = await hash({ model_key: job.model_key, model_version: job.model_version, scope_fingerprint: job.scope_fingerprint, facts_fingerprint: facts, findings: findings.map((f: O) => [f.pams_pin, f.score, f.confidence, f.evidence_coverage, f.facts_hash]) });
  await admin.from("intelligence_runs").update({ status: "complete", finding_count: findings.length, facts_hash: runHash, completed_at: new Date().toISOString() }).eq("id", runId);
  await admin.from("intelligence_run_cache").upsert({
    cache_key: cacheKey, user_id: job.user_id, organization_id: job.organization_id || null, model_key: job.model_key, model_version: job.model_version,
    scope_fingerprint: job.scope_fingerprint, facts_fingerprint: facts, run_id: runId, candidate_count: job.candidate_count,
    finding_count: findings.length, expires_at: new Date(Date.now() + retention * 86400000).toISOString(),
  }, { onConflict: "cache_key" });

  let digestId = null;
  if (job.scope_id) {
    const scope = await admin.from("intelligence_scopes").select("last_run_manifest").eq("id", job.scope_id).maybeSingle();
    const priorRun = scope.data?.last_run_manifest?.[job.model_key]?.run_id || null;
    let previous: O[] = [];
    if (priorRun) {
      const prior = await admin.from("intelligence_findings").select("pams_pin,property_address,score,confidence,evidence_coverage,missing_evidence")
        .eq("run_id", priorRun).eq("user_id", job.user_id).limit(5000);
      previous = prior.data || [];
    }
    const before = new Map(previous.map((f: O) => [f.pams_pin, f]));
    const after = new Map(findings.map((f: O) => [f.pams_pin, f]));
    const newItems: O[] = [], strong: O[] = [], weak: O[] = [], removed: O[] = [], evidenceChanges: O[] = [];
    for (const finding of findings) {
      const old = before.get(finding.pams_pin) as O | undefined;
      if (!old) newItems.push({ pams_pin: finding.pams_pin, score: finding.score });
      else {
        const delta = Number(finding.score) - Number(old.score);
        if (delta >= 10) strong.push({ pams_pin: finding.pams_pin, old_score: old.score, new_score: finding.score, delta: round(delta) });
        if (delta <= -10) weak.push({ pams_pin: finding.pams_pin, old_score: old.score, new_score: finding.score, delta: round(delta) });
        const oldMissing = (Array.isArray(old.missing_evidence) ? old.missing_evidence : []).map((x: O) => x.signal_id).sort().join("|");
        const newMissing = (Array.isArray(finding.missing_evidence) ? finding.missing_evidence : []).map((x: O) => x.signal_id).sort().join("|");
        if (oldMissing !== newMissing) evidenceChanges.push({ pams_pin: finding.pams_pin, old_missing: oldMissing ? oldMissing.split("|") : [], new_missing: newMissing ? newMissing.split("|") : [] });
      }
    }
    for (const finding of previous) if (!after.has(finding.pams_pin)) removed.push({ pams_pin: finding.pams_pin, prior_score: finding.score });
    const queue = findings.slice(0, 20).map((f: O) => ({ pams_pin: f.pams_pin, score: f.score, confidence: f.confidence, evidence_coverage: f.evidence_coverage }));
    const digest = await admin.from("intelligence_daily_digests").upsert({
      user_id: job.user_id, organization_id: job.organization_id || null, scope_id: job.scope_id, model_key: job.model_key,
      prior_run_id: priorRun, current_run_id: runId, digest_date: new Date().toISOString().slice(0, 10),
      new_findings: newItems, strengthened_findings: strong, weakened_findings: weak, removed_findings: removed,
      evidence_changes: evidenceChanges, recommended_queue: queue,
      summary: { new_count: newItems.length, strengthened_count: strong.length, weakened_count: weak.length, removed_count: removed.length, evidence_change_count: evidenceChanges.length, material_change_count: newItems.length + strong.length + weak.length + removed.length + evidenceChanges.length, cache_hit: false, generated_by: VERSION },
    }, { onConflict: "user_id,scope_id,model_key,digest_date" }).select("id").single();
    digestId = digest.data?.id || null;
    await advanceScope(admin, job, runId, facts, digestId);
  }

  await admin.from("intelligence_jobs").update({
    status: "complete", cursor_index: job.candidate_count, processed_count: job.candidate_count, finding_count: findings.length,
    result_run_id: runId, cache_key: cacheKey, completed_at: new Date().toISOString(), locked_at: null, worker_id: null,
    worker_token_hash: null, worker_token_expires_at: null,
    metrics: { engine_version: VERSION, facts_fingerprint: facts, run_hash: runHash, digest_id: digestId }, updated_at: new Date().toISOString(),
  }).eq("id", job.id);
  return { finding_count: findings.length, digest_id: digestId, run_hash: runHash };
}

async function authorize(req: Request, body: O, admin: any, publishable: string, url: string) {
  const jobId = clean(body.job_id, 80);
  const token = clean(body.worker_token, 180);
  if (jobId && token) {
    const job = await admin.from("intelligence_jobs").select("worker_token_hash,worker_token_expires_at").eq("id", jobId).maybeSingle();
    if (job.data?.worker_token_hash && job.data.worker_token_expires_at && new Date(job.data.worker_token_expires_at).getTime() > Date.now() && await hash(token) === job.data.worker_token_hash) {
      await admin.from("intelligence_jobs").update({ worker_token_hash: null, worker_token_expires_at: null }).eq("id", jobId);
      return true;
    }
  }
  const automationSecret = Deno.env.get("WATCHDOG_AUTOMATION_SECRET") || Deno.env.get("AGENT_DIGEST_CRON_SECRET") || "";
  if (automationSecret && req.headers.get("x-watchdog-automation-secret") === automationSecret) return true;
  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return false;
  const userClient = createClient(url, publishable, { global: { headers: { Authorization: auth } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data } = await userClient.auth.getUser();
  if (!data?.user) return false;
  const profile = await admin.from("profiles").select("account_role").eq("id", data.user.id).maybeSingle();
  return String(profile.data?.account_role || "") === "developer";
}

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json(405, { error: "POST required" });
  const url = Deno.env.get("SUPABASE_URL") || "";
  const publishable = env("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
  const secret = env("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !publishable || !secret) return json(503, { error: "Worker configuration incomplete" });
  const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  let body: O = {};
  try { body = await req.json(); } catch {}
  if (!await authorize(req, body, admin, publishable, url)) return json(401, { error: "Worker authorization required" });

  const workerId = clean(body.worker_id || `worker-${crypto.randomUUID().slice(0, 8)}`, 80);
  let jobId = clean(body.job_id, 80);
  if (jobId) {
    const statusResult = await admin.from("intelligence_jobs").select("status").eq("id", jobId).maybeSingle();
    if (!statusResult.data) return json(404, { error: "Job not found" });
    if (["complete", "cache_hit", "canceled"].includes(String(statusResult.data.status))) return json(200, { ok: true, job_id: jobId, status: statusResult.data.status, idempotent: true });
    await admin.from("intelligence_jobs").update({ status: "running", worker_id: workerId, locked_at: new Date().toISOString(), started_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", jobId);
  } else {
    const claimed = await admin.rpc("claim_intelligence_job", { p_worker_id: workerId });
    jobId = claimed.data || "";
    if (!jobId) return json(200, { ok: true, status: "idle", worker_id: workerId });
  }

  const jobResult = await admin.from("intelligence_jobs").select("*").eq("id", jobId).maybeSingle();
  const job = jobResult.data;
  if (jobResult.error || !job) return json(404, { error: "Claimed job not found" });
  const modelResult = await admin.from("intelligence_model_versions")
    .select("model_key,label,objective,version,status,calibration_state,signal_config")
    .eq("model_key", job.model_key).eq("version", job.model_version).maybeSingle();
  const model = modelResult.data;
  if (!model) return json(409, { error: "Pinned model version not found" });

  const entitlement = await admin.from("account_entitlements").select("plan_tier").eq("user_id", job.user_id).maybeSingle();
  const plan = entitlement.data?.plan_tier || "pro_plus";
  const limits = await admin.from("intelligence_plan_limits").select("retention_days").eq("plan_tier", plan).maybeSingle();
  const retention = Number(limits.data?.retention_days || 180);
  const started = Date.now();

  try {
    let facts = clean(job.metrics?.facts_fingerprint, 80);
    if (!facts) facts = await factsFingerprint(admin, job);
    const cacheKey = await hash({ user_id: job.user_id, model_key: job.model_key, model_version: job.model_version, scope_fingerprint: job.scope_fingerprint, facts_fingerprint: facts });
    const cached = await admin.from("intelligence_run_cache").select("run_id,finding_count,expires_at,hit_count")
      .eq("cache_key", cacheKey).gt("expires_at", new Date().toISOString()).maybeSingle();
    if (cached.data && !job.result_run_id) {
      await admin.from("intelligence_run_cache").update({ last_hit_at: new Date().toISOString(), hit_count: Number(cached.data.hit_count || 0) + 1 }).eq("cache_key", cacheKey);
      const digestId = await noChangeDigest(admin, job, cached.data.run_id, facts);
      await admin.from("intelligence_jobs").update({
        status: "cache_hit", cursor_index: job.candidate_count, processed_count: job.candidate_count, finding_count: cached.data.finding_count,
        result_run_id: cached.data.run_id, cache_key: cacheKey, completed_at: new Date().toISOString(), locked_at: null, worker_id: null,
        worker_token_hash: null, worker_token_expires_at: null,
        metrics: { engine_version: VERSION, facts_fingerprint: facts, cache_hit: true, digest_id: digestId }, updated_at: new Date().toISOString(),
      }).eq("id", job.id);
      await admin.from("intelligence_job_events").insert({ job_id: job.id, user_id: job.user_id, event_type: "cache_hit", message: "Reused an unchanged governed population run.", payload: { run_id: cached.data.run_id, finding_count: cached.data.finding_count, digest_id: digestId } });
      await admin.from("intelligence_usage_events").insert({ user_id: job.user_id, plan_tier: plan, event_type: "population_job", request_units: 1, latency_ms: Date.now() - started, metadata: { job_id: job.id, model_key: job.model_key, candidate_count: job.candidate_count, cache_hit: true, engine_version: VERSION } });
      return json(200, { ok: true, job_id: job.id, status: "cache_hit", run_id: cached.data.run_id, finding_count: cached.data.finding_count, digest_id: digestId });
    }

    let runId = job.result_run_id;
    if (!runId) {
      const created = await admin.from("intelligence_runs").insert({
        user_id: job.user_id, model_key: job.model_key, model_version: job.model_version, scope_type: job.scope_type,
        scope_value: { ...job.scope_value, scope_id: job.scope_id, scope_fingerprint: job.scope_fingerprint }, status: "running",
        candidate_count: job.candidate_count, engine_version: VERSION, normalization_manifest: { population_engine: VERSION },
        cohort_manifest: { population_engine: VERSION }, started_at: new Date().toISOString(),
      }).select("id").single();
      if (created.error || !created.data) throw created.error || new Error("Could not create population run");
      runId = created.data.id;
      await admin.from("intelligence_jobs").update({ result_run_id: runId, cache_key: cacheKey, metrics: { ...job.metrics, engine_version: VERSION, facts_fingerprint: facts }, updated_at: new Date().toISOString() }).eq("id", job.id);
      job.result_run_id = runId;
      job.cache_key = cacheKey;
      job.metrics = { ...job.metrics, engine_version: VERSION, facts_fingerprint: facts };
    }

    const cursor = Number(job.cursor_index || 0);
    const batchSize = Math.min(Number(job.batch_size || 250), 500);
    const batchPins = (job.pams_pins || []).slice(cursor, cursor + batchSize);
    const rows = await propertyRows(admin, batchPins);
    const rowMap = new Map(rows.map((r: O) => [String(r.pams_pin), r]));
    const findings: O[] = [];

    if (job.model_key === "assessment_anomaly") {
      const policy = await loadAssessmentPolicy(admin, model);
      const cohortCache = new Map<string, { values: number[]; resolution: O }>();
      const sourceCoverage = await latestSourceCoverage(admin, batchPins);
      for (const pin of batchPins) {
        const row = rowMap.get(pin);
        if (!row) continue;
        const features = await assessmentFeatures(admin, row, policy, cohortCache, sourceCoverage, job.created_at);
        const finding = scoreFinding(model, row, features, { engine_version: VERSION, model_version: job.model_version, governed_feature_versions: Object.fromEntries([...policy.defs.entries()].map(([k, d]) => [k, d.version])) });
        if (finding) findings.push(finding);
      }
    } else if (job.model_key === "property_change_priority") {
      const since = new Date(Date.now() - 90 * 86400000).toISOString();
      const events = await admin.from("property_update_events")
        .select("id,pams_pin,event_type,severity,title,summary,occurred_at,source_url")
        .eq("user_id", job.user_id).in("pams_pin", batchPins).gte("occurred_at", since).order("occurred_at", { ascending: false }).limit(10000);
      if (events.error) throw events.error;
      const groups = new Map<string, O[]>();
      for (const event of events.data || []) {
        const pin = String(event.pams_pin || "");
        if (!groups.has(pin)) groups.set(pin, []);
        groups.get(pin)!.push(event);
      }
      for (const pin of batchPins) {
        const group = groups.get(pin) || [];
        if (!group.length) continue;
        const anchor = group[0];
        const count30 = group.filter((event) => Date.now() - new Date(event.occurred_at).getTime() <= 30 * 86400000).length;
        const row = rowMap.get(pin) || { pams_pin: pin, address: null, town: null, county: null, prop_class: null };
        const finding = scoreFinding(model, row, changeFeatures(anchor, count30), { engine_version: VERSION, anchor_event_id: anchor.id, event_count: group.length });
        if (finding) findings.push(finding);
      }
    } else throw new Error("Unsupported population model");

    for (const finding of findings) {
      finding.facts_hash = await hash({ model_key: job.model_key, model_version: job.model_version, pams_pin: finding.pams_pin, evidence: finding.evidence.map((e: O) => [e.signal_id, e.score, e.value, e.observed_at]), missing: finding.missing_evidence });
    }
    if (findings.length) {
      const insert = await admin.from("intelligence_findings").insert(findings.map((f, i) => ({
        run_id: runId, user_id: job.user_id, pams_pin: f.pams_pin, property_address: f.property_address, property_context: f.property_context,
        opportunity_type: f.opportunity_type, rank: cursor + i + 1, score: f.score, confidence: f.confidence, evidence_coverage: f.evidence_coverage,
        potential_impact: f.potential_impact, why_now: f.why_now, evidence: f.evidence, missing_evidence: f.missing_evidence,
        recommended_actions: f.recommended_actions, narrative: f.narrative, narrative_status: f.narrative_status, facts_hash: f.facts_hash,
      })));
      if (insert.error) throw insert.error;
    }

    const next = cursor + batchPins.length;
    const done = next >= job.candidate_count;
    await admin.from("intelligence_job_events").insert({ job_id: job.id, user_id: job.user_id, event_type: "batch_complete", message: `Processed ${next} of ${job.candidate_count} properties.`, payload: { cursor_before: cursor, cursor_after: next, batch_size: batchPins.length, batch_findings: findings.length, run_id: runId, engine_version: VERSION } });
    if (done) {
      job.cursor_index = next;
      job.processed_count = next;
      const final = await finalize(admin, job, runId, cacheKey, facts, retention);
      await admin.from("intelligence_usage_events").insert({ user_id: job.user_id, plan_tier: plan, event_type: "population_job", request_units: 1, latency_ms: Date.now() - started, metadata: { job_id: job.id, model_key: job.model_key, candidate_count: job.candidate_count, finding_count: final.finding_count, cache_hit: false, batches: Math.ceil(job.candidate_count / batchSize), engine_version: VERSION } });
      return json(200, { ok: true, job_id: job.id, status: "complete", run_id: runId, ...final, engine_version: VERSION });
    }

    await admin.from("intelligence_jobs").update({ status: "partial", cursor_index: next, processed_count: next, locked_at: null, worker_id: null, worker_token_hash: null, worker_token_expires_at: null, available_at: new Date().toISOString(), metrics: { ...job.metrics, last_batch_ms: Date.now() - started, engine_version: VERSION }, updated_at: new Date().toISOString() }).eq("id", job.id);
    return json(200, { ok: true, job_id: job.id, status: "partial", run_id: runId, processed_count: next, candidate_count: job.candidate_count, batch_findings: findings.length, engine_version: VERSION });
  } catch (error) {
    const retry = Number(job.retry_count || 0) + 1;
    const max = Number(job.max_retries || 3);
    const retryable = retry <= max;
    await admin.from("intelligence_jobs").update({
      status: retryable ? "partial" : "failed", retry_count: retry, error_code: "population_worker_failed",
      error_message: clean((error as any)?.message || error, 500), available_at: new Date(Date.now() + Math.min(60, retry * 10) * 1000).toISOString(),
      locked_at: null, worker_id: null, worker_token_hash: null, worker_token_expires_at: null, updated_at: new Date().toISOString(),
      completed_at: retryable ? null : new Date().toISOString(),
    }).eq("id", job.id);
    await admin.from("intelligence_job_events").insert({ job_id: job.id, user_id: job.user_id, event_type: retryable ? "retry_scheduled" : "failed", message: clean((error as any)?.message || error, 500), payload: { retry_count: retry, max_retries: max, engine_version: VERSION } });
    return json(retryable ? 503 : 500, { ok: false, job_id: job.id, status: retryable ? "partial" : "failed", retry_count: retry, error: "Population Intelligence worker could not complete this batch.", engine_version: VERSION });
  }
});