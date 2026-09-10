// supabase/functions/verify-email/index.ts
//
// Sends email verification codes and, after a successful OTP check, accepts a
// narrowly-scoped ANCHOR lead capture for the Watchdog Backoffice.
// Secrets remain server-side. Public capture requires a recently verified OTP.
//
// v40: CORS now echoes the caller's origin when it is on the allowlist, so the
// estimator works from both njpropertytaxrelief.com and watchdogindex.com.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Domains allowed to call this from a browser. ALLOWED_ORIGIN (comma separated)
// adds to this list rather than replacing it.
const BASE_ORIGINS = [
  "https://njpropertytaxrelief.com",
  "https://www.njpropertytaxrelief.com",
  "https://watchdogindex.com",
  "https://www.watchdogindex.com",
];
const ALLOWED_ORIGINS = new Set(
  BASE_ORIGINS.concat(
    (Deno.env.get("ALLOWED_ORIGIN") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s && s !== "*"),
  ),
);

function corsFor(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : BASE_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

function normalizeEmail(raw: string): string | null {
  const e = (raw || "").trim().toLowerCase();
  if (e.length > 254) return null;
  return /^[^@\s]+@[^@\s.]+\.[^@\s]{2,}$/.test(e) ? e : null;
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function normalizePhone(value: unknown): string {
  const raw = str(value);
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return raw;
}

function slug(value: unknown): string {
  return str(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function numberValue(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : null;
}

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function sixDigits(): string {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return String(a[0] % 1_000_000).padStart(6, "0");
}

async function rateLimited(ip: string, email: string): Promise<string | null> {
  const hourAgo = new Date(Date.now() - 3600_000).toISOString();

  const { count: byIp, error: ipErr } = await db
    .from("lead_otp").select("*", { count: "exact", head: true })
    .eq("ip", ip).gte("created_at", hourAgo);
  if (ipErr) throw new Error("db read (lead_otp): " + ipErr.message);
  if ((byIp ?? 0) >= 10) return "Too many requests from this connection. Try again later.";

  const { count: byEmail } = await db
    .from("lead_otp").select("*", { count: "exact", head: true })
    .eq("email", email).gte("created_at", hourAgo);
  if ((byEmail ?? 0) >= 5) return "Too many codes sent to this address. Try again later.";

  return null;
}

function requireSecret(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error("missing secret: " + name);
  return v;
}

async function sendViaEmailJS(email: string, code: string): Promise<void> {
  const serviceId  = requireSecret("EMAILJS_SERVICE_ID");
  const templateId = requireSecret("EMAILJS_TEMPLATE_ID");
  const publicKey  = requireSecret("EMAILJS_PUBLIC_KEY");
  const privateKey = requireSecret("EMAILJS_PRIVATE_KEY");

  const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      service_id: serviceId,
      template_id: templateId,
      user_id: publicKey,
      accessToken: privateKey,
      template_params: {
        to_email: email,
        code,
        email,
      },
    }),
  });

  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    throw new Error(`emailjs ${res.status}: ${detail}`);
  }
}

function parseLeadSignals(lead: Record<string, unknown>) {
  const signal = [lead.summary, lead.topic, lead.notes, lead.message].map(str).filter(Boolean).join(" ");
  const intentMatch = signal.match(/intent\s*(\d{1,3})/i) || signal.match(/Watchdog Intent Score:\s*(\d{1,3})/i);
  const benefitMatch = signal.match(/(?:est(?:imated)?\.?\s*benefit|benefit)\s*[:,-]?\s*\$?\s*([\d,]+(?:\.\d{1,2})?)/i);
  const bandMatch = signal.match(/\[INTENT\s*\d{1,3}\s+([^\]]+)\]/i);
  const intentRaw = numberValue(lead.intent_score) ?? (intentMatch ? Number(intentMatch[1]) : null);
  const benefitRaw = numberValue(lead.estimated_benefit) ?? (benefitMatch ? Number(benefitMatch[1].replace(/,/g, "")) : null);
  const intent = intentRaw == null ? null : Math.max(0, Math.min(100, Math.round(intentRaw)));
  const benefit = benefitRaw == null ? null : Math.max(0, benefitRaw);
  return {
    signal,
    intent,
    benefit,
    intentLabel: str(lead.intent_label) || (bandMatch ? bandMatch[1].trim().toUpperCase() : intent != null && intent >= 40 ? "ENGAGED" : null),
  };
}

