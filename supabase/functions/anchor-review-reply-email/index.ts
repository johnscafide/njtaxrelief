import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

// Emails John's reply to the person who left an ANCHOR application review.
// Called from the developer-only backoffice API with the developer's own
// session token, only when the developer clicks "Email reply to them".
// Uses the "Watchdog notice" EmailJS template
// (EMAILJS_PROPERTY_ALERT_TEMPLATE_ID: to_email, subject, message_html).

const SITE = "https://www.watchdogindex.com";
const NAVY = "#0e2248";
const MUTED = "#5d6877";
const LINE = "#e3dfd6";
const SOFT = "#eef5f4";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
function clean(value: unknown, max = 240) {
  return String(value ?? "").trim().replace(/[\u0000-\u0009\u000b-\u001f]/g, "").slice(0, max);
}
function html(value: unknown, max = 240) {
  return clean(value, max)
    .replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] || c))
    .replace(/\n/g, "<br>");
}
function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function replyEmail(comment: string, reply: string) {
  return {
    subject: "Watchdog replied to your review",
    body: `<div style="font-family:Arial,Helvetica,sans-serif;color:${NAVY};font-size:15px;line-height:1.55;max-width:560px">
<p style="margin:0 0 18px;font-size:20px;font-weight:700">Watchdog</p>
<p style="margin:0 0 14px">Thanks for leaving a review of the Watchdog property tax relief application helper. We replied to it.</p>
<p style="margin:0 0 6px;color:${MUTED};font-size:13px">Your review</p>
<p style="margin:0 0 18px;font-style:italic">&ldquo;${html(comment, 1500)}&rdquo;</p>
<div style="margin:0 0 20px;padding:14px 16px;border-radius:8px;background:${SOFT}">
<p style="margin:0 0 6px;font-weight:700">Reply from Watchdog</p>
<p style="margin:0">${html(reply, 1500)}</p>
</div>
<p style="margin:0 0 20px"><a href="${SITE}/review" style="display:inline-block;padding:12px 20px;border-radius:8px;background:${NAVY};color:#ffffff;font-weight:600;text-decoration:none">See your review</a></p>
<p style="margin:28px 0 0;padding-top:14px;border-top:1px solid ${LINE};font-size:12px;color:${MUTED}">You get this email because you left a review on Watchdog. Watchdog is not the State of New Jersey and does not submit applications.</p>
</div>`,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "POST required" }, 405);

  const url = Deno.env.get("SUPABASE_URL") || "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !anon || !serviceKey) return json({ error: "Reply email service unavailable" }, 503);

  const auth = req.headers.get("Authorization") || "";
  const userDb = createClient(url, anon, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: userData, error: userError } = await userDb.auth.getUser();
  if (userError || !userData?.user) return json({ error: "Developer sign-in is required." }, 401);
  const developer = await userDb.rpc("is_watchdog_developer");
  if (developer.error || developer.data !== true) return json({ error: "Developer access is required." }, 403);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch {}
  const reviewId = clean(body.review_id, 64);
  if (!isUuid(reviewId)) return json({ error: "A valid review_id is required." }, 422);

  const review = await admin
    .from("anchor_application_reviews")
    .select("id,user_id,review_comment,owner_reply,withdrawn_at")
    .eq("id", reviewId)
    .maybeSingle();
  if (review.error) return json({ error: "Could not load the review." }, 500);
  if (!review.data) return json({ error: "Review not found." }, 404);
  if (review.data.withdrawn_at) return json({ error: "This review was withdrawn." }, 409);

  const comment = clean(review.data.review_comment, 1500);
  const reply = clean(review.data.owner_reply, 1500);
  if (!reply) return json({ error: "Save a reply first." }, 422);

  const publicKey = Deno.env.get("EMAILJS_PUBLIC_KEY") || "";
  const privateKey = Deno.env.get("EMAILJS_PRIVATE_KEY") || "";
  const serviceId = Deno.env.get("EMAILJS_SERVICE_ID") || "";
  const templateId = Deno.env.get("EMAILJS_PROPERTY_ALERT_TEMPLATE_ID") || "";
  if (!publicKey || !privateKey || !serviceId || !templateId) return json({ error: "Email is not set up." }, 503);

  const recipient = await admin.auth.admin.getUserById(review.data.user_id);
  const toEmail = recipient.data?.user?.email;
  if (!toEmail) return json({ error: "No email address on file for this reviewer." }, 409);

  const mail = replyEmail(comment, reply);
  const response = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      service_id: serviceId,
      template_id: templateId,
      user_id: publicKey,
      accessToken: privateKey,
      template_params: { to_email: toEmail, subject: mail.subject, message_html: mail.body },
    }),
  });
  if (!response.ok) {
    const detail = clean(await response.text().catch(() => ""), 160);
    return json({ error: `The email did not send (${response.status}${detail ? `: ${detail}` : ""}).` }, 502);
  }

  const emailedAt = new Date().toISOString();
  await admin.from("anchor_application_reviews").update({ owner_reply_emailed_at: emailedAt }).eq("id", reviewId);
  return json({ ok: true, emailed_at: emailedAt });
});
