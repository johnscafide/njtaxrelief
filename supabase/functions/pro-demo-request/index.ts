import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? "*";
const CORS = {
  "Access-Control-Allow-Origin": ORIGIN,
  "Access-Control-Allow-Headers": "content-type, apikey, authorization, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function str(value: unknown, max = 2000) {
  const valueString = typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
  return valueString.slice(0, max);
}

function normalizeEmail(value: unknown) {
  const email = str(value, 254).toLowerCase();
  return /^[^@\s]+@[^@\s.]+\.[^@\s]{2,}$/.test(email) ? email : "";
}

function slug(value: unknown) {
  return str(value, 80).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function requireSecret(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`missing secret: ${name}`);
  return value;
}

async function sendInternalEmail(details: {
  fullName: string;
  email: string;
  company: string;
  role: string;
  volume: string;
  plan: string;
  cadence: string;
  message: string;
  requestId: string;
}) {
  const serviceId = requireSecret("EMAILJS_SERVICE_ID");
  const templateId = requireSecret("EMAILJS_TEMPLATE_ID");
  const publicKey = requireSecret("EMAILJS_PUBLIC_KEY");
  const privateKey = requireSecret("EMAILJS_PRIVATE_KEY");
  const adminEmail = requireSecret("VERIFY_ADMIN_EMAIL");

  const summary = [
    "WATCHDOG PRO WALKTHROUGH REQUEST",
    `Name: ${details.fullName}`,
    `Email: ${details.email}`,
    `Company: ${details.company || "Not provided"}`,
    `Role: ${details.role}`,
    `Volume: ${details.volume}`,
    `Plan: ${details.plan}`,
    `Billing interest: ${details.cadence}`,
    `Request ID: ${details.requestId}`,
    details.message ? `Message: ${details.message}` : "",
  ].filter(Boolean).join("\n").slice(0, 1800);

  const response = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      service_id: serviceId,
      template_id: templateId,
      user_id: publicKey,
      accessToken: privateKey,
      template_params: {
        to_email: adminEmail,
        email: details.email,
        code: summary,
        subject: `Watchdog Pro walkthrough: ${details.fullName}`,
        full_name: details.fullName,
        company: details.company,
        role: details.role,
        volume: details.volume,
        plan: details.plan,
        cadence: details.cadence,
        message: details.message,
        request_id: details.requestId,
      },
    }),
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error(`emailjs ${response.status}: ${detail}`);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  // Quietly accept bot submissions caught by the honeypot.
  if (str(body.website, 120)) return json({ ok: true }, 201);

  const fullName = str(body.full_name, 120);
  const email = normalizeEmail(body.email);
  const company = str(body.company, 160);
  const role = str(body.role, 120);
  const volume = str(body.volume, 80);
  const plan = slug(body.plan) || "unsure";
  const cadence = slug(body.cadence) === "monthly" ? "monthly" : "yearly";
  const message = str(body.message, 1500);
  const source = str(body.source, 80) || "pro-page";
  const pageUrl = str(body.page_url, 500);

  if (!fullName || !email || !role || !volume) {
    return json({ error: "Name, work email, role and property volume are required." }, 422);
  }
  if (!["agent", "pro", "pro-plus", "pro_plus", "unsure"].includes(plan)) {
    return json({ error: "Choose a valid plan interest." }, 422);
  }

  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  const ipTag = (await sha256(forwarded)).slice(0, 16);
  const hourAgo = new Date(Date.now() - 60 * 60_000).toISOString();
  const dayAgo = new Date(Date.now() - 24 * 60 * 60_000).toISOString();

  try {
    const byEmail = await db.from("backoffice_leads").select("id", { count: "exact", head: true })
      .eq("source", "pro-demo").eq("email", email).gte("created_at", hourAgo);
    if (byEmail.error) throw new Error(`rate limit email: ${byEmail.error.message}`);
    if ((byEmail.count ?? 0) >= 3) return json({ error: "Too many requests. Please try again later." }, 429);

    const byIp = await db.from("backoffice_leads").select("id", { count: "exact", head: true })
      .eq("source", "pro-demo").like("source_event_id", `${ipTag}-%`).gte("created_at", dayAgo);
    if (byIp.error) throw new Error(`rate limit connection: ${byIp.error.message}`);
    if ((byIp.count ?? 0) >= 10) return json({ error: "Too many requests from this connection. Please try again later." }, 429);

    const sourceEventId = `${ipTag}-${crypto.randomUUID()}`;
    const normalizedPlan = plan === "pro-plus" ? "pro_plus" : plan;
    const tags = ["watchdog", "pro-demo", `plan-${normalizedPlan}`, `cadence-${cadence}`, `role-${slug(role)}`];
    const notes = [
      `Private Watchdog Pro walkthrough requested.`,
      `Company/team: ${company || "Not provided"}.`,
      `Role: ${role}.`,
      `Approx. properties/month: ${volume}.`,
      `Plan interest: ${normalizedPlan}.`,
      `Billing interest: ${cadence}.`,
      message ? `Message: ${message}` : "",
    ].filter(Boolean).join(" ");

    const inserted = await db.from("backoffice_leads").insert({
      source: "pro-demo",
      source_event_id: sourceEventId,
      full_name: fullName,
      email,
      program: "Watchdog Pro Walkthrough",
      tags,
      processing_status: "pending",
      address_status: "skipped",
      identity_status: "pending",
      crm_status: "pending",
      consent_data: {
        contact_requested: true,
        source,
        submitted_at: new Date().toISOString(),
      },
      raw_payload: {
        source,
        company,
        role,
        volume,
        plan: normalizedPlan,
        cadence,
        message,
        page_url: pageUrl,
        user_agent: str(req.headers.get("user-agent"), 300),
      },
      notes,
    }).select("id").single();

    if (inserted.error) throw new Error(`lead insert: ${inserted.error.message}`);
    const requestId = String(inserted.data.id);

    const event = await db.from("backoffice_lead_events").insert({
      lead_id: requestId,
      event_type: "pro.walkthrough_requested",
      status: "pending",
      provider: "pro-page",
      details: { plan: normalizedPlan, cadence, role, volume, company },
    });
    if (event.error) console.error("pro walkthrough event insert", event.error);

    let notified = true;
    try {
      await sendInternalEmail({ fullName, email, company, role, volume, plan: normalizedPlan, cadence, message, requestId });
    } catch (emailError) {
      notified = false;
      console.error("pro walkthrough EmailJS notification", emailError);
    }

    return json({ ok: true, request_id: requestId, notified }, 201);
  } catch (error) {
    console.error("pro-demo-request", error);
    return json({ error: "Could not submit your request right now. Please try again." }, 500);
  }
});
