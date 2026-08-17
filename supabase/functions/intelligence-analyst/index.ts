import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const ANALYST_VERSION = "watchdog-analyst-v2";
const TOOL_VERSION = "watchdog-analyst-tools-v2";
const ORIGINS = new Set([
  "https://njpropertytaxrelief.com",
  "https://www.njpropertytaxrelief.com",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);
const PLAN_RANK: Record<string, number> = {
  standard: 0, agent: 1, pro: 2, pro_plus: 3, teams: 4, developer: 5,
};
const PREVIEW_LIMITS: Record<string, number> = {
  pro: 75, pro_plus: 300, teams: 1500, developer: 10000,
};
const APPROVED_ACTIONS = new Set(["create_case", "create_report", "watch_property"]);

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
function clean(value: unknown, max = 1200) {
  return String(value ?? "").replace(/[<>]/g, "").trim().slice(0, max);
}
function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}
function safeObject(value: unknown, max = 25000): AnyObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  try { return JSON.stringify(value).length <= max ? value as AnyObject : {}; } catch { return {}; }
}
function namedEnv(jsonName: string, legacyName: string) {
  const raw = Deno.env.get(jsonName) || "";
  if (raw) {
    try { const parsed = JSON.parse(raw); if (parsed?.default) return String(parsed.default); } catch { /* fall through */ }
  }
  return Deno.env.get(legacyName) || "";
}
function safeUrl(value: unknown) {
  try {
    const url = new URL(String(value || ""));
    return /^https?:$/.test(url.protocol) ? url.href : null;
  } catch { return null; }
}
function protectedRequest(prompt: string) {
  const targeting = /\b(find|rank|target|filter|exclude|include|prioritize|prospect)\b/i.test(prompt);
  const protectedTerm = /\b(race|racial|ethnic|ethnicity|religion|religious|disability|disabled|familial status|families with children|national origin|sex|gender|sexual orientation|pregnan|marital status)\b/i.test(prompt);
  if (targeting && protectedTerm) {
    return "Watchdog cannot rank, target, include, or exclude housing opportunities using protected or sensitive personal characteristics.";
  }
  if (/\b(likely to sell|will sell|motivated seller|distressed owner|desperate owner|foreclosure likelihood|divorce|death|health condition)\b/i.test(prompt)) {
    return "Watchdog does not infer seller intent, personal distress, private life events, or a person's likelihood to transact.";
  }
  if (/\b(guarantee|guaranteed|certain profit|sure profit|guaranteed appeal|win probability)\b/i.test(prompt)) {
    return "Watchdog cannot guarantee profits, appeal outcomes, values, or transaction results. It can show governed evidence and user-controlled scenarios.";
  }
  return null;
}

function routeIntent(prompt: string, context: AnyObject) {
  const p = prompt.toLowerCase();
  let tool = "run_intelligence_model";
  let model = "assessment_anomaly";
  if (/\b(create|open|start)\b.*\bcase\b/.test(p)) tool = "create_case";
  else if (/\b(create|draft|start)\b.*\breport\b/.test(p)) tool = "create_report";
  else if (/\b(watch|monitor|track)\b.*\b(property|this|result|finding)\b/.test(p)) tool = "watch_property";
  else if (/\b(score history|historical score|score trend)\b/.test(p)) tool = "get_score_history";
  else if (/\b(source|formula|lineage|where did|why flagged|why this)\b/.test(p)) tool = "inspect_lineage";
  else if (/\b(changed|changes|what changed|update history)\b/.test(p) && !/\b(rank|top|find|priority|prioritize)\b/.test(p)) tool = "get_property_changes";

  if (/\b(closing|permit|title|due diligence|transaction exception)\b/.test(p)) model = "closing_review";
  else if (/\b(change intelligence|recent changes|material changes|changed properties)\b/.test(p)) model = "property_change_priority";

  const count = p.match(/\b(?:top|find|show|rank)\s+(\d{1,3})\b/);
  return {
    tool,
    model,
    limit: Math.max(1, Math.min(Number(count?.[1] || 10), 50)),
    farm: /\bfarm\b/.test(p),
    savedView: /\b(saved view|workbench view)\b/.test(p) && !!context.saved_view_id,
    compare: /\bcompare\b/.test(p),
  };
}

