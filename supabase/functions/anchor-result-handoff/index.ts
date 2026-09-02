import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const ALLOWED_ORIGINS = new Set([
  "https://njpropertytaxrelief.com",
  "https://www.njpropertytaxrelief.com",
  "https://watchdogindex.com",
  "https://www.watchdogindex.com",
]);

function adminKey(): string {
  const modern = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (modern) {
    try {
      const parsed = JSON.parse(modern);
      if (parsed?.default) return String(parsed.default);
    } catch (_) {}
  }
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!legacy) throw new Error("Missing Supabase admin key");
  return legacy;
}

const db = createClient(Deno.env.get("SUPABASE_URL")!, adminKey(), {
  auth: { persistSession: false, autoRefreshToken: false },
});

function cors(req: Request) {
  const origin = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "https://www.watchdogindex.com",
    "Access-Control-Allow-Headers": "content-type, apikey, authorization, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(req), "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function str(value: unknown, max = 500): string {
  return String(value == null ? "" : value).trim().slice(0, max);
}

function normalizeEmail(value: unknown): string | null {
  const email = str(value, 254).toLowerCase();
  return /^[^@\s]+@[^@\s.]+\.[^@\s]{2,}$/.test(email) ? email : null;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function answer(value: unknown, allowed: string[]): string {
  const clean = str(value, 40).toLowerCase();
  return allowed.includes(clean) ? clean : "";
}

function computeAnchor(raw: Record<string, unknown>) {
  const tenure = answer(raw.tenure, ["own", "rent"]);
  const income = answer(raw.income, ["low", "mid", "high"]);
  const age = answer(raw.age, ["yes", "no"]);
  const primary = answer(raw.primary, ["yes", "no"]);
  const taxes = answer(raw.taxes, ["yes", "no"]);

  const qualifies = Boolean(
    tenure && income &&
    primary !== "no" &&
    income !== "high" &&
    !(tenure === "rent" && income === "mid") &&
    !(tenure === "own" && taxes === "no")
  );

  let benefit = 0;
  if (qualifies) {
    if (tenure === "own") benefit = income === "low" ? 1500 : 1000;
    else benefit = age === "yes" ? 700 : 450;
  }

  return {
    tenure,
    income,
    age,
    primary,
    taxes,
    qualifies,
    benefit,
    eligibility_label: qualifies ? "Likely eligible based on the answers provided" : "Not currently estimated as eligible based on the answers provided",
  };
}

function firstName(value: unknown): string {
  return str(value, 100).split(/\s+/)[0].slice(0, 60);
}

async function stage(req: Request, body: Record<string, any>) {
  const origin = req.headers.get("origin") || "";
  if (!ALLOWED_ORIGINS.has(origin) || !origin.includes("njpropertytaxrelief.com")) {
    return json(req, { error: "This handoff can only begin from NJPropertyTaxRelief.com." }, 403);
  }

  const email = normalizeEmail(body.email);
  const code = str(body.code, 12).replace(/\D/g, "");
  const result = body.result && typeof body.result === "object" ? body.result as Record<string, any> : {};
  if (!email || code.length !== 6) return json(req, { error: "A verified estimator session is required." }, 400);

  const cutoff = new Date(Date.now() - 15 * 60_000).toISOString();
  const verified = await db.from("lead_otp")
    .select("id,email,code_hash,verified_at,created_at")
    .eq("email", email)
    .not("verified_at", "is", null)
    .gte("verified_at", cutoff)
    .order("verified_at", { ascending: false })
    .limit(1);
  if (verified.error) throw new Error(verified.error.message);
  const otp = verified.data?.[0];
  if (!otp?.id || !otp.verified_at) return json(req, { error: "The verified estimator session expired. Your result remains available on the estimator page." }, 403);
  if ((await sha256(code + email)) !== otp.code_hash) return json(req, { error: "The estimator verification could not be confirmed." }, 403);

  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const recent = await db.from("anchor_result_sessions")
    .select("id", { count: "exact", head: true })
    .eq("email", email)
    .gte("created_at", hourAgo);
  if (recent.error) throw new Error(recent.error.message);
  if ((recent.count ?? 0) >= 10) return json(req, { error: "Too many result handoffs. Please use the result already shown on the estimator page." }, 429);

  const answers = result.answers && typeof result.answers === "object" ? result.answers as Record<string, unknown> : {};
  const computed = computeAnchor(answers);
  const address = str(result.address, 300);
  if (!address) return json(req, { error: "A verified New Jersey property address is required." }, 422);

  const intentScoreRaw = Number(result.intent_score);
  const intentScore = Number.isFinite(intentScoreRaw) ? Math.max(0, Math.min(100, Math.round(intentScoreRaw))) : null;
  const token = randomToken();
  const expiresAt = new Date(Date.now() + 30 * 60_000).toISOString();
  const payload = {
    schema_version: 1,
    program: "ANCHOR",
    generated_at: new Date().toISOString(),
    first_name: firstName(result.name),
    address,
    tenure: computed.tenure,
    benefit: computed.benefit,
    qualifies: computed.qualifies,
    eligibility_label: computed.eligibility_label,
    answers: {
      income: computed.income,
      age: computed.age,
      primary: computed.primary,
      taxes: computed.taxes,
    },
    intent_score: intentScore,
    source: "njpropertytaxrelief-anchor-estimator",
  };

  await db.from("anchor_result_sessions").delete().lt("expires_at", new Date(Date.now() - 3600_000).toISOString());

  const inserted = await db.from("anchor_result_sessions").insert({
    email,
    verification_id: otp.id,
    result_token_hash: await sha256(token),
    result_payload: payload,
    source_host: new URL(origin).hostname,
    expires_at: expiresAt,
  });
  if (inserted.error) throw new Error(inserted.error.message);

  return json(req, { ok: true, result_token: token, expires_at: expiresAt }, 201);
}

async function consume(req: Request, body: Record<string, any>) {
  const origin = req.headers.get("origin") || "";
  if (!ALLOWED_ORIGINS.has(origin) || !origin.includes("watchdogindex.com")) {
    return json(req, { error: "Results can only be opened on Watchdog." }, 403);
  }

  const token = str(body.result_token, 100);
  if (!/^[a-f0-9]{64}$/i.test(token)) return json(req, { error: "This result link is invalid." }, 400);
  const tokenHash = await sha256(token);
  const selected = await db.from("anchor_result_sessions")
    .select("id,result_payload,expires_at,view_count")
    .eq("result_token_hash", tokenHash)
    .maybeSingle();
  if (selected.error) throw new Error(selected.error.message);
  const row = selected.data;
  if (!row?.id) return json(req, { error: "This result link is no longer available." }, 404);
  if (new Date(row.expires_at).getTime() <= Date.now()) return json(req, { error: "This secure result link expired. Run the estimator again to create a new one." }, 410);

  await db.from("anchor_result_sessions").update({
    last_viewed_at: new Date().toISOString(),
    view_count: Number(row.view_count || 0) + 1,
  }).eq("id", row.id);

  return json(req, { ok: true, result: row.result_payload, expires_at: row.expires_at });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "POST only" }, 405);

  let body: Record<string, any>;
  try { body = await req.json(); }
  catch { return json(req, { error: "Bad request" }, 400); }

  try {
    if (body.action === "stage") return await stage(req, body);
    if (body.action === "consume") return await consume(req, body);
    return json(req, { error: "Unknown action" }, 400);
  } catch (error) {
    console.error("anchor-result-handoff", error);
    return json(req, { error: "The secure result handoff could not be completed." }, 500);
  }
});
