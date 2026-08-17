import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const ENGINE = "watchdog-calibration-admin-v2-negative-insufficient";
const ORIGINS = new Set([
  "https://njpropertytaxrelief.com",
  "https://www.njpropertytaxrelief.com",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);

const cors = (r: Request) => ({
  "Access-Control-Allow-Origin": ORIGINS.has(r.headers.get("origin") || "")
    ? (r.headers.get("origin") || "")
    : "https://njpropertytaxrelief.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
});

const out = (r: Request, s: number, p: unknown) => new Response(JSON.stringify(p), {
  status: s,
  headers: { ...cors(r), "Content-Type": "application/json", "Cache-Control": "private, no-store" },
});

const clean = (v: unknown, n = 1000) => String(v ?? "").replace(/[<>]/g, "").trim().slice(0, n);
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
const numeric = (v: unknown) => {
  if (v === null || v === undefined || v === "") return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const a = xs.slice().sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

async function summary(admin: any, setId: string) {
  const [{ data: set, error: setError }, { data: cases, error: caseError }] = await Promise.all([
    admin.from("intelligence_calibration_sets").select("*").eq("id", setId).single(),
    admin.from("intelligence_calibration_cases").select("id,expected_class").eq("calibration_set_id", setId),
  ]);
  if (setError || !set) throw new Error("Calibration set not found");
  if (caseError) throw caseError;

  const ids = (cases || []).map((x: any) => x.id);
  let reviews: any[] = [];
  if (ids.length) {
    const result = await admin
      .from("intelligence_calibration_reviews")
      .select("calibration_case_id,predicted_class,evidence_coverage,review_outcome,error_kind")
      .in("calibration_case_id", ids);
    if (result.error) throw result.error;
    reviews = result.data || [];
  }

  const byReview = new Map(reviews.map((x: any) => [x.calibration_case_id, x]));
  let tp = 0;
  let tn = 0;
  let fp = 0;
  let fn = 0;
  let uncertain = 0;
  let insufficient = 0;
  let reviewed = 0;
  let missingResults = 0;
  const coverage: number[] = [];

  for (const c of cases || []) {
    if (c.expected_class === "unreviewed") continue;
    reviewed++;
    const r = byReview.get(c.id);

    if (c.expected_class === "uncertain") {
      uncertain++;
      continue;
    }

    if (!r) {
      missingResults++;
      continue;
    }

    const cv = numeric(r.evidence_coverage);
    if (cv !== null) coverage.push(cv);

    if (r.predicted_class === "insufficient_evidence") {
      insufficient++;
      if (c.expected_class === "review_priority") fn++;
      else if (c.expected_class === "not_priority") tn++;
      continue;
    }

    if (c.expected_class === "review_priority" && r.predicted_class === "review_priority") tp++;
    else if (c.expected_class === "not_priority" && r.predicted_class === "not_priority") tn++;
    else if (c.expected_class === "not_priority" && r.predicted_class === "review_priority") fp++;
    else if (c.expected_class === "review_priority" && r.predicted_class === "not_priority") fn++;
  }

  const precision = (tp + fp) ? tp / (tp + fp) : null;
  const recall = (tp + fn) ? tp / (tp + fn) : null;
  const fpr = (fp + tn) ? fp / (fp + tn) : null;
  const reasons: string[] = [];

  if (reviewed < Number(set.minimum_reviewed_cases)) {
    reasons.push(`Need ${Number(set.minimum_reviewed_cases) - reviewed} more reviewed cases`);
  }
  if (missingResults > 0) reasons.push(`${missingResults} reviewed cases have no model result`);
  if (precision === null || precision < Number(set.minimum_precision)) reasons.push("Precision gate not met");
  if (recall === null || recall < Number(set.minimum_recall)) reasons.push("Recall gate not met");
  if (fpr === null || fpr > Number(set.maximum_false_positive_rate)) reasons.push("False-positive-rate gate not met");

  const row = {
    calibration_set_id: setId,
    reviewed_cases: reviewed,
    true_positives: tp,
    true_negatives: tn,
    false_positives: fp,
    false_negatives: fn,
    uncertain_cases: uncertain,
    insufficient_evidence_cases: insufficient,
    precision,
    recall,
    false_positive_rate: fpr,
    median_evidence_coverage: median(coverage),
    passes_gate: reasons.length === 0,
    gate_reasons: reasons,
    computed_at: new Date().toISOString(),
  };

  const upsert = await admin.from("intelligence_calibration_summaries").upsert(row);
  if (upsert.error) throw upsert.error;
  return { set, summary: row, total_cases: (cases || []).length, engine: ENGINE };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return out(req, 405, { error: "POST required" });

  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return out(req, 401, { error: "Sign in required" });

  const url = Deno.env.get("SUPABASE_URL") || "";
  const publishable = env("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
  const secret = env("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !publishable || !secret) return out(req, 503, { error: "Calibration service configuration incomplete" });

  const userClient = createClient(url, publishable, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData } = await userClient.auth.getUser();
  const user = authData?.user;
  if (!user) return out(req, 401, { error: "Session invalid" });

  const { data: profile } = await admin.from("profiles").select("account_role").eq("id", user.id).maybeSingle();
  if (String(profile?.account_role || "") !== "developer") return out(req, 403, { error: "Developer access required" });

  let body: any = {};
  try { body = await req.json(); } catch { return out(req, 400, { error: "Invalid JSON" }); }
  const action = clean(body?.action || "list", 60);

  try {
    if (action === "list") {
      const { data: sets, error } = await admin.from("intelligence_calibration_sets").select("*").order("created_at");
      if (error) throw error;
      const ids = (sets || []).map((x: any) => x.id);
      let summaries: any[] = [];
      let cases: any[] = [];
      if (ids.length) {
        const [summaryResult, caseResult] = await Promise.all([
          admin.from("intelligence_calibration_summaries").select("*").in("calibration_set_id", ids),
          admin.from("intelligence_calibration_cases").select("calibration_set_id,expected_class").in("calibration_set_id", ids),
        ]);
        if (summaryResult.error) throw summaryResult.error;
        if (caseResult.error) throw caseResult.error;
        summaries = summaryResult.data || [];
        cases = caseResult.data || [];
      }
      const summaryMap = new Map(summaries.map((x: any) => [x.calibration_set_id, x]));
      return out(req, 200, {
        engine: ENGINE,
        sets: (sets || []).map((s: any) => ({
          ...s,
          summary: summaryMap.get(s.id) || null,
          case_count: cases.filter((c: any) => c.calibration_set_id === s.id).length,
          unreviewed_count: cases.filter((c: any) => c.calibration_set_id === s.id && c.expected_class === "unreviewed").length,
        })),
      });
    }

    if (action === "get_set") {
      const setId = clean(body?.calibration_set_id, 80);
      const [{ data: set, error: setError }, { data: cases, error: caseError }] = await Promise.all([
        admin.from("intelligence_calibration_sets").select("*").eq("id", setId).single(),
        admin.from("intelligence_calibration_cases").select("*").eq("calibration_set_id", setId).order("created_at"),
      ]);
      if (setError || !set) return out(req, 404, { error: "Calibration set not found" });
      if (caseError) throw caseError;
      const ids = (cases || []).map((x: any) => x.id);
      let reviews: any[] = [];
      if (ids.length) {
        const result = await admin.from("intelligence_calibration_reviews").select("*").in("calibration_case_id", ids);
        if (result.error) throw result.error;
        reviews = result.data || [];
      }
      const reviewMap = new Map(reviews.map((x: any) => [x.calibration_case_id, x]));
      const s = await summary(admin, setId);
      return out(req, 200, {
        engine: ENGINE,
        set,
        cases: (cases || []).map((c: any) => ({ ...c, review: reviewMap.get(c.id) || null })),
        summary: s.summary,
      });
    }

    if (action === "import_run") {
      const setId = clean(body?.calibration_set_id, 80);
      const runId = clean(body?.run_id, 80);
      const [{ data: set, error: setError }, { data: run, error: runError }] = await Promise.all([
        admin.from("intelligence_calibration_sets").select("*").eq("id", setId).single(),
        admin.from("intelligence_runs").select("*").eq("id", runId).single(),
      ]);
      if (setError || !set) return out(req, 404, { error: "Calibration set not found" });
      if (runError || !run) return out(req, 404, { error: "Intelligence run not found" });
      if (set.model_key !== run.model_key || Number(set.model_version) !== Number(run.model_version)) {
        return out(req, 409, { error: "Run model/version does not match calibration set" });
      }

      const { data: findings, error: findingError } = await admin.from("intelligence_findings").select("*").eq("run_id", runId).order("rank");
      if (findingError) throw findingError;
      const threshold = Number(set.source_manifest?.priority_threshold ?? 60);
      const minimumCoverage = Number(run?.normalization_manifest?.minimum_evidence_coverage ?? 0);

      for (const f of findings || []) {
        const caseKey = clean(f.pams_pin || f.property_address || f.id, 200);
        const caseRow = {
          calibration_set_id: setId,
          case_key: caseKey,
          pams_pin: f.pams_pin,
          property_address: f.property_address,
          expected_class: "unreviewed",
          evidence_snapshot: {
            run_id: runId,
            finding_id: f.id,
            score: f.score,
            confidence: f.confidence,
            evidence_coverage: f.evidence_coverage,
            why_now: f.why_now,
            evidence: f.evidence,
            missing_evidence: f.missing_evidence,
            facts_hash: f.facts_hash,
          },
          source_notes: "Imported from governed Intelligence run for human calibration review.",
        };
        const caseInsert = await admin.from("intelligence_calibration_cases")
          .upsert(caseRow, { onConflict: "calibration_set_id,case_key" }).select("id").single();
        if (caseInsert.error) throw caseInsert.error;
        const predicted = Number(f.evidence_coverage) < minimumCoverage
          ? "insufficient_evidence"
          : Number(f.score) >= threshold ? "review_priority" : "not_priority";
        const reviewInsert = await admin.from("intelligence_calibration_reviews").upsert({
          calibration_case_id: caseInsert.data.id,
          model_key: run.model_key,
          model_version: run.model_version,
          actual_score: f.score,
          actual_confidence: f.confidence,
          evidence_coverage: f.evidence_coverage,
          predicted_class: predicted,
          review_outcome: "needs_review",
          review_notes: null,
          reviewer_user_id: null,
          reviewed_at: null,
        }, { onConflict: "calibration_case_id,model_key,model_version" });
        if (reviewInsert.error) throw reviewInsert.error;
      }

      await admin.from("intelligence_calibration_sets").update({
        status: "reviewing",
        source_manifest: { ...set.source_manifest, priority_threshold: threshold, last_imported_run_id: runId },
      }).eq("id", setId);
      const s = await summary(admin, setId);
      return out(req, 200, { ok: true, engine: ENGINE, imported: (findings || []).length, summary: s.summary });
    }

    if (action === "review_case") {
      const caseId = clean(body?.calibration_case_id, 80);
      const expected = clean(body?.expected_class, 40);
      if (!["review_priority", "not_priority", "uncertain"].includes(expected)) {
        return out(req, 400, { error: "Valid expected_class required" });
      }

      const { data: c, error: caseError } = await admin.from("intelligence_calibration_cases")
        .select("*,intelligence_calibration_sets!inner(model_key,model_version)").eq("id", caseId).single();
      if (caseError || !c) return out(req, 404, { error: "Calibration case not found" });

      const { data: r, error: reviewError } = await admin.from("intelligence_calibration_reviews")
        .select("*").eq("calibration_case_id", caseId)
        .eq("model_key", c.intelligence_calibration_sets.model_key)
        .eq("model_version", c.intelligence_calibration_sets.model_version).single();
      if (reviewError || !r) return out(req, 409, { error: "Calibration case has no model result to review" });

      let outcome = "needs_review";
      let errorKind: string | null = null;
      if (expected !== "uncertain") {
        const negativePrediction = r.predicted_class === "not_priority" || r.predicted_class === "insufficient_evidence";
        if (expected === "review_priority") {
          outcome = r.predicted_class === "review_priority" ? "pass" : "fail";
          if (outcome === "fail") errorKind = "false_negative";
        } else if (expected === "not_priority") {
          outcome = negativePrediction ? "pass" : "fail";
          if (outcome === "fail") errorKind = "false_positive";
        }
      }

      const caseUpdate = await admin.from("intelligence_calibration_cases").update({
        expected_class: expected,
        expected_score_min: numeric(body?.expected_score_min),
        expected_score_max: numeric(body?.expected_score_max),
        source_notes: clean(body?.source_notes, 2000) || c.source_notes,
      }).eq("id", caseId);
      if (caseUpdate.error) throw caseUpdate.error;

      const reviewUpdate = await admin.from("intelligence_calibration_reviews").update({
        review_outcome: outcome,
        error_kind: errorKind,
        review_notes: clean(body?.review_notes, 4000) || null,
        reviewer_user_id: user.id,
        reviewed_at: new Date().toISOString(),
      }).eq("id", r.id);
      if (reviewUpdate.error) throw reviewUpdate.error;

      const s = await summary(admin, c.calibration_set_id);
      return out(req, 200, { ok: true, engine: ENGINE, review_outcome: outcome, error_kind: errorKind, summary: s.summary });
    }

    if (action === "recompute") {
      return out(req, 200, await summary(admin, clean(body?.calibration_set_id, 80)));
    }

    return out(req, 400, { error: "Unsupported calibration action" });
  } catch (error) {
    console.error("intelligence-calibration-admin", error);
    return out(req, 500, { error: "Calibration operation failed", detail: clean((error as any)?.message, 500) || null, engine: ENGINE });
  }
});