import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

// CO town page update emails. Invoked every 5 minutes by pg_cron
// (invoke_co_update_sender) with the shared worker token; claims queued rows
// from co_update_outbox and sends each through EmailJS using the same
// "Watchdog notice" template as property alerts
// (EMAILJS_PROPERTY_ALERT_TEMPLATE_ID: to_email, subject, message_html).
// The scan in api/co-updates.js builds the email; this fills in the
// subscriber's unsubscribe link.

const SITE = "https://www.watchdogindex.com";

function clean(value: unknown, max = 240) {
  return String(value ?? "").trim().replace(/[\u0000-\u001f]/g, "").slice(0, max);
}
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return Response.json({ error: "POST required" }, { status: 405 });
  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !serviceKey) return Response.json({ error: "Unavailable" }, { status: 503 });
  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const token = req.headers.get("x-co-updates-token") || "";
  if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const verified = await db.rpc("verify_co_updates_worker", { p_token: token });
  if (verified.error || verified.data !== true) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const publicKey = Deno.env.get("EMAILJS_PUBLIC_KEY") || "";
  const privateKey = Deno.env.get("EMAILJS_PRIVATE_KEY") || "";
  const serviceId = Deno.env.get("EMAILJS_SERVICE_ID") || "";
  const templateId = Deno.env.get("EMAILJS_PROPERTY_ALERT_TEMPLATE_ID") || "";
  if (!(publicKey && privateKey && serviceId && templateId)) {
    return Response.json({ ok: true, claimed: 0, email_configured: false }, { headers: { "cache-control": "no-store" } });
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* default limit */ }
  const limit = Math.max(1, Math.min(100, Number(body.limit || 25)));
  const claimed = await db.rpc("claim_co_update_outbox", { p_limit: limit });
  if (claimed.error) return Response.json({ error: "Claim failed" }, { status: 500 });

  let sent = 0, failed = 0;
  for (const row of (claimed.data || []) as Array<{ id: number; email: string; subject: string; html: string; unsubscribe_token: string }>) {
    try {
      const unsubscribe = `${SITE}/co/updates/unsubscribe?t=${encodeURIComponent(clean(row.unsubscribe_token, 96))}`;
      const response = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service_id: serviceId,
          template_id: templateId,
          user_id: publicKey,
          accessToken: privateKey,
          template_params: { to_email: row.email, subject: clean(row.subject, 200), message_html: String(row.html).split("{{unsubscribe_url}}").join(unsubscribe) }
        })
      });
      if (!response.ok) {
        const detail = clean(await response.text().catch(() => ""), 100);
        throw new Error(`email_provider_rejected_${response.status}${detail ? `: ${detail}` : ""}`);
      }
      await db.rpc("complete_co_update_outbox", { p_id: row.id, p_sent: true, p_error: null });
      sent++;
    } catch (error) {
      await db.rpc("complete_co_update_outbox", { p_id: row.id, p_sent: false, p_error: clean(error instanceof Error ? error.message : "delivery_failed", 120) });
      failed++;
    }
    // EmailJS documents a one-request-per-second rate limit.
    await sleep(1100);
  }
  return Response.json({ ok: true, claimed: (claimed.data || []).length, sent, failed, email_configured: true }, { headers: { "cache-control": "no-store" } });
});
