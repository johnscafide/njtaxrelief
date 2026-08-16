import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});
const allowedOrigins = new Set([
  "https://njpropertytaxrelief.com",
  "https://www.njpropertytaxrelief.com"
]);
const allowedRedirects = [
  "https://njpropertytaxrelief.com/property/",
  "https://www.njpropertytaxrelief.com/property/"
];

function cors(origin: string | null) {
  const safe = origin && allowedOrigins.has(origin) ? origin : "https://njpropertytaxrelief.com";
  return {
    "Access-Control-Allow-Origin": safe,
    "Access-Control-Allow-Headers": "content-type, apikey, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, private",
    "Vary": "Origin"
  };
}
function json(req: Request, status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), { status, headers: cors(req.headers.get("origin")) });
}
function isAllowedRedirect(value: string) {
  return allowedRedirects.some((prefix) => value.startsWith(prefix));
}
async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req.headers.get("origin")) });
  if (req.method !== "POST") return json(req, 405, { error: "POST required" });

  let body: any;
  try { body = await req.json(); } catch { return json(req, 400, { error: "Invalid JSON" }); }
  const token = String(body?.token || "").trim();
  if (!/^[A-Za-z0-9_-]{40,160}$/.test(token)) return json(req, 401, { error: "Invalid or expired sandbox token" });

  const tokenHash = await sha256Hex(token);
  const now = new Date().toISOString();
  const { data: consumed, error: consumeError } = await admin
    .from("watchdog_test_bootstrap_tokens")
    .update({ used_at: now })
    .eq("token_hash", tokenHash)
    .is("used_at", null)
    .gt("expires_at", now)
    .select("id,desired_email,redirect_to,metadata")
    .maybeSingle();

  if (consumeError || !consumed) return json(req, 401, { error: "Invalid or expired sandbox token" });

  const email = String(consumed.desired_email || "").trim().toLowerCase();
  const redirectTo = String(consumed.redirect_to || "https://njpropertytaxrelief.com/property/dashboard");
  if (!email || !isAllowedRedirect(redirectTo)) {
    await admin.from("watchdog_test_auth_events").insert({ token_id: consumed.id, event_type: "bootstrap_rejected", metadata: { reason: "invalid_config" } });
    return json(req, 403, { error: "Sandbox bootstrap configuration rejected" });
  }

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo }
  });
  if (linkError || !linkData?.properties?.action_link || !linkData?.user?.id) {
    await admin.from("watchdog_test_auth_events").insert({ token_id: consumed.id, event_type: "bootstrap_failed", metadata: { reason: linkError?.message || "link_generation_failed" } });
    return json(req, 500, { error: "Sandbox session could not be generated" });
  }

  const userId = linkData.user.id;
  const { data: existingTest } = await admin
    .from("watchdog_test_accounts")
    .select("disabled_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (existingTest?.disabled_at) {
    await admin.from("watchdog_test_auth_events").insert({ token_id: consumed.id, user_id: userId, event_type: "bootstrap_rejected", metadata: { reason: "test_account_disabled" } });
    return json(req, 403, { error: "Sandbox account is disabled" });
  }

  const profileResult = await admin.from("profiles").upsert({
    id: userId,
    email,
    full_name: "Watchdog E2E Sandbox",
    display_name: "Watchdog E2E Sandbox",
    account_role: "developer",
    plan_tier: "standard",
    plan: "free",
    profile_complete: true,
    custom: { watchdog_test_account: true, no_real_spend: true }
  }, { onConflict: "id" });
  if (profileResult.error) {
    await admin.from("watchdog_test_auth_events").insert({ token_id: consumed.id, user_id: userId, event_type: "bootstrap_failed", metadata: { reason: "profile_upsert_failed" } });
    return json(req, 500, { error: "Sandbox profile could not be prepared" });
  }

  const accountResult = await admin.from("watchdog_test_accounts").upsert({
    user_id: userId,
    label: "Watchdog E2E Sandbox",
    last_bootstrap_at: now,
    metadata: { email, no_real_spend: true }
  }, { onConflict: "user_id" });
  if (accountResult.error) return json(req, 500, { error: "Sandbox account could not be registered" });

  await admin.from("watchdog_test_auth_events").insert({
    token_id: consumed.id,
    user_id: userId,
    event_type: "bootstrap_link_issued",
    metadata: { redirect_to: redirectTo }
  });

  return json(req, 200, {
    action_link: linkData.properties.action_link,
    redirect_to: redirectTo,
    expires_hint_seconds: 300,
    sandbox: true
  });
});
