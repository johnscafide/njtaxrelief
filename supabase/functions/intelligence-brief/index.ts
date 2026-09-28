import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

/* Watchdog Intelligence brief: the finding explained the way an experienced
   New Jersey property professional would brief a client.

   Grounding rules:
   - The finding is loaded server-side (user-owned, latest for the parcel);
     the browser never supplies facts.
   - A template brief is always built from the finding's own score,
     confidence, coverage, evidence and missing evidence.
   - When OPENAI_API_KEY works, the model may only rewrite that brief in a
     professional voice. Every number in its answer must already be in the
     verified facts, and it may not add advice, values or outcomes; otherwise
     the template brief is returned instead. */

const VERSION = "watchdog-intelligence-brief-v1";
const ORIGINS = new Set(["https://njpropertytaxrelief.com", "https://www.njpropertytaxrelief.com", "https://watchdogindex.com", "https://www.watchdogindex.com", "http://localhost:3000", "http://127.0.0.1:3000"]);
const DAILY_LIMIT = 300;
type O = Record<string, any>;
const cors = (r: Request) => ({ "Access-Control-Allow-Origin": ORIGINS.has(r.headers.get("origin") || "") ? (r.headers.get("origin") || "") : "https://www.watchdogindex.com", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin" });
const out = (r: Request, s: number, p: unknown) => new Response(JSON.stringify(p), { status: s, headers: { ...cors(r), "Content-Type": "application/json", "Cache-Control": "private, no-store" } });
const clean = (v: unknown, n = 400) => String(v ?? "").replace(/[<>]/g, "").trim().slice(0, n);
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const namedEnv = (jsonName: string, legacyName: string) => { const raw = Deno.env.get(jsonName) || ""; if (raw) { try { const x = JSON.parse(raw); if (x?.default) return String(x.default); } catch { /* legacy */ } } return Deno.env.get(legacyName) || ""; };

/* Plain labels, kept in step with property/js/watchdog-plain-language.js. */
const PLAIN: Record<string, { label: string; value: (v: number) => string }> = {
  "watchdog.tax_to_assessment_rate": { label: "tax bill vs. assessed value", value: (v) => `the yearly tax bill is ${v.toFixed(2)}% of the assessed value` },
  "watchdog.assessment_to_sale_ratio": { label: "assessment vs. last sale price", value: (v) => `it is assessed at ${Math.round(v <= 5 ? v * 100 : v)}% of the price it last sold for` },
  "watchdog.assessment_to_sale_ratio_review_window": { label: "assessment vs. a recent sale", value: (v) => `it is assessed at ${Math.round(v <= 5 ? v * 100 : v)}% of a sale within the last eight years` },
  "watchdog.sale_recency_confidence": { label: "how recent the last sale is", value: (v) => `the last sale scores ${Math.round(v)} out of 100 for recency` },
  "watchdog.closing_exception_priority": { label: "closing items to review", value: (v) => `closing items score ${Math.round(v)} out of 100 for priority` },
  "watchdog.due_diligence_signal_count": { label: "due-diligence flags", value: (v) => `${Math.round(v)} due-diligence ${v === 1 ? "flag is" : "flags are"} on record` },
  "watchdog.permit_closure_confidence": { label: "permits closed out", value: (v) => `${Math.round(v)}% of permits on record look closed` },
  "watchdog.title_constraint_stack": { label: "land-use restrictions", value: (v) => `${Math.round(v)} land-use ${v === 1 ? "restriction is" : "restrictions are"} on record` },
  "event.change_count_30d": { label: "recent record changes", value: (v) => `${Math.round(v)} record ${v === 1 ? "change" : "changes"} in the last 30 days` },
};
const META = new Set(["watchdog.source_authority_coverage", "watchdog.property_story_confidence", "watchdog.transaction_diligence_completion"]);

function missingText(e: O) {
  const id = String(e?.signal_id || ""), label = PLAIN[id]?.label || id.replace(/^(watchdog|event)\./, "").replace(/_/g, " ");
  const g = num(e?.normalization?.detail?.guard_value), detail = String(e?.normalization?.detail?.reason || "");
  if (/sale age/i.test(detail) && g != null && g > 8 && g < 400) return `the last recorded sale is about ${Math.round(g)} years old, outside the eight-year window, so I did not use it to judge the assessment`;
  if (/sale age/i.test(detail)) return "there is no usable sale date on record, so I could not compare the assessment with a sale";
  return `I could not check ${label} because that record is not available yet`;
}

function templateBrief(f: O) {
  const score = Math.round(num(f.score) || 0), conf = Math.round(num(f.confidence) || 0), cov = Math.round(num(f.evidence_coverage) || 0);
  const whyIds = new Set((Array.isArray(f.why_now) ? f.why_now : []).map((w: O) => String(w?.signal_id || "")));
  const ev = (Array.isArray(f.evidence) ? f.evidence : []).filter((e: O) => !META.has(String(e?.signal_id || "")) && PLAIN[String(e?.signal_id || "")] && num(e?.value) != null)
    .sort((a: O, b: O) => (whyIds.has(String(b.signal_id)) ? 1 : 0) - (whyIds.has(String(a.signal_id)) ? 1 : 0) || (num(b.score) || 0) - (num(a.score) || 0));
  const miss = Array.isArray(f.missing_evidence) ? f.missing_evidence : [];
  const s: string[] = [];
  const bottom = score >= 70 ? "This one deserves a close look." : score >= 40 ? "This is worth a look, but it is not urgent." : "I would treat this as low priority for now.";
  s.push(bottom);
  if (ev[0]) { const e = ev[0], st = Math.round(num(e.score) || 0); s.push(`The main reason it came up: ${PLAIN[e.signal_id].value(Number(e.value))}, which on its own is ${st >= 70 ? "a strong" : st >= 40 ? "a moderate" : "a weak"} signal (${st} out of 100).`); }
  if (ev[1]) s.push(`Also noted: ${PLAIN[ev[1].signal_id].value(Number(ev[1].value))}.`);
  if (miss[0]) s.push(`One gap: ${missingText(miss[0])}${miss.length > 1 ? `, and ${miss.length - 1} other check${miss.length > 2 ? "s were" : " was"} not available` : ""}.`);
  s.push(`My confidence is ${conf >= 75 ? "high" : conf >= 50 ? "moderate" : "low"} (${conf}%), based on ${cov}% of the evidence I normally use.`);
  return s.join(" ");
}

/* Every number the model writes must already be in the verified brief or facts. */
function numbersIn(text: string) { return (text.match(/\d+(?:\.\d+)?/g) || []).map((x) => String(Number(x))); }
function grounded(candidate: string, allowed: Set<string>) {
  if (!candidate || candidate.length < 40 || candidate.length > 1200) return false;
  if (/\b(guarantee|will win|should appeal|recommend(?:ed)? (?:an? )?appeal|worth \$|market value is|likely to sell|motivated)\b/i.test(candidate)) return false;
  return numbersIn(candidate).every((n) => allowed.has(n));
}

async function aiVoice(brief: string, facts: O) {
  const apiKey = Deno.env.get("OPENAI_API_KEY") || "";
  if (!apiKey) return { text: null, status: "provider_unavailable", model: null as string | null, usage: null as O | null };
  const model = clean(Deno.env.get("WATCHDOG_BRIEF_MODEL") || Deno.env.get("WATCHDOG_ANALYST_MODEL") || "gpt-5.6-luna", 80);
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 9000);
  try {
    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST", signal: ctl.signal, headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model, store: false, reasoning: { effort: "low" },
        instructions: "You are Watchdog Intelligence, briefing a client the way an experienced New Jersey property professional would: plain, direct, calm, first person, no jargon, no hype. Rewrite the draft brief in that voice in 3 to 5 short sentences. Use only the facts given. Do not add any number, value, dollar amount, percentage, date, recommendation, legal opinion, prediction or outcome that is not in the draft. Keep every number exactly as written. Do not mention formulas, signals, models or scores other than those in the draft.",
        input: `Draft brief:\n${brief}\n\nVerified facts (JSON):\n${JSON.stringify(facts).slice(0, 8000)}`,
        text: { format: { type: "json_schema", name: "watchdog_brief", strict: true, schema: { type: "object", additionalProperties: false, properties: { brief: { type: "string" } }, required: ["brief"] } } },
      }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return { text: null, status: "provider_error", model, usage: null };
    let textOut = typeof data.output_text === "string" ? data.output_text : "";
    if (!textOut) for (const item of Array.isArray(data.output) ? data.output : []) for (const part of Array.isArray(item?.content) ? item.content : []) if (typeof part?.text === "string") textOut = part.text;
    let parsed: O = {}; try { parsed = JSON.parse(textOut); } catch { /* not JSON */ }
    return { text: clean(parsed.brief, 1200) || null, status: "complete", model, usage: data?.usage || null };
  } catch {
    return { text: null, status: "provider_unavailable", model, usage: null };
  } finally { clearTimeout(timer); }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return out(req, 405, { error: "POST required" });
  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return out(req, 401, { error: "Sign in required" });
  const url = Deno.env.get("SUPABASE_URL") || "", pub = namedEnv("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY"), secret = namedEnv("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !pub || !secret) return out(req, 503, { error: "Brief configuration incomplete" });
  const userClient = createClient(url, pub, { global: { headers: { Authorization: auth } }, auth: { persistSession: false, autoRefreshToken: false } });
  const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData } = await userClient.auth.getUser(); const user = authData?.user;
  if (!user) return out(req, 401, { error: "Session invalid" });
  let body: O = {}; try { body = await req.json(); } catch { return out(req, 400, { error: "Invalid JSON" }); }
  const pin = clean(body.pams_pin, 100);
  if (!pin) return out(req, 400, { error: "pams_pin is required" });

  const since = new Date(Date.now() - 86400000).toISOString();
  const { count } = await admin.from("intelligence_usage_events").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("event_type", "intelligence_brief").gte("created_at", since);
  if (Number(count || 0) >= DAILY_LIMIT) return out(req, 429, { error: "Daily brief limit reached." });

  // The caller's own latest finding for this parcel (created by the review they just ran).
  const { data: f, error } = await admin.from("intelligence_findings").select("id,run_id,pams_pin,property_address,score,confidence,evidence_coverage,why_now,evidence,missing_evidence,created_at").eq("user_id", user.id).eq("pams_pin", pin).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) return out(req, 503, { error: "Findings unavailable" });
  if (!f) return out(req, 404, { error: "Run the review for this property first." });

  const [{ data: ent }, { data: profile }] = await Promise.all([admin.from("account_entitlements").select("plan_tier").eq("user_id", user.id).maybeSingle(), admin.from("profiles").select("account_role").eq("id", user.id).maybeSingle()]);
  const plan = String(profile?.account_role || "") === "developer" ? "developer" : String(ent?.plan_tier || "standard");
  const started = Date.now();
  const template = templateBrief(f);
  const facts = {
    address: f.property_address || null, score: Math.round(num(f.score) || 0), confidence: Math.round(num(f.confidence) || 0), evidence_coverage: Math.round(num(f.evidence_coverage) || 0),
    evidence: (Array.isArray(f.evidence) ? f.evidence : []).map((e: O) => ({ signal: e.signal_id, value: e.value, strength: Math.round(num(e.score) || 0) })),
    missing: (Array.isArray(f.missing_evidence) ? f.missing_evidence : []).map((e: O) => ({ signal: e.signal_id, why: missingText(e) })),
  };
  const allowed = new Set([...numbersIn(template), ...numbersIn(JSON.stringify(facts))]);
  const ai = await aiVoice(template, facts);
  const useAi = !!ai.text && grounded(ai.text, allowed);
  const brief = useAi ? ai.text! : template;
  const source = useAi ? "ai" : "template";

  await admin.from("intelligence_usage_events").insert({ user_id: user.id, plan_tier: plan, event_type: "intelligence_brief", provider: useAi ? "openai" : null, model: useAi ? ai.model : null, request_units: 1, input_tokens: Number(ai.usage?.input_tokens || 0) || null, output_tokens: Number(ai.usage?.output_tokens || 0) || null, latency_ms: Date.now() - started, metadata: { version: VERSION, finding_id: f.id, source, provider_status: ai.status, ai_rejected: !!ai.text && !useAi } });
  return out(req, 200, { ok: true, brief, source, finding_id: f.id, version: VERSION });
});