function deterministicResponse(tool: string, result: AnyObject) {
  const evidence: string[] = [];
  const missing: string[] = [];
  const caveats: string[] = [];
  const suggested: string[] = [];
  const sources: { label: string; url: string | null }[] = [];

  if (tool === "run_intelligence_model") {
    const findings = Array.isArray(result.findings) ? result.findings : [];
    for (const finding of findings.slice(0, 5)) {
      const label = clean(finding.property_address || finding.pams_pin || "Property", 180);
      evidence.push(`${label}: Watchdog review score ${Math.round(Number(finding.score || 0))}/100, confidence ${Math.round(Number(finding.confidence || 0))}%, evidence ${Math.round(Number(finding.evidence_coverage || 0))}%.`);
      for (const why of (Array.isArray(finding.why_now) ? finding.why_now : []).slice(0, 2)) {
        evidence.push(`${label}: ${clean(why.signal_id, 140)} normalized ${Math.round(Number(why.score || 0))}/100${why.explanation ? `: ${clean(why.explanation, 260)}` : ""}.`);
      }
      for (const item of (Array.isArray(finding.missing_evidence) ? finding.missing_evidence : []).slice(0, 3)) {
        missing.push(`${label}: ${clean(item.signal_id, 140)} (${clean(item.reason || "missing", 120)}).`);
      }
      for (const item of Array.isArray(finding.evidence) ? finding.evidence : []) {
        const url = safeUrl(item.source_url);
        if (url) sources.push({ label: clean(item.signal_id || item.source_key || "Source", 140), url });
      }
      for (const action of Array.isArray(finding.recommended_actions) ? finding.recommended_actions : []) suggested.push(clean(action, 80));
    }
    if (result.warning) caveats.push(clean(result.warning, 400));
    caveats.push("Scores rank governed evidence for review. They are not valuations, legal conclusions, seller predictions, or guaranteed outcomes.");
    return {
      conclusion: findings.length
        ? `Watchdog found ${findings.length} evidence-backed review finding${findings.length === 1 ? "" : "s"}. The strongest findings are shown first.`
        : "No evidence-backed finding was produced for this governed scope. Watchdog did not fill the gap with a guess.",
      evidence,
      missing_evidence: unique(missing),
      caveats: unique(caveats),
      suggested_actions: unique(suggested),
      sources: [...new Map(sources.map((item) => [item.url, item])).values()],
    };
  }

  if (tool === "get_score_history") {
    const rows = Array.isArray(result.rows) ? result.rows : [];
    return {
      conclusion: rows.length ? `I found ${rows.length} recorded Watchdog score observation${rows.length === 1 ? "" : "s"}.` : "No user-linked Watchdog score history is available for this property yet.",
      evidence: rows.slice(0, 10).map((row: AnyObject) => `${clean(row.marker_id || "Watchdog score", 120)}: ${clean(row.score, 40)} on ${clean(row.observed_on || row.observed_at, 40)}.`),
      missing_evidence: rows.length ? [] : ["Historical score observations are not available for this user/property combination."],
      caveats: ["Historical observations keep the formula and model version recorded at the time."],
      suggested_actions: ["review_evidence"],
      sources: [],
    };
  }

  if (tool === "get_property_changes") {
    const rows = Array.isArray(result.rows) ? result.rows : [];
    for (const row of rows) {
      const url = safeUrl(row.source_url);
      if (url) sources.push({ label: clean(row.title || row.event_type || "Source", 140), url });
    }
    return {
      conclusion: rows.length ? `I found ${rows.length} governed property change event${rows.length === 1 ? "" : "s"}.` : "No governed property change events are available for this property in your Watchdog history.",
      evidence: rows.slice(0, 10).map((row: AnyObject) => `${clean(row.title || row.event_type, 160)}${row.summary ? `: ${clean(row.summary, 260)}` : ""} (${clean(row.occurred_at, 40)}).`),
      missing_evidence: [],
      caveats: ["A public-record change is not evidence of seller intent or guaranteed financial impact."],
      suggested_actions: ["review_evidence", "watch_property"],
      sources: [...new Map(sources.map((item) => [item.url, item])).values()],
    };
  }

  if (tool === "inspect_lineage") {
    const finding = result.finding;
    if (!finding) return {
      conclusion: "No owned Intelligence finding is available to inspect for this property.",
      evidence: [], missing_evidence: ["Run Watchdog Intelligence for this property first."], caveats: [], suggested_actions: ["run_intelligence_model"], sources: [],
    };
    for (const item of Array.isArray(finding.evidence) ? finding.evidence : []) {
      evidence.push(`${clean(item.signal_id, 140)}: normalized ${Math.round(Number(item.score || 0))}/100${item.value != null ? `, source value ${clean(item.value, 80)}` : ""}.`);
      const url = safeUrl(item.source_url);
      if (url) sources.push({ label: clean(item.signal_id, 140), url });
    }
    for (const item of Array.isArray(finding.missing_evidence) ? finding.missing_evidence : []) missing.push(`${clean(item.signal_id, 140)}: ${clean(item.reason || "missing", 120)}.`);
    return {
      conclusion: `This finding is traceable to run ${clean(finding.run_id, 60)} and facts hash ${clean(finding.facts_hash || "not recorded", 32)}.`,
      evidence, missing_evidence: missing,
      caveats: ["Lineage explains how Watchdog produced a finding. It does not turn a derived signal into a source record."],
      suggested_actions: ["create_case", "create_report", "watch_property"],
      sources: [...new Map(sources.map((item) => [item.url, item])).values()],
    };
  }

  return {
    conclusion: clean(result.message || "The requested Watchdog action was completed.", 500),
    evidence: Array.isArray(result.evidence) ? result.evidence : [],
    missing_evidence: [],
    caveats: ["The action preserves the source Intelligence lineage for later review."],
    suggested_actions: [], sources: [],
  };
}

