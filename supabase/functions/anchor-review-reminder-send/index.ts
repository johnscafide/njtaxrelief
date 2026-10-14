import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

// One-off second ask for an ANCHOR application review. Sends to people who
// got the first review email (anchor_review_auto_v1) at least 5 days ago,
// have not reviewed, and have not unsubscribed. One email per person, ever,
// under its own campaign_key so opens and clicks are tracked apart from the
// first ask. Uses the same worker token as anchor-review-outreach-worker and
// is triggered by hand, not on a schedule.

const FIRST_CAMPAIGN = "anchor_review_auto_v1";
const CAMPAIGN = "anchor_review_reminder_v1";
const WATCHDOG_ORIGIN = "https://www.watchdogindex.com";
const MIN_DAYS_SINCE_FIRST = 5;

function clean(value: unknown, max = 240) {
  return String(value ?? "").trim().replace(/[\u0000-\u001f]/g, "").slice(0, max);
}
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes).map((value) => value.toString(16).padStart(2, "0")).join("");
}
function randomToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}
async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
}
function trackedUrls(token: string) {
  const base = `${WATCHDOG_ORIGIN}/api/watchdog-review-outreach-click?t=${encodeURIComponent(token)}`;
  return {
    review_1_url: `${base}&rating=1`,
    review_2_url: `${base}&rating=2`,
    review_3_url: `${base}&rating=3`,
    review_4_url: `${base}&rating=4`,
    review_5_url: `${base}&rating=5`,
    review_url: base,
    open_pixel_url: `${WATCHDOG_ORIGIN}/api/watchdog-review-outreach-open?t=${encodeURIComponent(token)}`,
    unsubscribe_url: `${WATCHDOG_ORIGIN}/api/watchdog-review-outreach-unsubscribe?t=${encodeURIComponent(token)}`,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return Response.json({ error: "POST required" }, { status: 405 });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceKey) return Response.json({ error: "Unavailable" }, { status: 503 });

  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const workerToken = req.headers.get("x-anchor-review-token") || "";
  if (!workerToken) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const verified = await db.rpc("verify_anchor_review_outreach_worker_token_v1", { p_token: workerToken });
  if (verified.error || verified.data !== true) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const publicKey = Deno.env.get("EMAILJS_PUBLIC_KEY") || "";
  const privateKey = Deno.env.get("EMAILJS_PRIVATE_KEY") || "";
  const serviceId = Deno.env.get("EMAILJS_SERVICE_ID") || "";
  const templateId = Deno.env.get("EMAILJS_ANCHOR_REVIEW_TEMPLATE_ID") || "template_anchor_review";
  if (!publicKey || !privateKey || !serviceId) return Response.json({ error: "Email is not set up." }, { status: 503 });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch {}
  const limit = Math.max(1, Math.min(40, Number(body.limit || 20)));
  const dryRun = body.dry_run === true;
  const now = new Date();
  const cutoff = new Date(now.getTime() - MIN_DAYS_SINCE_FIRST * 86_400_000);

  const firstResult = await db
    .from("anchor_review_outreach")
    .select("user_id,application_id,sent_at,unsubscribed_at,delivery_status")
    .eq("campaign_key", FIRST_CAMPAIGN)
    .in("delivery_status", ["sent", "suppressed"]);
  if (firstResult.error) return Response.json({ error: "Could not load first-ask outreach" }, { status: 500 });

  const people = new Map<string, { application_id: string; first_sent: number; latest_sent: number; out: boolean }>();
  for (const row of firstResult.data || []) {
    const sentAt = row.sent_at ? new Date(row.sent_at).getTime() : 0;
    const person = people.get(row.user_id) || { application_id: row.application_id, first_sent: Infinity, latest_sent: 0, out: false };
    if (row.delivery_status === "suppressed" || row.unsubscribed_at) person.out = true;
    if (sentAt) {
      person.first_sent = Math.min(person.first_sent, sentAt);
      if (sentAt >= person.latest_sent) { person.latest_sent = sentAt; person.application_id = row.application_id; }
    }
    people.set(row.user_id, person);
  }
  const userIds = [...people.keys()];
  if (!userIds.length) return Response.json({ ok: true, eligible: 0, sent: 0 });

  const [reviews, suppressions, reminders] = await Promise.all([
    db.from("anchor_application_reviews").select("user_id").in("user_id", userIds),
    db.from("marketing_suppressions").select("user_id,expires_at").eq("channel", "email").in("user_id", userIds),
    db.from("anchor_review_outreach").select("id,user_id,application_id,delivery_status,send_attempts").eq("campaign_key", CAMPAIGN).in("user_id", userIds),
  ]);
  if (reviews.error || suppressions.error || reminders.error) {
    return Response.json({ error: "Could not reconcile reminder state" }, { status: 500 });
  }

  const reviewed = new Set((reviews.data || []).map((row) => row.user_id));
  const suppressed = new Set((suppressions.data || [])
    .filter((row) => !row.expires_at || new Date(row.expires_at).getTime() > now.getTime())
    .map((row) => row.user_id));
  const reminderByUser = new Map((reminders.data || []).map((row) => [row.user_id, row]));

  const eligible = userIds.filter((userId) => {
    const person = people.get(userId)!;
    if (person.out || !person.latest_sent || person.first_sent > cutoff.getTime()) return false;
    if (reviewed.has(userId) || suppressed.has(userId)) return false;
    const reminder = reminderByUser.get(userId);
    if (reminder && !(reminder.delivery_status === "retry" && Number(reminder.send_attempts || 0) < 3)) return false;
    return true;
  });

  if (dryRun) return Response.json({ ok: true, dry_run: true, eligible: eligible.length });

  let sent = 0;
  let failed = 0;
  for (const userId of eligible.slice(0, limit)) {
    const person = people.get(userId)!;
    const existing = reminderByUser.get(userId);
    const rawToken = randomToken();
    const tokenDigest = await sha256(rawToken);
    const attempt = Number(existing?.send_attempts || 0) + 1;
    const fields = {
      token_digest: tokenDigest,
      delivery_status: "processing",
      send_attempts: attempt,
      last_send_attempt_at: new Date().toISOString(),
      last_send_error: null,
    };
    const claim = existing
      ? await db.from("anchor_review_outreach").update(fields).eq("id", existing.id).eq("delivery_status", "retry").select("id").maybeSingle()
      : await db.from("anchor_review_outreach").insert({ ...fields, user_id: userId, application_id: person.application_id, campaign_key: CAMPAIGN }).select("id").maybeSingle();
    if (claim.error || !claim.data) continue;
    const rowId = claim.data.id;

    try {
      const authResult = await db.auth.admin.getUserById(userId);
      const toEmail = authResult.data.user?.email;
      if (!toEmail) throw new Error("recipient_email_unavailable");
      const urls = trackedUrls(rawToken);
      const response = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service_id: serviceId,
          template_id: templateId,
          user_id: publicKey,
          accessToken: privateKey,
          template_params: {
            to_email: toEmail,
            subject: "Got a minute? How did we do?",
            preview_text: "One tap on a star is all it takes. It really helps other NJ homeowners.",
            ...urls,
            watchdog_logo_url: `${WATCHDOG_ORIGIN}/property/images/watchdognewsletterlogo.png`,
            privacy_url: `${WATCHDOG_ORIGIN}/privacy`,
            terms_url: `${WATCHDOG_ORIGIN}/terms`,
          },
        }),
      });
      const providerMessage = clean(await response.text().catch(() => ""), 300);
      if (!response.ok) throw new Error(`emailjs_${response.status}:${providerMessage || "rejected"}`);
      await db.from("anchor_review_outreach").update({
        sent_at: new Date().toISOString(),
        delivery_status: "sent",
        provider_message: providerMessage || "OK",
      }).eq("id", rowId);
      sent++;
    } catch (error) {
      await db.from("anchor_review_outreach").update({
        delivery_status: attempt >= 3 ? "failed" : "retry",
        last_send_error: clean(error instanceof Error ? error.message : "delivery_failed", 300),
      }).eq("id", rowId);
      failed++;
    }

    await sleep(1100);
  }

  return Response.json({ ok: true, eligible: eligible.length, sent, failed, remaining: Math.max(0, eligible.length - sent) });
});
