import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

// Push notification worker (FCM HTTP v1).
// Invoked every minute by pg_cron (invoke_push_sender) with the shared worker
// token from private.push_runtime; claims queued rows from push_outbox, sends
// each one to the device's FCM token and completes the row.
//
// - Without FCM_PROJECT_ID and FCM_SERVICE_ACCOUNT_JSON it answers
//   {ok:true, claimed:0, push_configured:false} and leaves rows queued.
// - A row whose device is inside its quiet hours is put back in the queue
//   until the window ends (defer_push_outbox), never dropped.
// - A token FCM reports as permanently unusable (UNREGISTERED / 404,
//   SENDER_ID_MISMATCH, an INVALID_ARGUMENT that names the registration token)
//   disables the registration through complete_push_outbox(p_invalid_registration).
// - Outages are not charged to rows: if OAuth token minting fails, or FCM
//   answers 429 / 5xx / QUOTA_EXCEEDED / UNAVAILABLE / INTERNAL, the run stops
//   and every unsent claimed row is released (release_push_outbox) without an
//   attempt, to be retried after Retry-After (1 to 60 minutes). Per-row
//   failures back off through complete_push_outbox (2, 4, 8, 16 minutes).
// - The message carries only what the outbox row holds: title, body and a
//   small string map (pin, route, event type, severity, channel, actions).
//   Outbox rows are built from privacy-reviewed event columns only; no owner,
//   mailing-address or CRM contact field exists anywhere in this pipeline.

type Obj = Record<string, unknown>;
type Claimed = {
  id: number; kind: string; token: string; registration_id: string; user_id: string;
  collapse_key: string | null; title: string; body: string; data: Obj | null;
  timezone: string | null; quiet_hours_start: number | null; quiet_hours_end: number | null; platform: string | null;
};
type FcmError = { status: string; codes: string[]; message: string };

const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const TOKEN_URI = "https://oauth2.googleapis.com/token";
const RELEASE_MIN_MS = 60_000;          // never retry an outage sooner than a minute
const RELEASE_DEFAULT_MS = 120_000;     // when FCM sends no Retry-After
const RELEASE_MAX_MS = 3_600_000;       // cap Retry-After at an hour
const OAUTH_RELEASE_MS = 180_000;       // credentials rejected: try again in 3 minutes

function clean(value: unknown, max = 240) {
  return String(value ?? "").trim().replace(/[\u0000-\u001f]/g, "").slice(0, max);
}
function namedEnv(jsonName: string, legacyName: string) {
  const raw = Deno.env.get(jsonName) || "";
  if (raw) { try { const x = JSON.parse(raw); if (x?.default) return String(x.default); } catch { /* fall through */ } }
  return Deno.env.get(legacyName) || "";
}
function json(status: number, payload: unknown) {
  return Response.json(payload, { status, headers: { "cache-control": "no-store" } });
}
function b64url(bytes: Uint8Array | string) {
  const s = typeof bytes === "string" ? bytes : String.fromCharCode(...bytes);
  return btoa(s).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}
