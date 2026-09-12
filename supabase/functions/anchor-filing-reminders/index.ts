import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

function clean(value: unknown, max = 240) {
  return String(value ?? "").trim().replace(/[\u0000-\u001f]/g, "").slice(0, max);
}
function html(value: unknown, max = 240) {
  return clean(value, max).replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c] || c));
}
function formatDate(value: unknown) {
  try { return new Intl.DateTimeFormat("en-US", { month:"long", day:"numeric", year:"numeric", timeZone:"America/New_York" }).format(new Date(String(value))); }
  catch { return clean(value, 40); }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return Response.json({ error:"POST required" }, { status:405 });
  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !serviceKey) return Response.json({ error:"Unavailable" }, { status:503 });
  const db = createClient(url, serviceKey, { auth:{ persistSession:false, autoRefreshToken:false } });
  const token = req.headers.get("x-anchor-reminder-token") || "";
  if (!token) return Response.json({ error:"Unauthorized" }, { status:401 });
  const verified = await db.rpc("verify_anchor_reminder_worker_token_v1", { p_token:token });
  if (verified.error || verified.data !== true) return Response.json({ error:"Unauthorized" }, { status:401 });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch {}
  const limit = Math.max(1, Math.min(100, Number(body.limit || 50)));
  const claimed = await db.rpc("claim_due_anchor_filing_reminders_v1", { p_limit:limit });
  if (claimed.error) return Response.json({ error:"Claim failed" }, { status:500 });

  const publicKey = Deno.env.get("EMAILJS_PUBLIC_KEY") || "";
  const privateKey = Deno.env.get("EMAILJS_PRIVATE_KEY") || "";
  const serviceId = Deno.env.get("EMAILJS_SERVICE_ID") || "";
  const templateId = Deno.env.get("EMAILJS_ANCHOR_REMINDER_TEMPLATE_ID") || Deno.env.get("EMAILJS_AGENT_DIGEST_TEMPLATE_ID") || "";
  const emailConfigured = Boolean(publicKey && privateKey && serviceId && templateId);
  let sent = 0, failed = 0;

  for (const reminder of claimed.data || []) {
    try {
      if (!emailConfigured) throw new Error("email_provider_not_configured");
      const auth = await db.auth.admin.getUserById(reminder.user_id);
      const email = auth.data.user?.email;
      if (!email) throw new Error("recipient_email_unavailable");
      const deadline = formatDate(reminder.deadline_date);
      const days = Number(reminder.offset_days || 0);
      const rows = `<tr><td style="padding:14px 10px;border-bottom:1px solid #e4e9ee;color:#1456a0;font-weight:800">PROPERTY TAX RELIEF</td><td style="padding:14px 10px;border-bottom:1px solid #e4e9ee"><b>Your 2025 New Jersey Property Tax Relief filing deadline is ${html(deadline)}</b><br><span style="color:#65758a">You asked Watchdog to remind you ${days} days before the verified State deadline.</span></td><td style="padding:14px 10px;border-bottom:1px solid #e4e9ee;font-weight:800">${days}d</td></tr>`;
      const response = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body:JSON.stringify({
          service_id:serviceId,
          template_id:templateId,
          user_id:publicKey,
          accessToken:privateKey,
          template_params:{
            to_email:email,
            subject:`Watchdog reminder: NJ Property Tax Relief deadline ${deadline}`,
            opportunity_count:1,
            digest_rows:rows,
            desk_url:`https://www.watchdogindex.com/anchor/application/2025/?application=${encodeURIComponent(reminder.application_id)}&filing=1`,
            compliance_note:"Deadline source: New Jersey Division of Taxation. This reminder contains no application answers, Social Security numbers, income information, recovery keys, or PDF contents."
          }
        })
      });
      if (!response.ok) throw new Error("email_provider_rejected_request");
      await db.rpc("complete_anchor_filing_reminder_v1", { p_id:reminder.id, p_sent:true, p_error:null });
      sent++;
    } catch (error) {
      const reason = clean(error instanceof Error ? error.message : "delivery_failed", 120);
      await db.rpc("complete_anchor_filing_reminder_v1", { p_id:reminder.id, p_sent:false, p_error:reason });
      failed++;
    }
  }

  return Response.json({ ok:true, claimed:(claimed.data || []).length, sent, failed, email_configured:emailConfigured }, { headers:{ "cache-control":"no-store" } });
});