function deriveLeadTags(lead: Record<string, unknown>, parsed: ReturnType<typeof parseLeadSignals>) {
  const tags = new Set<string>(["watchdog", "anchor", "verified"]);
  const tenure = str(lead.tenure);
  if (tenure) tags.add(slug(tenure));
  if (parsed.intent != null) {
    tags.add(`intent-${parsed.intent}`);
    if (parsed.intent >= 40) tags.add("intent-engaged");
  }
  if (parsed.benefit != null && parsed.benefit > 0) tags.add(`benefit-${Math.round(parsed.benefit)}`);
  if (/looking to sell/i.test(parsed.signal) || /sell \(/i.test(parsed.signal)) tags.add("seller-interest");
  if (/looking to buy/i.test(parsed.signal) || /buy \(/i.test(parsed.signal)) tags.add("buyer-interest");
  return Array.from(tags);
}

async function getBackofficeSecret(name: string): Promise<string> {
  const result = await db.rpc("backoffice_get_secret", { p_name: name });
  if (result.error) return "";
  return str(result.data);
}

async function validateCapturedAddress(leadId: string, address: string): Promise<void> {
  if (!address) return;
  const key = await getBackofficeSecret("google_address_validation_api_key");
  if (!key) return;

  const validatedAt = new Date().toISOString();
  try {
    const res = await fetch(`https://addressvalidation.googleapis.com/v1:validateAddress?key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: { regionCode: "US", addressLines: [address] }, enableUspsCass: true }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body?.result) {
      await db.from("backoffice_leads").update({
        address_status: "error",
        address_validation_provider: "google",
        address_validated_at: validatedAt,
        processing_status: "review",
      }).eq("id", leadId);
      await db.from("backoffice_lead_events").insert({
        lead_id: leadId,
        event_type: "address.validation_failed",
        status: "error",
        provider: "google",
        details: { http_status: res.status },
      });
      return;
    }

    const result = body.result as Record<string, any>;
    const formatted = str(result?.address?.formattedAddress);
    const postalAddress = result?.address?.postalAddress || {};
    const verdict = result?.verdict || {};
    const usps = result?.uspsData || {};
    const dpv = str(usps.dpvConfirmation).toUpperCase();
    const complete = verdict.addressComplete === true;
    const unconfirmed = verdict.hasUnconfirmedComponents === true;
    const status = formatted && complete && !unconfirmed && dpv === "Y" ? "verified" : formatted ? "review" : "error";
    const minimal = {
      formatted_address: formatted,
      postal_address: postalAddress,
      verdict: {
        input_granularity: verdict.inputGranularity || null,
        validation_granularity: verdict.validationGranularity || null,
        geocode_granularity: verdict.geocodeGranularity || null,
        address_complete: complete,
        has_unconfirmed_components: unconfirmed,
        has_inferred_components: verdict.hasInferredComponents === true,
        has_replaced_components: verdict.hasReplacedComponents === true,
      },
      usps: {
        dpv_confirmation: usps.dpvConfirmation || null,
        dpv_footnote: usps.dpvFootnote || null,
        cass_processed: usps.cassProcessed === true,
      },
    };

    await db.from("backoffice_leads").update({
      standardized_address: formatted || null,
      standardized_address_json: minimal,
      address_status: status,
      address_validation_provider: "google",
      address_validated_at: validatedAt,
      processing_status: status === "verified" ? "ready" : "review",
    }).eq("id", leadId);

    await db.from("backoffice_lead_events").insert({
      lead_id: leadId,
      event_type: "address.validated",
      status,
      provider: "google",
      details: { dpv_confirmation: dpv || null, address_complete: complete, has_unconfirmed_components: unconfirmed },
    });
  } catch (error) {
    console.error("anchor capture Google validation", error);
    await db.from("backoffice_leads").update({
      address_status: "error",
      address_validation_provider: "google",
      address_validated_at: validatedAt,
      processing_status: "review",
    }).eq("id", leadId);
  }
}

async function captureVerifiedLead(email: string, rawLead: unknown) {
  const lead = rawLead && typeof rawLead === "object" ? rawLead as Record<string, unknown> : {};
  const leadEmail = normalizeEmail(str(lead.email));
  if (!leadEmail || leadEmail !== email) {
    return { error: "Lead email must match the verified email.", status: 422 };
  }

  const cutoff = new Date(Date.now() - 15 * 60_000).toISOString();
  const verified = await db.from("lead_otp")
    .select("id,email,verified_at")
    .eq("email", email)
    .gte("verified_at", cutoff)
    .order("verified_at", { ascending: false })
    .limit(1);
  if (verified.error) throw new Error("db read (lead_otp verification): " + verified.error.message);
  const otp = verified.data?.[0];
  if (!otp?.id || !otp.verified_at) {
    return { error: "A recent verified email session is required before this lead can be captured.", status: 403 };
  }

  const fullName = str(lead.name || lead.full_name);
  const phone = normalizePhone(lead.phone);
  const address = str(lead.address || lead.submitted_address);
  const tenure = str(lead.tenure) || (/homeowner/i.test(str(lead.summary)) ? "Homeowner" : /renter/i.test(str(lead.summary)) ? "Renter" : "");
  const income = str(lead.household_income || lead.income_bracket || lead.finance);
  const parsed = parseLeadSignals(lead);
  const tags = deriveLeadTags({ ...lead, tenure }, parsed);
  const sourceEventId = `anchor-otp-${otp.id}`;

  const row = {
    source: "anchor-estimator",
    source_event_id: sourceEventId,
    lead_status: "new",
    processing_status: "pending",
    full_name: fullName || null,
    email,
    phone: phone || null,
    submitted_address: address || null,
    submitted_address_json: {},
    tenure: tenure || null,
    household_income: income || null,
    program: "ANCHOR Estimator",
    intent_score: parsed.intent,
    intent_label: parsed.intentLabel,
    estimated_benefit: parsed.benefit,
    tags,
    address_status: "pending",
    identity_status: "pending",
    crm_provider: "boldtrail",
    crm_status: "pending",
    crm_owner: "unassigned",
    consent_data: {
      email_verified: true,
      email_verified_at: otp.verified_at,
      marketing_consent_inferred: false,
    },
    raw_payload: {
      ingest: "anchor-estimator-verified",
      verification_id: otp.id,
      captured_at: new Date().toISOString(),
      lead,
    },
    notes: str(lead.notes || lead.message) || null,
  };

  const existing = await db.from("backoffice_leads")
    .select("id")
    .eq("source", "anchor-estimator")
    .eq("source_event_id", sourceEventId)
    .maybeSingle();
  if (existing.error) throw new Error("db read (backoffice_leads): " + existing.error.message);

  let saved: Record<string, any> | null = null;
  if (existing.data?.id) {
    const updated = await db.from("backoffice_leads").update(row).eq("id", existing.data.id).select("*").single();
    if (updated.error) throw new Error("db update (backoffice_leads): " + updated.error.message);
    saved = updated.data;
  } else {
    const inserted = await db.from("backoffice_leads").insert(row).select("*").single();
    if (inserted.error) throw new Error("db insert (backoffice_leads): " + inserted.error.message);
    saved = inserted.data;
  }

  await db.from("backoffice_lead_events").insert({
    lead_id: saved!.id,
    event_type: "lead.ingested",
    status: "pending",
    provider: "anchor-estimator",
    details: { source_event_id: sourceEventId, verified_email: true, tags },
  });

  if (address) await validateCapturedAddress(String(saved!.id), address);
  return { ok: true, lead_id: saved!.id };
}

async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok");
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Bad request" }, 400);
  }

  const email = normalizeEmail(body.email);
  if (!email) return json({ error: "Enter a valid email address." }, 400);

  try {
    if (body.action === "send") {
      const limit = await rateLimited(ip, email);
      if (limit) return json({ error: limit }, 429);

      const code = sixDigits();
      await db.from("lead_otp")
        .update({ expires_at: new Date().toISOString() })
        .eq("email", email).is("verified_at", null);

      const { error: insErr } = await db.from("lead_otp").insert({
        email,
        code_hash: await sha256(code + email),
        ip,
        expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      });
      if (insErr) throw new Error("db insert (lead_otp): " + insErr.message);

      await sendViaEmailJS(email, code);
      return json({ ok: true });
    }

    if (body.action === "check") {
      const code = str(body.code).replace(/\D/g, "");
      if (code.length !== 6) return json({ ok: false, error: "Enter the 6-digit code." }, 400);

      const { data } = await db
        .from("lead_otp").select("*")
        .eq("email", email).is("verified_at", null)
        .order("created_at", { ascending: false }).limit(1);

      const row = data?.[0];
      if (!row) return json({ ok: false, error: "No active code. Request a new one." }, 400);
      if (new Date(row.expires_at) < new Date()) {
        return json({ ok: false, error: "That code expired. Request a new one." }, 400);
      }
      if (row.attempts >= 5) {
        return json({ ok: false, error: "Too many tries. Request a new code." }, 429);
      }

      await db.from("lead_otp").update({ attempts: row.attempts + 1 }).eq("id", row.id);

      if ((await sha256(code + email)) !== row.code_hash) {
        return json({ ok: false, error: "That code didn't match. Check it and try again." }, 400);
      }

      await db.from("lead_otp")
        .update({ verified_at: new Date().toISOString() }).eq("id", row.id);

      return json({ ok: true });
    }

    if (body.action === "capture_verified_lead") {
      const captured = await captureVerifiedLead(email, body.lead);
      if ((captured as any).error) return json({ error: (captured as any).error }, (captured as any).status || 400);
      return json(captured, 201);
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error(e);
    const detail = e instanceof Error ? e.message : String(e);
    return json({ error: "DEBUG: " + detail }, 500);
  }
}

Deno.serve(async (req) => {
  const res = await handle(req);
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(corsFor(req))) headers.set(k, v);
  return new Response(res.body, { status: res.status, headers });
});
