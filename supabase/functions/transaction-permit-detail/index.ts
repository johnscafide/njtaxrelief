import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

type Row = Record<string, any>;
const DCA = "https://data.nj.gov/resource/w9se-dmra.json";
const DCA_PUBLIC = "https://data.nj.gov/resource/w9se-dmra";
const RANK: Record<string, number> = { standard: 0, agent: 1, pro: 2, pro_plus: 3, teams: 4, developer: 5 };
const ORIGINS = new Set(["https://watchdogindex.com","https://www.watchdogindex.com","https://njpropertytaxrelief.com","https://www.njpropertytaxrelief.com","http://localhost:3000","http://127.0.0.1:3000"]);
const clean = (v: unknown, n = 1000) => String(v ?? "").replace(/[<>]/g, "").trim().slice(0, n);
const env = (jsonName: string, legacyName: string) => { const raw = Deno.env.get(jsonName) || ""; if (raw) { try { const parsed = JSON.parse(raw); if (parsed?.default) return String(parsed.default); } catch {} } return Deno.env.get(legacyName) || ""; };
const cors = (req: Request) => ({"Access-Control-Allow-Origin": ORIGINS.has(req.headers.get("origin") || "") ? (req.headers.get("origin") || "") : "https://www.watchdogindex.com","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin"});
const respond = (req: Request, status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors(req), "Content-Type":"application/json", "Cache-Control":"private, no-store" } });
const soql = (v: string) => v.replace(/'/g, "''");
const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : null; };
const normalizePermit = (v: unknown) => clean(v, 120).toUpperCase().replace(/[^A-Z0-9]/g, "");
const fee = (row: Row, key: string) => n(row?.[key]) || 0;
const dateValue = (row: Row, key: string) => clean(row?.[key], 80) || null;

