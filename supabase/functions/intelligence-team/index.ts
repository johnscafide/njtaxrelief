import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const VERSION = "watchdog-intelligence-team-v1";
const ORIGINS = new Set([
  "https://njpropertytaxrelief.com",
  "https://www.njpropertytaxrelief.com",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);
const RANK: Record<string, number> = { standard: 0, agent: 1, pro: 2, pro_plus: 3, teams: 4, developer: 5 };
type O = Record<string, any>;

function cors(req: Request) {
  const origin = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": ORIGINS.has(origin) ? origin : "https://njpropertytaxrelief.com",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
function out(req: Request, status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors(req), "Content-Type": "application/json", "Cache-Control": "private, no-store" },
  });
}
const clean = (value: unknown, max = 200) => String(value ?? "").replace(/[<>]/g, "").trim().slice(0, max);
function namedEnv(jsonName: string, legacyName: string) {
  const raw = Deno.env.get(jsonName) || "";
  if (raw) {
    try { const parsed = JSON.parse(raw); if (parsed?.default) return String(parsed.default); } catch { /* fall through */ }
  }
  return Deno.env.get(legacyName) || "";
}
async function membership(admin: any, organizationId: string, userId: string) {
  const [org, member] = await Promise.all([
    admin.from("watchdog_organizations").select("id,name,owner_user_id,created_at,updated_at").eq("id", organizationId).maybeSingle(),
    admin.from("watchdog_organization_members").select("role").eq("organization_id", organizationId).eq("user_id", userId).maybeSingle(),
  ]);
  if (!org.data) return null;
  const role = org.data.owner_user_id === userId ? "owner" : member.data?.role || null;
  return role ? { org: org.data, role } : null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return out(req, 405, { error: "POST required" });
  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return out(req, 401, { error: "Sign in required" });
  const url = Deno.env.get("SUPABASE_URL") || "";
  const publishable = namedEnv("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
  const secret = namedEnv("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !publishable || !secret) return out(req, 503, { error: "Teams configuration incomplete" });
  const userClient = createClient(url, publishable, { global: { headers: { Authorization: auth } }, auth: { persistSession: false, autoRefreshToken: false } });
  const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData } = await userClient.auth.getUser();
  const user = authData?.user;
  if (!user) return out(req, 401, { error: "Session invalid" });
  let body: O = {};
  try { body = await req.json(); } catch { return out(req, 400, { error: "Invalid JSON" }); }

  const [{ data: entitlement }, { data: profile }] = await Promise.all([
    admin.from("account_entitlements").select("plan_tier").eq("user_id", user.id).maybeSingle(),
    admin.from("profiles").select("account_role").eq("id", user.id).maybeSingle(),
  ]);
  const plan = String(profile?.account_role || "") === "developer" ? "developer" : String(entitlement?.plan_tier || "standard");
  if ((RANK[plan] ?? 0) < RANK.teams) return out(req, 403, { error: "Teams plan required", minimum_plan: "teams" });

  const action = clean(body.action || "state", 40);
  if (action === "create") {
    const name = clean(body.name, 120);
    if (!name) return out(req, 400, { error: "Organization name is required" });
    const created = await admin.from("watchdog_organizations").insert({ owner_user_id: user.id, name }).select("id,name,owner_user_id,created_at,updated_at").single();
    if (created.error || !created.data) return out(req, 503, { error: "Could not create Teams Intelligence workspace" });
    await admin.from("watchdog_organization_members").upsert({ organization_id: created.data.id, user_id: user.id, role: "owner" }, { onConflict: "organization_id,user_id" });
    return out(req, 200, { ok: true, version: VERSION, organization: created.data, role: "owner" });
  }

  if (action === "state") {
    const memberRows = await admin.from("watchdog_organization_members").select("organization_id,role").eq("user_id", user.id);
    const ownedRows = await admin.from("watchdog_organizations").select("id,name,owner_user_id,created_at,updated_at").eq("owner_user_id", user.id);
    const ids = [...new Set([...(memberRows.data || []).map((row: O) => row.organization_id), ...(ownedRows.data || []).map((row: O) => row.id)])];
    const organizations = ids.length ? await admin.from("watchdog_organizations").select("id,name,owner_user_id,created_at,updated_at").in("id", ids).order("created_at", { ascending: true }) : { data: [] } as any;
    const roles = new Map((memberRows.data || []).map((row: O) => [String(row.organization_id), row.role]));
    return out(req, 200, {
      ok: true, version: VERSION,
      organizations: (organizations.data || []).map((org: O) => ({ ...org, role: org.owner_user_id === user.id ? "owner" : roles.get(String(org.id)) || "member" })),
    });
  }

  const organizationId = clean(body.organization_id, 80);
  if (!organizationId) return out(req, 400, { error: "organization_id is required" });
  const access = await membership(admin, organizationId, user.id);
  if (!access) return out(req, 404, { error: "Teams Intelligence workspace not found" });
  if (!["owner", "admin"].includes(access.role) && action !== "members") return out(req, 403, { error: "Owner or admin role required" });

  if (action === "members") {
    const members = await admin.from("watchdog_organization_members").select("user_id,role,created_at").eq("organization_id", organizationId).order("created_at", { ascending: true });
    const userIds = (members.data || []).map((row: O) => row.user_id);
    const profiles = userIds.length ? await admin.from("profiles").select("id,email,display_name,full_name").in("id", userIds) : { data: [] } as any;
    const profileMap = new Map((profiles.data || []).map((row: O) => [String(row.id), row]));
    return out(req, 200, {
      ok: true, organization: access.org, role: access.role,
      members: (members.data || []).map((row: O) => {
        const p = profileMap.get(String(row.user_id)) || {};
        return { user_id: row.user_id, role: row.role, email: p.email || null, name: p.display_name || p.full_name || null, created_at: row.created_at };
      }),
    });
  }

  if (action === "add_member") {
    const email = clean(body.email, 254).toLowerCase();
    const role = clean(body.role || "member", 20);
    if (!email || !email.includes("@") || !["admin", "member", "viewer"].includes(role)) return out(req, 400, { error: "A valid saved Watchdog user email and team role are required" });
    const profileResult = await admin.from("profiles").select("id,email").ilike("email", email).limit(1).maybeSingle();
    if (!profileResult.data?.id) return out(req, 404, { error: "That exact email is not yet a Watchdog account. No directory or similar-user search was performed." });
    if (profileResult.data.id === access.org.owner_user_id) return out(req, 409, { error: "The workspace owner already has owner access" });
    const saved = await admin.from("watchdog_organization_members").upsert({ organization_id: organizationId, user_id: profileResult.data.id, role }, { onConflict: "organization_id,user_id" });
    if (saved.error) return out(req, 503, { error: "Could not add the Teams member" });
    return out(req, 200, { ok: true, organization_id: organizationId, user_id: profileResult.data.id, role });
  }

  if (action === "update_member") {
    const memberUserId = clean(body.user_id, 80), role = clean(body.role, 20);
    if (!memberUserId || !["admin", "member", "viewer"].includes(role)) return out(req, 400, { error: "user_id and valid role are required" });
    if (memberUserId === access.org.owner_user_id) return out(req, 409, { error: "Workspace owner role cannot be changed here" });
    const saved = await admin.from("watchdog_organization_members").update({ role }).eq("organization_id", organizationId).eq("user_id", memberUserId);
    if (saved.error) return out(req, 503, { error: "Could not update the Teams member" });
    return out(req, 200, { ok: true, organization_id: organizationId, user_id: memberUserId, role });
  }

  if (action === "remove_member") {
    const memberUserId = clean(body.user_id, 80);
    if (!memberUserId) return out(req, 400, { error: "user_id is required" });
    if (memberUserId === access.org.owner_user_id) return out(req, 409, { error: "Workspace owner cannot be removed" });
    const removed = await admin.from("watchdog_organization_members").delete().eq("organization_id", organizationId).eq("user_id", memberUserId);
    if (removed.error) return out(req, 503, { error: "Could not remove the Teams member" });
    return out(req, 200, { ok: true, organization_id: organizationId, user_id: memberUserId });
  }

  return out(req, 400, { error: "Unsupported Teams Intelligence action" });
});
