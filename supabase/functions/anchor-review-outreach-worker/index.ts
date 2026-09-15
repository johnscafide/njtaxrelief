import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const CAMPAIGN_SUBJECT_HASH = "cf6f8882161c59edc7edfe0094fcdf708211ce05ed59a16ebafa0da12aa319d3";
const WATCHDOG_ORIGIN = "https://www.watchdogindex.com";

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
function addMinutes(value: Date, minutes: number) {
  return new Date(value.getTime() + minutes * 60_000);
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

  const db = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const workerToken = req.headers.get("x-anchor-review-token") || "";
  if (!workerToken) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const verified = await db.rpc("verify_anchor_review_outreach_worker_token_v1", { p_token: workerToken });
  if (verified.error || verified.data !== true) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const runtimeResult = await db.rpc("get_anchor_review_outreach_runtime_v1");
  const runtime = Array.isArray(runtimeResult.data) ? runtimeResult.data[0] : runtimeResult.data;
  if (runtimeResult.error || !runtime) {
    return Response.json({ error: "Runtime configuration unavailable" }, { status: 500 });
  }
  if (runtime.automation_enabled !== true) {
    return Response.json({ ok: true, enabled: false, processed: 0 }, { headers: { "cache-control": "no-store" } });
  }

  const publicKey = Deno.env.get("EMAILJS_PUBLIC_KEY") || "";
  const privateKey = Deno.env.get("EMAILJS_PRIVATE_KEY") || "";
  const serviceId = Deno.env.get("EMAILJS_SERVICE_ID") || "";
  const templateId = Deno.env.get("EMAILJS_ANCHOR_REVIEW_TEMPLATE_ID") || "template_anchor_review";
  const emailConfigured = Boolean(publicKey && privateKey && serviceId && templateId);

  if (!emailConfigured) {
    return Response.json(
      { ok: false, error: "EmailJS review delivery is not configured", email_configured: false },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch {}
  const limit = Math.max(1, Math.min(50, Number(body.limit || 20)));
  const now = new Date();
  const startedAt = new Date(String(runtime.automation_started_at));
  const delayMinutes = Math.max(5, Math.min(10080, Number(runtime.delay_minutes || 60)));
  const cutoff = addMinutes(now, -delayMinutes);
  const campaignKey = clean(runtime.campaign_key || "anchor_review_auto_v1", 120);
  const maxAttempts = Math.max(1, Math.min(10, Number(runtime.max_attempts || 3)));

  const applicationsResult = await db
    .from("anchor_applications")
    .select("id,user_id,tax_year,generated_at")
    .eq("status", "generated")
    .eq("tax_year", 2025)
    .gte("generated_at", startedAt.toISOString())
    .lte("generated_at", cutoff.toISOString())
    .order("generated_at", { ascending: true })
    .limit(limit * 4);

  if (applicationsResult.error) {
    return Response.json({ error: "Could not load generated applications" }, { status: 500 });
  }

  const applications = Array.isArray(applicationsResult.data) ? applicationsResult.data : [];
  if (!applications.length) {
    return Response.json({ ok: true, enabled: true, processed: 0, sent: 0, failed: 0, skipped: 0 }, { headers: { "cache-control": "no-store" } });
  }

  const appIds = applications.map((row) => row.id);
  const userIds = [...new Set(applications.map((row) => row.user_id))];

  const [reviewsResult, outreachResult, suppressionsResult] = await Promise.all([
    db.from("anchor_application_reviews").select("application_id,user_id").in("application_id", appIds),
    db.from("anchor_review_outreach")
      .select("id,application_id,user_id,campaign_key,sent_at,delivery_status,send_attempts,lease_until,last_send_attempt_at")
      .eq("campaign_key", campaignKey)
      .in("application_id", appIds),
    db.from("marketing_suppressions")
      .select("user_id,expires_at")
      .eq("channel", "email")
      .eq("subject_hash", CAMPAIGN_SUBJECT_HASH)
      .in("user_id", userIds),
  ]);

  if (reviewsResult.error || outreachResult.error || suppressionsResult.error) {
    return Response.json({ error: "Could not reconcile review outreach state" }, { status: 500 });
  }

  const reviewed = new Set((reviewsResult.data || []).map((row) => `${row.application_id}:${row.user_id}`));
  const outreachByApplication = new Map((outreachResult.data || []).map((row) => [row.application_id, row]));
  const suppressed = new Set(
    (suppressionsResult.data || [])
      .filter((row) => !row.expires_at || new Date(row.expires_at).getTime() > now.getTime())
      .map((row) => row.user_id),
  );

  let processed = 0;
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let suppressedCount = 0;

  for (const application of applications) {
    if (processed >= limit) break;

    const reviewKey = `${application.id}:${application.user_id}`;
    if (reviewed.has(reviewKey)) {
      skipped++;
      continue;
    }

    let outreach = outreachByApplication.get(application.id);

    if (suppressed.has(application.user_id)) {
      if (!outreach) {
        const token = randomToken();
        const tokenDigest = await sha256(token);
        const insert = await db.from("anchor_review_outreach").insert({
          user_id: application.user_id,
          application_id: application.id,
          campaign_key: campaignKey,
          token_digest: tokenDigest,
          delivery_status: "suppressed",
          unsubscribed_at: now.toISOString(),
          last_send_error: "review_email_suppressed",
        }).select("id").maybeSingle();
        if (!insert.error) outreach = insert.data;
      } else if (outreach.delivery_status !== "suppressed") {
        await db.from("anchor_review_outreach").update({
          delivery_status: "suppressed",
          unsubscribed_at: now.toISOString(),
          lease_until: null,
          last_send_error: "review_email_suppressed",
        }).eq("id", outreach.id);
      }
      suppressedCount++;
      continue;
    }

    if (outreach?.sent_at || outreach?.delivery_status === "sent" || outreach?.delivery_status === "suppressed") {
      skipped++;
      continue;
    }

    const attempts = Number(outreach?.send_attempts || 0);
    if (attempts >= maxAttempts) {
      if (outreach?.id && outreach.delivery_status !== "failed") {
        await db.from("anchor_review_outreach").update({
          delivery_status: "failed",
          lease_until: null,
          last_send_error: outreach.delivery_status === "processing" ? "delivery_lease_expired_after_max_attempts" : "max_delivery_attempts_reached",
        }).eq("id", outreach.id);
      }
      skipped++;
      continue;
    }

    if (outreach?.lease_until && new Date(outreach.lease_until).getTime() > now.getTime()) {
      skipped++;
      continue;
    }
    if (outreach?.last_send_attempt_at && now.getTime() - new Date(outreach.last_send_attempt_at).getTime() < 15 * 60_000) {
      skipped++;
      continue;
    }

    const rawToken = randomToken();
    const tokenDigest = await sha256(rawToken);
    const attemptNumber = attempts + 1;
    const leaseUntil = addMinutes(now, 10).toISOString();
    const attemptAt = new Date().toISOString();

    if (!outreach) {
      const insert = await db.from("anchor_review_outreach").insert({
        user_id: application.user_id,
        application_id: application.id,
        campaign_key: campaignKey,
        token_digest: tokenDigest,
        delivery_status: "processing",
        send_attempts: attemptNumber,
        lease_until: leaseUntil,
        last_send_attempt_at: attemptAt,
        last_send_error: null,
      }).select("id,application_id,user_id,campaign_key,sent_at,delivery_status,send_attempts,lease_until,last_send_attempt_at").maybeSingle();

      if (insert.error || !insert.data) {
        skipped++;
        continue;
      }
      outreach = insert.data;
      outreachByApplication.set(application.id, outreach);
    } else {
      const update = await db.from("anchor_review_outreach").update({
        token_digest: tokenDigest,
        delivery_status: "processing",
        send_attempts: attemptNumber,
        lease_until: leaseUntil,
        last_send_attempt_at: attemptAt,
        last_send_error: null,
      }).eq("id", outreach.id).is("sent_at", null)
        .select("id,application_id,user_id,campaign_key,sent_at,delivery_status,send_attempts,lease_until,last_send_attempt_at").maybeSingle();

      if (update.error || !update.data) {
        skipped++;
        continue;
      }
      outreach = update.data;
      outreachByApplication.set(application.id, outreach);
    }

    processed++;

    try {
      const authResult = await db.auth.admin.getUserById(application.user_id);
      const toEmail = authResult.data.user?.email;
      if (!toEmail) throw new Error("recipient_email_unavailable");

      const urls = trackedUrls(rawToken);
      const emailResponse = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service_id: serviceId,
          template_id: templateId,
          user_id: publicKey,
          accessToken: privateKey,
          template_params: {
            to_email: toEmail,
            subject: "How did we do?",
            preview_text: "We'd love to know how your Watchdog application experience went.",
            review_1_url: urls.review_1_url,
            review_2_url: urls.review_2_url,
            review_3_url: urls.review_3_url,
            review_4_url: urls.review_4_url,
            review_5_url: urls.review_5_url,
            review_url: urls.review_url,
            open_pixel_url: urls.open_pixel_url,
            unsubscribe_url: urls.unsubscribe_url,
            watchdog_logo_url: `${WATCHDOG_ORIGIN}/property/branding/watchdog-logo-horizontal.svg`,
            privacy_url: `${WATCHDOG_ORIGIN}/property/privacy/`,
            terms_url: `${WATCHDOG_ORIGIN}/property/terms/`,
          },
        }),
      });
      const providerMessage = clean(await emailResponse.text().catch(() => ""), 300);
      if (!emailResponse.ok) throw new Error(`emailjs_${emailResponse.status}:${providerMessage || "rejected"}`);

      await db.from("anchor_review_outreach").update({
        sent_at: new Date().toISOString(),
        delivery_status: "sent",
        lease_until: null,
        last_send_error: null,
        provider_message: providerMessage || "OK",
      }).eq("id", outreach.id);

      sent++;
    } catch (error) {
      const reason = clean(error instanceof Error ? error.message : "delivery_failed", 300);
      await db.from("anchor_review_outreach").update({
        delivery_status: attemptNumber >= maxAttempts ? "failed" : "retry",
        lease_until: null,
        last_send_error: reason,
      }).eq("id", outreach.id);
      failed++;
    }

    // EmailJS documents a one-request-per-second rate limit.
    await sleep(1100);
  }

  return Response.json({
    ok: true,
    enabled: true,
    email_configured: true,
    processed,
    sent,
    failed,
    skipped,
    suppressed: suppressedCount,
  }, { headers: { "cache-control": "no-store" } });
});