function extractOutputText(data: AnyObject) {
  if (typeof data.output_text === "string") return data.output_text;
  const output = Array.isArray(data.output) ? data.output : [];
  for (const item of output) for (const part of Array.isArray(item?.content) ? item.content : []) if (typeof part?.text === "string") return part.text;
  return "";
}
async function optionalProse(promptRow: AnyObject, prompt: string, base: AnyObject) {
  const apiKey = Deno.env.get("OPENAI_API_KEY") || "";
  if (!apiKey) return { status: "provider_unavailable", provider: null, model: null, response: base, usage: null };
  const model = clean(Deno.env.get("WATCHDOG_ANALYST_MODEL") || promptRow.model || "gpt-5.6-luna", 80);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST", signal: controller.signal,
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model, store: false, reasoning: { effort: "low" },
        instructions: clean(promptRow.system_contract, 5000),
        input: `User request:\n${prompt}\n\nApproved Watchdog response:\n${JSON.stringify(base).slice(0, 30000)}\n\nRewrite only conclusion and caveats for clarity. Do not add facts, evidence, sources, actions, values, probabilities, or claims.`,
        text: { format: { type: "json_schema", name: "watchdog_analyst_prose", strict: true, schema: {
          type: "object", additionalProperties: false,
          properties: { conclusion: { type: "string" }, caveats: { type: "array", items: { type: "string" } } },
          required: ["conclusion", "caveats"],
        } } },
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(clean(data?.error?.message || `OpenAI ${response.status}`, 300));
    let parsed: AnyObject = {};
    try { parsed = JSON.parse(extractOutputText(data)); } catch { /* deterministic fallback */ }
    return {
      status: "complete", provider: "openai", model, usage: data?.usage || null,
      response: { ...base, conclusion: clean(parsed.conclusion || base.conclusion, 1400), caveats: Array.isArray(parsed.caveats) ? unique(parsed.caveats.map((x: unknown) => clean(x, 500))) : base.caveats },
    };
  } catch (error) {
    return { status: "provider_unavailable", provider: "openai", model, usage: null, error: clean((error as any)?.message || error, 300), response: base };
  } finally { clearTimeout(timer); }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return json(req, 405, { error: "POST required" });
  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return json(req, 401, { error: "Sign in required" });

  const url = Deno.env.get("SUPABASE_URL") || "";
  const publishable = namedEnv("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
  const secret = namedEnv("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !publishable || !secret) return json(req, 503, { error: "Analyst configuration incomplete" });
  const userClient = createClient(url, publishable, { global: { headers: { Authorization: auth } }, auth: { persistSession: false, autoRefreshToken: false } });
  const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData } = await userClient.auth.getUser();
  const user = authData?.user;
  if (!user) return json(req, 401, { error: "Session invalid" });

  let body: AnyObject = {};
  try { body = await req.json(); } catch { return json(req, 400, { error: "Invalid JSON" }); }
  const prompt = clean(body.prompt, 1800);
  if (!prompt) return json(req, 400, { error: "prompt is required" });
  const context = safeObject(body.context, 20000);

  const [{ data: entitlement }, { data: profile }, { data: promptRows }] = await Promise.all([
    admin.from("account_entitlements").select("plan_tier,profession").eq("user_id", user.id).maybeSingle(),
    admin.from("profiles").select("account_role").eq("id", user.id).maybeSingle(),
    admin.from("intelligence_prompt_versions").select("prompt_key,version,model,system_contract,status").eq("prompt_key", "watchdog_analyst").in("status", ["preview", "live"]).order("version", { ascending: false }).limit(1),
  ]);
  const plan = String(profile?.account_role || "") === "developer" ? "developer" : String(entitlement?.plan_tier || "standard");
  if ((PLAN_RANK[plan] ?? 0) < PLAN_RANK.pro) return json(req, 403, { error: "Pro plan required", minimum_plan: "pro" });
  const profession = clean(entitlement?.profession || context.profession || "general", 80) || "general";

  const since = new Date(Date.now() - 86400000).toISOString();
  const { count } = await admin.from("intelligence_usage_events").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("event_type", "analyst_request").gte("created_at", since);
  if (Number(count || 0) >= (PREVIEW_LIMITS[plan] || PREVIEW_LIMITS.pro)) return json(req, 429, { error: "Watchdog Analyst preview usage limit reached for this rolling 24-hour window." });
  const promptRow = Array.isArray(promptRows) ? promptRows[0] : null;
  if (!promptRow) return json(req, 503, { error: "Analyst prompt registry unavailable" });

  let sessionId = clean(body.session_id, 80);
  let session: AnyObject | null = null;
  if (sessionId) {
    const lookup = await admin.from("intelligence_analyst_sessions").select("id,user_id,context,profession").eq("id", sessionId).eq("user_id", user.id).maybeSingle();
    session = lookup.data;
    if (!session) return json(req, 404, { error: "Analyst session not found" });
  } else {
    const created = await admin.from("intelligence_analyst_sessions").insert({ user_id: user.id, profession, context, title: prompt.slice(0, 90) }).select("id,context,profession").single();
    if (created.error || !created.data) return json(req, 503, { error: "Could not start Analyst session" });
    session = created.data; sessionId = String(created.data.id);
  }

  const blocked = protectedRequest(prompt);
  const userMessage = await admin.from("intelligence_analyst_messages").insert({
    session_id: sessionId, user_id: user.id, role: "user", content: { text: prompt },
    prompt_key: promptRow.prompt_key, prompt_version: promptRow.version, tool_contract_version: TOOL_VERSION,
    status: blocked ? "refused" : "complete",
  }).select("id").single();
  if (blocked) {
    const response = { conclusion: blocked, evidence: [], missing_evidence: [], caveats: ["Watchdog did not run a property tool for this request."], suggested_actions: [], sources: [] };
    await admin.from("intelligence_analyst_messages").insert({ session_id: sessionId, user_id: user.id, role: "assistant", content: response, prompt_key: promptRow.prompt_key, prompt_version: promptRow.version, tool_contract_version: TOOL_VERSION, status: "refused" });
    await admin.from("intelligence_usage_events").insert({ user_id: user.id, plan_tier: plan, event_type: "analyst_request", metadata: { status: "refused", reason: "guardrail", analyst_version: ANALYST_VERSION } });
    return json(req, 200, { ok: true, session_id: sessionId, status: "refused", provider_status: "not_called", response });
  }

  const routed = routeIntent(prompt, { ...safeObject(session?.context), ...context });
  const pins = unique((Array.isArray(context.pams_pins) ? context.pams_pins : []).map((x: unknown) => clean(x, 100))).slice(0, 100);
  const started = Date.now();
  let toolResult: AnyObject = {};
  let toolStatus = "complete";
  try {
    if (routed.tool === "run_intelligence_model") {
      let functionName = routed.model === "closing_review" ? "intelligence-closing-run-preview" : routed.model === "property_change_priority" ? "intelligence-change-run-preview" : "intelligence-assessment-run-preview";
      let payload: AnyObject;
      if (routed.savedView) {
        functionName = "intelligence-workbench-view-preview";
        payload = { model_key: routed.model, scope_id: clean(context.saved_view_id, 80), limit: routed.limit };
      } else if (routed.farm) {
        payload = { model_key: routed.model, scope_type: "farm", scope_value: { source: "watchdog_analyst" }, limit: routed.limit };
      } else {
        if (!pins.length) throw new Error("Load or select governed Workbench properties before asking Watchdog to analyze them.");
        payload = { model_key: routed.model, scope_type: pins.length === 1 ? "property" : "custom", scope_value: { source: "watchdog_analyst", compare: routed.compare }, pams_pins: pins, limit: routed.limit };
      }
      const call = await fetch(`${url}/functions/v1/${functionName}`, { method: "POST", headers: { Authorization: auth, apikey: publishable, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      toolResult = await call.json().catch(() => ({}));
      if (!call.ok) throw new Error(clean(toolResult.error || `Intelligence tool failed (${call.status})`, 400));
      const runId = clean(toolResult.run_id, 80);
      let findingIds: string[] = [];
      if (runId) {
        const rows = await admin.from("intelligence_findings").select("id").eq("run_id", runId).eq("user_id", user.id).order("rank", { ascending: true }).limit(100);
        findingIds = (rows.data || []).map((row: AnyObject) => String(row.id));
      }
      await admin.from("intelligence_analyst_sessions").update({ context: { ...safeObject(session?.context), ...context, last_run_id: runId || null, last_finding_ids: findingIds, last_model_key: toolResult?.model?.key || routed.model, last_model_version: toolResult?.model?.version || null }, updated_at: new Date().toISOString() }).eq("id", sessionId).eq("user_id", user.id);
    } else if (routed.tool === "get_score_history") {
      const pin = pins[0]; if (!pin) throw new Error("Select one property first.");
      const q = await admin.from("score_observations").select("marker_id,score,observed_on,observed_at,model_version,evidence_coverage,formula").eq("user_id", user.id).eq("pams_pin", pin).order("observed_at", { ascending: false }).limit(25);
      if (q.error) throw q.error; toolResult = { rows: q.data || [], pams_pin: pin };
    } else if (routed.tool === "get_property_changes") {
      const pin = pins[0]; if (!pin) throw new Error("Select one property first.");
      const q = await admin.from("property_update_events").select("event_type,severity,title,summary,occurred_at,marker_id,old_value,new_value,delta_numeric,source_url").eq("user_id", user.id).eq("pams_pin", pin).order("occurred_at", { ascending: false }).limit(50);
      if (q.error) throw q.error; toolResult = { rows: q.data || [], pams_pin: pin };
    } else {
      const lastIds = Array.isArray(session?.context?.last_finding_ids) ? session!.context.last_finding_ids : [];
      const pin = pins[0];
      let fq = admin.from("intelligence_findings").select("id,run_id,pams_pin,property_address,opportunity_type,score,confidence,evidence_coverage,why_now,evidence,missing_evidence,recommended_actions,facts_hash,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1);
      if (lastIds.length) fq = fq.in("id", lastIds); else if (pin) fq = fq.eq("pams_pin", pin);
      const found = await fq.maybeSingle(); if (found.error) throw found.error;
      const finding = found.data;
      if (routed.tool === "inspect_lineage") toolResult = { finding: finding || null };
      else {
        if (!APPROVED_ACTIONS.has(routed.tool)) throw new Error("That Analyst operation is not approved yet.");
        if (!finding) throw new Error("Run Watchdog Intelligence first so this action has an evidence-backed finding to preserve.");
        const markers = unique((Array.isArray(finding.evidence) ? finding.evidence : []).map((item: AnyObject) => clean(item.signal_id, 140)));
        if (routed.tool === "create_case") {
          const q = await admin.from("professional_cases").insert({ user_id: user.id, pams_pin: finding.pams_pin, title: `Intelligence Review: ${finding.property_address || finding.pams_pin}`.slice(0, 240), property_address: finding.property_address || null, profession, pinned_marker_ids: markers, evidence_snapshot: { kind: "watchdog_intelligence", finding_id: finding.id, run_id: finding.run_id, score: finding.score, confidence: finding.confidence, evidence_coverage: finding.evidence_coverage, why_now: finding.why_now, evidence: finding.evidence, missing_evidence: finding.missing_evidence, facts_hash: finding.facts_hash, captured_at: new Date().toISOString() }, notes: "Created by Watchdog Analyst from an evidence-backed finding." }).select("id").single();
          if (q.error) throw q.error; toolResult = { message: "Created a Professional Case from the current evidence-backed finding.", artifact_type: "case", artifact_id: q.data.id, evidence: [`Finding ${finding.id}: score ${finding.score}, evidence ${finding.evidence_coverage}%`] };
        }
        if (routed.tool === "create_report") {
          const q = await admin.from("professional_reports").insert({ user_id: user.id, pams_pin: finding.pams_pin || null, title: `Watchdog Intelligence: ${finding.property_address || finding.pams_pin || "Review"}`.slice(0, 240), profession, preset: "custom", selected_marker_ids: markers, source_manifest: [{ source_kind: "watchdog_intelligence_finding", finding_id: finding.id, run_id: finding.run_id, facts_hash: finding.facts_hash, evidence_signals: markers }] }).select("id").single();
          if (q.error) throw q.error; toolResult = { message: "Created a draft Professional Report with the Intelligence lineage attached.", artifact_type: "report", artifact_id: q.data.id, evidence: [`Finding ${finding.id}: ${markers.length} evidence signals preserved`] };
        }
        if (routed.tool === "watch_property") {
          const existing = await admin.from("saved_properties").select("id").eq("user_id", user.id).eq("pams_pin", finding.pams_pin).eq("kind", "watch").maybeSingle();
          let id = existing.data?.id;
          if (!id) {
            const q = await admin.from("saved_properties").insert({ user_id: user.id, pams_pin: finding.pams_pin, address: finding.property_address || finding.pams_pin, kind: "watch", source_ref: `watchdog_analyst:${finding.id}` }).select("id").single();
            if (q.error) throw q.error; id = q.data.id;
          }
          toolResult = { message: "This property is now on your Watchdog watchlist.", artifact_type: "watch", artifact_id: id, evidence: [`Finding ${finding.id} remains the source lineage for this action.`] };
        }
        const run = await admin.from("intelligence_runs").select("model_key,model_version").eq("id", finding.run_id).eq("user_id", user.id).maybeSingle();
        await admin.from("intelligence_outcome_events").insert({ finding_id: finding.id, run_id: finding.run_id, user_id: user.id, event_type: routed.tool === "create_case" ? "case_created" : routed.tool === "create_report" ? "report_created" : "watch_started", artifact_type: toolResult.artifact_type, artifact_id: String(toolResult.artifact_id || ""), model_key: run.data?.model_key || finding.opportunity_type || "unknown", model_version: Number(run.data?.model_version || 1), facts_hash: finding.facts_hash, signal_snapshot: Array.isArray(finding.evidence) ? finding.evidence : [], metadata: { source: "watchdog_analyst", profession, objective: finding.opportunity_type || "general", tool_version: TOOL_VERSION } });
      }
    }
  } catch (error) {
    toolStatus = "failed"; toolResult = { error: clean((error as any)?.message || error, 500) };
  }

  const latency = Date.now() - started;
  const toolCall = await admin.from("intelligence_tool_calls").insert({ session_id: sessionId, message_id: userMessage.data?.id || null, user_id: user.id, tool_name: routed.tool, tool_version: TOOL_VERSION, arguments: { model: routed.model, pams_pin_count: pins.length, farm: routed.farm, saved_view: routed.savedView, compare: routed.compare, limit: routed.limit }, result_summary: toolStatus === "complete" ? { run_id: toolResult.run_id || null, finding_count: toolResult.finding_count ?? null, artifact_type: toolResult.artifact_type || null, artifact_id: toolResult.artifact_id || null, row_count: Array.isArray(toolResult.rows) ? toolResult.rows.length : null } : { error: toolResult.error }, status: toolStatus, duration_ms: latency }).select("id").single();

  if (toolStatus !== "complete") {
    const response = { conclusion: "Watchdog could not complete that approved operation.", evidence: [], missing_evidence: [toolResult.error], caveats: ["No factual conclusion was generated from a failed tool call."], suggested_actions: [], sources: [] };
    await admin.from("intelligence_analyst_messages").insert({ session_id: sessionId, user_id: user.id, role: "assistant", content: response, prompt_key: promptRow.prompt_key, prompt_version: promptRow.version, tool_contract_version: TOOL_VERSION, status: "failed" });
    await admin.from("intelligence_usage_events").insert({ user_id: user.id, plan_tier: plan, event_type: "analyst_request", latency_ms: latency, metadata: { status: "failed", tool: routed.tool, analyst_version: ANALYST_VERSION } });
    return json(req, 200, { ok: false, session_id: sessionId, status: "failed", tool: { name: routed.tool, version: TOOL_VERSION, id: toolCall.data?.id || null }, provider_status: "not_called", response });
  }

  const base = deterministicResponse(routed.tool, toolResult);
  const provider = await optionalProse(promptRow, prompt, base);
  const messageStatus = provider.status === "complete" ? "complete" : "provider_unavailable";
  const assistant = await admin.from("intelligence_analyst_messages").insert({ session_id: sessionId, user_id: user.id, role: "assistant", content: provider.response, provider: provider.provider, model: provider.model, prompt_key: promptRow.prompt_key, prompt_version: promptRow.version, tool_contract_version: TOOL_VERSION, status: messageStatus }).select("id").single();
  await admin.from("intelligence_usage_events").insert({ user_id: user.id, plan_tier: plan, event_type: "analyst_request", provider: provider.provider, model: provider.model, request_units: 1, input_tokens: Number(provider.usage?.input_tokens || 0) || null, output_tokens: Number(provider.usage?.output_tokens || 0) || null, latency_ms: Date.now() - started, metadata: { status: messageStatus, tool: routed.tool, tool_version: TOOL_VERSION, prompt_version: promptRow.version, analyst_version: ANALYST_VERSION } });
  return json(req, 200, { ok: true, session_id: sessionId, message_id: assistant.data?.id || null, status: messageStatus, provider_status: provider.status, provider: provider.provider, model: provider.model, prompt: { key: promptRow.prompt_key, version: promptRow.version }, tool: { name: routed.tool, version: TOOL_VERSION, id: toolCall.data?.id || null }, response: provider.response, provider_error: provider.error || null });
});