function pemToDer(pem: string) {
  const b64 = pem.replace(/-----BEGIN [A-Z ]+-----/g, "").replace(/-----END [A-Z ]+-----/g, "").replace(/\s+/g, "");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

// --- Google OAuth2 access token from the service account (JWT bearer, RS256) ---
let cachedToken: { value: string; expiresAt: number } | null = null;
async function accessToken(serviceAccount: { client_email: string; private_key: string; token_uri?: string }) {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt - 60 > now) return cachedToken.value;
  const header = b64url(new TextEncoder().encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const claims = b64url(new TextEncoder().encode(JSON.stringify({
    iss: serviceAccount.client_email, scope: FCM_SCOPE,
    aud: serviceAccount.token_uri || TOKEN_URI, iat: now, exp: now + 3600,
  })));
  const key = await crypto.subtle.importKey("pkcs8", pemToDer(serviceAccount.private_key), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${header}.${claims}`)));
  const assertion = `${header}.${claims}.${b64url(signature)}`;
  const response = await fetch(serviceAccount.token_uri || TOKEN_URI, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  if (!response.ok) throw new Error(`oauth_token_${response.status}`);
  const data = await response.json() as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error("oauth_token_missing");
  cachedToken = { value: data.access_token, expiresAt: now + Number(data.expires_in || 3600) };
  return cachedToken.value;
}

// --- Quiet hours in the device's time zone (same rule as private.push_in_quiet_hours) ---
function localHour(timezone: string, at = new Date()) {
  try {
    const part = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", hourCycle: "h23" }).formatToParts(at).find((p) => p.type === "hour");
    return Number(part?.value ?? NaN);
  } catch { return NaN; }
}
function inQuietHours(row: Claimed, at = new Date()) {
  const start = row.quiet_hours_start, end = row.quiet_hours_end;
  if (start == null || end == null || start === end) return false;
  const h = localHour(row.timezone || "America/New_York", at);
  if (!Number.isFinite(h)) return false;
  return start < end ? h >= start && h < end : h >= start || h < end;
}
// First moment after `at` when the local hour equals quiet_hours_end.
function quietHoursEnd(row: Claimed, at = new Date()) {
  const tz = row.timezone || "America/New_York";
  const end = Number(row.quiet_hours_end ?? 0);
  const step = 60 * 60 * 1000;
  let t = new Date(Math.floor(at.getTime() / step) * step + step);
  for (let i = 0; i < 48; i++, t = new Date(t.getTime() + step)) {
    if (localHour(tz, t) === end) return t;
  }
  return new Date(at.getTime() + step);
}

// --- FCM message ---
function channelFor(kind: string, severity: string) {
  if (kind === "digest") return "digest";
  if (kind === "test") return "system";
  return severity === "action" ? "property_alerts_action" : "property_alerts";
}
function actionsFor(kind: string) {
  if (kind === "digest") return "open_desk";
  if (kind === "test") return "open_app";
  return "open_property,mark_read";
}
function fcmMessage(row: Claimed) {
  const d = (row.data || {}) as Obj;
  const severity = clean(d.severity, 20) || "info";
  const pin = clean(d.pams_pin, 80);
  const eventType = clean(d.event_type, 40);
  const collapse = clean(row.collapse_key, 120) || `push:${row.kind}`;
  const priority = severity === "action" ? "HIGH" : "NORMAL";
  // FCM requires every data value to be a string.
  const data: Record<string, string> = {
    kind: clean(row.kind, 20),
    route: clean(d.route, 40) || "pulse",
    pin,
    event_id: clean(d.event_id, 40),
    event_type: eventType,
    severity,
    channel: channelFor(row.kind, severity),
    actions: actionsFor(row.kind),
    collapse_key: collapse,
    outbox_id: String(row.id),
  };
  for (const k of Object.keys(data)) if (!data[k]) delete data[k];
  return {
    message: {
      token: row.token,
      notification: { title: clean(row.title, 180), body: clean(row.body, 700) },
      android: { priority, collapse_key: collapse, notification: { channel_id: data.channel } },
      apns: { headers: { "apns-collapse-id": collapse, "apns-priority": priority === "HIGH" ? "10" : "5" } },
      data,
    },
  };
}

// --- FCM error classification ---
async function fcmError(response: Response): Promise<FcmError> {
  try {
    const body = await response.json() as { error?: { status?: string; message?: string; details?: Array<{ errorCode?: string }> } };
    return {
      status: String(body?.error?.status || ""),
      codes: (body?.error?.details || []).map((x) => String(x.errorCode || "")).filter(Boolean),
      message: String(body?.error?.message || ""),
    };
  } catch { return { status: "", codes: [], message: "" }; }
}
// The token can never work again: disable the registration.
function isInvalidToken(httpStatus: number, e: FcmError) {
  if (httpStatus === 404 || e.codes.includes("UNREGISTERED") || e.status === "NOT_FOUND") return true;
  if (httpStatus === 403 && (e.codes.includes("SENDER_ID_MISMATCH") || /sender ?id mismatch/i.test(e.message))) return true;
  if (httpStatus === 400 && (e.codes.includes("INVALID_ARGUMENT") || e.status === "INVALID_ARGUMENT") && /registration token/i.test(e.message)) return true;
  return false;
}
// FCM itself is unavailable or throttling: stop the run, release rows, retry later.
function isOutage(httpStatus: number, e: FcmError) {
  if (httpStatus === 429 || httpStatus >= 500) return true;
  if (e.codes.includes("QUOTA_EXCEEDED") || e.codes.includes("UNAVAILABLE") || e.codes.includes("INTERNAL")) return true;
  return ["RESOURCE_EXHAUSTED", "UNAVAILABLE", "INTERNAL"].includes(e.status);
}
function retryAfterMs(response: Response) {
  const raw = response.headers.get("retry-after") || "";
  let ms = RELEASE_DEFAULT_MS;
  if (raw) { const n = Number(raw); ms = Number.isFinite(n) ? n * 1000 : Date.parse(raw) - Date.now(); }
  if (!Number.isFinite(ms)) ms = RELEASE_DEFAULT_MS;
  return Math.max(RELEASE_MIN_MS, Math.min(RELEASE_MAX_MS, ms));
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = namedEnv("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json(503, { error: "service_unavailable" });
  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const workerToken = req.headers.get("x-push-worker-token") || "";
  if (!workerToken) return json(401, { error: "unauthorized" });
  const verified = await db.rpc("verify_push_worker", { p_token: workerToken });
  if (verified.error || verified.data !== true) return json(401, { error: "unauthorized" });

  const projectId = clean(Deno.env.get("FCM_PROJECT_ID"), 120);
  const serviceAccountJson = Deno.env.get("FCM_SERVICE_ACCOUNT_JSON") || "";
  let serviceAccount: { client_email: string; private_key: string; token_uri?: string } | null = null;
  try { serviceAccount = serviceAccountJson ? JSON.parse(serviceAccountJson) : null; } catch { serviceAccount = null; }
  if (!projectId || !serviceAccount?.client_email || !serviceAccount?.private_key) {
    // Leave everything queued until FCM credentials are configured.
    return json(200, { ok: true, claimed: 0, push_configured: false });
  }

  let body: Obj = {};
  try { body = await req.json(); } catch { /* default limit */ }
  const limit = Math.max(1, Math.min(100, Number(body.limit || 25)));
  const claimed = await db.rpc("claim_push_outbox", { p_limit: limit });
  if (claimed.error) return json(500, { error: "claim_failed" });
  const rows = (claimed.data || []) as Claimed[];

  // Put rows back without spending an attempt; they become due at now + delay.
  const release = async (pending: Claimed[], delayMs: number, reason: string) => {
    const until = new Date(Date.now() + delayMs).toISOString();
    for (const row of pending) await db.rpc("release_push_outbox", { p_id: row.id, p_until: until, p_error: clean(reason, 120) });
    return pending.length;
  };

  let bearer = "";
  if (rows.length) {
    try { bearer = await accessToken(serviceAccount); } catch (error) {
      // Credentials rejected or Google unreachable: this is not the rows' fault.
      const message = clean(error instanceof Error ? error.message : "oauth_failed", 120);
      const released = await release(rows, OAUTH_RELEASE_MS, `oauth_failed: ${message}`);
      return json(200, { ok: true, claimed: rows.length, sent: 0, failed: 0, skipped: 0, deferred: 0, released, push_configured: true, error: message });
    }
  }

  const endpoint = `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/messages:send`;
  let sent = 0, failed = 0, skipped = 0, deferred = 0, released = 0;
  let outage = "", outageDelay = RELEASE_DEFAULT_MS, stoppedAt = -1;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      if (inQuietHours(row)) {
        await db.rpc("defer_push_outbox", { p_id: row.id, p_until: quietHoursEnd(row).toISOString() });
        deferred++;
        continue;
      }
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${bearer}` },
        body: JSON.stringify(fcmMessage(row)),
      });
      if (response.ok) {
        await db.rpc("complete_push_outbox", { p_id: row.id, p_sent: true, p_error: null, p_invalid_registration: null });
        sent++;
        continue;
      }
      const err = await fcmError(response);
      const detail = clean([err.status, ...err.codes].filter(Boolean).join("|"), 80);
      if (isInvalidToken(response.status, err)) {
        await db.rpc("complete_push_outbox", { p_id: row.id, p_sent: false, p_error: `fcm_invalid_token_${response.status}${detail ? `: ${detail}` : ""}`, p_invalid_registration: row.registration_id });
        skipped++;
        continue;
      }
      if (isOutage(response.status, err)) {
        // One outage must not spend an attempt on every claimed row: stop here
        // and release this row and every row after it.
        outage = `fcm_retry_${response.status}${detail ? `: ${detail}` : ""}`;
        outageDelay = retryAfterMs(response);
        stoppedAt = i;
        break;
      }
      throw new Error(`fcm_rejected_${response.status}${detail ? `: ${detail}` : ""}`);
    } catch (error) {
      await db.rpc("complete_push_outbox", { p_id: row.id, p_sent: false, p_error: clean(error instanceof Error ? error.message : "delivery_failed", 120), p_invalid_registration: null });
      failed++;
    }
  }
  if (stoppedAt >= 0) released += await release(rows.slice(stoppedAt), outageDelay, outage);
  return json(200, { ok: true, claimed: rows.length, sent, failed, skipped, deferred, released, push_configured: true, ...(outage ? { error: outage } : {}) });
});
