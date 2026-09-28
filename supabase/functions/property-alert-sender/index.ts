import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

// Property alert emails (confirmations and monthly change notices).
// Invoked every 5 minutes by pg_cron (invoke_property_alert_sender) with the
// shared worker token; claims queued rows from property_alert_outbox and
// sends each through EmailJS using the "Watchdog notice" template
// (EMAILJS_PROPERTY_ALERT_TEMPLATE_ID: to_email, subject, message_html).

const SITE = "https://www.watchdogindex.com";
const NAVY = "#0e2248";
const MUTED = "#5d6877";
const LINE = "#e3dfd6";

function clean(value: unknown, max = 240) {
  return String(value ?? "").trim().replace(/[\u0000-\u001f]/g, "").slice(0, max);
}
function html(value: unknown, max = 240) {
  return clean(value, max).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] || c));
}
function titleCase(value: unknown) {
  return clean(value, 160).toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\b(\d+)(St|Nd|Rd|Th)\b/g, (_m, n, s) => n + s.toLowerCase());
}
function townName(value: unknown) {
  const words = clean(value, 120).toUpperCase().split(/\s+/).filter(Boolean);
  const last = words[words.length - 1];
  const map: Record<string, string> = { TWP: "TOWNSHIP", BORO: "BOROUGH" };
  if (last && map[last]) words[words.length - 1] = map[last];
  return titleCase(words.join(" "));
}
function slugify(value: unknown) {
  return clean(value, 200).toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "nj";
}
function propertyUrl(p: Record<string, unknown>, pin: string) {
  return `${SITE}/nj/${slugify(townName(p.town))}/${slugify(p.address)}/${encodeURIComponent(pin)}`;
}
function money(value: unknown) {
  const n = Number(value);
  return value == null || !Number.isFinite(n) ? "n/a" : "$" + Math.round(n).toLocaleString("en-US");
}
function button(href: string, label: string) {
  return `<a href="${html(href, 600)}" style="display:inline-block;padding:12px 20px;border-radius:999px;background:${NAVY};color:#ffffff;font-weight:600;text-decoration:none">${html(label)}</a>`;
}
function shell(inner: string, unsubscribe: string) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;color:${NAVY};font-size:15px;line-height:1.55;max-width:560px">
<p style="margin:0 0 18px;font-size:20px;font-weight:700">Watchdog</p>
${inner}
<p style="margin:28px 0 0;padding-top:14px;border-top:1px solid ${LINE};font-size:12px;color:${MUTED}">You get this email because you asked Watchdog for alerts about this property. Public records only; Watchdog does not show owner names.${unsubscribe ? ` <a href="${html(unsubscribe, 600)}" style="color:${MUTED}">Unsubscribe</a>` : ""}</p>
</div>`;
}

function confirmEmail(p: Record<string, unknown>) {
  const address = `${titleCase(p.address)}, ${townName(p.town)}`;
  const confirm = `${SITE}/alerts/confirm?t=${encodeURIComponent(clean(p.confirm_token, 80))}`;
  return {
    subject: `Confirm alerts for ${address}`,
    body: shell(`<p style="margin:0 0 14px">You asked Watchdog to email you when the assessment, tax bill or Watchdog Score for <b>${html(address)}</b> changes.</p>
<p style="margin:0 0 20px">${button(confirm, "Confirm alerts")}</p>
<p style="margin:0;color:${MUTED};font-size:13px">If you didn't ask for this, ignore this email and nothing else will be sent.</p>`, "")
  };
}

