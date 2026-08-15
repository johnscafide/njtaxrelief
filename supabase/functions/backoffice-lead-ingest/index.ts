import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-backoffice-ingest-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" }
  });
}

function str(v: unknown) {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
}

function email(v: unknown) {
  return str(v).toLowerCase();
}

function phone(v: unknown) {
  const raw = str(v);
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return raw;
}

function slug(v: unknown) {
  return str(v).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function asNumber(v: unknown) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function parseSignals(lead: Record<string, unknown>) {
  const signal = [lead.summary, lead.subject, lead.what_theyre_asking, lead.note, lead.notes]
    .map(str).filter(Boolean).join(" ");
  const intentMatch = signal.match(/intent\s*(\d{1,3})/i);
  const benefitMatch = signal.match(/(?:est(?:imated)?\.?\s*benefit|benefit)\s*[:,-]?\s*\$?\s*([\d,]+(?:\.\d{1,2})?)/i);
  const intent = asNumber(lead.intent_score) ?? (intentMatch ? Number(intentMatch[1]) : null);
  const benefit = asNumber(lead.estimated_benefit) ?? (benefitMatch ? Number(benefitMatch[1].replace(/,/g, "")) : null);
  const tenure = str(lead.tenure) || (/homeowner/i.test(signal) ? "Homeowner" : /renter/i.test(signal) ? "Renter" : "");
  const program = str(lead.program) || (/anchor/i.test(signal) ? "ANCHOR Estimator" : "");
  return {
    signal,
    intent: intent == null ? null : Math.max(0, Math.min(100, Math.round(intent))),
    benefit: benefit == null ? null : Math.max(0, benefit),
    tenure,
    program,
    verified: /\[?verified\]?/i.test(signal)
  };
}

function deriveTags(lead: Record<string, unknown>, parsed: ReturnType<typeof parseSignals>) {
  const tags = new Set<string>(["watchdog"]);
  if (/anchor/i.test(parsed.program)) tags.add("anchor");
  if (parsed.tenure) tags.add(slug(parsed.tenure));
  if (parsed.verified) tags.add("verified");
  if (parsed.intent != null) {
    tags.add(`intent-${parsed.intent}`);
    if (parsed.intent >= 40) tags.add("intent-engaged");
  }
  if (parsed.benefit != null && parsed.benefit > 0) tags.add(`benefit-${Math.round(parsed.benefit)}`);
  const supplied = Array.isArray(lead.tags) ? lead.tags : [];
  for (const tag of supplied) {
    const clean = slug(tag);
    if (clean) tags.add(clean);
  }
  return Array.from(tags);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return response({ error: "Method not allowed" }, 405);

  const configuredSecret = Deno.env.get("BACKOFFICE_INGEST_SECRET") || "";
  if (!configuredSecret) {
    return response({ error: "Backoffice ingest is disabled until BACKOFFICE_INGEST_SECRET is configured." }, 503);
  }
  const suppliedSecret = req.headers.get("x-backoffice-ingest-secret") || "";
  if (suppliedSecret !== configuredSecret) return response({ error: "Unauthorized" }, 401);

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return response({ error: "Invalid JSON" }, 400);
  }

  const lead = (payload.lead && typeof payload.lead === "object" ? payload.lead : payload) as Record<string, unknown>;
  const fullName = str(lead.full_name || lead.name);
  const normalizedEmail = email(lead.email);
  const normalizedPhone = phone(lead.phone);
  if (!fullName && !normalizedEmail && !normalizedPhone) {
    return response({ error: "A name, email or phone is required." }, 422);
  }

  const parsed = parseSignals(lead);
  const source = str(lead.source) || "external";
  const sourceEventId = str(lead.source_event_id || lead.event_id) || null;
  const submittedAddress = str(lead.submitted_address || lead.address) || null;
  const tags = deriveTags(lead, parsed);

  const row = {
    source,
    source_event_id: sourceEventId,
    full_name: fullName,
    email: normalizedEmail || null,
    phone: normalizedPhone || null,
    submitted_address: submittedAddress,
    submitted_address_json: typeof lead.submitted_address_json === "object" && lead.submitted_address_json ? lead.submitted_address_json : {},
    tenure: parsed.tenure || null,
    household_income: str(lead.household_income || lead.income) || null,
    program: parsed.program || null,
    intent_score: parsed.intent,
    intent_label: parsed.intent != null && parsed.intent >= 40 ? "ENGAGED" : str(lead.intent_label) || null,
    estimated_benefit: parsed.benefit,
    tags,
    processing_status: "pending",
    address_status: submittedAddress ? "pending" : "skipped",
    identity_status: "pending",
    crm_status: "pending",
    consent_data: typeof lead.consent_data === "object" && lead.consent_data ? lead.consent_data : {},
    raw_payload: payload,
    notes: str(lead.notes) || null
  };

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return response({ error: "Supabase server credentials unavailable." }, 500);
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

  let saved: Record<string, unknown> | null = null;
  if (sourceEventId) {
    const existing = await supabase.from("backoffice_leads").select("id").eq("source", source).eq("source_event_id", sourceEventId).maybeSingle();
    if (existing.error) return response({ error: existing.error.message }, 500);
    if (existing.data?.id) {
      const updated = await supabase.from("backoffice_leads").update(row).eq("id", existing.data.id).select("*").single();
      if (updated.error) return response({ error: updated.error.message }, 500);
      saved = updated.data;
    }
  }
  if (!saved) {
    const inserted = await supabase.from("backoffice_leads").insert(row).select("*").single();
    if (inserted.error) return response({ error: inserted.error.message }, 500);
    saved = inserted.data;
  }

  const event = await supabase.from("backoffice_lead_events").insert({
    lead_id: saved.id,
    event_type: "lead.ingested",
    status: "pending",
    provider: source,
    details: { source_event_id: sourceEventId, tags }
  });
  if (event.error) console.error("backoffice lead event failed", event.error);

  return response({
    ok: true,
    lead_id: saved.id,
    processing_status: saved.processing_status,
    tags: saved.tags
  }, 201);
});
