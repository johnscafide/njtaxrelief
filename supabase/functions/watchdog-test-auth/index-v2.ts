import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});
const allowedOrigins = new Set([
  "https://njpropertytaxrelief.com",
  "https://www.njpropertytaxrelief.com"
]);
const allowedRedirects = [
  "https://njpropertytaxrelief.com/property/",
  "https://www.njpropertytaxrelief.com/property/"
];

const ROBUST_CANARY_PURPOSE = "robust_score_release_canary";
const ROBUST_SCORE_ID = "watchdog.watchdog_score";
const ROBUST_MODEL = "ROBUST-v1";
const ROBUST_FRAMEWORK = "ROBUST";
const ROBUST_PROVIDER_KIND = "canonical_watchdog_score";
const ROBUST_SOURCE = "Watchdog Score powered by the ROBUST Framework";
const ROBUST_CONTROL_PIN = "0101_25.01_10";

function cors(origin: string | null) {
  const safe = origin && allowedOrigins.has(origin) ? origin : "https://njpropertytaxrelief.com";
  return {
    "Access-Control-Allow-Origin": safe,
    "Access-Control-Allow-Headers": "content-type, apikey, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, private",
    "Vary": "Origin"
  };
}
function json(req: Request, status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), { status, headers: cors(req.headers.get("origin")) });
}
function isAllowedRedirect(value: string) {
  return allowedRedirects.some((prefix) => value.startsWith(prefix));
}
async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function cleanupRobustCanaryUser(userId: string) {
  await admin.from("score_observations").delete().eq("user_id", userId);
  await admin.from("watchdog_test_accounts").delete().eq("user_id", userId);
  await admin.from("account_entitlements").delete().eq("user_id", userId);
  await admin.from("profiles").delete().eq("id", userId);
  await admin.auth.admin.deleteUser(userId);
}
function robustFormulaContract(row: any) {
  const config = row?.config || {};
  const weights = config?.weights || {};
  return {
    live: row?.status === "live",
    engine_version: row?.engine_version === ROBUST_MODEL,
    operation: row?.operation === "weighted_scores",
    framework: config?.framework === ROBUST_FRAMEWORK,
    model_version: config?.model_version === ROBUST_MODEL,
    missing_component_policy: config?.missing_component_policy === "omit_and_renormalize",
    protected_characteristics_policy: config?.protected_characteristics_policy === "excluded_from_core_score",
    weights:
      Number(weights?.recourse) === 10 &&
      Number(weights?.fairness) === 20 &&
      Number(weights?.burden) === 30 &&
      Number(weights?.uniformity) === 15 &&
      Number(weights?.stability) === 15 &&
      Number(weights?.trajectory) === 10
  };
}
async function runRobustScoreCanary(req: Request, consumed: any) {
  const email = String(consumed.desired_email || "").trim().toLowerCase();
  let userId = "";
  try {
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email });
    const hashedToken = String(linkData?.properties?.hashed_token || "");
    userId = String(linkData?.user?.id || "");
    if (linkError || !hashedToken || !userId) throw new Error("sandbox_link_generation_failed");

    const authClient = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
    const { data: verified, error: verifyError } = await authClient.auth.verifyOtp({ token_hash: hashedToken, type: "email" });
    const accessToken = verified?.session?.access_token || "";
    if (verifyError || !accessToken) throw new Error("sandbox_session_verification_failed");

    const profileResult = await admin.from("profiles").upsert({
      id: userId,
      email,
      full_name: "Watchdog ROBUST Score Release Canary",
      display_name: "Watchdog ROBUST Score Release Canary",
      account_role: "developer",
      plan_tier: "standard",
      plan: "free",
      profile_complete: true,
      custom: { watchdog_test_account: true, no_real_spend: true, release_canary: true, robust_score_canary: true }
    }, { onConflict: "id" });
    if (profileResult.error) throw new Error("sandbox_profile_failed");

    const accountResult = await admin.from("watchdog_test_accounts").upsert({
      user_id: userId,
      label: "ROBUST Score Release Canary",
      last_bootstrap_at: new Date().toISOString(),
      metadata: { email, no_real_spend: true, marker_id: ROBUST_SCORE_ID }
    }, { onConflict: "user_id" });
    if (accountResult.error) throw new Error("sandbox_account_failed");

    const { data: formula, error: formulaError } = await admin
      .from("derived_formula_registry")
      .select("marker_id,engine_version,formula,dependencies,confidence,status,operation,config")
      .eq("marker_id", ROBUST_SCORE_ID)
      .maybeSingle();
    if (formulaError || !formula) throw new Error("robust_formula_registry_missing");
    const formulaContract = robustFormulaContract(formula);

    const started = Date.now();
    const scoreResponse = await fetch(`${SUPABASE_URL}/functions/v1/workbench-score`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: ANON_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ pams_pins: [ROBUST_CONTROL_PIN] })
    });
    const scoreText = await scoreResponse.text();
    let payload: any = null;
    try { payload = JSON.parse(scoreText); } catch { payload = { raw: scoreText.slice(0, 500) }; }

    const score = payload?.markers?.[ROBUST_CONTROL_PIN]?.[ROBUST_SCORE_ID];
    const meta = payload?.meta?.[ROBUST_CONTROL_PIN]?.[ROBUST_SCORE_ID] || {};
    const { data: observation } = await admin
      .from("score_observations")
      .select("score,model_version,evidence_coverage,observed_at")
      .eq("user_id", userId)
      .eq("pams_pin", ROBUST_CONTROL_PIN)
      .eq("marker_id", ROBUST_SCORE_ID)
      .eq("model_version", ROBUST_MODEL)
      .order("observed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const numericScore = Number(score);
    const runtimeContract = {
      http_ok: scoreResponse.ok,
      numeric_score: Number.isFinite(numericScore) && numericScore >= 0 && numericScore <= 100,
      status: String(meta?.status || "") === "available",
      provider_kind: String(meta?.provider_kind || "") === ROBUST_PROVIDER_KIND,
      source: String(meta?.source || "") === ROBUST_SOURCE,
      framework: String(meta?.framework || "") === ROBUST_FRAMEWORK,
      model_version: String(meta?.model_version || "") === ROBUST_MODEL,
      evidence_coverage: Number.isFinite(Number(meta?.evidence_coverage)) && Number(meta?.evidence_coverage) > 0 && Number(meta?.evidence_coverage) <= 100,
      persisted_observation: Number(observation?.score) === numericScore,
      persisted_model_version: String(observation?.model_version || "") === ROBUST_MODEL,
      persisted_coverage: Number(observation?.evidence_coverage) === Number(meta?.evidence_coverage)
    };
    const ok = scoreResponse.ok && Object.values(formulaContract).every(Boolean) && Object.values(runtimeContract).every(Boolean);
    const evidence = {
      ok,
      marker_id: ROBUST_SCORE_ID,
      control_pin: ROBUST_CONTROL_PIN,
      target_function: "workbench-score",
      status_code: scoreResponse.status,
      duration_ms: Date.now() - started,
      value: Number.isFinite(numericScore) ? numericScore : null,
      meta: {
        status: meta?.status ?? null,
        provider_kind: meta?.provider_kind ?? null,
        source: meta?.source ?? null,
        framework: meta?.framework ?? null,
        model_version: meta?.model_version ?? null,
        evidence_coverage: meta?.evidence_coverage ?? null,
        confidence: meta?.confidence ?? null
      },
      formula_contract: formulaContract,
      runtime_contract: runtimeContract,
      observation: observation ? {
        score: Number(observation.score),
        model_version: observation.model_version,
        evidence_coverage: Number(observation.evidence_coverage),
        observed_at: observation.observed_at
      } : null
    };

    await admin.from("watchdog_test_auth_events").insert({
      token_id: consumed.id,
      user_id: userId,
      event_type: "robust_score_release_canary",
      metadata: evidence
    });
    return json(req, ok ? 200 : 502, evidence);
  } catch (error) {
    const evidence = { ok: false, marker_id: ROBUST_SCORE_ID, error: String((error as Error)?.message || error) };
    await admin.from("watchdog_test_auth_events").insert({
      token_id: consumed.id,
      user_id: userId || null,
      event_type: "robust_score_release_canary_failed",
      metadata: evidence
    });
    return json(req, 500, evidence);
  } finally {
    if (userId) await cleanupRobustCanaryUser(userId);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req.headers.get("origin")) });
  if (req.method !== "POST") return json(req, 405, { error: "POST required" });

  let body: any;
  try { body = await req.json(); } catch { return json(req, 400, { error: "Invalid JSON" }); }
  const token = String(body?.token || "").trim();
  if (!/^[A-Za-z0-9_-]{40,160}$/.test(token)) return json(req, 401, { error: "Invalid or expired sandbox token" });

  const tokenHash = await sha256Hex(token);
  const now = new Date().toISOString();
  const { data: consumed, error: consumeError } = await admin
    .from("watchdog_test_bootstrap_tokens")
    .update({ used_at: now })
    .eq("token_hash", tokenHash)
    .is("used_at", null)
    .gt("expires_at", now)
    .select("id,desired_email,redirect_to,metadata")
    .maybeSingle();

  if (consumeError || !consumed) return json(req, 401, { error: "Invalid or expired sandbox token" });

  if (String(consumed.metadata?.purpose || "") === ROBUST_CANARY_PURPOSE && consumed.metadata?.no_real_spend === true) {
    return runRobustScoreCanary(req, consumed);
  }

  const email = String(consumed.desired_email || "").trim().toLowerCase();
  const redirectTo = String(consumed.redirect_to || "https://njpropertytaxrelief.com/property/dashboard");
  if (!email || !isAllowedRedirect(redirectTo)) {
    await admin.from("watchdog_test_auth_events").insert({ token_id: consumed.id, event_type: "bootstrap_rejected", metadata: { reason: "invalid_config" } });
    return json(req, 403, { error: "Sandbox bootstrap configuration rejected" });
  }

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo }
  });
  if (linkError || !linkData?.properties?.action_link || !linkData?.user?.id) {
    await admin.from("watchdog_test_auth_events").insert({ token_id: consumed.id, event_type: "bootstrap_failed", metadata: { reason: linkError?.message || "link_generation_failed" } });
    return json(req, 500, { error: "Sandbox session could not be generated" });
  }

  const userId = linkData.user.id;
  const { data: existingTest } = await admin
    .from("watchdog_test_accounts")
    .select("disabled_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (existingTest?.disabled_at) {
    await admin.from("watchdog_test_auth_events").insert({ token_id: consumed.id, user_id: userId, event_type: "bootstrap_rejected", metadata: { reason: "test_account_disabled" } });
    return json(req, 403, { error: "Sandbox account is disabled" });
  }

  const profileResult = await admin.from("profiles").upsert({
    id: userId,
    email,
    full_name: "Watchdog E2E Sandbox",
    display_name: "Watchdog E2E Sandbox",
    account_role: "developer",
    plan_tier: "standard",
    plan: "free",
    profile_complete: true,
    custom: { watchdog_test_account: true, no_real_spend: true }
  }, { onConflict: "id" });
  if (profileResult.error) {
    await admin.from("watchdog_test_auth_events").insert({ token_id: consumed.id, user_id: userId, event_type: "bootstrap_failed", metadata: { reason: "profile_upsert_failed" } });
    return json(req, 500, { error: "Sandbox profile could not be prepared" });
  }

  const accountResult = await admin.from("watchdog_test_accounts").upsert({
    user_id: userId,
    label: "Watchdog E2E Sandbox",
    last_bootstrap_at: now,
    metadata: { email, no_real_spend: true }
  }, { onConflict: "user_id" });
  if (accountResult.error) return json(req, 500, { error: "Sandbox account could not be registered" });

  await admin.from("watchdog_test_auth_events").insert({
    token_id: consumed.id,
    user_id: userId,
    event_type: "bootstrap_link_issued",
    metadata: { redirect_to: redirectTo }
  });

  return json(req, 200, {
    action_link: linkData.properties.action_link,
    redirect_to: redirectTo,
    expires_hint_seconds: 300,
    sandbox: true
  });
});