function changeEmail(p: Record<string, unknown>) {
  const before = (p.before || {}) as Record<string, unknown>;
  const after = (p.after || {}) as Record<string, unknown>;
  const pin = clean(p.pams_pin, 80);
  const address = `${titleCase(after.address)}, ${townName(after.town)}`;
  const rows: string[] = [];
  const changed: string[] = [];
  const add = (label: string, a: unknown, b: unknown, fmt: (v: unknown) => string) => {
    if (JSON.stringify(a ?? null) === JSON.stringify(b ?? null)) return;
    changed.push(label.toLowerCase());
    rows.push(`<tr><td style="padding:10px 8px 10px 0;border-bottom:1px solid ${LINE}">${html(label)}</td><td style="padding:10px 8px;border-bottom:1px solid ${LINE};color:${MUTED}">${html(fmt(a))}</td><td style="padding:10px 0 10px 8px;border-bottom:1px solid ${LINE};font-weight:700">${html(fmt(b))}</td></tr>`);
  };
  add("Assessed value", before.assessed_value, after.assessed_value, money);
  add("Annual tax", before.last_year_tax, after.last_year_tax, money);
  add("Watchdog Score", before.score, after.score, (v) => (v == null ? "n/a" : `${Math.round(Number(v))}/100`));
  const unsubscribe = `${SITE}/alerts/unsubscribe?t=${encodeURIComponent(clean(p.unsubscribe_token, 80))}`;
  return {
    subject: `${titleCase(after.address)}: ${changed.join(", ") || "record"} changed`,
    body: shell(`<p style="margin:0 0 14px">The public record for <b>${html(address)}</b> changed in this month's New Jersey tax list update.</p>
<table style="border-collapse:collapse;width:100%;font-size:14px;margin:0 0 20px"><tr><th style="text-align:left;padding:0 8px 8px 0;color:${MUTED};font-weight:600">&nbsp;</th><th style="text-align:left;padding:0 8px 8px;color:${MUTED};font-weight:600">Before</th><th style="text-align:left;padding:0 0 8px 8px;color:${MUTED};font-weight:600">Now</th></tr>${rows.join("")}</table>
<p style="margin:0 0 20px">${button(propertyUrl(after, pin), "See the property")}</p>`, unsubscribe)
  };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return Response.json({ error: "POST required" }, { status: 405 });
  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !serviceKey) return Response.json({ error: "Unavailable" }, { status: 503 });
  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const token = req.headers.get("x-property-alert-token") || "";
  if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const verified = await db.rpc("verify_property_alert_worker", { p_token: token });
  if (verified.error || verified.data !== true) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const publicKey = Deno.env.get("EMAILJS_PUBLIC_KEY") || "";
  const privateKey = Deno.env.get("EMAILJS_PRIVATE_KEY") || "";
  const serviceId = Deno.env.get("EMAILJS_SERVICE_ID") || "";
  const templateId = Deno.env.get("EMAILJS_PROPERTY_ALERT_TEMPLATE_ID") || "";
  if (!(publicKey && privateKey && serviceId && templateId)) {
    // Leave everything queued until the template is configured.
    return Response.json({ ok: true, claimed: 0, email_configured: false }, { headers: { "cache-control": "no-store" } });
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* default limit */ }
  const limit = Math.max(1, Math.min(100, Number(body.limit || 25)));
  const claimed = await db.rpc("claim_property_alert_outbox", { p_limit: limit });
  if (claimed.error) return Response.json({ error: "Claim failed" }, { status: 500 });

  let sent = 0, failed = 0;
  for (const row of (claimed.data || []) as Array<{ id: number; kind: string; email: string; payload: Record<string, unknown> }>) {
    try {
      const mail = row.kind === "confirm" ? confirmEmail(row.payload) : changeEmail(row.payload);
      const response = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service_id: serviceId,
          template_id: templateId,
          user_id: publicKey,
          accessToken: privateKey,
          template_params: { to_email: row.email, subject: mail.subject, message_html: mail.body }
        })
      });
      if (!response.ok) throw new Error(`email_provider_rejected_${response.status}`);
      await db.rpc("complete_property_alert_outbox", { p_id: row.id, p_sent: true, p_error: null });
      sent++;
    } catch (error) {
      await db.rpc("complete_property_alert_outbox", { p_id: row.id, p_sent: false, p_error: clean(error instanceof Error ? error.message : "delivery_failed", 120) });
      failed++;
    }
  }
  return Response.json({ ok: true, claimed: (claimed.data || []).length, sent, failed, email_configured: true }, { headers: { "cache-control": "no-store" } });
});