function permitView(group: Row[]) {
  const permits = group.filter((r) => clean(r.status, 8).toUpperCase() === "P").sort((a,b) => clean(b.permitdate,80).localeCompare(clean(a.permitdate,80)));
  const certs = group.filter((r) => clean(r.status, 8).toUpperCase() === "C").sort((a,b) => clean(b.certdate,80).localeCompare(clean(a.certdate,80)));
  const permit = permits[0] || group[0] || {};
  const fees = {
    building: fee(permit,"buildfee"), plumbing: fee(permit,"plumbfee"), electrical: fee(permit,"electfee"),
    fire: fee(permit,"firefee"), elevator: fee(permit,"elevfee"), other: fee(permit,"otherfee"),
    dca: fee(permit,"dcafee"), certificate: fee(permit,"certfee")
  };
  const trades: string[] = [];
  if (fees.building > 0) trades.push("Building");
  if (fees.plumbing > 0) trades.push("Plumbing");
  if (fees.electrical > 0) trades.push("Electrical");
  if (fees.fire > 0) trades.push("Fire");
  if (fees.elevator > 0) trades.push("Elevator");
  if (fees.other > 0) trades.push("Other / mechanical");
  const certificates = certs.map((r) => ({
    certificate_type_code: clean(r.certtype, 40) || null,
    certificate_type_desc: clean(r.certtypedesc, 160) || null,
    certificate_date: dateValue(r,"certdate"),
    certificate_count: n(r.certcount),
    certificate_fee: n(r.certfee),
    status: clean(r.permitstatusdesc,80) || "Certificate"
  }));
  return {
    permit_number: clean(permit.permitno, 120) || null,
    permit_date: dateValue(permit,"permitdate"),
    permit_type_code: clean(permit.permittype,40) || null,
    permit_type_desc: clean(permit.permittypedesc,120) || null,
    permit_status: clean(permit.permitstatusdesc,80) || "Permit",
    update_record: clean(permit.update,8).toUpperCase() === "X",
    use_group: clean(permit.usegroup,80) || null,
    census_description: clean(permit.censusdesc,180) || null,
    square_feet: n(permit.squarefeet),
    volume: n(permit.cubic),
    construction_cost: n(permit.constcost),
    total_fee: n(permit.totalfee),
    fees,
    trades,
    certificates,
    disposition: certificates.some((c) => !!c.certificate_date) ? "certificate_issued" : "verification_candidate",
    storage_tank_indicator: clean(permit.storage,8).toUpperCase() === "X",
    public_building_indicator: clean(permit.public,8).toUpperCase() === "X",
    source_software: clean(permit.sourcedesc || permit.source,160) || null,
    work_description: null,
    work_description_state: "not_published_by_nj_dca"
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return respond(req, 405, { error: "POST required" });
  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return respond(req, 401, { error: "Sign in required" });
  const url = Deno.env.get("SUPABASE_URL") || "";
  const publishable = env("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
  const secret = env("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !publishable || !secret) return respond(req, 503, { error: "Permit detail configuration incomplete" });
  const userClient = createClient(url, publishable, { global: { headers: { Authorization: auth } }, auth: { persistSession:false, autoRefreshToken:false } });
  const admin = createClient(url, secret, { auth: { persistSession:false, autoRefreshToken:false } });
  const { data: authData } = await userClient.auth.getUser();
  const user = authData?.user;
  if (!user) return respond(req, 401, { error: "Session invalid" });
  let body: Row = {}; try { body = await req.json(); } catch { return respond(req, 400, { error: "Invalid JSON" }); }
  const transactionId = clean(body.transaction_id, 80);
  if (!transactionId) return respond(req, 400, { error: "transaction_id required" });

  const [{ data: entitlement }, { data: profile }, { data: tx, error: txError }] = await Promise.all([
    admin.from("account_entitlements").select("plan_tier").eq("user_id", user.id).maybeSingle(),
    admin.from("profiles").select("account_role").eq("id", user.id).maybeSingle(),
    admin.from("transaction_workspaces").select("id,user_id,pams_pin,block,lot,municipality,county").eq("id", transactionId).eq("user_id", user.id).maybeSingle()
  ]);
  const plan = String(profile?.account_role || "") === "developer" ? "developer" : String(entitlement?.plan_tier || "standard");
  if ((RANK[plan] ?? 0) < RANK.pro_plus) return respond(req, 403, { error: "Pro+ plan required", minimum_plan: "pro_plus" });
  if (txError || !tx) return respond(req, 404, { error: "Transaction not found" });

  const parts = clean(tx.pams_pin,100).split("_");
  const district = clean(parts[0],8).replace(/\D/g,"").slice(0,4);
  const block = clean(tx.block || parts[1],50);
  const lot = clean(tx.lot || parts[2],50);
  if (!/^\d{4}$/.test(district) || !block || !lot) return respond(req, 422, { error: "Parcel identifiers incomplete", permits: [] });
  const query = new URLSearchParams({
    $where: `treasurycode='${soql(district)}' AND block='${soql(block)}' AND lot='${soql(lot)}'`,
    $limit: "5000",
    $order: "permitdate DESC"
  });
  try {
    const r = await fetch(`${DCA}?${query.toString()}`, { headers: { accept:"application/json" } });
    if (!r.ok) return respond(req, 502, { error: `NJ DCA HTTP ${r.status}`, permits: [] });
    const rows = await r.json();
    if (!Array.isArray(rows)) return respond(req, 502, { error: "Unexpected NJ DCA response", permits: [] });
    const groups = new Map<string,Row[]>();
    for (const row of rows) { const key = normalizePermit(row?.permitno); if (!key) continue; const group = groups.get(key) || []; group.push(row); groups.set(key,group); }
    const permits = [...groups.values()].map(permitView).filter((p) => p.permit_number).sort((a,b) => clean(b.permit_date,80).localeCompare(clean(a.permit_date,80))).slice(0,50);
    return respond(req, 200, {
      transaction_id: transactionId,
      parcel: { treasurycode: district, block, lot },
      row_count: rows.length,
      permits,
      source: { label:"NJ DCA Construction Permit Data", url:DCA_PUBLIC },
      source_checked_at: new Date().toISOString(),
      semantics: "NJ DCA permit/certificate lifecycle evidence. A permit row without a matched certificate is a verification candidate, not a legal open-permit determination. NJ DCA does not publish the type-of-work/project description."
    });
  } catch (e) {
    return respond(req, 502, { error: "NJ DCA permit detail unavailable", permits: [] });
  }
});
